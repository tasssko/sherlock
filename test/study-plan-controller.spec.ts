import { describe, expect, it } from "vitest";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { studyDays } from "../src/domain/study/StudySchedule.js";
import { ok } from "../src/domain/primitives/result.js";
import { LearningLoop, MasteryProfile } from "../src/domain/learning/LearningLoop.js";
import { LearnerEvidence } from "../src/domain/learning/LearnerEvidence.js";
import { MasteryState } from "../src/domain/learning/MasteryState.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import { createUploadItemsFromInterpretation } from "../src/modules/masterData/MasterDataInterpretation.js";
import { createLearningLoopRecord } from "../src/modules/planning/LearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";

describe("StudyPlanController", () => {
  it("requires an existing diagnosed learning loop before adapting a study plan", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const controller = new StudyPlanController(repository);

    const result = await controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan for fractions.",
      focusTopics: ["fractions"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toContain("learning loop must exist");
  });

  it("returns a structured workspace snapshot with ordered lifecycle events", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const controller = new StudyPlanController(repository);

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

    const result = await controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan for fractions, forces, and French vocabulary.",
      focusTopics: ["fractions", "forces", "French vocabulary"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : day === "Sunday" ? 0 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const parentTask = result.value.tasks.find((task) => task.parentTaskId === undefined);
    const childTasks = result.value.tasks.filter((task) => task.parentTaskId !== undefined);

    expect(parentTask).toBeDefined();
    expect(childTasks).toHaveLength(3);
    expect(parentTask?.childTaskIds).toHaveLength(3);
    expect(parentTask?.dependencies).toEqual(childTasks.map((task) => task.id));
    expect(childTasks.every((task) => task.parentTaskId === parentTask?.id)).toBe(true);
    expect(result.value.artifact.provenance.controller).toBe("StudyPlanController");
    expect(result.value.artifact.provenance.assumptions).toHaveLength(3);
    expect(result.value.workPlan.assumptions).toHaveLength(3);
    expect(result.value.workspace.eventIds.slice(-result.value.events.length)).toEqual(
      result.value.events.map((event) => event.id)
    );
    expect(result.value.blockedTaskIds).toHaveLength(0);
    expect(result.value.learningLoop.topic).toBe("fractions");
    expect(result.value.learningLoop.workPlanIds).toContain(result.value.workPlan.id);
    expect(result.value.learningLoop.artifactIds).toContain(result.value.artifact.id);
    expect(result.value.events.every((event) => event.workspaceId === result.value.workspace.id)).toBe(
      true
    );

    const eventTypes = result.value.events.map((event) => event.type);
    expect(eventTypes.indexOf("work-plan.created")).toBeLessThan(
      eventTypes.indexOf("work-plan.assumption-recorded")
    );
    expect(eventTypes.indexOf("artifact.generated")).toBeLessThan(
      eventTypes.indexOf("workspace.artifact-attached")
    );
    expect(eventTypes).not.toContain("learning-loop.created");
    expect(eventTypes).toContain("study-plan.adapted");
    const artifactGeneratedEvent = result.value.events.find(
      (event) => event.type === "artifact.generated"
    );
    const adaptedEvent = result.value.events.find((event) => event.type === "study-plan.adapted");
    expect(artifactGeneratedEvent?.payload).toMatchObject({
      artifactId: result.value.artifact.id,
      taskId: parentTask?.id,
      version: 1
    });
    expect(adaptedEvent?.payload).toMatchObject({
      learningLoopId: result.value.learningLoop.id,
      workPlanId: result.value.workPlan.id,
      artifactId: result.value.artifact.id,
      diagnosedGapCount: 1
    });
  });

  it("returns a validation error when runtime study-plan output is missing artifact content", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const controller = new StudyPlanController(
      repository,
      undefined,
      undefined,
      {
        evaluateActiveReviewSession: () => {
          throw new Error("not used");
        },
        evaluateAssessmentAttempt: () => {
          throw new Error("not used");
        },
        generateInitialAssessment: () => {
          throw new Error("not used");
        },
        generatePracticeActivity: () => {
          throw new Error("not used");
        },
        interpretMasterData: () => {
          throw new Error("not used");
        },
        generateStudyPlan: async () =>
          ok({
            assumptions: [],
            childTaskSummaries: [],
            decisions: [],
            runtimeTrace: {
              provider: "relay",
              operation: "generateStudyPlan",
              runtimeArtifacts: []
            }
          } as never)
      }
    );

    await uploadController.execute({
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

    const result = await controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan for fractions.",
      focusTopics: ["fractions"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("missing or malformed");
  });

  it("uses the most recent matching learning loop and its accepted interpretation", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const assessmentController = new InitialAssessmentController(repository);

    const olderInterpretation = {
      schema: "MasterDataInterpretationCandidate.v1" as const,
      detectedSubject: "Geography",
      detectedYearGroup: "Year 7",
      mainTopic: "Coasts",
      subtopics: ["Coastal processes"],
      keyPeople: [],
      keyTerms: ["erosion"],
      importantDates: [],
      processes: ["erosion"],
      learnerFacingMaterialSummary: "Older Coasts summary from a previous learning loop.",
      learningObjectives: [
        {
          id: "objective_coasts_older",
          objective: "Explain how erosion shapes coasts.",
          sourceRefs: ["older_source"]
        }
      ],
      sourceMap: [
        {
          sourceRef: "older_source",
          excerpt: "Erosion shapes coastal landforms over time."
        }
      ],
      items: [
        {
          subject: "Geography",
          yearGroup: "Year 7",
          topic: "Coasts",
          subtopic: "Coastal processes",
          itemType: "fact" as const,
          content: "Erosion shapes coastal landforms over time.",
          sourceRef: "older_source"
        }
      ]
    };
    const latestInterpretation = {
      ...olderInterpretation,
      learnerFacingMaterialSummary: "Latest Coasts summary for the current learning loop.",
      learningObjectives: [
        {
          id: "objective_coasts_latest",
          objective: "Explain how erosion, transport, and deposition shape coasts.",
          sourceRefs: ["latest_source"]
        }
      ],
      sourceMap: [
        {
          sourceRef: "latest_source",
          excerpt: "Erosion, transport, and deposition shape coastal landforms."
        }
      ],
      items: [
        {
          subject: "Geography",
          yearGroup: "Year 7",
          topic: "Coasts",
          subtopic: "Coastal processes",
          itemType: "fact" as const,
          content: "Erosion, transport, and deposition shape coastal landforms.",
          sourceRef: "latest_source"
        }
      ]
    };

    const olderUpload = repository.registerMasterData({
      sourceName: "Coasts Older",
      rawSourceContent: "Coasts are shaped by erosion.",
      contentType: "text/plain",
      acceptedInterpretation: olderInterpretation,
      learnerYearGroup: "Year 7",
      userHints: {
        subject: "Geography",
        topic: "Coasts"
      },
      items: createUploadItemsFromInterpretation(olderInterpretation)
    });

    const latestUpload = repository.registerMasterData({
      sourceName: "Coasts Latest",
      rawSourceContent: "Coasts change through erosion, transport, and deposition.",
      contentType: "text/plain",
      acceptedInterpretation: latestInterpretation,
      learnerYearGroup: "Year 7",
      userHints: {
        subject: "Geography",
        topic: "Coasts"
      },
      items: createUploadItemsFromInterpretation(latestInterpretation)
    });

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "Coasts",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const repositoryKey = LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7");
    const existingRecord = repository.findRecord(repositoryKey);
    expect(existingRecord).toBeDefined();
    if (!existingRecord) {
      return;
    }

    const latestLoopEvents = createDomainEventRecorder(existingRecord.workspace.id);
    const latestLoop = LearningLoop.create(
      {
        workspaceId: existingRecord.workspace.id,
        objective: "Refresh the latest Coasts understanding.",
        topic: "Coasts",
        sourceIds: [latestUpload.source.id]
      },
      latestLoopEvents
    );

    repository.saveRecord(repositoryKey, {
      ...existingRecord,
      events: [...existingRecord.events, ...latestLoopEvents.all()],
      learningLoops: [...existingRecord.learningLoops, latestLoop]
    });

    let capturedInput:
      | Parameters<NonNullable<ConstructorParameters<typeof StudyPlanController>[3]>["generateStudyPlan"]>[0]
      | undefined;
    const controller = new StudyPlanController(
      repository,
      undefined,
      undefined,
      {
        evaluateActiveReviewSession: () => {
          throw new Error("not used");
        },
        evaluateAssessmentAttempt: () => {
          throw new Error("not used");
        },
        generateInitialAssessment: () => {
          throw new Error("not used");
        },
        generatePracticeActivity: () => {
          throw new Error("not used");
        },
        interpretMasterData: () => {
          throw new Error("not used");
        },
        generateStudyPlan: async (input) => {
          capturedInput = input;
          return ok({
            assumptions: [],
            childTaskSummaries: ["Prepare a focused Coasts study block with retrieval and self-check."],
            decisions: [],
            artifactContent: {
              summary: "Merry Penguin will follow a one-week plan focused on Coasts.",
              sessions: [
                {
                  day: "Monday",
                  minutes: 30,
                  topic: "Coasts",
                  activity: "Review erosion, transport, and deposition.",
                  outcome: "Explain one coastal process clearly."
                }
              ],
              checkpoints: ["Midweek check: explain one coastal process without notes."],
              notes: ["Keep the source summary beside the learner during the session."]
            }
          });
        }
      }
    );

    const result = await controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build secure understanding in Coasts.",
      focusTopics: ["Coasts"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.learningLoop.id).toBe(latestLoop.id);
    expect(capturedInput?.learningLoopId).toBe(latestLoop.id);
    expect(capturedInput?.materialInterpretations).toHaveLength(1);
    expect(capturedInput?.materialInterpretations?.[0]?.learnerFacingMaterialSummary).toBe(
      "Latest Coasts summary for the current learning loop."
    );
  });

  it("adapts study-plan context from canonical learner evidence and mastery state without review-session snapshots", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const interpretation = {
      schema: "MasterDataInterpretationCandidate.v1" as const,
      detectedSubject: "Mathematics",
      detectedYearGroup: "Year 7",
      mainTopic: "fractions",
      subtopics: ["Equivalent fractions"],
      keyPeople: [],
      keyTerms: ["equivalent fraction"],
      importantDates: [],
      processes: ["simplifying fractions"],
      learnerFacingMaterialSummary: "Fractions can look different while keeping the same value.",
      learningObjectives: [
        {
          id: "objective_fractions",
          objective: "Explain why equivalent fractions represent the same value.",
          sourceRefs: ["fractions_source"]
        }
      ],
      sourceMap: [
        {
          sourceRef: "fractions_source",
          excerpt: "Equivalent fractions represent the same amount."
        }
      ],
      items: [
        {
          subject: "Mathematics",
          yearGroup: "Year 7",
          topic: "fractions",
          subtopic: "Equivalent fractions",
          itemType: "fact" as const,
          content: "Equivalent fractions represent the same amount.",
          sourceRef: "fractions_source"
        }
      ]
    };

    const upload = repository.registerMasterData({
      sourceName: "Fractions Canonical",
      rawSourceContent: "Equivalent fractions represent the same amount.",
      contentType: "text/plain",
      acceptedInterpretation: interpretation,
      learnerYearGroup: "Year 7",
      userHints: {
        subject: "Mathematics",
        topic: "fractions"
      },
      items: createUploadItemsFromInterpretation(interpretation)
    });

    const workspace = Workspace.create({
      title: "Fractions workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Build secure understanding in fractions."
    });
    const events = createDomainEventRecorder(workspace.id);
    const learningLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Build secure understanding in fractions.",
          topic: "fractions",
          sourceIds: [upload.source.id]
        },
        events
      ).toSnapshot(),
      phase: "mastery-tracking",
      status: "active",
      evaluationIds: ["evaluation_fractions" as never],
      knowledgeGapIds: []
    });
    const learnerEvidence = LearnerEvidence.create({
      workspaceId: workspace.id,
      learningLoopId: learningLoop.id,
      seedId: "question_seed_fractions" as never,
      variantId: "question_variant_fractions" as never,
      sourceId: upload.source.id as never,
      responseText: "I am not sure.",
      confidence: "low",
      correctness: "incorrect",
      supportUsed: "independent"
    });
    const masteryState = MasteryState.create({
      learningLoopId: learningLoop.id,
      topic: "fractions",
      status: "developing",
      score: 0.42,
      lastReviewedAt: "2026-05-31T10:00:00.000Z",
      nextReviewAt: "2026-06-02T10:00:00.000Z"
    });

    repository.saveRecord(
      LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7"),
      createLearningLoopRecord({
        workspace,
        tasks: [],
        workPlans: [],
        artifacts: [],
        events: [...events.all()],
        learningLoops: [learningLoop],
        assessments: [],
        attempts: [],
        evaluations: [],
        knowledgeGaps: [],
        learnerEvidence: [learnerEvidence],
        masteryStates: [masteryState],
        masteryProfiles: [],
        practiceActivities: [],
        activeReviewSessions: [],
        loopBatches: [],
        loopUnits: [],
        loopUnitQuestionAssignments: [],
        questionSeeds: [],
        questionVariants: [],
        runtimeConversationBindings: [],
        runtimeTraces: []
      })
    );

    let capturedInput:
      | Parameters<NonNullable<ConstructorParameters<typeof StudyPlanController>[3]>["generateStudyPlan"]>[0]
      | undefined;
    const controller = new StudyPlanController(
      repository,
      undefined,
      undefined,
      {
        evaluateActiveReviewSession: () => {
          throw new Error("not used");
        },
        evaluateAssessmentAttempt: () => {
          throw new Error("not used");
        },
        generateInitialAssessment: () => {
          throw new Error("not used");
        },
        generatePracticeActivity: () => {
          throw new Error("not used");
        },
        interpretMasterData: () => {
          throw new Error("not used");
        },
        generateStudyPlan: async (input) => {
          capturedInput = input;
          return ok({
            assumptions: [],
            childTaskSummaries: ["Review equivalent fractions with retrieval and explanation."],
            decisions: [],
            artifactContent: {
              summary: "A short fractions plan with retrieval and explanation.",
              sessions: [
                {
                  day: "Monday",
                  minutes: 30,
                  topic: "fractions",
                  activity: "Review equivalent fractions and explain why they are equal.",
                  outcome: "Explain one example clearly."
                }
              ],
              checkpoints: ["Explain one equivalent-fractions example without notes."],
              notes: ["Use the learner's recent uncertainty to guide the explanation."]
            }
          });
        }
      }
    );

    const result = await controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build secure understanding in fractions.",
      focusTopics: ["fractions"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(capturedInput?.context.objective).toContain(
      "Prioritise recent practice evidence in fractions."
    );
    expect(capturedInput?.context.focusTopics).toContain("fractions");
  });

  it("projects mastery from canonical mastery states even when a stored mastery profile is stale", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const interpretation = {
      schema: "MasterDataInterpretationCandidate.v1" as const,
      detectedSubject: "Mathematics",
      detectedYearGroup: "Year 7",
      mainTopic: "fractions",
      subtopics: ["Equivalent fractions"],
      keyPeople: [],
      keyTerms: ["equivalent fraction"],
      importantDates: [],
      processes: ["simplifying fractions"],
      learnerFacingMaterialSummary: "Fractions can look different while keeping the same value.",
      learningObjectives: [
        {
          id: "objective_fractions",
          objective: "Explain why equivalent fractions represent the same value.",
          sourceRefs: ["fractions_source"]
        }
      ],
      sourceMap: [
        {
          sourceRef: "fractions_source",
          excerpt: "Equivalent fractions represent the same amount."
        }
      ],
      items: [
        {
          subject: "Mathematics",
          yearGroup: "Year 7",
          topic: "fractions",
          subtopic: "Equivalent fractions",
          itemType: "fact" as const,
          content: "Equivalent fractions represent the same amount.",
          sourceRef: "fractions_source"
        }
      ]
    };

    const upload = repository.registerMasterData({
      sourceName: "Fractions Canonical",
      rawSourceContent: "Equivalent fractions represent the same amount.",
      contentType: "text/plain",
      acceptedInterpretation: interpretation,
      learnerYearGroup: "Year 7",
      userHints: {
        subject: "Mathematics",
        topic: "fractions"
      },
      items: createUploadItemsFromInterpretation(interpretation)
    });

    const workspace = Workspace.create({
      title: "Fractions workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Build secure understanding in fractions."
    });
    const events = createDomainEventRecorder(workspace.id);
    const baseLoop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Build secure understanding in fractions.",
        topic: "fractions",
        sourceIds: [upload.source.id]
      },
      events
    );
    const staleProfile = MasteryProfile.create(baseLoop.id).recordTopicScore("fractions", 0.12);
    const learningLoop = LearningLoop.rehydrate({
      ...baseLoop.toSnapshot(),
      phase: "mastery-tracking",
      status: "active",
      masteryProfileId: staleProfile.id
    });
    const masteryState = MasteryState.create({
      learningLoopId: learningLoop.id,
      topic: "fractions",
      status: "secure",
      score: 0.91,
      lastReviewedAt: "2026-05-31T10:00:00.000Z",
      nextReviewAt: "2026-06-06T10:00:00.000Z"
    });

    repository.saveRecord(
      LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7"),
      createLearningLoopRecord({
        workspace,
        tasks: [],
        workPlans: [],
        artifacts: [],
        events: [...events.all()],
        learningLoops: [learningLoop],
        assessments: [],
        attempts: [],
        evaluations: [],
        knowledgeGaps: [],
        learnerEvidence: [],
        masteryStates: [masteryState],
        masteryProfiles: [staleProfile],
        practiceActivities: [],
        activeReviewSessions: [],
        loopBatches: [],
        loopUnits: [],
        loopUnitQuestionAssignments: [],
        questionSeeds: [],
        questionVariants: [],
        runtimeConversationBindings: [],
        runtimeTraces: []
      })
    );

    const controller = new StudyPlanController(
      repository,
      undefined,
      undefined,
      {
        evaluateActiveReviewSession: () => {
          throw new Error("not used");
        },
        evaluateAssessmentAttempt: () => {
          throw new Error("not used");
        },
        generateInitialAssessment: () => {
          throw new Error("not used");
        },
        generatePracticeActivity: () => {
          throw new Error("not used");
        },
        interpretMasterData: () => {
          throw new Error("not used");
        },
        generateStudyPlan: async () =>
          ok({
            assumptions: [],
            childTaskSummaries: ["Review equivalent fractions with retrieval and explanation."],
            decisions: [],
            artifactContent: {
              summary: "A short fractions plan.",
              sessions: [
                {
                  day: "Monday",
                  minutes: 30,
                  topic: "fractions",
                  activity: "Explain one equivalent-fractions example.",
                  outcome: "Recall one example clearly."
                }
              ],
              checkpoints: ["Recall one equivalent-fractions example without notes."],
              notes: []
            }
          })
      }
    );

    const result = await controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build secure understanding in fractions.",
      focusTopics: ["fractions"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: "fractions",
        score: 0.91,
        status: "secure"
      })
    ]);
  });
});
