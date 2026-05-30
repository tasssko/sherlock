import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import {
  LoopJourneyPage,
  buildLoopJourneyModel,
  type LoopJourneyPageProps
} from "../src/app/ui/components/LoopJourneyPage.js";
import type { LearningLoopResumeResponse } from "../src/domain/study/LearningLoops.js";

const baseLoopValues: LoopJourneyPageProps["loopValues"] = {
  learnerName: "Ava Patel",
  objective: "Feel steady with fractions before the next lesson.",
  practiceCardCount: 2,
  questionCount: 2,
  topic: "fractions",
  yearGroup: "Year 7",
  availableMinutesByDay: {
    Monday: 30,
    Tuesday: 30,
    Wednesday: 30,
    Thursday: 30,
    Friday: 30,
    Saturday: 60,
    Sunday: 0
  }
};

const baseMasterDataValues: LoopJourneyPageProps["masterDataValues"] = {
  sourceName: "Year 7 Fractions Pack",
  lines: [
    "Simplify 6/8. || three quarters || Fractions can be simplified by dividing numerator and denominator by the same number. || simplify",
    "Which is larger: 2/3 or 3/5? || two thirds || Compare fractions by finding common denominators or decimal equivalents. || compare"
  ].join("\n")
};

function renderJourney(loopState: LearningLoopResumeResponse | null): string {
  const props: LoopJourneyPageProps = {
    assessmentError: null,
    assessmentPending: false,
    attemptError: null,
    attemptPending: false,
    completionError: null,
    completionPending: false,
    demoTopics: ["fractions", "forces", "French vocabulary"],
    loopState,
    loopValues: {
      ...baseLoopValues,
      learnerName: loopState?.workspace.learner.name ?? baseLoopValues.learnerName,
      objective: loopState?.learningLoop.objective ?? baseLoopValues.objective,
      topic: loopState?.learningLoop.topic ?? baseLoopValues.topic,
      yearGroup: loopState?.workspace.learner.yearGroup ?? baseLoopValues.yearGroup
    },
    masterDataError: null,
    masterDataPending: false,
    masterDataStatus: "2 study prompts are ready in Year 7 Fractions Pack.",
    masterDataValues: baseMasterDataValues,
    practiceError: null,
    practicePending: false,
    resumeError: null,
    resumeLoopId: loopState?.learningLoopId ?? "",
    resumePending: false,
    studyPlanError: null,
    studyPlanPending: false,
    onApplyDemoSeed: () => {},
    onAssessmentSubmit: async () => undefined,
    onBuildPlan: async () => undefined,
    onDayMinutesChange: () => {},
    onDemoUpload: async () => undefined,
    onGenerateCheckUp: async () => undefined,
    onGenerateReview: async () => undefined,
    onLoopValuesChange: () => {},
    onMasterDataSubmit: () => {},
    onMasterDataValuesChange: () => {},
    onResumeLoopIdChange: () => {},
    onResumeSubmit: async () => undefined,
    onReviewSubmit: async () => undefined
  };

  return renderToStaticMarkup(createElement(LoopJourneyPage, props));
}

describe("Loop journey UI", () => {
  it("resumes the correct journey stage from GET /v1/learning-loops/:id", async () => {
    const server = await createServer();

    try {
      await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: baseMasterDataValues.sourceName,
          items: [
            {
              topic: "fractions",
              prompt: "Simplify 6/8.",
              canonicalAnswer: "three quarters",
              visibleMaterial:
                "Fractions can be simplified by dividing numerator and denominator by the same number."
            },
            {
              topic: "fractions",
              prompt: "Which is larger: 2/3 or 3/5?",
              canonicalAnswer: "two thirds",
              visibleMaterial:
                "Compare fractions by finding common denominators or decimal equivalents."
            }
          ]
        }
      });

      const created = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: baseLoopValues.learnerName,
          yearGroup: baseLoopValues.yearGroup,
          topic: baseLoopValues.topic,
          questionCount: baseLoopValues.questionCount
        }
      });
      const createdPayload = created.json();

      const afterAssessment = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}`
      });
      expect(
        buildLoopJourneyModel({
          loopState: afterAssessment.json(),
          loopValues: baseLoopValues,
          masterDataStatus: "ready",
          masterDataValues: baseMasterDataValues
        }).currentStageKey
      ).toBe("check-up");

      await server.inject({
        method: "POST",
        url: "/v1/assessments/attempts",
        payload: {
          assessmentId: createdPayload.assessment.id,
          responses: createdPayload.assessment.items.map((item: { id: string }) => ({
            itemId: item.id,
            answer: "incorrect response"
          }))
        }
      });

      const afterAttempt = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}`
      });
      expect(
        buildLoopJourneyModel({
          loopState: afterAttempt.json(),
          loopValues: baseLoopValues,
          masterDataStatus: "ready",
          masterDataValues: baseMasterDataValues
        }).currentStageKey
      ).toBe("focus-areas");

      await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: {
          learnerName: baseLoopValues.learnerName,
          yearGroup: baseLoopValues.yearGroup,
          objective: baseLoopValues.objective,
          focusTopics: [baseLoopValues.topic],
          availableMinutesByDay: baseLoopValues.availableMinutesByDay
        }
      });

      const afterPlan = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}`
      });
      expect(
        buildLoopJourneyModel({
          loopState: afterPlan.json(),
          loopValues: baseLoopValues,
          masterDataStatus: "ready",
          masterDataValues: baseMasterDataValues
        }).currentStageKey
      ).toBe("study-plan");

      const practice = await server.inject({
        method: "POST",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}/practice-activities`,
        payload: {
          kind: "flashcard_set",
          cardCount: 2
        }
      });
      const practicePayload = practice.json();

      const afterPractice = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}`
      });
      expect(
        buildLoopJourneyModel({
          loopState: afterPractice.json(),
          loopValues: baseLoopValues,
          masterDataStatus: "ready",
          masterDataValues: baseMasterDataValues
        }).currentStageKey
      ).toBe("active-review");

      await server.inject({
        method: "POST",
        url: `/v1/practice-activities/${practicePayload.practiceActivity.id}/completions`,
        payload: {
          responses: practicePayload.practiceActivity.flashcardSet.cards.map(
            (card: { back: string; id: string }, index: number) => ({
              practiceItemId: card.id,
              responseText: index === 0 ? card.back : "wrong response",
              confidence: index === 0 ? "high" : "low"
            })
          )
        }
      });

      const afterReview = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}`
      });
      expect(
        buildLoopJourneyModel({
          loopState: afterReview.json(),
          loopValues: baseLoopValues,
          masterDataStatus: "ready",
          masterDataValues: baseMasterDataValues
        }).currentStageKey
      ).toBe("next-loop");
    } finally {
      await server.close();
    }
  });

  it("renders collapsed summaries, one primary CTA, muted future stages, and no internal terms", async () => {
    const server = await createServer();

    try {
      await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: baseMasterDataValues.sourceName,
          items: [
            {
              topic: "fractions",
              prompt: "Simplify 6/8.",
              canonicalAnswer: "three quarters",
              visibleMaterial:
                "Fractions can be simplified by dividing numerator and denominator by the same number."
            },
            {
              topic: "fractions",
              prompt: "Which is larger: 2/3 or 3/5?",
              canonicalAnswer: "two thirds",
              visibleMaterial:
                "Compare fractions by finding common denominators or decimal equivalents."
            }
          ]
        }
      });

      const created = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: baseLoopValues.learnerName,
          yearGroup: baseLoopValues.yearGroup,
          topic: baseLoopValues.topic,
          questionCount: baseLoopValues.questionCount
        }
      });
      const createdPayload = created.json();

      await server.inject({
        method: "POST",
        url: "/v1/assessments/attempts",
        payload: {
          assessmentId: createdPayload.assessment.id,
          responses: createdPayload.assessment.items.map((item: { id: string }) => ({
            itemId: item.id,
            answer: "incorrect response"
          }))
        }
      });

      await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: {
          learnerName: baseLoopValues.learnerName,
          yearGroup: baseLoopValues.yearGroup,
          objective: baseLoopValues.objective,
          focusTopics: [baseLoopValues.topic],
          availableMinutesByDay: baseLoopValues.availableMinutesByDay
        }
      });

      const afterPlan = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}`
      });
      const markup = renderJourney(afterPlan.json());

      expect(markup.match(/data-primary-cta="true"/g)?.length ?? 0).toBe(1);
      expect(markup).toContain('data-stage-key="focus-areas"');
      expect(markup).toContain('data-stage-state="needs_attention"');
      expect(markup).toContain('data-stage-state="locked"');
      expect(markup.match(/current-stage-panel/g)?.length ?? 0).toBe(1);

      const bannedTerms = [
        /\bLearningLoop\b/i,
        /\bphase\b/i,
        /\bnextAction\b/i,
        /\bassessment\b/i,
        /\battempt\b/i,
        /\bknowledge gap\b/i,
        /\bPracticeActivity\b/i,
        /\bActiveReviewSession\b/i,
        /\bArtifact\b/i,
        /\bTask\b/i,
        /\bWorkPlan\b/i,
        /\bRelay\b/i,
        /\bRuntimeTrace\b/i
      ];

      for (const term of bannedTerms) {
        expect(markup).not.toMatch(term);
      }
    } finally {
      await server.close();
    }
  });

  it("shows the end-of-loop summary with progress, remaining focus areas, and next timing", async () => {
    const server = await createServer();

    try {
      await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: baseMasterDataValues.sourceName,
          items: [
            {
              topic: "fractions",
              prompt: "Simplify 6/8.",
              canonicalAnswer: "three quarters",
              visibleMaterial:
                "Fractions can be simplified by dividing numerator and denominator by the same number."
            },
            {
              topic: "fractions",
              prompt: "Which is larger: 2/3 or 3/5?",
              canonicalAnswer: "two thirds",
              visibleMaterial:
                "Compare fractions by finding common denominators or decimal equivalents."
            }
          ]
        }
      });

      const created = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: baseLoopValues.learnerName,
          yearGroup: baseLoopValues.yearGroup,
          topic: baseLoopValues.topic,
          questionCount: baseLoopValues.questionCount
        }
      });
      const createdPayload = created.json();

      await server.inject({
        method: "POST",
        url: "/v1/assessments/attempts",
        payload: {
          assessmentId: createdPayload.assessment.id,
          responses: createdPayload.assessment.items.map((item: { id: string }) => ({
            itemId: item.id,
            answer: "incorrect response"
          }))
        }
      });

      await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: {
          learnerName: baseLoopValues.learnerName,
          yearGroup: baseLoopValues.yearGroup,
          objective: baseLoopValues.objective,
          focusTopics: [baseLoopValues.topic],
          availableMinutesByDay: baseLoopValues.availableMinutesByDay
        }
      });

      const practice = await server.inject({
        method: "POST",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}/practice-activities`,
        payload: {
          kind: "flashcard_set",
          cardCount: 2
        }
      });
      const practicePayload = practice.json();

      await server.inject({
        method: "POST",
        url: `/v1/practice-activities/${practicePayload.practiceActivity.id}/completions`,
        payload: {
          responses: practicePayload.practiceActivity.flashcardSet.cards.map(
            (card: { back: string; id: string }, index: number) => ({
              practiceItemId: card.id,
              responseText: index === 0 ? card.back : "wrong response",
              confidence: index === 0 ? "high" : "low"
            })
          )
        }
      });

      const afterReview = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${createdPayload.learningLoop.id}`
      });
      const payload = afterReview.json();
      const markup = renderJourney(payload);

      expect(markup).toContain("What improved");
      expect(markup).toContain("What still needs work");
      expect(markup).toContain("When the next loop starts");
      expect(markup).toContain(payload.knowledgeGaps[0].description);
      expect(markup).toContain(
        new Date(payload.latestActiveReviewSession.nextReviewAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short"
        })
      );
    } finally {
      await server.close();
    }
  });
});
