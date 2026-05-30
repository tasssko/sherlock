import type {
  KnowledgeGapSnapshot,
  LearningLoopSnapshot,
  MasteryProfileSnapshot
} from "../learning/LearningLoop.js";
import type { AgentSnapshot } from "../primitives/Agent.js";
import type { ArtifactSnapshot } from "../primitives/Artifact.js";
import type { DomainEvent } from "../primitives/Event.js";
import type { TaskGraphSnapshot } from "../primitives/TaskGraph.js";
import type { TaskSnapshot } from "../primitives/Task.js";
import type { WorkPlanSnapshot } from "../primitives/WorkPlan.js";
import type { WorkspaceSnapshot } from "../primitives/Workspace.js";
import type { TaskId } from "../primitives/ids.js";
import type { StudyDay } from "./StudySchedule.js";

export interface CreateStudyPlanCommand {
  learnerName: string;
  yearGroup: string;
  objective: string;
  focusTopics: readonly string[];
  availableMinutesByDay: Record<StudyDay, number>;
  workspaceLabel?: string;
}

export interface StudySession {
  day: StudyDay;
  minutes: number;
  topic: string;
  activity: string;
  outcome: string;
}

export interface StudyPlanArtifactContent {
  summary: string;
  sessions: readonly StudySession[];
  checkpoints: readonly string[];
  notes: readonly string[];
}

export interface StudyPlanResponse {
  workspace: WorkspaceSnapshot;
  learningLoop: LearningLoopSnapshot;
  agent: AgentSnapshot;
  tasks: readonly TaskSnapshot[];
  taskGraph: TaskGraphSnapshot;
  blockedTaskIds: readonly TaskId[];
  workPlan: WorkPlanSnapshot;
  artifact: ArtifactSnapshot<StudyPlanArtifactContent, "study-plan">;
  knowledgeGaps: readonly KnowledgeGapSnapshot[];
  masteryProfile?: MasteryProfileSnapshot;
  events: readonly DomainEvent[];
}
