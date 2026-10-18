import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { DateRange, filterLogsByRange, fileSuffix } from './dtrRange';

/* ── PDF layout: Civil Service Form 48 style ──────────────────── */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Letter portrait = 215.9 x 279.4 mm
const PAGE_MARGIN = 8;
const COPY_WIDTH = 96;
const TABLE_START_Y = 58;

type Cell = string | number;

// 12-hour clock without AM/PM, because the column already says which it is
function clock(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function scheduleClock(t?: string | null): string {
  const m = t?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${Number(m[1]) % 12 || 12}:${m[2]}`;
}

function groupByMonth(logs: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const log of logs) {
    const d = new Date(log.time_in);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(log);
  }
  return map;
}

function buildRows(logs: any[], requiredMinutes: number) {
  const byDay = new Map<number, any[]>();
  for (const log of logs) {
    const day = new Date(log.time_in).getDate();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(log);
  }

  const rows: Cell[][] = [];
  let underTotal = 0;
  let workedTotal = 0;

  for (let day = 1; day <= 31; day++) {
    const dayLogs = (byDay.get(day) ?? []).sort(
      (a, b) => new Date(a.time_in).getTime() - new Date(b.time_in).getTime(),
    );

    let amIn = '', amOut = '', pmIn = '', pmOut = '';
    let worked = 0;
    let completed = false;

    for (const log of dayLogs) {
      const toDate = (v?: string | null) => {
        if (!v) return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      };
      const inD = new Date(log.time_in);
      const outD = toDate(log.time_out);
      const brkOut = toDate(log.break_out);
      const brkIn = toDate(log.break_in);

      if (brkOut || brkIn) {
        // Full shift with a lunch break: maps straight onto the four columns
        if (!amIn) amIn = clock(inD);
        if (brkOut) amOut = clock(brkOut);
        if (brkIn) pmIn = clock(brkIn);
        if (outD) pmOut = clock(outD);
      } else if (inD.getHours() < 12) {
        if (!amIn) amIn = clock(inD);
        if (outD) {
          // A single punch that runs past noon: time out goes in the PM departure
          if (outD.getHours() < 12) amOut = clock(outD);
          else pmOut = clock(outD);
        }
      } else {
        if (!pmIn) pmIn = clock(inD);
        if (outD) pmOut = clock(outD);
      }

      // Fallback when duration_minutes is missing: elapsed time minus the break
      const breakMinutes =
        brkOut && brkIn
          ? Math.max(0, Math.round((brkIn.getTime() - brkOut.getTime()) / 60000))
          : 0;
      worked +=
        log.duration_minutes ??
        (outD
          ? Math.max(0, Math.round((outD.getTime() - inD.getTime()) / 60000) - breakMinutes)
          : 0);
      if (outD) completed = true;
    }

    const under = completed ? Math.max(0, requiredMinutes - worked) : 0;
    underTotal += under;
    workedTotal += worked;

    rows.push([
      day,
      amIn,
      amOut,
      pmIn,
      pmOut,
      under ? Math.floor(under / 60) : '',
      under ? under % 60 : '',
    ]);
  }

  return { rows, underTotal, workedTotal };
}

function drawCopy(
  doc: jsPDF,
  x: number,
  ctx: {
    name: string;
    company: string;
    monthLabel: string;
    year: number;
    official: string;
    rows: Cell[][];
    underTotal: number;
    workedTotal: number;
  },
) {
  const w = COPY_WIDTH;
  const mid = x + w / 2;
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DAILY TIME RECORD', mid, 14, { align: 'center' });

  // Name on a line
  doc.setFontSize(9);
  doc.text(ctx.name, mid, 25, { align: 'center', maxWidth: w - 10 });
  doc.line(x + 4, 26.5, x + w - 4, 26.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('(Name)', mid, 30, { align: 'center' });

  // For the month of
  doc.setFontSize(8);
  doc.text('For the month of', x + 4, 37);
  doc.line(x + 27, 37.5, x + w - 4, 37.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`${ctx.monthLabel} ${ctx.year}`, x + 28, 36.6);

  // Company
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Company', x + 4, 43);
  doc.line(x + 20, 43.5, x + w - 4, 43.5);
  if (ctx.company) {
    doc.setFont('helvetica', 'bold');
    // Shrink long company names so they stay on the line
    let size = 8;
    doc.setFontSize(size);
    while (size > 5 && doc.getTextWidth(ctx.company) > w - 26) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    doc.text(ctx.company, x + 21, 42.6);
  }

  // Official hours
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Official hours for arrival and departure', x + 4, 49);
  doc.text('Regular days', x + 4, 53.5);
  doc.line(x + 22, 54, x + 54, 54);
  doc.text('Saturdays', x + 57, 53.5);
  doc.line(x + 71, 54, x + w - 4, 54);
  if (ctx.official) {
    doc.setFont('helvetica', 'bold');
    doc.text(ctx.official, x + 38, 53.2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  // Table
  autoTable(doc, {
    startY: TABLE_START_Y,
    margin: { left: x, right: PAGE_MARGIN },
    tableWidth: w,
    theme: 'grid',
    head: [
      [
        { content: 'Day', rowSpan: 2 },
        { content: 'A.M.', colSpan: 2 },
        { content: 'P.M.', colSpan: 2 },
        { content: 'Undertime', colSpan: 2 },
      ],
      ['Arrival', 'Depart.', 'Arrival', 'Depart.', 'Hours', 'Min.'],
    ],
    body: ctx.rows.map(r => r.map(c => String(c))),
    foot: [
      [
        { content: 'Total', colSpan: 5, styles: { halign: 'left' } },
        String(Math.floor(ctx.underTotal / 60)),
        String(ctx.underTotal % 60),
      ],
    ],
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 0.6,
      halign: 'center',
      valign: 'middle',
      textColor: 0,
      lineColor: 0,
      lineWidth: 0.2,
      minCellHeight: 5,
    },
    headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold' },
    footStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold' },
    bodyStyles: { fillColor: 255 },
    alternateRowStyles: { fillColor: 255 },
    columnStyles: { 0: { cellWidth: 8, fontStyle: 'bold' } },
  });

  let y: number = ((doc as any).lastAutoTable?.finalY ?? 215) + 5;

  // Total hours rendered this month
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(`Total hours rendered: ${(ctx.workedTotal / 60).toFixed(1)} hrs`, x, y);

  // Certification
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const cert = doc.splitTextToSize(
    'I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.',
    w - 4,
  );
  doc.text(cert, x + 2, y);
  y += cert.length * 3 + 12;

  // Student signature
  doc.line(x + 20, y, x + w - 4, y);
  doc.text('(Signature)', x + 20 + (w - 24) / 2, y + 3.5, { align: 'center' });

  // Verification
  y += 10;
  doc.text('Verified as to the prescribed office hours.', x + 2, y);
  y += 12;
  doc.line(x + 20, y, x + w - 4, y);
  doc.text('In-Charge', x + 20 + (w - 24) / 2, y + 3.5, { align: 'center' });
}

/* ── Public API ───────────────────────────────────────────────── */
export type DtrStudent = {
  name: string;
  company: string;
  /** "HH:mm" strings from the company schedule */
  scheduleIn?: string | null;
  scheduleOut?: string | null;
  hoursPerDay?: number;
};

// The mobile history API returns duration_hours; buildRows expects
// duration_minutes and falls back to elapsed time when it's missing.
const normalize = (logs: any[]) =>
  logs.map(l => ({
    ...l,
    duration_minutes:
      l.duration_minutes ??
      (l.duration_hours != null ? Math.round(Number(l.duration_hours) * 60) : undefined),
  }));

/* ── delivery: save + open/share ──────────────────────────────── */
async function deliver(fileName: string, data: string, encoding: 'base64' | 'utf8', mime: string) {
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  await ReactNativeBlobUtil.fs.writeFile(path, data, encoding);

  if (Platform.OS === 'android') {
    // Copy to the public Downloads folder (no storage permission needed on API 29+)
    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
      { name: fileName, parentFolder: 'DTR', mimeType: mime },
      'Download',
      path,
    );
    await ReactNativeBlobUtil.android.actionViewIntent(path, mime);
  } else {
    // iOS share sheet: Save to Files, AirDrop, Mail, etc.
    ReactNativeBlobUtil.ios.presentOptionsMenu(path);
  }
}

/* ── PDF ──────────────────────────────────────────────────────── */
export async function exportDtrPdf(
  allLogs: any[],
  student: DtrStudent,
  range?: DateRange | null,
) {
  const logs = normalize(filterLogsByRange(allLogs, range));
  if (!logs.length) throw new Error('No time logs in the selected period.');

  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });

  const tIn = scheduleClock(student.scheduleIn);
  const tOut = scheduleClock(student.scheduleOut);
  const official = tIn && tOut ? `${tIn} - ${tOut}` : '';
  const requiredMinutes = (student.hoursPerDay || 8) * 60;

  const grouped = groupByMonth(logs);
  const keys = [...grouped.keys()].sort();
  if (!keys.length) throw new Error('No valid time logs to export.');

  keys.forEach((key, i) => {
    if (i > 0) doc.addPage();
    const [year, month] = key.split('-').map(Number);
    const { rows, underTotal, workedTotal } = buildRows(grouped.get(key) ?? [], requiredMinutes);
    drawCopy(doc, (215.9 - COPY_WIDTH) / 2, {
      name: student.name,
      company: student.company,
      monthLabel: MONTHS[month - 1],
      year,
      official,
      rows,
      underTotal,
      workedTotal,
    });
  });

  // base64 output (not doc.save) — there's no browser download in RN
  const base64 = doc.output('datauristring').split(',')[1];
  const safeName = student.name.replace(/\s+/g, '_') || 'Student';
  await deliver(`${safeName}_DTR${fileSuffix(range)}.pdf`, base64, 'base64', 'application/pdf');
}

/* ── CSV ──────────────────────────────────────────────────────── */
export async function exportDtrCsv(
  allLogs: any[],
  student: DtrStudent,
  range?: DateRange | null,
) {
  const logs = filterLogsByRange(allLogs, range);
  if (!logs.length) throw new Error('No time logs in the selected period.');

  const headers = ['Date', 'Time In', 'Break Out', 'Break In', 'Time Out', 'Duration (hrs)', 'Status'];
  const t = (v?: string | null) => (v ? format(new Date(v), 'hh:mm a') : '');

  const rows = logs.map((l: any) => [
    l.time_in ? format(new Date(l.time_in), 'MMM dd, yyyy') : '',
    t(l.time_in),
    t(l.break_out),
    t(l.break_in),
    l.is_open ? 'Active' : t(l.time_out),
    l.duration_hours != null ? Number(l.duration_hours).toFixed(2) : 'In Progress',
    l.verification_method === 'auto_closed_missed_punch_out' ? 'Auto-closed' : 'Completed',
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const safeName = student.name.replace(/\s+/g, '_') || 'Student';
  await deliver(`${safeName}_DTR${fileSuffix(range)}.csv`, csv, 'utf8', 'text/csv');
}