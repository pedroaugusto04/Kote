# Knowledge Base

`knowledge-base/` agora é um pacote **code-first**. O domínio do produto fica em código TypeScript; o n8n, quando usado, é apenas adapter fino para webhooks e integrações.

## Arquitetura

- `src/domain`: regras puras, tipos, renderização de notas e mensagens
- `src/application`: casos de uso (`ingest`, `github review`, `reminders`, `conversation`, `onboarding`, `query`) e ports
- `src/infrastructure`: repositories/adapters concretos; a API HTTP usa Postgres como unica fonte de dados do produto
- `src/interfaces/http`: controllers e DTOs NestJS
- `src/adapters`: AI, GitHub, IO e ambiente compartilhados
- `frontend/`: aplicação React + Vite que consome a API real
- `workflows/`: adapters opcionais do n8n via HTTP
- `tests/`: contratos, conversa, persistência, reminders, review e smoke dos adapters

## Capacidades novas

### 1. Onboarding de workspace

O produto agora tem um onboarding explícito para:

- registrar `workspace`
- vincular `grupo do WhatsApp`
- declarar `repositorios GitHub`
- cadastrar `projetos` do workspace
- devolver links e checklist de setup

Entrada padrão:

```json
{
  "operation": "upsert",
  "workspaceSlug": "acme-team",
  "displayName": "Acme Team",
  "whatsappGroupJid": "120363000000000@g.us",
  "githubRepos": ["acme/api"],
  "projects": [
    {
      "projectSlug": "acme-api",
      "displayName": "Acme API",
      "repoFullName": "acme/api",
      "aliases": ["api"],
      "defaultTags": ["backend"]
    }
  ]
}
```

Entry points:

- navegador autenticado: `POST /api/onboarding`
- n8n interno: `POST /api/internal/n8n/onboarding`
- workflow opcional `workflows/kb-onboarding.json`

### 2. Consulta sobre a base

Existe uma camada de busca/consulta sobre as notas gravadas no Postgres:

- ranking determinístico por título, tags, caminho e conteúdo
- filtro por `workspaceSlug` e `projectSlug`
- resposta consolidada por IA quando configurada
- fallback sem IA com resumo e citações das notas

Entrada padrão:

```json
{
  "query": "timeout webhook deploy",
  "mode": "answer",
  "projectSlug": "n8n-automations",
  "limit": 5
}
```

Entry points:

- navegador autenticado: `GET|POST /api/query`
- n8n interno: `POST /api/internal/n8n/query`
- workflow opcional `workflows/kb-query.json`

No WhatsApp, a consulta pode ser feita sem abrir o fluxo de captura usando comandos explícitos:

- `/buscar deploy webhook`
- `/consultar o que decidimos sobre reminders?`
- `/perguntar quais foram os riscos do ultimo push?`

## Como o produto conecta WhatsApp e Git push

### WhatsApp do usuário

Recomendação para vender o produto:

1. Cada cliente recebe uma instância dedicada do provedor de WhatsApp.
2. A opção mais simples hoje é manter uma instância `Evolution API` por tenant ou por ambiente controlado.
3. O usuário conecta o WhatsApp escaneando um QR code da própria instância.
4. O grupo ou número autorizado vira a origem oficial de captura manual.
5. O webhook do provedor chama o adapter `kb-whatsapp-entry`.

Fluxo operacional:

- mensagem chega via WhatsApp
- adapter baixa mídia se existir
- API interna de conversa interpreta o texto com OpenRouter
- o core pergunta só o que falta
- ao confirmar, o core gera o payload canonico e persiste em Postgres

### Git push do usuário

Recomendação para vender o produto:

1. Criar um **GitHub App** do produto.
2. Cada cliente instala o app nos repositórios desejados.
3. O GitHub envia `push` para o endpoint `kb-github-push`.
4. O core coleta diff/commits, gera o review por IA, salva a nota em Postgres e retorna uma mensagem pronta para Telegram.
5. O adapter envia o review resumido no Telegram.

Isso é melhor do que pedir token manual por repositório porque:

- escala melhor para SaaS
- reduz fricção de setup
- facilita controle de permissões
- evita automação por repo isolado

## Modelo recomendado para vender

Melhor modelo:

- **core multi-tenant code-first**
- **GitHub App** para eventos de código
- **instância WhatsApp por cliente** ou por workspace
- **Telegram opcional** para notificações operacionais
- **n8n opcional** apenas como adapter onde ele acelerar integrações

Recomendação de produto:

- backend principal em código
- contratos JSON versionados
- cobrança por workspace/tenant
- conectores como recursos plugáveis

O que eu recomendo evitar:

- workflow visual como coração do produto
- segredos presos em credenciais internas do n8n
- regras de negócio dentro de nodes `Code`

## Segredos e configuração

Todos os segredos relevantes ficam em `.env` na VPS e nunca no GitHub:

- OpenRouter
- GitHub webhook secret
- GitHub token de leitura
- Telegram bot token/chat
- Evolution API key
- URL publica, secrets de assinatura, banco Postgres e credenciais criptografadas de providers

Os workflows do n8n devem usar apenas `{{$env.*}}` para segredos.

### Auth e integrações

O backend usa login local com `kb_users`, senha via `crypto.scrypt` e JWT stateless em cookies HttpOnly:

- `kb_access_token`: access token curto
- `kb_refresh_token`: refresh token longo
- `POST /api/auth/signup`: cria usuario com `email`, `password` e `name`
- `POST /api/auth/logout` limpa cookies, sem denylist server-side

O admin inicial é criado por `KB_ADMIN_EMAIL` e `KB_ADMIN_PASSWORD`. Configure também `KB_DATABASE_URL`, `KB_JWT_ACCESS_SECRET`, `KB_JWT_REFRESH_SECRET`, `KB_CREDENTIALS_ENCRYPTION_KEY` (base64 de 32 bytes), `KB_INTERNAL_SERVICE_TOKEN`, `KB_ALLOWED_ORIGINS`, `KB_BODY_LIMIT` e `KB_TRUST_PROXY` quando estiver atrás de proxy.

Postgres é a fonte de dados da API HTTP multiusuário. Usuários novos começam sem workspaces, projetos ou notas; esses registros são criados quando o usuário configura integrações ou quando uma ingestão autenticada/webhook resolvido grava dados. As tabelas principais são `kb_users`, `kb_workspaces`, `kb_projects`, `kb_notes`, `kb_note_links`, `kb_attachments`, `kb_conversation_states`, `kb_reminder_dispatch_state`, `kb_external_identities`, `kb_integration_credentials` e `kb_webhook_events`.

O frontend expõe `/settings/integrations` para salvar, mascarar e revogar credenciais por `user + workspace + provider`. Segredos são gravados em `kb_integration_credentials.encrypted_config` com AES-256-GCM e nunca são retornados nas respostas do navegador. Ao revogar uma credencial, o backend substitui o payload criptografado por um marcador sem segredo e mantém apenas o status/histórico de revogação.

O payload de credenciais é validado com Zod por provider. `config` aceita apenas as chaves esperadas para cada integração, com campos obrigatórios específicos como `botToken` no Telegram, `apiUrl/apiKey/instanceName` no Evolution, `provider/apiKey/model` nas integrações de IA, `token` no GitHub e `installationId` no GitHub App. `publicMetadata` aceita somente campos públicos conhecidos como `label`, e identidades externas só podem ser vinculadas aos providers permitidos (`telegram`, `whatsapp`, `github` ou `github-app`) sem reassociar uma identidade que já pertença a outro usuário.

Webhooks externos nunca usam `userId` vindo do payload. O fluxo aceito é: validar assinatura/token do provider, extrair identidade externa confiavel, buscar `kb_external_identities`, resolver `user_id` e gravar somente para esse usuario. Eventos brutos sao registrados em `kb_webhook_events` como `rejected`, `resolved`, `processed` ou `failed`. Para GitHub, o modelo principal é GitHub App com `X-Hub-Signature-256` e `installation.id` vinculado como `provider=github-app`, `identityType=installation_id`.

Auth e webhooks têm rate limit em memoria por IP. O parser HTTP usa limite explicito de body e preserva `rawBody` para validar assinatura de provider.

Endpoints principais:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/integrations?workspaceSlug=...`
- `PUT /api/integrations/:provider`
- `DELETE /api/integrations/:provider`
- `POST /api/internal/integrations/:provider/resolve`
- `POST /api/internal/n8n/ingest`
- `POST /api/internal/n8n/query`
- `POST /api/internal/n8n/conversation`
- `GET /api/internal/n8n/reminders/dispatch`
- `POST /api/internal/n8n/reminders/mark-sent`

Endpoints mutáveis de navegador validam `Origin`/`Referer`. A API interna exige `Authorization: Bearer ${KB_INTERNAL_SERVICE_TOKEN}` e retorna o segredo descriptografado somente para o provider solicitado.

## Persistência

A persistência suportada é Postgres. O backend não importa dados antigos de markdown e não grava vault em disco. Anexos são persistidos em `kb_attachments` com conteúdo e checksum; estado de conversa fica em `kb_conversation_states`; controle de disparo de lembretes fica em `kb_reminder_dispatch_state`.

## Build e testes

```bash
npm --prefix knowledge-base install
npm --prefix knowledge-base test
```

## API e frontend local

```bash
npm --prefix knowledge-base run dev:api
npm --prefix knowledge-base run dev:frontend
```

Portas locais padrao:

- API: `http://127.0.0.1:4310`
- Frontend: `http://127.0.0.1:4311`

Para sobrescrever sem editar codigo:

```bash
KB_API_PORT=4320 KB_FRONTEND_PORT=4321 npm --prefix knowledge-base run dev:frontend
KB_API_PORT=4320 npm --prefix knowledge-base run dev:api
```

### Docker Compose de desenvolvimento

O repositório inclui `docker-compose.dev.yml` para subir Postgres, API NestJS com reload e frontend Vite com hot reload usando o `.env` local:

```bash
docker compose -f knowledge-base/docker-compose.dev.yml up --build
```

Fluxo esperado:

- o compose carrega segredos e credenciais a partir de `knowledge-base/.env`
- `postgres` recebe credenciais do `.env`, e a API usa `KB_DATABASE_URL_DOCKER` dentro do container para não apontar para `127.0.0.1`
- `api` executa `npm run dev:api` com `node --watch`
- `frontend` executa `npm run dev:frontend` com polling habilitado para funcionar bem em bind mounts Docker

Para rodar em container, ajuste no `.env`:

```dotenv
KB_API_HOST=0.0.0.0
KB_FRONTEND_HOST=0.0.0.0
KB_API_PROXY_TARGET=http://api:4310
KB_POSTGRES_PORT=5432
KB_POSTGRES_DB=knowledge_base
KB_POSTGRES_USER=postgres
KB_POSTGRES_PASSWORD=postgres
KB_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/knowledge_base
KB_DATABASE_URL_DOCKER=postgres://postgres:postgres@postgres:5432/knowledge_base
KB_ALLOWED_ORIGINS=http://127.0.0.1:4311,http://localhost:4311,http://127.0.0.1:4310,http://localhost:4310
```

Portas publicadas por padrão:

- API: `http://127.0.0.1:4310`
- Frontend: `http://127.0.0.1:4311`

Endpoints HTTP principais:

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/integrations`
- `GET /api/auth/me`
- `GET /api/notes/:id`
- `GET|POST /api/query`
- `POST /api/ingest`
- `POST /api/onboarding`
- `POST /api/conversation`
- `POST /api/webhooks/github/push`
- `POST /api/webhooks/whatsapp`
- `POST /api/internal/n8n/ingest`
- `POST /api/internal/n8n/query`
- `POST /api/internal/n8n/conversation`
- `GET /api/internal/n8n/reminders/dispatch`
- `POST /api/internal/n8n/reminders/mark-sent`

## Workflows opcionais

Os adapters em `knowledge-base/workflows/` fazem apenas:

- receber webhook
- transformar payload de borda
- chamar a API HTTP interna do core com `Authorization: Bearer $KB_INTERNAL_SERVICE_TOKEN`
- enviar resposta para WhatsApp/Telegram

Workflows adicionais disponíveis:

- `kb-onboarding.json`
- `kb-query.json`

Se você quiser remover completamente o n8n no futuro, o core já está preparado para isso.
