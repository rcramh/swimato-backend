# Swimato API

Express 5 + TypeScript REST API for the Swimato web app. Cookie-based JWT auth with refresh-token rotation, role-based authorization, structured logging.

## Quick start

```bash
cp .env.example .env      # then fill in the two token secrets
npm install
npm run dev               # http://localhost:5050, reloads on change
```

API docs (Swagger UI): <http://localhost:5050/api/v1/docs>

| Script          | What it does                                              |
| --------------- | --------------------------------------------------------- |
| `npm run dev`   | Run from source with reload (tsx)                         |
| `npm run build` | Compile to `dist/`                                        |
| `npm start`     | Run the compiled build                                    |
| `npm test`      | Vitest + Supertest                                        |
| `npm run check` | Typecheck, lint, format check, tests — run before pushing |

## Layout

```
src/
  app.ts, server.ts      app factory; process entry, startup and graceful shutdown
  config/                env validation (fails fast), cookie policy
  constants/             error codes, roles, HTTP constants
  controllers/           HTTP only: parse input, call a service, send a response
  services/              business logic (auth, tokens, users); no HTTP
  repositories/          storage contracts (types.ts) + implementations
  validators/            zod schemas for every request body and query
  middlewares/           request context/logging, auth, CSRF origin check, rate limits, errors
  errors/                AppError hierarchy
  logger/                pino logger + per-request async context
  database/              MongoDB connection (optional); seed/ holds menu data until it moves to Postgres
  docs/                  OpenAPI document
tests/                   API and unit tests
```

## Conventions

- **Responses**: `{ success: true, data }`, or `{ success: false, error: { code, message, details? }, requestId }`. Clients branch on `error.code` (see `src/constants/errorCodes.ts`), never on `message`.
- **Errors**: throw an `AppError` subclass for anything expected. Anything else becomes a logged 500 with a generic message. `DatabaseError` / `ExternalServiceError` never expose their message.
- **Input**: controllers call `parseInput(schema, req.body | req.query)` before using any input. Schemas are strict, so unknown keys are rejected.
- **Logging**: use `moduleLogger("name")`. `requestId` and `userId` are added automatically inside a request. Never log passwords, tokens or cookies; redaction exists as a backstop, not a licence.
- **Storage**: services import from `repositories/index.ts` only.

## Auth model

| Token   | Lifetime | Cookie            | Path           |
| ------- | -------- | ----------------- | -------------- |
| Access  | 15 min   | `swimato_access`  | `/`            |
| Refresh | 7 days   | `swimato_refresh` | `/api/v1/auth` |

Both cookies are `HttpOnly`, and `Secure` in production. Each refresh rotates the refresh token. Replaying a rotated-out token after a 15 s grace window revokes the session. Every authenticated request also checks that its session still exists, so logout, logout-all and password change take effect immediately. State-changing requests from a browser must come from an origin in `CLIENT_ORIGIN`.

## Health

- `GET /health`: liveness. The process is up; dependencies are not checked.
- `GET /ready`: readiness. Each dependency is reported as up, down or disabled. Answers 503 if any is down.

## Current limitations

Users and sessions live in **in-memory repositories**: they are lost on restart and not shared between instances. The rate-limit counters are also in process memory. PostgreSQL (users) and Redis (sessions, rate limits) implementations of the contracts in `src/repositories/types.ts` are the next step.
