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
  - HTTP error mapping
- `src/modules/planning`
  - study-plan vertical slice
  - controller orchestration
  - bounded agent implementation
- `src/domain/primitives`
  - core domain concepts and lifecycle rules
- `src/app/ui`
  - Vite/React client that renders workspace state

The first slice uses in-memory storage because the modelling problem matters more than persistence at this stage. Persistence can be introduced behind narrow repository interfaces later without collapsing the primitive boundaries.

