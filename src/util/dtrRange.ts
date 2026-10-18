import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

export type DateRange = { from: Date; to: Date };

export function filterLogsByRange<T extends { time_in: string | null }>(
  logs: T[],
  range?: DateRange | null,
): T[] {
  if (!range) return logs;
  const interval = { start: startOfDay(range.from), end: endOfDay(range.to) };
  return logs.filter(l => {
    if (!l.time_in) return false;
    const d = new Date(l.time_in);
    return !isNaN(d.getTime()) && isWithinInterval(d, interval);
  });
}

export const fileSuffix = (range?: DateRange | null) =>
  range ? `_${format(range.from, 'yyyyMMdd')}-${format(range.to, 'yyyyMMdd')}` : '';