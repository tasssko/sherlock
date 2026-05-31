import { DatabaseSync } from "node:sqlite";
import {
  findPurgeableLearningLoops,
  purgeLearningLoops
} from "../src/modules/learning/LoopLifecyclePurge.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";

interface CliOptions {
  apply: boolean;
  dbPath: string;
  loopId?: string;
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
    return record ? findPurgeableLearningLoops(key, record) : [];
  });

  const selectedCandidates = options.loopId
    ? candidates.filter((candidate) => candidate.learningLoopId === options.loopId)
    : candidates;

  if (selectedCandidates.length === 0) {
    console.log("No purgeable learning loops found.");
    return;
  }

  if (!options.apply) {
    console.log("Purgeable learning loops:");
    for (const candidate of selectedCandidates) {
      console.log(
        `- ${candidate.learningLoopId} [${candidate.learnerKey}] topic=${candidate.topic} phase=${candidate.phase} status=${candidate.status}`
      );
    }
    console.log("Dry run only. Re-run with --apply to permanently purge these loops.");
    return;
  }

  const candidatesByLearner = new Map<string, string[]>();
  for (const candidate of selectedCandidates) {
    const ids = candidatesByLearner.get(candidate.learnerKey) ?? [];
    ids.push(candidate.learningLoopId);
    candidatesByLearner.set(candidate.learnerKey, ids);
  }

  for (const [learnerKeyValue, loopIds] of candidatesByLearner.entries()) {
    const learnerKey = LearnerWorkspaceKey.fromValue(learnerKeyValue);
    const record = repository.findRecord(learnerKey);
    if (!record) {
      console.log(`Skipping ${learnerKeyValue}: learner record was not found.`);
      continue;
    }

    const purged = purgeLearningLoops(record, loopIds);
    if (!purged.ok) {
      console.log(`Failed to purge loops for ${learnerKeyValue}: ${purged.error.message}`);
      continue;
    }

    repository.saveRecord(learnerKey, purged.value);
    for (const loopId of loopIds) {
      console.log(`Purged ${loopId} for ${learnerKeyValue}.`);
    }
  }
}

await main();
