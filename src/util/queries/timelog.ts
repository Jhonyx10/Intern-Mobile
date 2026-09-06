import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
}

export const useTimeStatus = () => {
    return useQuery({
        queryKey: ['time_status'],
        queryFn: async () => {
            const { data } = await api.get<TimeStatus>('/intern/time/status');
            return data;
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
        },
    });
};

