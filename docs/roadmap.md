# Roadmap de Cryptoville

| Versión | Qué incluye | Estado |
|---|---|---|
| **v1: demo en testnet** | Pueblo 2D (computadora y celular), locales y servicios, pedidos, escrow en Soroban con fechas límite y árbitro, reputación verificada, chat y avisos en vivo, despliegue en un VPS | **Construida** |
| **v1.1: rediseño visual** | Arte en vectores; 4 villas (Creativo, Tech, Audiovisual, Academy) que crecen sin tope; categorías y filtro por categoría; personajes y casas personalizables; datos curiosos en el edificio central de cada villa | **Construida** |
| **v1.2: los dos lados** | Botones «Quiero contratar» y «Quiero trabajar»; carteles «Se busca» con propuestas de los proveedores; al elegir una propuesta nace un pedido en garantía | **Construida** |
| **v2: la app habla con Stellar** | Firmar dentro de la app (wallet, QR o correo con Pollar), verificación de cada pago con el RPC y sincronización de eventos; contrato v2 con pago directo, garantía y **pagos por etapas** con pruebas por fase (Mux); KYC con insignia, varias wallets, reportar y bloquear, avisos por correo y push; varios locales, sectores, portafolio, personas en línea y chat por cercanía; archivo de reglas, documentos legales y preparación para mainnet | **Construida** (rama `cryptoville-v2`) |
| **v3: mainnet** | Auditoría del contrato v2, cuentas multifirma, revisión legal, USDC real (SAC), proyecto de Supabase nuevo, RPC de mainnet, dominio propio. Lista completa: [mainnet.md](mainnet.md) | Pendiente |
| **v4: comunidad** | **Tribunal de la villa** (jurados de la comunidad para las disputas: idea guardada, sin implementar), más villas, infraestructura paga si hay financiamiento | Ideas |

## Detalle de v2

- **Web:** la wallet firma dentro de la app; pegar el hash en el Lab queda como respaldo.
- **API:** arma las transacciones, las verifica con el RPC y lee los eventos de los dos contratos cada 30 segundos. Una llave de mantenimiento con poco XLM ejecuta los vencimientos del v2.
- **Contrato v2:** `contracts/escrow-v2` ([documento para el auditor](contrato-v2.md)). El v1 sigue igual para los pedidos que ya existen.
- Arquitectura completa: [arquitectura.md](arquitectura.md#v2-qué-cambió).

## Detalle de v3 (antes de usar dinero real)

- Auditoría de seguridad de `contracts/escrow-v2` (y de `contracts/escrow`, si se usa en mainnet).
- Admin del escrow en una cuenta multifirma (más de una persona del equipo).
- Reemplazar el «USDC de prueba» por el contrato SAC del USDC real.
- Revisión legal: custodia de fondos de terceros, términos de uso, privacidad y servicios prohibidos.
- Pasar a un plan pago de Supabase, o respaldos externos, y monitoreo.
