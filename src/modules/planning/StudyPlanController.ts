import type { Controller } from "../../domain/primitives/Controller.js";
import type { ContextFact } from "../../domain/primitives/Context.js";
import {
  agentInvokedEvent,
  artifactGeneratedEvent,
  assumptionRecordedEvent,
  taskCreatedEvent,
  taskStateChangedEvent,
  workPlanCreatedEvent,
  type DomainEvent
} from "../../domain/primitives/Event.js";
import { createTaskGraph, listBlockedTaskIds } from "../../domain/primitives/TaskGraph.js";
import {
  createTask,
  transitionTask,
  withTaskChildren,
  withTaskOutput,
  type Task
} from "../../domain/primitives/Task.js";
import {
  createWorkspace,
  withWorkspaceArtifactIds,
  withWorkspaceEventIds,
  withWorkspaceTaskIds,
  withWorkspaceWorkPlanIds,
  type Workspace
} from "../../domain/primitives/Workspace.js";
import { capabilityCatalog } from "../../domain/primitives/Capability.js";
import { createArtifact } from "../../domain/primitives/Artifact.js";
import { linkArtifactToWorkPlan, createWorkPlan } from "../../domain/primitives/WorkPlan.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  CreateStudyPlanCommand,
  StudyPlanResponse,
  StudyPlanningContext
} from "../../domain/study/StudyPlanning.js";
import { createStudyPlannerAgent, generateStudyPlan } from "./StudyPlannerAgent.js";

interface WorkspaceSnapshot {
  workspace: Workspace;
  response: StudyPlanResponse;
}

class InMemoryWorkspaceRegistry {
  private readonly byLearnerKey = new Map<string, WorkspaceSnapshot>();

  find(learnerKey: string): WorkspaceSnapshot | undefined {
    return this.byLearnerKey.get(learnerKey);
  }

  save(learnerKey: string, snapshot: WorkspaceSnapshot): void {
    this.byLearnerKey.set(learnerKey, snapshot);
  }
}

export class StudyPlanController
  implements Controller<CreateStudyPlanCommand, StudyPlanResponse>
{
  constructor(private readonly registry = new InMemoryWorkspaceRegistry()) {}

  execute(command: CreateStudyPlanCommand): Result<StudyPlanResponse> {
    const learnerKey = `${command.learnerName.toLowerCase()}::${command.yearGroup.toLowerCase()}`;
    const existing = this.registry.find(learnerKey);

    let workspace =
      existing?.workspace ??
      createWorkspace({
        title: command.workspaceLabel ?? `${command.learnerName} Study Workspace`,
        learner: {
          name: command.learnerName,
          yearGroup: command.yearGroup,
          availableMinutesByDay: command.availableMinutesByDay
        },
        activeObjective: command.objective
      });

    const facts: readonly ContextFact<
      "learner" | "objective" | "schedule" | "topics"
    >[] = [
      { label: "learner", value: `${command.learnerName} (${command.yearGroup})` },
      { label: "objective", value: command.objective },
      {
        label: "topics",
        value: command.focusTopics.join(", ")
      },
      {
        label: "schedule",
        value: Object.entries(command.availableMinutesByDay)
          .filter(([, minutes]) => minutes > 0)
          .map(([day, minutes]) => `${day}: ${minutes}m`)
          .join("; ")
      }
    ];

    const planningContext: StudyPlanningContext = {
      learnerName: command.learnerName,
      yearGroup: command.yearGroup,
      objective: command.objective,
      focusTopics: command.focusTopics,
      availableMinutesByDay: command.availableMinutesByDay,
      knownFacts: facts,
      assumptions: [],
      metadata: {
        learnerName: command.learnerName,
        objective: command.objective,
        topics: command.focusTopics,
        yearGroup: command.yearGroup
      }
    };

    const parentTaskBase = createTask({
      workspaceId: workspace.id,
      title: `Create weekly study plan for ${command.learnerName}`,
      kind: "study-plan",
      input: {
        objective: command.objective,
        facts: facts.map((fact) => `${fact.label}: ${fact.value}`)
      }
    });

    let parentTask = parentTaskBase;
    const events: DomainEvent[] = [taskCreatedEvent(workspace.id, parentTask.id, parentTask.title, parentTask.state)];

    const parentPlanned = transitionTask(parentTask, "planned", new Set());
    if (!parentPlanned.ok) {
      return parentPlanned;
    }
    events.push(taskStateChangedEvent(workspace.id, parentTask.id, parentTask.state, parentPlanned.value.state));
    parentTask = parentPlanned.value;

    const childTasks = command.focusTopics.map((topic) =>
      createTask({
        workspaceId: workspace.id,
        title: `Plan ${topic} study block`,
        kind: "topic-plan",
        parentTaskId: parentTask.id,
        input: {
          objective: `Prepare a study session for ${topic}.`,
          facts: facts.map((fact) => `${fact.label}: ${fact.value}`),
          topic
        }
      })
    );

    parentTask = withTaskChildren(
      parentTask,
      childTasks.map((task) => task.id)
    );

    for (const childTask of childTasks) {
      events.push(taskCreatedEvent(workspace.id, childTask.id, childTask.title, childTask.state));
    }

    const workPlan = createWorkPlan({
      workspaceId: workspace.id,
      objective: command.objective,
      facts,
      assumptions: [],
      requiredCapabilities: [
        capabilityCatalog.generateStudyPlan.id,
        capabilityCatalog.createChildTask.id,
        capabilityCatalog.createArtifact.id
      ],
      stages: childTasks.map((childTask, index) => ({
        id: `stage_${index + 1}`,
        title: command.focusTopics[index] ?? `Topic ${index + 1}`,
        objective: `Create and complete the ${command.focusTopics[index] ?? "topic"} study block.`,
        taskIds: [childTask.id]
      })),
      acceptanceCriteria: [
        {
          id: "acceptance_structured_response",
          description: "Return a structured workspace snapshot rather than free text."
        },
        {
          id: "acceptance_visible_lifecycle",
          description: "Expose tasks, work plan, artifact, and events together."
        }
      ]
    });

    events.push(workPlanCreatedEvent(workspace.id, workPlan.id, workPlan.objective));

    const agent = createStudyPlannerAgent();
    events.push(agentInvokedEvent(workspace.id, agent.id, agent.role));

    const generated = generateStudyPlan(agent, planningContext);
    if (!generated.ok) {
      return generated;
    }

    for (const assumption of generated.value.assumptions) {
      events.push(assumptionRecordedEvent(workspace.id, assumption.statement));
    }

    const plannedWorkPlan = {
      ...workPlan,
      assumptions: generated.value.assumptions
    };

    const artifact = createArtifact({
      workspaceId: workspace.id,
      taskId: parentTask.id,
      type: "study-plan",
      content: generated.value.artifactContent,
      provenance: {
        controller: "StudyPlanController",
        taskId: parentTask.id,
        agentId: agent.id,
        facts: facts.map((fact) => `${fact.label}: ${fact.value}`),
        assumptions: generated.value.assumptions.map((assumption) => assumption.statement),
        decisions: generated.value.decisions
      }
    });

    events.push(artifactGeneratedEvent(workspace.id, artifact.id, artifact.type, parentTask.id));

    const completedChildTaskIds = new Set<typeof childTasks[number]["id"]>();
    const finalChildTasks: Task[] = [];

    for (const [index, childTask] of childTasks.entries()) {
      const ready = transitionTask(childTask, "planned", completedChildTaskIds);
      if (!ready.ok) {
        return ready;
      }
      events.push(taskStateChangedEvent(workspace.id, childTask.id, childTask.state, ready.value.state));

      const running = transitionTask(ready.value, "ready", completedChildTaskIds);
      if (!running.ok) {
        return running;
      }
      events.push(taskStateChangedEvent(workspace.id, childTask.id, ready.value.state, running.value.state));

      const active = transitionTask(running.value, "running", completedChildTaskIds);
      if (!active.ok) {
        return active;
      }
      events.push(taskStateChangedEvent(workspace.id, childTask.id, running.value.state, active.value.state));

      const outputTask = withTaskOutput(active.value, {
        artifactIds: [],
        summary:
          generated.value.childTaskSummaries[index] ??
          "Prepare a focused study block with retrieval and self-check."
      });

      const completed = transitionTask(outputTask, "completed", completedChildTaskIds);
      if (!completed.ok) {
        return completed;
      }
      events.push(taskStateChangedEvent(workspace.id, childTask.id, outputTask.state, completed.value.state));

      completedChildTaskIds.add(childTask.id);
      finalChildTasks.push(completed.value);
    }

    const parentReady = transitionTask(parentTask, "ready", new Set());
    if (!parentReady.ok) {
      return parentReady;
    }
    events.push(taskStateChangedEvent(workspace.id, parentTask.id, parentTask.state, parentReady.value.state));

    const parentRunning = transitionTask(parentReady.value, "running", new Set());
    if (!parentRunning.ok) {
      return parentRunning;
    }
    events.push(
      taskStateChangedEvent(workspace.id, parentTask.id, parentReady.value.state, parentRunning.value.state)
    );

    const parentWithOutput = withTaskOutput(parentRunning.value, {
      artifactIds: [artifact.id],
      summary: generated.value.artifactContent.summary
    });

    const parentCompleted = transitionTask(parentWithOutput, "completed", new Set());
    if (!parentCompleted.ok) {
      return parentCompleted;
    }
    events.push(
      taskStateChangedEvent(
        workspace.id,
        parentTask.id,
        parentWithOutput.state,
        parentCompleted.value.state
      )
    );

    const tasks = [parentCompleted.value, ...finalChildTasks];
    const taskGraph = createTaskGraph(parentCompleted.value.id, tasks);
    if (!taskGraph.ok) {
      return taskGraph;
    }

    const linkedWorkPlan = linkArtifactToWorkPlan(plannedWorkPlan, artifact.id);

    workspace = withWorkspaceTaskIds(
      workspace,
      tasks.map((task) => task.id)
    );
    workspace = withWorkspaceWorkPlanIds(workspace, [linkedWorkPlan.id]);
    workspace = withWorkspaceArtifactIds(workspace, [artifact.id]);
    workspace = withWorkspaceEventIds(
      workspace,
      events.map((event) => event.id)
    );

    const response: StudyPlanResponse = {
      workspace,
      agent,
      tasks,
      taskGraph: taskGraph.value,
      blockedTaskIds: listBlockedTaskIds(taskGraph.value, tasks),
      workPlan: linkedWorkPlan,
      artifact,
      events
    };

    this.registry.save(learnerKey, {
      workspace,
      response
    });

    return ok(response);
  }
}

export function mapDomainErrorToHttpStatus(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "POLICY_VIOLATION":
      return 403;
    case "STATE_CONFLICT":
      return 409;
    case "VALIDATION_ERROR":
      return 400;
    default:
      return 500;
  }
}
