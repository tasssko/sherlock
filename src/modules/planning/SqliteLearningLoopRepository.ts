import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ActiveReviewSession } from "../../domain/learning/ActiveReviewSession.js";
import { Assessment, Attempt, Evaluation } from "../../domain/learning/Assessment.js";
import {
  KnowledgeGap,
  LearningLoop,
  MasteryProfile
} from "../../domain/learning/LearningLoop.js";
import { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
import { RuntimeTrace } from "../runtime/RuntimeTrace.js";
import type { Artifact, ArtifactType } from "../../domain/primitives/Artifact.js";
import { Artifact as ArtifactEntity } from "../../domain/primitives/Artifact.js";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import { Task as TaskEntity } from "../../domain/primitives/Task.js";
import type { WorkPlan } from "../../domain/primitives/WorkPlan.js";
import { WorkPlan as WorkPlanEntity } from "../../domain/primitives/WorkPlan.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import { Workspace as WorkspaceEntity } from "../../domain/primitives/Workspace.js";
import type { AssessmentId, LearningLoopId, PracticeActivityId } from "../../domain/primitives/ids.js";
import type {
  MasterDataUploadResponse,
  UploadMasterDataCommand
} from "../../domain/study/MasterDataUpload.js";
import { LearnerWorkspaceKey } from "./LearnerWorkspaceKey.js";
import {
  createLearningLoopRecord,
  type LearningLoopRecord,
  type LearningLoopRepository,
  type LocatedLearningLoopRecord
} from "./LearningLoopRepository.js";

function parseSnapshot<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function ensureDirectory(pathname: string): void {
  if (pathname === ":memory:") {
    return;
  }

  mkdirSync(dirname(pathname), { recursive: true });
}

export class SqliteLearningLoopRepository implements LearningLoopRepository {
  private readonly database: DatabaseSync;

  constructor(pathname = process.env.SHERLOCK_DB_PATH ?? "./data/sherlock.sqlite") {
    ensureDirectory(pathname);
    this.database = new DatabaseSync(pathname);
    this.migrate();
  }

  findRecord(key: LearnerWorkspaceKey): LearningLoopRecord | undefined {
    const workspaceRow = this.database
      .prepare("select snapshot from workspaces where learner_key = ?")
      .get(key.value) as { snapshot: string } | undefined;

    if (!workspaceRow) {
      return undefined;
    }

    const workspace = WorkspaceEntity.rehydrate(parseSnapshot(workspaceRow.snapshot));
    const tasks = this.database
      .prepare("select snapshot from tasks where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) => TaskEntity.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot)));
    const workPlans = this.database
      .prepare("select snapshot from work_plans where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) =>
        WorkPlanEntity.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot))
      );
    const artifacts = this.database
      .prepare("select snapshot from artifacts where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) =>
        ArtifactEntity.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot))
      ) as Artifact<unknown, ArtifactType>[];
    const events = this.database
      .prepare("select snapshot from events where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) => parseSnapshot<DomainEvent>((row as { snapshot: string }).snapshot));
    const learningLoops = this.database
      .prepare("select snapshot from learning_loops where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) =>
        LearningLoop.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot))
      );
    const assessments = this.database
      .prepare("select snapshot from assessments where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) => Assessment.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot)));
    const attempts = this.database
      .prepare("select snapshot from attempts where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) => Attempt.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot)));
    const evaluations = this.database
      .prepare("select snapshot from evaluations where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) =>
        Evaluation.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot))
      );
    const knowledgeGaps = this.database
      .prepare("select snapshot from knowledge_gaps where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) =>
        KnowledgeGap.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot))
      );
    const masteryProfiles = this.database
      .prepare("select snapshot from mastery_profiles where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) =>
        MasteryProfile.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot))
      );
    const practiceActivities = this.database
      .prepare("select snapshot from practice_activities where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) =>
        PracticeActivity.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot))
      );
    const activeReviewSessions = this.database
      .prepare("select snapshot from active_review_sessions where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) =>
        ActiveReviewSession.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot))
      );
    const runtimeTraces = this.database
      .prepare("select snapshot from runtime_traces where learner_key = ? order by rowid asc")
      .all(key.value)
      .map((row) => RuntimeTrace.rehydrate(parseSnapshot((row as { snapshot: string }).snapshot)));

    return createLearningLoopRecord({
      workspace,
      tasks,
      workPlans,
      artifacts,
      events,
      learningLoops,
      assessments,
      attempts,
      evaluations,
      knowledgeGaps,
      masteryProfiles,
      practiceActivities,
      activeReviewSessions,
      runtimeTraces
    });
  }

  findRecordByAssessmentId(assessmentId: AssessmentId): LocatedLearningLoopRecord | undefined {
    const row = this.database
      .prepare("select learner_key from assessments where id = ?")
      .get(assessmentId) as { learner_key: string } | undefined;

    if (!row) {
      return undefined;
    }

    const key = LearnerWorkspaceKey.fromValue(row.learner_key);
    const record = this.findRecord(key);

    return record ? { key, record } : undefined;
  }

  findRecordByLearningLoopId(learningLoopId: LearningLoopId): LocatedLearningLoopRecord | undefined {
    const row = this.database
      .prepare("select learner_key from learning_loops where id = ?")
      .get(learningLoopId) as { learner_key: string } | undefined;

    if (!row) {
      return undefined;
    }

    const key = LearnerWorkspaceKey.fromValue(row.learner_key);
    const record = this.findRecord(key);

    return record ? { key, record } : undefined;
  }

  findRecordByPracticeActivityId(
    practiceActivityId: PracticeActivityId
  ): LocatedLearningLoopRecord | undefined {
    const row = this.database
      .prepare("select learner_key from practice_activities where id = ?")
      .get(practiceActivityId) as { learner_key: string } | undefined;

    if (!row) {
      return undefined;
    }

    const key = LearnerWorkspaceKey.fromValue(row.learner_key);
    const record = this.findRecord(key);

    return record ? { key, record } : undefined;
  }

  findMasterDataByTopic(topic: string): { source: MasterDataSource; items: readonly MasterDataItem[] }[] {
    const rows = this.database
      .prepare(
        `select source_snapshot, item_snapshot
         from master_data_items
         where lower(topic) = lower(?)
         order by source_name asc, rowid asc`
      )
      .all(topic) as { source_snapshot: string; item_snapshot: string }[];

    const bySource = new Map<string, { source: MasterDataSource; items: MasterDataItem[] }>();

    for (const row of rows) {
      const source = MasterDataSource.rehydrate(parseSnapshot(row.source_snapshot));
      const item = MasterDataItem.rehydrate(parseSnapshot(row.item_snapshot));
      const existing = bySource.get(source.id);

      if (existing) {
        existing.items.push(item);
      } else {
        bySource.set(source.id, {
          source,
          items: [item]
        });
      }
    }

    return [...bySource.values()];
  }

  registerMasterData(command: UploadMasterDataCommand): MasterDataUploadResponse {
    const items: MasterDataItem[] = [];
    const temporarySource = MasterDataSource.create(command.sourceName, []);

    for (const item of command.items) {
      items.push(MasterDataItem.create(temporarySource.id, item));
    }

    const source = MasterDataSource.create(command.sourceName, items.map((item) => item.id));

    this.database.exec("begin");
    try {
      this.database
        .prepare("insert into master_data_sources (id, name, snapshot) values (?, ?, ?)")
        .run(source.id, source.name, JSON.stringify(source.toSnapshot()));

      const insertItem = this.database.prepare(
        `insert into master_data_items
         (id, source_id, source_name, topic, source_snapshot, item_snapshot)
         values (?, ?, ?, ?, ?, ?)`
      );
      for (const item of items) {
        insertItem.run(
          item.id,
          source.id,
          source.name,
          item.topic,
          JSON.stringify(source.toSnapshot()),
          JSON.stringify(item.toSnapshot())
        );
      }

      this.database.exec("commit");
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }

    return {
      source: source.toSnapshot(),
      items: items.map((item) => item.toSnapshot())
    };
  }

  saveRecord(key: LearnerWorkspaceKey, record: LearningLoopRecord): void {
    this.database.exec("begin");
    try {
      this.database.prepare("delete from workspaces where learner_key = ?").run(key.value);
      this.database.prepare("delete from tasks where learner_key = ?").run(key.value);
      this.database.prepare("delete from work_plans where learner_key = ?").run(key.value);
      this.database.prepare("delete from artifacts where learner_key = ?").run(key.value);
      this.database.prepare("delete from events where learner_key = ?").run(key.value);
      this.database.prepare("delete from learning_loops where learner_key = ?").run(key.value);
      this.database.prepare("delete from assessments where learner_key = ?").run(key.value);
      this.database.prepare("delete from attempts where learner_key = ?").run(key.value);
      this.database.prepare("delete from evaluations where learner_key = ?").run(key.value);
      this.database.prepare("delete from knowledge_gaps where learner_key = ?").run(key.value);
      this.database.prepare("delete from mastery_profiles where learner_key = ?").run(key.value);
      this.database.prepare("delete from practice_activities where learner_key = ?").run(key.value);
      this.database.prepare("delete from active_review_sessions where learner_key = ?").run(key.value);
      this.database.prepare("delete from runtime_traces where learner_key = ?").run(key.value);

      this.database
        .prepare("insert into workspaces (id, learner_key, snapshot) values (?, ?, ?)")
        .run(record.workspace.id, key.value, JSON.stringify(record.workspace.toSnapshot()));

      const insertTask = this.database.prepare(
        "insert into tasks (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const task of record.tasks) {
        insertTask.run(task.id, key.value, JSON.stringify(task.toSnapshot()));
      }

      const insertWorkPlan = this.database.prepare(
        "insert into work_plans (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const workPlan of record.workPlans) {
        insertWorkPlan.run(workPlan.id, key.value, JSON.stringify(workPlan.toSnapshot()));
      }

      const insertArtifact = this.database.prepare(
        "insert into artifacts (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const artifact of record.artifacts) {
        insertArtifact.run(artifact.id, key.value, JSON.stringify(artifact.toSnapshot()));
      }

      const insertEvent = this.database.prepare(
        "insert into events (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const event of record.events) {
        insertEvent.run(event.id, key.value, JSON.stringify(event));
      }

      const insertLoop = this.database.prepare(
        "insert into learning_loops (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const loop of record.learningLoops) {
        insertLoop.run(loop.id, key.value, JSON.stringify(loop.toSnapshot()));
      }

      const insertAssessment = this.database.prepare(
        "insert into assessments (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const assessment of record.assessments) {
        insertAssessment.run(assessment.id, key.value, JSON.stringify(assessment.toSnapshot()));
      }

      const insertAttempt = this.database.prepare(
        "insert into attempts (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const attempt of record.attempts) {
        insertAttempt.run(attempt.id, key.value, JSON.stringify(attempt.toSnapshot()));
      }

      const insertEvaluation = this.database.prepare(
        "insert into evaluations (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const evaluation of record.evaluations) {
        insertEvaluation.run(evaluation.id, key.value, JSON.stringify(evaluation.toSnapshot()));
      }

      const insertGap = this.database.prepare(
        "insert into knowledge_gaps (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const gap of record.knowledgeGaps) {
        insertGap.run(gap.id, key.value, JSON.stringify(gap.toSnapshot()));
      }

      const insertMastery = this.database.prepare(
        "insert into mastery_profiles (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const masteryProfile of record.masteryProfiles) {
        insertMastery.run(
          masteryProfile.id,
          key.value,
          JSON.stringify(masteryProfile.toSnapshot())
        );
      }

      const insertPracticeActivity = this.database.prepare(
        `insert into practice_activities (id, learner_key, learning_loop_id, snapshot)
         values (?, ?, ?, ?)`
      );
      for (const practiceActivity of record.practiceActivities) {
        insertPracticeActivity.run(
          practiceActivity.id,
          key.value,
          practiceActivity.learningLoopId,
          JSON.stringify(practiceActivity.toSnapshot())
        );
      }

      const insertActiveReviewSession = this.database.prepare(
        `insert into active_review_sessions (id, learner_key, practice_activity_id, learning_loop_id, snapshot)
         values (?, ?, ?, ?, ?)`
      );
      for (const activeReviewSession of record.activeReviewSessions) {
        const snapshot = activeReviewSession.toSnapshot();
        insertActiveReviewSession.run(
          snapshot.id,
          key.value,
          snapshot.practiceActivityId,
          snapshot.learningLoopId,
          JSON.stringify(snapshot)
        );
      }

      const insertRuntimeTrace = this.database.prepare(
        "insert into runtime_traces (id, learner_key, snapshot) values (?, ?, ?)"
      );
      for (const runtimeTrace of record.runtimeTraces) {
        const snapshot = runtimeTrace.toSnapshot();
        insertRuntimeTrace.run(snapshot.id, key.value, JSON.stringify(snapshot));
      }

      this.database.exec("commit");
    } catch (error) {
      this.database.exec("rollback");
      throw error;
    }
  }

  private migrate(): void {
    this.database.exec(`
      create table if not exists workspaces (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists tasks (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists work_plans (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists artifacts (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists events (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists learning_loops (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists assessments (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists attempts (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists evaluations (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists knowledge_gaps (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists mastery_profiles (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists practice_activities (
        id text primary key,
        learner_key text not null,
        learning_loop_id text not null,
        snapshot text not null
      );
      create table if not exists active_review_sessions (
        id text primary key,
        learner_key text not null,
        practice_activity_id text not null,
        learning_loop_id text not null,
        snapshot text not null
      );
      create table if not exists runtime_traces (
        id text primary key,
        learner_key text not null,
        snapshot text not null
      );
      create table if not exists master_data_sources (
        id text primary key,
        name text not null,
        snapshot text not null
      );
      create table if not exists master_data_items (
        id text primary key,
        source_id text not null,
        source_name text not null,
        topic text not null,
        source_snapshot text not null,
        item_snapshot text not null
      );
    `);
  }
}
