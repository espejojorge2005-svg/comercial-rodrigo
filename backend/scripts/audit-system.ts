import { PrismaClient, ShiftStatus, ReceiptType, PaymentMethod } from '@prisma/client';

const prisma = new PrismaClient();

async function fullAudit() {
  console.log('=====================================================');
  console.log('🔍 AUDITORÍA DE DATOS Y PRUEBA INTEGRAL DEL SISTEMA');
  console.log('=====================================================\n');

  // 1. Tienda y Usuarios
  const config = await prisma.storeConfig.findFirst();
  console.log(`🏢 Negocio: ${config?.name || 'Comercial Rodrigo'} (RUC: ${config?.ruc || 'N/A'})`);
  console.log(`📍 Dirección: ${config?.address} | Teléfono: ${config?.phone}\n`);

  const users = await prisma.user.findMany({ select: { id: true, name: true, username: true, role: true, isActive: true } });
  console.log('👥 USUARIOS DEL SISTEMA:');
  users.forEach(u => console.log(`   - [${u.role}] ${u.name} (@${u.username}) - Activo: ${u.isActive}`));
  console.log('');

  // 2. Cajas Registradoras y Secuencias
  const registers = await prisma.cashRegister.findMany({
    include: { receiptSequences: true }
  });
  console.log('💻 CAJAS FÍSICAS Y CORRELATIVOS:');
  registers.forEach(r => {
    console.log(`   - Caja: ${r.name} (${r.identifier}) - Activa: ${r.isActive}`);
    r.receiptSequences.forEach(s => {
      console.log(`     * Serie: ${s.series} (${s.receiptType}) -> Correlativo Actual: ${s.currentNumber}`);
    });
  });
  console.log('');

  // 3. Inventario y Kardex
  const products = await prisma.product.findMany({
    include: { category: true }
  });
  console.log(`📦 INVENTARIO ACTUAL (${products.length} productos):`);
  let totalStockCost = 0;
  let totalStockRetail = 0;
  let stockAlerts = 0;

  products.forEach(p => {
    const stock = Number(p.currentStock);
    const cost = Number(p.costPrice);
    const retail = Number(p.retailPrice);
    const wholesale = p.wholesalePrice ? Number(p.wholesalePrice) : null;
    totalStockCost += stock * cost;
    totalStockRetail += stock * retail;
    const isLow = stock <= Number(p.minStock);
    if (isLow) stockAlerts++;

    console.log(`   - [${p.category?.name || 'General'}] ${p.name} | Stock: ${stock} ${p.unitType} (Min: ${p.minStock}) | Costo: S/ ${cost.toFixed(2)} | Venta: S/ ${retail.toFixed(2)} ${wholesale ? `| Mayor: S/ ${wholesale.toFixed(2)} (desde ${p.wholesaleMinQty})` : ''} ${isLow ? '⚠️ [STOCK BAJO]' : '✅'}`);
  });

  console.log(`\n   💰 VALORIZACIÓN TOTAL DEL INVENTARIO:`);
  console.log(`   - Valor total a Costo de Compra: S/ ${totalStockCost.toFixed(2)}`);
  console.log(`   - Valor total a Precio Venta:    S/ ${totalStockRetail.toFixed(2)}`);
  console.log(`   - Ganancia potencial estimada:   S/ ${(totalStockRetail - totalStockCost).toFixed(2)} (${totalStockCost > 0 ? ((totalStockRetail - totalStockCost) / totalStockCost * 100).toFixed(1) : 0}% margen)`);
  console.log(`   - Alertas de stock crítico:      ${stockAlerts} productos\n`);

  // 4. Verificación de Ventas
  const sales = await prisma.sale.findMany({
    include: {
      items: { include: { product: true } },
      cashShift: { include: { cashRegister: true } },
      user: { select: { name: true } },
      creditNote: true,
      voidedByAdmin: { select: { name: true } },
    },
    orderBy: { saleNumber: 'asc' }
  });

  console.log(`🧾 HISTORIAL DE VENTAS REGISTRADAS (${sales.length} ventas):`);
  let validSalesCount = 0;
  let voidedSalesCount = 0;
  let totalValidAmount = 0;
  let totalCashPaid = 0;
  let totalDigitalPaid = 0;
  let totalCostOfGoodsSold = 0;
  let totalIgv = 0;
  let totalTaxableBase = 0;
  let itemsIntegrityIssues = 0;

  for (const s of sales) {
    const total = Number(s.totalAmount);
    const cash = Number(s.cashPaid);
    const digital = Number(s.digitalPaid);
    const itemsTotal = s.items.reduce((acc, item) => acc + Number(item.subtotal), 0);
    const saleCost = s.items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.costPriceSnapshot)), 0);

    // Comprobación de integridad matemática del ticket:
    const diff = Math.abs(total - itemsTotal);
    if (diff > 0.05) {
      console.warn(`   ❌ DISCREPANCIA EN VENTA #${s.saleNumber} (${s.fullReceiptNumber}): Total cabecera S/ ${total} vs suma de items S/ ${itemsTotal}`);
      itemsIntegrityIssues++;
    }

    if (s.isVoided) {
      voidedSalesCount++;
      console.log(`   ❌ [ANULADA] Venta #${s.saleNumber} | ${s.fullReceiptNumber || s.receiptType} | Total: S/ ${total.toFixed(2)} | Motivo: "${s.voidedReason}" | Autorizada por: ${s.voidedByAdmin?.name || 'N/A'}`);
    } else {
      validSalesCount++;
      totalValidAmount += total;
      totalCashPaid += cash;
      totalDigitalPaid += digital;
      totalCostOfGoodsSold += saleCost;
      totalIgv += Number(s.igvAmount);
      totalTaxableBase += Number(s.taxableBase);

      console.log(`   ✅ Venta #${s.saleNumber} | ${s.fullReceiptNumber} (${s.receiptType}) | Total: S/ ${total.toFixed(2)} | Costo: S/ ${saleCost.toFixed(2)} | Utilidad: S/ ${(total - saleCost).toFixed(2)} | Pago: ${s.paymentMethod} (Efec: S/ ${cash.toFixed(2)}, Dig: S/ ${digital.toFixed(2)}) | Items: ${s.items.length}`);
    }
  }

  const grossProfit = totalValidAmount - totalCostOfGoodsSold;
  const marginPercent = totalValidAmount > 0 ? (grossProfit / totalValidAmount * 100) : 0;

  console.log('\n📊 RESUMEN EJECUTIVO DE VENTAS:');
  console.log(`   - Ventas Efectivas (No anuladas): ${validSalesCount}`);
  console.log(`   - Ventas Anuladas:                ${voidedSalesCount}`);
  console.log(`   - Total Facturado Bruto:          S/ ${totalValidAmount.toFixed(2)}`);
  console.log(`   - Costo de Mercadería Vendida:    S/ ${totalCostOfGoodsSold.toFixed(2)}`);
  console.log(`   - Ganancia Bruta Real:            S/ ${grossProfit.toFixed(2)} (${marginPercent.toFixed(1)}% margen)`);
  console.log(`   - Total Cobrado en Efectivo:      S/ ${totalCashPaid.toFixed(2)}`);
  console.log(`   - Total Cobrado Digitalmente:     S/ ${totalDigitalPaid.toFixed(2)}`);
  console.log(`   - Base Imponible Fiscal (SUNAT):  S/ ${totalTaxableBase.toFixed(2)}`);
  console.log(`   - Total IGV Fiscal (SUNAT):       S/ ${totalIgv.toFixed(2)}`);
  console.log(`   - Problemas de integridad items:  ${itemsIntegrityIssues}\n`);

  // 5. Control de Turnos y Arqueos de Caja
  const shifts = await prisma.cashShift.findMany({
    include: {
      cashRegister: true,
      user: { select: { name: true } },
      sales: { where: { isVoided: false } },
      cashMovements: true,
    },
    orderBy: { openedAt: 'asc' }
  });

  console.log(`💵 AUDITORÍA DE TURNOS Y ARQUEOS (${shifts.length} turnos registrados):`);
  let totalDifference = 0;
  let closedShiftsCount = 0;
  let openShiftsCount = 0;

  shifts.forEach((sh, idx) => {
    const initial = Number(sh.initialBalance);
    const expected = sh.expectedBalance !== null ? Number(sh.expectedBalance) : null;
    const actual = sh.actualBalance !== null ? Number(sh.actualBalance) : null;
    const diff = sh.difference !== null ? Number(sh.difference) : null;

    const cashFromSales = sh.sales
      .filter(s => s.paymentMethod === PaymentMethod.CASH || s.paymentMethod === PaymentMethod.MIXED)
      .reduce((sum, s) => sum + Number(s.cashPaid), 0);

    const digitalFromSales = sh.sales
      .filter(s => s.paymentMethod === PaymentMethod.TRANSFER || s.paymentMethod === PaymentMethod.CARD || s.paymentMethod === PaymentMethod.MIXED)
      .reduce((sum, s) => sum + Number(s.digitalPaid), 0);

    const cashIn = sh.cashMovements
      .filter(m => m.type === 'INCOME')
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const cashOut = sh.cashMovements
      .filter(m => m.type === 'EXPENSE')
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const calculatedExpected = initial + cashFromSales + cashIn - cashOut;

    if (sh.status === ShiftStatus.CLOSED) {
      closedShiftsCount++;
      if (diff !== null) totalDifference += diff;
      const isMismatch = expected !== null && Math.abs(expected - calculatedExpected) > 0.05;

      console.log(`   - Turno #${idx + 1} [CERRADO] | Caja: ${sh.cashRegister.name} | Cajero: ${sh.user.name}`);
      console.log(`     Apertura: S/ ${initial.toFixed(2)} | Ventas Efec: S/ ${cashFromSales.toFixed(2)} | Ventas Dig: S/ ${digitalFromSales.toFixed(2)} | Entradas: S/ ${cashIn.toFixed(2)} | Salidas: S/ ${cashOut.toFixed(2)}`);
      console.log(`     Esperado Sistema: S/ ${expected?.toFixed(2)} (Calc: S/ ${calculatedExpected.toFixed(2)}) | Arqueo Real: S/ ${actual?.toFixed(2)} | Diferencia: S/ ${diff?.toFixed(2)} ${diff === 0 ? '🎯 [CUADRE EXACTO]' : (diff || 0) > 0 ? '🟢 [SOBRANTE]' : '🔴 [FALTANTE]'}`);
      if (isMismatch) {
        console.warn(`     ⚠️ Descuadre entre expectedBalance en DB y cálculo dinámico!`);
      }
    } else {
      openShiftsCount++;
      console.log(`   - Turno #${idx + 1} [ABIERTO 🟢] | Caja: ${sh.cashRegister.name} | Cajero: ${sh.user.name}`);
      console.log(`     Apertura: S/ ${initial.toFixed(2)} | Ventas Efectivo: S/ ${cashFromSales.toFixed(2)} | Efectivo Actual en Caja: S/ ${calculatedExpected.toFixed(2)}`);
    }
  });

  console.log(`\n   🎯 RESUMEN DE ARQUEOS:`);
  console.log(`   - Turnos Cerrados: ${closedShiftsCount} | Turnos Abiertos: ${openShiftsCount}`);
  console.log(`   - Diferencia Acumulada de Arqueos: S/ ${totalDifference.toFixed(2)}`);

  // 6. Trazabilidad de Kardex
  const kardexCount = await prisma.kardexMovement.count();
  console.log(`\n📋 TRAZABILIDAD KARDEX:`);
  console.log(`   - Total de movimientos registrados en Kardex: ${kardexCount}`);

  // Verificar si hay ventas sin movimiento de Kardex correspondiente
  const salesWithDetails = await prisma.sale.findMany({
    where: { isVoided: false },
    include: { items: true }
  });

  let totalItemsSoldQty = 0;
  salesWithDetails.forEach(s => {
    s.items.forEach(i => totalItemsSoldQty += Number(i.quantity));
  });

  const saleKardexMoves = await prisma.kardexMovement.findMany({
    where: { movementType: 'SALE' }
  });
  let totalKardexSaleQty = saleKardexMoves.reduce((acc, m) => acc + Number(m.quantity), 0);

  console.log(`   - Cantidad total de productos vendidos en tickets: ${totalItemsSoldQty}`);
  console.log(`   - Cantidad total descontada en Kardex por ventas: ${totalKardexSaleQty}`);
  if (Math.abs(totalItemsSoldQty - totalKardexSaleQty) < 0.001) {
    console.log(`   ✅ COINCIDENCIA PERFECTA: Todo producto vendido fue debitado del Kardex con precisión.`);
  } else {
    console.log(`   ⚠️ Diferencia entre venta y kardex: ${totalItemsSoldQty - totalKardexSaleQty}`);
  }

}

fullAudit()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
