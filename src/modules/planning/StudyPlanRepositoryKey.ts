import type { CreateStudyPlanCommand } from "../../domain/study/StudyPlanning.js";

export class StudyPlanRepositoryKey {
  private constructor(public readonly value: string) {}

  static fromValue(value: string): StudyPlanRepositoryKey {
    return new StudyPlanRepositoryKey(value);
  }

  static fromCommand(command: CreateStudyPlanCommand): StudyPlanRepositoryKey {
    return StudyPlanRepositoryKey.fromLearner(command.learnerName, command.yearGroup);
  }

  static fromLearner(learnerName: string, yearGroup: string): StudyPlanRepositoryKey {
    return new StudyPlanRepositoryKey(`${learnerName.toLowerCase()}::${yearGroup.toLowerCase()}`);
  }
}
