import type { StudyDay } from "../../../domain/study/StudySchedule.js";
import type { UploadMasterDataCommand } from "../../../domain/study/MasterDataUpload.js";
import type { LoopSetupValues } from "../components/LoopSetupForm.js";

const weeklyMinutes: Record<StudyDay, number> = {
  Monday: 30,
  Tuesday: 30,
  Wednesday: 30,
  Thursday: 30,
  Friday: 30,
  Saturday: 60,
  Sunday: 0
};

export const year7DemoLoopSetup: LoopSetupValues = {
  learnerName: "Ava Patel",
  yearGroup: "Year 7",
  topic: "fractions",
  objective:
    "Build steady confidence across fractions, forces, and French vocabulary through short study sessions and active review.",
  questionCount: 5,
  practiceCardCount: 5,
  availableMinutesByDay: weeklyMinutes
};

export const year7DemoMasterData: UploadMasterDataCommand = {
  sourceName: "Year 7 Golden Path Seed",
  items: [
    {
      topic: "fractions",
      prompt: "Simplify 6/8.",
      canonicalAnswer: "three quarters",
      visibleMaterial:
        "Fractions can be simplified by dividing numerator and denominator by the same number.",
      keywords: ["simplify", "equivalent fractions"]
    },
    {
      topic: "fractions",
      prompt: "Which is larger: 2/3 or 3/5?",
      canonicalAnswer: "two thirds",
      visibleMaterial:
        "Compare fractions by finding common denominators or decimal equivalents.",
      keywords: ["compare fractions"]
    },
    {
      topic: "forces",
      prompt: "What force pulls objects toward Earth?",
      canonicalAnswer: "gravity",
      visibleMaterial: "Gravity is the force that pulls objects toward the centre of the Earth.",
      keywords: ["gravity", "forces"]
    },
    {
      topic: "forces",
      prompt: "What do we call a force that slows moving objects?",
      canonicalAnswer: "friction",
      visibleMaterial:
        "Friction is a force between surfaces that can slow movement down.",
      keywords: ["friction"]
    },
    {
      topic: "French vocabulary",
      prompt: "What is the French word for apple?",
      canonicalAnswer: "pomme",
      visibleMaterial: "La pomme means apple in French.",
      keywords: ["fruit", "French vocabulary"]
    },
    {
      topic: "French vocabulary",
      prompt: "How do you say 'I am twelve' in French?",
      canonicalAnswer: "j ai douze ans",
      visibleMaterial: "J'ai douze ans means I am twelve years old.",
      keywords: ["age", "French"]
    }
  ]
};

export const year7DemoTopics = ["fractions", "forces", "French vocabulary"] as const;
