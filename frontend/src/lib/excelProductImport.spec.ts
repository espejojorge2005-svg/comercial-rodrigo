import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseProductsExcelFile } from './excelProductImport.js';

describe('excelProductImport - Procesamiento e Importación de Catálogo', () => {
  function createMockExcelFile(data: any[]): File {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([u8], 'test_products.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  it('debe procesar correctamente un archivo Excel con filas válidas', async () => {
    const headers = [
      'Nombre del Producto',
      'Código de Barras',
      'Categoría',
      'Unidad de Medida',
      'Costo de Compra',
      'Precio Venta Menor',
      'Precio Mayorista',
      'Cant. Mín. Mayorista',
      'Stock Inicial',
      'Stock Mínimo',
    ];

    const row1 = [
      'Leche Gloria Azul 400g',
      '7751000200030',
      'Lácteos',
      'NIU (Unidad)',
      3.2,
      4.2,
      3.8,
      6,
      48,
      12,
    ];

    const file = createMockExcelFile([headers, row1]);
    const parsed = await parseProductsExcelFile(file);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].isValid).toBe(true);
    expect(parsed[0].name).toBe('Leche Gloria Azul 400g');
    expect(parsed[0].barcode).toBe('7751000200030');
    expect(parsed[0].costPrice).toBe(3.2);
    expect(parsed[0].retailPrice).toBe(4.2);
    expect(parsed[0].wholesalePrice).toBe(3.8);
    expect(parsed[0].wholesaleMinQty).toBe(6);
    expect(parsed[0].currentStock).toBe(48);
    expect(parsed[0].unitType).toBe('NIU');
  });

  it('debe marcar como inválidas las filas sin nombre o con precios no numéricos', async () => {
    const headers = ['Nombre del Producto', 'Precio Venta Menor', 'Stock Inicial'];
    const invalidRow = ['', '10.5', '20']; // Nombre vacío

    const file = createMockExcelFile([headers, invalidRow]);
    const parsed = await parseProductsExcelFile(file);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].isValid).toBe(false);
    expect(parsed[0].errorMessages).toContain('Falta el nombre del producto');
  });

  it('debe lanzar un error si la hoja de cálculo está vacía', async () => {
    const file = createMockExcelFile([]);

    await expect(parseProductsExcelFile(file)).rejects.toThrow('La hoja de cálculo está vacía.');
  });
});
