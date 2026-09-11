export function withAlpha(hex: string, alpha: string) {
    return `${hex}${alpha}`;
}

export function formatLogTime(isoString?: string | null) {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export type PunchPhase = 'punch_in' | 'break_out' | 'break_in' | 'punch_out' | 'done';

export function getPunchPhase(status: any): PunchPhase {
    if (status.today_segments?.length > 0 && !status.open_log) return 'done';
    if (!status.open_log) {
        if (status.today_attendance?.status === 'completed') return 'done';
        return 'punch_in';
    }
    if (!status.open_log.break_out) return 'break_out';
    if (!status.open_log.break_in) return 'break_in';
    return 'punch_out';
}

export function isPointInPolygon(point: [number, number], vs: number[][]): boolean {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}