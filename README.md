[Japanese README](README.ja.md)

# Xylem

Xylem is a reference implementation of a BFF client for Anemochore.

It demonstrates how to build a backend-for-frontend application that communicates with the Anemochore API.

The implementation keeps API credentials on the server side and provides a simple example of a secure API integration pattern.


## Requirements

- Node.js 22 or later (includes npm)
- Docker
- Docker Compose


## Development Model

Xylem is developed using Docker for runtime execution while the project source directory is bind-mounted from the host.

This means there are two separate environments:

- **Host environment** — used for editing the source code with tools such as VS Code.
- **Docker environment** — used to run the application.

Because these environments maintain separate `node_modules` directories, dependencies must be installed in both. Dependency versions remain consistent because both installations use the same `package-lock.json`.


## Initial Setup

Install the project dependencies on the host.

This installation is used by development tools such as VS Code for TypeScript language services, code completion, and static analysis.

```bash
npm install
```

Build the Docker image.

```bash
docker compose build
```

Install the project dependencies inside the Docker development environment.

```bash
docker compose run --rm app npm install
```


## Development Environment

Start the development server.

```bash
docker compose up -d
```

The application will be available at:

```
http://localhost:3000
```

The development server watches source files and automatically reloads when changes are made.

Stop the application:

```bash
docker compose stop
```

Resume the application:

```bash
docker compose start
```


## Updating Dependencies

After modifying `package.json` or `package-lock.json`, install the updated dependencies in both environments.

Host:

```bash
npm install
```

Docker:

```bash
docker compose run --rm app npm install
```


## Recreating the Environment

If the Docker configuration changes, recreate the containers:

```bash
docker compose down
docker compose up --build
```

If the `node_modules` Docker volume becomes inconsistent, recreate it:

```bash
docker compose down -v
docker compose up --build
```


## Phase D staging acceptance

`npm run test:staging` exercises an already-deployed staging system: GPX normalization/upload, canonical retrieval, preview/shared/static viewers, export/reparse and cleanup. It creates real staging KV resources. Run it manually only after reviewing the target and authorizing those writes; it is not an offline test or a deployment command.

The suite contains six scenarios, listed in the results table below. `wide-area B5` checks both deployed viewers with the original wide-area geometry: inspected plugin configuration before GPX delivery, no milestone plugin/markers, visible rendering, responsive pan/zoom and valid downloads. `x-milestone` is intentionally disabled pending a separate redesign; its bundled implementation is retained. The reusable fixture is `test/fixtures/b5-wide-area.gpx`, derived from `test/helpers/phase-b5.ts`; local viewer regression coverage is in `test/browser/wide-area.spec.ts`.

### Prerequisites and execution

Use the project-pinned test toolchain: Node.js 24.19.0, npm 11.17.0 and Playwright 1.60.0, with the matching Chromium installed. Install dependencies from `package-lock.json` (`npm ci`); if needed, install the browser with `npx playwright install chromium`. The deployed services and required asset origins must be reachable, and the staging certificate must be trusted by both Chromium and Node-side HTTP requests. No backend API keys or deletion secrets are supplied to the suite.

Create an operator-controlled local JSON file containing only an `origins` array. For example, adapting the target and asset origins to the approved environment:

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

From the Xylem checkout:

```bash
export GPX_STAGING_BASE_URL=https://staging.example.test
export GPX_STAGING_ALLOWLIST_FILE=/path/to/local/phase-d-staging.json
export GPX_STAGING_WRITE_OPT_IN=I_UNDERSTAND_THIS_WRITES_STAGING_KV

npm run test:staging
```

To list and then manually run only the wide-area case with the same safety controls:

```bash
npm run test:staging -- --grep 'wide-area B5' --list
npm run test:staging -- --grep 'wide-area B5'
```

`GPX_STAGING_BASE_URL` must be a canonical HTTPS origin, with no path, credentials, query or fragment. `GPX_STAGING_ALLOWLIST_FILE` names the local allowlist; it must explicitly include that origin and every approved external asset origin required by the deployed frontend. `GPX_STAGING_WRITE_OPT_IN` must exactly match the value above. None has an implicit staging default.

For a development CA trusted through macOS Keychain, a supported Node version may also need the system CA store enabled:

```bash
NODE_OPTIONS=--use-system-ca npm run test:staging
```

This is environment-specific, not a universal requirement. Keep TLS certificate verification enabled; configure the appropriate trust store for the environment instead of bypassing verification. Ensure any other required Node options are preserved when setting `NODE_OPTIONS`.

### Safety and cleanup records

The browser request guard checks exact origins, rejects every HTTP 3xx (including same-origin redirects), and uses `maxRedirects: 0` and `maxRetries: 0`. External origins are read-only subresource sources, not navigation targets. WebSockets are rejected and Service Workers are blocked. The suite runs serially with no test retries and stops after the first failure. The explicit canonical-verification API GET is restricted to the approved staging origin and an ID created by that test; it uses zero redirects/retries, a 10-second timeout, and checks HTTP 200 and GPX Content-Type before parsing.

Browser response status/Content-Type checks remain in place. Canonical comparison uses the explicit API GET because guarded Blob/File responses can expose an empty browser response body through Playwright. Rendering checks require at least one visible GPX element intersecting both the map and browser viewport; they do not depend on a horizontal SVG path's zero-height layout box or DOM order.

Each test keeps deletion capabilities only in memory and attempts cleanup in `finally`, only for IDs it created. Deletion must return 200; bounded read-only GET polling then requires 404. This polling is distinct from retrying writes or enabling automatic HTTP/test retries. An upload is not retried automatically.

Records are written to `test-results/staging/<run-directory>/<case>/created-resources.jsonl` (created with mode 0600), recording start, upload-started, created, acceptance-passed, cleanup status and any cleanup-failed event. Tokens and GPX bodies are not recorded. Do not commit test artifacts, environment files or credentials.

Identify the directory for the specific run by its timestamps and case records; do not mix earlier runs. Inspect only selected fields, for example:

```bash
run_dir=test-results/staging/REPLACE_WITH_THE_RUN_DIRECTORY
find "$run_dir" -name created-resources.jsonl -exec jq -c '{at, run, event, fixture, id, status}' {} \;
```

For every case, match each created ID with a cleanup status 200, check that created and successfully cleaned-up ID counts agree, and look for missing records or `cleanup-failed`. Investigate any `upload-started` without a recorded resource ID. Do not enumerate or delete unrelated resources. `acceptance-passed` is recorded before cleanup, so inspect cleanup independently of that event and the runner's PASS summary. Ledger review verifies recorded cleanup acknowledgements; it is not a fresh, independent query of storage.

### Verified acceptance status

On 2026-10-21 (Asia/Tokyo), after the deployment disabling `x-milestone`, the user reported the original five cases passing and separately ran `wide-area B5`: **1 passed (8.3s total; 7.6s test)**. The focused ledger independently confirms **1 created resource, matching acceptance-passed and cleanup HTTP 200, no missing cleanup and no cleanup-failed event**. The earlier five-case cleanup audit recorded 5 matching successful deletions. Post-cleanup GET status is not recorded in the focused ledger; the passing test includes a 404 assertion, but the individual response cannot be audited from this ledger. No additional staging requests were made.

| Scenario | Result |
| --- | --- |
| rich mixed | PASS |
| single-point waypoint | PASS |
| single-point route | PASS |
| single-point track | PASS |
| accepted route boundary 20 routes x 100 points | PASS |
| wide-area B5 | PASS (focused run) |

All six scenarios have passed across separate runs, not one six-case execution. The focused wide-area release blocker is resolved for the release with `x-milestone` disabled; the plugin defect itself is not repaired. Production artifact/revision/cache checks and deployment remain separate. Actual 24-hour expiry was not tested.


## Deployment

TODO: Add deployment instructions


## Audit Logging

Xylem uses structured JSON audit logs with:

- `@hono/structured-logger`
- `pino`
- Hono `requestId()` middleware

### Request ID policy

- Request IDs are generated server-side by Hono `requestId()`.
- Client-supplied `X-Request-Id` values are not accepted.
- The `request_id` value is intended for Xylem/Anemochore audit correlation.
- Xylem currently does not return `request_id` to clients in response headers.

### Client IP policy

- By default, Xylem does not trust forwarding headers from arbitrary clients.
- If Xylem is deployed behind a trusted proxy (for example kamal-proxy), you can enable trusted proxy mode and choose which header is accepted for original client IP extraction.
- If trusted forwarding information is unavailable, Xylem uses direct connection metadata when available.

### Environment variables for logging behavior

- `LOG_LEVEL` (default: `info`)
- `XYLEM_TRUST_PROXY` (`true`/`1` to enable trusted forwarded IP handling)
- `XYLEM_TRUSTED_CLIENT_IP_HEADER` (default: `X-Forwarded-For`)

### Sensitive data handling

Audit logs are designed to avoid writing sensitive values such as:

- `ANEMOCHORE_API_KEY`
- `XYLEM_DELETE_SECRET`
- delete tokens
- upload body contents

### Audit scope and event semantics

- Audit middleware is applied only to business routes (`/api/upload`, `/api/gpx/*`).
- Requests for static files are intentionally excluded from audit events.
- Log level is derived from audit result (`success` -> `info`, `failure` -> `error`).

#### Actual audit events

| Event | Source | Meaning |
| --- | --- | --- |
| `request_received` | middleware | Logged when an audited HTTP request enters Xylem. |
| `response_sent` | middleware | Logged when Xylem sends a response for an audited request. |
| `upload_rejected` | upload route | Upload request was rejected locally before upstream call (for example missing file). |
| `upload_received` | upload route | Upload request payload was accepted for upstream processing. |
| `anemochore_upload_completed` | upload route | Upstream upload finished (success, rejected response, or unreachable upstream). |
| `gpx_stored` | upload route | Final GPX store outcome from Xylem's perspective. |
| `gpx_retrieval_requested` | gpx route | GPX retrieval request accepted and forwarded workflow started. |
| `anemochore_gpx_fetched` | gpx route | Upstream GPX retrieval finished (success, rejected response, or unreachable upstream). |
| `gpx_deletion_requested` | gpx route | GPX deletion request accepted and token validation started. |
| `gpx_deletion_rejected` | gpx route | GPX deletion request rejected locally (missing/invalid token). |
| `anemochore_gpx_deleted` | gpx route | Upstream GPX deletion finished (success, rejected response, or unreachable upstream). |

#### Failure event classification

| failure_reason | Typical condition | Notes |
| --- | --- | --- |
| `anemochore_rejected` | Anemochore returns a non-success status such as 4xx/5xx | Upstream responded, but the request is treated as rejected |
| `anemochore_unreachable` | Connection failure, timeout, or other transport error before receiving a response | `error_code` and/or `error_message` may be present |
| `anemochore_invalid_response` | Upload path gets a nominally successful upstream response with missing required fields (`id`/`delete_key`) | Treated as invalid upstream response shape |


## API Specification

Xylem exposes the same public API as Anemochore.

For endpoint definitions, request and response formats, authentication requirements, and error handling, refer to the Anemochore API specification:

- https://github.com/hiroaki/anemochore/blob/main/docs/api.md

Xylem acts as a Backend for Frontend (BFF) and forwards requests to Anemochore while keeping the Anemochore service API key on the server side. The public API is intentionally kept compatible with the Anemochore API.


## License

This project is licensed under the Zero-Clause BSD License (0BSD). See the [LICENSE](LICENSE) file for details.
