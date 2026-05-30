# Frontend Conventions

The frontend is a thin Vite and React client.

Principles:

- keep core planning logic out of components
- submit structured commands to the API
- render returned domain state directly
- make lifecycle information visible rather than hiding it behind polished but opaque UI

The current screen intentionally exposes:

- learner loop setup and master-data upload
- initial assessment generation and attempt submission
- workspace metadata
- learning loop metadata
- next action guidance
- practice activity generation and review completion
- task graph nodes and dependencies
- work plan stages
- study-plan artifact sessions
- diagnosed knowledge gaps and mastery state
- event trail

Current UI split:

- loop setup form
- master-data paste form
- API adapters
- assessment attempt form
- practice activity and completion forms
- next action view
- workspace snapshot view
- learning loop view
- task graph view
- work plan view
- study-plan artifact view
- event timeline

The frontend does not call Relay routes directly and does not consume Relay task, work plan, artifact, or agent identifiers.
