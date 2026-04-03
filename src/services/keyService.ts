import { apiClient } from '@/services/apiClient';
import { withValidation } from '@/adapters/apiAdapter';
import { keyAssignSchema, keyCreateSchema, keyStatusSchema } from '@/validators/apiSchemas';

export const keyService = {
  list: () => apiClient.get('keys'),
  create: (payload: unknown) => apiClient.post('keys', withValidation(keyCreateSchema, payload)),
  assign: (payload: unknown) => apiClient.post('keys/assign', withValidation(keyAssignSchema, payload)),
  updateStatus: (payload: unknown) => apiClient.put('keys/status', withValidation(keyStatusSchema, payload)),
};
