import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type EvaluationItemType =
  | 'text'
  | 'textarea'
  | 'rating'
  | 'select'
  | 'radio'
  | 'checkbox';

export interface EvaluationItem {
  id: number;
  sort_order: number;
  item_type: EvaluationItemType;
  label: string;
  options: string[] | null;
  is_required: boolean;
}

export interface EvaluationTemplate {
  id: number;
  title: string;
  description: string | null;
  items?: EvaluationItem[];
}

export interface Evaluation {
  id: number;
  course_id: number;
  status: 'pending' | 'submitted';
  computed_score: number | null;
  submitted_at: string | null;
  responses: Record<string, string | number | string[]> | null;
  created_at: string;
  template: EvaluationTemplate;
}

export interface EvaluationFilters {
  course_id?: number;
  status?: Evaluation['status'];
}

export const evaluationKeys = {
  all: ['evaluations'] as const,
  lists: () => [...evaluationKeys.all, 'list'] as const,
  list: (filters: EvaluationFilters = {}) =>
    [...evaluationKeys.lists(), filters] as const,
  detail: (id: number) => [...evaluationKeys.all, 'detail', id] as const,
};

const unwrap = <T,>(payload: any): T => payload?.data ?? payload;

export const fetchMyEvaluations = async (
  filters: EvaluationFilters = {},
): Promise<Evaluation[]> => {
  const { data } = await api.get('/intern/evaluations', { params: filters });
  return unwrap<Evaluation[]>(data);
};

export const fetchEvaluation = async (id: number): Promise<Evaluation> => {
  const { data } = await api.get(`/intern/evaluations/${id}`);
  return unwrap<Evaluation>(data);
};

export const useMyEvaluations = (filters: EvaluationFilters = {}) =>
  useQuery({
    queryKey: evaluationKeys.list(filters),
    queryFn: () => fetchMyEvaluations(filters),
    staleTime: 60 * 1000,
  });

export const useEvaluation = (id: number | null) =>
  useQuery({
    queryKey: evaluationKeys.detail(id as number),
    queryFn: () => fetchEvaluation(id as number),
    enabled: id != null,
    staleTime: 60 * 1000,
  });

/** Warm the detail cache from a list row so the modal opens with content already there. */
export const usePrimeEvaluation = () => {
  const queryClient = useQueryClient();

  return (evaluation: Evaluation) =>
    queryClient.setQueryData(evaluationKeys.detail(evaluation.id), evaluation);
};