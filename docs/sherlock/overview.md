# Sherlock Overview

Sherlock is the study-planning and tutoring application within the wider StackTrack ecosystem.

The current implementation targets are intentionally narrow:

1. Upload approved master data for later learning-loop use.
2. Generate an initial diagnostic assessment for one topic.
3. Record learner attempts and evaluate them.
4. Identify knowledge gaps and update mastery tracking.
5. Create a personalised study plan that attaches to the same learning loop.
6. Emit an event trail across the loop stages.
7. Return structured snapshots to the frontend.

This foundation is designed to grow without reworking the core model every time a new education feature is added.
