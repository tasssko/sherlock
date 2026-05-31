import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadApiEnvironment, parseDotEnv } from "../src/app/api/loadApiEnvironment.js";

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const pathname = tempDirectories.pop();
    if (pathname) {
      rmSync(pathname, { recursive: true, force: true });
    }
  }
});

describe("loadApiEnvironment", () => {
  it("loads development env files in Vite-like precedence order without overriding shell env", () => {
    const cwd = mkdtempSync(join(tmpdir(), "loop-study-env-"));
    tempDirectories.push(cwd);

    writeFileSync(join(cwd, ".env"), "BASE_ONLY=base\nSHARED=base\n");
    writeFileSync(join(cwd, ".env.local"), "LOCAL_ONLY=local\nSHARED=local\n");
    writeFileSync(join(cwd, ".env.development"), "DEV_ONLY=dev\nSHARED=dev\n");
    writeFileSync(
      join(cwd, ".env.development.local"),
      "DEV_LOCAL_ONLY=dev-local\nLOOP_STUDY_INTELLIGENCE=openai\nSHARED=dev-local\n"
    );

    const environment: NodeJS.ProcessEnv = {
      SHARED: "shell"
    };

    loadApiEnvironment({
      cwd,
      environment,
      mode: "development"
    });

    expect(environment.BASE_ONLY).toBe("base");
    expect(environment.LOCAL_ONLY).toBe("local");
    expect(environment.DEV_ONLY).toBe("dev");
    expect(environment.DEV_LOCAL_ONLY).toBe("dev-local");
    expect(environment.LOOP_STUDY_INTELLIGENCE).toBe("openai");
    expect(environment.SHARED).toBe("shell");
  });

  it("parses quoted values and inline comments", () => {
    const parsed = parseDotEnv(`
      OPENAI_API_KEY="test-key"
      LOOP_STUDY_INTELLIGENCE=openai # preferred runtime
      MULTILINE="line1\\nline2"
    `);

    expect(parsed).toEqual({
      OPENAI_API_KEY: "test-key",
      LOOP_STUDY_INTELLIGENCE: "openai",
      MULTILINE: "line1\nline2"
    });
  });
});
