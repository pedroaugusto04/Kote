#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-production}"
VARS_FILE="${2:-.github/env/production.variables.env}"
SECRETS_FILE="${3:-.github/env/production.secrets.env}"

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
  echo "Copie .github/env/production.secrets.env.example para $SECRETS_FILE e preencha."
  exit 1
fi

echo "Aplicando variables em environment: $ENV_NAME"
while IFS='=' read -r key value; do
  [[ -z "${key}" || "${key}" =~ ^[[:space:]]*# ]] && continue
  key="$(echo "$key" | xargs)"
  value="${value:-}"
  gh variable set "$key" --env "$ENV_NAME" --body "$value"
done < "$VARS_FILE"

echo "Aplicando secrets em environment: $ENV_NAME"
while IFS='=' read -r key value; do
  [[ -z "${key}" || "${key}" =~ ^[[:space:]]*# ]] && continue
  key="$(echo "$key" | xargs)"
  value="${value:-}"
  gh secret set "$key" --env "$ENV_NAME" --body "$value"
done < "$SECRETS_FILE"

echo "Concluido."
