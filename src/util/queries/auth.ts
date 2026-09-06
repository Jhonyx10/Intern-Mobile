import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';

interface LoginCredentials {
    student_number: string;
    password: string;
}

interface AuthResponse {
    token_type: string;
    access_token: string;
    expires_at: string | null;
    user: Record<string, any>;
    student: Record<string, any>;
    section: Record<string, any>;
    course: Record<string, any>;
    settings: Record<string, any>;
}

export const useUser = () => {
    return useQuery({
        queryKey: ['user_data'],
        queryFn: async () => {
            const data = await AsyncStorage.getItem('user_data');
            return data ? JSON.parse(data) as AuthResponse : null;
        },
    });
};

export const useAuth = () => {
    return useQuery({
        queryKey: ['auth'],
        queryFn: async () => {
            const token = await AsyncStorage.getItem('token');
            return token;
        },
    });
};

export const useLogin = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (credentials: LoginCredentials) => {
            const { data } = await api.post<AuthResponse>('/auth/mobile/login', credentials);
            return data;
        },
        onSuccess: async (data) => {
            if (data.access_token) {
                await AsyncStorage.setItem('token', data.access_token);
                await AsyncStorage.setItem('user_data', JSON.stringify(data));
            }
            queryClient.invalidateQueries({ queryKey: ['auth'] });
        },
    });
};

export const useLogout = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            // Uncomment if backend requires a request to invalidate the active token
            // await api.post('/logout');
            await AsyncStorage.removeItem('token');
        },
        onSuccess: () => {
            queryClient.clear();
        },
    });
};
