import type { CreateStudyPlanCommand } from "../study/StudyPlanning.js";
import type { CreateInitialAssessmentCommand } from "../study/AssessmentGeneration.js";
import type { CreatePracticeActivityCommand } from "../study/PracticeActivities.js";
import type { StudyDay } from "../study/StudySchedule.js";
import type { LearningLoopId } from "./ids.js";

export interface ContextFact<TLabel extends string = string> {
  label: TLabel;
  value: string;
}

export interface ContextAssumption {
  id: string;
  statement: string;
}

export interface StudyScheduleEntry {
  day: StudyDay;
  minutes: number;
}

export interface StudyPlanningContextSnapshot {
  learnerName: string;
  yearGroup: string;
  objective: string;
  focusTopics: readonly string[];
  diagnosedGaps: readonly string[];
  learningLoopId?: LearningLoopId;
  schedule: readonly StudyScheduleEntry[];
  knownFacts: readonly ContextFact<"learner" | "objective" | "schedule" | "topics">[];
}

export interface InitialAssessmentContextSnapshot {
  learnerName: string;
  yearGroup: string;
  topic: string;
  questionCount: number;
  sourceName: string;
  knownFacts: readonly ContextFact<
    "learner" | "question-count" | "source" | "topic"
  >[];
}

export interface PracticeActivityContextSnapshot {
  learnerName: string;
  yearGroup: string;
  learningLoopId: LearningLoopId;
  topic: string;
  cardCount: number;
  diagnosedGaps: readonly string[];
  sourceNames: readonly string[];
  knownFacts: readonly ContextFact<
    "card-count" | "diagnosed-gaps" | "learner" | "learning-loop" | "source" | "topic"
  >[];
}

export class StudyPlanningContext {
  private constructor(private readonly snapshot: StudyPlanningContextSnapshot) {}

  static fromCommand(
    command: CreateStudyPlanCommand,
    options: {
      diagnosedGaps?: readonly string[];
      focusTopics?: readonly string[];
      learningLoopId?: LearningLoopId;
      objective?: string;
    } = {}
  ): StudyPlanningContext {
    const schedule = Object.entries(command.availableMinutesByDay).map(([day, minutes]) => ({
      day: day as StudyDay,
      minutes
    }));
    const focusTopics = [...(options.focusTopics ?? command.focusTopics)];
    const knownFacts: readonly ContextFact<
      "learner" | "objective" | "schedule" | "topics"
    >[] = [
      {
        label: "learner",
        value: `${command.learnerName} (${command.yearGroup})`
      },
      {
        label: "objective",
        value: options.objective ?? command.objective
      },
      {
        label: "topics",
        value: focusTopics.join(", ")
      },
      {
        label: "schedule",
        value: schedule
          .filter((entry) => entry.minutes > 0)
          .map((entry) => `${entry.day}: ${entry.minutes}m`)
          .join("; ")
      }
    ];

    return new StudyPlanningContext({
      learnerName: command.learnerName,
      yearGroup: command.yearGroup,
      objective: options.objective ?? command.objective,
      focusTopics,
      diagnosedGaps: [...(options.diagnosedGaps ?? [])],
      learningLoopId: options.learningLoopId,
      schedule,
      knownFacts
    });
  }

  get learnerName(): string {
    return this.snapshot.learnerName;
  }

  get yearGroup(): string {
    return this.snapshot.yearGroup;
  }

  get objective(): string {
    return this.snapshot.objective;
  }

  get focusTopics(): readonly string[] {
    return this.snapshot.focusTopics;
  }

  get diagnosedGaps(): readonly string[] {
    return this.snapshot.diagnosedGaps;
  }

  get learningLoopId(): LearningLoopId | undefined {
    return this.snapshot.learningLoopId;
  }

  get schedule(): readonly StudyScheduleEntry[] {
    return this.snapshot.schedule;
  }

  facts(): readonly ContextFact<"learner" | "objective" | "schedule" | "topics">[] {
    return this.snapshot.knownFacts;
  }

  availableMinutesByDay(): Record<StudyDay, number> {
    return this.snapshot.schedule.reduce(
      (minutesByDay, entry) => ({
        ...minutesByDay,
        [entry.day]: entry.minutes
      }),
      {} as Record<StudyDay, number>
    );
  }

  toSnapshot(): StudyPlanningContextSnapshot {
    return {
      ...this.snapshot,
      focusTopics: [...this.snapshot.focusTopics],
      diagnosedGaps: [...this.snapshot.diagnosedGaps],
      schedule: this.snapshot.schedule.map((entry) => ({ ...entry })),
      knownFacts: this.snapshot.knownFacts.map((fact) => ({ ...fact }))
    };
  }
}

export class InitialAssessmentContext {
  private constructor(private readonly snapshot: InitialAssessmentContextSnapshot) {}

  static create(input: {
    command: CreateInitialAssessmentCommand;
    sourceName: string;
  }): InitialAssessmentContext {
    const knownFacts: readonly ContextFact<
      "learner" | "question-count" | "source" | "topic"
    >[] = [
      {
        label: "learner",
        value: `${input.command.learnerName} (${input.command.yearGroup})`
      },
      {
        label: "topic",
        value: input.command.topic
      },
      {
        label: "question-count",
        value: String(input.command.questionCount)
      },
      {
        label: "source",
        value: input.sourceName
      }
    ];

    return new InitialAssessmentContext({
      learnerName: input.command.learnerName,
      yearGroup: input.command.yearGroup,
      topic: input.command.topic,
      questionCount: input.command.questionCount,
      sourceName: input.sourceName,
      knownFacts
    });
  }

  get learnerName(): string {
    return this.snapshot.learnerName;
  }

  get yearGroup(): string {
    return this.snapshot.yearGroup;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  get questionCount(): number {
    return this.snapshot.questionCount;
  }

  facts(): readonly ContextFact<"learner" | "question-count" | "source" | "topic">[] {
    return this.snapshot.knownFacts;
  }

  toSnapshot(): InitialAssessmentContextSnapshot {
    return {
      ...this.snapshot,
      knownFacts: this.snapshot.knownFacts.map((fact) => ({ ...fact }))
    };
  }
}

export class PracticeActivityContext {
  private constructor(private readonly snapshot: PracticeActivityContextSnapshot) {}

  static create(input: {
    command: CreatePracticeActivityCommand;
    diagnosedGaps: readonly string[];
    learnerName: string;
    learningLoopId: LearningLoopId;
    sourceNames: readonly string[];
    topic: string;
    yearGroup: string;
  }): PracticeActivityContext {
    const knownFacts: readonly ContextFact<
      "card-count" | "diagnosed-gaps" | "learner" | "learning-loop" | "source" | "topic"
    >[] = [
      {
        label: "learner",
        value: `${input.learnerName} (${input.yearGroup})`
      },
      {
        label: "learning-loop",
        value: input.learningLoopId
      },
      {
        label: "topic",
        value: input.topic
      },
      {
        label: "card-count",
        value: String(input.command.cardCount)
      },
      {
        label: "diagnosed-gaps",
        value: input.diagnosedGaps.join(", ")
      },
      {
        label: "source",
        value: input.sourceNames.join(", ")
      }
    ];

    return new PracticeActivityContext({
      learnerName: input.learnerName,
      yearGroup: input.yearGroup,
      learningLoopId: input.learningLoopId,
      topic: input.topic,
      cardCount: input.command.cardCount,
      diagnosedGaps: [...input.diagnosedGaps],
      sourceNames: [...input.sourceNames],
      knownFacts
    });
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  get learnerName(): string {
    return this.snapshot.learnerName;
  }

  get yearGroup(): string {
    return this.snapshot.yearGroup;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  get cardCount(): number {
    return this.snapshot.cardCount;
  }

  get diagnosedGaps(): readonly string[] {
    return this.snapshot.diagnosedGaps;
  }

  facts(): readonly ContextFact<
    "card-count" | "diagnosed-gaps" | "learner" | "learning-loop" | "source" | "topic"
  >[] {
    return this.snapshot.knownFacts;
  }

  toSnapshot(): PracticeActivityContextSnapshot {
    return {
      ...this.snapshot,
      diagnosedGaps: [...this.snapshot.diagnosedGaps],
      sourceNames: [...this.snapshot.sourceNames],
      knownFacts: this.snapshot.knownFacts.map((fact) => ({ ...fact }))
    };
  }
}
