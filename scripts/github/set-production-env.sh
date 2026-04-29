#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-production}"
VARS_FILE="${2:-.github/env/production.variables.env}"
SECRETS_FILE="${3:-.github/env/production.secrets.env}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

resolve_path() {
  local path="$1"
  if [[ "$path" = /* ]]; then
    printf '%s\n' "$path"
  else
    printf '%s/%s\n' "$REPO_ROOT" "$path"
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s\n' "$value"
}

normalize_secret_value() {
  local value="$1"

  # Allow PEM/OpenSSH keys to be stored in single-line env files using literal
  # "\n" separators, but restore real newlines before uploading to GitHub.
  if [[ "$value" == *"\\n"* && "$value" == *"-----BEGIN "* ]]; then
    value="${value//\\n/$'\n'}"
  fi

  printf '%s' "$value"
}

validate_name() {
  local name="$1"
  local source_file="$2"
  local line_number="$3"
  local kind="$4"

  if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Nome de $kind invalido em $source_file:$line_number: '$name'"
    echo "Use apenas letras, numeros e underscore, iniciando com letra ou underscore."
    exit 1
  fi
}

VARS_FILE="$(resolve_path "$VARS_FILE")"
SECRETS_FILE="$(resolve_path "$SECRETS_FILE")"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI nao encontrado."
  exit 1
fi

if [[ ! -f "$VARS_FILE" ]]; then
  echo "Arquivo de variables nao encontrado: $VARS_FILE"
  exit 1
fi

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "Arquivo de secrets nao encontrado: $SECRETS_FILE"
  echo "Copie .github/env/production.secrets.env.example para o arquivo indicado e preencha."
  exit 1
fi

echo "Aplicando variables em environment: $ENV_NAME"
line_number=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line_number=$((line_number + 1))
  line="${line%$'\r'}"
  [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue

  if [[ "$line" != *"="* ]]; then
    echo "Linha invalida em $VARS_FILE:$line_number (faltando '='): $line"
    exit 1
  fi

  key="${line%%=*}"
  value="${line#*=}"
  key="$(trim "$key")"

  validate_name "$key" "$VARS_FILE" "$line_number" "variable"
  gh variable set "$key" --env "$ENV_NAME" --body "$value"
done < "$VARS_FILE"

echo "Aplicando secrets em environment: $ENV_NAME"
line_number=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line_number=$((line_number + 1))
  line="${line%$'\r'}"
  [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue

  if [[ "$line" != *"="* ]]; then
    echo "Linha invalida em $SECRETS_FILE:$line_number (faltando '='): $line"
    echo "Se o valor for multilinha (ex.: chave privada), converta para uma unica linha com '\\n'."
    exit 1
  fi

  key="${line%%=*}"
  value="${line#*=}"
  key="$(trim "$key")"
  value="$(normalize_secret_value "$value")"

  validate_name "$key" "$SECRETS_FILE" "$line_number" "secret"
  gh secret set "$key" --env "$ENV_NAME" --body "$value"
done < "$SECRETS_FILE"

echo "Concluido."
