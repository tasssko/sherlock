const learnerNameStorageKey = "loop.study:default-learner-name";

const adjectives = [
  "Clumsy",
  "Curious",
  "Daring",
  "Bouncy",
  "Cheeky",
  "Gentle",
  "Jolly",
  "Lucky",
  "Merry",
  "Nimble",
  "Sunny",
  "Wiggly"
] as const;

const animals = [
  "Koala",
  "Otter",
  "Panda",
  "Penguin",
  "Fox",
  "Badger",
  "Lemur",
  "Tiger",
  "Dolphin",
  "Falcon",
  "Rabbit",
  "Tortoise"
] as const;

type LearnerNameStorage = Pick<Storage, "getItem" | "setItem">;

function pickFrom<TValue>(values: readonly TValue[], random: () => number): TValue {
  const index = Math.floor(random() * values.length);
  return values[index] as TValue;
}

export function createPlayfulLearnerName(random: () => number = Math.random): string {
  return `${pickFrom(adjectives, random)} ${pickFrom(animals, random)}`;
}

export function getPersistentPlayfulLearnerName(
  storage: LearnerNameStorage | null,
  random: () => number = Math.random
): string {
  if (!storage) {
    return createPlayfulLearnerName(random);
  }

  const stored = storage.getItem(learnerNameStorageKey)?.trim();
  if (stored) {
    return stored;
  }

  const generated = createPlayfulLearnerName(random);
  storage.setItem(learnerNameStorageKey, generated);
  return generated;
}
