import { Chart } from 'chart.js';

/** ความกว้างพื้นที่พิมพ์ของ A4 แนวตั้ง (px @96dpi หลังหักขอบกระดาษมาตรฐานของเบราว์เซอร์) */
const PRINT_WIDTH = 718;
const PRINT_CHART_MAX_HEIGHT = 340;
/** ขนาดโดนัทตอนพิมพ์ (วงใหญ่ กลางหน้า) */
const PRINT_DONUT_SIZE = 280;

/**
 * ตารางข้อมูลที่สร้างจากกราฟตอนพิมพ์ — กำหนดที่กล่องกราฟด้วย data-print-table
 * - sum   = มีคอลัมน์สัดส่วน (%) และแถวรวมทั้งหมด (ข้อมูลนับจำนวน)
 * - total = มีแถวรวมทั้งหมดอย่างเดียว (เช่น เทียบหลายปี ที่รวมข้ามปีแล้วไม่มีความหมาย)
 * - plain = ค่าตามกราฟอย่างเดียว (เช่น เวลาเฉลี่ย ที่รวมกันแล้วไม่มีความหมาย)
 * - none  = ไม่ต้องสร้าง
 * data-print-category = หัวคอลัมน์แรก (เช่น "เดือน")
 */
export type PrintTableMode = 'sum' | 'total' | 'plain' | 'none';

const isPie = (chart: Chart) => ['doughnut', 'pie', 'polarArea'].includes((chart.config as { type?: string }).type ?? '');

function formatValue(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const percent = (value: number, total: number) => (total ? `${((value / total) * 100).toFixed(1)}%` : '-');

function cell(tag: 'th' | 'td', text: string, options: { num?: boolean; color?: string } = {}) {
  const el = document.createElement(tag);
  if (options.num) el.className = 'num';
  if (options.color) {
    const dot = document.createElement('span');
    dot.className = 'print-dot';
    dot.style.background = options.color;
    el.append(dot);
  }
  el.append(text);
  return el;
}

function row(cells: HTMLTableCellElement[], className?: string) {
  const tr = document.createElement('tr');
  if (className) tr.className = className;
  tr.append(...cells);
  return tr;
}

/** สีของชุดข้อมูล/แต่ละชิ้น (ใช้ทำจุดสีหน้าชื่อ) */
function colorOf(color: unknown, index = 0): string | undefined {
  const value: unknown = Array.isArray(color) ? color[index] : color;
  return typeof value === 'string' ? value : undefined;
}

/** สร้างตารางแบบเอกสารจากข้อมูลในกราฟ (ป้าย × ชุดข้อมูล) */
function buildTable(chart: Chart, mode: PrintTableMode, categoryLabel: string) {
  const pie = isPie(chart);
  const labels = (chart.data.labels ?? []).map(String);
  const datasets = chart.data.datasets.map(ds => ({
    label: ds.label || 'จำนวน',
    color: pie ? undefined : colorOf(ds.borderColor) ?? colorOf(ds.backgroundColor),
    values: labels.map((_, li) => {
      const v = ds.data[li];
      return typeof v === 'number' ? v : null;
    }),
  }));
  const sum = mode === 'sum';
  const withTotalRow = sum || mode === 'total';
  const sumOf = (values: (number | null)[]) => values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const rowTotal = labels.map((_, li) => sumOf(datasets.map(d => d.values[li])));
  // โดนัท / ชุดเดียว: % เทียบผลรวมของชุดนั้น | หลายชุด: คอลัมน์รวม + % ของแต่ละชุดเทียบยอดรวมของแถว
  const shareEach = sum && (pie || datasets.length === 1);
  const withRowTotal = sum && !pie && datasets.length > 1;
  const shareOfRow = withRowTotal && datasets.length <= 3;

  const head = [cell('th', categoryLabel)];
  for (const d of datasets) {
    head.push(cell('th', d.label, { num: true, color: d.color }));
    if (shareEach) head.push(cell('th', datasets.length > 1 ? `สัดส่วน${d.label} (%)` : 'สัดส่วน (%)', { num: true }));
  }
  if (withRowTotal) head.push(cell('th', 'รวมทั้งหมด', { num: true }));
  if (shareOfRow) for (const d of datasets) head.push(cell('th', `สัดส่วน ${d.label} (%)`, { num: true }));
  const thead = document.createElement('thead');
  thead.append(row(head));

  const tbody = document.createElement('tbody');
  labels.forEach((label, li) => {
    const cells = [cell('td', label, { color: pie ? colorOf(chart.data.datasets[0]?.backgroundColor, li) : undefined })];
    for (const d of datasets) {
      cells.push(cell('td', formatValue(d.values[li]), { num: true }));
      if (shareEach) cells.push(cell('td', percent(d.values[li] ?? 0, sumOf(d.values)), { num: true }));
    }
    if (withRowTotal) cells.push(cell('td', formatValue(rowTotal[li]), { num: true }));
    if (shareOfRow) for (const d of datasets) cells.push(cell('td', percent(d.values[li] ?? 0, rowTotal[li]), { num: true }));
    tbody.append(row(cells));
  });

  const table = document.createElement('table');
  table.className = 'print-generated';
  table.append(thead, tbody);

  if (withTotalRow) {
    const grand = sumOf(rowTotal);
    const cells = [cell('td', 'รวมทั้งหมด (Total)')];
    for (const d of datasets) {
      cells.push(cell('td', formatValue(sumOf(d.values)), { num: true }));
      if (shareEach) cells.push(cell('td', '100.0%', { num: true }));
    }
    if (withRowTotal) cells.push(cell('td', formatValue(grand), { num: true }));
    if (shareOfRow) for (const d of datasets) cells.push(cell('td', percent(sumOf(d.values), grand), { num: true }));
    const tfoot = document.createElement('tfoot');
    tfoot.append(row(cells, 'total-row'));
    table.append(tfoot);
  }
  return table;
}

/**
 * พิมพ์ / บันทึก PDF เฉพาะกล่องที่เลือก ให้ออกมาเป็นเอกสารรายงาน: หัวเรื่อง → กราฟ → ตารางข้อมูลมีเส้น (% + แถวรวม)
 * - ส่วนอื่นของหน้าถูกซ่อนด้วย CSS (@media print, body.printing-table) — ปุ่มที่ไม่ต้องการให้ติดไปให้ใส่ class "no-print"
 * - กล่องที่ยังไม่มีตาราง จะสร้างตารางจากข้อมูลในกราฟให้อัตโนมัติ (ดู PrintTableMode)
 * - กราฟถูกวาดใหม่ตามขนาดกระดาษ (โดนัท = วงใหญ่กลางหน้า) แล้วคืนขนาดเดิมหลังพิมพ์
 * - ชื่อไฟล์ PDF ที่เบราว์เซอร์เสนอจะเป็นชื่อหัวข้อของกล่อง
 */
export function printElement(element: HTMLElement, title?: string) {
  // ไล่ class ขึ้นไปถึง body เพื่อให้ CSS ซ่อนเฉพาะสิ่งที่ไม่เกี่ยวข้อง (ไม่เหลือหน้าว่างท้ายเอกสาร)
  const path: HTMLElement[] = [];
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    node.classList.add('print-path');
    path.push(node);
  }
  element.classList.add('print-target');
  document.body.classList.add('printing-table');

  const charts = Array.from(element.querySelectorAll('canvas'))
    .map(canvas => Chart.getChart(canvas))
    .filter((chart): chart is Chart => chart !== undefined);

  // ตารางข้อมูลจากกราฟ — เฉพาะกล่องที่ยังไม่มีตารางให้เห็นในงานพิมพ์
  const hasTable = Array.from(element.querySelectorAll('table')).some(table => !table.closest('.no-print'));
  const generated: HTMLElement[] = [];
  if (!hasTable) {
    for (const chart of charts) {
      const holder = chart.canvas.closest<HTMLElement>('[data-print-table]');
      const mode = (holder?.dataset.printTable ?? 'none') as PrintTableMode;
      if (!holder || mode === 'none') continue;
      const table = buildTable(chart, mode, holder.dataset.printCategory || 'รายการ');
      holder.after(table);
      generated.push(table);
    }
  }

  // ป้ายแกนหลักตัวเล็กลงตอนพิมพ์ ให้ชื่อเดือนเรียงแนวนอนได้ครบในความกว้างกระดาษ
  const tickFonts = charts.map(chart => {
    const ticks = (chart.options.scales?.[chart.options.indexAxis === 'y' ? 'y' : 'x'] as { ticks?: { font?: object } } | undefined)?.ticks;
    const original = ticks?.font;
    if (ticks) ticks.font = { ...original, size: 9 };
    return { ticks, original };
  });

  const donutBoxes: { box: HTMLElement; width: string; height: string }[] = [];
  for (const chart of charts) {
    if (isPie(chart)) {
      // โดนัทขยายเป็นวงใหญ่กลางหน้า (ถ้ายืดตามความกว้างกระดาษจะเบี้ยว)
      const box = chart.canvas.parentElement;
      if (box) {
        donutBoxes.push({ box, width: box.style.width, height: box.style.height });
        box.style.width = box.style.height = `${PRINT_DONUT_SIZE}px`;
      }
      chart.resize(PRINT_DONUT_SIZE, PRINT_DONUT_SIZE);
    } else {
      // กราฟที่ซ่อนบนจอ (print-only-block) มีความสูง 0 → ใช้ความสูงที่กำหนดไว้ในกล่องกราฟแทน
      const height = chart.height || chart.canvas.parentElement?.clientHeight || parseFloat(chart.canvas.parentElement?.style.height ?? '') || 300;
      chart.resize(PRINT_WIDTH, Math.min(height, PRINT_CHART_MAX_HEIGHT));
    }
    chart.update('none');
  }

  const previousTitle = document.title;
  if (title) document.title = title;

  const cleanup = () => {
    element.classList.remove('print-target');
    for (const node of path) node.classList.remove('print-path');
    document.body.classList.remove('printing-table');
    document.title = previousTitle;
    for (const table of generated) table.remove();
    for (const { box, width, height } of donutBoxes) {
      box.style.width = width;
      box.style.height = height;
    }
    for (const { ticks, original } of tickFonts) if (ticks) ticks.font = original;
    for (const chart of charts) chart.resize();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
