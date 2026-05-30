# Agent and Capability Model

The current implementation includes one bounded agent: `study-planner`.

Assigned capabilities:

- `study-plan.generate`
- `task.create-child`
- `artifact.create`

Assigned policies:

- `age-appropriate-content`
- `curriculum-alignment`
- `no-direct-answer`

The agent does not mutate storage directly. It returns structured planning output to the workflow, which remains responsible for task updates, artifact creation, and workspace attachment.
Policy evaluation runs as executable behaviour during plan generation rather than as descriptive metadata alone.
