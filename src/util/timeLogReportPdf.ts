import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RowInput, Styles } from 'jspdf-autotable';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';
import type { TimeLogEntry } from './queries/timelog';
import { parseTaskNote } from './taskNote';
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
    /** Left signature: company supervisor ("Noted by") */
    supervisorBy?: { name: string; title?: string | null; organization?: string };
    /** Right signature: the intern ("Prepared by") */
    studentBy?: { name: string };
    school?: { name?: string; address?: string; college?: string; subject?: string };
    /** https URL or `data:image/png;base64,...`. jsPDF can't embed webp. */
    logos?: { left?: string | null; right?: string | null };
    imageHeaders?: Record<string, string>;
    fileName?: string;
};

type Photo = { dataUri: string; format: 'JPEG' | 'PNG'; w: number; h: number };
type RGB = [number, number, number];

type ReportSession = {
    present: boolean;
    task_note: string;
    hours: number;
    timeRange?: string;
    photoUrl?: string | null;
};

export type WeeklyReportRow = {
    date: Date;
    morning?: ReportSession;
    afternoon?: ReportSession;
    empty?: boolean;
};

const ORANGE: RGB = [237, 125, 49];
const PEACH: RGB = [251, 228, 213];
const WHITE: RGB = [255, 255, 255];
const NAVY: RGB = [31, 56, 100];
const RULE_BLUE: RGB = [68, 114, 196];
const INK: RGB = [30, 30, 30];
const MUTED: RGB = [120, 120, 120];
const MARGIN = 18;
const PHOTO_ROW_HEIGHT = 30;

type SessionKey = 'morning' | 'afternoon';

// ── Week helpers ──────────────────────────────────────────────────

export const getWeekStart = (d: Date = new Date()) => startOfWeek(d, { weekStartsOn: 1 });

export function getWeekRange(weekStart: Date) {
    return { start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) };
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

// ── Per-session accumulator (a day can have more than one log) ────

type Acc = {
    present: boolean;
    start: number | null;
    end: number | null;
    minutes: number;
    notes: Set<string>;
    photoUrl: string | null;
};

const newAcc = (): Acc => ({
    present: false,
    start: null,
    end: null,
    minutes: 0,
    notes: new Set(),
    photoUrl: null,
});

function addRange(acc: Acc, startIso: string, endIso: string) {
    const start = Date.parse(startIso);
    if (Number.isNaN(start)) return;

    acc.present = true;
    acc.start = acc.start === null ? start : Math.min(acc.start, start);

    if (!endIso) return;
    const end = Date.parse(endIso);
    if (Number.isNaN(end)) return;

    acc.end = acc.end === null ? end : Math.max(acc.end, end);
    acc.minutes += Math.max(0, Math.round((end - start) / 60000));
}

function toSession(acc: Acc): ReportSession {
    const hasRange = acc.present && acc.start !== null;
    return {
        present: acc.present,
        task_note: acc.present
            ? Array.from(acc.notes).join('\n') || 'No accomplishment recorded.'
            : '—',
        hours: Math.round((acc.minutes / 60) * 10) / 10,
        timeRange: hasRange
            ? `${format(acc.start as number, 'h:mm a')} – ${
                  acc.end !== null ? format(acc.end, 'h:mm a') : 'ongoing'
              }`
            : undefined,
        photoUrl: acc.photoUrl,
    };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// A photo belongs to the afternoon if it was uploaded after the break ended
function photoSession(photo: any, breakIn: string): SessionKey {
    const raw = String(photo?.session ?? photo?.period ?? '').toLowerCase();
    if (raw.startsWith('morn')) return 'morning';
    if (raw.startsWith('after')) return 'afternoon';

    const stamp = str(photo?.submitted_at) || str(photo?.created_at);
    if (stamp && breakIn) {
        const uploaded = Date.parse(stamp);
        const resumed = Date.parse(breakIn);
        if (!Number.isNaN(uploaded) && !Number.isNaN(resumed)) {
            return uploaded >= resumed ? 'afternoon' : 'morning';
        }
    }
    return 'morning';
}

/**
 * One entry per weekday (Mon–Fri), each with a morning and afternoon session.
 * Sat/Sun are only included when the student logged time.
 *   Morning   = time in  → break out (or time out if no break)
 *   Afternoon = break in → time out
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

        if (i >= 5 && dayLogs.length === 0) continue;
        if (dayLogs.length === 0) {
            rows.push({ date: day, empty: true });
            continue;
        }

        const morning = newAcc();
        const afternoon = newAcc();

        for (const log of dayLogs) {
            const l = log as any;
            const timeIn = str(l.time_in);
            const breakOut = str(l.break_out);
            const breakIn = str(l.break_in);
            const timeOut = str(l.time_out);

            addRange(morning, timeIn, breakOut || timeOut);
            if (breakIn) addRange(afternoon, breakIn, timeOut);

            const rawNote = str(l.task_note).trim();
            if (rawNote) {
                const note = parseTaskNote(rawNote);
                if (note.morning) {
                    morning.present = true;
                    morning.notes.add(note.morning);
                }
                if (note.afternoon) {
                    afternoon.present = true;
                    afternoon.notes.add(note.afternoon);
                }
                if (note.general) {
                    morning.present = true;
                    morning.notes.add(note.general);
                }
            }

            for (const p of l.task_photos ?? []) {
                if (!p?.url) continue;
                const target = photoSession(p, breakIn) === 'afternoon' ? afternoon : morning;
                if (!target.photoUrl) target.photoUrl = p.url;
            }
        }

        rows.push({ date: day, morning: toSession(morning), afternoon: toSession(afternoon) });
    }

    return rows;
}

// ── Table body ────────────────────────────────────────────────────

const cell = (content: string, fill: RGB, extra: Partial<Styles> = {}) => ({
    content,
    styles: { fillColor: fill, ...extra } as Partial<Styles>,
});

const roundHours = (v: number) => Math.round(v * 10) / 10;

function buildBody(rows: WeeklyReportRow[]) {
    const body: RowInput[] = [];
    const photoUrls: (string | null)[] = [];
    let totalHours = 0;

    rows.forEach((r, dayIdx) => {
        const fill = dayIdx % 2 === 0 ? PEACH : WHITE;
        const dateStr = format(r.date, 'MM/dd/yyyy');
        const dateStyles: Partial<Styles> = { halign: 'center', fontStyle: 'bold', valign: 'middle' };

        if (r.empty) {
            body.push([
                cell(dateStr, fill, dateStyles),
                {
                    ...cell('No time log recorded.', fill, {
                        halign: 'center',
                        fontStyle: 'italic',
                        textColor: MUTED,
                    }),
                    colSpan: 4,
                },
            ]);
            photoUrls.push(null);
            return;
        }

        const sessions: [string, ReportSession][] = [
            ['Morning', r.morning ?? { present: false, task_note: '—', hours: 0 }],
            ['Afternoon', r.afternoon ?? { present: false, task_note: '—', hours: 0 }],
        ];

        sessions.forEach(([label, s], i) => {
            totalHours += s.hours;
            const sessionCell = cell(
                s.timeRange ? `${label}\n${s.timeRange}` : label,
                fill,
                { halign: 'center', fontStyle: 'bold', fontSize: 8 },
            );
            const noteCell = cell(
                s.task_note,
                fill,
                s.present ? { halign: 'left' } : { halign: 'left', textColor: MUTED, fontStyle: 'italic' },
            );
            const hoursCell = cell(s.present ? `${s.hours}hrs` : '—', fill, {
                halign: 'center',
                fontStyle: 'bold',
            });
            const photoCell = cell('', fill);

            if (i === 0) {
                body.push([
                    { ...cell(dateStr, fill, dateStyles), rowSpan: 2 },
                    sessionCell,
                    noteCell,
                    hoursCell,
                    photoCell,
                ]);
            } else {
                body.push([sessionCell, noteCell, hoursCell, photoCell]);
            }
            photoUrls.push(s.photoUrl ?? null);
        });
    });

    const totalStyles: Partial<Styles> = { fontStyle: 'bold', textColor: WHITE };
    body.push([
        { ...cell('TOTAL HOURS', ORANGE, { ...totalStyles, halign: 'right' }), colSpan: 3 },
        cell(`${roundHours(totalHours)}hrs`, ORANGE, { ...totalStyles, halign: 'center' }),
        cell('', ORANGE),
    ]);
    photoUrls.push(null);

    return { body, photoUrls };
}

// ── Images ────────────────────────────────────────────────────────

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
    const { studentName, supervisorBy, studentBy, imageHeaders, weekNo, logos } = opts;
    const weekStart = getWeekStart(opts.weekStart);
    const fileName = opts.fileName ?? `weekly-report-${format(weekStart, 'yyyy-MM-dd')}.pdf`;

    const school = {
        name: opts.school?.name ?? 'OPOL COMMUNITY COLLEGE',
        address: opts.school?.address ?? 'Opol Misamis Oriental',
        college: opts.school?.college ?? 'College of Information Technology',
        subject: opts.school?.subject ?? 'IT405 – On-the-Job Training (OJT)',
    };

    const rows = buildWeeklyReportRows(filterLogsToWeek(opts.logs, weekStart), weekStart);
    const { body, photoUrls } = buildBody(rows);

    const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as jsPDF & { lastAutoTable?: { finalY: number } };
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const [leftLogo, rightLogo, ...photos] = await Promise.all([
        loadPhoto(doc, logos?.left),
        loadPhoto(doc, logos?.right),
        ...photoUrls.map((url) => loadPhoto(doc, url, imageHeaders)),
    ]);

    function drawHeader() {
        const logoBox = 20;
        if (leftLogo) {
            const { w, h } = fit(leftLogo, logoBox, logoBox);
            doc.addImage(leftLogo.dataUri, leftLogo.format, MARGIN + 4, 10 + (logoBox - h) / 2, w, h);
        }
        if (rightLogo) {
            const { w, h } = fit(rightLogo, logoBox, logoBox);
            doc.addImage(rightLogo.dataUri, rightLogo.format, pageW - MARGIN - 4 - w, 10 + (logoBox - h) / 2, w, h);
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

    autoTable(doc, {
        startY: 60,
        margin: { top: 44, left: MARGIN, right: MARGIN, bottom: 20 },
        head: [['DATE', 'Session', 'Accomplishments', 'No. of Hours', 'Attachments']],
        body,
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
            textColor: WHITE,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
        },
        columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 26 },
            2: { cellWidth: 'auto', halign: 'left' },
            3: { cellWidth: 20 },
            4: { cellWidth: 46 },
        },
        didParseCell: (d) => {
            if (d.section === 'body' && d.column.index === 4 && photos[d.row.index]) {
                d.cell.styles.minCellHeight = PHOTO_ROW_HEIGHT;
            }
        },
        didDrawCell: (d) => {
            if (d.section !== 'body' || d.column.index !== 4) return;
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

    if (supervisorBy || studentBy) {
        if (y + 36 > pageH - 10) {
            doc.addPage();
            drawHeader();
            y = 50;
        }

        const leftX = MARGIN + 8;
        const rightX = pageW - MARGIN - 62;

        doc.setTextColor(...INK).setFontSize(9).setFont('helvetica', 'normal');
        if (supervisorBy) doc.text('Noted by:', leftX, y);
        if (studentBy) doc.text('Prepared by:', rightX, y);

        doc.setDrawColor(...MUTED).setLineWidth(0.4);
        if (supervisorBy) doc.line(leftX, y + 18, leftX + 70, y + 18);
        if (studentBy) doc.line(rightX, y + 18, rightX + 70, y + 18);

        doc.setFont('helvetica', 'bold').setFontSize(9);
        if (supervisorBy?.name) doc.text(supervisorBy.name.toUpperCase(), leftX, y + 14);
        if (studentBy) doc.text(studentBy.name.toUpperCase(), rightX, y + 14);

        doc.setFont('helvetica', 'normal').setFontSize(8.5);
        let subY = y + 24;
        if (supervisorBy?.title) {
            doc.text(supervisorBy.title.toUpperCase(), leftX, subY);
            subY += 4;
        }
        if (supervisorBy?.organization) {
            doc.text(supervisorBy.organization.toUpperCase(), leftX, subY);
        }
        if (studentBy) doc.text('INTERN', rightX, y + 24);
    }

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