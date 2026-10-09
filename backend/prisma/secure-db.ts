import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function secureDatabase() {
  console.log('🛡️ Asegurando base de datos en Supabase...');

  const tables = [
    'User',
    'CashRegister',
    'CashShift',
    'CashMovement',
    'Category',
    'Product',
    'Sale',
    'SaleDetail',
    'KardexMovement',
  ];

  // 1. Habilitar Row Level Security (RLS) en todas las tablas
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    console.log(`✅ RLS activado en tabla "${table}"`);
  }

  // 2. Revocar permisos de lectura/escritura a los roles públicos anónimos de Supabase (anon y authenticated)
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`);
  console.log('✅ Permisos en tablas revocados para anon y authenticated');

  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;`);
  console.log('✅ Permisos en secuencias revocados para anon y authenticated');

  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;`);
  console.log('✅ Permisos en funciones revocados para anon y authenticated');

  console.log('🔒 Acceso público a la API REST de Supabase revocado por completo.');
  console.log('🎉 Tu base de datos ahora está 100% blindada. Solo tu backend de NestJS tiene acceso.');
}

secureDatabase()
  .catch((e) => {
    console.error('❌ Error asegurando la base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
