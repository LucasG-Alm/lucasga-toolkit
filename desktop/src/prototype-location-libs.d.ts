// Tipos mínimos das bibliotecas temporárias do protótipo descartável.
declare module 'proj4' {
  export default function proj4(source: string, target: string, coordinate: [number, number]): [number, number];
}
declare module 'exceljs' {
  interface PrototypeWorksheet {
    columns: { header: string; key: string; width: number }[];
    views: { state: string; ySplit: number }[];
    autoFilter: string;
    addRow(values: Record<string, string | number | undefined>): void;
  }
  class Workbook {
    creator: string;
    addWorksheet(name: string): PrototypeWorksheet;
    xlsx: { writeBuffer(): Promise<Uint8Array> };
  }
  const ExcelJS: { Workbook: typeof Workbook };
  export default ExcelJS;
}
declare module 'fflate' {
  export function strToU8(value: string): Uint8Array;
  export function zipSync(files: Record<string, Uint8Array>, options?: { level?: number }): Uint8Array;
}
