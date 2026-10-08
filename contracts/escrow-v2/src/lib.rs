#![no_std]
//! Cryptoville: contrato de pago en garantía v2 (fases y pago directo).
//!
//! - **Fases.** El cliente deposita todo de una vez; el plan (de 1 a 5 fases, cada una con su monto y
//!   su fecha límite) queda en el contrato. El proveedor entrega fase por fase con la huella (SHA-256)
//!   de su prueba; el cliente libera cada fase o pide cambios. La garantía simple es un plan de 1 fase.
//! - **Pago directo.** Sin garantía: el contrato reparte el pago en el momento (proveedor y comisión).
//! - **Vencimientos.** Cualquiera puede ejecutarlos: el dinero siempre va a quien corresponde.
//! - **Roles separados.** `admin` cambia la configuración y propone actualizaciones; `arbitro` resuelve
//!   disputas (a favor del cliente, del proveedor o 50/50). Ninguno puede quedarse con el dinero.
//! - **Actualizaciones con aviso.** El código solo cambia 7 días después de proponerlo.
//! - **Pausa de emergencia.** Solo frena pedidos y pagos nuevos: nunca bloquea liberar, reembolsar,
//!   resolver ni los vencimientos.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, ContractExecutable, Env, Vec,
};

/// Tope de la comisión: 10% (en puntos base).
pub const COMISION_MAX_BPS: u32 = 1_000;
/// Fases de un pedido. Debe coincidir con `fases.max` en packages/shared/src/reglas.ts.
pub const MAX_FASES: u32 = 5;
/// Veces que el cliente puede pedir cambios en una fase. Debe coincidir con `fases.cambiosPorFase`.
pub const MAX_CAMBIOS: u32 = 2;
/// Aviso mínimo antes de actualizar el código (7 días). Fijo: el admin no lo puede acortar.
pub const AVISO_ACTUALIZACION_SEG: u64 = 7 * 24 * 60 * 60;
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
    Pausado = 11,
    TopeSuperado = 12,
    PlanInvalido = 13,
    FaseNoExiste = 14,
    FaseAnteriorPendiente = 15,
    SinCambios = 16,
    SinActualizacion = 17,
    AvisoNoCumplido = 18,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EstadoFase {
    /// Pagada en garantía, esperando la entrega.
    EnCurso,
    /// El proveedor entregó: corre el plazo de revisión del cliente.
    Entregada,
    Liberada,
    Reembolsada,
    EnDisputa,
    Resuelta,
}

/// Cómo resuelve el árbitro una disputa.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Resultado {
    Cliente,
    Proveedor,
    /// Mitad para cada uno (la comisión se cobra solo sobre la mitad del proveedor).
    Mitad,
}

/// Quién ganó la disputa de una fase.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Ganador {
    Ninguno,
    Cliente,
    Proveedor,
    Mitad,
}

/// Una fase del plan que manda el cliente al crear el pedido.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlanFase {
    pub monto: i128,
    pub fecha_limite: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Fase {
    pub monto: i128,
    pub fecha_limite: u64,
    pub estado: EstadoFase,
    /// Momento de la entrega (0 si todavía no entregó).
    pub entregada_en: u64,
    /// SHA-256 del paquete de pruebas de la entrega (ceros si todavía no entregó).
    pub huella: BytesN<32>,
    /// Veces que el cliente pidió cambios.
    pub cambios: u32,
    /// Momento en que se abrió la disputa (0 si no hay).
    pub disputa_desde: u64,
    pub ganador: Ganador,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pedido {
    pub cliente: Address,
    pub proveedor: Address,
    /// Comisión vigente al crear el pedido (no cambia aunque el admin la cambie después).
    pub comision_bps: u32,
    /// Plazo de revisión vigente al crear el pedido, en segundos.
    pub plazo_revision_seg: u64,
    /// Plazo máximo de una disputa vigente al crear el pedido, en segundos.
    pub plazo_disputa_seg: u64,
    pub fases: Vec<Fase>,
    pub creado_en: u64,
}

/// Un pago directo ya hecho (para que no se repita el número y para verificarlo).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PagoDirectoHecho {
    pub cliente: Address,
    pub proveedor: Address,
    pub monto: i128,
    pub comision: i128,
    pub fecha: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub arbitro: Address,
    pub token: Address,
    pub tesoreria: Address,
    pub comision_bps: u32,
    pub comision_directo_bps: u32,
    pub plazo_revision_seg: u64,
    pub plazo_disputa_seg: u64,
    /// Monto máximo de un pedido o pago directo (0 = sin tope).
    pub tope_pedido: i128,
    pub pausado: bool,
}

/// Actualización del código propuesta por el admin.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Actualizacion {
    pub wasm_hash: BytesN<32>,
    pub ejecutable_desde: u64,
}

#[contracttype]
enum Clave {
    Config,
    Pedido(u64),
    Directo(u64),
    Actualizacion,
}

// ---------------------------------------------------------------
// Eventos (la app los lee para mantener los pedidos al día)
// ---------------------------------------------------------------

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PedidoCreado {
    #[topic]
    pub id: u64,
    pub cliente: Address,
    pub proveedor: Address,
    pub total: i128,
    pub fases: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FaseCambio {
    #[topic]
    pub id: u64,
    pub fase: u32,
    pub estado: EstadoFase,
    pub monto: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PagoDirecto {
    #[topic]
    pub id: u64,
    pub cliente: Address,
    pub proveedor: Address,
    pub monto: i128,
    pub comision: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigActualizada {
    pub arbitro: Address,
    pub tesoreria: Address,
    pub comision_bps: u32,
    pub comision_directo_bps: u32,
    pub plazo_revision_seg: u64,
    pub plazo_disputa_seg: u64,
    pub tope_pedido: i128,
    pub pausado: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActualizacionPropuesta {
    pub wasm_hash: BytesN<32>,
    pub ejecutable_desde: u64,
}

#[contract]
pub struct EscrowV2;

#[contractimpl]
impl EscrowV2 {
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        admin: Address,
        arbitro: Address,
        token: Address,
        tesoreria: Address,
        comision_bps: u32,
        comision_directo_bps: u32,
        plazo_revision_seg: u64,
        plazo_disputa_seg: u64,
        tope_pedido: i128,
    ) {
        if comision_bps > COMISION_MAX_BPS || comision_directo_bps > COMISION_MAX_BPS {
            panic_with_error!(&env, Error::ComisionInvalida);
        }
        if tope_pedido < 0 {
            panic_with_error!(&env, Error::MontoInvalido);
        }
        let config = Config {
            admin,
            arbitro,
            token,
            tesoreria,
            comision_bps,
            comision_directo_bps,
            plazo_revision_seg,
            plazo_disputa_seg,
            tope_pedido,
            pausado: false,
        };
        env.storage().instance().set(&Clave::Config, &config);
        extender_instancia(&env);
    }

    // ---------------------------------------------------------------
    // Crear y pagar
    // ---------------------------------------------------------------

    /// El cliente crea el pedido con su plan de fases y deposita el total en el contrato.
    /// `id` lo genera la app; no se puede repetir.
    pub fn crear_pedido(env: Env, cliente: Address, proveedor: Address, id: u64, fases: Vec<PlanFase>) -> Result<Pedido, Error> {
        cliente.require_auth();
        let config = leer_config(&env);
        exigir_sin_pausa(&config)?;
        if cliente == proveedor {
            return Err(Error::MismaCuenta);
        }
        let n = fases.len();
        if n == 0 || n > MAX_FASES {
            return Err(Error::PlanInvalido);
        }
        let ahora = env.ledger().timestamp();
        let mut total: i128 = 0;
        let mut anterior: u64 = 0;
        let mut plan: Vec<Fase> = Vec::new(&env);
        for f in fases.iter() {
            if f.monto <= 0 {
                return Err(Error::MontoInvalido);
            }
            if f.fecha_limite <= ahora || f.fecha_limite < anterior {
                return Err(Error::FechaInvalida);
            }
            anterior = f.fecha_limite;
            total = total.checked_add(f.monto).ok_or(Error::MontoInvalido)?;
            plan.push_back(Fase {
                monto: f.monto,
                fecha_limite: f.fecha_limite,
                estado: EstadoFase::EnCurso,
                entregada_en: 0,
                huella: BytesN::from_array(&env, &[0; 32]),
                cambios: 0,
                disputa_desde: 0,
                ganador: Ganador::Ninguno,
            });
        }
        exigir_tope(&config, total)?;
        if env.storage().persistent().has(&Clave::Pedido(id)) || env.storage().persistent().has(&Clave::Directo(id)) {
            return Err(Error::PedidoYaExiste);
        }
        token::Client::new(&env, &config.token).transfer(&cliente, &env.current_contract_address(), &total);
        let pedido = Pedido {
            cliente: cliente.clone(),
            proveedor: proveedor.clone(),
            comision_bps: config.comision_bps,
            plazo_revision_seg: config.plazo_revision_seg,
            plazo_disputa_seg: config.plazo_disputa_seg,
            fases: plan,
            creado_en: ahora,
        };
        guardar(&env, id, &pedido);
        PedidoCreado { id, cliente, proveedor, total, fases: n }.publish(&env);
        Ok(pedido)
    }

    /// Pago directo, SIN garantía: el contrato reparte el pago en el momento
    /// (el proveedor recibe el monto menos la comisión de pago directo). No admite disputa.
    pub fn pagar_directo(env: Env, cliente: Address, proveedor: Address, id: u64, monto: i128) -> Result<PagoDirectoHecho, Error> {
        cliente.require_auth();
        let config = leer_config(&env);
        exigir_sin_pausa(&config)?;
        if cliente == proveedor {
            return Err(Error::MismaCuenta);
        }
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        exigir_tope(&config, monto)?;
        let clave = Clave::Directo(id);
        if env.storage().persistent().has(&clave) || env.storage().persistent().has(&Clave::Pedido(id)) {
            return Err(Error::PedidoYaExiste);
        }
        let comision = calcular_comision(monto, config.comision_directo_bps);
        let tok = token::Client::new(&env, &config.token);
        tok.transfer(&cliente, &proveedor, &(monto - comision));
        if comision > 0 {
            tok.transfer(&cliente, &config.tesoreria, &comision);
        }
        let hecho = PagoDirectoHecho { cliente: cliente.clone(), proveedor: proveedor.clone(), monto, comision, fecha: env.ledger().timestamp() };
        env.storage().persistent().set(&clave, &hecho);
        env.storage().persistent().extend_ttl(&clave, TTL_UMBRAL, TTL_EXTENDER);
        extender_instancia(&env);
        PagoDirecto { id, cliente, proveedor, monto, comision }.publish(&env);
        Ok(hecho)
    }

    // ---------------------------------------------------------------
    // Flujo de cada fase
    // ---------------------------------------------------------------

    /// El proveedor entrega una fase con la huella de su prueba. Las fases van en orden.
    pub fn entregar_fase(env: Env, proveedor: Address, id: u64, fase: u32, huella: BytesN<32>) -> Result<Pedido, Error> {
        proveedor.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.proveedor == proveedor)?;
        let mut f = leer_fase(&pedido, fase)?;
        exigir_estado(&f, &[EstadoFase::EnCurso])?;
        if env.ledger().timestamp() > f.fecha_limite {
            return Err(Error::PlazoVencido);
        }
        for i in 0..fase {
            let previa = pedido.fases.get_unchecked(i);
            if previa.estado == EstadoFase::EnCurso || previa.estado == EstadoFase::EnDisputa {
                return Err(Error::FaseAnteriorPendiente);
            }
        }
        f.estado = EstadoFase::Entregada;
        f.entregada_en = env.ledger().timestamp();
        f.huella = huella;
        cambiar_fase(&env, id, &mut pedido, fase, f);
        Ok(pedido)
    }

    /// El cliente libera el pago de una fase (también antes de la entrega, si quiere).
    pub fn liberar_fase(env: Env, cliente: Address, id: u64, fase: u32) -> Result<Pedido, Error> {
        cliente.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.cliente == cliente)?;
        let mut f = leer_fase(&pedido, fase)?;
        exigir_estado(&f, &[EstadoFase::EnCurso, EstadoFase::Entregada])?;
        pagar_proveedor(&env, &pedido, f.monto);
        f.estado = EstadoFase::Liberada;
        cambiar_fase(&env, id, &mut pedido, fase, f);
        Ok(pedido)
    }

    /// El cliente pide cambios a una entrega (hasta MAX_CAMBIOS veces por fase).
    /// La fecha límite de esa fase y de las siguientes se corre por el plazo de revisión.
    pub fn pedir_cambios(env: Env, cliente: Address, id: u64, fase: u32) -> Result<Pedido, Error> {
        cliente.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.cliente == cliente)?;
        let mut f = leer_fase(&pedido, fase)?;
        exigir_estado(&f, &[EstadoFase::Entregada])?;
        let ahora = env.ledger().timestamp();
        if ahora > f.entregada_en.saturating_add(pedido.plazo_revision_seg) {
            return Err(Error::PlazoVencido);
        }
        if f.cambios >= MAX_CAMBIOS {
            return Err(Error::SinCambios);
        }
        let nueva = f.fecha_limite.max(ahora).saturating_add(pedido.plazo_revision_seg);
        let corrimiento = nueva - f.fecha_limite;
        f.fecha_limite = nueva;
        f.estado = EstadoFase::EnCurso;
        f.cambios += 1;
        f.entregada_en = 0;
        cambiar_fase(&env, id, &mut pedido, fase, f);
        correr_siguientes(&env, id, &mut pedido, fase, corrimiento);
        Ok(pedido)
    }

    /// El proveedor no va a seguir: devuelve al cliente todas las fases que no se pagaron ni están en disputa.
    pub fn rechazar(env: Env, proveedor: Address, id: u64) -> Result<Pedido, Error> {
        proveedor.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.proveedor == proveedor)?;
        let mut alguna = false;
        for i in 0..pedido.fases.len() {
            let mut f = pedido.fases.get_unchecked(i);
            if f.estado == EstadoFase::EnCurso || f.estado == EstadoFase::Entregada {
                reembolsar_cliente(&env, &pedido, f.monto);
                f.estado = EstadoFase::Reembolsada;
                cambiar_fase(&env, id, &mut pedido, i, f);
                alguna = true;
            }
        }
        if !alguna {
            return Err(Error::EstadoInvalido);
        }
        Ok(pedido)
    }

    // ---------------------------------------------------------------
    // Disputas
    // ---------------------------------------------------------------

    /// El cliente o el proveedor abre una disputa por una fase: su dinero queda congelado.
    pub fn abrir_disputa(env: Env, quien: Address, id: u64, fase: u32) -> Result<Pedido, Error> {
        quien.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        exigir(pedido.cliente == quien || pedido.proveedor == quien)?;
        let mut f = leer_fase(&pedido, fase)?;
        exigir_estado(&f, &[EstadoFase::EnCurso, EstadoFase::Entregada])?;
        f.estado = EstadoFase::EnDisputa;
        f.disputa_desde = env.ledger().timestamp();
        cambiar_fase(&env, id, &mut pedido, fase, f);
        Ok(pedido)
    }

    /// El árbitro resuelve la disputa de una fase: a favor del cliente, del proveedor o 50/50.
    pub fn resolver(env: Env, arbitro: Address, id: u64, fase: u32, resultado: Resultado) -> Result<Pedido, Error> {
        let config = leer_config(&env);
        exigir(arbitro == config.arbitro)?;
        arbitro.require_auth();
        let mut pedido = leer_pedido(&env, id)?;
        let f = leer_fase(&pedido, fase)?;
        exigir_estado(&f, &[EstadoFase::EnDisputa])?;
        cerrar_disputa(&env, id, &mut pedido, fase, f, resultado);
        Ok(pedido)
    }

    /// Si el árbitro no resolvió a tiempo, CUALQUIERA reparte la fase 50/50.
    pub fn resolver_por_vencimiento(env: Env, id: u64, fase: u32) -> Result<Pedido, Error> {
        let mut pedido = leer_pedido(&env, id)?;
        let f = leer_fase(&pedido, fase)?;
        exigir_estado(&f, &[EstadoFase::EnDisputa])?;
        if env.ledger().timestamp() <= f.disputa_desde.saturating_add(pedido.plazo_disputa_seg) {
            return Err(Error::PlazoNoVencido);
        }
        cerrar_disputa(&env, id, &mut pedido, fase, f, Resultado::Mitad);
        Ok(pedido)
    }

    // ---------------------------------------------------------------
    // Vencimientos (los puede ejecutar cualquiera: el dinero va a quien corresponde)
    // ---------------------------------------------------------------

    /// El proveedor entregó y el cliente no respondió en el plazo de revisión: el proveedor cobra la fase.
    pub fn cobrar_por_vencimiento(env: Env, id: u64, fase: u32) -> Result<Pedido, Error> {
        let mut pedido = leer_pedido(&env, id)?;
        let mut f = leer_fase(&pedido, fase)?;
        exigir_estado(&f, &[EstadoFase::Entregada])?;
        if env.ledger().timestamp() <= f.entregada_en.saturating_add(pedido.plazo_revision_seg) {
            return Err(Error::PlazoNoVencido);
        }
        pagar_proveedor(&env, &pedido, f.monto);
        f.estado = EstadoFase::Liberada;
        cambiar_fase(&env, id, &mut pedido, fase, f);
        Ok(pedido)
    }

    /// La fase venció sin entrega: el cliente recupera esa fase y las siguientes que no se entregaron.
    /// No aplica mientras una fase anterior esté en disputa (esas fases están esperando).
    pub fn reembolsar_por_vencimiento(env: Env, id: u64, fase: u32) -> Result<Pedido, Error> {
        let mut pedido = leer_pedido(&env, id)?;
        let f = leer_fase(&pedido, fase)?;
        exigir_estado(&f, &[EstadoFase::EnCurso])?;
        if env.ledger().timestamp() <= f.fecha_limite {
            return Err(Error::PlazoNoVencido);
        }
        for i in 0..fase {
            if pedido.fases.get_unchecked(i).estado == EstadoFase::EnDisputa {
                return Err(Error::FaseAnteriorPendiente);
            }
        }
        for i in fase..pedido.fases.len() {
            let mut g = pedido.fases.get_unchecked(i);
            if g.estado == EstadoFase::EnCurso {
                reembolsar_cliente(&env, &pedido, g.monto);
                g.estado = EstadoFase::Reembolsada;
                cambiar_fase(&env, id, &mut pedido, i, g);
            }
        }
        Ok(pedido)
    }

    /// Mantiene vivo el pedido en la red (los datos de Soroban caducan si no se renuevan). Cualquiera la puede llamar.
    pub fn extender(env: Env, id: u64) -> Result<(), Error> {
        let clave = Clave::Pedido(id);
        if !env.storage().persistent().has(&clave) {
            return Err(Error::PedidoNoExiste);
        }
        env.storage().persistent().extend_ttl(&clave, TTL_UMBRAL, TTL_EXTENDER);
        extender_instancia(&env);
        Ok(())
    }

    // ---------------------------------------------------------------
    // Configuración (solo el admin)
    // ---------------------------------------------------------------

    pub fn set_comision(env: Env, admin: Address, bps: u32) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        if bps > COMISION_MAX_BPS {
            return Err(Error::ComisionInvalida);
        }
        Ok(actualizar_config(&env, |c| c.comision_bps = bps))
    }

    pub fn set_comision_directo(env: Env, admin: Address, bps: u32) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        if bps > COMISION_MAX_BPS {
            return Err(Error::ComisionInvalida);
        }
        Ok(actualizar_config(&env, |c| c.comision_directo_bps = bps))
    }

    pub fn set_plazo_revision(env: Env, admin: Address, seg: u64) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        Ok(actualizar_config(&env, |c| c.plazo_revision_seg = seg))
    }

    pub fn set_plazo_disputa(env: Env, admin: Address, seg: u64) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        Ok(actualizar_config(&env, |c| c.plazo_disputa_seg = seg))
    }

    pub fn set_tope(env: Env, admin: Address, tope: i128) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        if tope < 0 {
            return Err(Error::MontoInvalido);
        }
        Ok(actualizar_config(&env, |c| c.tope_pedido = tope))
    }

    pub fn set_tesoreria(env: Env, admin: Address, cuenta: Address) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        Ok(actualizar_config(&env, |c| c.tesoreria = cuenta))
    }

    pub fn set_arbitro(env: Env, admin: Address, arbitro: Address) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        Ok(actualizar_config(&env, |c| c.arbitro = arbitro))
    }

    /// Cambiar el admin: firman el admin actual y el nuevo (así no se pierde por un error de tipeo).
    pub fn set_admin(env: Env, admin: Address, nuevo: Address) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        nuevo.require_auth();
        Ok(actualizar_config(&env, |c| c.admin = nuevo))
    }

    /// Pausa de emergencia: frena pedidos y pagos directos nuevos. Lo demás sigue funcionando.
    pub fn pausar(env: Env, admin: Address) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        Ok(actualizar_config(&env, |c| c.pausado = true))
    }

    pub fn reanudar(env: Env, admin: Address) -> Result<Config, Error> {
        exigir_admin(&env, &admin)?;
        Ok(actualizar_config(&env, |c| c.pausado = false))
    }

    // ---------------------------------------------------------------
    // Actualizaciones con aviso
    // ---------------------------------------------------------------

    /// Propone un código nuevo: recién se puede ejecutar dentro de 7 días (todos lo ven en la red).
    pub fn proponer_actualizacion(env: Env, admin: Address, wasm_hash: BytesN<32>) -> Result<Actualizacion, Error> {
        exigir_admin(&env, &admin)?;
        let a = Actualizacion { wasm_hash: wasm_hash.clone(), ejecutable_desde: env.ledger().timestamp().saturating_add(AVISO_ACTUALIZACION_SEG) };
        env.storage().instance().set(&Clave::Actualizacion, &a);
        extender_instancia(&env);
        ActualizacionPropuesta { wasm_hash, ejecutable_desde: a.ejecutable_desde }.publish(&env);
        Ok(a)
    }

    pub fn cancelar_actualizacion(env: Env, admin: Address) -> Result<(), Error> {
        exigir_admin(&env, &admin)?;
        if !env.storage().instance().has(&Clave::Actualizacion) {
            return Err(Error::SinActualizacion);
        }
        env.storage().instance().remove(&Clave::Actualizacion);
        Ok(())
    }

    /// Ejecuta la actualización propuesta, si ya pasaron los días de aviso.
    pub fn ejecutar_actualizacion(env: Env, admin: Address) -> Result<(), Error> {
        exigir_admin(&env, &admin)?;
        let a: Actualizacion = env.storage().instance().get(&Clave::Actualizacion).ok_or(Error::SinActualizacion)?;
        if env.ledger().timestamp() < a.ejecutable_desde {
            return Err(Error::AvisoNoCumplido);
        }
        env.storage().instance().remove(&Clave::Actualizacion);
        env.deployer().update_current_contract(ContractExecutable::Wasm(a.wasm_hash));
        Ok(())
    }

    // ---------------------------------------------------------------
    // Lectura
    // ---------------------------------------------------------------

    pub fn pedido(env: Env, id: u64) -> Result<Pedido, Error> {
        leer_pedido(&env, id)
    }

    pub fn pago_directo(env: Env, id: u64) -> Result<PagoDirectoHecho, Error> {
        env.storage().persistent().get(&Clave::Directo(id)).ok_or(Error::PedidoNoExiste)
    }

    pub fn config(env: Env) -> Config {
        leer_config(&env)
    }

    pub fn actualizacion(env: Env) -> Option<Actualizacion> {
        env.storage().instance().get(&Clave::Actualizacion)
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
        arbitro: config.arbitro.clone(),
        tesoreria: config.tesoreria.clone(),
        comision_bps: config.comision_bps,
        comision_directo_bps: config.comision_directo_bps,
        plazo_revision_seg: config.plazo_revision_seg,
        plazo_disputa_seg: config.plazo_disputa_seg,
        tope_pedido: config.tope_pedido,
        pausado: config.pausado,
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

fn exigir_sin_pausa(config: &Config) -> Result<(), Error> {
    if config.pausado {
        Err(Error::Pausado)
    } else {
        Ok(())
    }
}

fn exigir_tope(config: &Config, monto: i128) -> Result<(), Error> {
    if config.tope_pedido > 0 && monto > config.tope_pedido {
        Err(Error::TopeSuperado)
    } else {
        Ok(())
    }
}

fn exigir_estado(f: &Fase, permitidos: &[EstadoFase]) -> Result<(), Error> {
    if permitidos.contains(&f.estado) {
        Ok(())
    } else {
        Err(Error::EstadoInvalido)
    }
}

fn leer_pedido(env: &Env, id: u64) -> Result<Pedido, Error> {
    env.storage().persistent().get(&Clave::Pedido(id)).ok_or(Error::PedidoNoExiste)
}

fn leer_fase(pedido: &Pedido, fase: u32) -> Result<Fase, Error> {
    pedido.fases.get(fase).ok_or(Error::FaseNoExiste)
}

fn guardar(env: &Env, id: u64, pedido: &Pedido) {
    let clave = Clave::Pedido(id);
    env.storage().persistent().set(&clave, pedido);
    env.storage().persistent().extend_ttl(&clave, TTL_UMBRAL, TTL_EXTENDER);
    extender_instancia(env);
}

/// Guarda el cambio de una fase y lo avisa con un evento.
fn cambiar_fase(env: &Env, id: u64, pedido: &mut Pedido, fase: u32, f: Fase) {
    let estado = f.estado;
    let monto = f.monto;
    pedido.fases.set(fase, f);
    guardar(env, id, pedido);
    FaseCambio { id, fase, estado, monto }.publish(env);
}

/// Corre las fechas límite de las fases siguientes que siguen en curso (después de cambios o de una disputa).
fn correr_siguientes(env: &Env, id: u64, pedido: &mut Pedido, fase: u32, segundos: u64) {
    if segundos == 0 {
        return;
    }
    for i in (fase + 1)..pedido.fases.len() {
        let mut g = pedido.fases.get_unchecked(i);
        if g.estado == EstadoFase::EnCurso {
            g.fecha_limite = g.fecha_limite.saturating_add(segundos);
            pedido.fases.set(i, g);
        }
    }
    guardar(env, id, pedido);
}

fn cerrar_disputa(env: &Env, id: u64, pedido: &mut Pedido, fase: u32, mut f: Fase, resultado: Resultado) {
    match resultado {
        Resultado::Proveedor => pagar_proveedor(env, pedido, f.monto),
        Resultado::Cliente => reembolsar_cliente(env, pedido, f.monto),
        Resultado::Mitad => {
            let mitad = f.monto / 2;
            pagar_proveedor(env, pedido, mitad);
            reembolsar_cliente(env, pedido, f.monto - mitad);
        }
    }
    let espera = env.ledger().timestamp().saturating_sub(f.disputa_desde);
    f.estado = EstadoFase::Resuelta;
    f.ganador = match resultado {
        Resultado::Cliente => Ganador::Cliente,
        Resultado::Proveedor => Ganador::Proveedor,
        Resultado::Mitad => Ganador::Mitad,
    };
    cambiar_fase(env, id, pedido, fase, f);
    // Las fases siguientes esperaron la disputa: sus fechas se corren lo mismo que duró.
    correr_siguientes(env, id, pedido, fase, espera);
}

fn extender_instancia(env: &Env) {
    env.storage().instance().extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
}

/// Comisión en unidades del token, redondeada hacia abajo.
pub fn calcular_comision(monto: i128, comision_bps: u32) -> i128 {
    monto * comision_bps as i128 / BPS
}

fn pagar_proveedor(env: &Env, pedido: &Pedido, monto: i128) {
    if monto <= 0 {
        return;
    }
    let config = leer_config(env);
    let tok = token::Client::new(env, &config.token);
    let contrato = env.current_contract_address();
    let comision = calcular_comision(monto, pedido.comision_bps);
    tok.transfer(&contrato, &pedido.proveedor, &(monto - comision));
    if comision > 0 {
        tok.transfer(&contrato, &config.tesoreria, &comision);
    }
}

fn reembolsar_cliente(env: &Env, pedido: &Pedido, monto: i128) {
    if monto <= 0 {
        return;
    }
    let config = leer_config(env);
    token::Client::new(env, &config.token).transfer(&env.current_contract_address(), &pedido.cliente, &monto);
}

mod test;
