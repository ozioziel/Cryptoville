# Roadmap de Cryptoville

| Versión | Qué incluye | Estado |
|---|---|---|
| **v1: demo en testnet** | Pueblo 2D (computadora y celular), locales y servicios, pedidos, escrow en Soroban con fechas límite y árbitro, reputación verificada, chat y avisos en vivo, despliegue en un VPS | **Construida** |
| **v1.1: rediseño visual** | Arte en vectores; 4 villas (Creativo, Tech, Audiovisual, Academy) que crecen sin tope; categorías y filtro por categoría; personajes y casas personalizables; datos curiosos en el edificio central de cada villa | **Construida** |
| **v1.2: los dos lados** | Botones «Quiero contratar» y «Quiero trabajar»; carteles «Se busca» con propuestas de los proveedores; al elegir una propuesta nace un pedido en garantía | **Construida** |
| **v2: la app habla con Stellar** | La web firma y envía las transacciones con la wallet (sin copiar y pegar en el Lab). La API confirma cada paso leyendo los eventos del contrato (indexador) | Pendiente |
| **v3: mainnet** | USDC real (SAC), auditoría del contrato, admin multifirma, términos de uso y revisión legal, dominio propio | Pendiente |
| **v4: comunidad** | Árbitros de la comunidad elegidos por reputación, pagos por etapas (anticipo y resto), ver a otros vecinos caminando en el pueblo, más villas | Ideas |

## Detalle de v2 (siguiente paso recomendado)

- **Web:** Stellar Wallets Kit firma las transacciones del escrow; se elimina el paso de pegar el hash.
- **API:** un *worker* lee los eventos `evento_pedido` del contrato por RPC y actualiza la base. Los pasos se verifican solos.
- **Contrato:** sin cambios. Ya emite los eventos que hacen falta.

## Detalle de v3 (antes de usar dinero real)

- Auditoría de seguridad de `contracts/escrow`.
- Admin del escrow en una cuenta multifirma (más de una persona del equipo).
- Reemplazar el «USDC de prueba» por el contrato SAC del USDC real.
- Revisión legal: custodia de fondos de terceros, términos de uso, privacidad y servicios prohibidos.
- Pasar a un plan pago de Supabase, o respaldos externos, y monitoreo.
