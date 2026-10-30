import * as XLSX from 'xlsx';
import type { UnitType } from '../types/index.js';
import { isDiscreteUnitType } from './units.js';

export interface ParsedProductRow {
  rowNumber: number;
  name: string;
  barcode: string;
  isAutoBarcode: boolean;
  categoryName: string;
  unitType: UnitType;
  costPrice: number;
  retailPrice: number;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  currentStock: number;
  minStock: number;
  expirationDate?: string | null;
  isValid: boolean;
  errorMessages: string[];
}

/**
 * Normaliza nombres de columnas flexibles
 */
function cleanKey(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita tildes
    .replace(/[^a-z0-9]/g, ''); // Quita espacios y caracteres especiales
}

/**
 * Mapeo inteligente de unidad de medida (evita confundir BOLSA con SA/Saco)
 */
export function parseUnitType(rawVal: unknown): UnitType {
  if (!rawVal) return 'NIU';
  const val = String(rawVal).trim().toUpperCase();
  if (val.includes('BOLSA') || val === 'BG') return 'NIU';
  if (val === 'SA' || val.startsWith('SA ') || val.startsWith('SA(') || val.includes('SACO')) {
    return 'SA';
  }
  if (val === 'BX' || val.startsWith('BX ') || val.startsWith('BX(') || val.includes('CAJA')) {
    return 'BX';
  }
  if (val === 'PK' || val.startsWith('PK ') || val.startsWith('PK(') || val.includes('PAQUETE')) {
    return 'PK';
  }
  if (val.includes('KG') || val.includes('KILO')) return 'KG';
  if (val.includes('LT') || val.includes('LITRO') || val === 'LTR') return 'LT';
  return 'NIU';
}

/**
 * Parsea números con decimales en coma o punto, preservando signos negativos y el valor 0
 */
export function parseFlexibleNumber(raw: unknown, fallback: number | null): number | null {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : Number.NaN;
  }

  const str = String(raw).trim();
  if (str === '') return fallback;

  let cleaned = str.replace(/\s+/g, '');
  let isNegative = false;
  if (cleaned.startsWith('-')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  cleaned = cleaned.replace(/^(S\/\.?|PEN|\$)/i, '');
  if (cleaned.startsWith('-')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  }

  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return Number.NaN;
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return Number.NaN;
  if (num === 0) return 0;
  return isNegative ? -num : num;
}

function pickFirstDefined(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const val = row[k];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return val;
    }
  }
  return '';
}

export function parseFlexibleExpirationDate(
  rawExp: unknown,
): { date: string | null; invalid: boolean } {
  if (rawExp === null || rawExp === undefined || String(rawExp).trim() === '') {
    return { date: null, invalid: false };
  }

  if (rawExp instanceof Date) {
    if (isNaN(rawExp.getTime())) {
      return { date: null, invalid: true };
    }
    const yyyy = rawExp.getUTCFullYear();
    const mm = String(rawExp.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(rawExp.getUTCDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, invalid: false };
  }

  const str = String(rawExp).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    const check = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    if (
      check.getUTCFullYear() === Number(yyyy) &&
      check.getUTCMonth() + 1 === Number(mm) &&
      check.getUTCDate() === Number(dd)
    ) {
      return { date: `${yyyy}-${mm}-${dd}`, invalid: false };
    }
    return { date: null, invalid: true };
  }

  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, dStr, mStr, yyyy] = dmyMatch;
    const dd = dStr.padStart(2, '0');
    const mm = mStr.padStart(2, '0');
    const check = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    if (
      check.getUTCFullYear() === Number(yyyy) &&
      check.getUTCMonth() + 1 === Number(mm) &&
      check.getUTCDate() === Number(dd)
    ) {
      return { date: `${yyyy}-${mm}-${dd}`, invalid: false };
    }
    return { date: null, invalid: true };
  }

  return { date: null, invalid: true };
}

/**
 * Descarga plantilla oficial en Excel (.xlsx) con estilos y ejemplos
 */
export function downloadProductTemplateExcel() {
  const headers = [
    'Nombre del Producto *',
    'Código de Barras',
    'Categoría',
    'Unidad de Medida',
    'Costo de Compra *',
    'Precio Venta Menor *',
    'Precio Mayorista',
    'Cant. Mín. Mayorista',
    'Stock Inicial *',
    'Stock Mínimo Alerta *',
    'Fecha Vencimiento',
  ];

  const sampleData = [
    [
      'Arroz Costeño Extra 1kg',
      '7750123456789',
      'Abarrotes',
      'NIU (Unidad)',
      3.8,
      4.8,
      4.3,
      6,
      100,
      20,
      '',
    ],
    [
      'Azúcar Rubia Granel por Kilo',
      '', // Dejado en blanco a propósito para que el usuario vea que se autogenera
      'Abarrotes',
      'KG (Kilogramo)',
      3.1,
      4.0,
      3.6,
      5,
      80,
      15,
      '',
    ],
    [
      'Aceite Primor Premium 1L',
      '7750987654321',
      'Abarrotes',
      'NIU (Unidad)',
      8.5,
      11.0,
      9.8,
      4,
      50,
      10,
      '',
    ],
    [
      'Yogurt Gloria Fresa 1kg',
      '7750777888999',
      'Lácteos',
      'NIU (Unidad)',
      5.5,
      7.2,
      6.5,
      4,
      24,
      6,
      '2026-11-30',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

  // Anchos de columna recomendados
  ws['!cols'] = [
    { wch: 32 }, // Nombre
    { wch: 18 }, // Código de barras
    { wch: 16 }, // Categoría
    { wch: 16 }, // Unidad de medida
    { wch: 16 }, // Costo
    { wch: 20 }, // Precio Menor
    { wch: 18 }, // Precio Mayorista
    { wch: 20 }, // Cant Min Mayorista
    { wch: 14 }, // Stock Inicial
    { wch: 20 }, // Stock Mínimo
    { wch: 18 }, // Fecha Vencimiento
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Productos');

  // Descargar archivo
  XLSX.writeFile(wb, 'Plantilla_Carga_Productos_Comercial_Rodrigo.xlsx');
}

/**
 * Parsea el archivo Excel o CSV subido por el usuario
 */
export async function parseProductsExcelFile(file: File): Promise<ParsedProductRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('El archivo Excel no contiene ninguna hoja.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rawJson.length === 0) {
    throw new Error('La hoja de cálculo está vacía.');
  }

  const parsedList: ParsedProductRow[] = [];
  const seenBarcodes = new Map<string, number>();

  rawJson.forEach((row, index) => {
    const rowNumber = index + 2; // Fila en el Excel (1-indexed + header)

    // Normalizar llaves
    const normalizedRow: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      normalizedRow[cleanKey(k)] = row[k];
    });

    // Detectar Nombre (obligatorio)
    const name = String(
      pickFirstDefined(normalizedRow, [
        'nombredelproducto',
        'nombreproducto',
        'producto',
        'nombre',
      ]),
    ).trim();

    // Si toda la fila está vacía o sin nombre y sin valores, ignorarla
    if (!name && Object.values(row).every((v) => v === '' || v === null || v === undefined)) {
      return;
    }

    // Detectar Código de barras (opcional)
    const rawBarcode = String(
      pickFirstDefined(normalizedRow, [
        'codigodebarras',
        'codigobarras',
        'codigo',
        'barcode',
      ]),
    ).trim();

    const isAutoBarcode = !rawBarcode;
    const barcode = rawBarcode;

    // Detectar Categoría (opcional)
    const categoryName =
      String(pickFirstDefined(normalizedRow, ['categoria', 'rubro']) || 'General').trim() ||
      'General';

    // Detectar Unidad de medida
    const rawUnit = pickFirstDefined(normalizedRow, ['unidaddemedida', 'unidad', 'unid', 'um']) || 'NIU';
    const unitType = parseUnitType(rawUnit);

    // Detectar Costo de compra (0 permitido, negativos o texto inválido rechazados)
    const rawCost = pickFirstDefined(normalizedRow, [
      'costodecompra',
      'costocompra',
      'costo',
      'preciocompra',
    ]);
    const costPrice = parseFlexibleNumber(rawCost, 0) as number;

    // Detectar Precio Menor
    const rawRetail = pickFirstDefined(normalizedRow, [
      'precioventamenor',
      'preciomenor',
      'precioventa',
      'precio',
    ]);
    const retailPrice = parseFlexibleNumber(rawRetail, 0) as number;

    // Detectar Precio Mayorista
    const rawWholesale = pickFirstDefined(normalizedRow, [
      'preciomayorista',
      'preciomayor',
      'mayorista',
    ]);
    const wholesalePrice = parseFlexibleNumber(rawWholesale, null);

    // Cantidad mínima mayorista
    const rawMinQty = pickFirstDefined(normalizedRow, [
      'cantminmayorista',
      'cantidadminimamayorista',
      'minmayorista',
    ]);
    const wholesaleMinQty = parseFlexibleNumber(rawMinQty, 3) as number;

    // Stock Inicial
    const rawStock = pickFirstDefined(normalizedRow, ['stockinicial', 'stock', 'cantidad']);
    const currentStock = parseFlexibleNumber(rawStock, 0) as number;

    // Stock Mínimo (preserva 0 cuando el usuario escribe 0 explícitamente)
    const rawMinStock = pickFirstDefined(normalizedRow, [
      'stockminimoalerta',
      'stockminimo',
      'minstock',
    ]);
    const minStock = parseFlexibleNumber(rawMinStock, 5) as number;

    // Fecha de Vencimiento
    const rawExp = pickFirstDefined(normalizedRow, [
      'fechavencimiento',
      'vencimiento',
      'fechavenc',
    ]);
    const { date: expirationDate, invalid: invalidExpDate } = parseFlexibleExpirationDate(rawExp);

    // Validaciones
    const errorMessages: string[] = [];
    if (!name) {
      errorMessages.push('Falta el nombre del producto');
    }
    if (barcode) {
      const normalizedBarcode = barcode.toUpperCase();
      const firstRow = seenBarcodes.get(normalizedBarcode);
      if (firstRow !== undefined) {
        errorMessages.push(`Código de barras duplicado en el archivo Excel (fila ${firstRow})`);
      } else {
        seenBarcodes.set(normalizedBarcode, rowNumber);
      }
    }
    if (Number.isNaN(retailPrice) || retailPrice <= 0) {
      errorMessages.push('El precio menor debe ser un número mayor a 0');
    }
    if (Number.isNaN(costPrice) || costPrice < 0) {
      errorMessages.push('El costo de compra debe ser un número mayor o igual a 0');
    }
    if (wholesalePrice !== null && (Number.isNaN(wholesalePrice) || wholesalePrice <= 0)) {
      errorMessages.push('El precio mayorista debe ser mayor a 0');
    }
    if (Number.isNaN(wholesaleMinQty) || wholesaleMinQty <= 0) {
      errorMessages.push('La cantidad mínima mayorista debe ser mayor a 0');
    }
    if (Number.isNaN(currentStock) || currentStock < 0) {
      errorMessages.push('El stock inicial no puede ser negativo ni inválido');
    } else if (isDiscreteUnitType(unitType) && !Number.isInteger(currentStock)) {
      errorMessages.push(
        'Las unidades discretas (NIU, Caja, Paquete, Saco) no admiten decimales en el stock inicial',
      );
    }
    if (Number.isNaN(minStock) || minStock < 0) {
      errorMessages.push('El stock mínimo no puede ser negativo ni inválido');
    }
    if (invalidExpDate) {
      errorMessages.push('Fecha de vencimiento inválida (use AAAA-MM-DD o DD/MM/AAAA)');
    }

    parsedList.push({
      rowNumber,
      name,
      barcode,
      isAutoBarcode,
      categoryName,
      unitType,
      costPrice: Number.isNaN(costPrice) ? 0 : Number(costPrice.toFixed(2)),
      retailPrice: Number.isNaN(retailPrice) ? 0 : Number(retailPrice.toFixed(2)),
      wholesalePrice:
        wholesalePrice === null || Number.isNaN(wholesalePrice)
          ? null
          : Number(wholesalePrice.toFixed(2)),
      wholesaleMinQty: Number.isNaN(wholesaleMinQty) ? 3 : wholesaleMinQty,
      currentStock: Number.isNaN(currentStock) ? 0 : Number(currentStock.toFixed(3)),
      minStock: Number.isNaN(minStock) ? 5 : Number(minStock.toFixed(3)),
      expirationDate,
      isValid: errorMessages.length === 0,
      errorMessages,
    });
  });

  return parsedList;
}
