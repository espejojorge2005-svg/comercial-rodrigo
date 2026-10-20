import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function secureDatabase() {
  console.log('🛡️ Asegurando base de datos en Supabase...');

  const tables = [
    'User',
    'CashRegister',
    'ReceiptSequence',
    'CashShift',
    'CashMovement',
    'Category',
    'Product',
    'Sale',
    'SaleDetail',
    'KardexMovement',
    'StoreConfig',
    'CreditNote',
  ];

  // 1. Habilitar Row Level Security (RLS) y crear política explícita en todas las tablas
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Backend service access only" ON "${table}";`);
    await prisma.$executeRawUnsafe(`CREATE POLICY "Backend service access only" ON "${table}" FOR ALL TO service_role USING (true) WITH CHECK (true);`);
    console.log(`✅ RLS y política de protección activados en tabla "${table}"`);
  }

  // 2. Revocar permisos de lectura/escritura a los roles públicos anónimos de Supabase (anon y authenticated)
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`);
  console.log('✅ Permisos en tablas revocados para anon y authenticated');

  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;`);
  console.log('✅ Permisos en secuencias revocados para anon y authenticated');

  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;`);
  console.log('✅ Permisos en funciones revocados para anon y authenticated');

  // 3. Crear índices en claves foráneas para resolver advertencias de rendimiento
  const indexQueries = [
    `CREATE INDEX IF NOT EXISTS "idx_cashmovement_cashshiftid" ON "CashMovement"("cashShiftId");`,
    `CREATE INDEX IF NOT EXISTS "idx_cashshift_cashregisterid" ON "CashShift"("cashRegisterId");`,
    `CREATE INDEX IF NOT EXISTS "idx_cashshift_userid" ON "CashShift"("userId");`,
    `CREATE INDEX IF NOT EXISTS "idx_receiptsequence_cashregisterid" ON "ReceiptSequence"("cashRegisterId");`,
    `CREATE INDEX IF NOT EXISTS "idx_product_categoryid" ON "Product"("categoryId");`,
    `CREATE INDEX IF NOT EXISTS "idx_sale_cashshiftid" ON "Sale"("cashShiftId");`,
    `CREATE INDEX IF NOT EXISTS "idx_sale_userid" ON "Sale"("userId");`,
    `CREATE INDEX IF NOT EXISTS "idx_sale_voidedbyadminid" ON "Sale"("voidedByAdminId");`,
    `CREATE INDEX IF NOT EXISTS "idx_saledetail_saleid" ON "SaleDetail"("saleId");`,
    `CREATE INDEX IF NOT EXISTS "idx_saledetail_productid" ON "SaleDetail"("productId");`,
    `CREATE INDEX IF NOT EXISTS "idx_kardex_productid" ON "KardexMovement"("productId");`,
    `CREATE INDEX IF NOT EXISTS "idx_kardex_userid" ON "KardexMovement"("userId");`,
    `CREATE INDEX IF NOT EXISTS "idx_creditnote_cashshiftid" ON "CreditNote"("cashShiftId");`,
    `CREATE INDEX IF NOT EXISTS "idx_creditnote_adminid" ON "CreditNote"("adminId");`,
  ];

  for (const q of indexQueries) {
    await prisma.$executeRawUnsafe(q);
  }
  console.log('✅ Índices de claves foráneas creados con éxito');

  console.log('🔒 Acceso público a la API REST de Supabase revocado por completo.');
  console.log('🎉 Tu base de datos ahora está 100% blindada y optimizada. Solo tu backend de NestJS tiene acceso.');
}

secureDatabase()
  .catch((e) => {
    console.error('❌ Error asegurando la base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
