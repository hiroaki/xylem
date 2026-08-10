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
- ルートハンドラーは業務監査イベントを出力します（例: `upload_received`, `anemochore_upload_completed`, `gpx_stored`, `gpx_retrieval_requested`, `anemochore_gpx_fetched`, `gpx_deletion_requested`, `gpx_deletion_rejected`, `anemochore_gpx_deleted`）。
- 失敗イベントでは `failure_reason`（`anemochore_rejected`, `anemochore_unreachable`, `anemochore_invalid_response`）を明示します。
- ログレベルは監査結果に応じて決定します（`success` -> `info`, `failure` -> `error`）。


## API 仕様

Xylem は Anemochore と同じパブリック API を公開します。

エンドポイントの定義、リクエストおよびレスポンスの形式、認証要件、エラー処理については、Anemochore API 仕様を参照してください:

- https://github.com/hiroaki/anemochore/blob/main/docs/api.md

Xylem はバックエンド・フォー・フロントエンド (BFF) として機能し、Anemochore サービスの API キーをサーバー側に保持しながら Anemochore へのリクエストを転送します。パブリック API は意図的に Anemochore API と互換性を保っています。


## ライセンス

このプロジェクトは Zero-Clause BSD License (0BSD) の下で提供されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。
