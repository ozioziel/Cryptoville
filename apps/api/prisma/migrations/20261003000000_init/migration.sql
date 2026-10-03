-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('usuario', 'arbitro');

-- CreateEnum
CREATE TYPE "Barrio" AS ENUM ('diseno', 'clases', 'tecnologia');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('solicitado', 'aceptado', 'cancelado', 'pagado', 'entregado', 'en_disputa', 'liberado', 'reembolsado', 'resuelto');

-- CreateEnum
CREATE TYPE "AccionPedido" AS ENUM ('aceptar', 'cancelar', 'crear_pedido', 'marcar_entregado', 'liberar', 'rechazar', 'abrir_disputa', 'resolver', 'reembolsar_por_vencimiento', 'cobrar_por_vencimiento');

-- CreateEnum
CREATE TYPE "Parte" AS ENUM ('Cliente', 'Proveedor');

-- CreateEnum
CREATE TYPE "TipoAviso" AS ENUM ('nuevo_pedido', 'pedido_aceptado', 'te_toca_pagar', 'te_toca_entregar', 'te_toca_liberar', 'te_toca_verificar', 'disputa_abierta', 'disputa_resuelta', 'pedido_cerrado', 'nuevo_mensaje');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "direccion" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "bio" TEXT,
    "avatar" INTEGER NOT NULL DEFAULT 85,
    "rol" "Rol" NOT NULL DEFAULT 'usuario',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desafios_login" (
    "nonce" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "desafios_login_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "locales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "barrio" "Barrio" NOT NULL,
    "lote" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e07a5f',
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "local_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "precio_usdc" DECIMAL(20,7) NOT NULL,
    "dias_entrega" INTEGER NOT NULL,
    "foto_url" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" BIGINT NOT NULL,
    "servicio_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'solicitado',
    "monto_usdc" DECIMAL(20,7) NOT NULL,
    "detalle" TEXT NOT NULL,
    "fecha_limite" TIMESTAMPTZ(3),
    "es_ejemplo" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pasos_pedido" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "accion" "AccionPedido" NOT NULL,
    "hash" TEXT,
    "declarado_por" UUID NOT NULL,
    "verificado_por" UUID,
    "verificado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pasos_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "abierta_por" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "ganador" "Parte",
    "decision" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_en" TIMESTAMPTZ(3),

    CONSTRAINT "disputas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resenas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "destinatario_id" UUID NOT NULL,
    "calificacion" INTEGER NOT NULL,
    "comentario" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resenas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avisos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "pedido_id" UUID,
    "tipo" "TipoAviso" NOT NULL,
    "texto" TEXT NOT NULL,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_direccion_key" ON "usuarios"("direccion");

-- CreateIndex
CREATE INDEX "desafios_login_direccion_idx" ON "desafios_login"("direccion");

-- CreateIndex
CREATE UNIQUE INDEX "locales_usuario_id_key" ON "locales"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "locales_lote_key" ON "locales"("lote");

-- CreateIndex
CREATE INDEX "servicios_local_id_idx" ON "servicios"("local_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");

-- CreateIndex
CREATE INDEX "pedidos_cliente_id_idx" ON "pedidos"("cliente_id");

-- CreateIndex
CREATE INDEX "pedidos_proveedor_id_idx" ON "pedidos"("proveedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "pasos_pedido_hash_key" ON "pasos_pedido"("hash");

-- CreateIndex
CREATE INDEX "pasos_pedido_pedido_id_idx" ON "pasos_pedido"("pedido_id");

-- CreateIndex
CREATE INDEX "mensajes_pedido_id_idx" ON "mensajes"("pedido_id");

-- CreateIndex
CREATE UNIQUE INDEX "disputas_pedido_id_key" ON "disputas"("pedido_id");

-- CreateIndex
CREATE INDEX "resenas_destinatario_id_idx" ON "resenas"("destinatario_id");

-- CreateIndex
CREATE UNIQUE INDEX "resenas_pedido_id_autor_id_key" ON "resenas"("pedido_id", "autor_id");

-- CreateIndex
CREATE INDEX "avisos_usuario_id_leido_idx" ON "avisos"("usuario_id", "leido");

-- AddForeignKey
ALTER TABLE "locales" ADD CONSTRAINT "locales_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasos_pedido" ADD CONSTRAINT "pasos_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasos_pedido" ADD CONSTRAINT "pasos_pedido_declarado_por_fkey" FOREIGN KEY ("declarado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasos_pedido" ADD CONSTRAINT "pasos_pedido_verificado_por_fkey" FOREIGN KEY ("verificado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_abierta_por_fkey" FOREIGN KEY ("abierta_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

