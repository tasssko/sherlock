import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface LoadApiEnvironmentOptions {
  cwd?: string;
  environment?: NodeJS.ProcessEnv;
  mode?: string;
}

export function loadApiEnvironment(options: LoadApiEnvironmentOptions = {}): void {
  const environment = options.environment ?? process.env;
  if (environment.VITEST || environment.NODE_ENV === "test") {
    return;
  }

  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode ?? environment.NODE_ENV ?? "development";
  const candidates = [
    ".env",
    ".env.local",
    `.env.${mode}`,
    `.env.${mode}.local`
  ];

  for (const candidate of candidates) {
    const pathname = resolve(cwd, candidate);
    if (!existsSync(pathname)) {
      continue;
    }

    const parsed = parseDotEnv(readFileSync(pathname, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (environment[key] === undefined) {
        environment[key] = value;
      }
    }
  }
}

export function parseDotEnv(input: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = stripInlineComment(value);
    }

    result[key] = value.replace(/\\n/g, "\n");
  }

  return result;
}

function stripInlineComment(value: string): string {
  let inWhitespace = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === " " || character === "\t") {
      inWhitespace = true;
      continue;
    }

    if (character === "#" && inWhitespace) {
      return value.slice(0, index).trimEnd();
    }

    inWhitespace = false;
  }

  return value;
}
