import { apiClient } from '@/services/apiClient';
import { withValidation } from '@/adapters/apiAdapter';
import { aiChatSchema } from '@/validators/apiSchemas';

export const aiService = {
  chat: (payload: unknown) => apiClient.post('ai/chat', withValidation(aiChatSchema, payload)),
  apis: () => apiClient.get('ai/apis'),
};
