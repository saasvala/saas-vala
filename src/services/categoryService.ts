import { apiClient } from '@/services/apiClient';

export const categoryService = {
  list: () => apiClient.get('products/categories'),
  byPath: (macro: string, sub?: string, micro?: string) =>
    apiClient.get('products/categories', { macro, sub, micro }),
};

