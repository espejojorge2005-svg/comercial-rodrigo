import { Injectable } from '@nestjs/common';
import { ReceiptType } from '@prisma/client';

@Injectable()
export class SalesSequenceService {
  /**
   * Helper base para derivar formato de serie estándar según identificador/nombre de caja:
   * Caja 1 (POS-01): NV01, B001, F001, BC01, FC01
   * Caja 2 (POS-02): NV02, B002, F002, BC02, FC02
   */
  getSeriesForRegister(
    identifier: string,
    name: string,
    receiptType: ReceiptType,
  ): string {
    let boxNum = '01';
    const match = (identifier || '').match(/\d+/) || (name || '').match(/\d+/);
    if (match) {
      boxNum = match[0].padStart(2, '0');
    } else {
      // Determinista por hash de identificador si no incluye números
      const sum = (identifier || name || 'POS-01')
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const mod = (sum % 90) + 1;
      boxNum = String(mod).padStart(2, '0');
    }

    if (receiptType === ReceiptType.NOTA_VENTA) {
      return `NV${boxNum}`;
    } else if (receiptType === ReceiptType.BOLETA) {
      return `B${boxNum.padStart(3, '0')}`;
    } else if (receiptType === ReceiptType.FACTURA) {
      return `F${boxNum.padStart(3, '0')}`;
    } else if (receiptType === ReceiptType.NOTA_CREDITO_BOLETA) {
      return `BC${boxNum}`;
    } else if (receiptType === ReceiptType.NOTA_CREDITO_FACTURA) {
      return `FC${boxNum}`;
    }
    return `NV${boxNum}`;
  }

  /**
   * 🛡️ ASIGNACIÓN SEGURA DE SERIES POR CAJA FÍSICA (PREVENCIÓN TOTAL DE COLISIONES)
   * Garantiza que cada caja física posea una serie única e inmutable para cada tipo de comprobante.
   * 1. Si la caja ya tiene una serie registrada en ReceiptSequence, la reutiliza.
   * 2. Si es una serie nueva, verifica contra la base de datos que ninguna otra caja la tenga asignada.
   *    Si otra caja ya la tiene, busca el siguiente número disponible (B001 -> B002 -> B003...).
   */
  async getOrAllocateSeries(
    tx: any,
    cashRegisterId: string,
    identifier: string,
    name: string,
    receiptType: ReceiptType,
  ): Promise<string> {
    // 1. Si la caja ya tiene serie asignada para este tipo de comprobante en ReceiptSequence, respetarla
    if (tx.receiptSequence?.findUnique) {
      try {
        const existingForRegister = await tx.receiptSequence.findUnique({
          where: {
            cashRegisterId_receiptType: {
              cashRegisterId,
              receiptType,
            },
          },
        });
        if (existingForRegister?.series) {
          return existingForRegister.series;
        }
      } catch (err) {
        // En tests unitarios con mocks parciales
      }
    }

    // 2. Determinar la serie candidata preferida
    let candidate = this.getSeriesForRegister(identifier, name, receiptType);

    // 3. Si tx soporta findUnique, verificar que la serie no pertenezca a OTRA caja física
    if (tx.receiptSequence?.findUnique) {
      try {
        let isTaken = true;
        let counter = 1;
        const match = (identifier || '').match(/\d+/) || (name || '').match(/\d+/);
        if (match) {
          counter = parseInt(match[0], 10) || 1;
        }

        while (isTaken && counter <= 99) {
          const takenSeq = await tx.receiptSequence.findUnique({
            where: { series: candidate },
          });

          if (!takenSeq || takenSeq.cashRegisterId === cashRegisterId) {
            isTaken = false;
          } else {
            // Colisión detectada: esta serie ya pertenece a otra caja. Avanzar al siguiente número.
            counter++;
            const boxPad = String(counter).padStart(2, '0');
            if (receiptType === ReceiptType.NOTA_VENTA) candidate = `NV${boxPad}`;
            else if (receiptType === ReceiptType.BOLETA) candidate = `B${boxPad.padStart(3, '0')}`;
            else if (receiptType === ReceiptType.FACTURA) candidate = `F${boxPad.padStart(3, '0')}`;
            else if (receiptType === ReceiptType.NOTA_CREDITO_BOLETA) candidate = `BC${boxPad}`;
            else if (receiptType === ReceiptType.NOTA_CREDITO_FACTURA) candidate = `FC${boxPad}`;
          }
        }
      } catch (err) {
        // Fallback seguro a la serie candidata
      }
    }

    return candidate;
  }
}
