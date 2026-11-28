import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../api';

export type SessionPeriod = 'early' | 'on_time' | 'late';

interface Geofence {
    required: boolean;
    enabled: boolean;
    configured: boolean;
    company_name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
}

interface LunchBreak {
    lunch_time: string;
    lunch_time_label: string;
    afternoon_start_time: string;
    afternoon_start_label: string;
    policy_message: string;
}

interface TodayAttendance {
    status: string;
    label: string;
    minutes: number;
    hours: number;
    is_scheduled_today: boolean;
    schedule_label: string;
    schedule_time_in: string | null;
    absence_id: number | null;
    needs_justification: boolean;
}

export interface TimeStatus {
    face_enrolled: boolean;
    face_enrolled_at: string | null;
    face_embedding: any;
    can_punch_in: boolean;
    can_punch_out: boolean;
    open_log: any;
    today_segments: any[];
    today_minutes: number;
    today_hours: number;
    geofence: Geofence;
    lunch_break: LunchBreak;
    today_attendance: TodayAttendance;
    placement_status?: 'active' | 'removed' | 'unassigned' | 'completed';
    is_completed?: boolean;
}

interface TimePunchPayload {
    action: 'time_in' | 'time_out' | 'break_out' | 'break_in';
    image?: string | null;           // Required for time_in AND time_out (face check)
    latitude: number;
    longitude: number;
    location_accuracy_meters?: number;
    timestamp?: string;              // ISO string for offline sync history
    task_note?: string | null;
}

export interface TimeLogTaskPhotoEntry {
    id: number;
    time_log_id: number;
    original_filename: string;
    file_size: number;
    mime_type: string;
    status: string;
    submitted_at: string | null;
    created_at: string | null;
    url: string | null;
}

export interface TimeLogEntry {
    id: number;
    session_period: string | null;
    task_note: string | null;
    time_in: string | null;
    break_out: string | null;
    break_in: string | null;
    time_out: string | null;
    duration_minutes: number | null;
    duration_hours: number | null;
    verification_method: string | null;
    face_match_score: number | null;
    is_open: boolean;
    task_photos_count: number;
    submitted_task_photos_count: number;
    task_photos: TimeLogTaskPhotoEntry[];
    system_note?: string | null;
    correction_reason?: string | null;
    can_add_reason?: boolean;
    face_review_status?: string | null;
}

interface TimeLogsPage {
    logs: TimeLogEntry[];
    total_count: number;
    page: number;
}

export interface FileAbsencePayload {
    absence_date: string; // YYYY-MM-DD
    reason: string;
    proof?: { uri: string; name: string; type: string } | null;
}

const TIME_LOGS_PER_PAGE = 20;

export const TIME_STATUS_CACHE_KEY = '@cached_time_status';

export const useTimeStatus = () => {
    return useQuery({
        queryKey: ['time_status'],
        networkMode: 'always', // run the queryFn even when offline, so the cache fallback works
        queryFn: async () => {
            const readCache = async (): Promise<TimeStatus | null> => {
                try {
                    const c = await AsyncStorage.getItem(TIME_STATUS_CACHE_KEY);
                    return c ? (JSON.parse(c) as TimeStatus) : null;
                } catch {
                    return null;
                }
            };

            const net = await NetInfo.fetch();
            // Offline = no connection, OR connected to a network with no real internet
            const offline = !net.isConnected || net.isInternetReachable === false;

            if (offline) {
                const cached = await readCache();
                if (cached) return cached;
                throw new Error('Offline and no cached data');
            }

            try {
                const { data } = await api.get<TimeStatus>('/intern/time/status');
                AsyncStorage.setItem(TIME_STATUS_CACHE_KEY, JSON.stringify(data)).catch(() => {});
                return data;
            } catch (e: any) {
                // No response from the server: network failure, so fall back to the cache
                if (!e?.response) {
                    const cached = await readCache();
                    if (cached) return cached;
                }
                throw e;
            }
        },
    });
};

export const useEnrollFace = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: { image: string }) => {
            const formData = new FormData();
            formData.append('image', {
                uri: payload.image,
                name: 'face_enrollment.jpg',
                type: 'image/jpeg',
            } as any);

            const { data } = await api.post('/intern/face/enrollment', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['time_status'] });
        },
    });
};

export const useTimePunch = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: TimePunchPayload) => {
            // The server runs a face check on time in and time out, so both need a photo
            if ((payload.action === 'time_in' || payload.action === 'time_out') && !payload.image) {
                throw new Error('A face photo is required to time in or time out.');
            }

            const formData = new FormData();

            // Append required fields
            formData.append('action', payload.action);
            formData.append('latitude', payload.latitude.toString());
            formData.append('longitude', payload.longitude.toString());

            // Append optional fields if provided
            if (payload.location_accuracy_meters !== undefined) {
                formData.append('location_accuracy_meters', payload.location_accuracy_meters.toString());
            }

            if (payload.timestamp) {
                formData.append('timestamp', payload.timestamp);
            }

            if (payload.task_note) {
                formData.append('task_note', payload.task_note);
            }

            // Photo for time_in and time_out; break_out / break_in send none
            if (payload.image) {
                formData.append('image', {
                    uri: payload.image,
                    name: 'punch_face.jpg',
                    type: 'image/jpeg',
                } as any);
            }

            const { data } = await api.post('/intern/time/punch', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['time_status'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            // Break In flips the task session from morning to afternoon,
            // so the checker must be refetched after every punch.
            queryClient.invalidateQueries({ queryKey: ['task_checker'] });
        },
    });
};

export interface UpdateTaskPayload {
    timeLogId: number;
    note?: string | null;
    photos?: { uri: string; name: string; type: string }[];
}

export const useTaskUpdate = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: UpdateTaskPayload) => {
            const formData = new FormData();

            if (payload.note !== undefined) {
                formData.append('note', payload.note || '');
            }

            if (payload.photos && payload.photos.length > 0) {
                payload.photos.forEach((photo) => {
                    formData.append('files[]', photo as any);
                });
            }

            const { data } = await api.post(`/intern/time/logs/${payload.timeLogId}/task-update`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['time_status'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            // Re-disable the button right after a session's note is submitted.
            queryClient.invalidateQueries({ queryKey: ['task_checker'] });
            queryClient.invalidateQueries({ queryKey: ['time_log_detail'] });
            queryClient.invalidateQueries({ queryKey: ['time_logs_history'] });
        },
    });
};

export type TaskSession = 'morning' | 'afternoon';

export interface TaskCheckerResult {
    time_log_id: number;
    is_today: boolean;
    has_note: boolean;
    has_photos: boolean;
    needs_update: boolean;
    session: TaskSession | null;
    morning_done: boolean;
    afternoon_done: boolean;
    message: string;
}

export const useTaskChecker = (timeLogId: number | null) => {
    return useQuery({
        queryKey: ['task_checker', timeLogId],
        queryFn: async () => {
            const { data } = await api.get<TaskCheckerResult>(`/intern/time/logs/${timeLogId}/task-checker`);
            return data;
        },
        enabled: timeLogId != null,
        staleTime: 30 * 1000,
    });
};

export type TimeLogPreset = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const useTimeLogsHistory = (preset: TimeLogPreset = 'daily') => {
    return useInfiniteQuery({
        queryKey: ['time_logs_history', preset],
        queryFn: async ({ pageParam }): Promise<TimeLogsPage> => {
            const { data } = await api.get<{ logs: TimeLogEntry[]; total_count: number }>(
                '/intern/time/logs',
                { params: { page: pageParam, per_page: TIME_LOGS_PER_PAGE, preset } },
            );
            return { ...data, page: pageParam };
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => {
            const fetchedSoFar = allPages.reduce((sum, p) => sum + p.logs.length, 0);
            return fetchedSoFar < lastPage.total_count ? lastPage.page + 1 : undefined;
        },
    });
};

export const useTimeLogDetail = (timeLogId: number | null) => {
    return useQuery({
        queryKey: ['time_log_detail', timeLogId],
        queryFn: async () => {
            const { data } = await api.get<{ log: TimeLogEntry }>(
                `/intern/time/logs/${timeLogId}`,
            );
            return data.log;
        },
        enabled: timeLogId != null,
    });
};

export const useFileAbsence = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: FileAbsencePayload) => {
            const formData = new FormData();
            formData.append('absence_date', payload.absence_date);
            formData.append('reason', payload.reason.trim());

            if (payload.proof) {
                formData.append('proof', payload.proof as any);
            }

            const { data } = await api.post('/intern/absences', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['time_status'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['absences'] });
        },
    });
};