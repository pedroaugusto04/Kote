# GitHub Push Setup

## Endpoint

Use o webhook do workflow adapter:

- path: `/n8n/webhook/kb-github-push`

Exemplo:

- `https://example.com/n8n/webhook/kb-github-push`

## Variáveis obrigatórias em `.env`

- `KB_GITHUB_APP_WEBHOOK_SECRET`
- `KB_GITHUB_API_TOKEN`
- `KB_REVIEW_AI_PROVIDER`
- `KB_REVIEW_AI_BASE_URL`
- `KB_REVIEW_AI_MODEL`
- `KB_REVIEW_AI_API_KEY`
- `KB_TELEGRAM_BOT_TOKEN`
- `KB_TELEGRAM_CHAT_ID`

Nada disso deve ficar em workflow hardcoded ou em arquivos commitados.

## GitHub App

1. Crie um GitHub App.
2. Configure o webhook URL para o endpoint acima.
3. Configure o webhook secret com `KB_GITHUB_APP_WEBHOOK_SECRET`.
4. Assine o evento `Push`.
5. Dê permissão de leitura para metadata e contents quando necessário para comparar commits.
6. Instale o app nos repositórios do cliente.

## Resultado do fluxo

A cada push:

1. o adapter recebe o webhook
2. o core monta o contexto do review
3. o review por IA é gerado em código
4. o resultado é salvo no Obsidian
5. um resumo do review é enviado ao Telegram
