-- Sincronización de esquema Prisma con PostgreSQL e integridad fiscal SUNAT
-- Idempotente tanto para despliegues limpios (después de 0_init) como para BDs existentes

-- 1. Columnas faltantes en Sale respecto a schema.prisma (previene error P2022)
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "xmlUrl" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "cdrUrl" TEXT;

-- 2. Índices de rendimiento omitidos en 0_init y nuevos índices de consulta frecuente
CREATE INDEX IF NOT EXISTS "CashShift_openedAt_idx" ON "CashShift"("openedAt");
CREATE INDEX IF NOT EXISTS "CashShift_status_idx" ON "CashShift"("status");
CREATE INDEX IF NOT EXISTS "CashMovement_createdAt_idx" ON "CashMovement"("createdAt");
CREATE INDEX IF NOT EXISTS "CashMovement_type_idx" ON "CashMovement"("type");
CREATE INDEX IF NOT EXISTS "Product_isActive_idx" ON "Product"("isActive");
CREATE INDEX IF NOT EXISTS "Product_expirationDate_idx" ON "Product"("expirationDate");
CREATE INDEX IF NOT EXISTS "Sale_createdAt_idx" ON "Sale"("createdAt");
CREATE INDEX IF NOT EXISTS "Sale_receiptType_idx" ON "Sale"("receiptType");
CREATE INDEX IF NOT EXISTS "Sale_isVoided_idx" ON "Sale"("isVoided");
CREATE INDEX IF NOT EXISTS "Sale_customerDocument_idx" ON "Sale"("customerDocument");
CREATE INDEX IF NOT EXISTS "Sale_emissionStatus_idx" ON "Sale"("emissionStatus");
CREATE INDEX IF NOT EXISTS "KardexMovement_createdAt_idx" ON "KardexMovement"("createdAt");
CREATE INDEX IF NOT EXISTS "KardexMovement_referenceId_idx" ON "KardexMovement"("referenceId");
CREATE INDEX IF NOT EXISTS "CreditNote_createdAt_idx" ON "CreditNote"("createdAt");
CREATE INDEX IF NOT EXISTS "CreditNote_emissionStatus_idx" ON "CreditNote"("emissionStatus");

-- 3. Restricciones de unicidad fiscal en Comprobantes y Notas de Crédito
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_saleNumber_key" ON "Sale"("saleNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_fullReceiptNumber_key" ON "Sale"("fullReceiptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_series_correlativeNumber_key" ON "Sale"("series", "correlativeNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_fullNumber_key" ON "CreditNote"("fullNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_series_correlativeNumber_key" ON "CreditNote"("series", "correlativeNumber");

-- 4. Índices únicos parciales para evitar turnos duplicados abiertos por concurrencia
CREATE UNIQUE INDEX IF NOT EXISTS "CashShift_open_register_unique" ON "CashShift"("cashRegisterId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX IF NOT EXISTS "CashShift_open_user_unique" ON "CashShift"("userId") WHERE "status" = 'OPEN';

