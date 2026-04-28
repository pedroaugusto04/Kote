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
- Shared backend types should live in appropriate modules such as:
  - `knowledge-base/src/domain/**` for domain concepts
  - `knowledge-base/src/application/models/**` for application-facing models
  - `knowledge-base/src/contracts/**` for cross-boundary contracts
  - `knowledge-base/src/interfaces/http/dto/**` for HTTP DTOs
- Shared frontend models should live in:
  - `knowledge-base/frontend/src/shared/api/models/**`
  - `knowledge-base/frontend/src/entities/**`
  - `knowledge-base/frontend/src/features/**` when feature-scoped
- Keep in-file types only when they are truly private to that file and not part of a reusable contract.

## Persistence

- Keep persistence behind repository interfaces/ports.
- Schema or storage contract changes must update repositories, mappers, seed/setup logic when applicable, docs, and impacted tests.
- If Prisma is introduced later, add append-only migrations and use Prisma as the persistence contract for that affected area. Do not retrofit Prisma across unrelated modules without explicit approval.
- Never edit old applied migration files if migrations exist.

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
