import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export interface Notification {
    id: string | number;
    title: string;
    deadline_at?: string | null;
    status: string;
    is_new: boolean;
    message: string;
}

export interface DocumentRequirementsResponse {
    requirements: any[];
    pending_count: number;
    new_count: number;
    unread_count: number;
    notifications: Notification[];
    review_notifications: any[];
    review_notification_count: number;
    last_seen_at: string | null;
    server_time: string;
}

export const useNotifications = () => {
    return useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const { data } = await api.get<DocumentRequirementsResponse>('/intern/document-requirements');
            return data;
        },
    });
};

export const useMarkNotificationsSeen = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.post('/intern/document-requirements/seen');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
};

export const useMarkReviewAlertsSeen = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.post('/intern/document-requirements/review-seen');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
};

// ─── In-App / DB Notifications ────────────────────────────────────────────────

export interface InAppNotification {
    id: string;
    type: string;
    data: {
        title: string;
        body: string;
    };
    read_at: string | null;
    created_at: string;
}

export const useInAppNotifications = () => {
    return useQuery({
        queryKey: ['in_app_notifications'],
        queryFn: async () => {
            const { data } = await api.get<InAppNotification[]>('/notifications/unread');
            return data;
        },
        refetchInterval: 60_000, // poll every minute
    });
};

export const useMarkInAppNotificationsRead = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.post('/notifications/mark-as-read');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['in_app_notifications'] });
        },
    });
};
