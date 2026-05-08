import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useRef } from 'react';

import { GlobalLoadingProvider, useGlobalLoading } from '../../src/app/global-loading';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function renderWithLoadingProvider(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <GlobalLoadingProvider minVisibleMs={0} showDelayMs={0}>
        {ui}
      </GlobalLoadingProvider>
    </QueryClientProvider>,
  );
}

function ManualLoadingHarness({ promise }: { promise: Promise<string> }) {
  const globalLoading = useGlobalLoading();

  return (
    <button
      type="button"
      onClick={() => {
        void globalLoading.trackPromise(promise);
      }}
    >
      Executar
    </button>
  );
}

function SilentRefetchHarness({ refetchPromise }: { refetchPromise: Promise<{ value: string }> }) {
  const queryClient = useQueryClient();
  const fetchCountRef = useRef(0);

  const query = useQuery({
    queryKey: ['silent-refetch'],
    queryFn: async () => {
      fetchCountRef.current += 1;
      if (fetchCountRef.current === 1) {
        return { value: 'ready' };
      }
      return refetchPromise;
    },
  });

  return (
    <div>
      <span>{query.data?.value || 'loading'}</span>
      <button type="button" onClick={() => { void queryClient.invalidateQueries({ queryKey: ['silent-refetch'] }); }}>
        Refetch
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GlobalLoadingProvider', () => {
  it('renders the overlay with accessibility attributes during tracked async work', async () => {
    const deferred = createDeferred<string>();

    renderWithLoadingProvider(<ManualLoadingHarness promise={deferred.promise} />);

    fireEvent.click(screen.getByRole('button', { name: 'Executar' }));

    const overlay = await screen.findByRole('status');
    expect(overlay).toHaveClass('global-loading-overlay');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(overlay).toHaveAttribute('aria-busy', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('.global-loading-spinner')).not.toBeNull();
    expect(screen.getByText('Carregando')).toHaveClass('sr-only');

    await act(async () => {
      deferred.resolve('done');
      await deferred.promise;
    });

    await waitFor(() => {
      expect(document.querySelector('.global-loading-overlay')).toBeNull();
      expect(document.body.style.overflow).toBe('');
    });
  });

  it('does not enable the overlay for query refetches that are not tracked explicitly', async () => {
    const deferred = createDeferred<{ value: string }>();

    renderWithLoadingProvider(<SilentRefetchHarness refetchPromise={deferred.promise} />);

    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(document.querySelector('.global-loading-overlay')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Refetch' }));

    expect(document.querySelector('.global-loading-overlay')).toBeNull();

    await act(async () => {
      deferred.resolve({ value: 'updated' });
      await deferred.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('updated')).toBeInTheDocument();
    });
    expect(document.querySelector('.global-loading-overlay')).toBeNull();
  });
});
