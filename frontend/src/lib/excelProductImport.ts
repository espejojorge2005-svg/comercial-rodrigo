import * as XLSX from 'xlsx';
import type { UnitType } from '../types/index.js';

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
 * Mapeo inteligente de unidad de medida
 */
function parseUnitType(rawVal: any): UnitType {
  if (!rawVal) return 'NIU';
  const val = String(rawVal).trim().toUpperCase();
  if (val.includes('KG') || val.includes('KILO')) return 'KG';
  if (val.includes('LT') || val.includes('LITRO')) return 'LT';
  if (val.includes('SA') || val.includes('SACO')) return 'SA';
  if (val.includes('BX') || val.includes('CAJA')) return 'BX';
  if (val.includes('PK') || val.includes('PAQUETE')) return 'PK';
  return 'NIU';
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

  rawJson.forEach((row, index) => {
    // Normalizar llaves
    const normalizedRow: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      normalizedRow[cleanKey(k)] = row[k];
    });

    // Detectar Nombre (obligatorio)
    const name = String(
      normalizedRow['nombredelproducto'] ||
        normalizedRow['nombreproducto'] ||
        normalizedRow['producto'] ||
        normalizedRow['nombre'] ||
        '',
    ).trim();

    // Si toda la fila está vacía o sin nombre, ignorarla
    if (!name && Object.values(row).every((v) => v === '')) {
      return;
    }

    // Detectar Código de barras (opcional)
    const rawBarcode = String(
      normalizedRow['codigodebarras'] ||
        normalizedRow['codigobarras'] ||
        normalizedRow['codigo'] ||
        normalizedRow['barcode'] ||
        '',
    ).trim();

    const isAutoBarcode = !rawBarcode;
    const barcode = rawBarcode;

    // Detectar Categoría (opcional)
    const categoryName = String(
      normalizedRow['categoria'] || normalizedRow['rubro'] || 'General',
    ).trim() || 'General';

    // Detectar Unidad de medida
    const rawUnit =
      normalizedRow['unidaddemedida'] ||
      normalizedRow['unidad'] ||
      normalizedRow['unid'] ||
      normalizedRow['um'] ||
      'NIU';
    const unitType = parseUnitType(rawUnit);

    // Detectar Costo de compra
    const rawCost =
      normalizedRow['costodecompra'] ||
      normalizedRow['costocompra'] ||
      normalizedRow['costo'] ||
      normalizedRow['preciocompra'] ||
      0;
    const costPrice = parseFloat(String(rawCost).replace(/[^0-9.]/g, '')) || 0;

    // Detectar Precio Menor
    const rawRetail =
      normalizedRow['precioventamenor'] ||
      normalizedRow['preciomenor'] ||
      normalizedRow['precioventa'] ||
      normalizedRow['precio'] ||
      0;
    const retailPrice = parseFloat(String(rawRetail).replace(/[^0-9.]/g, '')) || 0;

    // Detectar Precio Mayorista
    const rawWholesale =
      normalizedRow['preciomayorista'] ||
      normalizedRow['preciomayor'] ||
      normalizedRow['mayorista'] ||
      '';
    const wholesalePrice = rawWholesale !== '' ? parseFloat(String(rawWholesale).replace(/[^0-9.]/g, '')) : null;

    // Cantidad mínima mayorista
    const rawMinQty =
      normalizedRow['cantminmayorista'] ||
      normalizedRow['cantidadminimamayorista'] ||
      normalizedRow['minmayorista'] ||
      3;
    const wholesaleMinQty = rawMinQty !== '' ? parseFloat(String(rawMinQty).replace(/[^0-9.]/g, '')) : 3;

    // Stock Inicial
    const rawStock =
      normalizedRow['stockinicial'] ||
      normalizedRow['stock'] ||
      normalizedRow['cantidad'] ||
      0;
    const currentStock = parseFloat(String(rawStock).replace(/[^0-9.]/g, '')) || 0;

    // Stock Mínimo
    const rawMinStock =
      normalizedRow['stockminimoalerta'] ||
      normalizedRow['stockminimo'] ||
      normalizedRow['minstock'] ||
      5;
    const minStock = parseFloat(String(rawMinStock).replace(/[^0-9.]/g, '')) || 5;

    // Fecha de Vencimiento
    let expirationDate: string | null = null;
    const rawExp =
      normalizedRow['fechavencimiento'] ||
      normalizedRow['vencimiento'] ||
      normalizedRow['fechavenc'] ||
      null;

    if (rawExp instanceof Date) {
      expirationDate = rawExp.toISOString().split('T')[0];
    } else if (typeof rawExp === 'string' && rawExp.trim()) {
      const parsedDate = new Date(rawExp.trim());
      if (!isNaN(parsedDate.getTime())) {
        expirationDate = parsedDate.toISOString().split('T')[0];
      }
    }

    // Validaciones
    const errorMessages: string[] = [];
    if (!name) {
      errorMessages.push('Falta el nombre del producto');
    }
    if (retailPrice <= 0) {
      errorMessages.push('El precio menor debe ser mayor a 0');
    }
    if (costPrice < 0) {
      errorMessages.push('El costo no puede ser negativo');
    }
    if (currentStock < 0) {
      errorMessages.push('El stock inicial no puede ser negativo');
    }
    if (minStock < 0) {
      errorMessages.push('El stock mínimo no puede ser negativo');
    }

    parsedList.push({
      rowNumber: index + 2, // Fila en el Excel (1-indexed + header)
      name,
      barcode,
      isAutoBarcode,
      categoryName,
      unitType,
      costPrice,
      retailPrice,
      wholesalePrice: isNaN(wholesalePrice as any) ? null : wholesalePrice,
      wholesaleMinQty: isNaN(wholesaleMinQty) ? 3 : wholesaleMinQty,
      currentStock,
      minStock,
      expirationDate,
      isValid: errorMessages.length === 0,
      errorMessages,
    });
  });

  return parsedList;
}
