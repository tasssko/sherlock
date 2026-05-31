import type { DatabaseSync } from "node:sqlite";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { LearnerEvidence } from "../../domain/learning/LearnerEvidence.js";
import { LoopUnit } from "../../domain/learning/LoopUnit.js";
import { LoopUnitQuestionAssignment } from "../../domain/learning/LoopUnitQuestionAssignment.js";
import { MasteryState } from "../../domain/learning/MasteryState.js";
import { LearningLoop } from "../../domain/learning/LearningLoop.js";
import { QuestionSeed, QuestionVariant } from "../../domain/learning/QuestionBank.js";
import {
  learnerEvidenceTable,
  learningLoopsTable,
  loopUnitQuestionAssignmentsTable,
  loopUnitsTable,
  masteryStatesTable,
  questionSeedsTable,
  questionVariantsTable
} from "./drizzleCanonicalSchema.js";

export interface CanonicalLearningSnapshots {
  learningLoops: readonly string[];
  learnerEvidence: readonly string[];
  masteryStates: readonly string[];
  loopUnits: readonly string[];
  loopUnitQuestionAssignments: readonly string[];
  questionSeeds: readonly string[];
  questionVariants: readonly string[];
}

export interface CanonicalLearningStateInput {
  learningLoops: readonly LearningLoop[];
  learnerEvidence: readonly LearnerEvidence[];
  masteryStates: readonly MasteryState[];
  loopUnits: readonly LoopUnit[];
  loopUnitQuestionAssignments: readonly LoopUnitQuestionAssignment[];
  questionSeeds: readonly QuestionSeed[];
  questionVariants: readonly QuestionVariant[];
}

interface LearningLoopRow {
  id: string;
  workspaceId: string;
  objective: string;
  topic: string;
  phase: string;
  status: string;
  masteryProfileId: string | null;
  createdAt: string;
  updatedAt: string;
  snapshot: string;
}

interface LearnerEvidenceRow {
  id: string;
  workspaceId: string;
  learningLoopId: string;
  loopUnitId: string | null;
  seedId: string;
  variantId: string;
  sourceId: string | null;
  responseText: string;
  confidence: string | null;
  correctness: string;
  supportUsed: string;
  capturedAt: string;
  snapshot: string;
}

interface MasteryStateRow {
  id: string;
  learningLoopId: string | null;
  topic: string;
  seedId: string | null;
  status: string;
  score: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  updatedAt: string;
  snapshot: string;
}

interface LoopUnitRow {
  id: string;
  learningLoopId: string;
  focus: string;
  state: string;
  sequence: number;
  createdAt: string;
  snapshot: string;
}

interface LoopUnitQuestionAssignmentRow {
  id: string;
  learningLoopId: string;
  loopUnitId: string;
  variantId: string;
  purpose: string;
  sequence: number;
  createdAt: string;
  snapshot: string;
}

interface QuestionSeedRow {
  id: string;
  learningLoopId: string;
  topic: string;
  focus: string;
  answerModel: string;
  createdAt: string;
  snapshot: string;
}

interface QuestionVariantRow {
  id: string;
  learningLoopId: string;
  seedId: string;
  ownerId: string;
  ownerKind: string;
  mode: string;
  position: number;
  difficulty: string | null;
  createdAt: string;
  snapshot: string;
}

export class CanonicalSnapshotFallbackRequiredError extends Error {
  constructor(
    readonly entityName: string,
    readonly entityId: string,
    readonly reason: string
  ) {
    super(
      `Canonical ${entityName} row ${entityId} requires snapshot fallback: ${reason}`
    );
    this.name = "CanonicalSnapshotFallbackRequiredError";
  }
}

export class DrizzleCanonicalLearningStore {
  private readonly dialect = new SQLiteSyncDialect();

  constructor(private readonly database: DatabaseSync) {}

  loadCanonicalStateForLearner(learnerKey: string): CanonicalLearningStateInput {
    return {
      learningLoops: this.loadLearningLoopsForLearner(learnerKey),
      learnerEvidence: this.loadLearnerEvidenceForLearner(learnerKey),
      masteryStates: this.loadMasteryStatesForLearner(learnerKey),
      loopUnits: this.loadLoopUnitsForLearner(learnerKey),
      loopUnitQuestionAssignments: this.loadLoopUnitQuestionAssignmentsForLearner(learnerKey),
      questionSeeds: this.loadQuestionSeedsForLearner(learnerKey),
      questionVariants: this.loadQuestionVariantsForLearner(learnerKey)
    };
  }

  loadSnapshotsForLearner(learnerKey: string): CanonicalLearningSnapshots {
    return {
      learningLoops: this.selectSnapshots(
        sql`select ${learningLoopsTable.snapshot} as snapshot
            from ${learningLoopsTable}
            where ${learningLoopsTable.learnerKey} = ${learnerKey}
            order by ${sql.raw("rowid asc")}`
      ),
      learnerEvidence: this.selectSnapshots(
        sql`select ${learnerEvidenceTable.snapshot} as snapshot
            from ${learnerEvidenceTable}
            where ${learnerEvidenceTable.learnerKey} = ${learnerKey}
            order by ${sql.raw("rowid asc")}`
      ),
      masteryStates: this.selectSnapshots(
        sql`select ${masteryStatesTable.snapshot} as snapshot
            from ${masteryStatesTable}
            where ${masteryStatesTable.learnerKey} = ${learnerKey}
            order by ${sql.raw("rowid asc")}`
      ),
      loopUnits: this.selectSnapshots(
        sql`select ${loopUnitsTable.snapshot} as snapshot
            from ${loopUnitsTable}
            where ${loopUnitsTable.learnerKey} = ${learnerKey}
            order by ${sql.raw("rowid asc")}`
      ),
      loopUnitQuestionAssignments: this.selectSnapshots(
        sql`select ${loopUnitQuestionAssignmentsTable.snapshot} as snapshot
            from ${loopUnitQuestionAssignmentsTable}
            where ${loopUnitQuestionAssignmentsTable.learnerKey} = ${learnerKey}
            order by ${sql.raw("rowid asc")}`
      ),
      questionSeeds: this.selectSnapshots(
        sql`select ${questionSeedsTable.snapshot} as snapshot
            from ${questionSeedsTable}
            where ${questionSeedsTable.learnerKey} = ${learnerKey}
            order by ${sql.raw("rowid asc")}`
      ),
      questionVariants: this.selectSnapshots(
        sql`select ${questionVariantsTable.snapshot} as snapshot
            from ${questionVariantsTable}
            where ${questionVariantsTable.learnerKey} = ${learnerKey}
            order by ${sql.raw("rowid asc")}`
      )
    };
  }

  findLearningLoopLearnerKey(learningLoopId: string): string | undefined {
    return this.selectFirst<{ learnerKey: string }>(
      sql`select ${learningLoopsTable.learnerKey} as learnerKey
          from ${learningLoopsTable}
          where ${learningLoopsTable.id} = ${learningLoopId}`
    )?.learnerKey;
  }

  replaceCanonicalState(learnerKey: string, state: CanonicalLearningStateInput): void {
    this.execute(
      sql`delete from ${learningLoopsTable} where ${learningLoopsTable.learnerKey} = ${learnerKey}`
    );
    this.execute(
      sql`delete from ${learnerEvidenceTable} where ${learnerEvidenceTable.learnerKey} = ${learnerKey}`
    );
    this.execute(
      sql`delete from ${masteryStatesTable} where ${masteryStatesTable.learnerKey} = ${learnerKey}`
    );
    this.execute(
      sql`delete from ${loopUnitsTable} where ${loopUnitsTable.learnerKey} = ${learnerKey}`
    );
    this.execute(
      sql`delete from ${loopUnitQuestionAssignmentsTable}
          where ${loopUnitQuestionAssignmentsTable.learnerKey} = ${learnerKey}`
    );
    this.execute(
      sql`delete from ${questionSeedsTable} where ${questionSeedsTable.learnerKey} = ${learnerKey}`
    );
    this.execute(
      sql`delete from ${questionVariantsTable} where ${questionVariantsTable.learnerKey} = ${learnerKey}`
    );

    for (const learningLoop of state.learningLoops) {
      const snapshot = learningLoop.toSnapshot();
      this.execute(
        sql`insert into ${learningLoopsTable}
            ${sql.raw("(id, learner_key, workspace_id, objective, topic, phase, status, mastery_profile_id, created_at, updated_at, snapshot)")}
            values (
              ${String(snapshot.id)},
              ${learnerKey},
              ${String(snapshot.workspaceId)},
              ${snapshot.objective},
              ${snapshot.topic},
              ${snapshot.phase},
              ${snapshot.status},
              ${snapshot.masteryProfileId ? String(snapshot.masteryProfileId) : null},
              ${snapshot.createdAt},
              ${snapshot.updatedAt},
              ${JSON.stringify(snapshot)}
            )`
      );
    }

    for (const evidence of state.learnerEvidence) {
      const snapshot = evidence.toSnapshot();
      this.execute(
        sql`insert into ${learnerEvidenceTable}
            ${sql.raw("(id, learner_key, workspace_id, learning_loop_id, loop_unit_id, seed_id, variant_id, source_id, response_text, confidence, correctness, support_used, captured_at, snapshot)")}
            values (
              ${String(snapshot.id)},
              ${learnerKey},
              ${String(snapshot.workspaceId)},
              ${String(snapshot.learningLoopId)},
              ${snapshot.loopUnitId ? String(snapshot.loopUnitId) : null},
              ${String(snapshot.seedId)},
              ${String(snapshot.variantId)},
              ${snapshot.sourceId ? String(snapshot.sourceId) : null},
              ${snapshot.responseText},
              ${snapshot.confidence ?? null},
              ${snapshot.correctness},
              ${snapshot.supportUsed},
              ${snapshot.capturedAt},
              ${JSON.stringify(snapshot)}
            )`
      );
    }

    for (const masteryState of state.masteryStates) {
      const snapshot = masteryState.toSnapshot();
      this.execute(
        sql`insert into ${masteryStatesTable}
            ${sql.raw("(id, learner_key, learning_loop_id, topic, seed_id, status, score, last_reviewed_at, next_review_at, updated_at, snapshot)")}
            values (
              ${String(snapshot.id)},
              ${learnerKey},
              ${snapshot.learningLoopId ? String(snapshot.learningLoopId) : null},
              ${snapshot.topic},
              ${snapshot.seedId ? String(snapshot.seedId) : null},
              ${snapshot.status},
              ${snapshot.score},
              ${snapshot.lastReviewedAt ?? null},
              ${snapshot.nextReviewAt ?? null},
              ${snapshot.updatedAt},
              ${JSON.stringify(snapshot)}
            )`
      );
    }

    for (const loopUnit of state.loopUnits) {
      const snapshot = loopUnit.toSnapshot();
      this.execute(
        sql`insert into ${loopUnitsTable}
            ${sql.raw("(id, learner_key, learning_loop_id, focus, state, sequence, created_at, snapshot)")}
            values (
              ${String(snapshot.id)},
              ${learnerKey},
              ${String(snapshot.learningLoopId)},
              ${snapshot.focus},
              ${snapshot.state},
              ${snapshot.sequence},
              ${snapshot.createdAt},
              ${JSON.stringify(snapshot)}
            )`
      );
    }

    for (const assignment of state.loopUnitQuestionAssignments) {
      const snapshot = assignment.toSnapshot();
      this.execute(
        sql`insert into ${loopUnitQuestionAssignmentsTable}
            ${sql.raw("(id, learner_key, learning_loop_id, loop_unit_id, variant_id, purpose, sequence, created_at, snapshot)")}
            values (
              ${String(snapshot.id)},
              ${learnerKey},
              ${String(snapshot.learningLoopId)},
              ${String(snapshot.loopUnitId)},
              ${String(snapshot.variantId)},
              ${snapshot.purpose},
              ${snapshot.sequence},
              ${snapshot.createdAt},
              ${JSON.stringify(snapshot)}
            )`
      );
    }

    for (const questionSeed of state.questionSeeds) {
      const snapshot = questionSeed.toSnapshot();
      this.execute(
        sql`insert into ${questionSeedsTable}
            ${sql.raw("(id, learner_key, learning_loop_id, topic, focus, answer_model, created_at, snapshot)")}
            values (
              ${String(snapshot.id)},
              ${learnerKey},
              ${String(snapshot.learningLoopId)},
              ${snapshot.topic},
              ${snapshot.focus},
              ${snapshot.answerModel},
              ${snapshot.createdAt},
              ${JSON.stringify(snapshot)}
            )`
      );
    }

    for (const questionVariant of state.questionVariants) {
      const snapshot = questionVariant.toSnapshot();
      this.execute(
        sql`insert into ${questionVariantsTable}
            ${sql.raw("(id, learner_key, learning_loop_id, seed_id, owner_id, owner_kind, mode, position, difficulty, created_at, snapshot)")}
            values (
              ${String(snapshot.id)},
              ${learnerKey},
              ${String(snapshot.learningLoopId)},
              ${String(snapshot.seedId)},
              ${snapshot.ownerId},
              ${snapshot.ownerKind},
              ${snapshot.mode},
              ${snapshot.position},
              ${snapshot.difficulty ?? null},
              ${snapshot.createdAt},
              ${JSON.stringify(snapshot)}
            )`
      );
    }
  }

  private selectSnapshots(statement: ReturnType<typeof sql>): readonly string[] {
    return this.selectAll<{ snapshot: string }>(statement).map((row) => row.snapshot);
  }

  private selectAll<T>(statement: ReturnType<typeof sql>): readonly T[] {
    const compiled = this.dialect.sqlToQuery(statement);
    return this.database.prepare(compiled.sql).all(...this.params(compiled.params)) as T[];
  }

  private selectFirst<T>(
    statement: ReturnType<typeof sql>
  ): T | undefined {
    const compiled = this.dialect.sqlToQuery(statement);
    return this.database.prepare(compiled.sql).get(...this.params(compiled.params)) as T | undefined;
  }

  private execute(statement: ReturnType<typeof sql>): void {
    const compiled = this.dialect.sqlToQuery(statement);
    this.database.prepare(compiled.sql).run(...this.params(compiled.params));
  }

  private params(values: readonly unknown[]): readonly (string | number | bigint | Uint8Array | null)[] {
    return values as readonly (string | number | bigint | Uint8Array | null)[];
  }

  private loadLearningLoopsForLearner(learnerKey: string): readonly LearningLoop[] {
    return this.selectAll<LearningLoopRow>(
      sql`select
            ${learningLoopsTable.id} as id,
            ${learningLoopsTable.workspaceId} as workspaceId,
            ${learningLoopsTable.objective} as objective,
            ${learningLoopsTable.topic} as topic,
            ${learningLoopsTable.phase} as phase,
            ${learningLoopsTable.status} as status,
            ${learningLoopsTable.masteryProfileId} as masteryProfileId,
            ${learningLoopsTable.createdAt} as createdAt,
            ${learningLoopsTable.updatedAt} as updatedAt,
            ${learningLoopsTable.snapshot} as snapshot
          from ${learningLoopsTable}
          where ${learningLoopsTable.learnerKey} = ${learnerKey}
          order by ${sql.raw("rowid asc")}`
    ).map((row) => {
      const snapshot = this.parseSnapshotRecord("learning_loop", row.id, row.snapshot);
      this.assertStringField("learning_loop", row.id, snapshot, "id", row.id);
      this.assertStringField("learning_loop", row.id, snapshot, "workspaceId", row.workspaceId);
      this.assertStringField("learning_loop", row.id, snapshot, "objective", row.objective);
      this.assertStringField("learning_loop", row.id, snapshot, "topic", row.topic);
      this.assertStringField("learning_loop", row.id, snapshot, "phase", row.phase);
      this.assertStringField("learning_loop", row.id, snapshot, "status", row.status);
      this.assertNullableStringField(
        "learning_loop",
        row.id,
        snapshot,
        "masteryProfileId",
        row.masteryProfileId
      );
      this.assertStringField("learning_loop", row.id, snapshot, "createdAt", row.createdAt);
      this.assertStringField("learning_loop", row.id, snapshot, "updatedAt", row.updatedAt);
      return LearningLoop.rehydrate(snapshot as unknown as Parameters<typeof LearningLoop.rehydrate>[0]);
    });
  }

  private loadLearnerEvidenceForLearner(learnerKey: string): readonly LearnerEvidence[] {
    return this.selectAll<LearnerEvidenceRow>(
      sql`select
            ${learnerEvidenceTable.id} as id,
            ${learnerEvidenceTable.workspaceId} as workspaceId,
            ${learnerEvidenceTable.learningLoopId} as learningLoopId,
            ${learnerEvidenceTable.loopUnitId} as loopUnitId,
            ${learnerEvidenceTable.seedId} as seedId,
            ${learnerEvidenceTable.variantId} as variantId,
            ${learnerEvidenceTable.sourceId} as sourceId,
            ${learnerEvidenceTable.responseText} as responseText,
            ${learnerEvidenceTable.confidence} as confidence,
            ${learnerEvidenceTable.correctness} as correctness,
            ${learnerEvidenceTable.supportUsed} as supportUsed,
            ${learnerEvidenceTable.capturedAt} as capturedAt,
            ${learnerEvidenceTable.snapshot} as snapshot
          from ${learnerEvidenceTable}
          where ${learnerEvidenceTable.learnerKey} = ${learnerKey}
          order by ${sql.raw("rowid asc")}`
    ).map((row) => {
      const snapshot = this.parseSnapshotRecord("learner_evidence", row.id, row.snapshot);
      this.assertStringField("learner_evidence", row.id, snapshot, "id", row.id);
      this.assertStringField("learner_evidence", row.id, snapshot, "workspaceId", row.workspaceId);
      this.assertStringField(
        "learner_evidence",
        row.id,
        snapshot,
        "learningLoopId",
        row.learningLoopId
      );
      this.assertNullableStringField(
        "learner_evidence",
        row.id,
        snapshot,
        "loopUnitId",
        row.loopUnitId
      );
      this.assertStringField("learner_evidence", row.id, snapshot, "seedId", row.seedId);
      this.assertStringField("learner_evidence", row.id, snapshot, "variantId", row.variantId);
      this.assertNullableStringField("learner_evidence", row.id, snapshot, "sourceId", row.sourceId);
      this.assertStringField(
        "learner_evidence",
        row.id,
        snapshot,
        "responseText",
        row.responseText
      );
      this.assertNullableStringField(
        "learner_evidence",
        row.id,
        snapshot,
        "confidence",
        row.confidence
      );
      this.assertStringField(
        "learner_evidence",
        row.id,
        snapshot,
        "correctness",
        row.correctness
      );
      this.assertStringField(
        "learner_evidence",
        row.id,
        snapshot,
        "supportUsed",
        row.supportUsed
      );
      this.assertStringField("learner_evidence", row.id, snapshot, "capturedAt", row.capturedAt);
      return LearnerEvidence.rehydrate(
        snapshot as unknown as Parameters<typeof LearnerEvidence.rehydrate>[0]
      );
    });
  }

  private loadMasteryStatesForLearner(learnerKey: string): readonly MasteryState[] {
    return this.selectAll<MasteryStateRow>(
      sql`select
            ${masteryStatesTable.id} as id,
            ${masteryStatesTable.learningLoopId} as learningLoopId,
            ${masteryStatesTable.topic} as topic,
            ${masteryStatesTable.seedId} as seedId,
            ${masteryStatesTable.status} as status,
            ${masteryStatesTable.score} as score,
            ${masteryStatesTable.lastReviewedAt} as lastReviewedAt,
            ${masteryStatesTable.nextReviewAt} as nextReviewAt,
            ${masteryStatesTable.updatedAt} as updatedAt,
            ${masteryStatesTable.snapshot} as snapshot
          from ${masteryStatesTable}
          where ${masteryStatesTable.learnerKey} = ${learnerKey}
          order by ${sql.raw("rowid asc")}`
    ).map((row) => {
      const snapshot = this.parseSnapshotRecord("mastery_state", row.id, row.snapshot);
      this.assertStringField("mastery_state", row.id, snapshot, "id", row.id);
      this.assertNullableStringField(
        "mastery_state",
        row.id,
        snapshot,
        "learningLoopId",
        row.learningLoopId
      );
      this.assertStringField("mastery_state", row.id, snapshot, "topic", row.topic);
      this.assertNullableStringField("mastery_state", row.id, snapshot, "seedId", row.seedId);
      this.assertStringField("mastery_state", row.id, snapshot, "status", row.status);
      this.assertNumberField("mastery_state", row.id, snapshot, "score", row.score);
      this.assertNullableStringField(
        "mastery_state",
        row.id,
        snapshot,
        "lastReviewedAt",
        row.lastReviewedAt
      );
      this.assertNullableStringField(
        "mastery_state",
        row.id,
        snapshot,
        "nextReviewAt",
        row.nextReviewAt
      );
      this.assertStringField("mastery_state", row.id, snapshot, "updatedAt", row.updatedAt);
      return MasteryState.rehydrate(snapshot as unknown as Parameters<typeof MasteryState.rehydrate>[0]);
    });
  }

  private loadLoopUnitsForLearner(learnerKey: string): readonly LoopUnit[] {
    return this.selectAll<LoopUnitRow>(
      sql`select
            ${loopUnitsTable.id} as id,
            ${loopUnitsTable.learningLoopId} as learningLoopId,
            ${loopUnitsTable.focus} as focus,
            ${loopUnitsTable.state} as state,
            ${loopUnitsTable.sequence} as sequence,
            ${loopUnitsTable.createdAt} as createdAt,
            ${loopUnitsTable.snapshot} as snapshot
          from ${loopUnitsTable}
          where ${loopUnitsTable.learnerKey} = ${learnerKey}
          order by ${sql.raw("rowid asc")}`
    ).map((row) => {
      const snapshot = this.parseSnapshotRecord("loop_unit", row.id, row.snapshot);
      this.assertStringField("loop_unit", row.id, snapshot, "id", row.id);
      this.assertStringField("loop_unit", row.id, snapshot, "learningLoopId", row.learningLoopId);
      this.assertStringField("loop_unit", row.id, snapshot, "focus", row.focus);
      this.assertStringField("loop_unit", row.id, snapshot, "state", row.state);
      this.assertNumberField("loop_unit", row.id, snapshot, "sequence", row.sequence);
      this.assertStringField("loop_unit", row.id, snapshot, "createdAt", row.createdAt);
      return LoopUnit.rehydrate(snapshot as unknown as Parameters<typeof LoopUnit.rehydrate>[0]);
    });
  }

  private loadLoopUnitQuestionAssignmentsForLearner(
    learnerKey: string
  ): readonly LoopUnitQuestionAssignment[] {
    return this.selectAll<LoopUnitQuestionAssignmentRow>(
      sql`select
            ${loopUnitQuestionAssignmentsTable.id} as id,
            ${loopUnitQuestionAssignmentsTable.learningLoopId} as learningLoopId,
            ${loopUnitQuestionAssignmentsTable.loopUnitId} as loopUnitId,
            ${loopUnitQuestionAssignmentsTable.variantId} as variantId,
            ${loopUnitQuestionAssignmentsTable.purpose} as purpose,
            ${loopUnitQuestionAssignmentsTable.sequence} as sequence,
            ${loopUnitQuestionAssignmentsTable.createdAt} as createdAt,
            ${loopUnitQuestionAssignmentsTable.snapshot} as snapshot
          from ${loopUnitQuestionAssignmentsTable}
          where ${loopUnitQuestionAssignmentsTable.learnerKey} = ${learnerKey}
          order by ${sql.raw("rowid asc")}`
    ).map((row) => {
      const snapshot = this.parseSnapshotRecord(
        "loop_unit_question_assignment",
        row.id,
        row.snapshot
      );
      this.assertStringField("loop_unit_question_assignment", row.id, snapshot, "id", row.id);
      this.assertStringField(
        "loop_unit_question_assignment",
        row.id,
        snapshot,
        "learningLoopId",
        row.learningLoopId
      );
      this.assertStringField(
        "loop_unit_question_assignment",
        row.id,
        snapshot,
        "loopUnitId",
        row.loopUnitId
      );
      this.assertStringField(
        "loop_unit_question_assignment",
        row.id,
        snapshot,
        "variantId",
        row.variantId
      );
      this.assertStringField(
        "loop_unit_question_assignment",
        row.id,
        snapshot,
        "purpose",
        row.purpose
      );
      this.assertNumberField(
        "loop_unit_question_assignment",
        row.id,
        snapshot,
        "sequence",
        row.sequence
      );
      this.assertStringField(
        "loop_unit_question_assignment",
        row.id,
        snapshot,
        "createdAt",
        row.createdAt
      );
      return LoopUnitQuestionAssignment.rehydrate(
        snapshot as unknown as Parameters<typeof LoopUnitQuestionAssignment.rehydrate>[0]
      );
    });
  }

  private loadQuestionSeedsForLearner(learnerKey: string): readonly QuestionSeed[] {
    return this.selectAll<QuestionSeedRow>(
      sql`select
            ${questionSeedsTable.id} as id,
            ${questionSeedsTable.learningLoopId} as learningLoopId,
            ${questionSeedsTable.topic} as topic,
            ${questionSeedsTable.focus} as focus,
            ${questionSeedsTable.answerModel} as answerModel,
            ${questionSeedsTable.createdAt} as createdAt,
            ${questionSeedsTable.snapshot} as snapshot
          from ${questionSeedsTable}
          where ${questionSeedsTable.learnerKey} = ${learnerKey}
          order by ${sql.raw("rowid asc")}`
    ).map((row) => {
      const snapshot = this.parseSnapshotRecord("question_seed", row.id, row.snapshot);
      this.assertStringField("question_seed", row.id, snapshot, "id", row.id);
      this.assertStringField("question_seed", row.id, snapshot, "learningLoopId", row.learningLoopId);
      this.assertStringField("question_seed", row.id, snapshot, "topic", row.topic);
      this.assertStringField("question_seed", row.id, snapshot, "focus", row.focus);
      this.assertStringField("question_seed", row.id, snapshot, "answerModel", row.answerModel);
      this.assertStringField("question_seed", row.id, snapshot, "createdAt", row.createdAt);
      return QuestionSeed.rehydrate(snapshot as unknown as Parameters<typeof QuestionSeed.rehydrate>[0]);
    });
  }

  private loadQuestionVariantsForLearner(learnerKey: string): readonly QuestionVariant[] {
    return this.selectAll<QuestionVariantRow>(
      sql`select
            ${questionVariantsTable.id} as id,
            ${questionVariantsTable.learningLoopId} as learningLoopId,
            ${questionVariantsTable.seedId} as seedId,
            ${questionVariantsTable.ownerId} as ownerId,
            ${questionVariantsTable.ownerKind} as ownerKind,
            ${questionVariantsTable.mode} as mode,
            ${questionVariantsTable.position} as position,
            ${questionVariantsTable.difficulty} as difficulty,
            ${questionVariantsTable.createdAt} as createdAt,
            ${questionVariantsTable.snapshot} as snapshot
          from ${questionVariantsTable}
          where ${questionVariantsTable.learnerKey} = ${learnerKey}
          order by ${sql.raw("rowid asc")}`
    ).map((row) => {
      const snapshot = this.parseSnapshotRecord("question_variant", row.id, row.snapshot);
      this.assertStringField("question_variant", row.id, snapshot, "id", row.id);
      this.assertStringField(
        "question_variant",
        row.id,
        snapshot,
        "learningLoopId",
        row.learningLoopId
      );
      this.assertStringField("question_variant", row.id, snapshot, "seedId", row.seedId);
      this.assertStringField("question_variant", row.id, snapshot, "ownerId", row.ownerId);
      this.assertStringField("question_variant", row.id, snapshot, "ownerKind", row.ownerKind);
      this.assertStringField("question_variant", row.id, snapshot, "mode", row.mode);
      this.assertNumberField("question_variant", row.id, snapshot, "position", row.position);
      this.assertNullableStringField(
        "question_variant",
        row.id,
        snapshot,
        "difficulty",
        row.difficulty
      );
      this.assertStringField("question_variant", row.id, snapshot, "createdAt", row.createdAt);
      return QuestionVariant.rehydrate(
        snapshot as unknown as Parameters<typeof QuestionVariant.rehydrate>[0]
      );
    });
  }

  private parseSnapshotRecord(
    entityName: string,
    entityId: string,
    snapshotValue: string
  ): Record<string, unknown> {
    try {
      return JSON.parse(snapshotValue) as Record<string, unknown>;
    } catch {
      throw new CanonicalSnapshotFallbackRequiredError(
        entityName,
        entityId,
        "snapshot payload could not be parsed"
      );
    }
  }

  private assertStringField(
    entityName: string,
    entityId: string,
    snapshot: Record<string, unknown>,
    field: string,
    relationalValue: string
  ): void {
    if (snapshot[field] !== relationalValue) {
      throw new CanonicalSnapshotFallbackRequiredError(
        entityName,
        entityId,
        `field ${field} drifted between relational columns and snapshot`
      );
    }
  }

  private assertNullableStringField(
    entityName: string,
    entityId: string,
    snapshot: Record<string, unknown>,
    field: string,
    relationalValue: string | null
  ): void {
    const snapshotValue = snapshot[field];
    if (relationalValue === null) {
      if (snapshotValue !== undefined) {
        throw new CanonicalSnapshotFallbackRequiredError(
          entityName,
          entityId,
          `field ${field} drifted between relational columns and snapshot`
        );
      }
      return;
    }

    if (snapshotValue !== relationalValue) {
      throw new CanonicalSnapshotFallbackRequiredError(
        entityName,
        entityId,
        `field ${field} drifted between relational columns and snapshot`
      );
    }
  }

  private assertNumberField(
    entityName: string,
    entityId: string,
    snapshot: Record<string, unknown>,
    field: string,
    relationalValue: number
  ): void {
    if (snapshot[field] !== relationalValue) {
      throw new CanonicalSnapshotFallbackRequiredError(
        entityName,
        entityId,
        `field ${field} drifted between relational columns and snapshot`
      );
    }
  }
}
