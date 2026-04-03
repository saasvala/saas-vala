import { apiClient } from '@/services/apiClient';
import { withValidation } from '@/adapters/apiAdapter';
import { billingCreditsSchema } from '@/validators/apiSchemas';

export const billingService = {
  addCredits: (payload: unknown) => apiClient.post('billing/credits', withValidation(billingCreditsSchema, payload)),
};
