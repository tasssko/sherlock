# Sherlock Data Model

This document defines the canonical product data model for `loop.study`.

Related note:
- [Canonical Authority Boundaries](./canonical-authority.md)

The goal is to make three things explicit:

1. what the product actually persists as source of truth
2. what is derived or projected for the learner experience
3. what should stabilize before a real Postgres migration

## Why This Exists

The current application has strong domain objects, but persistence is still snapshot-heavy. That has been useful for iteration, but it creates three problems:

- product flow changes require touching generation, validation, persistence, and UI together
- performance suffers because the repository rewrites and rehydrates large learner aggregates
- it is hard to know which concepts are canonical and which are temporary projections

This model is the intended stable center of the product.

## Product View

The learner should experience a guided sequence:

1. save material
2. understand one focused idea
3. try a short task
4. answer a few questions
5. review later
6. move to the next loop

The data model should support that guided experience directly. It should not be centered on generated artifacts like “study plan” or “diagnostic assessment” as the main unit of persistence.

## Canonical Entities

These are the entities the product should treat as canonical.

### 1. Source

Represents the study material that a loop is grounded in.

Core fields:

- `sourceId`
- `sourceName`
- `rawContent`
- `contentType`
- `learnerYearGroup?`
- `userHints?`
- `acceptedInterpretation`
- `createdAt`

Responsibilities:

- stores uploaded or pasted material
- anchors source refs used by questions and feedback
- owns the accepted interpretation used by loop generation

Invariants:

- a `Source` may exist without an accepted interpretation
- a loop that uses a source in the golden path should bind to a source with an accepted interpretation
- source refs referenced elsewhere must resolve back to this source

### 2. SourceInterpretation

Represents the accepted educational interpretation of a source.

Core fields:

- `interpretationId`
- `sourceId`
- `subject`
- `yearGroup`
- `mainTopic`
- `subtopics`
- `summary`
- `learningObjectives`
- `keyTerms`
- `keyPeople`
- `importantDates`
- `processes`
- `sourceMap`
- `items`
- `acceptedAt`

Responsibilities:

- provides the canonical educational reading of the source
- feeds question generation and loop composition
- supplies objective refs and source refs for grounding

Invariants:

- only one accepted interpretation should be current for a source in the MVP path
- learning objectives must be source-grounded
- items must be traceable to source refs

### 3. QuestionSeed

Represents one learnable idea or retrieval target.

Core fields:

- `seedId`
- `sourceId`
- `learningLoopId?`
- `topic`
- `focus`
- `objectiveRefs`
- `sourceRefs`
- `answerModel`
- `explanation`
- `tags`
- `createdAt`

Responsibilities:

- defines the stable concept being asked about
- survives across guided check, review, and practice
- acts as the anchor for difficulty, support, and evidence

Invariants:

- every seed must reference at least one objective or source ref
- every seed must have an answer model
- seeds should be reusable across modes without changing their meaning

### 4. QuestionVariant

Represents one learner-facing rendering of a question seed.

Core fields:

- `variantId`
- `seedId`
- `learningLoopId`
- `ownerKind`
- `ownerId`
- `mode`
- `prompt`
- `options?`
- `correctOptionIds?`
- `hint?`
- `sourceFact?`
- `expectedAnswer?`
- `difficulty`
- `supportLevel`
- `position`

Typical modes:

- `guided`
- `multiple_choice`
- `multiple_select`
- `free_form`
- `review`
- `flashcard`
- `stretch`

Responsibilities:

- gives the learner a specific version of the underlying seed
- allows the same concept to move from supported to independent recall
- supports different surfaces without regenerating unrelated questions

Invariants:

- every variant belongs to one seed
- `multiple_choice` must have exactly one correct option
- `multiple_select` must have more than one correct option only when supported by the source
- hints must support retrieval without directly leaking the answer

### 5. LearningLoop

Represents the learner’s progression for one topic/objective round.

Core fields:

- `learningLoopId`
- `workspaceId`
- `objective`
- `topic`
- `status`
- `phase`
- `sourceIds`
- `masteryProfileId?`
- `createdAt`
- `updatedAt`

Responsibilities:

- owns lifecycle and progression
- binds the learner round to its sources
- groups loop units, evidence, and review state

Recommended statuses:

- `active`
- `completed`
- `abandoned`
- `superseded`
- `failed`

Invariants:

- only one active loop per learner/topic should be allowed by default
- a loop should never need topic-based re-discovery once `sourceIds` are bound
- a superseded loop is not resumable

### 6. LoopUnit

Represents one short guided step inside a loop.

Core fields:

- `loopUnitId`
- `learningLoopId`
- `focus`
- `reason`
- `objectiveRefs`
- `sourceRefs`
- `shortExplanation`
- `learnerTask`
- `targetGapRefs`
- `state`
- `sequence`

Recommended states:

- `locked`
- `ready`
- `in_progress`
- `completed`

Responsibilities:

- is the main unit of guided work
- selects the seeds and variants used for this step
- provides the learner with one clear action

Invariants:

- each loop unit must target at least one objective or one diagnosed gap
- each loop unit must have one clear learner task
- each loop unit should have enough checks to justify later review

### 7. LoopUnitQuestionAssignment

Represents which variants are used in a loop unit.

Core fields:

- `assignmentId`
- `loopUnitId`
- `variantId`
- `purpose`
- `sequence`

Typical purposes:

- `quick_check`
- `review`
- `practice`

Responsibilities:

- keeps loop structure explicit
- lets the same seed appear in different stages through different variants

Invariants:

- assignments should not duplicate the same variant for the same purpose unless explicitly intended

### 8. LearnerEvidence

Represents one learner response and the resulting evaluation.

Core fields:

- `evidenceId`
- `learningLoopId`
- `loopUnitId?`
- `seedId`
- `variantId`
- `sourceId?`
- `responseText`
- `selectedOptionIds?`
- `confidence?`
- `correctness`
- `supportUsed`
- `feedbackSummary?`
- `capturedAt`

Responsibilities:

- records what the learner actually did
- provides the basis for updating mastery
- links progression to concrete question variants

Invariants:

- evidence must always point to a seed and variant
- correctness must be based on the canonical answer model for that seed/variant pairing
- evidence should be append-only

### 9. MasteryState

Represents what the system believes about the learner’s current state for a topic or seed.

Core fields:

- `masteryStateId`
- `learningLoopId?`
- `topic`
- `seedId?`
- `status`
- `score`
- `lastReviewedAt?`
- `nextReviewAt?`
- `updatedAt`

Recommended statuses:

- `weak`
- `developing`
- `secure`

Responsibilities:

- tracks the current confidence of the system
- shapes later loop selection and review timing

Invariants:

- mastery must be updated from learner evidence, not from generation alone
- assessment/check output may suggest focus, but should not count as durable mastery without later learner evidence

## Derived or Projection-Only Concepts

These concepts are useful, but should not be treated as the primary domain center.

### StudyPlan

Should be treated as an optional packaging or scheduling artifact, not the root of the learner journey.

### InitialAssessment

Should be treated as one possible entry surface or diagnostic tool, not the central model of the product.

### PracticeActivity

Should become a projection over selected question variants and loop state, not a separate concept that regenerates unrelated content.

### RuntimeTrace

Should remain operational metadata, not core learner state.

## Relationships

The intended relationship graph is:

```text
Source -> SourceInterpretation
SourceInterpretation -> QuestionSeed
QuestionSeed -> QuestionVariant
LearningLoop -> Source
LearningLoop -> LoopUnit
LoopUnit -> QuestionVariant (through assignments)
QuestionVariant -> LearnerEvidence
LearnerEvidence -> MasteryState
```

This is the important product shift:

- questions are not ephemeral artifacts
- loop units are not just text bundles
- learner evidence is first-class
- mastery is updated from evidence over time

## Persistence Guidance

The product should distinguish four storage categories.

### A. Canonical relational data

Should be normalized and stable:

- sources
- accepted interpretations
- question seeds
- question variants
- learning loops
- loop units
- loop-unit question assignments
- learner evidence
- mastery state

### B. Append-only history

Should be stored separately:

- domain events
- review sessions
- explicit lifecycle transitions

### C. Derived projections

Should be recomputable:

- current loop resume payload
- next action
- learner journey stage summaries

### D. Operational metadata

Should stay off the hot path:

- runtime traces
- experimental adapter metadata
- provider diagnostics

## What Is Stable Enough Now

Relatively stable:

- `Source`
- accepted interpretation as a concept
- `LearningLoop` lifecycle status
- `QuestionSeed`
- `QuestionVariant`
- learner evidence as a first-class concept

Still moving:

- exact shape of loop units
- whether assessment remains part of the golden path
- study-plan role in the product
- practice/review packaging details
- projection rules for next action and journey stages

That means:

- the product is ready for a canonical data-model pass
- it is not yet ready for a final “proper” relational schema migration without that pass

## Migration From The Current Repository

The current SQLite repository stores broad snapshots and rewrites the learner aggregate. The migration should be incremental.

### Phase 1. Stabilize canonical entities in code

- treat `QuestionSeed` and `QuestionVariant` as the canonical question model
- make loop quick checks, review, and practice all reference those entities
- stop relying on parallel regenerated question sets

### Phase 2. Separate evidence from projections

- persist learner evidence independently
- compute mastery from evidence
- make `PracticeActivity` and loop resume payloads projection-driven

### Phase 3. Normalize loop structure

- persist `LoopUnit`
- persist loop-unit to question-variant assignments
- keep loop batch summaries derived from those records

### Phase 4. Shrink snapshot persistence

- stop rewriting the entire learner workspace on every save
- persist only changed canonical entities
- keep snapshots only where they serve as caches or compatibility layers

### Phase 5. Introduce Postgres

At that point, add a `PostgresLearningLoopRepository` with intentional tables for canonical entities rather than copying the current snapshot strategy directly.

## Immediate Design Rules

These rules should guide ongoing work even before the persistence migration happens.

1. New learner-facing question flows should start from seeds and variants.
2. New progression logic should update mastery only from learner evidence.
3. New loop work should bind to explicit source ids, not topic scans.
4. New derived UI state should be projection-only where possible.
5. Runtime/debug metadata should never become required learner state.

## Non-Goals

This document does not define:

- the final Postgres DDL
- reporting/analytics tables
- multi-tenant production concerns
- a final event-sourcing architecture

Those should follow after the canonical product model is accepted.
