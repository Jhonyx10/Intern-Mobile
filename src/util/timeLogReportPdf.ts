import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';
import type { TimeLogEntry } from './queries/timelog';
import {
    addDays,
    differenceInCalendarWeeks,
    endOfWeek,
    format,
    isWithinInterval,
    startOfWeek,
} from 'date-fns';

export type TimeLogReportOptions = {
    studentName: string;
    logs: TimeLogEntry[];
    /** Any date inside the week to print. It is snapped to that week's Monday. */
    weekStart: Date;
    weekNo?: number | string;
    verifiedBy?: { name: string; organization?: string };
    notedBy?: { name: string; position?: string };
    school?: { name?: string; address?: string; college?: string; subject?: string };
    /**
     * Header logos as an https URL or a `data:image/png;base64,...` URI.
     * jsPDF can only embed PNG and JPEG, so webp logos are skipped.
     */
    logos?: { left?: string | null; right?: string | null };
    imageHeaders?: Record<string, string>;
    fileName?: string;
};

type Photo = { dataUri: string; format: 'JPEG' | 'PNG'; w: number; h: number };

export type WeeklyReportRow = {
    date: Date;
    task_note: string;
    hours: number;
    photoUrl: string | null;
};

const ORANGE: [number, number, number] = [237, 125, 49];
const PEACH: [number, number, number] = [251, 228, 213];
const NAVY: [number, number, number] = [31, 56, 100];
const RULE_BLUE: [number, number, number] = [68, 114, 196];
const INK: [number, number, number] = [30, 30, 30];
const MARGIN = 18;
const PHOTO_ROW_HEIGHT = 30;

// ── Week helpers ──────────────────────────────────────────────────

export const getWeekStart = (d: Date = new Date()) => startOfWeek(d, { weekStartsOn: 1 }); // Monday

export function getWeekRange(weekStart: Date) {
    return { start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) }; // Sunday 23:59:59
}

export function formatWeekLabel(weekStart: Date) {
    const { start, end } = getWeekRange(weekStart);
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

export function filterLogsToWeek(logs: TimeLogEntry[], weekStart: Date) {
    const range = getWeekRange(getWeekStart(weekStart));
    return logs.filter((l) => l.time_in && isWithinInterval(new Date(l.time_in), range));
}

/** Week 1 = the (Mon–Sun) week of the student's first time log. */
export function suggestWeekNo(allLogs: TimeLogEntry[], weekStart: Date): number {
    const times = allLogs
        .filter((l) => l.time_in)
        .map((l) => new Date(l.time_in as string).getTime());
    if (times.length === 0) return 1;
    const first = new Date(Math.min(...times));
    return Math.max(1, differenceInCalendarWeeks(weekStart, first, { weekStartsOn: 1 }) + 1);
}

/**
 * One row per weekday (Mon–Fri) of the week containing `weekStart`.
 * Saturday / Sunday are only included when the student logged time on them.
 * Same behaviour as the web report.
 */
export function buildWeeklyReportRows(logs: TimeLogEntry[], weekStart: Date): WeeklyReportRow[] {
    const monday = getWeekStart(weekStart);

    const byDay = new Map<string, TimeLogEntry[]>();
    for (const log of logs) {
        if (!log.time_in) continue;
        const key = format(new Date(log.time_in), 'yyyy-MM-dd');
        const list = byDay.get(key) ?? [];
        list.push(log);
        byDay.set(key, list);
    }

    const rows: WeeklyReportRow[] = [];

    for (let i = 0; i < 7; i++) {
        const day = addDays(monday, i);
        const dayLogs = (byDay.get(format(day, 'yyyy-MM-dd')) ?? []).sort(
            (a, b) => new Date(a.time_in as string).getTime() - new Date(b.time_in as string).getTime(),
        );

        const isWeekend = i >= 5;
        if (isWeekend && dayLogs.length === 0) continue;

        const minutes = dayLogs.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);

        const tasks = Array.from(
            new Set(dayLogs.map((l) => l.task_note?.trim() ?? '').filter(Boolean)),
        );

        let photoUrl: string | null = null;
        for (const l of dayLogs) {
            const url = l.task_photos?.[0]?.url;
            if (url) {
                photoUrl = url;
                break;
            }
        }

        rows.push({
            date: day,
            task_note:
                dayLogs.length === 0
                    ? 'No time log recorded.'
                    : tasks.length > 0
                      ? tasks.join('\n')
                      : 'No accomplishment recorded.',
            hours: Math.round((minutes / 60) * 10) / 10,
            photoUrl,
        });
    }

    return rows;
}

// ── Images ────────────────────────────────────────────────────────

// Accepts an https URL or a data: URI. jsPDF can't embed webp, so those are
// skipped (the PDF still exports).
async function loadPhoto(
    doc: jsPDF,
    src?: string | null,
    headers?: Record<string, string>,
): Promise<Photo | null> {
    if (!src) return null;
    try {
        let mime: string;
        let base64: string;

        if (src.startsWith('data:')) {
            const m = src.match(/^data:([^;,]+)[^,]*;base64,(.*)$/);
            if (!m) return null;
            mime = m[1];
            base64 = m[2];
        } else {
            const res = await ReactNativeBlobUtil.fetch('GET', src, headers);
            const info = res.info();
            if (info.status < 200 || info.status >= 300) return null;
            mime = String(info.headers['Content-Type'] || info.headers['content-type'] || '').split(';')[0];
            base64 = res.base64();
        }

        const imgFormat =
            mime === 'image/png' ? 'PNG' : mime === 'image/jpeg' || mime === 'image/jpg' ? 'JPEG' : null;
        if (!imgFormat) return null;

        const dataUri = `data:${mime};base64,${base64}`;
        const props = doc.getImageProperties(dataUri);
        return { dataUri, format: imgFormat, w: props.width, h: props.height };
    } catch {
        return null;
    }
}

function fit(p: Photo, maxW: number, maxH: number) {
    const r = Math.min(maxW / p.w, maxH / p.h);
    return { w: p.w * r, h: p.h * r };
}

// ── PDF ───────────────────────────────────────────────────────────

export async function exportTimeLogReportPdf(opts: TimeLogReportOptions) {
    const { studentName, verifiedBy, notedBy, imageHeaders, weekNo, logos } = opts;
    const weekStart = getWeekStart(opts.weekStart);
    const fileName = opts.fileName ?? `weekly-report-${format(weekStart, 'yyyy-MM-dd')}.pdf`;

    const school = {
        name: opts.school?.name ?? 'OPOL COMMUNITY COLLEGE',
        address: opts.school?.address ?? 'Opol Misamis Oriental',
        college: opts.school?.college ?? 'College of Information Technology',
        subject: opts.school?.subject ?? 'IT405 – On-the-Job Training (OJT)',
    };

    // One row per weekday, same as the web report
    const rows = buildWeeklyReportRows(filterLogsToWeek(opts.logs, weekStart), weekStart);

    const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as jsPDF & { lastAutoTable?: { finalY: number } };
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Load every image first so the document can be built synchronously
    const [leftLogo, rightLogo, ...photos] = await Promise.all([
        loadPhoto(doc, logos?.left),
        loadPhoto(doc, logos?.right),
        ...rows.map((r) => loadPhoto(doc, r.photoUrl, imageHeaders)),
    ]);

    function drawHeader() {
        const logoBox = 20;
        if (leftLogo) {
            const { w, h } = fit(leftLogo, logoBox, logoBox);
            doc.addImage(leftLogo.dataUri, leftLogo.format, MARGIN + 4, 10 + (logoBox - h) / 2, w, h);
        }
        if (rightLogo) {
            const { w, h } = fit(rightLogo, logoBox, logoBox);
            doc.addImage(
                rightLogo.dataUri,
                rightLogo.format,
                pageW - MARGIN - 4 - w,
                10 + (logoBox - h) / 2,
                w,
                h,
            );
        }

        const cx = pageW / 2;
        doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...NAVY);
        doc.text(school.name, cx, 16, { align: 'center' });
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...NAVY);
        doc.text(school.address, cx, 20.5, { align: 'center' });
        doc.setFontSize(9.5);
        doc.text(school.college, cx, 25.5, { align: 'center' });
        doc.setFontSize(7.5).setTextColor(90, 90, 90);
        doc.text(school.subject, cx, 30, { align: 'center' });
        doc.text('WEEKLY REPORT', cx, 33.5, { align: 'center' });
        doc.setDrawColor(...RULE_BLUE).setLineWidth(0.8);
        doc.line(MARGIN, 37, pageW - MARGIN, 37);
    }

    // ── Page 1: header + student info ──
    drawHeader();

    doc.setFontSize(10).setTextColor(...INK).setFont('helvetica', 'normal');
    doc.text('Name of Student:', MARGIN + 4, 47);
    doc.setFont('helvetica', 'bold');
    doc.text(studentName, MARGIN + 4 + doc.getTextWidth('Name of Student:  '), 47);

    const weekLabel = weekNo ? 'Week No.:' : 'Week:';
    doc.setFont('helvetica', 'normal');
    doc.text(weekLabel, MARGIN + 4, 54);
    doc.setFont('helvetica', 'bold');
    const weekText = weekNo ? String(weekNo) : formatWeekLabel(weekStart);
    doc.text(weekText, MARGIN + 4 + doc.getTextWidth(weekLabel + '  '), 54);

    // ── Table ──
    autoTable(doc, {
        startY: 60,
        margin: { top: 44, left: MARGIN, right: MARGIN, bottom: 20 },
        head: [['DATE', 'Accomplishments', 'No. of Hours', 'Attachments']],
        body: rows.map((r) => [
            format(r.date, 'MM/dd/yyyy'),
            r.task_note,
            `${r.hours}hrs`,
            '',
        ]),
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 9,
            textColor: INK,
            cellPadding: 3,
            valign: 'middle',
            lineColor: ORANGE,
            lineWidth: 0.2,
        },
        headStyles: {
            fillColor: ORANGE,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
        },
        bodyStyles: { fillColor: PEACH },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        columnStyles: {
            0: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 'auto', halign: 'left' },
            2: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
            3: { cellWidth: 50 },
        },
        didParseCell: (d) => {
            // Give rows with an attachment enough height for the photo
            if (d.section === 'body' && d.column.index === 3 && photos[d.row.index]) {
                d.cell.styles.minCellHeight = PHOTO_ROW_HEIGHT;
            }
        },
        didDrawCell: (d) => {
            if (d.section !== 'body' || d.column.index !== 3) return;
            const p = photos[d.row.index];
            if (!p) return;
            const pad = 2;
            const { w, h } = fit(p, d.cell.width - pad * 2, d.cell.height - pad * 2);
            doc.addImage(
                p.dataUri,
                p.format,
                d.cell.x + (d.cell.width - w) / 2,
                d.cell.y + (d.cell.height - h) / 2,
                w,
                h,
            );
        },
        didDrawPage: (d) => {
            if (d.pageNumber > 1) drawHeader();
        },
    });

    // ── Signatures ──
    let y = (doc.lastAutoTable?.finalY ?? 100) + 14;

    if (verifiedBy || notedBy) {
        if (y + 36 > pageH - 10) {
            doc.addPage();
            drawHeader();
            y = 50;
        }
        const leftX = MARGIN + 8;
        const rightX = pageW - MARGIN - 62;

        doc.setTextColor(...INK).setFontSize(9).setFont('helvetica', 'normal');
        if (verifiedBy) doc.text('Verified by:', leftX, y);
        if (notedBy) doc.text('Noted by:', rightX, y);

        doc.setFont('helvetica', 'bold');
        if (verifiedBy) doc.text(verifiedBy.name.toUpperCase(), leftX, y + 14);
        if (notedBy) doc.text(notedBy.name.toUpperCase(), rightX, y + 14);

        doc.setFontSize(8.5);
        if (verifiedBy?.organization) doc.text(verifiedBy.organization.toUpperCase(), leftX, y + 24);
        if (notedBy?.position) doc.text(notedBy.position.toUpperCase(), rightX, y + 24);
    }

    // No doc.save() in RN: export base64 and write it with blob-util
    const base64 = doc.output('datauristring').split(',')[1];
    const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
    await ReactNativeBlobUtil.fs.writeFile(path, base64, 'base64');

    if (Platform.OS === 'ios') {
        await ReactNativeBlobUtil.ios.presentOptionsMenu(path);
    } else {
        await ReactNativeBlobUtil.android.actionViewIntent(path, 'application/pdf');
    }
    return path;
}