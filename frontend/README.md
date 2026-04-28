# Knowledge Vault Frontend

Frontend React + Vite para navegar a knowledge-base como um vault tecnico.

Scripts principais:

- `npm run dev:frontend`: servidor Vite em `4311` com proxy para `/api` na API em `4310`
- `npm run build:frontend`: build de producao em `dist/frontend`
- `npm run test:frontend`: testes de componentes

O frontend consome a API NestJS do proprio pacote `knowledge-base` e preserva o design visual da primeira versao estatica.

## Estrutura

- `src/app`: bootstrap, providers, contexto de pagina e rotas
- `src/layouts`: shell principal, sidebar, topbar e inspector
- `src/pages`: telas por rota
- `src/widgets`: blocos reutilizaveis de dominio
- `src/shared`: client HTTP, tipos, estilos globais e componentes primitivos

## Testes

Os testes usam Vitest + Testing Library. O helper `src/app/test-utils.tsx` cria `QueryClientProvider` e `MemoryRouter`, permitindo testar telas e navegacao com `fetch` mockado sem subir o backend.
