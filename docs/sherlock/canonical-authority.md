# Canonical Authority Boundaries

`loop.study` currently stores two kinds of learner state:

- canonical state: the durable learning model
- compatibility state: legacy snapshots kept for resume/projection compatibility during the transition

## Authority Rule

Canonical relational state is the preferred source for reads and writes.

Canonical entity snapshots exist to:

- rehydrate domain entities
- protect migration safety when relational columns drift

Legacy compatibility snapshots exist only for:

- old projection and read paths
- migration support

They must not be used for new domain decisions when canonical state exists.

## Canonical State

Canonical state is the source of truth for durable learner progress.

That includes:

- `LearningLoop`
- `LoopUnit`
- `LoopUnitQuestionAssignment`
- `QuestionSeed`
- `QuestionVariant`
- `LearnerEvidence`
- `MasteryState`

Durable progress decisions should come from those entities first.

## Compatibility State

Compatibility state still exists for old routes, existing UI payloads, and snapshot-era records.

That includes:

- `LearningLoopBatch`
- `PracticeActivity` snapshots
- review session snapshots
- stored `MasteryProfile`
- study-plan compatibility artifacts

These structures are still useful, but only as projections or fallbacks when canonical data is missing or incomplete.

If canonical state and compatibility state disagree:

- canonical state wins
- compatibility state may only fill presentation gaps
- fallback usage should be explicit in code and observable in diagnostics

## Current Boundary

Today the intended split is:

| Surface | Source of truth | Fallback |
|---|---|---|
| `LearningLoopRepository` | canonical read/write store | legacy snapshots |
| `LearningLoopProjector` | canonical `LearningLoop` / `LoopUnit` / `MasteryState` | explicit compatibility fallback |
| `PracticeActivityProjector` | canonical assignments / variants / mastery | explicit compatibility fallback |
| `QuestionBankLoopAdapter` | canonical `QuestionSeed` / `QuestionVariant` | explicit compatibility fallback |
| `StudyPlanProjector` | canonical summary state | explicit compatibility fallback |
| `StudyPlanAdaptation` | canonical `LearnerEvidence` / `MasteryState` | explicit compatibility fallback |

## Transitional Guidance

While compatibility snapshots remain:

1. New read paths should prefer canonical entities first.
2. Fallbacks to compatibility snapshots should be commented at the boundary.
3. Canonical read fallback should emit a diagnostic so silent drift is visible.
4. Controller outputs may stay stable even if the underlying source of truth changes.
