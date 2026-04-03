import { apiClient } from '@/services/apiClient';
import { withValidation } from '@/adapters/apiAdapter';
import { serverCreateSchema, serverRestartSchema } from '@/validators/apiSchemas';

export const serverService = {
  list: () => apiClient.get('servers'),
  create: (payload: unknown) => apiClient.post('servers', withValidation(serverCreateSchema, payload)),
  restart: (payload: unknown) => apiClient.post('servers/restart', withValidation(serverRestartSchema, payload)),
  metrics: () => apiClient.get('servers/metrics'),
  deploy: (payload: Record<string, unknown>) => apiClient.post('servers/deploy', payload),
};
