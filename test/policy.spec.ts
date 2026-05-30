import { describe, expect, it } from "vitest";
import { Agent } from "../src/domain/primitives/Agent.js";
import { capabilityCatalog } from "../src/domain/primitives/Capability.js";
import {
  InitialAssessmentContext,
  StudyPlanningContext
} from "../src/domain/primitives/Context.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { evaluatePolicies } from "../src/domain/primitives/Policy.js";
import type { WorkspaceId } from "../src/domain/primitives/ids.js";
import type { AssessmentArtifactContent } from "../src/domain/study/AssessmentGeneration.js";
import type { StudyPlanArtifactContent } from "../src/domain/study/StudyPlanning.js";
import { createInitialAssessmentAgent, validateAssessmentArtifact } from "../src/modules/assessment/InitialAssessmentAgent.js";
import { createStudyPlannerAgent, generateStudyPlan } from "../src/modules/planning/StudyPlannerAgent.js";

function createWorkspaceId(): WorkspaceId {
  return "workspace_policy" as WorkspaceId;
}

const validStudyPlanCommand = {
  learnerName: "Year 7 learner",
  yearGroup: "Year 7",
  objective: "Create a balanced weekly study plan for fractions, forces, and French vocabulary.",
  focusTopics: ["fractions", "forces", "French vocabulary"],
  availableMinutesByDay: {
    Monday: 30,
    Tuesday: 30,
    Wednesday: 30,
    Thursday: 30,
    Friday: 30,
    Saturday: 60,
    Sunday: 0
  }
} as const;

describe("Capability and policy enforcement", () => {
  it("rejects study-plan generation for an agent without the required capability", () => {
    const context = StudyPlanningContext.fromCommand(validStudyPlanCommand);
    const events = createDomainEventRecorder(createWorkspaceId());
    const agent = Agent.create({
      role: "reviewer",
      purpose: "Review outputs.",
      capabilities: [capabilityCatalog.createArtifact.id],
      policies: []
    });

    const result = generateStudyPlan(agent, context, events);

    expect(result.ok).toBe(false);
  });

  it("fails study-plan policy evaluation when content contains direct answers", () => {
    const context = StudyPlanningContext.fromCommand(validStudyPlanCommand);
    const events = createDomainEventRecorder(createWorkspaceId());
    const content: StudyPlanArtifactContent = {
      summary: "The answer is to memorise the final response.",
      sessions: [
        {
          day: "Monday",
          minutes: 30,
          topic: "fractions",
          activity: "Copy this answer exactly.",
          outcome: "Finish quickly."
        }
      ],
      checkpoints: [],
      notes: []
    };

    const evaluation = evaluatePolicies(
      ["no-direct-answer"],
      {
        kind: "study-plan",
        context,
        artifactContent: content
      },
      events
    );

    expect(evaluation.ok).toBe(false);
  });

  it("passes policy evaluation for the default study planner output", () => {
    const context = StudyPlanningContext.fromCommand(validStudyPlanCommand);
    const events = createDomainEventRecorder(createWorkspaceId());
    const agent = createStudyPlannerAgent();

    const result = generateStudyPlan(agent, context, events);

    expect(result.ok).toBe(true);
    expect(events.all().filter((event) => event.type === "policy.evaluated").map((event) => event.payload)).toEqual([
      {
        policyId: "age-appropriate-content",
        outcome: "passed"
      },
      {
        policyId: "curriculum-alignment",
        outcome: "passed"
      },
      {
        policyId: "no-direct-answer",
        outcome: "passed"
      }
    ]);
  });

  it("evaluates all assessment policies in order for a valid initial assessment", () => {
    const context = InitialAssessmentContext.create({
      command: {
        learnerName: "Year 7 learner",
        yearGroup: "Year 7",
        topic: "fractions",
        questionCount: 3
      },
      sourceName: "Fractions Bank"
    });
    const events = createDomainEventRecorder(createWorkspaceId());
    const agent = createInitialAssessmentAgent();
    const artifactContent: AssessmentArtifactContent = {
      topic: "fractions",
      questionCount: 3,
      instructions: "Complete all 3 questions.",
      items: [
        {
          id: "item_1",
          prompt: "Simplify 6/8.",
          difficulty: "easy"
        },
        {
          id: "item_2",
          prompt: "Explain equivalent fractions.",
          difficulty: "medium"
        },
        {
          id: "item_3",
          prompt: "Compare 2/3 and 3/5.",
          difficulty: "stretch"
        }
      ]
    };

    const result = validateAssessmentArtifact(agent, context, artifactContent, events);

    expect(result.ok).toBe(true);
    expect(events.all().map((event) => event.type)).toContain("agent.invoked");
    expect(events.all().filter((event) => event.type === "policy.evaluated").map((event) => event.payload)).toEqual([
      {
        policyId: "age-appropriate-content",
        outcome: "passed"
      },
      {
        policyId: "curriculum-alignment",
        outcome: "passed"
      },
      {
        policyId: "no-direct-answer",
        outcome: "passed"
      }
    ]);
  });

  it("fails assessment policy evaluation on the first violation", () => {
    const context = InitialAssessmentContext.create({
      command: {
        learnerName: "Year 7 learner",
        yearGroup: "KS3",
        topic: "fractions",
        questionCount: 3
      },
      sourceName: "Fractions Bank"
    });
    const events = createDomainEventRecorder(createWorkspaceId());
    const agent = createInitialAssessmentAgent();

    const result = validateAssessmentArtifact(
      agent,
      context,
      {
        topic: "fractions",
        questionCount: 3,
        instructions: "Complete all 3 questions.",
        items: [
          {
            id: "item_1",
            prompt: "Simplify 6/8.",
            difficulty: "easy"
          },
          {
            id: "item_2",
            prompt: "Explain equivalent fractions.",
            difficulty: "medium"
          },
          {
            id: "item_3",
            prompt: "Compare 2/3 and 3/5.",
            difficulty: "stretch"
          }
        ]
      },
      events
    );

    expect(result.ok).toBe(false);
    expect(events.all().filter((event) => event.type === "policy.evaluated").map((event) => event.payload)).toEqual([
      {
        policyId: "age-appropriate-content",
        outcome: "failed"
      }
    ]);
  });
});
