import type { Agent } from "../primitives/Agent.js";
import type { Artifact } from "../primitives/Artifact.js";
import type { OperationContext } from "../primitives/Context.js";
import type { DomainEvent } from "../primitives/Event.js";
import type { TaskGraph } from "../primitives/TaskGraph.js";
import type { Task } from "../primitives/Task.js";
import type { WorkPlan } from "../primitives/WorkPlan.js";
import type { Workspace } from "../primitives/Workspace.js";
import type { TaskId } from "../primitives/ids.js";

export const studyDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
] as const;

export type StudyDay = (typeof studyDays)[number];

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

export interface StudyPlanningContext
  extends OperationContext<"learner" | "objective" | "schedule" | "topics"> {
  learnerName: string;
  yearGroup: string;
  objective: string;
  focusTopics: readonly string[];
  availableMinutesByDay: Record<StudyDay, number>;
}

export interface StudyPlanResponse {
  workspace: Workspace;
  agent: Agent;
  tasks: readonly Task[];
  taskGraph: TaskGraph;
  blockedTaskIds: readonly TaskId[];
  workPlan: WorkPlan;
  artifact: Artifact<StudyPlanArtifactContent, "study-plan">;
  events: readonly DomainEvent[];
}

