#!/usr/bin/env bash
set -euo pipefail

# Load secrets from project-root .env
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

: "${OPENAI_API_KEY:?OPENAI_API_KEY not set in .env}"
: "${NOTION_API_KEY:?NOTION_API_KEY not set in .env}"
: "${NOTION_PRD_DB_ID:?NOTION_PRD_DB_ID not set in .env}"

az containerapp create \
  --name specify-backend \
  --resource-group rg-specify-prod \
  --environment cae-specify \
  --image specifyacrtaz.azurecr.io/specify-backend:latest \
  --registry-server specifyacrtaz.azurecr.io \
  --target-port 8000 \
  --ingress external \
  --min-replicas 1 --max-replicas 3 \
  --cpu 0.5 --memory 1.0Gi \
  --secrets \
    openai-api-key="$OPENAI_API_KEY" \
    notion-api-key="$NOTION_API_KEY" \
    notion-prd-db-id="$NOTION_PRD_DB_ID" \
  --env-vars \
    OPENAI_API_KEY=secretref:openai-api-key \
    NOTION_API_KEY=secretref:notion-api-key \
    NOTION_PRD_DB_ID=secretref:notion-prd-db-id
