# Event Model

Sherlock emits domain events that are meaningful to planning and auditability.

Current event types:

- `task.created`
- `task.state_changed`
- `work-plan.created`
- `work-plan.assumption-recorded`
- `work-plan.artifact-attached`
- `agent.invoked`
- `artifact.generated`
- `workspace.task-attached`
- `workspace.work-plan-attached`
- `workspace.artifact-attached`
- `policy.evaluated`

These events are recorded through a centralized event recorder rather than manual array pushes in the controller. The event list is returned in the controller response so developers and future product surfaces can inspect why work happened and in what order.
