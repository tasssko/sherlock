import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function listFilesRecursively(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...listFilesRecursively(fullPath));
      continue;
    }

    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("Frontend runtime boundary", () => {
  it("depends on loop.study routes instead of Relay runtime ids or Relay routes", () => {
    const uiFiles = listFilesRecursively(join(process.cwd(), "src/app/ui"));
    const contents = uiFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(contents).not.toContain("RelayAgentRuntime");
    expect(contents).not.toContain("/v1/tasks");
    expect(contents).not.toContain("/inspection");
    expect(contents).not.toContain("relayTaskId");
    expect(contents).not.toContain("relayWorkPlanId");
  });
});
