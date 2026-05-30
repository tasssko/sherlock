# Frontend Conventions

The frontend is a thin Vite and React client.

Principles:

- keep core planning logic out of components
- submit structured commands to the API
- render returned domain state directly
- make lifecycle information visible rather than hiding it behind polished but opaque UI

The current screen intentionally exposes:

- workspace metadata
- task list
- work plan stages
- study-plan artifact sessions
- event trail

