[English README](README.md)

# Xylem

Xylem は Anemochore の BFF クライアントのリファレンス実装です。

Anemochore API と通信するバックエンド・フォー・フロントエンドアプリケーションの構築方法を示しています。

この実装では API 認証情報をサーバー側に保持し、安全な API 統合パターンの簡単な例を提供します。


## Requirements

- Node.js 22 以降 (npm を含む)
- Docker
- Docker Compose


## Development Model

Xylem は Docker を使用してランタイム実行される一方で、プロジェクトのソースディレクトリはホストからバインドマウントされます。

つまり、環境は 2 つに分かれています。

- **ホスト環境** — VS Code などのツールを使用してソースコードを編集するために使用されます。
- **Docker 環境** — アプリケーションを実行するために使用されます。

これらの環境は別々の `node_modules` ディレクトリを維持するため、依存関係は両方にインストールする必要があります。依存関係のバージョンは、両方のインストールが同じ `package-lock.json` を使用するため、一貫性が保たれます。


## 初期設定

ホストにプロジェクトの依存関係をインストールします。

このインストールは、VS Code などの開発ツールによる TypeScript 言語サービス、コード補完、静的解析で使用されます。

```bash
npm install
```

Docker イメージをビルドします。

```bash
docker compose build
```

Docker 開発環境内にプロジェクトの依存関係をインストールします。

```bash
docker compose run --rm app npm install
```


## 開発環境

開発サーバーを起動します。

```bash
docker compose up -d
```

アプリケーションは以下で利用可能です:

```
http://localhost:3000
```

開発サーバーはソースファイルを監視し、変更があると自動的にリロードされます。

アプリケーションを停止するには:

```bash
docker compose stop
```

アプリケーションを再開するには:

```bash
docker compose start
```


## 依存関係の更新

`package.json` または `package-lock.json` を変更した後、両方の環境で更新された依存関係をインストールします。

ホスト環境:

```bash
npm install
```

Docker 環境:

```bash
docker compose run --rm app npm install
```


## 環境の再作成

Docker の設定が変更された場合、コンテナを再作成します:

```bash
docker compose down
docker compose up --build
```

`node_modules` の Docker ボリュームが不整合になった場合、再作成します:

```bash
docker compose down -v
docker compose up --build
```


## Phase D staging受入テスト

`npm run test:staging` は配備済みstagingを対象に、GPX正規化・アップロード、canonical取得、プレビュー・共有・静的ビューアー、export・再解析、cleanupを確認します。実際のstaging KVにリソースを作成するため、対象を確認して書き込みを承認したうえで手動実行してください。オフラインテストやデプロイコマンドではありません。

現在の対象は下の結果表にある6ケースです。`wide-area B5` は元の広域geometryを使い、両配備済みビューアーでGPX応答前のplugin設定検査、milestoneプラグイン・マーカーの不在、可視描画、pan/zoomの応答、ダウンロードの妥当性を確認します。`x-milestone` は別途再設計するまで意図的に無効化しており、配布実装は保持しています。再利用fixtureは `test/helpers/phase-b5.ts` 由来の `test/fixtures/b5-wide-area.gpx`、ローカル回帰試験は `test/browser/wide-area.spec.ts` です。

### 前提と実行方法

プロジェクト固定のテスト環境であるNode.js 24.19.0、npm 11.17.0、Playwright 1.60.0と対応するChromiumを使用します。依存は `package-lock.json` から `npm ci` で導入し、必要なら `npx playwright install chromium` でブラウザを導入します。配備済みサービスと必要なasset originへ到達でき、Chromium・Node側HTTP通信の両方がstaging証明書を信頼できる必要があります。バックエンドのAPIキーや削除シークレットをテストへ渡す必要はありません。

運用者が管理するローカルJSONファイルに、`origins` 配列だけを記載します。次の例の対象・asset originを、承認された環境に合わせてください。

```json
{
  "origins": [
    "https://staging.example.test",
    "https://unpkg.com",
    "https://cdn.jsdelivr.net",
    "https://tile.openstreetmap.org"
  ]
}
```

Xylem checkoutで実行します。

```bash
export GPX_STAGING_BASE_URL=https://staging.example.test
export GPX_STAGING_ALLOWLIST_FILE=/path/to/local/phase-d-staging.json
export GPX_STAGING_WRITE_OPT_IN=I_UNDERSTAND_THIS_WRITES_STAGING_KV

npm run test:staging
```

同じ安全策で広域ケースだけを一覧表示し、手動実行するには次を使います。

```bash
npm run test:staging -- --grep 'wide-area B5' --list
npm run test:staging -- --grep 'wide-area B5'
```

`GPX_STAGING_BASE_URL` はパス・認証情報・query・fragmentを含まない正規のHTTPS originです。`GPX_STAGING_ALLOWLIST_FILE` はローカル許可リストのパスで、対象originと、配備フロントエンドが必要とする承認済み外部asset originをすべて明示します。`GPX_STAGING_WRITE_OPT_IN` は上記文字列との完全一致が必要です。暗黙のstaging既定値はありません。

macOS Keychainで信頼する開発用CAを使う場合、対応するNodeではsystem CA storeの有効化が必要なことがあります。

```bash
NODE_OPTIONS=--use-system-ca npm run test:staging
```

これは環境依存であり、すべての環境に必須ではありません。TLS証明書検証を有効なまま、環境に適した信頼ストアを設定してください。`NODE_OPTIONS` 設定時には、ほかに必要な既存オプションも維持してください。

### 安全策とcleanup記録

ブラウザのrequest guardはoriginを完全一致で検証し、同一originを含むすべてのHTTP 3xxを拒否します。`maxRedirects: 0`・`maxRetries: 0` を使用し、外部originは読み取り専用のsubresource取得先に限定し、navigation先にはしません。WebSocketは拒否、Service Workerは無効です。テストは逐次実行・retryなし・最初の失敗で打ち切ります。canonical確認用の明示API GETは、承認済みstaging originと当該テストで作成したIDだけを対象とし、redirect・retryは0、timeoutは10秒です。HTTP 200とGPX Content-Typeを確認してから解析します。

ブラウザ応答のstatus・Content-Type確認も維持しています。guard経由のBlob/File応答をPlaywrightが空本文として取得する場合があるため、canonical比較は明示API GETを使用します。描画確認は、地図とブラウザ画面の両方に交差する可視GPX要素が少なくとも1つあることを要求し、水平SVG pathの高さ0やDOM順には依存しません。

各テストは削除用capabilityをメモリ内だけに保持し、自分で作成したIDに限って `finally` でcleanupを試みます。削除はHTTP 200、その後の時間制限付き読み取り専用GET pollingは404を要求します。このpollingは書き込みretryや自動HTTP・テストretryとは別です。アップロードを自動再試行しません。

`test-results/staging/<run-directory>/<case>/created-resources.jsonl`（作成時mode 0600）に、start・upload-started・created・acceptance-passed・cleanup status・cleanup-failedを記録します。tokenやGPX本文は記録しません。テスト生成物・環境ファイル・認証情報はコミットしないでください。

時刻とケース記録から対象runのディレクトリを特定し、以前のrunと混ぜないでください。次のように必要な項目だけを選択して確認できます。

```bash
run_dir=test-results/staging/REPLACE_WITH_THE_RUN_DIRECTORY
find "$run_dir" -name created-resources.jsonl -exec jq -c '{at, run, event, fixture, id, status}' {} \;
```

各ケースで作成IDとcleanup HTTP 200を対応付け、作成数と正常cleanup数の一致、欠落・`cleanup-failed` の有無を確認します。`upload-started` に対応する作成IDがなければ調査が必要です。無関係なリソースを列挙・削除しないでください。`acceptance-passed` はcleanup前の記録なので、そのイベントやrunnerのPASS表示とは独立にcleanupを確認してください。台帳確認は記録された削除応答の検証であり、新しい問い合わせによる独立したストレージ確認ではありません。

### 受入確認済みの結果

2026-10-21（Asia/Tokyo）、`x-milestone` 無効化後の配備に対して、ユーザーから既存5ケースの成功報告があり、別途 `wide-area B5` も **1 passed（全体8.3秒、テスト7.6秒）** でした。広域runの台帳を別途照合し、**作成1件とacceptance-passed・cleanup HTTP 200のIDが一致し、cleanup欠落・cleanup-failedは0件**と確認しました。以前の5ケースのcleanup監査では5件の正常削除を確認済みです。広域runの台帳には削除後GETのstatusを記録していません。成功したテストは404のassertionを含みますが、個別応答はこの台帳から監査できません。追加stagingリクエストは行っていません。

| ケース | 結果 |
| --- | --- |
| rich mixed | PASS |
| single-point waypoint | PASS |
| single-point route | PASS |
| single-point track | PASS |
| accepted route boundary 20 routes x 100 points | PASS |
| wide-area B5 | PASS（個別run） |

6ケースは別々のrunで成功しており、6ケース一括実行の結果ではありません。`x-milestone` を無効化する今回のリリース方針では、広域GPXのブロッカーは解消確認済みです。プラグイン自体の欠陥は未修正です。本番artifact・revision・cache確認と配備は別途行います。実際の24時間失効は検証していません。


## デプロイ

TODO: デプロイ手順を追加する


## 監査ログ

Xylem は以下を使った構造化 JSON 監査ログを出力します。

- `@hono/structured-logger`
- `pino`
- Hono の `requestId()` ミドルウェア

### Request ID 方針

- Request ID は Hono `requestId()` によりサーバー側で生成されます。
- クライアントが送信した `X-Request-Id` は採用しません。
- `request_id` は Xylem/Anemochore 間の監査相関 ID として利用する想定です。
- 現時点では `request_id` をレスポンスヘッダーとしてクライアントへ返していません。

### Client IP 方針

- 既定では任意クライアントの転送ヘッダーを信頼しません。
- 信頼できるプロキシ（例: kamal-proxy）の背後で運用する場合のみ、信頼するヘッダー名を指定して元の client IP を抽出できます。
- 信頼できる転送情報がない場合は、可能な範囲で直接接続情報を使います。

### ログ関連の環境変数

- `LOG_LEVEL`（既定: `info`）
- `XYLEM_TRUST_PROXY`（`true` または `1` で信頼プロキシモードを有効化）
- `XYLEM_TRUSTED_CLIENT_IP_HEADER`（既定: `X-Forwarded-For`）

### 機微情報の扱い

監査ログには以下のような機微値を記録しない設計です。

- `ANEMOCHORE_API_KEY`
- `XYLEM_DELETE_SECRET`
- delete token
- アップロード本文

### 監査対象の範囲とイベント仕様

- 監査ミドルウェアは業務ルート（`/api/upload`, `/api/gpx/*`）にのみ適用されます。
- 静的ファイルへのリクエストは監査イベントの対象外です。
- ログレベルは監査結果に応じて決定します（`success` -> `info`, `failure` -> `error`）。

#### 実際に出力する監査イベント

| イベント | 出力元 | 意味 |
| --- | --- | --- |
| `request_received` | ミドルウェア | 監査対象リクエストを Xylem が受信した時点で出力。 |
| `response_sent` | ミドルウェア | 監査対象リクエストに対するレスポンス送信時に出力。 |
| `upload_rejected` | upload ルート | upstream 呼び出し前にアップロードをローカル拒否（例: file 欠落）。 |
| `upload_received` | upload ルート | アップロード本文を受理し、upstream 連携へ進めたことを記録。 |
| `anemochore_upload_completed` | upload ルート | upstream へのアップロード処理の完了結果（成功/拒否/到達不能）。 |
| `gpx_stored` | upload ルート | Xylem 観点での GPX 保存処理の最終結果。 |
| `gpx_retrieval_requested` | gpx ルート | GPX 取得リクエストを受理し、処理開始したことを記録。 |
| `anemochore_gpx_fetched` | gpx ルート | upstream の GPX 取得結果（成功/拒否/到達不能）。 |
| `gpx_deletion_requested` | gpx ルート | GPX 削除リクエストを受理し、トークン検証を開始。 |
| `gpx_deletion_rejected` | gpx ルート | GPX 削除をローカル拒否（トークン欠落/不正）。 |
| `anemochore_gpx_deleted` | gpx ルート | upstream の GPX 削除結果（成功/拒否/到達不能）。 |

#### 失敗イベントの分類

| failure_reason | 主な発生条件 | 補足 |
| --- | --- | --- |
| `anemochore_rejected` | Anemochore が 4xx/5xx など非成功ステータスで応答 | upstream 応答は受信済みで、拒否として扱う |
| `anemochore_unreachable` | Anemochore への接続失敗やタイムアウトなどで応答を受け取れない | `error_code` や `error_message` が付与されることがある |
| `anemochore_invalid_response` | upload 成功扱いの応答だが必須フィールド（id/delete_key）が欠落 | upstream 応答形式不正として扱う |


## API 仕様

Xylem は Anemochore と同じパブリック API を公開します。

エンドポイントの定義、リクエストおよびレスポンスの形式、認証要件、エラー処理については、Anemochore API 仕様を参照してください:

- https://github.com/hiroaki/anemochore/blob/main/docs/api.md

Xylem はバックエンド・フォー・フロントエンド (BFF) として機能し、Anemochore サービスの API キーをサーバー側に保持しながら Anemochore へのリクエストを転送します。パブリック API は意図的に Anemochore API と互換性を保っています。


## ライセンス

このプロジェクトは Zero-Clause BSD License (0BSD) の下で提供されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。
