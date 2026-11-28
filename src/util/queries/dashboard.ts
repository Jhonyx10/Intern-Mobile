import { useQuery, useMutation } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../api';

interface DashboardSchedule {
    hours_per_day: number;
    days_per_week: number;
    time_in: string;
    time_out: string;
    // Company-wide break. Optional: a dashboard cached before this change won't have them.
    break_out?: string | null;
    break_in?: string | null;
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
     supervisor: {
        id: number;
        name: string | null;
        email: string | null;
        position_title: string | null;
    } | null;
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

export const DASHBOARD_CACHE_KEY = '@cached_dashboard';

export const useDashboard = () => {
    return useQuery({
        queryKey: ['dashboard'],
        networkMode: 'always', // run the queryFn even when offline, so the cache fallback works
        queryFn: async () => {
            const readCache = async (): Promise<DashboardData | null> => {
                try {
                    const c = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY);
                    return c ? (JSON.parse(c) as DashboardData) : null;
                } catch {
                    return null;
                }
            };

            const net = await NetInfo.fetch();
            const offline = !net.isConnected || net.isInternetReachable === false;

            if (offline) {
                const cached = await readCache();
                if (cached) return cached;
                throw new Error('Offline and no cached data');
            }

            try {
                const { data } = await api.get<DashboardData>('/intern/progress');
                AsyncStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data)).catch(() => {});
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