#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, EnvTestConfig, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, IntoVal, Symbol,
};

const USDC: i128 = 10_000_000; // 1 USDC con 7 decimales
const DIA: u64 = 86_400;
const INICIO: u64 = 1_000_000;
const SALDO: i128 = 10_000 * USDC;

struct Escena {
    env: Env,
    c: EscrowV2Client<'static>,
    tok: TokenClient<'static>,
    admin: Address,
    arbitro: Address,
    tesoreria: Address,
    cliente: Address,
    proveedor: Address,
    otro: Address,
}

fn escena_con(tope: i128) -> Escena {
    escena_en(Env::default(), tope)
}

/// Igual, pero sin guardar la "foto" del estado al terminar (para la prueba al azar, que hace cientos de pasos).
fn escena_sin_foto() -> Escena {
    escena_en(Env::new_with_config(EnvTestConfig { capture_snapshot_at_drop: false }), 0)
}

fn escena_en(env: Env, tope: i128) -> Escena {
    env.mock_all_auths();
    env.ledger().set_timestamp(INICIO);

    let admin = Address::generate(&env);
    let arbitro = Address::generate(&env);
    let tesoreria = Address::generate(&env);
    let cliente = Address::generate(&env);
    let proveedor = Address::generate(&env);
    let otro = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    StellarAssetClient::new(&env, &sac.address()).mint(&cliente, &SALDO);
    let id = env.register(
        EscrowV2,
        (
            admin.clone(),
            arbitro.clone(),
            sac.address(),
            tesoreria.clone(),
            300u32,
            100u32,
            3 * DIA,
            14 * DIA,
            tope,
        ),
    );
    Escena {
        c: EscrowV2Client::new(&env, &id),
        tok: TokenClient::new(&env, &sac.address()),
        env,
        admin,
        arbitro,
        tesoreria,
        cliente,
        proveedor,
        otro,
    }
}

fn escena() -> Escena {
    escena_con(0)
}

impl Escena {
    fn plan(&self, montos: &[i128]) -> Vec<PlanFase> {
        let mut v = Vec::new(&self.env);
        for (i, m) in montos.iter().enumerate() {
            v.push_back(PlanFase { monto: *m, fecha_limite: INICIO + (i as u64 + 1) * 7 * DIA });
        }
        v
    }
    fn crear(&self, id: u64, montos: &[i128]) -> Pedido {
        self.c.crear_pedido(&self.cliente, &self.proveedor, &id, &self.plan(montos))
    }
    fn huella(&self, n: u8) -> BytesN<32> {
        BytesN::from_array(&self.env, &[n; 32])
    }
    fn avanzar(&self, seg: u64) {
        let t = self.env.ledger().timestamp();
        self.env.ledger().set_timestamp(t + seg);
    }
    fn fase(&self, id: u64, i: u32) -> Fase {
        self.c.pedido(&id).fases.get(i).unwrap()
    }
    fn saldo(&self, a: &Address) -> i128 {
        self.tok.balance(a)
    }
}

// ------------------------------------------------------------------
// Garantía (1 fase) y por etapas
// ------------------------------------------------------------------

#[test]
fn garantia_de_una_fase_con_comision() {
    let e = escena();
    let p = e.crear(1, &[100 * USDC]);
    assert_eq!(p.fases.len(), 1);
    assert_eq!(p.comision_bps, 300);
    assert_eq!(e.saldo(&e.c.address), 100 * USDC);

    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(7));
    let f = e.fase(1, 0);
    assert_eq!(f.estado, EstadoFase::Entregada);
    assert_eq!(f.huella, e.huella(7));

    e.c.liberar_fase(&e.cliente, &1, &0);
    assert_eq!(e.fase(1, 0).estado, EstadoFase::Liberada);
    assert_eq!(e.saldo(&e.proveedor), 97 * USDC);
    assert_eq!(e.saldo(&e.tesoreria), 3 * USDC);
    assert_eq!(e.saldo(&e.c.address), 0);
}

#[test]
fn por_etapas_se_entrega_en_orden_y_se_cobra_por_fase() {
    let e = escena();
    e.crear(1, &[30 * USDC, 30 * USDC, 40 * USDC]);
    assert_eq!(e.saldo(&e.c.address), 100 * USDC);

    // La fase 2 no se puede entregar antes que la 1.
    assert_eq!(e.c.try_entregar_fase(&e.proveedor, &1, &1, &e.huella(1)), Err(Ok(Error::FaseAnteriorPendiente)));

    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(1));
    // Con la 1 entregada (aunque no liberada) ya se puede entregar la 2.
    e.c.entregar_fase(&e.proveedor, &1, &1, &e.huella(2));
    e.c.liberar_fase(&e.cliente, &1, &0);
    e.c.liberar_fase(&e.cliente, &1, &1);
    assert_eq!(e.saldo(&e.proveedor), 2 * (30 * USDC - 9_000_000));
    assert_eq!(e.saldo(&e.c.address), 40 * USDC);

    e.c.entregar_fase(&e.proveedor, &1, &2, &e.huella(3));
    e.c.liberar_fase(&e.cliente, &1, &2);
    assert_eq!(e.saldo(&e.c.address), 0);
    assert_eq!(e.saldo(&e.tesoreria), 3 * USDC);
    assert_eq!(e.saldo(&e.proveedor), 97 * USDC);
}

#[test]
fn el_cliente_puede_liberar_antes_de_la_entrega() {
    let e = escena();
    e.crear(1, &[10 * USDC]);
    e.c.liberar_fase(&e.cliente, &1, &0);
    assert_eq!(e.fase(1, 0).estado, EstadoFase::Liberada);
}

#[test]
fn plan_invalido() {
    let e = escena();
    let vacio = Vec::new(&e.env);
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &vacio), Err(Ok(Error::PlanInvalido)));
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &e.plan(&[USDC; 6])), Err(Ok(Error::PlanInvalido)));
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &e.plan(&[USDC, 0])), Err(Ok(Error::MontoInvalido)));
    let desordenado = vec![
        &e.env,
        PlanFase { monto: USDC, fecha_limite: INICIO + 9 * DIA },
        PlanFase { monto: USDC, fecha_limite: INICIO + 2 * DIA },
    ];
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &desordenado), Err(Ok(Error::FechaInvalida)));
    let pasado = vec![&e.env, PlanFase { monto: USDC, fecha_limite: INICIO }];
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &pasado), Err(Ok(Error::FechaInvalida)));
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.cliente, &1, &e.plan(&[USDC])), Err(Ok(Error::MismaCuenta)));
    e.crear(1, &[USDC]);
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &e.plan(&[USDC])), Err(Ok(Error::PedidoYaExiste)));
}

#[test]
fn tope_por_pedido() {
    let e = escena_con(100 * USDC);
    assert_eq!(
        e.c.try_crear_pedido(&e.cliente, &e.proveedor, &1, &e.plan(&[60 * USDC, 41 * USDC])),
        Err(Ok(Error::TopeSuperado))
    );
    assert_eq!(e.c.try_pagar_directo(&e.cliente, &e.proveedor, &2, &(101 * USDC)), Err(Ok(Error::TopeSuperado)));
    e.crear(1, &[60 * USDC, 40 * USDC]);
}

// ------------------------------------------------------------------
// Pedir cambios
// ------------------------------------------------------------------

#[test]
fn pedir_cambios_hasta_dos_veces_y_corre_las_fechas() {
    let e = escena();
    e.crear(1, &[10 * USDC, 10 * USDC]);
    let antes_fase2 = e.fase(1, 1).fecha_limite;
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(1));
    e.c.pedir_cambios(&e.cliente, &1, &0);
    let f = e.fase(1, 0);
    assert_eq!(f.estado, EstadoFase::EnCurso);
    assert_eq!(f.cambios, 1);
    assert_eq!(f.fecha_limite, INICIO + 7 * DIA + 3 * DIA);
    assert_eq!(e.fase(1, 1).fecha_limite, antes_fase2 + 3 * DIA);

    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(2));
    e.c.pedir_cambios(&e.cliente, &1, &0);
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(3));
    assert_eq!(e.c.try_pedir_cambios(&e.cliente, &1, &0), Err(Ok(Error::SinCambios)));
    assert_eq!(e.fase(1, 0).huella, e.huella(3));
}

#[test]
fn no_se_piden_cambios_despues_del_plazo_de_revision() {
    let e = escena();
    e.crear(1, &[10 * USDC]);
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(1));
    e.avanzar(3 * DIA + 1);
    assert_eq!(e.c.try_pedir_cambios(&e.cliente, &1, &0), Err(Ok(Error::PlazoVencido)));
}

// ------------------------------------------------------------------
// Vencimientos: los ejecuta cualquiera y el dinero va a quien corresponde
// ------------------------------------------------------------------

#[test]
fn cobro_por_vencimiento_lo_ejecuta_cualquiera() {
    let e = escena();
    e.crear(1, &[10 * USDC]);
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(1));
    assert_eq!(e.c.try_cobrar_por_vencimiento(&1, &0), Err(Ok(Error::PlazoNoVencido)));
    e.avanzar(3 * DIA + 1);
    e.c.cobrar_por_vencimiento(&1, &0);
    // No pidió la firma de nadie.
    assert!(e.env.auths().is_empty());
    assert_eq!(e.fase(1, 0).estado, EstadoFase::Liberada);
    assert_eq!(e.saldo(&e.proveedor), 10 * USDC - 3_000_000);
}

#[test]
fn reembolso_por_vencimiento_devuelve_la_fase_y_las_siguientes() {
    let e = escena();
    e.crear(1, &[10 * USDC, 20 * USDC, 30 * USDC]);
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(1));
    e.c.liberar_fase(&e.cliente, &1, &0);
    assert_eq!(e.c.try_reembolsar_por_vencimiento(&1, &1), Err(Ok(Error::PlazoNoVencido)));
    e.avanzar(14 * DIA + 1);
    e.c.reembolsar_por_vencimiento(&1, &1);
    assert!(e.env.auths().is_empty());
    assert_eq!(e.fase(1, 1).estado, EstadoFase::Reembolsada);
    assert_eq!(e.fase(1, 2).estado, EstadoFase::Reembolsada);
    assert_eq!(e.saldo(&e.c.address), 0);
    assert_eq!(e.saldo(&e.cliente), SALDO - 10 * USDC);
}

#[test]
fn una_entrega_vencida_no_se_puede_hacer() {
    let e = escena();
    e.crear(1, &[10 * USDC]);
    e.avanzar(7 * DIA + 1);
    assert_eq!(e.c.try_entregar_fase(&e.proveedor, &1, &0, &e.huella(1)), Err(Ok(Error::PlazoVencido)));
}

// ------------------------------------------------------------------
// Disputas
// ------------------------------------------------------------------

#[test]
fn disputa_por_fase_con_los_tres_resultados() {
    let e = escena();
    e.crear(1, &[10 * USDC, 10 * USDC, 10 * USDC]);
    e.c.abrir_disputa(&e.cliente, &1, &0);
    assert_eq!(e.fase(1, 0).estado, EstadoFase::EnDisputa);
    // Mientras la fase 1 está en disputa, las siguientes esperan.
    assert_eq!(e.c.try_entregar_fase(&e.proveedor, &1, &1, &e.huella(1)), Err(Ok(Error::FaseAnteriorPendiente)));
    let fecha2 = e.fase(1, 1).fecha_limite;
    e.avanzar(2 * DIA);
    e.c.resolver(&e.arbitro, &1, &0, &Resultado::Cliente);
    assert_eq!(e.fase(1, 0).ganador, Ganador::Cliente);
    // La disputa duró 2 días: las fechas de las fases siguientes se corren 2 días.
    assert_eq!(e.fase(1, 1).fecha_limite, fecha2 + 2 * DIA);

    e.c.entregar_fase(&e.proveedor, &1, &1, &e.huella(2));
    e.c.abrir_disputa(&e.proveedor, &1, &1);
    e.c.resolver(&e.arbitro, &1, &1, &Resultado::Proveedor);

    e.c.abrir_disputa(&e.cliente, &1, &2);
    e.c.resolver(&e.arbitro, &1, &2, &Resultado::Mitad);
    assert_eq!(e.fase(1, 2).ganador, Ganador::Mitad);

    // Cliente: fase 1 entera + media fase 3. Proveedor: fase 2 + media fase 3, menos 3%.
    assert_eq!(e.saldo(&e.cliente), SALDO - 30 * USDC + 10 * USDC + 5 * USDC);
    assert_eq!(e.saldo(&e.proveedor), (10 * USDC - 3_000_000) + (5 * USDC - 1_500_000));
    assert_eq!(e.saldo(&e.c.address), 0);
}

#[test]
fn solo_el_arbitro_resuelve_y_ni_el_admin_puede() {
    let e = escena();
    e.crear(1, &[10 * USDC]);
    e.c.abrir_disputa(&e.cliente, &1, &0);
    for intruso in [&e.admin, &e.cliente, &e.proveedor, &e.otro] {
        assert_eq!(e.c.try_resolver(intruso, &1, &0, &Resultado::Cliente), Err(Ok(Error::NoAutorizado)));
    }
    assert_eq!(e.c.try_liberar_fase(&e.cliente, &1, &0), Err(Ok(Error::EstadoInvalido)));
    assert_eq!(e.c.try_abrir_disputa(&e.otro, &1, &0), Err(Ok(Error::NoAutorizado)));
}

#[test]
fn si_el_arbitro_no_resuelve_cualquiera_reparte_50_50() {
    let e = escena();
    e.crear(1, &[11 * USDC]);
    e.c.abrir_disputa(&e.proveedor, &1, &0);
    e.avanzar(14 * DIA);
    assert_eq!(e.c.try_resolver_por_vencimiento(&1, &0), Err(Ok(Error::PlazoNoVencido)));
    e.avanzar(1);
    e.c.resolver_por_vencimiento(&1, &0);
    assert!(e.env.auths().is_empty());
    assert_eq!(e.fase(1, 0).ganador, Ganador::Mitad);
    // 11 USDC: 5.5 para cada uno; el proveedor paga 3% sobre su mitad.
    assert_eq!(e.saldo(&e.proveedor), 55_000_000 - 1_650_000);
    assert_eq!(e.saldo(&e.cliente), SALDO - 55_000_000);
}

#[test]
fn no_hay_reembolso_por_vencimiento_si_una_fase_anterior_esta_en_disputa() {
    let e = escena();
    e.crear(1, &[10 * USDC, 10 * USDC]);
    e.c.abrir_disputa(&e.cliente, &1, &0);
    e.avanzar(15 * DIA);
    assert_eq!(e.c.try_reembolsar_por_vencimiento(&1, &1), Err(Ok(Error::FaseAnteriorPendiente)));
}

#[test]
fn rechazar_devuelve_lo_que_falta() {
    let e = escena();
    e.crear(1, &[10 * USDC, 20 * USDC, 30 * USDC]);
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(1));
    e.c.liberar_fase(&e.cliente, &1, &0);
    e.c.rechazar(&e.proveedor, &1);
    assert_eq!(e.fase(1, 1).estado, EstadoFase::Reembolsada);
    assert_eq!(e.fase(1, 2).estado, EstadoFase::Reembolsada);
    assert_eq!(e.saldo(&e.cliente), SALDO - 10 * USDC);
    assert_eq!(e.c.try_rechazar(&e.proveedor, &1), Err(Ok(Error::EstadoInvalido)));
    assert_eq!(e.c.try_rechazar(&e.cliente, &1), Err(Ok(Error::NoAutorizado)));
}

// ------------------------------------------------------------------
// Pago directo
// ------------------------------------------------------------------

#[test]
fn pago_directo_reparte_en_el_momento() {
    let e = escena();
    let hecho = e.c.pagar_directo(&e.cliente, &e.proveedor, &9, &(50 * USDC));
    assert_eq!(hecho.comision, 5_000_000);
    assert_eq!(e.saldo(&e.proveedor), 50 * USDC - 5_000_000);
    assert_eq!(e.saldo(&e.tesoreria), 5_000_000);
    assert_eq!(e.saldo(&e.c.address), 0);
    assert_eq!(e.c.pago_directo(&9).monto, 50 * USDC);
    // El número no se repite, ni como pago directo ni como pedido.
    assert_eq!(e.c.try_pagar_directo(&e.cliente, &e.proveedor, &9, &USDC), Err(Ok(Error::PedidoYaExiste)));
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.proveedor, &9, &e.plan(&[USDC])), Err(Ok(Error::PedidoYaExiste)));
    assert_eq!(e.c.try_pagar_directo(&e.cliente, &e.cliente, &10, &USDC), Err(Ok(Error::MismaCuenta)));
    assert_eq!(e.c.try_pagar_directo(&e.cliente, &e.proveedor, &10, &0), Err(Ok(Error::MontoInvalido)));
}

// ------------------------------------------------------------------
// Pausa, configuración y actualizaciones
// ------------------------------------------------------------------

#[test]
fn la_pausa_solo_frena_lo_nuevo() {
    let e = escena();
    e.crear(1, &[10 * USDC, 10 * USDC]);
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(1));
    e.c.pausar(&e.admin);
    assert_eq!(e.c.try_crear_pedido(&e.cliente, &e.proveedor, &2, &e.plan(&[USDC])), Err(Ok(Error::Pausado)));
    assert_eq!(e.c.try_pagar_directo(&e.cliente, &e.proveedor, &3, &USDC), Err(Ok(Error::Pausado)));
    // Lo que ya está en el contrato sigue funcionando.
    e.c.liberar_fase(&e.cliente, &1, &0);
    e.c.abrir_disputa(&e.cliente, &1, &1);
    e.c.resolver(&e.arbitro, &1, &1, &Resultado::Mitad);
    e.c.reanudar(&e.admin);
    e.crear(2, &[USDC]);
}

#[test]
fn la_comision_y_los_plazos_del_pedido_no_cambian_si_cambia_la_config() {
    let e = escena();
    e.crear(1, &[100 * USDC]);
    e.c.set_comision(&e.admin, &1_000);
    e.c.set_plazo_revision(&e.admin, &DIA);
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(1));
    e.avanzar(2 * DIA);
    assert_eq!(e.c.try_cobrar_por_vencimiento(&1, &0), Err(Ok(Error::PlazoNoVencido)));
    e.c.liberar_fase(&e.cliente, &1, &0);
    assert_eq!(e.saldo(&e.proveedor), 97 * USDC);
}

#[test]
fn solo_el_admin_configura() {
    let e = escena();
    for intruso in [&e.arbitro, &e.cliente, &e.otro] {
        assert_eq!(e.c.try_set_comision(intruso, &0), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_set_comision_directo(intruso, &0), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_set_plazo_revision(intruso, &1), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_set_plazo_disputa(intruso, &1), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_set_tope(intruso, &1), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_set_tesoreria(intruso, intruso), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_set_arbitro(intruso, intruso), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_set_admin(intruso, intruso), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_pausar(intruso), Err(Ok(Error::NoAutorizado)));
        assert_eq!(e.c.try_proponer_actualizacion(intruso, &e.huella(1)), Err(Ok(Error::NoAutorizado)));
    }
    assert_eq!(e.c.try_set_comision(&e.admin, &1_001), Err(Ok(Error::ComisionInvalida)));
    let cfg = e.c.set_arbitro(&e.admin, &e.otro);
    assert_eq!(cfg.arbitro, e.otro);
}

#[test]
fn cambiar_el_admin_lo_firman_los_dos() {
    let e = escena();
    e.c.set_admin(&e.admin, &e.otro);
    let auths = e.env.auths();
    assert_eq!(auths.len(), 2);
    assert_eq!(e.c.config().admin, e.otro);
}

#[test]
fn actualizar_el_codigo_exige_siete_dias_de_aviso() {
    let e = escena();
    assert_eq!(e.c.try_ejecutar_actualizacion(&e.admin), Err(Ok(Error::SinActualizacion)));
    let a = e.c.proponer_actualizacion(&e.admin, &e.huella(9));
    assert_eq!(a.ejecutable_desde, INICIO + AVISO_ACTUALIZACION_SEG);
    assert_eq!(e.c.actualizacion(), Some(a));
    e.avanzar(AVISO_ACTUALIZACION_SEG - 1);
    assert_eq!(e.c.try_ejecutar_actualizacion(&e.admin), Err(Ok(Error::AvisoNoCumplido)));
    e.c.cancelar_actualizacion(&e.admin);
    assert_eq!(e.c.actualizacion(), None);
    assert_eq!(e.c.try_cancelar_actualizacion(&e.admin), Err(Ok(Error::SinActualizacion)));
}

#[test]
fn actualizar_con_un_hash_que_no_existe_falla_aunque_pase_el_aviso() {
    let e = escena();
    e.c.proponer_actualizacion(&e.admin, &e.huella(9));
    e.avanzar(AVISO_ACTUALIZACION_SEG);
    assert!(e.c.try_ejecutar_actualizacion(&e.admin).is_err());
}

#[test]
#[ignore]
fn actualizacion_real_con_wasm_compilado() {
    let ruta = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/wasm32v1-none/release/cryptoville_escrow_v2.wasm");
    let bytes = std::fs::read(ruta).expect("compila el contrato antes de esta prueba");
    let e = escena();
    e.crear(1, &[10 * USDC]);
    let hash = e.env.deployer().upload_contract_wasm(soroban_sdk::Bytes::from_slice(&e.env, &bytes));
    e.c.proponer_actualizacion(&e.admin, &hash);
    e.avanzar(AVISO_ACTUALIZACION_SEG);
    e.c.ejecutar_actualizacion(&e.admin);
    // Los datos siguen ahí después de actualizar.
    assert_eq!(e.c.pedido(&1).fases.get(0).unwrap().monto, 10 * USDC);
}

// ------------------------------------------------------------------
// Permisos y firmas
// ------------------------------------------------------------------

#[test]
fn cada_funcion_exige_a_la_parte_correcta() {
    let e = escena();
    e.crear(1, &[USDC, USDC]);
    assert_eq!(e.c.try_entregar_fase(&e.cliente, &1, &0, &e.huella(1)), Err(Ok(Error::NoAutorizado)));
    assert_eq!(e.c.try_liberar_fase(&e.proveedor, &1, &0), Err(Ok(Error::NoAutorizado)));
    assert_eq!(e.c.try_pedir_cambios(&e.proveedor, &1, &0), Err(Ok(Error::NoAutorizado)));
    assert_eq!(e.c.try_liberar_fase(&e.cliente, &1, &5), Err(Ok(Error::FaseNoExiste)));
    assert_eq!(e.c.try_liberar_fase(&e.cliente, &99, &0), Err(Ok(Error::PedidoNoExiste)));
    assert_eq!(e.c.try_pedido(&99), Err(Ok(Error::PedidoNoExiste)));
    assert_eq!(e.c.try_extender(&99), Err(Ok(Error::PedidoNoExiste)));
    e.c.extender(&1);
}

#[test]
fn las_funciones_piden_la_firma_de_quien_actua() {
    let e = escena();
    e.crear(1, &[USDC]);
    e.c.entregar_fase(&e.proveedor, &1, &0, &e.huella(4));
    let auths = e.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, e.proveedor);
    assert_eq!(
        auths[0].1.function,
        AuthorizedFunction::Contract((
            e.c.address.clone(),
            Symbol::new(&e.env, "entregar_fase"),
            (e.proveedor.clone(), 1u64, 0u32, e.huella(4)).into_val(&e.env),
        ))
    );
    e.c.abrir_disputa(&e.cliente, &1, &0);
    e.c.resolver(&e.arbitro, &1, &0, &Resultado::Proveedor);
    assert_eq!(e.env.auths()[0].0, e.arbitro);
}

#[test]
fn configuracion_inicial() {
    let e = escena_con(500 * USDC);
    let cfg = e.c.config();
    assert_eq!(cfg.admin, e.admin);
    assert_eq!(cfg.arbitro, e.arbitro);
    assert_eq!(cfg.comision_bps, 300);
    assert_eq!(cfg.comision_directo_bps, 100);
    assert_eq!(cfg.plazo_revision_seg, 3 * DIA);
    assert_eq!(cfg.plazo_disputa_seg, 14 * DIA);
    assert_eq!(cfg.tope_pedido, 500 * USDC);
    assert!(!cfg.pausado);
}

// ------------------------------------------------------------------
// Propiedad: todo el dinero que entra sale exactamente a alguien
// ------------------------------------------------------------------

/// Generador de números al azar determinista (así la prueba siempre da lo mismo).
struct Azar(u64);
impl Azar {
    fn siguiente(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn hasta(&mut self, n: u64) -> u64 {
        self.siguiente() % n
    }
}

/// Lo que el contrato todavía guarda de un pedido (fases en curso, entregadas o en disputa).
fn retenido(p: &Pedido) -> i128 {
    let mut total = 0;
    for f in p.fases.iter() {
        if matches!(f.estado, EstadoFase::EnCurso | EstadoFase::Entregada | EstadoFase::EnDisputa) {
            total += f.monto;
        }
    }
    total
}

#[test]
fn propiedad_todo_lo_que_entra_sale_a_alguien() {
    for semilla in 1..=12u64 {
        let e = escena_sin_foto();
        let mut azar = Azar(semilla.wrapping_mul(0x9E37_79B9_7F4A_7C15));
        let mut ids: std::vec::Vec<u64> = std::vec::Vec::new();
        for paso in 0..160u64 {
            let accion = azar.hasta(11);
            if accion == 0 || ids.is_empty() {
                let n = 1 + azar.hasta(5) as usize;
                let mut montos = std::vec::Vec::new();
                for _ in 0..n {
                    montos.push(1 + azar.hasta(40 * USDC as u64) as i128);
                }
                let id = 1_000 + paso;
                if e.c.try_crear_pedido(&e.cliente, &e.proveedor, &id, &e.plan(&montos)).is_ok() {
                    ids.push(id);
                }
                continue;
            }
            if accion == 1 {
                let _ = e.c.try_pagar_directo(&e.cliente, &e.proveedor, &(5_000 + paso), &(1 + azar.hasta(5 * USDC as u64) as i128));
                continue;
            }
            let id = ids[azar.hasta(ids.len() as u64) as usize];
            let fase = azar.hasta(5) as u32;
            let h = e.huella((paso % 250) as u8);
            match accion {
                2 => drop(e.c.try_entregar_fase(&e.proveedor, &id, &fase, &h)),
                3 => drop(e.c.try_liberar_fase(&e.cliente, &id, &fase)),
                4 => drop(e.c.try_pedir_cambios(&e.cliente, &id, &fase)),
                5 => drop(e.c.try_abrir_disputa(if azar.hasta(2) == 0 { &e.cliente } else { &e.proveedor }, &id, &fase)),
                6 => {
                    let r = [Resultado::Cliente, Resultado::Proveedor, Resultado::Mitad][azar.hasta(3) as usize];
                    drop(e.c.try_resolver(&e.arbitro, &id, &fase, &r));
                }
                7 => drop(e.c.try_cobrar_por_vencimiento(&id, &fase)),
                8 => drop(e.c.try_reembolsar_por_vencimiento(&id, &fase)),
                9 => drop(e.c.try_resolver_por_vencimiento(&id, &fase)),
                _ => {
                    if azar.hasta(4) == 0 {
                        drop(e.c.try_rechazar(&e.proveedor, &id));
                    } else {
                        e.avanzar(azar.hasta(6 * DIA));
                    }
                }
            }
            // Después de cada paso: el contrato guarda exactamente lo que falta pagar o devolver…
            let guardado: i128 = ids.iter().map(|i| retenido(&e.c.pedido(i))).sum();
            assert_eq!(e.saldo(&e.c.address), guardado, "semilla {semilla}, paso {paso}");
            // …y no se crea ni se pierde dinero.
            let total = e.saldo(&e.cliente) + e.saldo(&e.proveedor) + e.saldo(&e.tesoreria) + e.saldo(&e.c.address);
            assert_eq!(total, SALDO, "semilla {semilla}, paso {paso}");
        }
    }
}

/// El escrow v2 con el token "USDC de prueba" (el que se despliega en Stellar Lab).
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
    let token = env.register(UsdcPrueba, (admin.clone(), 7u32, String::from_str(&env, "USDC de prueba"), String::from_str(&env, "USDC")));
    let usdc = UsdcPruebaClient::new(&env, &token);
    usdc.mint(&cliente, &(100 * USDC));
    let id = env.register(EscrowV2, (admin.clone(), admin.clone(), token.clone(), tesoreria.clone(), 300u32, 100u32, 3 * DIA, 14 * DIA, 0i128));
    let c = EscrowV2Client::new(&env, &id);
    let plan = vec![&env, PlanFase { monto: 40 * USDC, fecha_limite: INICIO + DIA }, PlanFase { monto: 60 * USDC, fecha_limite: INICIO + 2 * DIA }];
    c.crear_pedido(&cliente, &proveedor, &1, &plan);
    c.liberar_fase(&cliente, &1, &0);
    c.liberar_fase(&cliente, &1, &1);
    assert_eq!(usdc.balance(&proveedor), 97 * USDC);
    assert_eq!(usdc.balance(&tesoreria), 3 * USDC);
}
