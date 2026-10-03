# Cryptoville

**Un pueblo digital donde las personas ofrecen sus servicios, los encuentran y se pagan de forma segura con Stellar.**

## De qué trata

Cryptoville es una plataforma de servicios entre personas. En lugar de buscar en una lista interminable, recorres un pueblo en 2D donde cada proveedor tiene su propio local. Entras, ves qué ofrece, hablas con él y lo contratas ahí mismo.

El pago se hace con Stellar y queda **en garantía en un contrato inteligente**. El contrato solo puede liberar el dinero al proveedor o devolverlo al cliente, así que nadie puede tomarlo por su cuenta, ni siquiera nosotros.

Cuando el trabajo está hecho y el cliente confirma, el proveedor cobra al instante. Si el proveedor no entrega antes de la fecha límite, el cliente recupera su dinero. Si hay un desacuerdo, **el equipo de Cryptoville actúa como árbitro**: revisa el caso y resuelve a favor de quien tenga la razón.

Además, cada usuario construye su **reputación** con reseñas verificadas, ligadas a pagos reales, para que sepas en quién confiar antes de contratar.

## El problema

Contratar servicios a personas que no conoces implica desconfianza de los dos lados:
- el cliente teme pagar y no recibir nada;
- el proveedor teme trabajar y no cobrar.

Las plataformas que resuelven esto cobran comisiones altas, retienen el dinero durante días y hacen caro cobrar desde otro país.

## La solución

- **Pago en garantía con contrato inteligente:** el dinero solo puede ir al proveedor o volver al cliente.
- **Fechas límite automáticas:**
  - si el proveedor no entrega a tiempo, el cliente se reembolsa;
  - si el cliente no responde en el plazo de revisión, el proveedor cobra.
- **Arbitraje del equipo de Cryptoville,** que únicamente puede resolver a favor de una de las partes, nunca quedarse con el dinero.
- **Reputación verificada:** reseñas que solo puede dejar quien pagó de verdad, con el pago comprobable en Stellar.
- **Cobro inmediato** cuando el trabajo se confirma, sin esperar semanas.
- **Comisiones bajas:** 3% para Cryptoville y fracciones de centavo de la red Stellar.
- **Pagos sin fronteras:** un cliente en un país paga a un proveedor en otro sin bancos de por medio.
- **Una forma agradable de descubrir servicios:** un mundo para explorar, en computadora o celular, donde cada proveedor tiene un local con personalidad.

## Cómo funciona el pago en garantía

| Situación | Quién actúa | Resultado |
|---|---|---|
| Todo salió bien | El cliente libera el pago | El dinero va al proveedor (menos el 3%) |
| El proveedor no entregó a tiempo | El cliente se reembolsa al vencer la fecha límite | El dinero vuelve al cliente |
| El cliente no responde | El proveedor cobra al vencer el plazo de revisión (3 días) | El dinero va al proveedor |
| Hay un desacuerdo | Cualquiera abre una disputa y Cryptoville resuelve | El dinero va a quien tenga la razón |

## Cómo funciona la reputación

- Solo puede reseñar quien completó un pedido con pago en garantía.
- Cada reseña está ligada a una transacción en Stellar, que cualquiera puede comprobar.
- El perfil muestra la calificación, los pedidos completados y las disputas ganadas o perdidas.
- Los niveles son Nuevo, Confiable y Destacado.

## Cómo funciona para el usuario

1. Conectas tu wallet de Stellar y ya tienes cuenta, sin correos ni contraseñas.
2. Si ofreces algo, abres tu local en uno de los tres barrios (Diseño, Clases o Tecnología) con tus servicios y precios.
3. Si buscas algo, recorres los barrios o usas el buscador, y revisas la reputación de cada proveedor.
4. Pides el servicio y el proveedor acepta el precio y la fecha de entrega.
5. Pagas en garantía desde Stellar Lab y el dinero queda retenido en el contrato.
6. Hablan por el chat del pedido y el proveedor entrega.
7. Confirmas y el proveedor cobra.
8. Dejas una reseña que suma a su reputación.
9. Si algo sale mal, abres un reclamo y el equipo de Cryptoville decide.

## Por qué en Stellar

- **Contratos inteligentes (Soroban)** para el pago en garantía, sin depender de oráculos.
- Comisiones de fracciones de centavo y confirmación en segundos.
- Pagos públicos y verificables por cualquiera.
- Monedas estables como USDC, para que nadie cobre en algo que sube y baja de precio.
- Un ecosistema enfocado en pagos y en Latinoamérica, que es justo el uso de Cryptoville.

## Estado actual

Primera versión en **testnet** (dinero de prueba), con 5 usuarios de ejemplo, para mostrar el flujo completo: publicar, contratar, pagar en garantía, entregar, liberar el pago y reseñar. El contrato se despliega y se usa desde **Stellar Lab**, donde también se revisan los pagos.
