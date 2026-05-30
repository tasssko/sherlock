# Artifact Lifecycle

Artifacts are typed outputs rather than generic markdown blobs.

Current artifact type:

- `assessment`
- `study-plan`

Each artifact records:

- workspace linkage
- optional source task
- type
- structured content
- provenance
- version
- creation time

The study-plan artifact includes session schedule entries, checkpoints, and operational notes for the learner.

The assessment artifact includes:

- topic
- item count
- difficulty metadata
- question prompts
- diagnostic instructions

Artifact provenance captures the generating controller, optional generation task, generating agent, source artifact ids, source topics, assumptions, facts, and decisions.
Artifact creation emits a domain event, and revision behaviour is owned by the primitive rather than external helper functions.
