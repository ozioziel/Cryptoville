#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger, token::TokenClient, Address, Env, String};

fn preparar() -> (Env, Address, UsdcPruebaClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(
        UsdcPrueba,
        (admin.clone(), 7u32, String::from_str(&env, "USDC de prueba"), String::from_str(&env, "USDC")),
    );
    let c = UsdcPruebaClient::new(&env, &id);
    (env, admin, c)
}

#[test]
fn metadatos_y_mint() {
    let (env, admin, c) = preparar();
    let tok = TokenClient::new(&env, &c.address);
    assert_eq!(tok.decimals(), 7);
    assert_eq!(tok.symbol(), String::from_str(&env, "USDC"));
    assert_eq!(c.admin(), admin);
    let ana = Address::generate(&env);
    c.mint(&ana, &1_000);
    assert_eq!(tok.balance(&ana), 1_000);
}

#[test]
fn transferencias_y_saldo_insuficiente() {
    let (env, _admin, c) = preparar();
    let tok = TokenClient::new(&env, &c.address);
    let (a, b) = (Address::generate(&env), Address::generate(&env));
    c.mint(&a, &100);
    tok.transfer(&a, &b, &40);
    assert_eq!((tok.balance(&a), tok.balance(&b)), (60, 40));
    let saldo_insuficiente = soroban_sdk::Error::from_contract_error(Error::SaldoInsuficiente as u32);
    let monto_negativo = soroban_sdk::Error::from_contract_error(Error::MontoNegativo as u32);
    let destino: MuxedAddress = b.clone().into();
    assert_eq!(c.try_transfer(&a, &destino, &61), Err(Ok(saldo_insuficiente)));
    assert_eq!(c.try_transfer(&a, &destino, &-1), Err(Ok(monto_negativo)));
}

#[test]
fn permisos() {
    let (env, _admin, c) = preparar();
    env.ledger().set_sequence_number(100);
    let tok = TokenClient::new(&env, &c.address);
    let (a, gastador, b) = (Address::generate(&env), Address::generate(&env), Address::generate(&env));
    c.mint(&a, &100);
    tok.approve(&a, &gastador, &50, &200);
    assert_eq!(tok.allowance(&a, &gastador), 50);
    tok.transfer_from(&gastador, &a, &b, &30);
    assert_eq!(tok.allowance(&a, &gastador), 20);
    assert!(c.try_transfer_from(&gastador, &a, &b, &21).is_err());
    env.ledger().set_sequence_number(201);
    assert_eq!(tok.allowance(&a, &gastador), 0);
}

#[test]
fn quemar() {
    let (env, _admin, c) = preparar();
    let tok = TokenClient::new(&env, &c.address);
    let a = Address::generate(&env);
    c.mint(&a, &10);
    tok.burn(&a, &4);
    assert_eq!(tok.balance(&a), 6);
}

#[test]
fn solo_el_admin_emite() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let id = env.register(
        UsdcPrueba,
        (admin.clone(), 7u32, String::from_str(&env, "USDC de prueba"), String::from_str(&env, "USDC")),
    );
    let c = UsdcPruebaClient::new(&env, &id);
    // Sin firma del admin, mint falla.
    assert!(c.try_mint(&Address::generate(&env), &5).is_err());
}
