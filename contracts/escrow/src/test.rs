#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, IntoVal, Symbol,
};

const USDC: i128 = 10_000_000; // 1 USDC con 7 decimales
const DIA: u64 = 86_400;
const INICIO: u64 = 1_000_000;

struct Escena {
    env: Env,
    c: EscrowClient<'static>,
    tok: TokenClient<'static>,
    admin: Address,
    tesoreria: Address,
    cliente: Address,
    proveedor: Address,
    otro: Address,
}

fn escena() -> Escena {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(INICIO);

    let admin = Address::generate(&env);
    let tesoreria = Address::generate(&env);
    let cliente = Address::generate(&env);
    let proveedor = Address::generate(&env);
    let otro = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    StellarAssetClient::new(&env, &sac.address()).mint(&cliente, &(1_000 * USDC));
    let id = env.register(
        Escrow,
        (
            admin.clone(),
            sac.address(),
            300u32,
            tesoreria.clone(),
            3 * DIA,
        ),
    );
    Escena {
        c: EscrowClient::new(&env, &id),
        tok: TokenClient::new(&env, &sac.address()),
        env,
        admin,
        tesoreria,
        cliente,
        proveedor,
        otro,
    }
}

impl Escena {
    fn crear(&self, id: u64, monto: i128) -> Pedido {
        self.c.crear_pedido(
            &self.cliente,
            &self.proveedor,
            &id,
            &monto,
            &(INICIO + 7 * DIA),
        )
    }
    fn avanzar(&self, seg: u64) {
        let t = self.env.ledger().timestamp();
        self.env.ledger().set_timestamp(t + seg);
    }
}

// ------------------------------------------------------------------
// Camino feliz
// ------------------------------------------------------------------

#[test]
fn camino_feliz_con_comision() {
    let e = escena();
    let p = e.crear(1, 100 * USDC);
    assert_eq!(p.estado, Estado::Pagado);
    assert_eq!(p.comision_bps, 300);
    assert_eq!(e.tok.balance(&e.c.address), 100 * USDC);
    assert_eq!(e.tok.balance(&e.cliente), 900 * USDC);

    e.avanzar(DIA);
    let p = e.c.marcar_entregado(&e.proveedor, &1);
    assert_eq!(p.estado, Estado::Entregado);
    assert_eq!(p.entregado_en, INICIO + DIA);

    let p = e.c.liberar(&e.cliente, &1);
    assert_eq!(p.estado, Estado::Liberado);
    assert_eq!(e.tok.balance(&e.proveedor), 97 * USDC);
    assert_eq!(e.tok.balance(&e.tesoreria), 3 * USDC);
    assert_eq!(e.tok.balance(&e.c.address), 0);
}

#[test]
fn liberar_antes_de_marcar_entrega() {
    let e = escena();
    e.crear(1, 10 * USDC);
    assert_eq!(e.c.liberar(&e.cliente, &1).estado, Estado::Liberado);
    assert_eq!(e.tok.balance(&e.proveedor), 97 * USDC / 10);
}

#[test]
fn comision_cero_no_transfiere_a_tesoreria() {
    let e = escena();
    e.c.set_comision(&e.admin, &0);
    e.crear(1, 10 * USDC);
    e.c.liberar(&e.cliente, &1);
    assert_eq!(e.tok.balance(&e.proveedor), 10 * USDC);
    assert_eq!(e.tok.balance(&e.tesoreria), 0);
}

#[test]
fn comision_se_redondea_hacia_abajo() {
    assert_eq!(calcular_comision(99, 300), 2);
    assert_eq!(calcular_comision(100 * USDC, 300), 3 * USDC);
    assert_eq!(calcular_comision(1, 1_000), 0);
}

#[test]
fn la_comision_del_pedido_no_cambia_si_cambia_la_config() {
    let e = escena();
    e.crear(1, 100 * USDC);
    e.c.set_comision(&e.admin, &1_000);
    e.c.liberar(&e.cliente, &1);
    assert_eq!(e.tok.balance(&e.proveedor), 97 * USDC);
    // Un pedido nuevo sí usa la comisión nueva.
    assert_eq!(e.crear(2, 10 * USDC).comision_bps, 1_000);
}

#[test]
fn rechazar_reembolsa_todo() {
    let e = escena();
    e.crear(1, 50 * USDC);
    let p = e.c.rechazar(&e.proveedor, &1);
    assert_eq!(p.estado, Estado::Reembolsado);
    assert_eq!(e.tok.balance(&e.cliente), 1_000 * USDC);
    assert_eq!(e.tok.balance(&e.c.address), 0);
}

// ------------------------------------------------------------------
// Disputas
// ------------------------------------------------------------------

#[test]
fn disputa_resuelta_a_favor_del_cliente() {
    let e = escena();
    e.crear(1, 40 * USDC);
    e.c.marcar_entregado(&e.proveedor, &1);
    assert_eq!(e.c.abrir_disputa(&e.cliente, &1).estado, Estado::EnDisputa);
    let p = e.c.resolver(&e.admin, &1, &Parte::Cliente);
    assert_eq!(p.estado, Estado::Resuelto);
    assert_eq!(p.ganador, Ganador::Cliente);
    assert_eq!(e.tok.balance(&e.cliente), 1_000 * USDC);
    assert_eq!(e.tok.balance(&e.tesoreria), 0);
}

#[test]
fn disputa_resuelta_a_favor_del_proveedor_cobra_comision() {
    let e = escena();
    e.crear(1, 100 * USDC);
    e.c.abrir_disputa(&e.proveedor, &1);
    let p = e.c.resolver(&e.admin, &1, &Parte::Proveedor);
    assert_eq!(p.ganador, Ganador::Proveedor);
    assert_eq!(e.tok.balance(&e.proveedor), 97 * USDC);
    assert_eq!(e.tok.balance(&e.tesoreria), 3 * USDC);
}

#[test]
fn en_disputa_nadie_puede_liberar_ni_rechazar() {
    let e = escena();
    e.crear(1, 10 * USDC);
    e.c.abrir_disputa(&e.cliente, &1);
    assert_eq!(
        e.c.try_liberar(&e.cliente, &1),
        Err(Ok(Error::EstadoInvalido))
    );
    assert_eq!(
        e.c.try_rechazar(&e.proveedor, &1),
        Err(Ok(Error::EstadoInvalido))
    );
    assert_eq!(
        e.c.try_abrir_disputa(&e.cliente, &1),
        Err(Ok(Error::EstadoInvalido))
    );
    e.avanzar(30 * DIA);
    assert_eq!(
        e.c.try_reembolsar_por_vencimiento(&e.cliente, &1),
        Err(Ok(Error::EstadoInvalido))
    );
}

#[test]
fn solo_se_resuelve_lo_que_esta_en_disputa() {
    let e = escena();
    e.crear(1, 10 * USDC);
    assert_eq!(
        e.c.try_resolver(&e.admin, &1, &Parte::Cliente),
        Err(Ok(Error::EstadoInvalido))
    );
}

// ------------------------------------------------------------------
// Vencimientos
// ------------------------------------------------------------------

#[test]
fn reembolso_por_vencimiento() {
    let e = escena();
    e.crear(1, 10 * USDC);
    e.avanzar(7 * DIA); // justo en la fecha límite: todavía no vence
    assert_eq!(
        e.c.try_reembolsar_por_vencimiento(&e.cliente, &1),
        Err(Ok(Error::PlazoNoVencido))
    );
    e.avanzar(1);
    assert_eq!(
        e.c.reembolsar_por_vencimiento(&e.cliente, &1).estado,
        Estado::Reembolsado
    );
    assert_eq!(e.tok.balance(&e.cliente), 1_000 * USDC);
}

#[test]
fn no_se_puede_entregar_despues_de_la_fecha_limite() {
    let e = escena();
    e.crear(1, 10 * USDC);
    e.avanzar(7 * DIA + 1);
    assert_eq!(
        e.c.try_marcar_entregado(&e.proveedor, &1),
        Err(Ok(Error::PlazoVencido))
    );
}

#[test]
fn si_ya_entrego_no_hay_reembolso_por_vencimiento() {
    let e = escena();
    e.crear(1, 10 * USDC);
    e.c.marcar_entregado(&e.proveedor, &1);
    e.avanzar(30 * DIA);
    assert_eq!(
        e.c.try_reembolsar_por_vencimiento(&e.cliente, &1),
        Err(Ok(Error::EstadoInvalido))
    );
}

#[test]
fn cobro_por_vencimiento_tras_plazo_de_revision() {
    let e = escena();
    e.crear(1, 100 * USDC);
    e.avanzar(DIA);
    e.c.marcar_entregado(&e.proveedor, &1);
    e.avanzar(3 * DIA);
    assert_eq!(
        e.c.try_cobrar_por_vencimiento(&e.proveedor, &1),
        Err(Ok(Error::PlazoNoVencido))
    );
    e.avanzar(1);
    assert_eq!(
        e.c.cobrar_por_vencimiento(&e.proveedor, &1).estado,
        Estado::Liberado
    );
    assert_eq!(e.tok.balance(&e.proveedor), 97 * USDC);
    assert_eq!(e.tok.balance(&e.tesoreria), 3 * USDC);
}

#[test]
fn cobro_por_vencimiento_exige_entrega() {
    let e = escena();
    e.crear(1, 10 * USDC);
    e.avanzar(30 * DIA);
    assert_eq!(
        e.c.try_cobrar_por_vencimiento(&e.proveedor, &1),
        Err(Ok(Error::EstadoInvalido))
    );
}

#[test]
fn el_plazo_de_revision_del_pedido_no_cambia_si_cambia_la_config() {
    let e = escena();
    e.crear(1, 10 * USDC);
    e.c.set_plazo_revision(&e.admin, &(30 * DIA));
    e.c.marcar_entregado(&e.proveedor, &1);
    e.avanzar(3 * DIA + 1);
    assert_eq!(
        e.c.cobrar_por_vencimiento(&e.proveedor, &1).estado,
        Estado::Liberado
    );
}

// ------------------------------------------------------------------
// Errores de creación
// ------------------------------------------------------------------

#[test]
fn errores_al_crear() {
    let e = escena();
    let limite = INICIO + DIA;
    assert_eq!(
        e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &0, &limite),
        Err(Ok(Error::MontoInvalido))
    );
    assert_eq!(
        e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &-5, &limite),
        Err(Ok(Error::MontoInvalido))
    );
    assert_eq!(
        e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &USDC, &INICIO),
        Err(Ok(Error::FechaInvalida))
    );
    assert_eq!(
        e.c.try_crear_pedido(&e.cliente, &e.cliente, &1, &USDC, &limite),
        Err(Ok(Error::MismaCuenta))
    );
    e.crear(1, USDC);
    assert_eq!(
        e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &USDC, &limite),
        Err(Ok(Error::PedidoYaExiste))
    );
}

#[test]
fn sin_saldo_no_se_crea_el_pedido() {
    let e = escena();
    let r =
        e.c.try_crear_pedido(&e.otro, &e.proveedor, &1, &USDC, &(INICIO + DIA));
    assert!(r.is_err());
    assert_eq!(e.c.try_pedido(&1), Err(Ok(Error::PedidoNoExiste)));
}

#[test]
fn pedido_inexistente() {
    let e = escena();
    assert_eq!(e.c.try_pedido(&99), Err(Ok(Error::PedidoNoExiste)));
    assert_eq!(
        e.c.try_liberar(&e.cliente, &99),
        Err(Ok(Error::PedidoNoExiste))
    );
}

#[test]
fn estados_finales_no_se_mueven() {
    let e = escena();
    e.crear(1, USDC);
    e.c.liberar(&e.cliente, &1);
    assert_eq!(
        e.c.try_liberar(&e.cliente, &1),
        Err(Ok(Error::EstadoInvalido))
    );
    assert_eq!(
        e.c.try_rechazar(&e.proveedor, &1),
        Err(Ok(Error::EstadoInvalido))
    );
    assert_eq!(
        e.c.try_abrir_disputa(&e.cliente, &1),
        Err(Ok(Error::EstadoInvalido))
    );
    assert_eq!(
        e.c.try_marcar_entregado(&e.proveedor, &1),
        Err(Ok(Error::EstadoInvalido))
    );
}

// ------------------------------------------------------------------
// Permisos
// ------------------------------------------------------------------

#[test]
fn cada_funcion_exige_a_la_parte_correcta() {
    let e = escena();
    e.crear(1, USDC);
    assert_eq!(
        e.c.try_marcar_entregado(&e.cliente, &1),
        Err(Ok(Error::NoAutorizado))
    );
    assert_eq!(
        e.c.try_liberar(&e.proveedor, &1),
        Err(Ok(Error::NoAutorizado))
    );
    assert_eq!(
        e.c.try_rechazar(&e.cliente, &1),
        Err(Ok(Error::NoAutorizado))
    );
    assert_eq!(
        e.c.try_abrir_disputa(&e.otro, &1),
        Err(Ok(Error::NoAutorizado))
    );
    e.avanzar(30 * DIA);
    assert_eq!(
        e.c.try_reembolsar_por_vencimiento(&e.proveedor, &1),
        Err(Ok(Error::NoAutorizado))
    );
}

#[test]
fn solo_el_admin_resuelve_y_configura() {
    let e = escena();
    e.crear(1, USDC);
    e.c.abrir_disputa(&e.cliente, &1);
    for intruso in [&e.cliente, &e.proveedor, &e.otro] {
        assert_eq!(
            e.c.try_resolver(intruso, &1, &Parte::Cliente),
            Err(Ok(Error::NoAutorizado))
        );
        assert_eq!(
            e.c.try_set_comision(intruso, &0),
            Err(Ok(Error::NoAutorizado))
        );
        assert_eq!(
            e.c.try_set_plazo_revision(intruso, &1),
            Err(Ok(Error::NoAutorizado))
        );
        assert_eq!(
            e.c.try_set_tesoreria(intruso, intruso),
            Err(Ok(Error::NoAutorizado))
        );
        assert_eq!(
            e.c.try_upgrade(intruso, &BytesN::from_array(&e.env, &[0; 32])),
            Err(Ok(Error::NoAutorizado))
        );
    }
}

#[test]
fn las_funciones_piden_la_firma_de_quien_actua() {
    let e = escena();
    e.crear(1, USDC);
    e.c.abrir_disputa(&e.proveedor, &1);
    let auths = e.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, e.proveedor);
    assert_eq!(
        auths[0].1.function,
        AuthorizedFunction::Contract((
            e.c.address.clone(),
            Symbol::new(&e.env, "abrir_disputa"),
            (e.proveedor.clone(), 1u64).into_val(&e.env),
        ))
    );

    e.c.resolver(&e.admin, &1, &Parte::Proveedor);
    let auths = e.env.auths();
    assert_eq!(auths[0].0, e.admin);
}

#[test]
fn configuracion() {
    let e = escena();
    let cfg = e.c.config();
    assert_eq!(cfg.admin, e.admin);
    assert_eq!(cfg.comision_bps, 300);
    assert_eq!(cfg.plazo_revision_seg, 3 * DIA);

    assert_eq!(
        e.c.try_set_comision(&e.admin, &1_001),
        Err(Ok(Error::ComisionInvalida))
    );
    assert_eq!(e.c.set_comision(&e.admin, &1_000).comision_bps, 1_000);
    assert_eq!(
        e.c.set_plazo_revision(&e.admin, &DIA).plazo_revision_seg,
        DIA
    );
    assert_eq!(e.c.set_tesoreria(&e.admin, &e.otro).tesoreria, e.otro);

    e.crear(1, 10 * USDC);
    e.c.liberar(&e.cliente, &1);
    assert_eq!(e.tok.balance(&e.otro), USDC);
}

#[test]
#[should_panic]
fn constructor_rechaza_comision_mayor_al_tope() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    env.register(Escrow, (admin.clone(), sac.address(), 1_001u32, admin, DIA));
}

#[test]
fn upgrade_con_hash_inexistente_falla() {
    let e = escena();
    let r =
        e.c.try_upgrade(&e.admin, &BytesN::from_array(&e.env, &[7; 32]));
    assert!(r.is_err());
}

/// Prueba real de upgrade: sube el .wasm compilado y reemplaza el código.
/// Requiere compilar antes (`scripts/build-contract`), por eso es `ignore`:
///   cargo test -- --ignored
#[test]
#[ignore]
fn upgrade_real_con_wasm_compilado() {
    let ruta = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../target/wasm32v1-none/release/cryptoville_escrow.wasm"
    );
    let bytes = std::fs::read(ruta).expect("compila el contrato antes de esta prueba");
    let e = escena();
    e.crear(1, 10 * USDC);
    let hash = e
        .env
        .deployer()
        .upload_contract_wasm(soroban_sdk::Bytes::from_slice(&e.env, &bytes));
    e.c.upgrade(&e.admin, &hash);
    // Los datos siguen ahí después del upgrade.
    assert_eq!(e.c.pedido(&1).monto, 10 * USDC);
}

/// El escrow con el token "USDC de prueba" (el que se despliega en Stellar Lab).
#[test]
fn funciona_con_el_token_usdc_de_prueba() {
    use cryptoville_usdc_prueba::{UsdcPrueba, UsdcPruebaClient};
    use soroban_sdk::String;

    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(INICIO);
    let admin = Address::generate(&env);
    let tesoreria = Address::generate(&env);
    let cliente = Address::generate(&env);
    let proveedor = Address::generate(&env);

    let token_id = env.register(
        UsdcPrueba,
        (admin.clone(), 7u32, String::from_str(&env, "USDC de prueba"), String::from_str(&env, "USDC")),
    );
    UsdcPruebaClient::new(&env, &token_id).mint(&cliente, &(50 * USDC));
    let escrow_id = env.register(Escrow, (admin.clone(), token_id.clone(), 300u32, tesoreria.clone(), 3 * DIA));
    let c = EscrowClient::new(&env, &escrow_id);
    let tok = TokenClient::new(&env, &token_id);

    c.crear_pedido(&cliente, &proveedor, &7, &(20 * USDC), &(INICIO + DIA));
    assert_eq!(tok.balance(&escrow_id), 20 * USDC);
    c.marcar_entregado(&proveedor, &7);
    c.liberar(&cliente, &7);
    assert_eq!(tok.balance(&proveedor), 194 * USDC / 10);
    assert_eq!(tok.balance(&tesoreria), 6 * USDC / 10);
    assert_eq!(tok.balance(&cliente), 30 * USDC);
}
