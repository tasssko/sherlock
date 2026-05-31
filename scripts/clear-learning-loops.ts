import { DatabaseSync } from "node:sqlite";
import { clearAllLearningLoops } from "../src/modules/learning/LoopLifecyclePurge.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";

interface CliOptions {
  apply: boolean;
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

  const loopCounts = learnerKeys.map((learnerKeyValue) => {
    const learnerKey = LearnerWorkspaceKey.fromValue(learnerKeyValue);
    const record = repository.findRecord(learnerKey);
    return {
      learnerKeyValue,
      loopCount: record?.learningLoops.length ?? 0
    };
  });

  const totalLoopCount = loopCounts.reduce((sum, row) => sum + row.loopCount, 0);

  if (totalLoopCount === 0) {
    console.log("No learning loops found.");
    return;
  }

  if (!options.apply) {
    console.log(`Found ${totalLoopCount} learning loop(s) across ${loopCounts.length} learner record(s).`);
    for (const row of loopCounts) {
      if (row.loopCount > 0) {
        console.log(`- ${row.learnerKeyValue}: ${row.loopCount} loop(s)`);
      }
    }
    console.log("Dry run only. Re-run with --apply to remove all loops for every learner.");
    return;
  }

  for (const learnerKeyValue of learnerKeys) {
    const learnerKey = LearnerWorkspaceKey.fromValue(learnerKeyValue);
    const record = repository.findRecord(learnerKey);
    if (!record || record.learningLoops.length === 0) {
      continue;
    }

    const loopCount = record.learningLoops.length;
    repository.saveRecord(learnerKey, clearAllLearningLoops(record));
    console.log(`Cleared ${loopCount} loop(s) for ${learnerKeyValue}.`);
  }
}

await main();
