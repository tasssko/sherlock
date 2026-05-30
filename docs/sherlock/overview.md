# Sherlock Overview

Sherlock is the study-planning and tutoring application within the wider StackTrack ecosystem.

The current implementation targets are intentionally narrow:

1. Upload approved master data for later learning-loop use.
2. Create a learner loop by generating an initial diagnostic assessment for one topic.
3. Record learner attempts and evaluate them.
4. Identify knowledge gaps from assessment evidence.
5. Create an adapted study plan that attaches to the same learning loop.
6. Generate a flashcard practice activity from the diagnosed gaps.
7. Complete an active review session and update mastery from item-level evidence.
8. Return learner-facing projections with `learningLoopId`, `phase`, `nextAction`, and the relevant domain state.
9. Keep Relay behind the internal `AgentRuntime` boundary.

This foundation is designed to grow without reworking the core model every time a new education feature is added.
