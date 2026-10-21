[English](README.md) · [プロジェクトREADME](../README.ja.md)

# テスト

このテストディレクトリには、配備済みステージング環境用の受入テストコードも含まれていますが、通常のローカル確認では実行しません。

通常のローカル確認では、プロジェクトの依存関係を導入した後、Xylemのcheckoutで次を実行します。

```bash
npm test
```

このコマンドは `vitest.config.ts` に従い、`test/integration/` を除く `test/**/*.test.ts` を実行します。ステージングの設定や配備済みサービスは不要です。一部のテストは一時的なループバックHTTPサーバーを起動します。

## テストコマンド

| コマンド | 対象と前提 |
| --- | --- |
| `npm test` | ローカルテスト。`staging/safety.test.ts` と `staging/fixtures.test.ts` も含みます。 |
| `npm run test:staging-safety` | 一時的なループバックサーバーを使うrequest guardのローカルブラウザテスト（`staging/redirect-guard.spec.ts`）。Playwright Chromiumが必要ですが、staging環境は不要です。 |
| `npm run test:integration` | ローカルのリポジトリ間契約テスト。依存関係を導入済みのソースcheckoutを、`ANEMOCHORE_CHECKOUT` と `TILIA_CHECKOUT` で明示する必要があります。 |
| `npm run test:c2` | ローカルのビューアーブラウザテスト。Playwright Chromiumと、`browser/server.ts` が要求するTiliaリビジョンを同梱したGPX Shareのcheckoutを指す `GPX_SHARE_CHECKOUT` が必要です。テスト設定がローカルアプリとストレージfixtureを自動起動します。 |
| `npm run test:staging` | 配備済みstagingに対する受入テスト。通常のローカル確認には含めません。 |

[package.json](../package.json) で固定されたNode.js・npmと、[package-lock.json](../package-lock.json) の依存関係を使用してください。ブラウザテストで必要な場合は、`npx playwright install chromium` で対応するブラウザを導入します。

## 配備済みstagingの受入テスト

`playwright.staging.config.js` が選択する `staging/acceptance.spec.ts` は、配備済みサービスを対象とし、実際のstaging KVにリソースを作成・削除します。ローカルアプリのサーバーは起動せず、ローカル開発サーバー向けのテストではありません。

ローカル開発ではこの受入テストの設定は不要で、`npm run test:staging` を実行する必要はありません。実行にはstaging origin、運用者が管理するorigin許可リスト、書き込みへの明示的な同意が必要で、入力不足時は意図的に設定エラーになります。回避のために仮の値を設定しないでください。

`staging/` にはローカルテストと共有ヘルパーもあります。ディレクトリ全体を除外せず、上記の安全ガード・fixtureテストはローカル確認の対象に含めてください。配備済み環境の受入テストは既に `npm test` と分離されており、テスト設定を変更する必要はありません。
