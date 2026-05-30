# Frontend Conventions

The frontend is a thin Vite and React client.

Principles:

- keep core planning logic out of components
- submit structured commands to the API
- render returned domain state directly
- make lifecycle information visible rather than hiding it behind polished but opaque UI

The current screen intentionally exposes:

- workspace metadata
- learning loop metadata
- task graph nodes and dependencies
- work plan stages
- study-plan artifact sessions
- diagnosed knowledge gaps and mastery state
- event trail

Current UI split:

- study-plan request form
- API adapters
- workspace snapshot view
- learning loop view
- task graph view
- work plan view
- study-plan artifact view
- event timeline
