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
   * Importante: No suprime errores SQL dentro de transacciones PostgreSQL (evita estado 25P02).
   */
  async getOrAllocateSeries(
    tx: any,
    cashRegisterId: string,
    identifier: string,
    name: string,
    receiptType: ReceiptType,
  ): Promise<string> {
    if (typeof tx?.receiptSequence?.findUnique === 'function') {
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
    }

    let candidate = this.getSeriesForRegister(identifier, name, receiptType);

    if (typeof tx?.receiptSequence?.findUnique === 'function') {
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
          counter++;
          const boxPad = String(counter).padStart(2, '0');
          if (receiptType === ReceiptType.NOTA_VENTA) candidate = `NV${boxPad}`;
          else if (receiptType === ReceiptType.BOLETA) candidate = `B${boxPad.padStart(3, '0')}`;
          else if (receiptType === ReceiptType.FACTURA) candidate = `F${boxPad.padStart(3, '0')}`;
          else if (receiptType === ReceiptType.NOTA_CREDITO_BOLETA) candidate = `BC${boxPad}`;
          else if (receiptType === ReceiptType.NOTA_CREDITO_FACTURA) candidate = `FC${boxPad}`;
        }
      }
    }

    return candidate;
  }
}
