#!/usr/bin/env bash
set -euo pipefail

# gpt-4o-mini を GlobalStandard で aoai-specifytaz にデプロイ → endpoint / key を表示

NAME="aoai-specifytaz"
RG="rg-specify-prod"
DEPLOY="gpt-4o-mini"

echo "==> Deploying $DEPLOY (GlobalStandard, 30K TPM)"
az cognitiveservices account deployment create \
  --name "$NAME" \
  --resource-group "$RG" \
  --deployment-name "$DEPLOY" \
  --model-name gpt-4o-mini \
  --model-version 2024-07-18 \
  --model-format OpenAI \
  --sku-capacity 30 \
  --sku-name GlobalStandard

echo
echo "==> Fetching endpoint + key"
ENDPOINT=$(az cognitiveservices account show \
  --name "$NAME" -g "$RG" \
  --query "properties.endpoint" -o tsv)
KEY=$(az cognitiveservices account keys list \
  --name "$NAME" -g "$RG" \
  --query "key1" -o tsv)

cat <<EOF

============================================================
.env に追記する内容:

AZURE_OPENAI_ENDPOINT=$ENDPOINT
AZURE_OPENAI_API_KEY=$KEY
AZURE_OPENAI_DEPLOYMENT_NAME=$DEPLOY
============================================================
EOF
