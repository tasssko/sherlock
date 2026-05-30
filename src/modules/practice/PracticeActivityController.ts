import { ok, type Result } from "../../domain/primitives/result.js";
import type {
  CompletePracticeActivityCommand,
  CreatePracticeActivityCommand,
  PracticeActivityCompletionResponse,
  PracticeActivityListResponse,
  PracticeActivityResponse
} from "../../domain/study/PracticeActivities.js";
import type { LearningLoopRepository } from "../planning/LearningLoopRepository.js";
import { PracticeActivityProjector } from "./PracticeActivityProjector.js";
import { PracticeActivityService } from "./PracticeActivityService.js";
import { PracticeSourceSelector } from "./PracticeSourceSelector.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import { FlashcardSetAssembler } from "./FlashcardSetAssembler.js";

export class PracticeActivityController {
  private readonly service: PracticeActivityService;

  constructor(
    private readonly repository: LearningLoopRepository,
    service?: PracticeActivityService,
    private readonly projector = new PracticeActivityProjector(),
    runtime: AgentRuntime = new FixtureAgentRuntime()
  ) {
    this.service =
      service ??
      new PracticeActivityService(
        new PracticeSourceSelector(repository),
        undefined,
        new FlashcardSetAssembler(runtime)
      );
  }

  async generate(command: CreatePracticeActivityCommand): Promise<Result<PracticeActivityResponse>> {
    const located = this.repository.findRecordByLearningLoopId(command.learningLoopId as never);
    if (!located) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Learning loop ${command.learningLoopId} was not found.`
        }
      };
    }

    const generated = await this.service.generate(command, located.record);
    if (!generated.ok) {
      return generated;
    }

    this.repository.saveRecord(located.key, generated.value.record);
    return ok(this.projector.project(generated.value.aggregate));
  }

  complete(command: CompletePracticeActivityCommand): Result<PracticeActivityCompletionResponse> {
    const located = this.repository.findRecordByPracticeActivityId(command.practiceActivityId as never);
    if (!located) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Practice activity ${command.practiceActivityId} was not found.`
        }
      };
    }

    const completed = this.service.complete(command, located.record);
    if (!completed.ok) {
      return completed;
    }

    this.repository.saveRecord(located.key, completed.value.record);
    return ok(this.projector.projectCompletion(completed.value.aggregate));
  }

  list(learningLoopId: string): Result<PracticeActivityListResponse> {
    const located = this.repository.findRecordByLearningLoopId(learningLoopId as never);
    if (!located) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Learning loop ${learningLoopId} was not found.`
        }
      };
    }

    const learningLoop = located.record.learningLoops.find(
      (candidate) => candidate.id === (learningLoopId as never)
    );
    if (!learningLoop) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Learning loop ${learningLoopId} was not found.`
        }
      };
    }

    const practiceActivities = located.record.practiceActivities.filter(
      (candidate) => candidate.learningLoopId === learningLoop.id
    );

    return ok(
      this.projector.projectList({
        learningLoop,
        practiceActivities
      })
    );
  }
}
