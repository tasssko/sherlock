# Task and TaskGraph Lifecycle

Current task states:

- `created`
- `planned`
- `ready`
- `running`
- `blocked`
- `completed`
- `failed`
- `cancelled`

Key behaviour:

- invalid transitions are rejected
- a task cannot enter `ready` or `completed` if required dependencies are incomplete
- parent and child lineage is recorded separately from dependency edges
- `TaskGraph` validates that referenced parents and dependencies exist

The first vertical slice creates one parent planning task and one child task per study topic.

