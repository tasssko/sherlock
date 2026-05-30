import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";
import { FixtureAgentRuntime } from "../src/modules/runtime/FixtureAgentRuntime.js";
import { RelayAgentRuntime } from "../src/modules/runtime/RelayAgentRuntime.js";
import { InitialAssessmentContext, PracticeActivityContext, StudyPlanningContext } from "../src/domain/primitives/Context.js";
import { MasterDataItem, MasterDataSource } from "../src/domain/learning/MasterData.js";
import { LearningLoop, KnowledgeGap } from "../src/domain/learning/LearningLoop.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";

const difficultyScale = ["easy", "easy", "medium", "medium", "stretch"] as const;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createRelayFetchStub(): typeof fetch {
  return (async (_input, init) => {
    const url = typeof _input === "string" ? _input : _input instanceof URL ? _input.toString() : _input.url;
    if (!url.endsWith("/v1/tasks")) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      message: string;
    };
    const [, payloadLine = "{}"] = body.message.split("\n");
    const relayRequest = JSON.parse(payloadLine) as {
      operation: string;
      payload: any;
    };
    const responseEnvelope = {
      taskId: `relay_task_${relayRequest.operation}`,
      workPlanId:
        relayRequest.operation === "generateStudyPlan" ? "relay_workplan_1" : undefined,
      responseText: JSON.stringify({
        result: buildRelayResult(relayRequest.operation, relayRequest.payload)
      })
    };

    return new Response(JSON.stringify(responseEnvelope), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
}

function buildRelayResult(operation: string, payload: any): unknown {
  if (operation === "generateInitialAssessment") {
    const items = payload.sourceItems.map((item: any, index: number) => ({
      id: `assessment_item_${index + 1}`,
      topic: item.topic,
      prompt: item.prompt,
      canonicalAnswer: item.canonicalAnswer,
      visibleMaterial: item.visibleMaterial,
      difficulty: difficultyScale[index] ?? "stretch",
      sourceMasterDataItemId: item.id
    }));

    return {
      items,
      artifactContent: {
        topic: payload.context.topic,
        questionCount: payload.context.questionCount,
        instructions: `Complete all ${payload.context.questionCount} questions without notes. The goal is to diagnose current understanding in ${payload.context.topic}.`,
        items: items.map((item: any) => ({
          id: item.id,
          prompt: item.prompt,
          difficulty: item.difficulty
        }))
      }
    };
  }

  if (operation === "evaluateAssessmentAttempt") {
    const responseByItemId = new Map(
      payload.responses.map((response: any) => [response.itemId, response.answer])
    );
    const itemResults = payload.assessment.items.map((item: any) => {
      const answer = responseByItemId.get(item.id) ?? "";
      const correct = normalize(answer) === normalize(item.canonicalAnswer);
      return {
        itemId: item.id,
        correct,
        feedback: correct
          ? `Secure response for ${item.topic}.`
          : `Review the underlying idea for ${item.topic} and revisit the missed method.`,
        topic: item.topic
      };
    });
    const score =
      itemResults.length === 0
        ? 0
        : itemResults.filter((result: any) => result.correct).length / itemResults.length;

    return {
      score,
      itemResults,
      knowledgeGaps: itemResults
        .filter((result: any) => !result.correct)
        .map((result: any) => ({
          topic: result.topic,
          description: `Needs more support with ${result.topic}.`,
          evidence: `Missed assessment item ${result.itemId}.`,
          severity: score < 0.5 ? "high" : "medium"
        }))
    };
  }

  if (operation === "generatePracticeActivity") {
    return {
      flashcardSet: {
        instructions: `Review each card, attempt an answer from memory, then flip to check accuracy for ${payload.context.topic}.`,
        cards: payload.selections.map((selection: any, index: number) => ({
          id: `flashcard_${index + 1}`,
          front: selection.item.prompt,
          back: selection.item.canonicalAnswer,
          topic: selection.item.topic,
          knowledgeGapId: selection.gap.id,
          learningObjective: selection.gap.description,
          sourceMasterDataItemId: selection.item.id,
          sourceVisibleSentence: selection.item.visibleMaterial
        }))
      }
    };
  }

  if (operation === "generateStudyPlan") {
    const activeDays = payload.context.schedule.filter((entry: any) => entry.minutes > 0);
    const fallbackTopic = payload.context.focusTopics[0];
    return {
      assumptions: [
        {
          id: "assumption_spaced_repetition",
          statement: "Repeated topics across the week are allowed to reinforce retention."
        }
      ],
      decisions: [
        "Allocated one primary topic to each active study day.",
        ...(payload.context.diagnosedGaps.length > 0
          ? [`Prioritised diagnosed gaps in ${payload.context.diagnosedGaps.join(", ")}.`]
          : [])
      ],
      childTaskSummaries: payload.context.focusTopics.map(
        (topic: string) => `Prepare a focused ${topic} study block with retrieval and self-check.`
      ),
      artifactContent: {
        summary:
          payload.context.diagnosedGaps.length > 0
            ? `${payload.context.learnerName} will follow a one-week plan focused on closing gaps in ${payload.context.diagnosedGaps.join(", ")} and reinforcing ${payload.context.focusTopics.join(", ")}.`
            : `${payload.context.learnerName} will follow a one-week plan focused on ${payload.context.focusTopics.join(", ")}.`,
        sessions: activeDays.map((entry: any, index: number) => ({
          day: entry.day,
          minutes: entry.minutes,
          topic: payload.context.focusTopics[index % payload.context.focusTopics.length] ?? fallbackTopic,
          activity: `Recap key ideas in ${payload.context.focusTopics[index % payload.context.focusTopics.length] ?? fallbackTopic}, complete one focused practice set, then self-check.`,
          outcome: `Leave the session with one verified success criterion for ${payload.context.focusTopics[index % payload.context.focusTopics.length] ?? fallbackTopic}.`
        })),
        checkpoints: [
          `Midweek check: explain one idea from ${fallbackTopic} without notes.`
        ],
        notes: [
          "Keep materials ready before each session to protect the short weekday slots."
        ]
      }
    };
  }

  throw new Error(`Unsupported relay operation ${operation}.`);
}

async function runLoopFlow(server: Awaited<ReturnType<typeof createServer>>) {
  const uploadResponse = await server.inject({
    method: "POST",
    url: "/v1/master-data",
    payload: {
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole."
        },
        {
          topic: "fractions",
          prompt: "Which is larger: 2/3 or 3/5?",
          canonicalAnswer: "two thirds",
          visibleMaterial: "Compare fractions by finding a common denominator or decimal."
        }
      ]
    }
  });
  expect(uploadResponse.statusCode).toBe(201);

  const assessmentResponse = await server.inject({
    method: "POST",
    url: "/v1/assessments/initial",
    payload: {
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 2
    }
  });
  expect(assessmentResponse.statusCode).toBe(201);
  const assessment = assessmentResponse.json();

  const attemptResponse = await server.inject({
    method: "POST",
    url: "/v1/assessments/attempts",
    payload: {
      assessmentId: assessment.assessment.id,
      responses: assessment.assessment.items.map((item: { id: string }) => ({
        itemId: item.id,
        answer: "incorrect response"
      }))
    }
  });
  expect(attemptResponse.statusCode).toBe(201);

  const studyPlanResponse = await server.inject({
    method: "POST",
    url: "/v1/study-plans",
    payload: {
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan.",
      focusTopics: ["fractions"],
      availableMinutesByDay: {
        Monday: 30,
        Tuesday: 30,
        Wednesday: 30,
        Thursday: 30,
        Friday: 30,
        Saturday: 60,
        Sunday: 0
      }
    }
  });
  expect(studyPlanResponse.statusCode).toBe(201);

  const practiceResponse = await server.inject({
    method: "POST",
    url: `/v1/learning-loops/${assessment.learningLoop.id}/practice-activities`,
    payload: {
      kind: "flashcard_set",
      cardCount: 2
    }
  });
  expect(practiceResponse.statusCode).toBe(201);

  const practiceListResponse = await server.inject({
    method: "GET",
    url: `/v1/learning-loops/${assessment.learningLoop.id}/practice-activities`
  });
  expect(practiceListResponse.statusCode).toBe(200);

  const practiceCompletionResponse = await server.inject({
    method: "POST",
    url: `/v1/practice-activities/${practiceResponse.json().practiceActivity.id}/completions`,
    payload: {
      responses: practiceResponse.json().practiceActivity.flashcardSet.cards.map(
        (card: { back: string; id: string }) => ({
          practiceItemId: card.id,
          responseText: card.back,
          confidence: "high"
        })
      )
    }
  });
  expect(practiceCompletionResponse.statusCode).toBe(201);

  return {
    assessment: assessmentResponse.json(),
    attempt: attemptResponse.json(),
    practice: practiceResponse.json(),
    practiceList: practiceListResponse.json(),
    completion: practiceCompletionResponse.json(),
    studyPlan: studyPlanResponse.json()
  };
}

describe("Agent runtime contract", () => {
  it("lets FixtureAgentRuntime and RelayAgentRuntime satisfy the same AgentRuntime contract", async () => {
    const fixtureRuntime = new FixtureAgentRuntime();
    const relayRuntime = new RelayAgentRuntime({
      baseUrl: "http://relay.test",
      workspaceId: "workspace_demo",
      fetcher: createRelayFetchStub()
    });

    const source = MasterDataSource.create("Fractions Bank", []);
    const sourceItem = MasterDataItem.create(source.id, {
      topic: "fractions",
      prompt: "Simplify 6/8.",
      canonicalAnswer: "three quarters",
      visibleMaterial: "Fractions can describe equal parts of a whole."
    });
    const assessmentContext = InitialAssessmentContext.create({
      command: {
        learnerName: "Year 7 learner",
        yearGroup: "Year 7",
        topic: "fractions",
        questionCount: 1
      },
      sourceName: source.name
    });
    const studyContext = StudyPlanningContext.fromCommand({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan.",
      focusTopics: ["fractions"],
      availableMinutesByDay: {
        Monday: 30,
        Tuesday: 30,
        Wednesday: 30,
        Thursday: 30,
        Friday: 30,
        Saturday: 60,
        Sunday: 0
      }
    });
    const workspace = Workspace.create({
      title: "Study Workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Build secure understanding in fractions."
    });
    const events = createDomainEventRecorder(workspace.id);
    const loop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Build secure understanding in fractions.",
        topic: "fractions"
      },
      events
    );
    const gap = KnowledgeGap.create({
      learningLoopId: loop.id,
      topic: "fractions",
      description: "Needs support with equivalent fractions.",
      evidence: "Missed a diagnostic item.",
      severity: "high"
    });
    const practiceContext = PracticeActivityContext.create({
      command: {
        learningLoopId: loop.id,
        kind: "flashcard_set",
        cardCount: 1
      },
      diagnosedGaps: [gap.toSnapshot().description],
      learnerName: "Year 7 learner",
      learningLoopId: loop.id,
      sourceNames: [source.name],
      topic: "fractions",
      yearGroup: "Year 7"
    });

    const fixtureAssessment = await fixtureRuntime.generateInitialAssessment({
      context: assessmentContext,
      source,
      sourceItems: [sourceItem]
    });
    const relayAssessment = await relayRuntime.generateInitialAssessment({
      context: assessmentContext,
      source,
      sourceItems: [sourceItem]
    });
    expect(fixtureAssessment.ok).toBe(true);
    expect(relayAssessment.ok).toBe(true);
    if (!fixtureAssessment.ok || !relayAssessment.ok) {
      return;
    }
    expect(Object.keys(relayAssessment.value.artifactContent).sort()).toEqual(
      Object.keys(fixtureAssessment.value.artifactContent).sort()
    );

    const fixtureEvaluation = await fixtureRuntime.evaluateAssessmentAttempt({
      assessment: {
        topic: "fractions",
        items: fixtureAssessment.value.items
      },
      contextTopic: "fractions",
      responses: [
        {
          itemId: fixtureAssessment.value.items[0].id,
          answer: "incorrect response"
        }
      ]
    });
    const relayEvaluation = await relayRuntime.evaluateAssessmentAttempt({
      assessment: {
        topic: "fractions",
        items: fixtureAssessment.value.items
      },
      contextTopic: "fractions",
      responses: [
        {
          itemId: fixtureAssessment.value.items[0].id,
          answer: "incorrect response"
        }
      ]
    });
    expect(fixtureEvaluation.ok).toBe(true);
    expect(relayEvaluation.ok).toBe(true);
    if (!fixtureEvaluation.ok || !relayEvaluation.ok) {
      return;
    }
    expect(Object.keys(relayEvaluation.value).filter((key) => key !== "runtimeTrace").sort()).toEqual(
      Object.keys(fixtureEvaluation.value).filter((key) => key !== "runtimeTrace").sort()
    );

    const fixturePractice = await fixtureRuntime.generatePracticeActivity({
      context: practiceContext,
      selections: [
        {
          gap: {
            id: gap.id,
            description: gap.toSnapshot().description
          },
          item: sourceItem
        }
      ]
    });
    const relayPractice = await relayRuntime.generatePracticeActivity({
      context: practiceContext,
      selections: [
        {
          gap: {
            id: gap.id,
            description: gap.toSnapshot().description
          },
          item: sourceItem
        }
      ]
    });
    expect(fixturePractice.ok).toBe(true);
    expect(relayPractice.ok).toBe(true);
    if (!fixturePractice.ok || !relayPractice.ok) {
      return;
    }
    expect(Object.keys(relayPractice.value.flashcardSet).sort()).toEqual(
      Object.keys(fixturePractice.value.flashcardSet).sort()
    );

    const fixtureStudyPlan = await fixtureRuntime.generateStudyPlan({
      context: studyContext
    });
    const relayStudyPlan = await relayRuntime.generateStudyPlan({
      context: studyContext
    });
    expect(fixtureStudyPlan.ok).toBe(true);
    expect(relayStudyPlan.ok).toBe(true);
    if (!fixtureStudyPlan.ok || !relayStudyPlan.ok) {
      return;
    }
    expect(Object.keys(relayStudyPlan.value.artifactContent).sort()).toEqual(
      Object.keys(fixtureStudyPlan.value.artifactContent).sort()
    );
  });

  it("keeps the loop.study API shape stable when swapping from fixture runtime to RelayAgentRuntime", async () => {
    const fixtureServer = await createServer();
    const relayServer = await createServer({
      agentRuntime: new RelayAgentRuntime({
        baseUrl: "http://relay.test",
        workspaceId: "workspace_demo",
        fetcher: createRelayFetchStub()
      })
    });

    try {
      const fixture = await runLoopFlow(fixtureServer);
      const relay = await runLoopFlow(relayServer);

      expect(Object.keys(relay.assessment).sort()).toEqual(Object.keys(fixture.assessment).sort());
      expect(Object.keys(relay.attempt).sort()).toEqual(Object.keys(fixture.attempt).sort());
      expect(Object.keys(relay.practice).sort()).toEqual(Object.keys(fixture.practice).sort());
      expect(Object.keys(relay.practiceList).sort()).toEqual(Object.keys(fixture.practiceList).sort());
      expect(Object.keys(relay.completion).sort()).toEqual(Object.keys(fixture.completion).sort());
      expect(Object.keys(relay.studyPlan).sort()).toEqual(Object.keys(fixture.studyPlan).sort());

      expect(relay.assessment).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String),
          summary: expect.any(String)
        })
      });
      expect(relay.attempt).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(relay.practice).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(relay.practiceList).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(relay.completion).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(relay.studyPlan).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
    } finally {
      await fixtureServer.close();
      await relayServer.close();
    }
  });

  it("stores Relay ids only as internal runtime trace metadata", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const runtime = new RelayAgentRuntime({
      baseUrl: "http://relay.test",
      workspaceId: "workspace_demo",
      fetcher: createRelayFetchStub()
    });
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository, undefined, undefined, runtime);
    const attemptController = new AssessmentAttemptController(repository, runtime);
    const practiceController = new PracticeActivityController(repository, undefined, undefined, runtime);
    const studyPlanController = new StudyPlanController(repository, undefined, undefined, runtime);

    uploadController.execute({
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole."
        }
      ]
    });

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
      assessmentId: assessment.value.assessment.id,
      responses: assessment.value.assessment.items.map((item) => ({
        itemId: item.id,
        answer: "incorrect response"
      }))
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) {
      return;
    }

    const practice = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });
    expect(practice.ok).toBe(true);
    if (!practice.ok) {
      return;
    }

    const studyPlan = await studyPlanController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan.",
      focusTopics: ["fractions"],
      availableMinutesByDay: {
        Monday: 30,
        Tuesday: 30,
        Wednesday: 30,
        Thursday: 30,
        Friday: 30,
        Saturday: 60,
        Sunday: 0
      }
    });
    expect(studyPlan.ok).toBe(true);
    if (!studyPlan.ok) {
      return;
    }

    const record = repository.findRecordByLearningLoopId(assessment.value.learningLoop.id as never);
    expect(record?.record.runtimeTraces).toHaveLength(4);
    expect(record?.record.runtimeTraces.map((trace) => trace.toSnapshot())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          execution: expect.objectContaining({
            provider: "relay",
            status: "succeeded"
          }),
          relayTask: expect.objectContaining({
            relayTaskId: expect.stringContaining("relay_task_")
          })
        })
      ])
    );

    const learnerFacingPayload = JSON.stringify({
      assessment: assessment.value,
      attempt: attempt.value,
      practice: practice.value,
      studyPlan: studyPlan.value
    });
    expect(learnerFacingPayload).not.toContain("relay_task_");
    expect(learnerFacingPayload).not.toContain("relay_workplan_");
  });

  it("returns a learner-safe error and preserves loop state when runtime generation fails", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const runtime = new RelayAgentRuntime({
      baseUrl: "http://relay.test",
      workspaceId: "workspace_demo",
      fetcher: (async () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" }
        })) as typeof fetch
    });
    const uploadController = new MasterDataUploadController(repository);
    const fixtureAssessmentController = new InitialAssessmentController(repository);
    const fixtureAttemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(repository, undefined, undefined, runtime);

    uploadController.execute({
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole."
        }
      ]
    });

    const assessment = await fixtureAssessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await fixtureAttemptController.execute({
      assessmentId: assessment.value.assessment.id,
      responses: assessment.value.assessment.items.map((item) => ({
        itemId: item.id,
        answer: "incorrect response"
      }))
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) {
      return;
    }

    const before = repository.findRecordByLearningLoopId(assessment.value.learningLoop.id as never);
    const beforePracticeCount = before?.record.practiceActivities.length ?? 0;
    const beforeTraceCount = before?.record.runtimeTraces.length ?? 0;

    const result = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("STATE_CONFLICT");
    expect(result.error.message).toBe("The practice service could not generate an activity right now.");
    expect(result.error.message).not.toContain("Relay");
    expect(result.error.message).not.toContain("/v1/tasks");

    const after = repository.findRecordByLearningLoopId(assessment.value.learningLoop.id as never);
    expect(after?.record.practiceActivities.length).toBe(beforePracticeCount);
    expect(after?.record.runtimeTraces.length).toBe(beforeTraceCount);
    expect(after?.record.learningLoops[0]?.toSnapshot().practiceActivityIds).toHaveLength(0);
  });
});
