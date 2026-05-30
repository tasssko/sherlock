import { Agent } from "../../domain/primitives/Agent.js";
import { capabilityCatalog } from "../../domain/primitives/Capability.js";
import type { ContextAssumption, StudyPlanningContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import { evaluatePolicies, policies } from "../../domain/primitives/Policy.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { StudyPlanArtifactContent } from "../../domain/study/StudyPlanning.js";
import type { StudyDay } from "../../domain/study/StudySchedule.js";

export interface StudyPlannerOutput {
  assumptions: readonly ContextAssumption[];
  decisions: readonly string[];
  childTaskSummaries: readonly string[];
  artifactContent: StudyPlanArtifactContent;
}

export function createStudyPlannerAgent(): Agent {
  return Agent.create({
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
  context: StudyPlanningContext,
  events: DomainEventRecorder
): Result<StudyPlannerOutput> {
  events.recordAgentInvoked(agent.id, agent.role);

  if (!agent.canUseCapability(capabilityCatalog.generateStudyPlan.id)) {
    return err({
      code: "POLICY_VIOLATION",
      message: `Agent ${agent.id} cannot use capability ${capabilityCatalog.generateStudyPlan.id}.`
    });
  }

  const activeDays = context.schedule
    .filter((entry) => entry.minutes > 0)
    .map((entry) => entry.day as StudyDay);

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

  const availableMinutesByDay = context.availableMinutesByDay();
  const sessions = activeDays.map((day, index) => {
    const minutes = availableMinutesByDay[day];
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

  const output: StudyPlannerOutput = {
    assumptions,
    decisions: [
      "Allocated one primary topic to each active study day.",
      "Used longer sessions for consolidation and mixed review.",
      "Kept every session outcome explicit so the learner can judge completion.",
      ...(context.diagnosedGaps.length > 0
        ? [`Prioritised diagnosed gaps in ${context.diagnosedGaps.join(", ")}.`]
        : [])
    ],
    childTaskSummaries: context.focusTopics.map(
      (topic) => `Prepare a focused ${topic} study block with retrieval and self-check.`
    ),
    artifactContent: {
      summary:
        context.diagnosedGaps.length > 0
          ? `${context.learnerName} will follow a one-week plan focused on closing gaps in ${context.diagnosedGaps.join(
              ", "
            )} and reinforcing ${context.focusTopics.join(", ")}.`
          : `${context.learnerName} will follow a one-week plan focused on ${context.focusTopics.join(
              ", "
            )}.`,
      sessions,
      checkpoints: [
        `Midweek check: explain one idea from ${fallbackTopic} without notes.`,
        `Weekend check: complete a mixed review covering ${context.focusTopics.join(", ")}.`
      ],
      notes: [
        "Keep materials ready before each session to protect the short weekday slots.",
        "If a session is missed, roll it into Saturday before starting new work.",
        ...(context.diagnosedGaps.length > 0
          ? [`Start each session by revisiting the diagnosed gap in ${context.diagnosedGaps[0]}.`]
          : [])
      ]
    }
  };

  const policyEvaluation = evaluatePolicies(
    agent.policies,
    {
      kind: "study-plan",
      context,
      artifactContent: output.artifactContent
    },
    events
  );
  if (!policyEvaluation.ok) {
    return policyEvaluation;
  }

  return ok(output);
}
