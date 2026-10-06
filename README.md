# Cryptoville

**Un pueblo digital donde las personas ofrecen sus servicios, los encuentran y se pagan de forma segura con Stellar.**

Recorres un pueblo en 2D, dibujado en vectores, con cuatro villas (**Creativo, Tech, Audiovisual y Academy**), donde cada proveedor tiene su local. Entras, ves sus servicios, hablas con él y lo contratas. Cada persona arma su personaje y cada proveedor decora su casa por fuera y por dentro.

Funciona para los dos lados con un interruptor arriba al centro, que cambia el **modo de la villa**:
- **«Quiero contratar»:** las casas son los locales de los proveedores.
- **«Quiero trabajar»:** las mismas villas muestran una casa por cada cartel **«Se busca»** (lo que alguien necesita). Entras y mandas tu propuesta. El pago queda **en garantía en un contrato inteligente de Soroban**: se libera al proveedor cuando confirmas, o vuelve a ti si no entrega. Si hay un desacuerdo, el equipo de Cryptoville actúa como árbitro. Cada usuario construye su **reputación** con reseñas ligadas a pagos reales.

Primera versión en **testnet**. El contrato se despliega y se usa **solo desde [Stellar Lab](https://lab.stellar.org)**: la app no se conecta a servidores de Stellar.

## Cómo está hecho

| Parte | Tecnología | Carpeta |
|---|---|---|
| Contrato de escrow + token «USDC de prueba» | Rust + Soroban SDK 28 | `contracts/` |
| Web: villas 2D y paneles | React 19 + Vite + Phaser 3 (arte vectorial en SVG) + Stellar Wallets Kit | `apps/web/` |
| API | NestJS 11 + Prisma 7 | `apps/api/` |
| Base de datos, tiempo real y fotos | Supabase (Postgres + RLS, Realtime, Storage) | migraciones en `apps/api/prisma/` |
| Código compartido | TypeScript: estados del pedido, contrato, enlaces al Lab, villas y categorías, catálogo de personajes y casas, datos curiosos | `packages/shared/` |
| Despliegue | Docker Compose + Caddy + sslip.io (VPS Ubuntu, también ARM) | `deploy/` |

**Regla de datos:** la web **lee** de Supabase (llave pública + RLS) y **escribe** a través de la API.

Documentación:
- [Descripción](docs/descripcion.md)
- [Arquitectura](docs/arquitectura.md)
- [Guía de Stellar Lab](docs/guia-stellar-lab.md)
- [Guía de Supabase](docs/guia-supabase.md)
- [Despliegue en el VPS](docs/despliegue-vps.md)
- [Roadmap](docs/roadmap.md)

## Correrlo en tu PC

Necesitas Node 22 o superior, Docker Desktop abierto y, para los contratos, Rust con el target `wasm32v1-none`.

```bash
npm install
npm run setup
npm run dev
```

- `npm run setup` levanta Supabase local, crea el `.env`, aplica las migraciones, genera las wallets de ejemplo y carga los datos.
- `npm run dev` levanta la API en el puerto 3000 y la web en el 5173.

Abre <http://localhost:5173>.

**Para entrar:** con Freighter en testnet o, en modo desarrollo, con la opción *«entrar con una llave de prueba»*. En ese caso pega la llave secreta de un usuario de `.seed-keys.json`.

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas de `shared`, de la API (contra Supabase local) y de la web |
| `cd contracts && cargo test` | Pruebas de los contratos |
| `npm run contract:build` | Compila los contratos a `contracts/dist/*.wasm` |
| `npm run db:seed` | Vuelve a cargar los datos de ejemplo |
| `npm run db:reset` | Borra la base local y la vuelve a crear con los datos de ejemplo |
| `npm run map:generate` | Regenera el mapa del pueblo anterior (`apps/web/public/assets/mapas/pueblo.json`, editable en [Tiled](https://www.mapeditor.org/)). Las villas nuevas no lo usan: su plano está en `apps/web/src/game/plano.ts` |
| `npm run supabase:stop` | Apaga Supabase local |

## Desplegar

1. Crea el proyecto de Supabase: [guía](docs/guia-supabase.md).
2. Despliega los contratos en Stellar Lab: [guía](docs/guia-stellar-lab.md).
3. En el VPS:

   ```bash
   sudo bash deploy/setup-vps.sh
   cp .env.example .env
   bash deploy/deploy.sh
   ```

   Llena el `.env` antes del último comando. Más detalle en la [guía de despliegue](docs/despliegue-vps.md).

## Seguridad

- La llave `service_role` de Supabase solo existe en la API.
- RLS impide que la web escriba directamente en cualquier tabla.
- El inicio de sesión es una firma SEP-53 de la wallet, verificada sin conectarse a la red. No hay contraseñas.
- El servidor nunca firma transacciones ni guarda llaves de los usuarios.
- `.env` y `.seed-keys.json` están en `.gitignore`. Las llaves de ejemplo son **solo para testnet**.

## Créditos

- Fuente: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (SIL Open Font License), en toda la interfaz y en los letreros del mapa.
- Arte de las villas, las casas y los personajes: dibujado en vectores para Cryptoville (`apps/web/src/arte/`). Los personajes están inspirados en los de *Tiny Dungeon* de Kenney.
- Gráficos anteriores: **[Kenney](https://kenney.nl)**, paquetes *Tiny Town* y *Tiny Dungeon*, licencia **CC0** (dominio público). Gracias, Kenney. Ya no se usan en el pueblo, pero se conservan con sus licencias en `apps/web/public/assets/kenney/`.
- Fuente anterior de títulos: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) (SIL Open Font License). Ya no se usa.
