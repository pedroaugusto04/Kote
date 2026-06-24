# Agent Guidelines

These rules apply to this repository. When instructions conflict, follow this priority:

1. Existing code and tests
2. `knowledge-base/README.md`
3. This `AGENTS.md`

## Project Shape

This repository currently centers on `knowledge-base/`, a TypeScript code-first product with:

- Backend: NestJS API, CLI entrypoints, domain/application/infrastructure layering.
- Frontend: React + Vite.
- Validation: Zod for DTOs and request/response contracts.
- Persistence: repository adapters under `src/infrastructure`; the current implementation uses concrete repositories such as filesystem/vault adapters and Postgres where implemented.

Do not introduce a broad architectural rewrite unless the user explicitly asks for it.

## Backend Architecture

Use the existing layered flow:

- HTTP/controller layer: `knowledge-base/src/interfaces/http/**`
- DTO/schema layer: `knowledge-base/src/interfaces/http/dto/**` or nearby contract-specific modules
- Application services/use cases: `knowledge-base/src/application/**`
- Domain logic and pure models: `knowledge-base/src/domain/**`
- Repository ports/contracts: `knowledge-base/src/application/ports/**` or `knowledge-base/src/application/**` when already established
- Concrete repositories/adapters: `knowledge-base/src/infrastructure/**` and `knowledge-base/src/adapters/**`

Mandatory flow for API work:

```text
controller -> application service/use case -> repository/adapter
```

Controllers must not call persistence, filesystem, external APIs, or low-level adapters directly unless the current local pattern explicitly treats that controller as a thin compatibility adapter. Prefer moving behavior into a service/use case first.

Keep dependency injection aligned with the current framework. This project uses NestJS DI in `app.module.ts`; do not add Inversify unless the project intentionally migrates to it.

## DTOs, Types, And Models

- Use Zod for DTO validation, parsing, and mapping.
- Avoid ad-hoc object casting/parsing for API inputs.
- Prefer strict TypeScript types and avoid `any`; if `any` is necessary, keep it local and explain why in code or in the handoff.
- For fixed sets with multiple string options, prefer `enum` or a reusable constant/schema pair instead of repeated raw string literals.
- Do not keep reusable `types`, `interfaces`, `models`, `schemas`, `mappers`, `normalizers`, or similar structures embedded inside classes, controllers, services, React components, or page files just for convenience. Move them to dedicated files/folders owned by the appropriate module so those contracts can be read in isolation and the implementation files stay focused on behavior/rendering.
- Place `types`, `models`, `mappers`, `schemas`, `normalizers`, and similar support files in the folder that matches their architectural responsibility. Do not drop these files into arbitrary feature folders or generic utility locations just because they are convenient.
- Shared backend types should live in appropriate modules such as:
  - `knowledge-base/src/domain/**` for domain concepts
  - `knowledge-base/src/application/models/**` for application-facing models
  - `knowledge-base/src/contracts/**` for cross-boundary contracts
  - `knowledge-base/src/interfaces/http/dto/**` for HTTP DTOs
- Backend placement rules:
  - domain entities, value objects, domain enums, and pure domain mappers belong under `knowledge-base/src/domain/**`
  - use-case input/output models, orchestration-facing types, and repository port models belong under `knowledge-base/src/application/**`
  - transport DTOs, request/response schemas, and HTTP serialization/parsing helpers belong under `knowledge-base/src/interfaces/http/**`
  - persistence mappers, ORM/storage serializers, and adapter-specific types belong next to the concrete repository/adapter under `knowledge-base/src/infrastructure/**` or `knowledge-base/src/adapters/**`
  - if a mapper translates across layers, place it with the layer that owns the boundary being crossed, instead of in a generic `utils` folder
- Shared frontend models and utility helpers should live in:
  - `knowledge-base/frontend/src/shared/api/models/**`
  - `knowledge-base/frontend/src/shared/utils/**` for shared formatting, text, and business logic helper functions
  - `knowledge-base/frontend/src/features/**` when feature-scoped
- Frontend placement rules:
  - API request/response models, endpoint payload types, and API mappers belong under `knowledge-base/frontend/src/shared/api/**`
  - shared formatters, text helpers, and helper-level normalizers belong under `knowledge-base/frontend/src/shared/utils/**`
  - feature-local view models, form schemas, and feature mappers belong under `knowledge-base/frontend/src/features/**`
  - reusable UI-only types and presentational helpers belong with the owning `shared`, `widgets`, or component module, not mixed into API or domain folders
- Prefer colocating files with the module that owns them. Only promote a type/model/mapper to a broader shared folder when it is actually reused across module boundaries.
- Keep in-file types only when they are truly private to that file, small enough not to hurt readability, and not part of a reusable contract.

## Persistence

- Keep persistence behind repository interfaces/ports.
- Schema or storage contract changes must update repositories, mappers, seed/setup logic when applicable, docs, and impacted tests.
- Never edit old applied migration files if migrations exist.
- **Never rename or alter the timestamp of existing migration files.** Always create new migrations with unique, higher timestamps to fix issues. Renaming existing migrations causes ordering conflicts in production databases where the old migration name is already recorded as applied.
- Database changes must be delivered as a new migration under `backend/src/infrastructure/persistence/migrations/**`, not as ad-hoc SQL hidden in repositories, bootstrap code, or tests.
- Do not rely on `down` migrations as the primary production rollback plan. Treat `down` as local/dev support unless the user explicitly asks for a rollback workflow.
- When changing schema, also review and update:
  - repository queries and persistence mappers
  - DTOs/contracts when the external shape changes
  - local test setup and integration tests
  - `README.md` when the operational process or required env/setup changes
- Before concluding DB-related work, run the narrowest relevant verification and include it in the handoff. The default minimum expectation is:

```bash
npm --prefix knowledge-base run build:api
npm --prefix knowledge-base run migrate
npm --prefix knowledge-base run test:api
```

## Frontend Architecture

- Do not introduce direct `fetch` calls in feature/page code when the shared API client is expected.
- API contract changes must update:
  - backend controller/DTO/service
  - frontend API client and endpoint/model modules
  - README or relevant docs
  - impacted tests
- Keep page components focused on composition and user interaction. Put reusable API models, normalizers, UI primitives, and business helpers in the appropriate `shared`, `entities`, `features`, or `widgets` folders.

## Auth, Security, And Secrets

- Do not weaken cookie auth/session flow, JWT handling, Origin/Referer checks, permission gates, rate limits, or internal service-token checks without explicit approval.
- Never hardcode real secrets, tokens, credentials, or customer data.
- New secrets and config must use env vars.
- If env keys change, update:
  - `.env.example`
  - `knowledge-base/README.md`
  - Docker compose env wiring
  - deploy workflows/scripts under `.github/workflows/**` or `scripts/deploy/**` when present and applicable
- Do not log decrypted secrets or return them to browser-facing APIs.

## Hardcoded Values And Bad Practices

Before changing hardcoded values or replacing a questionable pattern, warn the user first when the change is broad or behavioral. The warning should include:

- what is risky
- technical impact
- recommended alternative, such as env config, a centralized constant, shared helper, or a library-backed abstraction

Small local cleanup directly needed for correctness can be done without pausing, but report it in the final handoff.

## Repetition And Library Suggestions

When you find heavy repetition, fragile custom logic, or a pattern that a project-standard library would solve well, suggest a concrete improvement. Include:

- where the repetition/pattern appears
- why it is risky or expensive to maintain
- the recommended abstraction or library
- whether it should be done now or as a follow-up

Do not add new libraries only because they are convenient. Prefer existing dependencies and local patterns unless the benefit is clear.

## Tests And Verification

Do not consider a code task done without running impacted tests.

Use the narrowest meaningful checks first, then broader checks when the blast radius justifies it:

```bash
npm --prefix knowledge-base run build:api
npm --prefix knowledge-base run build:frontend
npm --prefix knowledge-base run test:api
npm --prefix knowledge-base run test:frontend
npm --prefix knowledge-base test
```

Business-rule or critical-flow changes require equivalent tests.

For auth, credential storage, persistence, document-drive, and cross-layer API changes, add or update integration-style tests where the current test setup supports it.

## Scope Control

- Prioritize the requested outcome with minimal safe changes.
- Supporting changes are allowed when directly needed for quality, correctness, typing, tests, or local consistency.
- Broad changes require approval, including cross-domain refactors, large file moves, architecture-wide rewrites, non-requested API contract changes, or replacing the persistence approach.
- When adding supporting changes beyond the direct request, report what changed, why it was needed, and the impact/risk.

## Handoff

Final reports should state:

- what changed
- what tests/builds were run
- residual risks, known gaps, or follow-ups
- any suggested standardization or library-backed cleanup discovered during the work
