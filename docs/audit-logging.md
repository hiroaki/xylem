[Japanese](audit-logging.ja.md) · [Project README](../README.md)

# Audit Logging

Xylem emits structured JSON logs using `@hono/structured-logger` and `pino`. This guide describes the current implementation in [app.ts](../src/app.ts), the [middleware](../src/middlewares), and the [audit helpers](../src/logging).

## Scope and common fields

Audit middleware is registered on `/api/upload`, `/api/normalize`, `/api/gpx/*`, and `/s/*`. Health checks and ordinary static-file requests are outside these registrations. A share-page cache hit still produces request/response events, but does not fetch upstream data.

Request-bound fields include `service`, `request_id`, `method`, and `path`, plus `client_ip` and User-Agent fields when available. Events include `timestamp`, `event`, and `result`, and may include `status`, `elapsed_ms`, `gpx_id`, or failure details. `request_received` means entry into the middleware, not successful validation. `response_sent` is emitted by the response/error hooks; it does not confirm delivery to the client.

Success events use `info`; failure events use `error`, subject to `LOG_LEVEL`. The HTTP status helper classifies statuses below 400 as success. Retrieval applies stricter rules: only an upstream 200 response with validated canonical data produces a successful fetch event. An event's `status` may describe the upstream response rather than the final client response; it can also be a locally mapped status when no upstream response exists. A successful intermediate event does not imply that the entire operation succeeded.

## Request IDs

Hono `requestId({ headerName: "" })` generates a server-side ID for each request and ignores client-supplied `X-Request-Id`. The ID is bound to audit records as `request_id` and sent to Anemochore as `X-Request-Id` by the [service client](../src/services/anemochore.ts). Xylem does not add it to response headers. This supports correlation where the upstream service records the header; it does not establish end-to-end logging by itself.

## Client IP and configuration

| Variable | Default | Behavior |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | Pino threshold: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent`. |
| `XYLEM_TRUST_PROXY` | `false` | `true` or `1` enables forwarded IP handling; `false` or `0` disables it. |
| `XYLEM_TRUSTED_CLIENT_IP_HEADER` | `X-Forwarded-For` | Header used when forwarded IP handling is enabled. |

With proxy trust disabled, forwarding headers are ignored. When enabled, the middleware uses the first nonempty comma-separated header value if it is a valid IP address. It does not verify the connecting proxy against an address allowlist or evaluate a trusted hop chain. Enable this only where direct untrusted access is prevented and the trusted proxy controls the chosen header, including its first value. Otherwise clients can spoof logged IP addresses.

If no valid forwarded address is available, Xylem uses a valid direct connection address when the server adapter provides one; otherwise `client_ip` is omitted. Available client IPs are also forwarded to Anemochore as `X-Client-IP`.

These variables must reach the application process. The supplied [compose.yml](../compose.yml) does not currently pass the logging variables; configuring them only in the host shell does not pass them to that service.

## Events

| Event | Source | Meaning |
| --- | --- | --- |
| `request_received` | Middleware | An audited request entered Xylem. |
| `response_sent` | Middleware | A response/error hook ran for an audited request. |
| `upload_rejected` | Upload | Missing file or expected GPX processing rejection before the upstream call. |
| `upload_received` | Upload | A file was received; validation has not yet completed. |
| `anemochore_upload_completed` | Upload | Upstream upload response or transport failure. |
| `gpx_stored` | Upload | Store outcome recorded by the upload workflow; not emitted for every local rejection or unexpected error. |
| `normalize_rejected` | Normalize | Required file is missing. |
| `normalize_requested` | Normalize | A file was received for local processing. |
| `normalize_completed` | Normalize | Normalized XML was prepared, or expected GPX processing failed. |
| `gpx_retrieval_requested` | GPX/share | Retrieval or share-page handling started, including share cache hits. |
| `anemochore_gpx_fetched` | Canonical retrieval | Upstream canonical retrieval succeeded after validation, or failed with a classified retrieval error. Not emitted for cache hits, in-flight share waiters, or locally invalid IDs. |
| `gpx_retrieval_failed` | Retrieval error handler | Invalid public ID or unexpected retrieval/share error. |
| `gpx_deletion_requested` | GPX | Deletion started before token validation. |
| `gpx_deletion_rejected` | GPX | Missing token or token/ID validation returned a rejection. |
| `anemochore_gpx_deleted` | GPX | Upstream deletion response or transport failure. |

## Failure classifications

`failure_reason` is optional and is not attached to every failure event. The current values are:

| `failure_reason` | Condition |
| --- | --- |
| `anemochore_rejected` | Upload/delete status classified as failure (400 or higher), or retrieval status other than 200/404, including redirects. |
| `anemochore_unreachable` | Upload/delete transport exception, or retrieval network failure before a response. |
| `anemochore_invalid_response` | Upload response parsed as JSON but missing a truthy `id` or `delete_key`. This is not a catch-all for malformed upload responses. |
| `invalid_id` | Public retrieval/share ID fails local validation. |
| `not_found` | Upstream retrieval returned 404. |
| `timeout` | Canonical retrieval exceeded its 10-second response/body deadline. |
| `body_read` | Canonical response body could not be read. |
| `utf8` | Canonical response body is not valid UTF-8. |
| `json` | Canonical response body is not valid JSON. |
| `resource` | Canonical response exceeds byte/count/resource limits. |
| `schema` | Retrieved canonical document fails schema validation. |
| `retrieval_internal` | Unexpected retrieval/share failure handled locally as HTTP 500. |

## Sensitive data

Normal audit payloads do not deliberately include service API keys, `XYLEM_DELETE_SECRET`, deletion keys/tokens, upload bodies, or upstream response bodies. They do include request paths, GPX IDs, client IPs when available, and User-Agent information. User-Agent bytes are percent-encoded where needed (including `%`), truncated at complete encoded tokens to at most 512 bytes, and accompanied by a SHA-256 hash of the original bytes, original byte length, and truncation flag.

This is not a guarantee that every log is free of sensitive data: the logger has no general redaction configuration. Upload/delete transport failures retain exception messages and optional error codes, audit error hooks can record exception messages, and the global error handler separately writes unhandled errors to standard error. GPX processing and retrieval paths replace some arbitrary errors with generic messages, but do not establish universal sanitization. Avoid putting secrets in URLs, paths, or User-Agent headers, and treat captured logs as potentially sensitive. Log access, retention, and collection policy must be set by the operator.
