import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export interface UpdateEmailPayload {
    email: string;
    current_password: string;
}

export interface UpdatePasswordPayload {
    current_password: string;
    password: string;
    password_confirmation: string;
}

/**
 * NOTE: no backend route exists for this yet — InternController currently only
 * has updatePassword(). This hook assumes a mirrored `PUT /intern/account/email`
 * endpoint (current_password required as re-authentication, same pattern as
 * password change) so the UI has something real to call once that's added.
 */
export const useUpdateEmail = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: UpdateEmailPayload) => {
            const { data } = await api.put('/intern/account/email', payload);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intern_profile'] });
        },
    });
};

export const useUpdatePassword = () => {
    return useMutation({
        mutationFn: async (payload: UpdatePasswordPayload) => {
            const { data } = await api.put('/intern/password', payload);
            return data;
        },
    });
};

export const useSendEmailVerification = () => {
    return useMutation({
        mutationFn: async () => {
            const { data } = await api.post('/auth/email/verification-notification');
            return data;
        },
    });
};

export const useVerifyEmail = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (code: string) => {
            const { data } = await api.post('/auth/email/verify', { code });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['intern_profile'] });
        },
    });
};