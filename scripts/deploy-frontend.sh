#!/usr/bin/env bash
set -euo pipefail

# frontend (Next.js) を Container Apps 環境 cae-specify にデプロイする。
# App Service Plan の VM quota が Free Trial で 0 のため、backend と同じ
# Container Apps に乗せる方針に変更。

RG="rg-specify-prod"
ENV="cae-specify"
APP="specify-frontend"
IMAGE="specifyacrtaz.azurecr.io/specify-frontend:latest"
BACKEND_URL="https://specify-backend.happyfield-8905f02b.japaneast.azurecontainerapps.io"

echo "==> Creating Container App ($APP) in $ENV"
az containerapp create \
  --name "$APP" \
  --resource-group "$RG" \
  --environment "$ENV" \
  --image "$IMAGE" \
  --registry-server specifyacrtaz.azurecr.io \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 --max-replicas 2 \
  --cpu 0.5 --memory 1.0Gi \
  --env-vars BACKEND_URL="$BACKEND_URL" NODE_ENV=production \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv
