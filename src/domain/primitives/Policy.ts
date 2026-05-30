import type {
  InitialAssessmentContext,
  PracticeActivityContext,
  StudyPlanningContext
} from "./Context.js";
import type { DomainEventRecorder } from "./Event.js";
import { err, ok, type Result } from "./result.js";
import type { StudyPlanArtifactContent } from "../study/StudyPlanning.js";
import type { AssessmentArtifactContent } from "../study/AssessmentGeneration.js";
import type { FlashcardSet } from "../learning/PracticeActivity.js";

export type PolicyId =
  | "age-appropriate-content"
  | "curriculum-alignment"
  | "no-direct-answer";

export interface PolicyEvaluationInput {
  context: InitialAssessmentContext | PracticeActivityContext | StudyPlanningContext;
  artifactContent: AssessmentArtifactContent | FlashcardSet | StudyPlanArtifactContent;
  kind: "assessment" | "practice-activity" | "study-plan";
}

export interface Policy {
  id: PolicyId;
  description: string;
  evaluate(input: PolicyEvaluationInput): Result<void>;
}

class StudyPlanPolicy implements Policy {
  constructor(
    public readonly id: PolicyId,
    public readonly description: string,
    private readonly evaluator: (input: PolicyEvaluationInput) => Result<void>
  ) {}

  evaluate(input: PolicyEvaluationInput): Result<void> {
    return this.evaluator(input);
  }
}

function containsDirectAnswer(text: string): boolean {
  const lowered = text.toLowerCase();

  return lowered.includes("the answer is") || lowered.includes("copy this answer");
}

export const policyCatalog: Record<PolicyId, Policy> = {
  "age-appropriate-content": new StudyPlanPolicy(
    "age-appropriate-content",
    "Outputs must be appropriate for the learner year group.",
    ({ context, artifactContent }) => {
      const yearGroup = context.yearGroup;
      if (!yearGroup.startsWith("Year ")) {
        return err({
          code: "POLICY_VIOLATION",
          message: "Study plans require an explicit school year group."
        });
      }

      if ("sessions" in artifactContent) {
        const oversizedSession = artifactContent.sessions.find((session) => session.minutes > 120);
        if (oversizedSession) {
          return err({
            code: "POLICY_VIOLATION",
            message: `Session length for ${oversizedSession.day} exceeds the age-appropriate limit.`
          });
        }
      }

      if ("items" in artifactContent && artifactContent.items.length > 10) {
        return err({
          code: "POLICY_VIOLATION",
          message: "Assessment item count exceeds the age-appropriate limit."
        });
      }

      if ("cards" in artifactContent && artifactContent.cards.length > 12) {
        return err({
          code: "POLICY_VIOLATION",
          message: "Practice activity card count exceeds the age-appropriate limit."
        });
      }

      return ok(undefined);
    }
  ),
  "curriculum-alignment": new StudyPlanPolicy(
    "curriculum-alignment",
    "Plans should stay aligned to the stated learning objective.",
    ({ context, artifactContent, kind }) => {
      if (kind === "study-plan" && "focusTopics" in context && "sessions" in artifactContent) {
        const allowedTopics = new Set(context.focusTopics);
        const misalignedSession = artifactContent.sessions.find(
          (session) => !allowedTopics.has(session.topic)
        );

        if (misalignedSession) {
          return err({
            code: "POLICY_VIOLATION",
            message: `Session topic ${misalignedSession.topic} is outside the requested focus topics.`
          });
        }

        const summaryMatchesTopic = context.focusTopics.some((topic) =>
          artifactContent.summary.toLowerCase().includes(topic.toLowerCase())
        );

        if (!summaryMatchesTopic) {
          return err({
            code: "POLICY_VIOLATION",
            message: "Study plan summary does not reflect the requested curriculum focus."
          });
        }
      }

      if (kind === "assessment" && "topic" in context && "items" in artifactContent) {
        const assessmentContext = context as InitialAssessmentContext;
        if (artifactContent.topic !== context.topic) {
          return err({
            code: "POLICY_VIOLATION",
            message: "Assessment topic does not match the requested diagnostic topic."
          });
        }

        if (artifactContent.items.length !== assessmentContext.questionCount) {
          return err({
            code: "POLICY_VIOLATION",
            message: "Assessment item count does not match the requested question count."
          });
        }
      }

      if (kind === "practice-activity" && "topic" in context && "cards" in artifactContent) {
        const practiceContext = context as PracticeActivityContext;
        if (artifactContent.cards.length !== practiceContext.cardCount) {
          return err({
            code: "POLICY_VIOLATION",
            message: "Practice activity card count does not match the request."
          });
        }

        const misalignedCard = artifactContent.cards.find(
          (card) => card.topic !== practiceContext.topic
        );
        if (misalignedCard) {
          return err({
            code: "POLICY_VIOLATION",
            message: `Practice card ${misalignedCard.id} is outside the diagnosed topic ${practiceContext.topic}.`
          });
        }
      }

      return ok(undefined);
    }
  ),
  "no-direct-answer": new StudyPlanPolicy(
    "no-direct-answer",
    "The system should plan learning work rather than give away answers.",
    ({ artifactContent }) => {
      const allText = [
        ...("summary" in artifactContent ? [artifactContent.summary] : [artifactContent.instructions]),
        ...("items" in artifactContent ? artifactContent.items.map((item) => item.prompt) : []),
        ...("cards" in artifactContent
          ? artifactContent.cards.flatMap((card) => [card.front, card.back])
          : []),
        ...("checkpoints" in artifactContent ? artifactContent.checkpoints : []),
        ...("notes" in artifactContent ? artifactContent.notes : []),
        ...("sessions" in artifactContent
          ? artifactContent.sessions.flatMap((session) => [session.activity, session.outcome])
          : [])
      ];

      const directAnswer = allText.find((text) => containsDirectAnswer(text));
      if (directAnswer) {
        return err({
          code: "POLICY_VIOLATION",
          message: "Study plan content contains direct-answer phrasing."
        });
      }

      return ok(undefined);
    }
  )
};

export const policies: readonly Policy[] = Object.values(policyCatalog);

export function evaluatePolicies(
  policyIds: readonly PolicyId[],
  input: PolicyEvaluationInput,
  events: DomainEventRecorder
): Result<void> {
  for (const policyId of policyIds) {
    const policy = policyCatalog[policyId];
    const evaluation = policy.evaluate(input);
    events.recordPolicyEvaluated(policy.id, evaluation.ok ? "passed" : "failed");

    if (!evaluation.ok) {
      return evaluation;
    }
  }

  return ok(undefined);
}
