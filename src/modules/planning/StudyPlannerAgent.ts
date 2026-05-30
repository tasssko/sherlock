import { agentCanUseCapability, createAgent, type Agent } from "../../domain/primitives/Agent.js";
import { capabilityCatalog } from "../../domain/primitives/Capability.js";
import type { ContextAssumption } from "../../domain/primitives/Context.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import { policies } from "../../domain/primitives/Policy.js";
import type {
  StudyDay,
  StudyPlanArtifactContent,
  StudyPlanningContext
} from "../../domain/study/StudyPlanning.js";

export interface StudyPlannerOutput {
  assumptions: readonly ContextAssumption[];
  decisions: readonly string[];
  childTaskSummaries: readonly string[];
  artifactContent: StudyPlanArtifactContent;
}

export function createStudyPlannerAgent(): Agent {
  return createAgent({
    role: "study-planner",
    purpose: "Build bounded weekly study plans from learner context and time limits.",
    capabilities: [
      capabilityCatalog.generateStudyPlan.id,
      capabilityCatalog.createChildTask.id,
      capabilityCatalog.createArtifact.id
    ],
    policies: policies.map((policy) => policy.id)
  });
}

export function generateStudyPlan(
  agent: Agent,
  context: StudyPlanningContext
): Result<StudyPlannerOutput> {
  if (!agentCanUseCapability(agent, capabilityCatalog.generateStudyPlan.id)) {
    return err({
      code: "POLICY_VIOLATION",
      message: `Agent ${agent.id} cannot use capability ${capabilityCatalog.generateStudyPlan.id}.`
    });
  }

  const activeDays = Object.entries(context.availableMinutesByDay)
    .filter(([, minutes]) => minutes > 0)
    .map(([day]) => day as StudyDay);

  if (activeDays.length === 0) {
    return err({
      code: "VALIDATION_ERROR",
      message: "At least one study day must have available minutes."
    });
  }

  const fallbackTopic = context.focusTopics[0];
  if (!fallbackTopic) {
    return err({
      code: "VALIDATION_ERROR",
      message: "At least one focus topic is required to generate a study plan."
    });
  }

  const assumptions: readonly ContextAssumption[] = [
    {
      id: "assumption_spaced_repetition",
      statement: "Repeated topics across the week are allowed to reinforce retention."
    },
    {
      id: "assumption_single_session",
      statement: "Available minutes on each day can be used as one focused study session."
    },
    {
      id: "assumption_progress_check",
      statement: "Each session ends with a short retrieval or self-check task."
    }
  ];

  const sessions = activeDays.map((day, index) => {
    const minutes = context.availableMinutesByDay[day];
    const topic = context.focusTopics[index % context.focusTopics.length] ?? fallbackTopic;
    const longSession = minutes >= 60;

    return {
      day,
      minutes,
      topic,
      activity: longSession
        ? `Retrieve prior knowledge, practise ${topic}, then finish with a mixed recap.`
        : `Recap key ideas in ${topic}, complete one focused practice set, then self-check.`,
      outcome: longSession
        ? `Leave the session with a worked example and one correction note for ${topic}.`
        : `Leave the session with one verified success criterion for ${topic}.`
    };
  });

  const checkpoints = [
    `Midweek check: explain one idea from ${context.focusTopics[0]} without notes.`,
    `Weekend check: complete a mixed review covering ${context.focusTopics.join(", ")}.`
  ];

  const decisions = [
    "Allocated one primary topic to each active study day.",
    "Used longer sessions for consolidation and mixed review.",
    "Kept every session outcome explicit so the learner can judge completion."
  ];

  return ok({
    assumptions,
    decisions,
    childTaskSummaries: context.focusTopics.map(
      (topic) => `Prepare a focused ${topic} study block with retrieval and self-check.`
    ),
    artifactContent: {
      summary: `${context.learnerName} will follow a one-week plan focused on ${context.focusTopics.join(
        ", "
      )}.`,
      sessions,
      checkpoints,
      notes: [
        "Keep materials ready before each session to protect the short weekday slots.",
        "If a session is missed, roll it into Saturday before starting new work."
      ]
    }
  });
}
