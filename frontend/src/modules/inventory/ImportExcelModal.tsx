import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  downloadProductTemplateExcel,
  parseProductsExcelFile,
  type ParsedProductRow,
} from '../../lib/excelProductImport.js';
import { apiRequest } from '../../api/client.js';
import { formatCurrency } from '../../lib/utils.js';
import { getUnitShortName } from '../../lib/units.js';

interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportExcelModal: React.FC<ImportExcelModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    message: string;
    createdCount: number;
    updatedCount: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    setImportResult(null);
    setIsParsing(true);

    try {
      const rows = await parseProductsExcelFile(selectedFile);
      setParsedRows(rows);
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || 'Error al procesar el archivo Excel');
      setParsedRows([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileChange(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setParseError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setParseError(null);

    try {
      const payload = {
        products: validRows.map((r) => ({
          barcode: r.barcode || undefined,
          name: r.name,
          categoryName: r.categoryName,
          unitType: r.unitType,
          costPrice: r.costPrice,
          retailPrice: r.retailPrice,
          wholesalePrice: r.wholesalePrice,
          wholesaleMinQty: r.wholesaleMinQty,
          currentStock: r.currentStock,
          minStock: r.minStock,
          expirationDate: r.expirationDate,
        })),
      };

      const res = await apiRequest('/products/bulk-import', {
        method: 'POST',
        data: payload,
      });

      setImportResult({
        message: res.message || 'Importación completada con éxito',
        createdCount: res.createdCount || 0,
        updatedCount: res.updatedCount || 0,
      });

      // Recargar catálogo de inventario en segundo plano
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || 'Error al importar productos al servidor');
    } finally {
      setIsImporting(false);
    }
  };

  const totalValid = parsedRows.filter((r) => r.isValid).length;
  const totalAutoBarcode = parsedRows.filter((r) => r.isAutoBarcode && r.isValid).length;
  const totalErrors = parsedRows.filter((r) => !r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Cabecera del Modal */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Carga Masiva de Productos en Excel
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Producción
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Importe su inventario real completo: nombres, costos, precios, stock y códigos automáticos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Tarjeta de Instrucciones y Descarga de Plantilla */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Instrucciones & Funciones Automáticas:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                <li>
                  <strong className="text-slate-200">Códigos de Barra Automáticos:</strong> Si el producto no tiene código de barras, deje la casilla vacía y el sistema generará automáticamente un código único (<code className="text-blue-400">CR-000001</code>).
                </li>
                <li>
                  <strong className="text-slate-200">Categorías dinámicas:</strong> Si escribe una categoría nueva, el sistema la crea automáticamente.
                </li>
                <li>
                  <strong className="text-slate-200">Kardex inicial:</strong> El stock inicial ingresado registrará el asiento contable de inventario.
                </li>
                <li>
                  <strong className="text-slate-200">Stock mínimo editable:</strong> Defina el stock mínimo de alerta en el Excel; podrá modificarlo siempre que desee desde el sistema.
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={downloadProductTemplateExcel}
              className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer shrink-0"
              title="Descargar archivo Excel con columnas y ejemplos listos"
            >
              <Download className="w-4 h-4" />
              <span>Descargar Plantilla (.xlsx)</span>
            </button>
          </div>

          {/* Resultado de Importación exitosa */}
          {importResult && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-white text-base">¡Importación completada con éxito!</div>
                  <div className="text-xs text-emerald-400/90 mt-0.5">{importResult.message}</div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition-all cursor-pointer"
              >
                Cerrar y Ver Catálogo
              </button>
            </div>
          )}

          {/* Error de parseo o backend */}
          {parseError && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <span className="font-bold text-rose-200">Error: </span>
                {parseError}
              </div>
            </div>
          )}

          {/* Zona de Carga de Archivo (Si no hay archivo seleccionado o quiere cambiarlo) */}
          {parsedRows.length === 0 && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-3xl p-8 sm:p-12 text-center bg-slate-950/50 hover:bg-slate-950/80 transition-all cursor-pointer group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
                {isParsing ? (
                  <RefreshCw className="w-8 h-8 animate-spin" />
                ) : (
                  <Upload className="w-8 h-8" />
                )}
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                {isParsing ? 'Analizando archivo Excel...' : 'Arrastre su archivo Excel aquí o haga clic para seleccionar'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Formatos compatibles: <code className="text-slate-300">.xlsx</code>, <code className="text-slate-300">.xls</code> o <code className="text-slate-300">.csv</code>
              </p>
            </div>
          )}

          {/* Previsualización de los Productos detectados en la tabla */}
          {parsedRows.length > 0 && (
            <div className="space-y-4">
              {/* Barra de Estadísticas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Total en archivo</div>
                  <div className="text-lg font-bold text-white">{parsedRows.length} filas</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Listos para importar</div>
                  <div className="text-lg font-bold text-emerald-400">{totalValid} productos</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Código automático ✨</div>
                  <div className="text-lg font-bold text-blue-400">{totalAutoBarcode} códigos</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Filas con observaciones</div>
                  <div className="text-lg font-bold text-rose-400">{totalErrors} filas</div>
                </div>
              </div>

              {/* Encabezado de tabla y botón para cambiar archivo */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Archivo cargado: <strong className="text-white">{file?.name}</strong> ({((file?.size || 0) / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-slate-400 hover:text-rose-400 font-medium transition-colors cursor-pointer"
                >
                  Cambiar archivo
                </button>
              </div>

              {/* Tabla Previsualizadora */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950 max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 sticky top-0 border-b border-slate-800 font-semibold z-10">
                    <tr>
                      <th className="p-2.5 pl-4">#</th>
                      <th className="p-2.5">Código Barcode</th>
                      <th className="p-2.5">Producto</th>
                      <th className="p-2.5">Categoría</th>
                      <th className="p-2.5">U.M.</th>
                      <th className="p-2.5 text-right">Costo</th>
                      <th className="p-2.5 text-right">P. Menor</th>
                      <th className="p-2.5 text-right">Stock Inicial</th>
                      <th className="p-2.5 text-right">Stock Mín.</th>
                      <th className="p-2.5 text-center pr-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {parsedRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={`hover:bg-slate-900/40 transition-colors ${
                          !row.isValid ? 'bg-rose-950/20 text-rose-300' : 'text-slate-300'
                        }`}
                      >
                        <td className="p-2.5 pl-4 text-slate-500 font-mono text-[11px]">
                          {row.rowNumber}
                        </td>
                        <td className="p-2.5">
                          {row.isAutoBarcode ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-semibold">
                              <Sparkles className="w-2.5 h-2.5" /> Auto CR-XXXXXX
                            </span>
                          ) : (
                            <span className="font-mono text-slate-200 text-[11px]">
                              {row.barcode}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-bold text-white max-w-[200px] truncate" title={row.name}>
                          {row.name || <em className="text-rose-400 font-normal">Sin nombre</em>}
                        </td>
                        <td className="p-2.5 text-slate-400">
                          {row.categoryName}
                        </td>
                        <td className="p-2.5 text-slate-300">
                          {getUnitShortName(row.unitType)}
                        </td>
                        <td className="p-2.5 text-right text-slate-400 font-mono">
                          {formatCurrency(row.costPrice)}
                        </td>
                        <td className="p-2.5 text-right font-bold text-white font-mono">
                          {formatCurrency(row.retailPrice)}
                        </td>
                        <td className="p-2.5 text-right text-emerald-400 font-bold font-mono">
                          {row.currentStock}
                        </td>
                        <td className="p-2.5 text-right text-amber-400 font-mono">
                          {row.minStock}
                        </td>
                        <td className="p-2.5 text-center pr-4">
                          {row.isValid ? (
                            <span className="inline-flex items-center text-emerald-400" title="Fila lista para importar">
                              <CheckCircle2 className="w-4 h-4" />
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center text-rose-400 cursor-help"
                              title={row.errorMessages.join(', ')}
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pie del Modal con Botones */}
        <div className="p-4 sm:p-6 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
          >
            {importResult ? 'Cerrar' : 'Cancelar'}
          </button>

          {parsedRows.length > 0 && !importResult && (
            <button
              type="button"
              disabled={isImporting || totalValid === 0}
              onClick={handleImport}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Importando al Sistema...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirmar e Importar {totalValid} Productos</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
