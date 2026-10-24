export type SessionKey = 'morning' | 'afternoon';

export type ParsedTaskNote = {
  morning: string;
  afternoon: string;
  /** Text that isn't tagged with [Morning] or [Afternoon] */
  general: string;
};

/**
 * The task note is stored as one string such as
 * "[Morning] Fixed bugs. [Afternoon] Wrote tests."
 * This splits it back into its sessions.
 */
export function parseTaskNote(note: string | null | undefined): ParsedTaskNote {
  const result: ParsedTaskNote = { morning: '', afternoon: '', general: '' };
  if (!note) return result;

  // parts: [leading text, "Morning", text, "Afternoon", text, ...]
  const parts = note.split(/\[(Morning|Afternoon)\]\s*/i);
  result.general = (parts[0] ?? '').trim();

  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].toLowerCase() as SessionKey;
    result[key] = (parts[i + 1] ?? '').trim();
  }
  return result;
}

/**
 * Which session a photo belongs to, if the API says so
 * (a `session` or `period` field). Returns null when unknown.
 */
export function photoSession(photo: any): SessionKey | null {
  const raw = String(photo?.session ?? photo?.period ?? '').toLowerCase();
  if (raw.startsWith('morn')) return 'morning';
  if (raw.startsWith('after')) return 'afternoon';
  return null;
}

export function minutesBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.round(diff / 60000));
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}