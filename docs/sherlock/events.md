# Event Model

Sherlock emits domain events that are meaningful to planning and auditability.

Current event types:

- `task.created`
- `task.state_changed`
- `work-plan.created`
- `agent.invoked`
- `assumption.recorded`
- `artifact.generated`

This is not intended as decorative logging. The event list is returned in the controller response so developers and future product surfaces can inspect why work happened and in what order.

