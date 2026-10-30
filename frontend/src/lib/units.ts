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
  { code: 'KG', sunatCode: 'KGM', name: 'Kilogramo', presentation: 'Por peso o a granel' },
  { code: 'LT', sunatCode: 'LTR', name: 'Litro', presentation: 'Por litro / líquidos' },
];

const DISCRETE_UNIT_CODES = new Set(['NIU', 'UNIT', 'UNIDAD', 'UND', 'SA', 'SACO', 'BX', 'CAJA', 'PK', 'PAQUETE']);

export const isDiscreteUnitType = (unit?: string | null): boolean => {
  if (!unit) return false;
  return DISCRETE_UNIT_CODES.has(unit.trim().toUpperCase());
};

export const getUnitBadge = (unit?: string): string => {
  if (!unit) return 'NIU';
  if (unit === 'UNIT') return 'NIU (Unidad)';
  const found = SUNAT_UNITS.find((u) => u.code === unit || u.sunatCode === unit);
  return found ? `${found.code} (${found.name})` : unit;
};

export const getUnitShortName = (unit?: string): string => {
  if (!unit) return 'Unidad';
  if (unit === 'UNIT') return 'Unidad';
  const found = SUNAT_UNITS.find((u) => u.code === unit || u.sunatCode === unit);
  return found ? found.name : unit;
};
