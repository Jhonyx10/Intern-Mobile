import { api } from '../api';

export const getPendingExcursions = async () => {
    const { data } = await api.get('/intern/excursions/pending');
    return data;
};

export const startExcursion = async () => {
    const { data } = await api.post('/intern/excursions');
    return data;
};

export const addExcursionPoint = async (excursionId: number | string, latitude: number, longitude: number) => {
    const { data } = await api.post(`/intern/excursions/${excursionId}/points`, {
        latitude,
        longitude
    });
    return data;
};

export const completeExcursion = async (excursionId: number | string) => {
    const { data } = await api.patch(`/intern/excursions/${excursionId}`);
    return data;
};

export const updateExcursionReason = async (excursionId: number | string, reason: string) => {
    const { data } = await api.patch(`/intern/excursions/${excursionId}/reason`, {
        reason
    });
    return data;
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const usePendingExcursions = () => {
    return useQuery({
        queryKey: ['pendingExcursions'],
        queryFn: getPendingExcursions
    });
};

export const useUpdateExcursionReason = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, reason }: { id: number | string, reason: string }) => updateExcursionReason(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pendingExcursions'] });
        }
    });
};
