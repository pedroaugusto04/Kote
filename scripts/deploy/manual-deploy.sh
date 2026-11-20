#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
VARS_FILE="$ROOT_DIR/.github/env/production.variables.env"
SECRETS_FILE="$ROOT_DIR/.github/env/production.secrets.env"
fail() { printf 'Erro: %s\n' "$1" >&2; exit 1; }
if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  printf 'Usage: scripts/deploy/manual-deploy.sh\n'
  exit 0
fi
[[ "$#" == 0 ]] || fail 'opção inválida'

load_env_file() {
  local file="$1" allowed_keys=" $* " line key value line_number=0
  [[ -f "$file" ]] || fail "arquivo de configuração ausente: $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$((line_number + 1))
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || fail "linha sem '=' em $file:$line_number"
    key="${line%%=*}"; value="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail "chave inválida em $file:$line_number"
    [[ "$allowed_keys" == *" $key "* ]] || continue
    printf -v "$key" '%s' "$value"
  done < "$file"
}

load_env_file "$VARS_FILE" VPS_APP_DIR FRONTEND_DEPLOY_PATH RELOAD_NGINX KB_RUN_INTEGRATION_TESTS KB_PUBLIC_BASE_URL VITE_KB_FRONTEND_BASE_PATH VITE_KB_API_BASE_PATH VITE_WHATSAPP_NUMBER VITE_TELEGRAM_BOT_USERNAME VITE_ATTACHMENT_MAX_SIZE_BYTES
[[ -f "$SECRETS_FILE" ]] || fail "arquivo de configuração ausente: $SECRETS_FILE"
load_env_file "$SECRETS_FILE" VPS_HOST VPS_USER VPS_SSH_PORT VPS_SSH_PRIVATE_KEY
VPS_SSH_PORT="${VPS_SSH_PORT:-22}"
FRONTEND_DEPLOY_PATH="${FRONTEND_DEPLOY_PATH:-}"
RELOAD_NGINX="${RELOAD_NGINX:-true}"
KB_RUN_INTEGRATION_TESTS="${KB_RUN_INTEGRATION_TESTS:-false}"

[[ -n "${VPS_HOST:-}" && -n "${VPS_USER:-}" ]] || fail "configure VPS_HOST e VPS_USER em $SECRETS_FILE"
[[ -n "${VPS_APP_DIR:-}" ]] || fail "configure VPS_APP_DIR em $VARS_FILE"
[[ -n "$FRONTEND_DEPLOY_PATH" ]] || fail "configure FRONTEND_DEPLOY_PATH em $VARS_FILE"
[[ -n "${KB_PUBLIC_BASE_URL:-}" ]] || fail "configure KB_PUBLIC_BASE_URL em $VARS_FILE"
[[ "$VPS_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || fail 'VPS_HOST inválido'
[[ "$VPS_USER" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || fail 'VPS_USER inválido'
[[ "$VPS_SSH_PORT" =~ ^[0-9]+$ ]] && ((VPS_SSH_PORT > 0 && VPS_SSH_PORT < 65536)) || fail 'VPS_SSH_PORT inválido'
[[ "$VPS_APP_DIR" =~ ^/[A-Za-z0-9._/-]+$ && "$VPS_APP_DIR" != / && "/$VPS_APP_DIR/" != *"/../"* ]] || fail 'VPS_APP_DIR deve ser um caminho absoluto simples'
[[ "$FRONTEND_DEPLOY_PATH" =~ ^/[A-Za-z0-9._/-]+$ && "$FRONTEND_DEPLOY_PATH" != / && "$FRONTEND_DEPLOY_PATH" != "$VPS_APP_DIR" && "/$FRONTEND_DEPLOY_PATH/" != *"/../"* ]] || fail 'FRONTEND_DEPLOY_PATH deve ser um caminho absoluto seguro'
[[ "$RELOAD_NGINX" == true || "$RELOAD_NGINX" == false ]] || fail 'RELOAD_NGINX deve ser true ou false'
[[ "$KB_RUN_INTEGRATION_TESTS" == true || "$KB_RUN_INTEGRATION_TESTS" == false ]] || fail 'KB_RUN_INTEGRATION_TESTS deve ser true ou false'
for command in git node npm rsync ssh ssh-keyscan python3 curl; do command -v "$command" >/dev/null 2>&1 || fail "comando não encontrado: $command"; done
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]] || fail 'o workflow usa Node.js 24'

[[ -n "${VITE_KB_FRONTEND_BASE_PATH:-}" && -n "${VITE_KB_API_BASE_PATH:-}" ]] || fail "configure VITE_KB_FRONTEND_BASE_PATH e VITE_KB_API_BASE_PATH em $VARS_FILE"
VITE_WHATSAPP_NUMBER="${VITE_WHATSAPP_NUMBER:-}"
VITE_TELEGRAM_BOT_USERNAME="${VITE_TELEGRAM_BOT_USERNAME:-}"
VITE_ATTACHMENT_MAX_SIZE_BYTES="${VITE_ATTACHMENT_MAX_SIZE_BYTES:-10485760}"

[[ "$(git -C "$ROOT_DIR" branch --show-current)" == main ]] || fail 'rode a partir da branch main'
git -C "$ROOT_DIR" fetch --quiet origin main || fail 'falha ao atualizar origin/main'
COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
[[ "$COMMIT" == "$(git -C "$ROOT_DIR" rev-parse origin/main)" ]] || fail 'HEAD precisa corresponder a origin/main'
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain -- backend frontend scripts/deploy docker-compose.prod.yml package.json package-lock.json eslint.config.js .dockerignore ':(exclude)scripts/deploy/manual-deploy.sh')" ]]; then
  fail 'há alterações locais nas áreas usadas pelo deploy; faça push ou descarte-as primeiro'
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_DIR"' EXIT
KNOWN_HOSTS_FILE="$TEMP_DIR/known_hosts"
SOURCE_DIR="$TEMP_DIR/source"
SHORT_SHA="${COMMIT:0:12}"
PROJECT_SLUG="$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-')"
PROJECT_SLUG="${PROJECT_SLUG%-}"
IMAGE_REF="$PROJECT_SLUG-api:manual-$SHORT_SHA"
REMOTE_TARGET="$VPS_USER@$VPS_HOST"
REMOTE_STAGE="/tmp/$PROJECT_SLUG-manual-deploy-$SHORT_SHA"
if [[ -n "${VPS_SSH_KEY_FILE:-}" ]]; then
  [[ -f "$VPS_SSH_KEY_FILE" ]] || fail "VPS_SSH_KEY_FILE não existe: $VPS_SSH_KEY_FILE"
  SSH_KEY_FILE="$VPS_SSH_KEY_FILE"
elif [[ -n "${VPS_SSH_PRIVATE_KEY:-}" ]]; then
  SSH_KEY_FILE="$TEMP_DIR/deploy_key"
  printf '%b\n' "$VPS_SSH_PRIVATE_KEY" > "$SSH_KEY_FILE"
  chmod 600 "$SSH_KEY_FILE"
else
  fail "defina VPS_SSH_KEY_FILE no shell ou VPS_SSH_PRIVATE_KEY em $SECRETS_FILE"
fi
unset VPS_SSH_PRIVATE_KEY
ssh-keyscan -p "$VPS_SSH_PORT" -H "$VPS_HOST" > "$KNOWN_HOSTS_FILE" 2>/dev/null || fail 'falha ao obter chave SSH da VPS'
SSH_OPTIONS=(-i "$SSH_KEY_FILE" -p "$VPS_SSH_PORT" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$KNOWN_HOSTS_FILE")

printf 'Validando configuração da VPS sem alterá-la...\n'
PLATFORM="$(ssh "${SSH_OPTIONS[@]}" "$REMOTE_TARGET" bash -s -- "$VPS_APP_DIR" "$FRONTEND_DEPLOY_PATH" <<'REMOTE_PREFLIGHT'
set -euo pipefail
app="$1"; frontend="$2"
test -d "$app" && test -s "$app/.env.prod" && test -s "$app/docker-compose.prod.yml"
sudo docker compose --env-file "$app/.env.prod" -f "$app/docker-compose.prod.yml" config --quiet
test -n "$(sudo docker compose --env-file "$app/.env.prod" -f "$app/docker-compose.prod.yml" ps -q api)"
sudo docker info >/dev/null
sudo test ! -L "$frontend"
case "$(sudo docker info --format '{{.Architecture}}')" in
  aarch64|arm64) printf linux/arm64 ;;
  x86_64|amd64) printf linux/amd64 ;;
  *) exit 1 ;;
esac
REMOTE_PREFLIGHT
)" || fail 'pré-validação da VPS falhou; nenhum deploy foi iniciado'

printf '\nDeploy do commit %s\nVPS: %s@%s:%s\nBackend: %s\nFrontend (rsync --delete): %s\nPlataforma: %s\n' "$COMMIT" "$VPS_USER" "$VPS_HOST" "$VPS_SSH_PORT" "$VPS_APP_DIR" "$FRONTEND_DEPLOY_PATH" "$PLATFORM"
printf 'O ambiente atual do container API será mantido; .env.prod não será copiado nem alterado.\n'
printf 'O deploy executa migrations e substitui arquivos do frontend no destino acima.\n'

mkdir -p "$SOURCE_DIR"
git -C "$ROOT_DIR" archive --format=tar "$COMMIT" | tar -xf - -C "$SOURCE_DIR"
cd "$SOURCE_DIR"
printf '\n== Checks do backend (workflow) ==\n'
npm ci
npm run lint:architecture
npm run lint:security
if [[ "$KB_RUN_INTEGRATION_TESTS" == true ]]; then npm test; else npm run test:ci; fi

printf '\n== Build do frontend ==\n'
TZ=UTC bash scripts/deploy/update-sitemap.sh
VITE_KB_FRONTEND_BASE_PATH="$VITE_KB_FRONTEND_BASE_PATH" \
VITE_KB_API_BASE_PATH="$VITE_KB_API_BASE_PATH" \
VITE_WHATSAPP_NUMBER="$VITE_WHATSAPP_NUMBER" \
VITE_TELEGRAM_BOT_USERNAME="$VITE_TELEGRAM_BOT_USERNAME" \
VITE_ATTACHMENT_MAX_SIZE_BYTES="$VITE_ATTACHMENT_MAX_SIZE_BYTES" \
  npm run build:frontend

[[ -t 0 ]] || fail 'o deploy exige terminal interativo para a confirmação final'
printf '\nChecks concluídos. Digite DEPLOY %s para confirmar as alterações na VPS: ' "$SHORT_SHA"
read -r confirmation
[[ "$confirmation" == "DEPLOY $SHORT_SHA" ]] || fail 'deploy cancelado'

printf '\n== Envio do contexto e do Compose ==\n'
ssh "${SSH_OPTIONS[@]}" "$REMOTE_TARGET" rm -rf -- "$REMOTE_STAGE"
rsync -az -e "ssh -i $SSH_KEY_FILE -p $VPS_SSH_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS_FILE" \
  package.json package-lock.json backend scripts "$REMOTE_TARGET:$REMOTE_STAGE/"
rsync -az -e "ssh -i $SSH_KEY_FILE -p $VPS_SSH_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS_FILE" \
  docker-compose.prod.yml "$REMOTE_TARGET:$VPS_APP_DIR/docker-compose.prod.yml"

printf '\n== Build, deploy e migrations do backend ==\n'
ssh "${SSH_OPTIONS[@]}" "$REMOTE_TARGET" bash -s -- "$VPS_APP_DIR" "$REMOTE_STAGE" "$IMAGE_REF" <<'REMOTE_BACKEND'
set -euo pipefail
app="$1"; stage="$2"; image="$3"
work="$(mktemp -d)"; chmod 700 "$work"
trap 'rm -rf -- "$stage" "$work"' EXIT
cd "$app"
test -s .env.prod
api_id="$(sudo docker compose --env-file .env.prod -f docker-compose.prod.yml ps -q api)"
test -n "$api_id"
sudo docker inspect "$api_id" > "$work/before.json"
sudo docker compose --env-file .env.prod -f docker-compose.prod.yml config --format json > "$work/compose.json"

python3 - "$work/before.json" "$work/compose.json" "$work/manual-compose.json" "$image" <<'PY'
import json, os, sys
with open(sys.argv[1], encoding="utf-8") as source: container = json.load(source)[0]
with open(sys.argv[2], encoding="utf-8") as source: compose = json.load(source)
env = dict(entry.split("=", 1) for entry in container["Config"].get("Env", []))
api = compose["services"]["api"]
api["image"] = sys.argv[4]
api["pull_policy"] = "never"
api["environment"] = env
api.pop("env_file", None)
with open(sys.argv[3], "w", encoding="utf-8") as output: json.dump(compose, output)
os.chmod(sys.argv[3], 0o600)
PY

architecture="$(sudo docker info --format '{{.Architecture}}')"
case "$architecture" in
  aarch64|arm64) platform=linux/arm64 ;;
  x86_64|amd64) platform=linux/amd64 ;;
  *) exit 1 ;;
esac
sudo docker build --pull --platform "$platform" --tag "$image" --file "$stage/backend/Dockerfile" "$stage"
compose=(sudo docker compose --project-directory "$app" -f "$work/manual-compose.json")
"${compose[@]}" up -d --remove-orphans api
"${compose[@]}" exec -T api node backend/dist/infrastructure/persistence/run-migrations.js

new_id="$("${compose[@]}" ps -q api)"
sudo docker inspect "$new_id" > "$work/after.json"
python3 - "$work/before.json" "$work/after.json" <<'PY'
import json, sys
def env(path):
    with open(path, encoding="utf-8") as source: container = json.load(source)[0]
    return dict(entry.split("=", 1) for entry in container["Config"].get("Env", []))
before, after = env(sys.argv[1]), env(sys.argv[2])
changed = sorted(key for key, value in before.items() if after.get(key) != value)
if changed:
    print("Ambiente da API mudou nas chaves: " + ", ".join(changed), file=sys.stderr)
    raise SystemExit(1)
print(f"Ambiente preservado: {len(before)} variáveis conferidas.")
PY

for attempt in $(seq 1 36); do
  health="$(sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$new_id")"
  if [[ "$health" == healthy ]]; then "${compose[@]}" ps api; exit 0; fi
  if [[ "$health" == unhealthy || "$health" == missing ]]; then
    printf 'Healthcheck falhou (%s); sem rollback automático.\\n' "$health" >&2
    exit 1
  fi
  sleep 5
done
printf 'API não ficou saudável em 180 segundos; sem rollback automático.\\n' >&2
exit 1
REMOTE_BACKEND

printf '\n== Deploy do frontend ==\n'
ssh "${SSH_OPTIONS[@]}" "$REMOTE_TARGET" sudo mkdir -p -- "$FRONTEND_DEPLOY_PATH"
ssh "${SSH_OPTIONS[@]}" "$REMOTE_TARGET" sudo chown "$VPS_USER:$VPS_USER" -- "$FRONTEND_DEPLOY_PATH"
rsync -az --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  -e "ssh -i $SSH_KEY_FILE -p $VPS_SSH_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS_FILE" \
  "$SOURCE_DIR/dist/frontend/" "$REMOTE_TARGET:$FRONTEND_DEPLOY_PATH/"
if [[ "$RELOAD_NGINX" != false ]]; then
  ssh "${SSH_OPTIONS[@]}" "$REMOTE_TARGET" bash -s <<'REMOTE_NGINX'
set -euo pipefail
if command -v nginx >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^nginx.service'; then
  sudo nginx -t
  sudo systemctl reload nginx
else
  printf 'Nginx não instalado; reload ignorado.\\n'
fi
REMOTE_NGINX
fi
python3 - "${KB_PUBLIC_BASE_URL%/}/" <<'PY'
from html.parser import HTMLParser
from urllib.parse import urljoin
from urllib.request import urlopen
import sys

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        url = values.get("src") or values.get("href", "")
        if url.endswith((".js", ".css")):
            self.urls.add(url)

page_url = sys.argv[1]
with urlopen(page_url, timeout=20) as response:
    page_url = response.geturl()
    parser = Assets()
    parser.feed(response.read().decode("utf-8"))
if not parser.urls:
    raise SystemExit("A página pública não lista assets JS/CSS")
for asset in sorted(parser.urls):
    asset_url = urljoin(page_url, asset)
    with urlopen(asset_url, timeout=20) as response:
        content_type = response.headers.get_content_type()
        expected = "javascript" if asset.endswith(".js") else "text/css"
        if expected not in content_type:
            raise SystemExit(f"Asset servido com MIME incorreto: {asset_url} ({content_type})")
        print(f"Asset validado: {asset_url} ({content_type})")
PY
printf '\nDeploy concluído para %s; o ambiente da API foi preservado.\\n' "$COMMIT"
