# Knowledge Vault

O Knowledge Vault ajuda equipes a registrar, organizar e recuperar contexto importante do dia a dia sem depender da memória de poucas pessoas. Em vez de perder decisões, pendências, aprendizados e combinados em conversas soltas, o time passa a ter um lugar único para consultar o que aconteceu, o que mudou e o que precisa acontecer a seguir.

![Visão geral do Knowledge Vault](docs/screenshots/home-overview.png)

## O que este produto faz

O produto centraliza conhecimento operacional em uma experiência simples de usar:

- registra notas e contexto por workspace e por projeto
- transforma informações espalhadas em uma base consultável
- destaca prioridades, lembretes e eventos recentes
- facilita encontrar respostas sem depender de repasses manuais
- captura conhecimento automaticamente via fluxos integrados como WhatsApp e GitHub Push

Na prática, ele funciona como uma memória compartilhada para a operação.

## Principais funcionalidades

### 1. Organização por projeto

Cada projeto pode concentrar notas, rotinas, incidentes, aprendizados e combinados relevantes. Isso ajuda a manter o contexto no lugar certo e reduz a sensação de que tudo está “solto” entre várias ferramentas.

### 2. Busca contextual

Quando alguém precisa encontrar uma resposta, o time não precisa voltar para trás em conversas intermináveis. A busca permite localizar rapidamente notas, assuntos, termos recorrentes e históricos importantes.

![Busca e recuperação de contexto](docs/screenshots/search-context.png)

### 3. Lembretes e prioridades

Itens que exigem acompanhamento não ficam escondidos. O produto destaca o que está aberto, o que precisa de atenção e o que deve ser retomado no momento certo.

### 4. Visao operacional do que importa

A Home resume atividade recente, projetos em movimento, prioridades e eventos relevantes. Isso ajuda lideranças e equipes a entender rapidamente onde esta o foco sem precisar montar esse panorama manualmente.

### 5. Fluxos de Captura Contínua: WhatsApp e GitHub Push

O Knowledge Vault se integra naturalmente onde o time já trabalha, capturando conhecimento de forma automática e sem esforço adicional. Os fluxos do WhatsApp e GitHub Push são parte central da experiência:

- **Como funciona o fluxo via WhatsApp:**
  1. O usuário envia uma mensagem de texto ou de áudio diretamente para o contato do Knowledge Vault relatando um problema, uma decisão rápida ou o resumo de uma reunião.
  2. O sistema recebe a mensagem, analisa o contexto e identifica automaticamente a qual projeto ela pertence.
  3. Uma nota estruturada é gerada e salva no workspace.
  4. A informação passa a ficar disponível imediatamente na Home e na busca para o restante do time, sem que ninguém tenha precisado preencher formulários ou abrir o sistema.

- **Como funciona o fluxo via GitHub Push:**
  1. O desenvolvedor envia o código (`git push`) para o repositório.
  2. O Knowledge Vault captura esse evento automaticamente em background.
  3. O sistema analisa as mensagens de commit e o escopo das mudanças (diff), gerando uma nota técnica de atualização.
  4. Decisões de arquitetura e correções que antes ficavam "escondidas" no código se tornam contexto acessível a todos no projeto, sem criar trabalho manual extra de documentação.

![Tela de integracoes guiadas](docs/screenshots/integrations-setup.png)

## Como o Knowledge Vault ajuda

- reduz perda de contexto entre pessoas, turnos e projetos
- diminui retrabalho causado por informacao espalhada
- acelera onboarding
- melhora continuidade operacional 
- cria historico consultavel de decisoes, rotinas e excecoes
- ajuda o time a agir com mais clareza e menos dependencia de memoria individual

## Como funciona na prática

1. O time cria um workspace e organiza os projetos principais.
2. As informações importantes passam a ser registradas em notas simples e consultáveis.
3. Lembretes e pendências ganham visibilidade na Home.
4. Quando surge uma dúvida, a busca encontra o contexto mais relevante em poucos segundos.
5. Os fluxos naturais de comunicação no WhatsApp e envios de código (GitHub Push) alimentam o contexto automaticamente, evitando trabalho de documentação manual.

## Comece em 2 minutos

1. Crie seu workspace.
2. Cadastre os projetos que fazem parte da sua operação.
3. Conecte os canais que fazem sentido para o seu fluxo.
4. Comece a registrar notas, combinados, incidentes, rotinas e proximos passos.
5. Use a busca e a Home para acompanhar o que esta acontecendo e recuperar contexto quando precisar.

## Para quem é indicado

O Knowledge Vault faz mais sentido para equipes que lidam com muita troca de contexto, acompanhamento operacional e necessidade de continuidade:

- operacoes
- suporte
- produto
- plataforma
- financeiro
- times técnicos que precisam preservar histórico e contexto de execução

Se o seu time sofre com informação espalhada, dependências excessivas de pessoas-chave e dificuldade para recuperar decisões antigas, este produto foi desenhado para resolver exatamente isso.
