import * as XLSX from 'xlsx';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';
import { format } from 'date-fns';
import type { TimeLogEntry } from './queries/timelog';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type AttendanceExcelOptions = {
  /** Required: the coordinator's import matches students by this */
  studentNumber: string;
  fileName?: string;
};

export type AttendanceExcelResult = {
  /** Absolute path in the app cache directory (no `file://` prefix) */
  path: string;
  fileName: string;
  rowCount: number;
};

const hm = (iso?: string | null) => (iso ? format(new Date(iso), 'HH:mm') : '');

/**
 * One row per finished shift. The first seven columns are the template the
 * coordinator imports, so don't rename or reorder them.
 */
export function buildAttendanceRows(
  logs: TimeLogEntry[],
  studentNumber: string,
) {
  return logs
    .filter(l => l.time_in && l.time_out) // open shifts can't be imported
    .sort(
      (a, b) =>
        new Date(a.time_in as string).getTime() -
        new Date(b.time_in as string).getTime(),
    )
    .map(l => {
      // Shift that ended while on break: only the morning counts
      const endedOnBreak = Boolean(l.break_out && !l.break_in);
      const hasBreak = Boolean(l.break_out && l.break_in);

      return {
        'Student Number': studentNumber,
        Date: format(new Date(l.time_in as string), 'yyyy-MM-dd'),
        'Time In': hm(l.time_in),
        'Break Out': hasBreak ? hm(l.break_out) : '',
        'Break In': hasBreak ? hm(l.break_in) : '',
        'Time Out': endedOnBreak ? hm(l.break_out) : hm(l.time_out),
        'Task Note': (l.task_note ?? '').trim(),
        Hours: l.duration_hours ?? '', // extra column, ignored by the import
      };
    });
}

/** Builds the .xlsx in the cache directory WITHOUT opening it. */
export async function buildAttendanceExcel(
  logs: TimeLogEntry[],
  opts: AttendanceExcelOptions,
): Promise<AttendanceExcelResult> {
  const rows = buildAttendanceRows(logs, opts.studentNumber);
  const fileName =
    opts.fileName ?? `attendance-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [
      'Student Number',
      'Date',
      'Time In',
      'Break Out',
      'Break In',
      'Time Out',
      'Task Note',
      'Hours',
    ],
  });
  ws['!cols'] = [
    { wch: 16 },
    { wch: 12 },
    { wch: 9 },
    { wch: 10 },
    { wch: 9 },
    { wch: 9 },
    { wch: 50 },
    { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  await ReactNativeBlobUtil.fs.writeFile(path, base64, 'base64');

  return { path, fileName, rowCount: rows.length };
}

/**
 * iOS: share/save menu. Android: "open with" chooser; if no spreadsheet app
 * is installed, the file is saved to the Downloads folder instead.
 * Returns 'opened' or 'saved' so the screen can tell the user what happened.
 */
export async function openExcelFile(
  path: string,
  fileName: string,
): Promise<'opened' | 'saved'> {
  if (Platform.OS === 'ios') {
    await ReactNativeBlobUtil.ios.presentOptionsMenu(path);
    return 'opened';
  }

  try {
    await ReactNativeBlobUtil.android.actionViewIntent(path, XLSX_MIME);
    return 'opened';
  } catch {
    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
      { name: fileName, parentFolder: '', mimeType: XLSX_MIME },
      'Download',
      path,
    );
    return 'saved';
  }
}