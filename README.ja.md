[English README](README.md)

# Xylem

Xylem は、Anemochore 向けのバックエンド・フォー・フロントエンド（BFF）のリファレンス実装です。GPX ファイルの検証・正規化、Anemochore を使った正規化済み JSON の保存、GPX ダウンロードと共有ページの提供を行います。Anemochore のサービス API キーはサーバー側に保持します。


## 主な機能

- トラック・ルート・ウェイポイントを含む GPX の検証と正規化。
- Anemochore へのアップロードと、保存済みの正規化データからの GPX XML ダウンロード。
- アップロード時に発行する署名付きトークンによる削除。
- 地図ビューアーと Open Graph メタデータを備えた共有ページ。
- API 操作と共有ページへのリクエストに対する構造化 JSON 監査ログ。


## 必要な環境

- [package.json](package.json) で固定されたバージョンの Node.js と npm
- Docker
- Docker Compose


## 開発環境の構成

Xylem の開発では、Docker 内でアプリケーションを実行し、ホストのプロジェクトソースディレクトリをバインドマウントします。

環境は次の 2 つに分かれます。

- **ホスト環境** — ソースコードの編集、ローカルの開発ツールやテストの実行に使用します。
- **Docker 環境** — アプリケーションの実行に使用します。

各環境には別々の `node_modules` ディレクトリがあります。使用する環境ごとに依存関係をインストールしてください。どちらのインストールでも同じ `package-lock.json` を使用します。


## 初期設定

アプリケーションの実行環境には `ANEMOCHORE_API_URL`、`ANEMOCHORE_API_KEY`、`XYLEM_PUBLIC_ORIGIN`、`XYLEM_DELETE_SECRET` が必要です。値の検証と任意設定については[設定コード](src/config.ts)を参照してください。`XYLEM_DELETE_SECRET` には秘密の値を使用し、認証情報をバージョン管理に含めないでください。

`CHLOROPLAST_PUBLIC_ORIGIN` は任意設定です。HTTP(S) URL を設定すると、Chloroplast による Open Graph 画像メタデータが有効になります。 この値は共有ページの HTML に公開されるため、認証情報・パス・query・fragmentを含まないoriginを使用してください。互換性のため、これらを含む従来のHTTP(S) URLも設定値としては受け付けます。未指定または明示的な空文字の場合も共有ページは動作し、`og:image` と画像用の Twitter card メタデータを省きます。空でない不正な値は拒否します。保持された共有 HTML の画像 URL が有効な設定と一致しない場合、その HTML を再生成します。

付属の [Compose 設定](compose.yml)は必須の 4 変数をホスト環境から渡しますが、`CHLOROPLAST_PUBLIC_ORIGIN` は渡しません。ホスト側で設定するだけでは、そのコンテナの画像メタデータは有効になりません。Chloroplast なしで動かすための Compose 変更は不要です。ログ設定などの任意設定は、Compose で使う場合は明示的に渡す必要があります。

ホストにプロジェクトの依存関係をインストールします。

このインストールは、エディターの言語サービス、コード補完、静的解析、ローカルテストに使用します。

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

アプリケーションは以下で利用できます。

```
http://localhost:3000
```

開発サーバーはソースファイルを監視し、変更時に自動で再読み込みします。

アプリケーションを停止します。

```bash
docker compose stop
```

アプリケーションを再開します。

```bash
docker compose start
```


## 依存関係の更新

`package.json` または `package-lock.json` を変更した後、両方の環境で依存関係を更新します。

ホスト環境:

```bash
npm install
```

Docker 環境:

```bash
docker compose run --rm app npm install
```


## 環境の再作成

Docker の設定を変更した場合は、コンテナを再作成します。

```bash
docker compose down
docker compose up --build
```

`node_modules` の Docker ボリュームに不整合が生じた場合は、再作成して依存関係を再インストールします。

```bash
docker compose down -v
docker compose run --rm app npm install
docker compose up --build
```


**注意:** `docker compose down -v` は、Compose が管理する名前付きボリュームと、コンテナに接続された匿名ボリュームを削除します。付属の設定では `node_modules` ボリュームが削除されます。バインドマウントされたプロジェクトのソースは削除されません。別のボリュームを追加している場合は、そのデータも削除される可能性があります。


## テスト

通常のローカル確認には `npm test` を使用します。追加のテストコマンドと、ローカルテスト・配備済みステージング環境の受入テストの区別は[テストガイド](test/README.ja.md)を参照してください。


## 監査ログ

Xylem は、アップロード、正規化、GPX の取得・削除、共有ページへのリクエストについて構造化 JSON 監査ログを出力します。イベント、失敗分類、リクエスト ID の伝播、信頼するプロキシの設定、機密情報の扱いについては[監査ログガイド](docs/audit-logging.ja.md)を参照してください。


## API 仕様

Xylem はブラウザー向けのエンドポイントを提供します。そのデータ形式と認証方法は [Anemochore のストレージ API](https://github.com/hiroaki/anemochore/blob/main/docs/api.md) と異なります。

| エンドポイント | Xylem の動作 |
| --- | --- |
| `POST /api/normalize` | GPX を含む multipart の `file` を受け取り、保存せずに正規化した GPX XML を返します。 |
| `POST /api/upload` | multipart の GPX `file` を受け取り、検証・正規化した後、正規化済み JSON を Anemochore にアップロードします。`id`、`url`、`deleteUrl` と、上流の `delete_key` に代わる署名付き `deleteToken` を返します。 |
| `GET /api/gpx/:id` | Anemochore から正規化済み JSON を取得・検証し、GPX XML を返します。 |
| `DELETE /api/gpx/:id` | アップロード応答の `deleteToken` を `X-Delete-Token` ヘッダーで指定する必要があります。Xylem が検証し、Anemochore のサービス認証情報と削除キーを上流へのリクエストに付与します。 |
| `GET /s/:id` | 地図ビューアーと Open Graph メタデータを備えた共有ページを返します。ビューアーには `/tilia/` 配下の Tilia アセットが必要ですが、このリポジトリの `public/` ディレクトリには同梱されていません。 |
| `GET /api/health` | このサービスのヘルスチェック応答を返します。 |

アップロードと正規化には共通の GPX 処理を使用します。未対応の内容が正規化後も保持される保証はありません。現在の検証・応答・エラー処理は[ルート実装](src/routes)と [GPX 処理コード](src/gpx/process.ts)を参照してください。上流の API 仕様はストレージサービスの仕様であり、Xylem の公開 API の契約ではありません。

## ライセンス

このプロジェクトは Zero-Clause BSD License（0BSD）の下で提供されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。
