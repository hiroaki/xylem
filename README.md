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
