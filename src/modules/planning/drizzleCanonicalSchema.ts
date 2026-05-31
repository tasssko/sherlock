import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const learningLoopsTable = sqliteTable("learning_loops", {
  id: text("id").primaryKey(),
  learnerKey: text("learner_key").notNull(),
  workspaceId: text("workspace_id").notNull(),
  objective: text("objective").notNull(),
  topic: text("topic").notNull(),
  phase: text("phase").notNull(),
  status: text("status").notNull(),
  masteryProfileId: text("mastery_profile_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  snapshot: text("snapshot").notNull()
});

export const learnerEvidenceTable = sqliteTable("learner_evidence", {
  id: text("id").primaryKey(),
  learnerKey: text("learner_key").notNull(),
  workspaceId: text("workspace_id").notNull(),
  learningLoopId: text("learning_loop_id").notNull(),
  loopUnitId: text("loop_unit_id"),
  seedId: text("seed_id").notNull(),
  variantId: text("variant_id").notNull(),
  sourceId: text("source_id"),
  responseText: text("response_text").notNull(),
  confidence: text("confidence"),
  correctness: text("correctness").notNull(),
  supportUsed: text("support_used").notNull(),
  capturedAt: text("captured_at").notNull(),
  snapshot: text("snapshot").notNull()
});

export const masteryStatesTable = sqliteTable("mastery_states", {
  id: text("id").primaryKey(),
  learnerKey: text("learner_key").notNull(),
  learningLoopId: text("learning_loop_id"),
  topic: text("topic").notNull(),
  seedId: text("seed_id"),
  status: text("status").notNull(),
  score: real("score").notNull(),
  lastReviewedAt: text("last_reviewed_at"),
  nextReviewAt: text("next_review_at"),
  updatedAt: text("updated_at").notNull(),
  snapshot: text("snapshot").notNull()
});

export const loopUnitsTable = sqliteTable("loop_units", {
  id: text("id").primaryKey(),
  learnerKey: text("learner_key").notNull(),
  learningLoopId: text("learning_loop_id").notNull(),
  focus: text("focus").notNull(),
  state: text("state").notNull(),
  sequence: integer("sequence").notNull(),
  createdAt: text("created_at").notNull(),
  snapshot: text("snapshot").notNull()
});

export const loopUnitQuestionAssignmentsTable = sqliteTable("loop_unit_question_assignments", {
  id: text("id").primaryKey(),
  learnerKey: text("learner_key").notNull(),
  learningLoopId: text("learning_loop_id").notNull(),
  loopUnitId: text("loop_unit_id").notNull(),
  variantId: text("variant_id").notNull(),
  purpose: text("purpose").notNull(),
  sequence: integer("sequence").notNull(),
  createdAt: text("created_at").notNull(),
  snapshot: text("snapshot").notNull()
});

export const questionSeedsTable = sqliteTable("question_seeds", {
  id: text("id").primaryKey(),
  learnerKey: text("learner_key").notNull(),
  learningLoopId: text("learning_loop_id").notNull(),
  topic: text("topic").notNull(),
  focus: text("focus").notNull(),
  answerModel: text("answer_model").notNull(),
  createdAt: text("created_at").notNull(),
  snapshot: text("snapshot").notNull()
});

export const questionVariantsTable = sqliteTable("question_variants", {
  id: text("id").primaryKey(),
  learnerKey: text("learner_key").notNull(),
  learningLoopId: text("learning_loop_id").notNull(),
  seedId: text("seed_id").notNull(),
  ownerId: text("owner_id").notNull(),
  ownerKind: text("owner_kind").notNull(),
  mode: text("mode").notNull(),
  position: integer("position").notNull(),
  difficulty: text("difficulty"),
  createdAt: text("created_at").notNull(),
  snapshot: text("snapshot").notNull()
});

// SQLite-only bootstrap retained during the compatibility period.
export const canonicalLearningTableBootstrapSql = `
  create table if not exists learning_loops (
    id text primary key,
    learner_key text not null,
    workspace_id text not null,
    objective text not null,
    topic text not null,
    phase text not null,
    status text not null,
    mastery_profile_id text,
    created_at text not null,
    updated_at text not null,
    snapshot text not null
  );
  create table if not exists learner_evidence (
    id text primary key,
    learner_key text not null,
    workspace_id text not null,
    learning_loop_id text not null,
    loop_unit_id text,
    seed_id text not null,
    variant_id text not null,
    source_id text,
    response_text text not null,
    confidence text,
    correctness text not null,
    support_used text not null,
    captured_at text not null,
    snapshot text not null
  );
  create table if not exists mastery_states (
    id text primary key,
    learner_key text not null,
    learning_loop_id text,
    topic text not null,
    seed_id text,
    status text not null,
    score real not null,
    last_reviewed_at text,
    next_review_at text,
    updated_at text not null,
    snapshot text not null
  );
  create table if not exists loop_units (
    id text primary key,
    learner_key text not null,
    learning_loop_id text not null,
    focus text not null,
    state text not null,
    sequence integer not null,
    created_at text not null,
    snapshot text not null
  );
  create table if not exists loop_unit_question_assignments (
    id text primary key,
    learner_key text not null,
    learning_loop_id text not null,
    loop_unit_id text not null,
    variant_id text not null,
    purpose text not null,
    sequence integer not null,
    created_at text not null,
    snapshot text not null
  );
  create table if not exists question_seeds (
    id text primary key,
    learner_key text not null,
    learning_loop_id text not null,
    topic text not null,
    focus text not null,
    answer_model text not null,
    created_at text not null,
    snapshot text not null
  );
  create table if not exists question_variants (
    id text primary key,
    learner_key text not null,
    learning_loop_id text not null,
    seed_id text not null,
    owner_id text not null,
    owner_kind text not null,
    mode text not null,
    position integer not null,
    difficulty text,
    created_at text not null,
    snapshot text not null
  );
`;

export const canonicalLearningColumnDefinitions = {
  learning_loops: {
    workspace_id: "text not null default ''",
    objective: "text not null default ''",
    topic: "text not null default ''",
    phase: "text not null default 'initial-assessment'",
    status: "text not null default 'active'",
    mastery_profile_id: "text",
    created_at: "text not null default ''",
    updated_at: "text not null default ''"
  },
  learner_evidence: {
    workspace_id: "text not null default ''",
    loop_unit_id: "text",
    seed_id: "text not null default ''",
    variant_id: "text not null default ''",
    source_id: "text",
    response_text: "text not null default ''",
    confidence: "text",
    correctness: "text not null default 'incorrect'",
    support_used: "text not null default 'independent'",
    captured_at: "text not null default ''"
  },
  mastery_states: {
    topic: "text not null default ''",
    seed_id: "text",
    status: "text not null default 'developing'",
    score: "real not null default 0",
    last_reviewed_at: "text",
    next_review_at: "text",
    updated_at: "text not null default ''"
  },
  loop_units: {
    focus: "text not null default ''",
    state: "text not null default 'locked'",
    sequence: "integer not null default 0",
    created_at: "text not null default ''"
  },
  loop_unit_question_assignments: {
    purpose: "text not null default 'quick_check'",
    sequence: "integer not null default 0",
    created_at: "text not null default ''"
  },
  question_seeds: {
    topic: "text not null default ''",
    focus: "text not null default ''",
    answer_model: "text not null default ''",
    created_at: "text not null default ''"
  },
  question_variants: {
    owner_id: "text not null default ''",
    owner_kind: "text not null default 'loop_quick_check'",
    mode: "text not null default 'guided'",
    position: "integer not null default 0",
    difficulty: "text",
    created_at: "text not null default ''"
  }
} as const;
