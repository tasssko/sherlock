import type {
  AssessmentDifficulty,
  AssessmentItem,
  EvaluationItemResult
} from "../../domain/learning/Assessment.js";
import type { KnowledgeGapSeverity } from "../../domain/learning/LearningLoop.js";
import type {
  FlashcardSet,
  PracticeItem,
  PracticeItemResponse
} from "../../domain/learning/PracticeActivity.js";
import type {
  InitialAssessmentContext,
  PracticeActivityContext,
  StudyPlanningContext
} from "../../domain/primitives/Context.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import type { ContextAssumption } from "../../domain/primitives/Context.js";
import type { Result } from "../../domain/primitives/result.js";
import type { AssessmentArtifactContent } from "../../domain/study/AssessmentGeneration.js";
import type { StudyPlanArtifactContent } from "../../domain/study/StudyPlanning.js";
import type { RuntimeTraceSeed } from "./RuntimeTrace.js";

export interface AssessmentItemCandidate extends AssessmentItem {}

export interface AssessmentKnowledgeGapCandidate {
  topic: string;
  description: string;
  evidence: string;
  severity: KnowledgeGapSeverity;
}

export interface AssessmentAttemptEvaluationCandidate {
  runtimeTrace?: RuntimeTraceSeed;
  itemResults: readonly EvaluationItemResult[];
  knowledgeGaps: readonly AssessmentKnowledgeGapCandidate[];
  score: number;
}

export interface InitialAssessmentGenerationCandidate {
  artifactContent: AssessmentArtifactContent;
  runtimeTrace?: RuntimeTraceSeed;
  items: readonly AssessmentItemCandidate[];
}

export interface StudyPlanGenerationCandidate {
  artifactContent: StudyPlanArtifactContent;
  assumptions: readonly ContextAssumption[];
  childTaskSummaries: readonly string[];
  decisions: readonly string[];
  runtimeTrace?: RuntimeTraceSeed;
}

export interface PracticeActivityGenerationCandidate {
  runtimeTrace?: RuntimeTraceSeed;
  flashcardSet: FlashcardSet;
}

export interface ActiveReviewEvaluationCandidate {
  runtimeTrace?: RuntimeTraceSeed;
  itemResults: readonly {
    confidence: PracticeItemResponse["confidence"];
    correct: boolean;
    feedback: string;
    overconfidence: boolean;
    practiceItemId: string;
  }[];
}

export interface AgentRuntime {
  evaluateActiveReviewSession(input: {
    practiceItems: readonly PracticeItem[];
    responses: readonly PracticeItemResponse[];
  }): Promise<Result<ActiveReviewEvaluationCandidate>> | Result<ActiveReviewEvaluationCandidate>;
  evaluateAssessmentAttempt(input: {
    assessment: {
      items: readonly AssessmentItem[];
      topic: string;
    };
    contextTopic: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
  }): Promise<Result<AssessmentAttemptEvaluationCandidate>> | Result<AssessmentAttemptEvaluationCandidate>;
  generateInitialAssessment(input: {
    context: InitialAssessmentContext;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
  }): Promise<Result<InitialAssessmentGenerationCandidate>> | Result<InitialAssessmentGenerationCandidate>;
  generatePracticeActivity(input: {
    context: PracticeActivityContext;
    selections: readonly {
      gap: {
        description: string;
        id: string;
      };
      item: MasterDataItem;
    }[];
  }): Promise<Result<PracticeActivityGenerationCandidate>> | Result<PracticeActivityGenerationCandidate>;
  generateStudyPlan(input: {
    context: StudyPlanningContext;
  }): Promise<Result<StudyPlanGenerationCandidate>> | Result<StudyPlanGenerationCandidate>;
}
