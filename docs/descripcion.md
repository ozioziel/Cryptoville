# Cryptoville

**Un pueblo digital donde las personas ofrecen sus servicios, los encuentran y se pagan de forma segura con Stellar.**

## De qué trata

Cryptoville es una plataforma de servicios entre personas. En lugar de buscar en una lista interminable, recorres un pueblo en 2D donde cada proveedor tiene su propio local. Entras, ves qué ofrece, hablas con él y lo contratas ahí mismo.

El pueblo está dividido en **cuatro villas**, una por tipo de servicio. Cada una tiene su arquitectura, su estatua gigante y un edificio central donde se leen datos curiosos (la mayoría sobre Stellar).

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
- **Una forma agradable de descubrir servicios:** un mundo para explorar, en computadora o celular, donde cada proveedor tiene un local con personalidad: arma su casa por fuera y por dentro, y cada persona elige cómo se ve su personaje.

## Contratar y trabajar: los dos lados

Arriba al centro hay un interruptor con dos modos. Al cambiar de modo, la villa entera cambia sus casas (el diseño es el mismo):

| Modo | Para quién | Qué casas hay en la villa |
|---|---|---|
| **Quiero contratar** | Quien necesita un servicio | Los locales de los proveedores, con sus servicios. Si no encuentra lo que busca, publica un **«Se busca»** |
| **Quiero trabajar** | Quien ofrece servicios | Una casa por cada **«Se busca»** abierto, con el cartel en la vitrina y quien lo publicó en la puerta |

- En los dos modos se entra igual a las casas, y el «Lote disponible» sirve para sumar una casa: abrir un local o publicar un «Se busca».
- La lupa de la barra abre la lista del modo en que estás (pestañas "Servicios" y "Se busca").

Cómo funciona un «Se busca»:
1. Cualquiera con sesión lo publica: qué necesita, villa, categoría, presupuesto y para cuándo.
2. Los proveedores con local le mandan su propuesta (precio, días de entrega y un mensaje). Pueden editarla o retirarla.
3. Quien publicó ve cada propuesta con la reputación del proveedor y puede visitar su local.
4. Al elegir una, nace un pedido ya aceptado y desde ahí todo sigue igual: pago en garantía, entrega, disputas y reseñas.

Los avisos de propuestas nuevas, elegidas o no elegidas llegan a la campana.

## Las villas

| Villa | Categorías | Estatua | Edificio central |
|---|---|---|---|
| Creativo | Diseño gráfico, ilustración, animación, UI/UX y branding | Lápiz y pincel | Galería de arte |
| Tech | Desarrollo web, desarrollo móvil, backend, videojuegos y automatización | Chip | Torre de servidores con luces |
| Audiovisual | Fotografía, edición de video, música, cine y sonido | Cámara | Cine |
| Academy | Cursos, mentorías, idiomas, programación y diseño | Libro abierto | Biblioteca con torre de reloj |

- Se viaja entre villas con el selector de abajo a la izquierda, o desde el buscador con «Ir al local».
- Cada villa crece sin límite: tiene tantas casas como proveedores la elijan, y cada casa conserva siempre su lugar.
- El siguiente espacio libre aparece como «Lote disponible».
- Los personajes son personas en vectores. Se combinan libremente tono de piel, peinado, color de pelo, barba, ropa, zapatos, lentes, gorros y un objeto en la mano.

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
2. Si ofreces algo, abres tu local en una de las cuatro villas (Creativo, Tech, Audiovisual o Academy), eliges su categoría, decoras tu casa y publicas tus servicios y precios.
3. Si buscas algo, recorres las villas o usas «Quiero contratar» (por texto, villa, categoría y precio), y revisas la reputación de cada proveedor. Si no lo encuentras, publicas un «Se busca» y eliges entre las propuestas que te lleguen.
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

Primera versión en **testnet** (dinero de prueba), con 5 usuarios de ejemplo repartidos en las cuatro villas, para mostrar el flujo completo: publicar, contratar, pagar en garantía, entregar, liberar el pago y reseñar. El contrato se despliega y se usa desde **Stellar Lab**, donde también se revisan los pagos.
