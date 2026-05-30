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
import type { RuntimeConversationBinding } from "./RuntimeConversationBinding.js";
import type {
  MasterDataInterpretationCandidate
} from "../masterData/MasterDataInterpretation.js";

export interface AssessmentItemCandidate extends AssessmentItem {}

export interface AssessmentKnowledgeGapCandidate {
  topic: string;
  description: string;
  evidence: string;
  severity: KnowledgeGapSeverity;
}

export interface AssessmentAttemptEvaluationCandidate {
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
  itemResults: readonly EvaluationItemResult[];
  knowledgeGaps: readonly AssessmentKnowledgeGapCandidate[];
  score: number;
}

export interface InitialAssessmentGenerationCandidate {
  artifactContent: AssessmentArtifactContent;
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
  items: readonly AssessmentItemCandidate[];
}

export interface StudyPlanGenerationCandidate {
  artifactContent: StudyPlanArtifactContent;
  assumptions: readonly ContextAssumption[];
  childTaskSummaries: readonly string[];
  decisions: readonly string[];
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
}

export interface PracticeActivityGenerationCandidate {
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
  flashcardSet: FlashcardSet;
}

export interface ActiveReviewEvaluationCandidate {
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
  itemResults: readonly {
    confidence: PracticeItemResponse["confidence"];
    correct: boolean;
    feedback: string;
    overconfidence: boolean;
    practiceItemId: string;
  }[];
}

export interface MasterDataInterpretationResultCandidate {
  interpretation: MasterDataInterpretationCandidate;
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
}

export interface AgentRuntime {
  evaluateActiveReviewSession(input: {
    learningLoopId: string;
    practiceItems: readonly PracticeItem[];
    responses: readonly PracticeItemResponse[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<ActiveReviewEvaluationCandidate>> | Result<ActiveReviewEvaluationCandidate>;
  evaluateAssessmentAttempt(input: {
    assessment: {
      items: readonly AssessmentItem[];
      topic: string;
    };
    contextTopic: string;
    learningLoopId: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<AssessmentAttemptEvaluationCandidate>> | Result<AssessmentAttemptEvaluationCandidate>;
  interpretMasterData(input: {
    contentType: string;
    expectedOutputSchema: "MasterDataInterpretationCandidate.v1";
    fallbackItems?: readonly {
      canonicalAnswer: string;
      prompt: string;
      topic: string;
      visibleMaterial: string;
    }[];
    learnerYearGroup?: string;
    rawSourceContent: string;
    sourceId: string;
    sourceName: string;
    userHints?: {
      subject?: string;
      topic?: string;
    };
  }): Promise<Result<MasterDataInterpretationResultCandidate>> | Result<MasterDataInterpretationResultCandidate>;
  generateInitialAssessment(input: {
    context: InitialAssessmentContext;
    learningLoopId: string;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<InitialAssessmentGenerationCandidate>> | Result<InitialAssessmentGenerationCandidate>;
  generatePracticeActivity(input: {
    context: PracticeActivityContext;
    learningLoopId: string;
    materialInterpretation?: MasterDataInterpretationCandidate;
    selections: readonly {
      gap: {
        description: string;
        id: string;
      };
      item: MasterDataItem;
    }[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<PracticeActivityGenerationCandidate>> | Result<PracticeActivityGenerationCandidate>;
  generateStudyPlan(input: {
    context: StudyPlanningContext;
    learningLoopId: string;
    materialInterpretations?: readonly MasterDataInterpretationCandidate[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<StudyPlanGenerationCandidate>> | Result<StudyPlanGenerationCandidate>;
}
