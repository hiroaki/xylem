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


## API Specification

Xylem exposes the same public API as Anemochore.

For endpoint definitions, request and response formats, authentication requirements, and error handling, refer to the Anemochore API specification:

- https://github.com/hiroaki/anemochore/blob/main/docs/api.md

Xylem acts as a Backend for Frontend (BFF) and forwards requests to Anemochore while keeping the Anemochore service API key on the server side. The public API is intentionally kept compatible with the Anemochore API.


## License

This project is licensed under the Zero-Clause BSD License (0BSD). See the [LICENSE](LICENSE) file for details.
