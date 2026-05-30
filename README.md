# Sherlock

Sherlock is a TypeScript study-planning foundation aligned to the existing StackTrack Relay technical direction: Vite for the frontend, Fastify for the API, explicit domain primitives, and thin transport layers.

## Stack

- Node 22+
- pnpm
- TypeScript
- Fastify
- React
- Vite
- Vitest

## Run

```bash
pnpm install
pnpm dev:api
pnpm dev:frontend
```

The API runs on `http://127.0.0.1:3000`.
The Vite app runs on `http://127.0.0.1:5173`.

## Current Vertical Slices

`POST /v1/master-data` uploads approved curriculum or study-source items for later assessment generation.

`POST /v1/assessments/initial` creates the first diagnostic assessment in a learning loop and returns:

- the workspace snapshot
- the learning loop snapshot
- the assessment generation task
- the typed assessment artifact
- the assessment domain object
- the event trail

`POST /v1/assessments/attempts` records learner responses, evaluates them, identifies knowledge gaps, and updates mastery tracking.

`POST /v1/study-plans` creates or attaches to a learner learning loop and returns:

- workspace metadata
- learning loop metadata
- tasks
- task graph
- work plan
- artifact
- diagnosed knowledge gaps
- mastery profile when available
- events

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Docs

- [Relay architecture notes](docs/relay/architecture.md)
- [Sherlock overview](docs/sherlock/overview.md)
- [Sherlock architecture](docs/sherlock/architecture.md)

## Intentionally Deferred

- reassessment and practice-specific vertical slices beyond the initial assessment
- richer repository boundaries for tasks, artifacts, and work plans
- richer artifact lifecycle and revision workflow
- an event-store boundary
- broader policy families
- deeper UI polish
