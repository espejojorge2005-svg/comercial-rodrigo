export interface UnitDefinition {
  code: string;
  sunatCode: string;
  name: string;
  presentation: string;
}

export const SUNAT_UNITS: UnitDefinition[] = [
  { code: 'SA', sunatCode: 'SA', name: 'Saco', presentation: 'Por saco cerrado' },
  { code: 'BX', sunatCode: 'BX', name: 'Caja', presentation: 'Por caja cerrada' },
  { code: 'PK', sunatCode: 'PK', name: 'Paquete', presentation: 'Por paquetes individuales' },
  { code: 'NIU', sunatCode: 'NIU', name: 'Unidad', presentation: 'Por pieza suelta o genérica' },
  { code: 'KG', sunatCode: 'KG', name: 'Kilogramo', presentation: 'Por peso o a granel' },
  { code: 'LT', sunatCode: 'LT', name: 'Litro', presentation: 'Por litro / líquidos' },
];

export const getUnitBadge = (unit?: string): string => {
  if (!unit) return 'NIU';
  if (unit === 'UNIT') return 'NIU (Unidad)';
  const found = SUNAT_UNITS.find((u) => u.code === unit);
  return found ? `${found.sunatCode} (${found.name})` : unit;
};

export const getUnitShortName = (unit?: string): string => {
  if (!unit) return 'Unidad';
  if (unit === 'UNIT') return 'Unidad';
  const found = SUNAT_UNITS.find((u) => u.code === unit);
  return found ? found.name : unit;
};
