# Knowledge Vault

O **Knowledge Vault** centraliza o conhecimento operacional e as decisões do seu time em um único lugar, evitando a fragmentação do conhecimento e acelerando a integração de novas pessoas no fluxo de trabalho.

![Dashboard Overview](docs/screenshots/home-overview.png)

---

## Benefícios
* **Zero Perda de Contexto:** Histórico completo de decisões, rotinas e exceções operacionais.
* **Onboarding Acelerado:** Novos membros encontram todo o histórico do projeto em segundos.
* **Captura Invisível:** O conhecimento é registrado onde o trabalho já acontece (WhatsApp, Telegram, GitHub).

---

## Funcionalidades Principais
* **Dashboard Operacional:** Visão unificada das atividades recentes, prioridades e lembretes ativos.
* **Kanban de Lembretes:** Quadro operacional para cartões pendentes, atrasados, resolvidos e arquivados.
* **Busca Contextual:** Encontre respostas instantaneamente em todo o histórico da organização.
* **Ask AI & Histórico:** Interface de chat com IA integrada, incluindo filtros por projeto e paginação do histórico de perguntas por usuário.
* **Briefing de Projeto:** Resumos técnicos operacionais gerados automaticamente por IA a partir dos últimos itens do projeto.
* **Extensão para VS Code:** Interação completa com o Knowledge Vault, chat na barra lateral, busca rápida por atalhos e salvamento de trechos de código/arquivos diretamente do editor.

---

## Integrações
* **WhatsApp:** Envie áudios ou textos para gerar notas estruturadas por IA. Receba lembretes automáticos integrados via *WhatsApp*.
* **Telegram:** Receba alertas de falhas em pipelines, resumos de revisões e interaja diretamente com o bot.
* **GitHub Push:** Captura eventos de `git push`, analisa commits/diffs por IA e envia um resumo técnico acessível para o canal do Telegram e para a base.

---

## CLI & Sincronização Local (`kb`)
O CLI oficial permite interagir com o Knowledge Vault diretamente do terminal e sincronizar arquivos locais.

### Instalação e Inicialização
```bash
npm install -g @pedroaugusto04/kb-cli
kb init
```

### Principais Comandos
* **Sincronizar Diretório ou Arquivo:**
  ```bash
  kb sync --dir ./docs --project meu-projeto
  kb sync --dir ./README.md --project meu-projeto
  ```
* **Flags Úteis:**
  * `--watch` ou `-w`: Monitoramento e sincronização em tempo real.
  * `--dry-run`: Simula a sincronização sem realizar alterações no servidor.

---

## Extensão para VS Code (`knowledge-base-vscode`)
A extensão oficial para VS Code integra o Knowledge Vault diretamente no seu ambiente de desenvolvimento, facilitando o acesso ao conhecimento e o registro de novos aprendizados.

### Principais Funcionalidades
* **Barra Lateral Dedicada:** Chat interativo com a IA e salvamento manual de notas de forma integrada.
* **Salvar Seleção de Código:** Selecione qualquer trecho de código, clique com o botão direito e escolha a opção **KB: Save Selection as Note** para salvá-lo instantaneamente como uma nota em seu projeto.
* **Salvar Arquivo Ativo:** Salve arquivos abertos por completo no Knowledge Vault executando o comando **KB: Save Active File as Note** na paleta de comandos do VS Code (`Ctrl+Shift+P` / `Cmd+Shift+P`).
* **Importação do Histórico de IA Local:** Sincroniza e monitora em tempo real históricos de sessões de ferramentas CLI locais de IA como o *Claude Code* e *Codex CLI*, arquivando-os de forma centralizada.

---

## Executando com Docker

### 1. Configurar variáveis de ambiente
Crie um arquivo `.env` na raiz do projeto contendo as credenciais necessárias baseado no `.env.example`.

### 2. Iniciar os serviços
Suba todos os containers necessários (PostgreSQL, RabbitMQ, API e Frontend):
```bash
docker compose up
```

### 3. Rodar as migrações do banco
Com os containers ativos, execute as migrações:
```bash
docker compose exec api npm run migrate
```

A aplicação estará disponível em:
* **Frontend:** [http://localhost:4311](http://localhost:4311)
* **API:** [http://localhost:4310](http://localhost:4310)

---

## Testes

### Testes Unitários e de Integração
O projeto possui testes para API, CLI e frontend:

```bash
# Rodar todos os testes (rápido, sem navegador real)
npm test

# Rodar apenas testes da API
npm run test:api

# Rodar apenas testes do CLI
npm run test:cli

# Rodar apenas testes do frontend
npm run test:frontend

# Rodar apenas testes de integração (rápido, sem navegador real)
npm run test:integration
```

### Testes E2E (End-to-End)
Testes E2E são executados usando Playwright e cobrem fluxos críticos da aplicação. Estes testes são mais lentos pois usam navegador real:

```bash
# Instalar navegadores do Playwright (primeira vez apenas)
npx playwright install

# Rodar testes E2E em modo headless (apenas Chromium)
npm run test:e2e

# Rodar testes E2E com interface visual
npm run test:e2e:ui

# Rodar testes E2e em modo debug
npm run test:e2e:debug

# Rodar testes E2E com navegador visível
npm run test:e2e:headed
```

**Estratégia de Testes:**
- **Testes de Integração (Vitest):** Rápidos, executam sem navegador real, cobrem a maioria das funcionalidades
- **Testes E2E (Playwright):** Mais lentos, usam navegador real (Chromium), para fluxos críticos e validação cross-browser

**Funcionalidades cobertas pelos testes:**
- Dashboard Operacional: navegação e elementos principais
- Busca Contextual: funcionalidade de busca e filtros
- Ask AI: interface de chat com IA
- Projetos e Notas: gerenciamento de projetos e vault
- Integrações: configuração de integrações (WhatsApp, Telegram, GitHub)

---

## Capturas de Tela

<p align="center">
  <img src="docs/screenshots/dashboard-overview.png" alt="Dashboard" width="80%">
  <br><em>Dashboard operacional com atividades recentes e projetos ativos.</em>
</p>

<p align="center">
  <img src="docs/screenshots/integrations-setup.png" alt="Configuração de Integrações" width="80%">
  <br><em>Painel de configuração guiada de integrações.</em>
</p>

<p align="center">
  <img src="docs/screenshots/projects-overview.png" alt="Visão Geral de Projetos" width="80%">
  <br><em>Visualização e organização de notas dentro do workspace.</em>
</p>

<p align="center">
  <img src="docs/screenshots/vscode-extension.png" alt="Extensão do VS Code" width="80%">
  <br><em>Extensão do VS Code integrada com barra lateral, chat de IA e acesso a atalhos rápidos.</em>
</p>
