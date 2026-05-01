# Knowledge Base

`knowledge-base/` agora é um pacote **code-first**. O domínio do produto fica em código TypeScript; o n8n, quando usado, é apenas adapter fino para webhooks e integrações.

## Arquitetura

- `backend/src/domain`: regras puras, tipos, renderização de notas e mensagens
- `backend/src/application`: casos de uso (`ingest`, `github review`, `reminders`, `conversation`, `query`, `workspaces`) e ports
- `backend/src/infrastructure`: repositories/adapters concretos; a API HTTP usa Postgres como unica fonte de dados do produto
- `backend/src/interfaces/http`: controllers e DTOs NestJS
- `backend/src/adapters`: AI, GitHub, IO e ambiente compartilhados
- `frontend/`: aplicação React + Vite que consome a API real
- `workflows/`: adapters opcionais do n8n via HTTP
- `backend/tests/`: contratos, conversa, persistência, reminders, review e smoke dos adapters

## Capacidades novas

### 1. Setup wizard de workspace

O produto agora usa um setup explícito em `/setup`:

- o usuário autenticado sem workspace é redirecionado para o wizard
- o passo obrigatório é criar o workspace
- ao criar o workspace, o backend também cria o projeto inicial `Inbox`
- GitHub, WhatsApp e Telegram continuam como passos guiados opcionais

Entrada padrão do endpoint de criação:

```json
{
  "displayName": "Acme Team",
  "workspaceSlug": "acme-team"
}
```

Entry points:

- navegador autenticado: `POST /api/workspaces`
- frontend: `/setup`

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

## Como o produto conecta integrações guiadas

### WhatsApp do usuário

Recomendação para vender o produto:

1. Cada cliente recebe uma instância dedicada do provedor de WhatsApp gerenciada pelo servidor.
2. A opção mais simples hoje é manter uma instância `Evolution API` por tenant ou por ambiente controlado.
3. O usuário inicia a conexão em `/settings/integrations` e recebe o comando `/kb conectar <codigo>`.
4. O grupo que enviar esse comando vira a origem oficial de captura manual.
5. O webhook do provedor chama `POST /api/webhooks/whatsapp`.

Fluxo operacional:

- mensagem chega via WhatsApp
- `POST /api/webhooks/whatsapp` aceita apenas o payload cru do provider, valida o webhook, resolve o workspace pelo `jid` do grupo e transforma a mensagem em comandos internos de conexao, conversa ou ignore
- o backend interpreta texto puro e legenda de mídia com IA gerenciada quando `ai-conversation` está ativo no workspace
- o core pergunta só o que falta
- ao confirmar, o core gera o payload canonico de ingestao, persiste em Postgres e responde ao grupo via Evolution API
- mídia sem legenda ainda não é baixada nem salva nesta versão; o backend pede um texto/legenda
- esse endpoint nao aceita mais payload canonico nem modo hibrido de compatibilidade

### Git push do usuário

Recomendação para vender o produto:

1. Criar um **GitHub App** do produto.
2. Cada cliente instala o app nos repositórios desejados.
3. O GitHub envia `push` para o endpoint `kb-github-push`.
4. O callback valida `state`, troca `code` por token OAuth, confirma que a instalação aparece nas instalações do usuário GitHub autenticado e só então vincula `installation_id`.
5. O adapter envia o review resumido no Telegram.

Isso é melhor do que pedir token manual por repositório porque:

- escala melhor para SaaS
- reduz fricção de setup
- facilita controle de permissões
- evita automação por repo isolado

Depois da conexão, `/settings/integrations` lista os repositórios acessíveis pela instalação e salva a seleção em `workspace.githubRepos`. O vínculo entre push do GitHub e projeto é explícito: o usuário cria o projeto em `/projects` e seleciona os repositórios vinculados via ID; pushes de repositórios sem projeto mapeado entram em `inbox`.

### Telegram e IA

Telegram é um bot gerenciado pelo servidor. O usuário inicia a conexão em `/settings/integrations`, envia `/kb conectar <codigo>` no chat, e o webhook `POST /api/webhooks/telegram` vincula `chat_id` ao workspace sem expor token ou chat ID na UI.

`ai-review` e `ai-conversation` são recursos ativados por workspace. O usuário só ativa, testa ou desativa; provider, modelo, base URL e API key ficam em env/admin. Reviews de push usam `ai-review` somente quando o recurso está ativo no workspace, e a conversa usa `ai-conversation` somente quando também está ativo.

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
- GitHub App client secret, app private key e webhook secret
- Telegram bot token/chat
- Evolution API key
- Supabase URL, service-role key e bucket privado de storage
- URL publica, secrets de assinatura, banco Postgres e credenciais criptografadas de providers

Os workflows do n8n devem usar apenas `{{$env.*}}` para segredos.

No GitHub Actions de deploy, o secret `VPS_GITHUB_REPO_TOKEN` tambem precisa existir no environment `production` para que a VPS consiga executar `git fetch` e `git pull` em repositórios privados sem prompt interativo. Prefira um fine-grained token com acesso de leitura ao repositório.

### Auth e integrações

O backend usa login local com `kb_users`, senha via `crypto.scrypt` e JWT stateless em cookies HttpOnly:

- `kb_access_token`: access token curto
- `kb_refresh_token`: refresh token longo
- `POST /api/auth/signup`: cria usuario com `email`, `password` e `name`
- `POST /api/auth/logout` limpa cookies, sem denylist server-side

O admin inicial é criado por `KB_ADMIN_EMAIL` e `KB_ADMIN_PASSWORD`. Configure também `KB_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KB_SUPABASE_STORAGE_BUCKET`, `KB_JWT_ACCESS_SECRET`, `KB_JWT_REFRESH_SECRET`, `KB_CREDENTIALS_ENCRYPTION_KEY` (base64 de 32 bytes), `KB_INTERNAL_SERVICE_TOKEN`, `KB_ALLOWED_ORIGINS`, `KB_BODY_LIMIT` e `KB_TRUST_PROXY` quando estiver atrás de proxy.

Para melhorar a leitura dos logs no Portainer, o modo pretty agora fica ativo por padrão. O backend aceita `LOG_PRETTY_CONSOLE` como nome principal, alinhado ao `feconect`, e também `KB_LOG_PRETTY_CONSOLE` como alias local. Para desligar e voltar ao JSON estruturado, defina `LOG_PRETTY_CONSOLE=false` ou `KB_LOG_PRETTY_CONSOLE=false`. Quando ativo, o console emite texto no formato `timestamp | LEVEL | mensagem | meta`, com ANSI colorido por nível (`INFO` verde, `WARN` amarelo, `ERROR` vermelho e `DEBUG` ciano).

Postgres é a fonte de metadados da API HTTP multiusuário. Usuários novos começam sem workspaces, projetos ou notas; o primeiro workspace precisa ser criado explicitamente pelo wizard ou por `POST /api/workspaces`. As tabelas principais são `kb_users`, `kb_workspaces`, `kb_projects`, `kb_notes`, `kb_note_links`, `kb_attachments`, `kb_conversation_states`, `kb_reminder_dispatch_state`, `kb_external_identities`, `kb_integration_credentials`, `kb_integration_connection_sessions` e `kb_webhook_events`.

O frontend expõe `/settings/integrations` com fluxos guiados para `github-app`, `whatsapp`, `telegram`, `ai-review` e `ai-conversation`. A tela não pede JSON, tokens, `jid`, API key, modelo de IA ou nome de instância: o backend usa `KB_GITHUB_APP_*`, `EVOLUTION_*`, `KB_TELEGRAM_*`, `KB_REVIEW_AI_*` e `KB_CONVERSATION_AI_*`, cria uma sessão curta em `kb_integration_connection_sessions` quando há pareamento por código, e grava a credencial final criptografada em `kb_integration_credentials.encrypted_config`. Ao revogar uma credencial, o backend substitui o payload criptografado por um marcador sem segredo e mantém apenas o status/histórico de revogação.

Webhooks externos nunca usam `userId` vindo do payload. O fluxo aceito é: validar assinatura/token do provider, reconhecer `/kb conectar <codigo>` antes da resolução normal do WhatsApp ou Telegram, extrair identidade externa confiavel, buscar `kb_external_identities`, resolver `user_id` e gravar somente para esse usuario. Eventos brutos sao registrados em `kb_webhook_events` como `rejected`, `resolved`, `processed` ou `failed`, com `authorization`, `cookie`, `x-hub-signature-256`, `x-telegram-bot-api-secret-token`, `x-kb-webhook-token`, `apikey`, `token`, `secret`, `apiKey` e equivalentes recursivos redigidos antes da persistência. Para GitHub, o modelo é GitHub App com `X-Hub-Signature-256` e `installation.id` vinculado como `provider=github-app`, `identityType=installation_id`; o provider legado `github` não é aceito.

Auth e webhooks têm rate limit em memoria por IP. O parser HTTP usa limite explicito de body e preserva `rawBody` para validar assinatura de provider.

Endpoints principais:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/integrations?workspaceSlug=...`
- `POST /api/integrations/:provider/connect`
- `GET /api/integrations/github-app/callback`
- `GET /api/integrations/:provider/sessions/:sessionId`
- `POST /api/integrations/:provider/test`
- `GET /api/integrations/github-app/repositories`
- `POST /api/integrations/github-app/repositories`
- `POST /api/projects`
- `POST /api/notes`
- `GET /api/notes/:id`
- `DELETE /api/integrations/:provider`
- `POST /api/internal/integrations/:provider/resolve`
- `POST /api/internal/n8n/ingest`
- `POST /api/internal/n8n/query`
- `POST /api/internal/n8n/conversation`
- `GET /api/internal/n8n/reminders/dispatch`
- `POST /api/internal/n8n/reminders/mark-sent`

Endpoints mutáveis de navegador validam `Origin`/`Referer`. A API interna exige `Authorization: Bearer ${KB_INTERNAL_SERVICE_TOKEN}` e retorna o segredo descriptografado somente para o provider solicitado.

Contratos canonicos atuais:

- `POST /api/ingest` usa apenas o payload canonico de ingestao, sem `schemaVersion`
- `POST /api/internal/n8n/ingest` usa o mesmo payload canonico, direto ou em `{ payload }`, tambem sem `schemaVersion`
- `POST /api/webhooks/whatsapp` nao e endpoint canonico de ingestao; ele recebe somente o webhook cru do provider

Erros HTTP agora usam envelope comum e seguro, sem alterar os contratos de sucesso:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_query_payload",
    "message": "Payload de consulta invalido.",
    "details": {}
  },
  "requestId": "req-123"
}
```

Toda resposta HTTP inclui `x-request-id`; a API reaproveita o valor recebido do caller ou gera um UUID quando o header nao vem.

## Persistência

A persistência suportada é Postgres para metadados e Supabase Storage privado para payloads. O backend não importa dados antigos de markdown e não grava vault em disco. Markdown renderizado de notas é salvo no bucket em `users/{userId}/workspaces/{workspaceSlug}/notes/{normalized-note-path}` e `kb_notes` mantém `markdown_storage_key` com título, resumo, tags, links e metadados para listagem/busca. Anexos são salvos no bucket em `users/{userId}/workspaces/{workspaceSlug}/attachments/{noteId}/{safe-file-name}` e `kb_attachments` mantém `storage_key`, metadados, tamanho e checksum; estado de conversa fica em `kb_conversation_states`; controle de disparo de lembretes fica em `kb_reminder_dispatch_state`.

As migrations do Postgres usam `node-pg-migrate` com arquivos versionados em `backend/src/infrastructure/persistence/migrations/**`. Para aplicar migrations pendentes manualmente:

```bash
npm run migrate
```

O bootstrap da API também aplica automaticamente as migrations pendentes quando `KB_DATABASE_URL` está configurada.

### Processo para alterar o banco

Fluxo recomendado para qualquer mudança de schema:

1. Defina primeiro a mudança de domínio e de aplicação.
2. Crie uma nova migration em `backend/src/infrastructure/persistence/migrations/` com nome sequencial e descritivo.
3. Atualize o código que depende do schema novo: repositórios, mappers, serviços, contratos e docs afetadas.
4. Rode as migrations localmente com `npm run migrate`.
5. Valide com build e testes impactados antes de abrir PR.

Boas práticas obrigatórias:

- Nunca edite migrations antigas já aplicadas. Para corrigir ou evoluir schema, crie uma migration nova.
- Prefira migrations aditivas e seguras para deploy: adicionar tabela, coluna, índice, backfill compatível e só depois remover legados em uma etapa posterior.
- Evite mudanças destrutivas em uma única etapa quando a aplicação ainda puder ler/escrever o formato antigo.
- Trate `down` como ferramenta de desenvolvimento/local. Não assuma rollback automático em produção como estratégia principal.
- Toda mudança de schema deve vir junto com atualização de repositórios, mappers, setup de teste e documentação relevante.
- Se a mudança afetar dados existentes, documente o impacto e a estratégia de compatibilidade no PR/handoff.

Checklist mínimo antes de concluir uma mudança de banco:

```bash
npm run build:api
npm run migrate
npm run test:api
```

Notas do fluxo atual:

- `npm run migrate` compila o backend e executa `backend/dist/infrastructure/persistence/run-migrations.js`.
- A API aplica migrations `up` automaticamente no bootstrap quando `KB_DATABASE_URL` está configurada.
- O runner de migrations usa a tabela `kb_schema_migrations`.
- Os testes de API criam schemas isolados `kb_test_*` e aplicam migrations neles para cada teste.

## Build e testes

```bash
npm --prefix knowledge-base install
npm --prefix knowledge-base test
```

Os testes de API usam Postgres real. Antes de executar `npm run test:api`, suba o Postgres local com `docker compose up -d postgres` ou aponte `KB_TEST_DATABASE_URL` para uma instância equivalente. Por padrão o helper usa `postgres://postgres:postgres@127.0.0.1:5438/knowledge_base_db_test`, cria automaticamente o database `knowledge_base_db_test` quando ele não existe, executa as migrations em um schema isolado `kb_test_*` por teste e remove esse schema no teardown. O helper recusa qualquer URL de teste cujo database alvo não se chame exatamente `knowledge_base_db_test`.

Use `KB_TEST_ADMIN_DATABASE_URL` apenas quando o usuário de `KB_TEST_DATABASE_URL` não puder criar databases. Se omitido, o helper deriva a URL administrativa trocando o database para `postgres`.

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

### Docker Compose local

O repositório usa um único `docker-compose.yml` para o ambiente local, subindo Postgres, API NestJS com reload e frontend Vite com hot reload usando o `.env` local:

```bash
docker compose up --build
```

Fluxo esperado:

- o compose carrega segredos e credenciais a partir de `knowledge-base/.env`
- `postgres` recebe credenciais do `.env`, e a API usa `KB_DATABASE_URL_DOCKER` dentro do container para não apontar para `127.0.0.1`
- `api` executa `npm run dev:api`, que faz `tsc --watch` do backend e reinicia o Node sobre `backend/dist`
- `api` expõe o inspector do Node em `127.0.0.1:9229` por padrão no Docker local, pronto para o `API Docker Attach` do VS Code
- `frontend` executa `npm run dev:frontend` com polling habilitado para funcionar bem em bind mounts Docker

Para rodar em container, ajuste no `.env`:

```dotenv
KB_API_HOST=0.0.0.0
KB_API_INSPECT=true
KB_API_INSPECT_PORT=9229
KB_FRONTEND_HOST=0.0.0.0
KB_API_PROXY_TARGET=http://api:4310
KB_POSTGRES_PORT=5438
KB_POSTGRES_DB=knowledge_base
KB_POSTGRES_USER=postgres
KB_POSTGRES_PASSWORD=postgres
KB_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5438/knowledge_base
KB_DATABASE_URL_DOCKER=postgres://postgres:postgres@postgres:5432/knowledge_base
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=change-me-service-role-key
KB_SUPABASE_STORAGE_BUCKET=knowledge-base-private
KB_SUPABASE_CACHE_CONTROL=31536000
KB_ALLOWED_ORIGINS=http://127.0.0.1:4311,http://localhost:4311,http://127.0.0.1:4310,http://localhost:4310
LOG_PRETTY_CONSOLE=true
KB_LOG_PRETTY_CONSOLE=true
```
## Deploy em produção

O workflow `.github/workflows/deploy.yml` separa o deploy por paths alterados:

- mudanças em `backend/src/**`, `backend/tests/**`, `backend/Dockerfile`, `docker-compose.prod.yml`, `scripts/deploy/**`, `package*.json`, `backend/tsconfig.json` ou no workflow atualizam o backend
- mudanças em `frontend/**`, `package*.json` ou no workflow atualizam o frontend
- `workflow_dispatch` força os dois caminhos

Backend:

- o runner executa `npm run test:api`
- `scripts/deploy/generate-backend-env.sh` gera `.deploy/backend.env` com as variáveis e secrets do GitHub Environment
- a VPS recebe `backend.env` e `docker-compose.prod.yml`
- a VPS faz `git fetch/pull` usando `VPS_GITHUB_REPO_TOKEN` e sobe apenas `api` com `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build --remove-orphans api`

Frontend:

- o runner executa `npm run test:frontend` e `npm run build:frontend`
- `dist/frontend/` é sincronizado por `rsync` para `FRONTEND_DEPLOY_PATH`, com padrão `/var/www/knowledge-base`
- quando `RELOAD_NGINX` não é `false`, o workflow roda `nginx -t` e recarrega o Nginx

Variáveis do GitHub Environment usadas no deploy:

- `VPS_APP_DIR`: diretório remoto do repositório, por exemplo `/home/ubuntu/knowledge-base`
- `FRONTEND_DEPLOY_PATH`: diretório remoto do frontend estático, por exemplo `/var/www/knowledge-base`
- `RELOAD_NGINX`: controle opcional do reload do Nginx, `true` por padrão
- `VITE_KB_FRONTEND_BASE_PATH` e `VITE_KB_API_BASE_PATH`: paths públicos do frontend e da API, por padrão `/knowledge-base/` e `/knowledge-base/api`
- `KB_PUBLIC_BASE_URL`, `KB_ALLOWED_ORIGINS`, `KB_API_*`, `SUPABASE_URL`, `KB_SUPABASE_STORAGE_BUCKET`, `KB_SUPABASE_CACHE_CONTROL` e variáveis não secretas de integrações/IA

Secrets do GitHub Environment usados no deploy:

- acesso VPS: `VPS_HOST`, `VPS_USER`, `VPS_SSH_PORT`, `VPS_SSH_PRIVATE_KEY`
- acesso Git privado na VPS: `VPS_GITHUB_REPO_TOKEN`
- banco/auth/crypto/storage: `KB_DATABASE_URL`, `KB_ADMIN_EMAIL`, `KB_ADMIN_PASSWORD`, `KB_JWT_ACCESS_SECRET`, `KB_JWT_REFRESH_SECRET`, `KB_INTERNAL_SERVICE_TOKEN`, `KB_CREDENTIALS_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- credenciais opcionais: `KB_GITHUB_APP_*`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `KB_TELEGRAM_*`, `KB_REVIEW_AI_API_KEY`, `KB_CONVERSATION_AI_API_KEY`

Na VPS, prepare uma vez:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin rsync nginx
sudo mkdir -p /var/www/knowledge-base
sudo chown ubuntu:ubuntu /var/www/knowledge-base
```

O diretório `VPS_APP_DIR` deve conter o clone do repositório na branch `main`. O Nginx deve apontar o frontend para `/var/www/knowledge-base` e encaminhar `/api` para `http://127.0.0.1:4310`.

Endpoints HTTP principais:

- `GET /api/health`
- `GET /api/dashboard`
- `POST /api/workspaces`
- `POST /api/projects`
- `GET /api/integrations?workspaceSlug=...`
- `POST /api/integrations/:provider/connect`
- `GET /api/integrations/github-app/callback`
- `GET /api/integrations/:provider/sessions/:sessionId`
- `POST /api/integrations/:provider/test`
- `GET /api/integrations/github-app/repositories`
- `POST /api/integrations/github-app/repositories`
- `GET /api/auth/me`
- `POST /api/notes`
- `GET /api/notes/:id`
- `GET|POST /api/query`
- `POST /api/ingest`
- `POST /api/conversation`
- `POST /api/webhooks/github/push`
- `POST /api/webhooks/whatsapp`
- `POST /api/webhooks/telegram`
- `POST /api/internal/n8n/ingest`
- `POST /api/internal/n8n/query`
- `POST /api/internal/n8n/conversation`
- `GET /api/internal/n8n/reminders/dispatch`
- `POST /api/internal/n8n/reminders/mark-sent`

## Workflows opcionais

Os adapters em `knowledge-base/workflows/` são opcionais/legados para integrações externas. O fluxo principal de conversa livre no WhatsApp agora roda direto no backend em `POST /api/webhooks/whatsapp`; n8n não entra nesse caminho conversacional, e esse endpoint nao aceita mais payload canonico de ingestao.

Quando usados, os workflows fazem apenas:

- receber webhook
- transformar payload de borda
- chamar a API HTTP interna do core com `Authorization: Bearer $KB_INTERNAL_SERVICE_TOKEN`
- enviar resposta para WhatsApp/Telegram

Workflows adicionais disponíveis:

- `kb-query.json`

Se você quiser remover completamente o n8n no futuro, o core já está preparado para isso.
