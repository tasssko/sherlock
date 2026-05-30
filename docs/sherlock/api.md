# Backend API Conventions

Current route:

- `POST /v1/master-data`
- `POST /v1/assessments/initial`
- `POST /v1/assessments/attempts`
- `POST /v1/study-plans`
- `GET /v1/learning-loops/:id`
- `POST /v1/learning-loops/:id/practice-activities`
- `POST /v1/practice-activities/:id/completions`
- `GET /v1/learning-loops/:id/practice-activities`

Route responsibilities:

- validate request shape with `zod`
- call the relevant thin controller
- map domain failures to HTTP status codes in the API layer
- return structured JSON

Loop-facing responses continue to expose learner-facing state, not Relay runtime resources:

- `learningLoopId`
- `phase`
- `nextAction`
- current domain data for the relevant step such as assessment, gaps, study plan, practice activity, or review evidence

`GET /v1/learning-loops/:id` is the resume route for the product UI. It returns the persisted loop state needed to continue the golden path after a browser refresh, including the current assessment, latest evidence, current study plan if present, current practice activity if present, and the learner-facing event trail.

Route non-responsibilities:

- constructing task graphs directly
- generating assessments, diagnoses, study plans, or practice activities inline
- mutating multiple domain objects procedurally in the handler
- embedding agent reasoning rules
