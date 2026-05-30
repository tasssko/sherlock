# Relay Conventions

Sherlock adopts the following conventions from the observed Relay project:

- Keep the repository single-package unless a real scaling reason appears.
- Put runtime entrypoints under `src/app`.
- Keep domain model code outside transport code.
- Use Fastify routes as translation layers, not business-logic containers.
- Use strict TypeScript and explicit value shapes.
- Prefer Vitest over ad hoc test runners.

Sherlock-specific interpretation:

- `src/domain/primitives` contains durable concepts such as `Task`, `WorkPlan`, and `Artifact`.
- `src/modules/planning` contains a thin controller plus explicit workflow, repository, and projector collaborators instead of a monolithic orchestration method.
- The Vite UI renders the workspace snapshot returned by the controller rather than reconstructing domain state in React.
