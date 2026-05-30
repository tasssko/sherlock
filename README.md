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

The API runs on `http://127.0.0.1:3001` in the local example setup.
The Vite app runs on `http://127.0.0.1:4174`.

Fixture mode is the default and requires no Relay environment.

Relay mode requires only:

```bash
LOOP_STUDY_AGENT_RUNTIME=relay
LOOP_STUDY_RELAY_API_URL=http://127.0.0.1:3000
```

The default loop.study Relay runtime profile provisions the workspace, capability routes, controller, and policy automatically.

Optional advanced overrides:

```bash
LOOP_STUDY_RELAY_PROFILE=default
LOOP_STUDY_RELAY_WORKSPACE_ID=workspace_study_advisor
LOOP_STUDY_RELAY_TEMPLATE_PATH=/absolute/path/to/profile.json
```

Legacy `SHERLOCK_AGENT_RUNTIME` and `RELAY_*` variables still work through a deprecated compatibility layer, but the preferred surface is the `LOOP_STUDY_*` contract above.

For local Relay-backed development:

```bash
./scripts/dev-relay.sh
```

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

`POST /v1/learning-loops/:id/practice-activities` generates a `flashcard_set` practice activity for an existing diagnosed learning loop.

`GET /v1/learning-loops/:id/practice-activities` lists the practice activities already attached to that loop.

`POST /v1/practice-activities/:id/completions` records completion evidence and updates mastery from practice, not from diagnostic assessment alone.

`POST /v1/study-plans` adapts a study plan from an existing diagnosed learning loop and returns:

- workspace metadata
- learning loop metadata
- tasks
- task graph
- work plan
- artifact
- diagnosed knowledge gaps
- mastery profile when available
- events

The learning loop is the primary aggregate. Study plans are loop outputs, not the root object.

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

- reassessment slices beyond the current assessment, planning, and practice flow
- richer repository boundaries for tasks, artifacts, and work plans
- richer artifact lifecycle and revision workflow
- an event-store boundary
- broader policy families
- deeper UI polish
