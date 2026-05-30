# Sherlock Architecture

Sherlock follows a primitives-first shape with `LearningLoop` as the primary aggregate.

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
- `src/modules/practice`
  - practice-activity generation and completion
  - flashcard-set assembly from diagnosed gaps and master data
  - completion-driven mastery updates
- `src/modules/planning`
  - study-plan vertical slice
  - thin controller
  - small generation-service collaborators
  - plan adaptation from diagnosed gaps and mastery state
  - repository port
  - response projection
- `src/domain/primitives`
  - core domain concepts and lifecycle rules
  - centralized event recording
- `src/domain/learning`
  - learning-loop, assessment, attempt, evaluation, knowledge-gap, mastery-profile, master-data, and practice-activity types
- `src/app/ui`
  - Vite/React client split into request forms, API adapters, and read-only snapshot views

Persistence now uses a narrow learning-loop repository contract plus a SQLite adapter. Controllers and application services depend on the repository interface rather than direct SQL.

## Intentionally Deferred

- reassessment slices beyond the current practice stage
- richer repository boundaries for tasks, artifacts, and work plans
- richer artifact revision lifecycle and review semantics
- an event-store or event-sourcing boundary
- broader policy families beyond the current assessment and study-plan rules
- deeper UI polish beyond the current domain-state inspection surface
