import { useMutation } from '@tanstack/react-query';
// ⚠️ Adjust this import to however the rest of your queries call the API
// (axios instance, fetch wrapper, etc.). This assumes an axios-style client
// that already adds the base URL and the auth token.
import { api } from '../api';

/**
 * Intern sends (or edits) the reason for a forgotten time out.
 * PATCH /intern/time-logs/{id}/reason  →  { message, log }
 */
export function useSubmitCorrectionReason(timeLogId: number) {
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data } = await api.patch(
        `/intern/time-logs/${timeLogId}/reason`,
        { reason },
      );
      return data;
    },
  });
}