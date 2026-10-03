#![no_std]
//! "USDC de prueba" de Cryptoville: token SEP-41 que emite el admin, SOLO para testnet.
//!
//! Stellar Lab puede subir y desplegar contratos .wasm, pero no puede desplegar el contrato
//! de un Stellar Asset clásico. Por eso el dinero de prueba es este contrato: se despliega y
//! se emite (mint) desde Stellar Lab, y el escrow lo usa con la interfaz estándar de tokens.
//! En mainnet se usa el USDC real (su contrato SAC) y este contrato deja de usarse.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token::TokenInterface,
    Address, Env, MuxedAddress, String,
};

const DIA_EN_LEDGERS: u32 = 17_280;
const TTL_UMBRAL: u32 = 30 * DIA_EN_LEDGERS;
const TTL_EXTENDER: u32 = 120 * DIA_EN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    MontoNegativo = 1,
    SaldoInsuficiente = 2,
    PermisoInsuficiente = 3,
    VencimientoInvalido = 4,
}

#[contracttype]
#[derive(Clone)]
struct Permiso {
    monto: i128,
    vence_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
enum Clave {
    Admin,
    Decimales,
    Nombre,
    Simbolo,
    Saldo(Address),
    Permiso(Address, Address),
}

// Eventos con los mismos nombres que usa el estándar de tokens (SEP-41).
#[contractevent(topics = ["transfer"])]
pub struct Transferencia {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent(topics = ["mint"])]
pub struct Emision {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent(topics = ["burn"])]
pub struct Quema {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contractevent(topics = ["approve"])]
pub struct Aprobacion {
    #[topic]
    pub from: Address,
    #[topic]
    pub spender: Address,
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contract]
pub struct UsdcPrueba;

#[contractimpl]
impl UsdcPrueba {
    /// Ejemplo: admin = wallet emisora, decimales = 7, nombre = "USDC de prueba", simbolo = "USDC".
    pub fn __constructor(env: Env, admin: Address, decimales: u32, nombre: String, simbolo: String) {
        let i = env.storage().instance();
        i.set(&Clave::Admin, &admin);
        i.set(&Clave::Decimales, &decimales);
        i.set(&Clave::Nombre, &nombre);
        i.set(&Clave::Simbolo, &simbolo);
        i.extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
    }

    /// Emite tokens nuevos (solo el admin). Así se reparte el dinero de prueba.
    pub fn mint(env: Env, to: Address, amount: i128) {
        exigir_positivo(&env, amount);
        admin(&env).require_auth();
        sumar(&env, &to, amount);
        Emision { to, amount }.publish(&env);
    }

    pub fn set_admin(env: Env, nuevo: Address) {
        admin(&env).require_auth();
        env.storage().instance().set(&Clave::Admin, &nuevo);
    }

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }
}

#[contractimpl]
impl TokenInterface for UsdcPrueba {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        leer_permiso(&env, &from, &spender).monto
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        exigir_positivo(&env, amount);
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic_with_error!(&env, Error::VencimientoInvalido);
        }
        let clave = Clave::Permiso(from.clone(), spender.clone());
        env.storage().temporary().set(&clave, &Permiso { monto: amount, vence_ledger: expiration_ledger });
        if amount > 0 {
            let vida = expiration_ledger.saturating_sub(env.ledger().sequence());
            env.storage().temporary().extend_ttl(&clave, vida, vida);
        }
        Aprobacion { from, spender, amount, expiration_ledger }.publish(&env);
    }

    fn balance(env: Env, id: Address) -> i128 {
        saldo(&env, &id)
    }

    fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        exigir_positivo(&env, amount);
        let to = to.address();
        restar(&env, &from, amount);
        sumar(&env, &to, amount);
        Transferencia { from, to, amount }.publish(&env);
    }

    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        exigir_positivo(&env, amount);
        gastar_permiso(&env, &from, &spender, amount);
        restar(&env, &from, amount);
        sumar(&env, &to, amount);
        Transferencia { from, to, amount }.publish(&env);
    }

    fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        exigir_positivo(&env, amount);
        restar(&env, &from, amount);
        Quema { from, amount }.publish(&env);
    }

    fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        exigir_positivo(&env, amount);
        gastar_permiso(&env, &from, &spender, amount);
        restar(&env, &from, amount);
        Quema { from, amount }.publish(&env);
    }

    fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&Clave::Decimales).unwrap()
    }

    fn name(env: Env) -> String {
        env.storage().instance().get(&Clave::Nombre).unwrap()
    }

    fn symbol(env: Env) -> String {
        env.storage().instance().get(&Clave::Simbolo).unwrap()
    }
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&Clave::Admin).unwrap()
}

fn exigir_positivo(env: &Env, monto: i128) {
    if monto < 0 {
        panic_with_error!(env, Error::MontoNegativo);
    }
}

fn saldo(env: &Env, id: &Address) -> i128 {
    let clave = Clave::Saldo(id.clone());
    match env.storage().persistent().get::<_, i128>(&clave) {
        Some(s) => {
            env.storage().persistent().extend_ttl(&clave, TTL_UMBRAL, TTL_EXTENDER);
            s
        }
        None => 0,
    }
}

fn guardar_saldo(env: &Env, id: &Address, monto: i128) {
    let clave = Clave::Saldo(id.clone());
    env.storage().persistent().set(&clave, &monto);
    env.storage().persistent().extend_ttl(&clave, TTL_UMBRAL, TTL_EXTENDER);
    env.storage().instance().extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
}

fn sumar(env: &Env, id: &Address, monto: i128) {
    let nuevo = saldo(env, id).checked_add(monto).expect("desborde de saldo");
    guardar_saldo(env, id, nuevo);
}

fn restar(env: &Env, id: &Address, monto: i128) {
    let actual = saldo(env, id);
    if actual < monto {
        panic_with_error!(env, Error::SaldoInsuficiente);
    }
    guardar_saldo(env, id, actual - monto);
}

fn leer_permiso(env: &Env, from: &Address, spender: &Address) -> Permiso {
    let p: Option<Permiso> = env.storage().temporary().get(&Clave::Permiso(from.clone(), spender.clone()));
    match p {
        Some(p) if p.vence_ledger >= env.ledger().sequence() => p,
        _ => Permiso { monto: 0, vence_ledger: 0 },
    }
}

fn gastar_permiso(env: &Env, from: &Address, spender: &Address, monto: i128) {
    let p = leer_permiso(env, from, spender);
    if p.monto < monto {
        panic_with_error!(env, Error::PermisoInsuficiente);
    }
    if monto > 0 {
        env.storage().temporary().set(
            &Clave::Permiso(from.clone(), spender.clone()),
            &Permiso { monto: p.monto - monto, vence_ledger: p.vence_ledger },
        );
    }
}

mod test;
