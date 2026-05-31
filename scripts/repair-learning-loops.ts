import { DatabaseSync } from "node:sqlite";
import { findStrandedLearningLoops, supersedeLearningLoop } from "../src/modules/learning/LoopLifecycleRepair.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";

interface CliOptions {
  apply: boolean;
  loopId?: string;
  dbPath: string;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    dbPath: process.env.SHERLOCK_DB_PATH ?? "./data/sherlock.sqlite"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--loop-id" && next) {
      options.loopId = next;
      index += 1;
      continue;
    }
    if (arg === "--db" && next) {
      options.dbPath = next;
      index += 1;
    }
  }

  return options;
}

function loadLearnerKeys(pathname: string): readonly string[] {
  const database = new DatabaseSync(pathname);
  try {
    const rows = database
      .prepare("select learner_key from workspaces order by learner_key asc")
      .all() as { learner_key: string }[];
    return rows.map((row) => row.learner_key);
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const repository = new SqliteLearningLoopRepository(options.dbPath);
  const learnerKeys = loadLearnerKeys(options.dbPath);
  const candidates = learnerKeys.flatMap((keyValue) => {
    const key = LearnerWorkspaceKey.fromValue(keyValue);
    const record = repository.findRecord(key);
    return record ? findStrandedLearningLoops(key, record) : [];
  });

  const selectedCandidates = options.loopId
    ? candidates.filter((candidate) => candidate.learningLoopId === options.loopId)
    : candidates;

  if (selectedCandidates.length === 0) {
    console.log("No stranded learning loops found.");
    return;
  }

  if (!options.apply) {
    console.log("Stranded learning loops:");
    for (const candidate of selectedCandidates) {
      console.log(
        `- ${candidate.learningLoopId} [${candidate.learnerKey}] topic=${candidate.topic} phase=${candidate.phase} status=${candidate.status}`
      );
    }
    console.log("Dry run only. Re-run with --apply to supersede these loops.");
    return;
  }

  for (const candidate of selectedCandidates) {
    const key = LearnerWorkspaceKey.fromValue(candidate.learnerKey);
    const record = repository.findRecord(key);
    if (!record) {
      console.log(`Skipping ${candidate.learningLoopId}: learner record ${candidate.learnerKey} was not found.`);
      continue;
    }

    const repaired = supersedeLearningLoop(record, candidate.learningLoopId);
    if (!repaired.ok) {
      console.log(`Failed to repair ${candidate.learningLoopId}: ${repaired.error.message}`);
      continue;
    }

    repository.saveRecord(key, repaired.value);
    console.log(`Superseded ${candidate.learningLoopId} for ${candidate.learnerKey}.`);
  }
}

await main();
