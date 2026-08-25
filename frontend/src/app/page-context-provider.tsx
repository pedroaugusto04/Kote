import React, { createContext, useContext } from 'react';
import type { PageContext } from './page-context';

export const PageContextReact = createContext<PageContext | null>(null);

export function usePageContext(): PageContext {
  const ctx = useContext(PageContextReact);
  if (!ctx) {
    throw new Error('usePageContext must be used within a PageContextProvider');
  }
  return ctx;
}

export type PageContextProviderProps = {
  value: PageContext;
  children: React.ReactNode;
};

export function PageContextProvider({ value, children }: PageContextProviderProps) {
  return (
    <PageContextReact.Provider value={value}>
      {children}
    </PageContextReact.Provider>
  );
}
