import { describe, expect, it } from "vitest";
import {
  createPlayfulLearnerName,
  getPersistentPlayfulLearnerName
} from "../src/app/ui/playfulLearnerName.js";

describe("playful learner names", () => {
  it("generates a playful adjective-animal default", () => {
    const values = [0, 0];
    const name = createPlayfulLearnerName(() => values.shift() ?? 0);

    expect(name).toBe("Clumsy Koala");
  });

  it("reuses a stored learner name when one already exists", () => {
    const storage = {
      getItem: () => "Curious Otter",
      setItem: () => {
        throw new Error("should not overwrite an existing name");
      }
    };

    expect(getPersistentPlayfulLearnerName(storage)).toBe("Curious Otter");
  });

  it("stores a generated learner name for later reuse", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      }
    };
    const values = [0, 0];

    const name = getPersistentPlayfulLearnerName(storage, () => values.shift() ?? 0);

    expect(name).toBe("Clumsy Koala");
    expect(stored).toBe("Clumsy Koala");
  });
});
