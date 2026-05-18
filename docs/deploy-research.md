# Week 6 デプロイ事前調査 — Azure 構成

**目的**: 2026/05/19〜05/28 のハッカソンデモまでに Specify を Azure 上で動かす。実装着手前の事前調査。

**最大リスク**: バックエンドの `/api/analyze` は `sse-starlette` で **20〜45 秒の long-running SSE** を返す。Azure の compute サービスには SSE を黙ってバッファ・統合してしまう罠が多い。本ドキュメントの選定基準はまず「**SSE が壊れない経路かどうか**」。

---

## 結論: 推奨アーキテクチャ

| 層 | サービス | プラン |
|---|---|---|
| フロント（Next.js 16） | **Azure App Service for Linux (Web App for Containers)** | B1 ($13/月) |
| バックエンド（FastAPI） | **Azure Container Apps** | Consumption（min replicas=0） |
| Secret 管理 | **Azure Key Vault** + User-assigned Managed Identity | Standard |
| イメージレジストリ | **Azure Container Registry** | Basic ($5/月) |
| 監視 | Log Analytics（Container Apps が必須要件として要求） | 従量 |

**選定理由（3 行）**:

1. **SSE が壊れない経路で最短**: Container Apps の Envoy ingress は HTTP/1.1/2 を **240 秒**まで非バッファでパススルー（公式記載）。`EventSourceResponse` がそのまま動く。20〜45 秒 SSE は余裕。
2. **同一オリジン透過プロキシをそのまま動かせる**: SWA hybrid + linked backend 経路には SSE をシングルペイロードに統合してしまうバグが未解決（[Azure/static-web-apps#1180](https://github.com/Azure/static-web-apps/issues/1180)）。App Service Linux に Next.js standalone を載せれば、現在の `new Response(upstream.body)` パススルーをそのまま使える。
3. **コストと期限に最適**: Container Apps の無料枠（180k vCPU-sec/月、200 万 req/月）と scale-to-zero でハッカソン期間中は実質ゼロ円圏。10 日稼働で合計 **¥1,500 程度**の見込み。

**フロント→バックエンドの通信経路**: ブラウザ → App Service Linux 上の Next.js → Route Handler `/api/analyze` → `fetch(BACKEND_URL+/api/analyze)` で Container Apps の public FQDN を server-to-server で叩く。ブラウザから見ると常に同一オリジン、**CORS 設定不要**。

---

## 代替案を見送った理由

| 案 | 却下理由 | 一次ソース |
|---|---|---|
| **SWA hybrid Next.js（managed）+ 別バックエンド** | SWA の `nextjs.md` で「Linked APIs using Azure Functions, Azure App Service, **Azure Container Apps**, or Azure API Management は unsupported」と明記 | [SWA Next.js docs](https://learn.microsoft.com/en-us/azure/static-web-apps/nextjs) |
| **SWA hybrid Next.js single（Route Handler が FastAPI を呼ぶ）** | hybrid は依然 **preview**（2026/01 更新時点）、Next.js 16 の動作保証なし、250MB アプリサイズ上限、middleware/ISR の制約あり | 同上 |
| **SWA static + linked backend（FastAPI on Container Apps）** | [Issue #1180](https://github.com/Azure/static-web-apps/issues/1180)「Linked backends: Streaming does not stream; it arrives in a single payload」未解決（2023 起票） | 同 |
| **Azure Functions（Consumption / Flex Consumption）で FastAPI** | HTTP トリガが **230〜240 秒タイムアウト**。Python out-of-process worker は streaming 非対応（C# in-proc のみ） | [Flex Consumption plan](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan) / [#1478](https://github.com/Azure/static-web-apps/issues/1478) |
| **App Service for Linux でバックエンドも** | 動くが [`app-service-linux-docs#231`](https://github.com/Azure/app-service-linux-docs/issues/231)「Docker container FastAPI backend is not streaming」未解決事例あり。`X-Accel-Buffering: no` + `await response.flush()` 等の追加対応が要る場合あり。Container Apps の Envoy ほうが素直 |  |
| **App Gateway / APIM をフロントに置く** | `buffer-response="false"` 等の明示設定必須。ハッカソン規模では不要な複雑性 | [AppGW SSE](https://learn.microsoft.com/en-us/azure/application-gateway/use-server-sent-events) |

---

## 詰まりそうな論点リスト

| # | 論点 | 対応 |
|---|---|---|
| 1 | Next.js Route Handler の SSE 透過プロキシで `export const dynamic = 'force-dynamic'` を付けないと Next.js 16 が静的最適化してストリームを潰す | route.ts に `dynamic = 'force-dynamic'` を明記（要追加） |
| 2 | App Service Linux の Azure LB idle **230 秒**（変更不可）。Container Apps は **240 秒**（変更不可） | `sse-starlette` の heartbeat ping を 15 秒で継続。SSE が 4 分超になる将来要件が出たら設計変更 |
| 3 | Next.js standalone の HOSTNAME バインド | Dockerfile に `ENV HOSTNAME=0.0.0.0` を明記しないとリクエスト受けられない |
| 4 | App Service for Containers のリスニングポート | App Setting `WEBSITES_PORT=3000` 必須 |
| 5 | Container Apps の User-assigned MI を先に作る順序 | create 時に `--user-assigned` を指定しないと Key Vault 参照 secret 付きで作成できない |
| 6 | ACR 認証 | 初回 `az containerapp up --source .` は ACR を自動作成。後の更新で `--image` 指定するなら `--registry-server` + identity 紐付け |
| 7 | Cold start | min-replicas=0 だと最初の 1 リクエストで 1〜3 秒コールド。デモ直前に warm-up リクエストを打つか min-replicas=1 にする |
| 8 | `BACKEND_URL` の HTTPS | Container Apps の FQDN は HTTPS 強制。internal ingress にすると VNet が必要なので **external ingress + パブリック HTTPS** で行く |
| 9 | フロント環境変数の読み方 | `BACKEND_URL` は **runtime で `process.env` 参照**（Route Handler 内 fetch なので build time に焼く必要なし）。`NEXT_PUBLIC_*` だけ build time |
| 10 | CORS は基本不要 | フロント→バックエンドが server-to-server のため。ただし保険で FastAPI 側 `CORSMiddleware` にフロントの App Service URL のみ allow を入れておく |

---

## 作業手順（フェーズ単位）

合計 **約 4.5 日**の見積もり → 5/19〜5/28 内に余裕。

### Phase 1: ローカル Docker 化検証（1 日）

- FastAPI 側: `backend/Dockerfile` を作成（uvicorn + sse-starlette）、`docker run` で `curl -N` で chunk 受信できることを確認
- Next.js 側: `output: 'standalone'` を `next.config.ts` に追加、Dockerfile で `ENV HOSTNAME=0.0.0.0`、`BACKEND_URL` 環境変数で切替可能なことを 2 コンテナ起動で確認

### Phase 2: Azure リソース基盤（0.5 日）

- Resource Group、Log Analytics、ACR（Basic）、Key Vault、User-assigned Managed Identity を作成
- KV に `OPENAI_API_KEY` / `NOTION_API_KEY` / `NOTION_DATABASE_ID` を投入
- MI に Key Vault の `Key Vault Secrets User` ロール付与

### Phase 3: バックエンド（FastAPI）を Container Apps へ（1 日）

- `az containerapp up --source ./backend --ingress external --target-port 8000` で初回デプロイ
- `az containerapp update` で `--secrets keyvaultref:...,identityref:...` と env (`secretref`) を設定
- スケール: min-replicas=0 / max=3、CPU 0.5 / mem 1Gi
- 検証: `curl -N https://<fqdn>/api/analyze` で SSE chunk + 15 秒 heartbeat が確認できる

### Phase 4: フロント（Next.js）を App Service for Containers へ（1 日）

- `az acr build` で ACR にイメージ push
- App Service Plan B1 Linux + Web App for Containers を作成、ACR からプル
- App Settings: `BACKEND_URL=https://<backend-fqdn>`、`WEBSITES_PORT=3000`、`NODE_ENV=production`
- 検証: https URL → UI → `/api/analyze` の SSE chunk が DevTools EventStream タブで段階表示されることを確認

### Phase 5: CI/CD 簡易化（0.5 日、任意）

- GitHub Actions: `Azure/login` + `azure/container-apps-deploy-action` / `azure/webapps-deploy@v3`
- main push で両方更新

### Phase 6: 本番デモ前検証（0.5 日）

- 20〜45 秒 SSE が安定するか（本番経路で 3 回連続実行）
- cold start の体感
- Notion 連携の動作確認
- ログ確認: `az containerapp logs tail`
- ヘルスチェック cron（cold start 緩和）

---

## コスト試算（5/19〜5/28、約 10 日）

| リソース | プラン | 試算 (10 日) | 備考 |
|---|---|---|---|
| Container Apps (FastAPI) | Consumption, min=0, 0.5 vCPU/1 GiB | ほぼ無料 | 無料枠 180k vCPU-sec/月、scale-to-zero |
| App Service Linux (Next.js) | B1（$13/月） | 約 ¥700 | Docker は F1 不可、B1 必須 |
| Azure Container Registry | Basic ($5/月) | 約 ¥300 |  |
| Key Vault | Standard | ほぼ無料 | 操作回数で課金、ほぼゼロ |
| Log Analytics | 従量 | 数十円 | Container Apps が必須要件で要求 |
| **合計** | | **¥1,500 程度** | |

---

## 参考一次ソース

**SSE / streaming**:
- [Container Apps Ingress（240s timeout）](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview)
- [App Service Linux SSE Q&A](https://learn.microsoft.com/en-us/answers/questions/5573038/issues-with-sse-(server-side-events)-on-azure-app)
- [App Service FastAPI streaming bug #231](https://github.com/Azure/app-service-linux-docs/issues/231)
- [Application Gateway SSE 設定](https://learn.microsoft.com/en-us/azure/application-gateway/use-server-sent-events)
- [APIM SSE 設定](https://learn.microsoft.com/en-us/azure/api-management/how-to-server-sent-events)

**Static Web Apps の制約**:
- [SWA Next.js 公式（preview の限界）](https://learn.microsoft.com/en-us/azure/static-web-apps/nextjs)
- [SWA hybrid Next.js チュートリアル](https://learn.microsoft.com/en-us/azure/static-web-apps/deploy-nextjs-hybrid)
- [SWA linked backend streaming bug #1180](https://github.com/Azure/static-web-apps/issues/1180)
- [SWA managed functions Python streaming bug #1478](https://github.com/Azure/static-web-apps/issues/1478)

**Azure Functions の制約**:
- [Flex Consumption plan（HTTP timeout）](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)
- [Functions 230 秒 timeout Q&A](https://learn.microsoft.com/en-us/answers/questions/1688675/azure-function-app-timeout-in-4-minutes-(230-secon)

**デプロイ手順**:
- [FastAPI on Container Apps チュートリアル](https://learn.microsoft.com/en-us/azure/developer/python/tutorial-containerize-simple-web-app)
- [Container Apps Secrets / Key Vault references](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets)
- [Container Apps 課金（free grants）](https://learn.microsoft.com/en-us/azure/container-apps/billing)
- [Next.js 16 + App Service デプロイ事例（community, 2025/2026）](https://www.modern42.com/blog/deploy-next-js-16-pnpm-linux-azure-web-app)
- [Next.js + Container Apps starter（community）](https://github.com/webmaxru/nextjs-azure-container-apps-starter)

---

## 新旧情報の食い違いメモ

- **SWA の Next.js hybrid サポートは 2024 年に GA 予定だったが、2026/01 更新の公式ドキュメントでも依然 "in preview"**。Next.js 16 への明示的言及はなく、Next.js 13〜14 想定のドキュメントのまま → ハッカソン用途で SWA hybrid は賭けすぎる。採用しない。
- **Functions Flex Consumption の HTTP streaming は Python では 2024 年時点で「out-of-process worker は streaming 非対応」が支配的見解**。2026 年もこの状況の改善を示す一次ソースなし → 採用しない。

---

## 実環境の値（5/18 開設、5/19 デプロイ作業用）

ハッカソン提出 (6/1) までの本番環境として作成済みのリソース一覧。
明日 backend / frontend をデプロイする際の参照用。

### 基本情報

| 項目 | 値 |
|---|---|
| Subscription ID | `0ed3fc25-8127-4d69-839d-3b5a467704b3` |
| Subscription 名 | Azure subscription 1（Free Trial / $200 クレジット、30 日有効） |
| Resource Group | `rg-specify-prod` |
| リージョン | `japaneast`（Japan East） |
| 作成日 | 2026-05-18 |

### 作成済みリソース

| リソース種別 | 名前 | 補足 |
|---|---|---|
| Resource Group | `rg-specify-prod` | 全リソースをここに集約 |
| Azure Container Registry (Basic) | `specifyacrtaz` | FQDN: `specifyacrtaz.azurecr.io` |
| Container Apps Environment | `cae-specify` | Consumption only、scale-to-zero 可 |
| Log Analytics Workspace | `workspace-rgspecifyprodvTqt` | Container Apps Env 作成時に自動生成 |

### Container Apps Environment 詳細

- **Default Domain (wildcard)**: `happyfield-8905f02b.japaneast.azurecontainerapps.io`
  - backend Container App デプロイ後の URL は `<container-app名>.happyfield-8905f02b.japaneast.azurecontainerapps.io` の形になる
  - 例: `specify-backend.happyfield-8905f02b.japaneast.azurecontainerapps.io`
  - これをフロントの `BACKEND_URL` env に設定する
- **Static IP**: `74.176.139.10`
- **Workload Profile**: `Consumption`
- **Public Network Access**: Enabled

### 明日（5/19）のデプロイ TODO

1. ローカルで backend Docker イメージビルド & ACR に push（`az acr build` 推奨）
2. Container App（backend）を `cae-specify` 環境内に作成、`specifyacrtaz.azurecr.io/specify-backend:latest` を指定
3. Container App の Secret として `OPENAI_API_KEY` / `NOTION_API_KEY` / `NOTION_PRD_DB_ID` を登録
4. `curl -N https://specify-backend.happyfield-8905f02b.japaneast.azurecontainerapps.io/api/analyze` で SSE chunk が流れるか確認
5. ローカルで frontend Docker イメージビルド & ACR push
6. App Service Plan (B1 Linux) + Web App for Containers (`specify-frontend`) を作成
7. App Settings に `BACKEND_URL=https://specify-backend.happyfield-8905f02b.japaneast.azurecontainerapps.io` / `WEBSITES_PORT=3000` を設定
8. ブラウザで Web App URL を開いて end-to-end 動作確認
