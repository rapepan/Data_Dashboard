/**
 * ส่งออกตารางเป็นไฟล์ Excel (.xlsx) ที่จัดรูปแบบให้อ่านง่าย — หัวตารางตัวหนา, เส้นตาราง,
 * ความกว้างคอลัมน์, ตรึงแถวหัว ใช้ได้กับทุกตารางในระบบ
 *
 * exceljs มีขนาดใหญ่ จึงโหลดแบบ dynamic import เฉพาะตอนกดส่งออก ไม่ให้หน้าเว็บปกติช้าลง
 */
export interface ExcelColumn<T> {
  header: string;
  value: (row: T) => string | number;
  /** ความกว้างคอลัมน์ (หน่วยตัวอักษรของ Excel) */
  width: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  /** ใช้ฟอนต์ตัวพิมพ์ดีด (เช่น รหัสโรค) */
  mono?: boolean;
  /** รูปแบบตัวเลข เช่น '#,##0' หรือ '#,##0.00' */
  numFmt?: string;
}

interface ExportOptions<T> {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

const FONT = 'Tahoma';
const BORDER_COLOR = { argb: 'FFBFC5D2' };
const thin = { style: 'thin' as const, color: BORDER_COLOR };
const border = { top: thin, left: thin, bottom: thin, right: thin };

export async function exportToExcel<T>({ filename, sheetName = 'Sheet1', columns, rows }: ExportOptions<T>) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  sheet.columns = columns.map(column => ({ width: column.width }));

  const header = sheet.addRow(columns.map(column => column.header));
  header.height = 22;
  header.eachCell(cell => {
    cell.font = { name: FONT, size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = border;
  });

  rows.forEach(row => {
    const excelRow = sheet.addRow(columns.map(column => column.value(row)));
    excelRow.height = 18;
    columns.forEach((column, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.font = column.mono
        ? { name: 'Courier New', size: 10, bold: true }
        : { name: FONT, size: 10, bold: column.bold };
      cell.alignment = { horizontal: column.align ?? 'left', vertical: 'middle' };
      cell.border = border;
      if (column.numFmt) cell.numFmt = column.numFmt;
    });
  });

  await download(workbook, filename);
}

/** บันทึก workbook เป็นไฟล์ .xlsx ให้เบราว์เซอร์ดาวน์โหลด */
async function download(workbook: { xlsx: { writeBuffer: () => Promise<ArrayBuffer> } }, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename.endsWith('.xlsx') ? filename : `${filename}.xlsx` });
  // ต้องอยู่ใน DOM (Firefox) และคืนหน่วยความจำหลังเบราว์เซอร์เริ่มดาวน์โหลดแล้ว (ลบทันทีบางเบราว์เซอร์จะยกเลิกไฟล์)
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface SheetData {
  name: string;
  header: string[];
  rows: (string | number)[][];
}

/** ส่งออกหลายตาราง (แผ่นงานละตาราง) — ใช้กับปุ่ม Excel ของกล่องรายงาน (utils/panelExport.ts) */
export async function exportSheets(filename: string, sheets: SheetData[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const used = new Set<string>();

  for (const data of sheets) {
    // ชื่อแผ่นงาน Excel: ไม่เกิน 31 ตัว ห้ามอักขระ [ ] : * ? / \ และห้ามซ้ำ
    const base = data.name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base.slice(0, 27)} (${i})`;
    used.add(name);

    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const numeric = data.header.map((_, c) => data.rows.length > 0 && data.rows.every(r => typeof r[c] === 'number' || r[c] === '' || r[c] === undefined));
    sheet.columns = data.header.map((h, c) => ({
      width: Math.min(60, Math.max(10, h.length + 4, ...data.rows.map(r => String(r[c] ?? '').length + 2))),
    }));

    const header = sheet.addRow(data.header);
    header.height = 22;
    header.eachCell(cell => {
      cell.font = { name: FONT, size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
    });

    for (const row of data.rows) {
      const excelRow = sheet.addRow(data.header.map((_, c) => row[c] ?? ''));
      excelRow.height = 18;
      data.header.forEach((_, c) => {
        const cell = excelRow.getCell(c + 1);
        const value = row[c];
        cell.font = { name: FONT, size: 10 };
        cell.alignment = { horizontal: numeric[c] || typeof value === 'number' ? 'right' : 'left', vertical: 'middle' };
        cell.border = border;
        if (typeof value === 'number') cell.numFmt = Number.isInteger(value) ? '#,##0' : '#,##0.00';
      });
    }
  }

  await download(workbook, filename);
}
