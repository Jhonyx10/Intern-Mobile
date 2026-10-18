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
        // Extra fields set by the notifiers (all optional)
        category?: string;
        document_id?: number | string;
        student_document_id?: number;
        time_log_id?: number | string;
        status?: 'approved' | 'rejected';
        rejection_reason?: string | null;
        period_start?: string | null;
    };
    read_at: string | null;
    created_at: string;
}

// Query keys shared by the hooks below (and the FCM listener)
const IN_APP_KEYS = [['in_app_notifications'], ['all_notifications']] as const;

const invalidateInApp = (queryClient: ReturnType<typeof useQueryClient>) => {
    IN_APP_KEYS.forEach(queryKey => queryClient.invalidateQueries({ queryKey: [...queryKey] }));
};

// Unread only: drives the bell badge on the Home screen
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

// Returns true for any notification that belongs to the Documents section.
export function isDocumentNotification(n: InAppNotification): boolean {
    const d = n.data;
    return (
        d?.category === 'document' ||
        d?.category === 'documents' ||
        !!d?.document_id ||
        !!d?.student_document_id
    );
}

// Derives the unread document notification count from the shared unread query
// (no extra network request).
export const useUnreadDocumentNotifications = () => {
    const { data: unread = [] } = useInAppNotifications();
    return unread.filter(isDocumentNotification);
};

// Read + unread: drives the Notifications screen so items stay visible after opening
export const useAllNotifications = () => {
    return useQuery({
        queryKey: ['all_notifications'],
        queryFn: async () => {
            const { data } = await api.get<InAppNotification[]>('/notifications');
            return data;
        },
        refetchInterval: 60_000,
    });
};

// Mark ONE notification as read (when the user taps it)
export const useMarkNotificationRead = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.post(`/notifications/${id}/read`);
            return data;
        },
        onSuccess: () => invalidateInApp(queryClient),
    });
};

// Mark ALL as read ("Mark all read" button)
export const useMarkInAppNotificationsRead = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.post('/notifications/mark-as-read');
            return data;
        },
        onSuccess: () => invalidateInApp(queryClient),
    });
};

// Delete ONE notification (X button on a card)
export const useDeleteNotification = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.delete(`/notifications/${id}`);
            return data;
        },
        onSuccess: () => invalidateInApp(queryClient),
    });
};

// Clear ALL notifications of the current user ("Clear all" button)
export const useClearAllNotifications = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.delete('/notifications');
            return data;
        },
        onSuccess: () => invalidateInApp(queryClient),
    });
};