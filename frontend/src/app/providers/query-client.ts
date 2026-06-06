import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// ---------------------------------------------------------------------------
// Query client with offline-first defaults
// ---------------------------------------------------------------------------

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered stale immediately when online, allowing background updates.
      // Offline users will still see the persisted local cache seamlessly.
      staleTime: 0,
      gcTime: TWENTY_FOUR_HOURS_MS,

      // Serve cached data immediately; refresh in background when online.
      networkMode: 'offlineFirst',

      // Don't retry when clearly offline — avoids pointless errors.
      retry: (failureCount, error) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      // Mutations queue up and execute when the network returns.
      networkMode: 'offlineFirst',
    },
  },
});

// ---------------------------------------------------------------------------
// Persist cache to localStorage for offline startup
// ---------------------------------------------------------------------------

/** Keys that should never be persisted (auth tokens, sensitive data). */
const EXCLUDED_QUERY_KEY_PREFIXES = new Set(['auth']);

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'kb-query-cache',
});

persistQueryClient({
  queryClient,
  persister,
  maxAge: TWENTY_FOUR_HOURS_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      // Only persist successful queries that are not auth-related
      if (query.state.status !== 'success') return false;
      const topKey = query.queryKey[0];
      if (typeof topKey === 'string' && EXCLUDED_QUERY_KEY_PREFIXES.has(topKey)) return false;
      return true;
    },
  },
});
