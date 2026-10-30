import { PrismaClient, Role, UnitType, ReceiptType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando siembra de datos iniciales en Supabase...');

  // 1. Crear Cajas Físicas
  const caja1 = await prisma.cashRegister.upsert({
    where: { identifier: 'POS-01' },
    update: {},
    create: {
      name: 'Caja 1',
      identifier: 'POS-01',
      isActive: true,
    },
  });

  const caja2 = await prisma.cashRegister.upsert({
    where: { identifier: 'POS-02' },
    update: {},
    create: {
      name: 'Caja 2',
      identifier: 'POS-02',
      isActive: true,
    },
  });

  console.log('✅ Cajas físicas registradas: Caja 1 y Caja 2');

  // Inicializar secuencias de comprobantes por caja física
  const initialSequences = [
    { cashRegisterId: caja1.id, receiptType: ReceiptType.NOTA_VENTA, series: 'NV01' },
    { cashRegisterId: caja1.id, receiptType: ReceiptType.BOLETA, series: 'B001' },
    { cashRegisterId: caja1.id, receiptType: ReceiptType.FACTURA, series: 'F001' },
    { cashRegisterId: caja2.id, receiptType: ReceiptType.NOTA_VENTA, series: 'NV02' },
    { cashRegisterId: caja2.id, receiptType: ReceiptType.BOLETA, series: 'B002' },
    { cashRegisterId: caja2.id, receiptType: ReceiptType.FACTURA, series: 'F002' },
  ];

  for (const seq of initialSequences) {
    await prisma.receiptSequence.upsert({
      where: { series: seq.series },
      update: {},
      create: {
        cashRegisterId: seq.cashRegisterId,
        receiptType: seq.receiptType,
        series: seq.series,
        currentNumber: 0,
      },
    });
  }
  console.log('✅ Secuencias de comprobantes (NV01, B001, F001, NV02, B002, F002) configuradas');

  // 2. Crear Usuarios (Admin y Cajeros)
  const passwordHashAdmin = await bcrypt.hash('admin123', 10);
  const passwordHashCajero = await bcrypt.hash('cajero123', 10);
  const pinHashAdmin = await bcrypt.hash('1234', 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      name: 'Administrador General',
      username: 'admin',
      password: passwordHashAdmin,
      role: Role.ADMIN,
      pin: pinHashAdmin, // PIN de 4 dígitos hasheado con bcrypt para autorizar anulaciones
      isActive: true,
    },
  });

  const cajero1 = await prisma.user.upsert({
    where: { username: 'cajero1' },
    update: {},
    create: {
      name: 'Rodrigo (Caja 1)',
      username: 'cajero1',
      password: passwordHashCajero,
      role: Role.CAJERO,
      isActive: true,
    },
  });

  const cajero2 = await prisma.user.upsert({
    where: { username: 'cajero2' },
    update: {},
    create: {
      name: 'Cajero 2',
      username: 'cajero2',
      password: passwordHashCajero,
      role: Role.CAJERO,
      isActive: true,
    },
  });

  console.log('✅ Usuarios iniciales creados (admin, cajero1, cajero2)');

  // 3. Crear Categorías iniciales
  const catAbarrotes = await prisma.category.upsert({
    where: { name: 'Abarrotes' },
    update: {},
    create: { name: 'Abarrotes', description: 'Productos básicos de despensa' },
  });

  const catBebidas = await prisma.category.upsert({
    where: { name: 'Bebidas' },
    update: {},
    create: { name: 'Bebidas', description: 'Gaseosas, aguas y jugos' },
  });

  const catLimpieza = await prisma.category.upsert({
    where: { name: 'Limpieza' },
    update: {},
    create: { name: 'Limpieza', description: 'Artículos de higiene y aseo' },
  });

  const catLacteos = await prisma.category.upsert({
    where: { name: 'Lácteos & Perecibles' },
    update: {},
    create: { name: 'Lácteos & Perecibles', description: 'Yogurt, leche, quesos y embutidos' },
  });

  // Fechas de prueba de vencimiento
  const today = new Date();
  const dateExpired = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000); // Vencido hace 2 días
  const dateExpiringSoon = new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000); // Vence en 8 días
  const dateFuture = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000); // Vence en 3 meses

  // 4. Crear Productos iniciales de prueba con precios menor/mayor y stock
  const sampleProducts = [
    {
      barcode: '7750123456789',
      name: 'Arroz Costeño Extra 1kg',
      categoryId: catAbarrotes.id,
      unitType: UnitType.UNIT,
      costPrice: 3.8,
      retailPrice: 4.8,
      wholesalePrice: 4.3,
      wholesaleMinQty: 6,
      currentStock: 100,
      minStock: 20,
      expirationDate: null, // No perecible
    },
    {
      barcode: '7750987654321',
      name: 'Aceite Primor Premium 1L',
      categoryId: catAbarrotes.id,
      unitType: UnitType.UNIT,
      costPrice: 8.5,
      retailPrice: 11.0,
      wholesalePrice: 9.8,
      wholesaleMinQty: 4,
      currentStock: 60,
      minStock: 15,
      expirationDate: null, // No perecible
    },
    {
      barcode: '7750111222333',
      name: 'Inca Kola 1.5L No Retornable',
      categoryId: catBebidas.id,
      unitType: UnitType.UNIT,
      costPrice: 5.2,
      retailPrice: 7.5,
      wholesalePrice: 6.5,
      wholesaleMinQty: 6,
      currentStock: 80,
      minStock: 15,
      expirationDate: null,
    },
    {
      barcode: '7750444555666',
      name: 'Detergente Bolívar 1kg',
      categoryId: catLimpieza.id,
      unitType: UnitType.UNIT,
      costPrice: 7.0,
      retailPrice: 9.5,
      wholesalePrice: 8.5,
      wholesaleMinQty: 3,
      currentStock: 50,
      minStock: 10,
      expirationDate: null,
    },
    {
      barcode: '7750777888999',
      name: 'Yogurt Gloria Fresa 1kg',
      categoryId: catLacteos.id,
      unitType: UnitType.UNIT,
      costPrice: 5.5,
      retailPrice: 7.2,
      wholesalePrice: 6.5,
      wholesaleMinQty: 4,
      currentStock: 24,
      minStock: 6,
      expirationDate: dateExpiringSoon, // Vence en 8 días
    },
    {
      barcode: '7750333222111',
      name: 'Yogurt Laive Vainilla Francesa 1kg',
      categoryId: catLacteos.id,
      unitType: UnitType.UNIT,
      costPrice: 5.8,
      retailPrice: 7.5,
      wholesalePrice: 6.8,
      wholesaleMinQty: 4,
      currentStock: 8,
      minStock: 5,
      expirationDate: dateExpired, // Ya vencido
    },
    {
      barcode: '7750666777888',
      name: 'Leche Evaporada Gloria Azul 400g',
      categoryId: catLacteos.id,
      unitType: UnitType.UNIT,
      costPrice: 3.4,
      retailPrice: 4.2,
      wholesalePrice: 3.8,
      wholesaleMinQty: 6,
      currentStock: 48,
      minStock: 12,
      expirationDate: dateFuture, // Vence en 3 meses
    },
  ];

  for (const prod of sampleProducts) {
    await prisma.product.upsert({
      where: { barcode: prod.barcode },
      update: {},
      create: prod,
    });
  }

  console.log('✅ Productos y categorías de prueba creados exitosamente');
  console.log('🎉 Siembra completada');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
