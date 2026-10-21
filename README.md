[Japanese README](README.ja.md)

# Xylem

Xylem is a reference implementation of a backend for frontend (BFF) for Anemochore. It validates and normalizes GPX files, uses Anemochore to store canonical JSON, and serves GPX downloads and share pages. The Anemochore service API key stays on the server.


## Features

- GPX validation and normalization for tracks, routes, and waypoints.
- Uploads to Anemochore and GPX XML downloads from stored canonical data.
- Deletion using signed tokens issued at upload time.
- Share pages with map viewers and Open Graph metadata.
- Structured JSON audit logs for API operations and share-page requests.


## Requirements

- Node.js and npm versions pinned in [package.json](package.json)
- Docker
- Docker Compose


## Development Model

Xylem is developed using Docker for runtime execution while the project source directory is bind-mounted from the host.

This means there are two separate environments:

- **Host environment** — used for editing source code and running local development tools and tests.
- **Docker environment** — used to run the application.

These environments have separate `node_modules` directories. Install dependencies in each environment you use; both installations share the same `package-lock.json`.


## Initial Setup

The application requires `ANEMOCHORE_API_URL`, `ANEMOCHORE_API_KEY`, `XYLEM_PUBLIC_ORIGIN`, and `XYLEM_DELETE_SECRET` in its runtime environment. See [configuration](src/config.ts) for validation and optional settings. Use a secret value for `XYLEM_DELETE_SECRET`; keep credentials out of version control.

`CHLOROPLAST_PUBLIC_ORIGIN` is optional. A configured HTTP(S) URL enables Chloroplast-backed Open Graph image metadata. Use a plain origin without credentials, path, query, or fragment: this value is published in share-page HTML. Legacy HTTP(S) URLs with those components remain accepted for compatibility. When absent or explicitly empty, share pages remain functional and omit `og:image` and the image-specific Twitter card metadata. Nonempty invalid values are rejected. Retained share-page HTML is regenerated if its image URL no longer matches the effective setting.

The supplied [Compose configuration](compose.yml) passes the four required variables from the host environment but does not forward `CHLOROPLAST_PUBLIC_ORIGIN`; setting it on the host alone does not enable image metadata in that container. No Compose change is needed to run without Chloroplast. Optional settings, including logging settings, require explicit forwarding when using Compose.

Install the project dependencies on the host.

This installation supports editor language services, code completion, static analysis, and local tests.

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

If the `node_modules` Docker volume becomes inconsistent, recreate it and reinstall its dependencies:

```bash
docker compose down -v
docker compose run --rm app npm install
docker compose up --build
```


**Warning:** `docker compose down -v` deletes Compose-managed named volumes and attached anonymous volumes. In the supplied configuration, this removes the `node_modules` volume; the bind-mounted project source is not deleted. If you add other volumes, their data may also be deleted.


## Tests

Run `npm test` for routine local verification. See the [test guide](test/README.md) for additional test commands and the distinction between local tests and deployed-staging acceptance tests.


## Audit Logging

Xylem emits structured JSON audit logs for uploads, normalization, GPX retrieval/deletion, and share-page requests. See the [audit logging guide](docs/audit-logging.md) for events, failure classifications, request ID propagation, trusted proxy settings, and sensitive-data handling.

## API Specification

Xylem provides browser-facing endpoints with formats and authentication that differ from the [Anemochore storage API](https://github.com/hiroaki/anemochore/blob/main/docs/api.md):

| Endpoint | Xylem behavior |
| --- | --- |
| `POST /api/normalize` | Accepts a multipart `file` containing GPX and returns normalized GPX XML without storing it. |
| `POST /api/upload` | Accepts a multipart GPX `file`, validates and normalizes it, then uploads canonical JSON to Anemochore. Returns `id`, `url`, `deleteUrl`, and a signed `deleteToken` instead of the upstream `delete_key`. |
| `GET /api/gpx/:id` | Retrieves and validates canonical JSON from Anemochore, then returns GPX XML. |
| `DELETE /api/gpx/:id` | Requires `X-Delete-Token` from the upload response. Xylem verifies it and supplies Anemochore's service credentials and deletion key upstream. |
| `GET /s/:id` | Serves a share page with a map viewer and Open Graph metadata. The viewer requires Tilia assets under `/tilia/`; they are not bundled in this repository's `public/` directory. |
| `GET /api/health` | Returns the local service health response. |

Upload and normalization use the same GPX processing boundary; unsupported content is not guaranteed to survive normalization. See the [route implementations](src/routes) and [GPX processing code](src/gpx/process.ts) for current validation, response, and error behavior. The upstream API specification describes the storage service, not Xylem's public contract.

## License

This project is licensed under the Zero-Clause BSD License (0BSD). See the [LICENSE](LICENSE) file for details.
