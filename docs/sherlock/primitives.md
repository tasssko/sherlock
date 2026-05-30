# Domain Primitives

Sherlock currently models these primitives explicitly:

- `Agent`
  - identity, role, purpose, capabilities, policies, capability checks
- `Task`
  - title, kind, state, lineage, dependencies, transition methods
- `TaskGraph`
  - validated graph view over task relationships plus blocked-task calculation
- `WorkPlan`
  - objective, facts, assumptions, stages, acceptance criteria, artifact linking
- `Artifact`
  - typed content, provenance, versioning behaviour
- `Event`
  - domain-relevant lifecycle records plus centralized recording
- `Workspace`
  - learner boundary for tasks, plans, artifacts, and event ledgers
- `Context`
  - typed study-planning context without broad metadata bags
- `Capability`
  - bounded operations available to agents
- `Policy`
  - executable behavioural constraints

The main rule is simple: routes translate, UI renders, primitives own behaviour.
