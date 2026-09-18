import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export interface InternProfileResponse {
    student: {
        id: number;
        student_number: string;
        full_name: string;
    };
    user: {
        id: number;
        name: string;
        email: string;
        email_verified_at: string | null;
    };
    section: {
        id: number;
        name: string;
        course: {
            code: string;
            name: string;
        } | null;
    } | null;
    placement: {
        company: {
            id: number;
            name: string;
            address: string;
        } | null;
        department: any | null;
        supervisor: {
            id: number;
            name: string;
            email: string;
            position_title: string;
        } | null;
    };
}

export const useInternProfile = () => {
    return useQuery({
        queryKey: ['intern_profile'],
        queryFn: async () => {
            const { data } = await api.get<InternProfileResponse>('/intern/profile');
            return data;
        },
    });
};
