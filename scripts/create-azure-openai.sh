#!/usr/bin/env bash
set -euo pipefail

# Azure OpenAI リソースを rg-specify-prod に作成し、gpt-4o-mini をデプロイする。
# 完了後に endpoint / key / deployment 名を表示し、.env への追記文も出す。

RG="rg-specify-prod"
LOC="japaneast"
NAME="aoai-specifytaz"        # Cognitive Services account 名（リージョン内で一意）
DEPLOY="gpt-4o-mini"          # コード側 AZURE_OPENAI_DEPLOYMENT_NAME に入る
MODEL="gpt-4o-mini"
MODEL_VERSION="2024-07-18"    # 入手不能なら az cognitiveservices model list で確認
SKU_CAPACITY=30               # 30K TPM。Free Trial 想定で控えめに

echo "==> 1/3 Creating Azure OpenAI account ($NAME) in $LOC"
az cognitiveservices account create \
  --name "$NAME" \
  --resource-group "$RG" \
  --location "$LOC" \
  --kind OpenAI \
  --sku S0 \
  --custom-domain "$NAME" \
  --yes

echo
echo "==> 2/3 Deploying $MODEL (deployment: $DEPLOY, capacity: ${SKU_CAPACITY}K TPM)"
az cognitiveservices account deployment create \
  --name "$NAME" \
  --resource-group "$RG" \
  --deployment-name "$DEPLOY" \
  --model-name "$MODEL" \
  --model-version "$MODEL_VERSION" \
  --model-format OpenAI \
  --sku-capacity "$SKU_CAPACITY" \
  --sku-name "GlobalStandard"

echo
echo "==> 3/3 Fetching endpoint + key"
ENDPOINT=$(az cognitiveservices account show \
  --name "$NAME" --resource-group "$RG" \
  --query "properties.endpoint" -o tsv)
KEY=$(az cognitiveservices account keys list \
  --name "$NAME" --resource-group "$RG" \
  --query "key1" -o tsv)

cat <<EOF

============================================================
Endpoint   : $ENDPOINT
Deployment : $DEPLOY
Key (key1) : ${KEY:0:8}...${KEY: -4}  (full key is in your shell, not printed)
============================================================

Add to your .env (project root):

  AZURE_OPENAI_ENDPOINT=$ENDPOINT
  AZURE_OPENAI_API_KEY=<paste-from-portal-or-cli>
  AZURE_OPENAI_DEPLOYMENT_NAME=$DEPLOY

Full key (copy this line manually if needed):
  AZURE_OPENAI_API_KEY=$KEY
EOF
