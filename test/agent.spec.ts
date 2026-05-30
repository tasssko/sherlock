import { describe, expect, it } from "vitest";
import { capabilityCatalog } from "../src/domain/primitives/Capability.js";
import { createAgent, agentCanUseCapability } from "../src/domain/primitives/Agent.js";

describe("Agent capabilities", () => {
  it("does not allow undeclared capabilities", () => {
    const agent = createAgent({
      role: "reviewer",
      purpose: "Review outputs.",
      capabilities: [capabilityCatalog.createArtifact.id],
      policies: []
    });

    expect(agentCanUseCapability(agent, capabilityCatalog.generateStudyPlan.id)).toBe(false);
  });
});

