import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({ defaultOptions: {
  queries: { retry: (count, error) => count < 2 && ![400, 401, 403, 409].includes((error as Error & { status?: number }).status || 0), staleTime: 0, refetchOnWindowFocus: false },
  mutations: { retry: false, networkMode: 'always' },
} });
