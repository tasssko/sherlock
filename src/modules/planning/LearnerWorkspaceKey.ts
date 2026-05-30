import type { CreateStudyPlanCommand } from "../../domain/study/StudyPlanning.js";

export class LearnerWorkspaceKey {
  private constructor(public readonly value: string) {}

  static fromValue(value: string): LearnerWorkspaceKey {
    return new LearnerWorkspaceKey(value);
  }

  static fromCommand(command: CreateStudyPlanCommand): LearnerWorkspaceKey {
    return LearnerWorkspaceKey.fromLearner(command.learnerName, command.yearGroup);
  }

  static fromLearner(learnerName: string, yearGroup: string): LearnerWorkspaceKey {
    return new LearnerWorkspaceKey(`${learnerName.toLowerCase()}::${yearGroup.toLowerCase()}`);
  }
}
