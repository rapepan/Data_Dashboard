import { Chart } from 'chart.js';
import { exportSheets, type SheetData } from './exportExcel';

/**
 * ส่งออก Excel จากกล่องรายงาน (Panel) ตามที่เห็นบนจอ — ไม่ต้องกำหนดคอลัมน์แยกทีละกล่อง
 * 1) มีตาราง → ตารางละ 1 แผ่นงาน (แถวตามที่แสดงอยู่ เช่น Top N / คำค้นที่เลือก)
 * 2) ไม่มีตาราง แต่มีกราฟ → ข้อมูลของกราฟ (ป้ายกำกับ × ชุดข้อมูล)
 * 3) ไม่มีทั้งสองอย่าง → รายการ (แถบ / ขั้นตอน) รายการละ 1 แถว
 * 4) กล่องสรุปตัวเลข → กล่องละ 1 แถว
 */

const UNIT = /^(-?[\d,]+(?:\.\d+)?)\s*(%|฿|บาท|ครั้ง|ราย|คน|นาที|ชิ้น|เตียง|วัน|ชม\.|ราย\/ชม\.)?$/;

/** ข้อความที่เป็นตัวเลข (มีหน่วยต่อท้ายได้) → ตัวเลข */
function toValue(text: string): string | number {
  const m = UNIT.exec(text.trim());
  if (!m) return text.trim();
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : text.trim();
}

/** ข้อความในเซลล์ — ใช้ data-x ถ้ากำหนดไว้ ไม่งั้นใช้ข้อความที่เห็น (บรรทัดย่อยคั่นด้วย ·) */
function cellText(el: Element): string {
  const forced = (el as HTMLElement).dataset?.x;
  if (forced !== undefined) return forced;
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().replace(/\s*\n+\s*/g, ' · ');
}

const visible = (el: Element) => !el.closest('.no-print') && (el as HTMLElement).offsetParent !== null;

/** ค่าในเซลล์ตาราง — เซลล์ที่เป็นรหัส (<code>) หรือคอลัมน์ "รหัส" เก็บเป็นข้อความ */
const tableValue = (cell: HTMLTableCellElement, header: string) =>
  cell.querySelector('code') || header.includes('รหัส') ? cellText(cell) : toValue(cellText(cell));

/** หัวคอลัมน์ขึ้นบรรทัดใหม่ (<br>) → เว้นวรรค */
const headerText = (cell: Element) => cellText(cell).replace(/ · /g, ' ');

function fromTables(root: HTMLElement, title: string): SheetData[] {
  return Array.from(root.querySelectorAll('table')).filter(visible).map((table, i) => {
    const headRow = table.tHead?.rows[0] ?? table.rows[0];
    const header = headRow ? Array.from(headRow.cells).map(c => headerText(c) || `คอลัมน์ ${c.cellIndex + 1}`) : [];
    const bodyRows = Array.from(table.rows).filter(r => r !== headRow && r.parentElement?.tagName !== 'THEAD');
    const rows = bodyRows
      .filter(r => !(r.cells.length === 1 && r.cells[0].colSpan > 1)) // แถว "ไม่พบข้อมูล"
      .map(r => Array.from(r.cells).map((c, ci) => tableValue(c, header[ci] ?? '')));
    return { name: i === 0 ? title : `${title} ${i + 1}`, header, rows };
  });
}

function fromCharts(root: HTMLElement, title: string): SheetData[] {
  return Array.from(root.querySelectorAll('canvas'))
    .map(canvas => Chart.getChart(canvas))
    .filter((chart): chart is Chart => chart !== undefined)
    .map((chart, i) => {
      const category = chart.canvas.closest<HTMLElement>('[data-print-category]')?.dataset.printCategory || 'รายการ';
      const labels = (chart.data.labels ?? []).map(String);
      const datasets = chart.data.datasets;
      const header = [category, ...datasets.map((d, di) => String(d.label ?? (datasets.length > 1 ? `ชุดที่ ${di + 1}` : 'จำนวน')))];
      const rows = labels.map((label, li) => [label, ...datasets.map(d => {
        const v = (d.data as unknown[])[li];
        return typeof v === 'number' ? v : typeof v === 'object' && v !== null && 'y' in v ? Number((v as { y: number }).y) : '';
      })]);
      return { name: i === 0 ? title : `${title} ${i + 1}`, header, rows };
    });
}

function fromLists(root: HTMLElement, title: string): SheetData[] {
  const lists = Array.from(root.querySelectorAll('ul, ol')).filter(l => visible(l) && !l.parentElement?.closest('ul, ol'));
  return lists.map((list, i) => {
    const rows = Array.from(list.children)
      .map(li => Array.from(li.children).map(cellText).filter(Boolean).map(toValue))
      .filter(r => r.length > 0);
    const width = Math.max(1, ...rows.map(r => r.length));
    const header = ['รายการ', ...Array.from({ length: width - 1 }, (_, c) => (c === 0 ? 'ค่า' : `ค่า ${c + 1}`))];
    return { name: i === 0 ? title : `${title} ${i + 1}`, header, rows };
  }).filter(sheet => sheet.rows.length > 0);
}

/** กล่องสรุปตัวเลข (หัวข้อ + ตัวเลขตัวหนา + หมายเหตุ) กล่องละ 1 แถว */
function fromBoxes(root: HTMLElement, title: string): SheetData[] {
  const boxes = Array.from(root.querySelectorAll<HTMLElement>('*')).filter(el =>
    visible(el) && Array.from(el.children).some(c => c.tagName === 'B') && Array.from(el.children).some(c => c.tagName === 'SPAN'));
  const rows = boxes.map(box => Array.from(box.children).map(cellText).filter(Boolean).map(toValue));
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map(r => r.length));
  return [{ name: title, header: ['รายการ', 'ค่า', ...Array.from({ length: Math.max(0, width - 2) }, () => 'หมายเหตุ')], rows }];
}

const safeFilename =(text: string) => text.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

export async function exportPanelExcel(root: HTMLElement, title: string) {
  const body = root.querySelector<HTMLElement>('.panel-body') ?? root;
  let sheets = fromTables(body, title);
  if (sheets.length === 0) sheets = fromCharts(body, title);
  if (sheets.length === 0) sheets = fromLists(body, title);
  if (sheets.length === 0) sheets = fromBoxes(body, title);
  if (sheets.length === 0) throw new Error('กล่องนี้ไม่มีข้อมูลที่ส่งออกเป็น Excel ได้');
  await exportSheets(safeFilename(title), sheets);
}
