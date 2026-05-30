# Backend API Conventions

Current route:

- `POST /v1/master-data`
- `POST /v1/assessments/initial`
- `POST /v1/assessments/attempts`
- `POST /v1/study-plans`

Route responsibilities:

- validate request shape with `zod`
- call the relevant thin controller
- map domain failures to HTTP status codes in the API layer
- return structured JSON

Route non-responsibilities:

- constructing task graphs directly
- generating assessments, diagnoses, or study plans inline
- mutating multiple domain objects procedurally in the handler
- embedding agent reasoning rules
