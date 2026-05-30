# Domain Primitives

Sherlock currently models these primitives explicitly:

- `Agent`
  - identity, role, purpose, capabilities, policies
- `Task`
  - title, kind, state, lineage, input, output
- `TaskGraph`
  - validated graph view over task relationships
- `WorkPlan`
  - objective, facts, assumptions, stages, acceptance criteria
- `Artifact`
  - typed content, provenance, version
- `Event`
  - domain-relevant lifecycle records
- `Workspace`
  - learner boundary for tasks, plans, artifacts, and events
- `Context`
  - known facts plus explicit assumptions
- `Capability`
  - bounded operations available to agents
- `Policy`
  - reviewable behavioural constraints

The main rule is simple: routes translate, UI renders, primitives own behaviour.

