#![no_std]
//! Cryptoville: contrato de pago en garantía (escrow).
//!
//! El cliente deposita el pago al crear el pedido; el contrato lo retiene
//! hasta que se libera al proveedor (menos la comisión) o se reembolsa al
//! cliente. El admin del contrato es el árbitro de las disputas.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, ContractExecutable, Env,
};

/// Tope de la comisión: 10% (en puntos base).
pub const COMISION_MAX_BPS: u32 = 1_000;
const BPS: i128 = 10_000;

const DIA_EN_LEDGERS: u32 = 17_280;
const TTL_UMBRAL: u32 = 30 * DIA_EN_LEDGERS;
const TTL_EXTENDER: u32 = 120 * DIA_EN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    PedidoYaExiste = 1,
    PedidoNoExiste = 2,
    EstadoInvalido = 3,
    MontoInvalido = 4,
    FechaInvalida = 5,
    NoAutorizado = 6,
    PlazoNoVencido = 7,
    PlazoVencido = 8,
    ComisionInvalida = 9,
    MismaCuenta = 10,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Estado {
    Pagado,
    Entregado,
    EnDisputa,
    Liberado,
    Reembolsado,
    Resuelto,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Parte {
    Cliente,
    Proveedor,
}

/// Quién ganó una disputa (Ninguno mientras no se resuelva).
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Ganador {
    Ninguno,
    Cliente,
    Proveedor,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pedido {
    pub cliente: Address,
    pub proveedor: Address,
    pub monto: i128,
    /// Comisión vigente al crear el pedido (no cambia aunque el admin la cambie después).
    pub comision_bps: u32,
    /// Plazo de revisión vigente al crear el pedido, en segundos.
    pub plazo_revision_seg: u64,
    pub fecha_limite_entrega: u64,
    /// Momento en que el proveedor marcó la entrega (0 si no ha entregado).
    pub entregado_en: u64,
    pub estado: Estado,
    /// Solo cambia en pedidos resueltos por el árbitro.
    pub ganador: Ganador,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
    pub comision_bps: u32,
    pub tesoreria: Address,
    pub plazo_revision_seg: u64,
}

#[contracttype]
enum Clave {
    Config,
    Pedido(u64),
}

/// Se emite en cada cambio de estado de un pedido.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventoPedido {
    #[topic]
    pub id: u64,
    pub estado: Estado,
    pub monto: i128,
}

/// Se emite cuando el admin cambia la configuración.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigActualizada {
    pub comision_bps: u32,
    pub tesoreria: Address,
    pub plazo_revision_seg: u64,
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        comision_bps: u32,
        tesoreria: Address,
        plazo_revision_seg: u64,
    ) {
        if comision_bps > COMISION_MAX_BPS {
            panic_with_error!(&env, Error::ComisionInvalida);
        }
        let config = Config {
            admin,
            token,
            comision_bps,
            tesoreria,
            plazo_revision_seg,
        };
        env.storage().instance().set(&Clave::Config, &config);
        extender_instancia(&env);
    }

    // ---------------------------------------------------------------
    // Flujo del pedido
    // ---------------------------------------------------------------

    /// El cliente crea el pedido y deposita el monto en el contrato.
    /// `id` lo genera la app; no se puede repetir.
    pub fn crear_pedido(
        env: Env,
        cliente: Address,
        proveedor: Address,
        id: u64,
        monto: i128,
        fecha_limite_entrega: u64,
    ) -> Result<Pedido, Error> {
        cliente.require_auth();
        if cliente == proveedor {
            return Err(Error::MismaCuenta);
        }
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        if fecha_limite_entrega <= env.ledger().timestamp() {
            return Err(Error::FechaInvalida);
        }
        let clave = Clave::Pedido(id);
        if env.storage().persistent().has(&clave) {
            return Err(Error::PedidoYaExiste);
        }
        let config = leer_config(&env);
        token::Client::new(&env, &config.token).transfer(
            &cliente,
            &env.current_contract_address(),
            &monto,
        );
        let pedido = Pedido {
            cliente,
            proveedor,
            monto,
            comision_bps: config.comision_bps,
            plazo_revision_seg: config.plazo_revision_seg,
            fecha_limite_entrega,
            entregado_en: 0,
            estado: Estado::Pagado,
            ganador: Ganador::Ninguno,
        };
        guardar(&env, id, &pedido);
        Ok(pedido)
    }

    /// El proveedor marca el trabajo como entregado (antes de la fecha límite).
    pub fn marcar_entregado(env: Env, proveedor: Address, id: u64) -> Result<Pedido, Error> {
        proveedor.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.proveedor == proveedor)?;
        exigir_estado(&pedido, &[Estado::Pagado])?;
        let ahora = env.ledger().timestamp();
        if ahora > pedido.fecha_limite_entrega {
            return Err(Error::PlazoVencido);
        }
        pedido.entregado_en = ahora;
        pedido.estado = Estado::Entregado;
        guardar(&env, id, &pedido);
        Ok(pedido)
    }

    /// El cliente confirma y libera el pago al proveedor (menos la comisión).
    pub fn liberar(env: Env, cliente: Address, id: u64) -> Result<Pedido, Error> {
        cliente.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.cliente == cliente)?;
        exigir_estado(&pedido, &[Estado::Pagado, Estado::Entregado])?;
        pagar_proveedor(&env, &pedido);
        pedido.estado = Estado::Liberado;
        guardar(&env, id, &pedido);
        Ok(pedido)
    }

    /// El proveedor no acepta el trabajo: se reembolsa todo al cliente.
    pub fn rechazar(env: Env, proveedor: Address, id: u64) -> Result<Pedido, Error> {
        proveedor.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.proveedor == proveedor)?;
        exigir_estado(&pedido, &[Estado::Pagado, Estado::Entregado])?;
        reembolsar_cliente(&env, &pedido);
        pedido.estado = Estado::Reembolsado;
        guardar(&env, id, &pedido);
        Ok(pedido)
    }

    /// El cliente o el proveedor abren una disputa; el dinero queda congelado
    /// hasta que el árbitro resuelva.
    pub fn abrir_disputa(env: Env, quien: Address, id: u64) -> Result<Pedido, Error> {
        quien.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.cliente == quien || pedido.proveedor == quien)?;
        exigir_estado(&pedido, &[Estado::Pagado, Estado::Entregado])?;
        pedido.estado = Estado::EnDisputa;
        guardar(&env, id, &pedido);
        Ok(pedido)
    }

    /// El árbitro (admin) resuelve una disputa a favor de una de las partes.
    pub fn resolver(env: Env, admin: Address, id: u64, a_favor_de: Parte) -> Result<Pedido, Error> {
        exigir_admin(&env, &admin)?;
        let mut pedido = leer_pedido(&env, id)?;
        exigir_estado(&pedido, &[Estado::EnDisputa])?;
        match a_favor_de {
            Parte::Proveedor => pagar_proveedor(&env, &pedido),
            Parte::Cliente => reembolsar_cliente(&env, &pedido),
        }
        pedido.estado = Estado::Resuelto;
        pedido.ganador = match a_favor_de {
            Parte::Cliente => Ganador::Cliente,
            Parte::Proveedor => Ganador::Proveedor,
        };
        guardar(&env, id, &pedido);
        Ok(pedido)
    }

    /// El proveedor no entregó a tiempo: el cliente recupera su dinero.
    pub fn reembolsar_por_vencimiento(
        env: Env,
        cliente: Address,
        id: u64,
    ) -> Result<Pedido, Error> {
        cliente.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.cliente == cliente)?;
        exigir_estado(&pedido, &[Estado::Pagado])?;
        if env.ledger().timestamp() <= pedido.fecha_limite_entrega {
            return Err(Error::PlazoNoVencido);
        }
        reembolsar_cliente(&env, &pedido);
        pedido.estado = Estado::Reembolsado;
        guardar(&env, id, &pedido);
        Ok(pedido)
    }

    /// El proveedor entregó y el cliente no respondió dentro del plazo de
    /// revisión: el proveedor cobra.
    pub fn cobrar_por_vencimiento(env: Env, proveedor: Address, id: u64) -> Result<Pedido, Error> {
        proveedor.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.proveedor == proveedor)?;
        exigir_estado(&pedido, &[Estado::Entregado])?;
        let vence = pedido
            .entregado_en
            .saturating_add(pedido.plazo_revision_seg);
        if env.ledger().timestamp() <= vence {
            return Err(Error::PlazoNoVencido);
        }
        pagar_proveedor(&env, &pedido);
        pedido.estado = Estado::Liberado;
        guardar(&env, id, &pedido);
        Ok(pedido)
    }

    // ---------------------------------------------------------------
    // Administración
    // ---------------------------------------------------------------

    pub fn set_comision(env: Env, admin: Address, bps: u32) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        if bps > COMISION_MAX_BPS {
            return Err(Error::ComisionInvalida);
        }
        Ok(actualizar_config(&env, |c| c.comision_bps = bps))
    }

    pub fn set_plazo_revision(env: Env, admin: Address, seg: u64) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        Ok(actualizar_config(&env, |c| c.plazo_revision_seg = seg))
    }

    pub fn set_tesoreria(env: Env, admin: Address, cuenta: Address) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        Ok(actualizar_config(&env, |c| c.tesoreria = cuenta))
    }

    /// Reemplaza el código del contrato sin cambiar su dirección.
    pub fn upgrade(env: Env, admin: Address, wasm_hash: BytesN<32>) -> Result<(), Error> {
        exigir_admin(&env, &admin)?;
        env.deployer()
            .update_current_contract(ContractExecutable::Wasm(wasm_hash));
        Ok(())
    }

    // ---------------------------------------------------------------
    // Lectura
    // ---------------------------------------------------------------

    pub fn pedido(env: Env, id: u64) -> Result<Pedido, Error> {
        leer_pedido(&env, id)
    }

    pub fn config(env: Env) -> Config {
        leer_config(&env)
    }
}

// -------------------------------------------------------------------
// Funciones internas
// -------------------------------------------------------------------

fn leer_config(env: &Env) -> Config {
    env.storage().instance().get(&Clave::Config).unwrap()
}

fn actualizar_config(env: &Env, cambio: impl FnOnce(&mut Config)) -> Config {
    let mut config = leer_config(env);
    cambio(&mut config);
    env.storage().instance().set(&Clave::Config, &config);
    extender_instancia(env);
    ConfigActualizada {
        comision_bps: config.comision_bps,
        tesoreria: config.tesoreria.clone(),
        plazo_revision_seg: config.plazo_revision_seg,
    }
    .publish(env);
    config
}

fn exigir_admin(env: &Env, admin: &Address) -> Result<(), Error> {
    exigir(*admin == leer_config(env).admin)?;
    admin.require_auth();
    Ok(())
}

fn exigir(condicion: bool) -> Result<(), Error> {
    if condicion {
        Ok(())
    } else {
        Err(Error::NoAutorizado)
    }
}

fn exigir_estado(pedido: &Pedido, permitidos: &[Estado]) -> Result<(), Error> {
    if permitidos.contains(&pedido.estado) {
        Ok(())
    } else {
        Err(Error::EstadoInvalido)
    }
}

fn leer_pedido(env: &Env, id: u64) -> Result<Pedido, Error> {
    env.storage()
        .persistent()
        .get(&Clave::Pedido(id))
        .ok_or(Error::PedidoNoExiste)
}

fn guardar(env: &Env, id: u64, pedido: &Pedido) {
    let clave = Clave::Pedido(id);
    env.storage().persistent().set(&clave, pedido);
    env.storage()
        .persistent()
        .extend_ttl(&clave, TTL_UMBRAL, TTL_EXTENDER);
    extender_instancia(env);
    EventoPedido {
        id,
        estado: pedido.estado,
        monto: pedido.monto,
    }
    .publish(env);
}

fn extender_instancia(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
}

/// Comisión en unidades del token, redondeada hacia abajo.
pub fn calcular_comision(monto: i128, comision_bps: u32) -> i128 {
    monto * comision_bps as i128 / BPS
}

fn pagar_proveedor(env: &Env, pedido: &Pedido) {
    let config = leer_config(env);
    let tok = token::Client::new(env, &config.token);
    let contrato = env.current_contract_address();
    let comision = calcular_comision(pedido.monto, pedido.comision_bps);
    tok.transfer(&contrato, &pedido.proveedor, &(pedido.monto - comision));
    if comision > 0 {
        tok.transfer(&contrato, &config.tesoreria, &comision);
    }
}

fn reembolsar_cliente(env: &Env, pedido: &Pedido) {
    let config = leer_config(env);
    token::Client::new(env, &config.token).transfer(
        &env.current_contract_address(),
        &pedido.cliente,
        &pedido.monto,
    );
}

mod test;
