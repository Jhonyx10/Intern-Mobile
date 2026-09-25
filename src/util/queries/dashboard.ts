import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api';

interface DashboardSchedule {
    hours_per_day: number;
    days_per_week: number;
    time_in: string;
    time_out: string;
    start_date: string;
    source?: 'approved_ojt_schedule' | 'company_schedule';
}

interface DashboardProgress {
    required_hours: number;
    rendered_hours: number;
    remaining_hours: number;
    percent_complete: number;
    time_log_count: number;
    estimated_end_date: string;
    estimated_end_basis: string;
    estimated_end_is_approximate: boolean;
    schedule: DashboardSchedule;
}

export interface DashboardData {
    student: {
        id: number;
        full_name: string;
        student_number: string;
        section: string;
    };
    course: {
        id: number;
        code: string;
        name: string;
    };
    company: {
        name: string;
        latitude: number;
        longitude: number;
        radius_meters: number;
        geofence_polygon?: {
            type: 'Polygon';
            coordinates: number[][][];
        };
    };
    progress: DashboardProgress;
    placement_status: 'active' | 'removed' | 'unassigned';
    removal_reason: string | null;
}

export interface CompanyRequestPayload {
    name: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
}

export const useDashboard = () => {
    return useQuery({
        queryKey: ['dashboard'],
        queryFn: async () => {
            const { data } = await api.get<DashboardData>('/intern/progress');
            return data;
        },
    });
};

export const useRequestCompany = () => {
    return useMutation({
        mutationFn: async (payload: CompanyRequestPayload) => {
            const { data } = await api.post('/intern/company/request', payload);
            return data;
        },
    });
};

export interface ScheduleRequestPayload {
    start_date: string;
    time_in: string;
    time_out: string;
    hours_per_day?: number | null;
    days_per_week?: number | null;
    reason?: string | null;
}

export const useRequestSchedule = () => {
    return useMutation({
        mutationFn: async (payload: ScheduleRequestPayload) => {
            const { data } = await api.post('/intern/schedule/request', payload);
            return data;
        },
    });
};
