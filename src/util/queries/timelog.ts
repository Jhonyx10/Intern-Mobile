import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../api';

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
}

interface TimePunchPayload {
    action: 'time_in' | 'time_out' | 'break_out' | 'break_in';
    image?: string | null;           // Optional for break_in / break_out
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
}

interface TimeLogsPage {
    logs: TimeLogEntry[];
    total_count: number;
    page: number;
}

const TIME_LOGS_PER_PAGE = 20;

export const useTimeStatus = () => {
    return useQuery({
        queryKey: ['time_status'],
        queryFn: async () => {
            const netState = await NetInfo.fetch();
            if (!netState.isConnected) {
                const cached = await AsyncStorage.getItem('@cached_time_status');
                if (cached) return JSON.parse(cached) as TimeStatus;
                throw new Error('Offline and no cached data');
            }

            const { data } = await api.get<TimeStatus>('/intern/time/status');
            await AsyncStorage.setItem('@cached_time_status', JSON.stringify(data));
            return data;
        },
    });
};

export const useEnrollFace = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: { image: string }) => {
            // #region agent log
            fetch('http://127.0.0.1:7585/ingest/ae4376a8-64c4-46b6-89b6-3628f95e1f3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'566d31'},body:JSON.stringify({sessionId:'566d31',runId:'pre-fix',hypothesisId:'E',location:'timelog.ts:useEnrollFace',message:'POST /intern/face/enrollment start',data:{uriPrefix:String(payload.image).slice(0,40)},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            const formData = new FormData();
            formData.append('image', {
                uri: payload.image,
                name: 'face_enrollment.jpg',
                type: 'image/jpeg',
            } as any);

            try {
                const { data } = await api.post('/intern/face/enrollment', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                });
                // #region agent log
                fetch('http://127.0.0.1:7585/ingest/ae4376a8-64c4-46b6-89b6-3628f95e1f3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'566d31'},body:JSON.stringify({sessionId:'566d31',runId:'pre-fix',hypothesisId:'E',location:'timelog.ts:useEnrollFace',message:'POST enrollment OK',data:{keys:data&&typeof data==='object'?Object.keys(data):typeof data},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                return data;
            } catch (err: any) {
                // #region agent log
                fetch('http://127.0.0.1:7585/ingest/ae4376a8-64c4-46b6-89b6-3628f95e1f3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'566d31'},body:JSON.stringify({sessionId:'566d31',runId:'pre-fix',hypothesisId:'E',location:'timelog.ts:useEnrollFace',message:'POST enrollment error',data:{status:err?.response?.status??null,apiMessage:err?.response?.data?.message??err?.message??String(err)},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
                throw err;
            }
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

            // Append image ONLY if it exists (required for time_in/time_out, skipped for breaks)
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
        },
    });
};

export interface TaskCheckerResult {
    time_log_id: number;
    has_note: boolean;
    has_photos: boolean;
    needs_update: boolean;
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

export const useTimeLogsHistory = () => {
    return useInfiniteQuery({
        queryKey: ['time_logs_history'],
        queryFn: async ({ pageParam }): Promise<TimeLogsPage> => {
            const { data } = await api.get<{ logs: TimeLogEntry[]; total_count: number }>(
                '/intern/time/logs',
                { params: { page: pageParam, per_page: TIME_LOGS_PER_PAGE } },
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
