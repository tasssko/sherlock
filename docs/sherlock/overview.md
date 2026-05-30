# Sherlock Overview

Sherlock is the study-planning and tutoring application within the wider StackTrack ecosystem.

The first implementation target is intentionally narrow:

1. Accept a structured request for a learner's weekly study plan.
2. Create a workspace-level planning task and child topic tasks.
3. Build a typed work plan.
4. Invoke a bounded study planner agent.
5. Produce a typed study-plan artifact.
6. Emit an event trail.
7. Return a structured snapshot to the frontend.

This foundation is designed to grow without reworking the core model every time a new education feature is added.

