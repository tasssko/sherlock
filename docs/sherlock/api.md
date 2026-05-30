# Backend API Conventions

Current route:

- `POST /v1/study-plans`

Route responsibilities:

- validate request shape with `zod`
- call the study-plan controller
- map domain failures to HTTP status codes
- return structured JSON

Route non-responsibilities:

- constructing task graphs directly
- generating plan text inline
- mutating multiple domain objects procedurally in the handler
- embedding agent reasoning rules

