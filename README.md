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
pnpm dev:admin
```

The API runs on `http://127.0.0.1:3000`.
The Vite app runs on `http://127.0.0.1:5173`.

## First Vertical Slice

`POST /v1/study-plans` creates a weekly study plan for a learner and returns a structured workspace snapshot containing:

- workspace metadata
- tasks
- task graph
- work plan
- artifact
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

