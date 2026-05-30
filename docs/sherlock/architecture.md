# Sherlock Architecture

Sherlock follows a primitives-first shape.

```text
HTTP Route -> Controller -> Domain Primitives -> Structured Response
UI -> Fetch Controller Result -> Render Workspace State
```

Current layers:

- `src/app/api`
  - thin Fastify routes
  - request validation
  - HTTP error mapping in the API layer
- `src/modules/assessment`
  - master-data upload boundary
  - initial assessment generation
  - attempt evaluation and diagnosis
  - narrow collaborators for source selection, quality validation, assembly, and projection
- `src/modules/learning`
  - learning-loop selection and loop-oriented coordination helpers
- `src/modules/planning`
  - study-plan vertical slice
  - thin controller
  - small workflow collaborators
  - plan adaptation from diagnosed gaps and mastery state
  - repository port
  - response projection
- `src/domain/primitives`
  - core domain concepts and lifecycle rules
  - centralized event recording
- `src/domain/learning`
  - learning-loop, assessment, attempt, evaluation, knowledge-gap, mastery-profile, and master-data types
- `src/app/ui`
  - Vite/React client split into request forms, API adapters, and read-only snapshot views

Persistence now uses a small SQLite-backed repository that stores learner workspace records and uploaded master data separately. The controllers still depend on the same narrow repository interface rather than direct SQL.

## Intentionally Deferred

- practice and reassessment slices beyond the initial loop stages
- richer repository boundaries for tasks, artifacts, and work plans
- richer artifact revision lifecycle and review semantics
- an event-store or event-sourcing boundary
- broader policy families beyond the current assessment and study-plan rules
- deeper UI polish beyond the current domain-state inspection surface
