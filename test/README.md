[Japanese](README.ja.md) · [Project README](../README.md)

# Tests

This test directory also contains acceptance tests for an already-deployed staging environment, but they are not run as part of routine local verification.

For routine local verification, run from the Xylem checkout after installing the project dependencies:

```bash
npm test
```

This command uses `vitest.config.ts` to run `test/**/*.test.ts`, excluding `test/integration/`. No staging configuration or deployed service is required; some tests start temporary loopback HTTP servers.

## Test commands

| Command | Target and prerequisites |
| --- | --- |
| `npm test` | Local tests, including `staging/safety.test.ts` and `staging/fixtures.test.ts`. |
| `npm run test:staging-safety` | Local browser tests for the request guard (`staging/redirect-guard.spec.ts`), using temporary loopback servers. Requires Playwright Chromium, but no staging environment. |
| `npm run test:integration` | Local cross-repository contract tests. Requires explicit `ANEMOCHORE_CHECKOUT` and `TILIA_CHECKOUT` paths to source checkouts with their dependencies installed. |
| `npm run test:c2` | Local viewer browser tests. Requires Playwright Chromium and `GPX_SHARE_CHECKOUT` pointing to a GPX Share checkout with the vendored Tilia revision required by `browser/server.ts`. The test configuration starts the local application and storage fixture automatically. |
| `npm run test:staging` | Acceptance tests against an already-deployed staging system. Not part of routine local verification. |

Use the Node.js/npm versions pinned in [package.json](../package.json) and dependencies from [package-lock.json](../package-lock.json). For browser tests, install the matching browser if needed with `npx playwright install chromium`.

## Deployed-staging acceptance

`staging/acceptance.spec.ts`, selected by `playwright.staging.config.js`, exercises deployed services and creates and deletes real staging KV resources. It does not start a local application server and is not intended to test the local development server.

For local development, leave this suite unconfigured and do not run `npm run test:staging`. It requires an explicit staging origin, an operator-controlled origin allowlist and write opt-in; missing inputs intentionally cause configuration to fail. Do not provide dummy inputs to bypass those checks.

The `staging/` directory also contains local tests and shared helpers. Its name is not a reason to exclude the whole directory: the safety and fixture tests above remain part of local verification. No test configuration changes are needed to separate the live acceptance suite from `npm test`.
