import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function secureDatabase() {
  console.log('🛡️ Asegurando base de datos PostgreSQL / Supabase...');

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

  // 1. Habilitar Row Level Security (RLS) compatible tanto con Supabase (service_role)
  //    como con roles PostgreSQL estándar de producción (CURRENT_USER).
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Backend service access only" ON "${table}";`);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          EXECUTE 'CREATE POLICY "Backend service access only" ON "${table}" FOR ALL TO service_role, CURRENT_USER USING (true) WITH CHECK (true)';
        ELSE
          EXECUTE 'CREATE POLICY "Backend service access only" ON "${table}" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)';
        END IF;
      END
      $$;
    `);
    console.log(`✅ RLS y política de protección activados en tabla "${table}"`);
  }

  // 2. Si existen los roles públicos de PostgREST en Supabase (anon / authenticated), revocar su acceso directo
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
        REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM authenticated;
      END IF;
    END
    $$;
  `);
  console.log('✅ Permisos públicos revocados para roles externos (si aplican)');

  // 3. Limpiar índices duplicados antiguos (idx_*) que duplicaban los índices administrados por Prisma (*_idx)
  const legacyDuplicateIndexes = [
    'idx_cashmovement_cashshiftid',
    'idx_cashshift_cashregisterid',
    'idx_cashshift_userid',
    'idx_receiptsequence_cashregisterid',
    'idx_product_categoryid',
    'idx_sale_cashshiftid',
    'idx_sale_userid',
    'idx_sale_voidedbyadminid',
    'idx_saledetail_saleid',
    'idx_saledetail_productid',
    'idx_kardex_productid',
    'idx_kardex_userid',
    'idx_creditnote_cashshiftid',
    'idx_creditnote_adminid',
  ];

  for (const idx of legacyDuplicateIndexes) {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${idx}";`);
  }
  console.log('✅ Índices duplicados legacy limpiados');

  // 4. Asegurar índices únicos parciales de concurrencia en turnos abiertos
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "CashShift_open_register_unique" ON "CashShift"("cashRegisterId") WHERE "status" = 'OPEN';`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "CashShift_open_user_unique" ON "CashShift"("userId") WHERE "status" = 'OPEN';`,
  );
  console.log('✅ Índices únicos parciales de turnos abiertos verificados');

  console.log('🎉 Base de datos asegurada y optimizada correctamente.');
}

secureDatabase()
  .catch((e) => {
    console.error('❌ Error asegurando la base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
