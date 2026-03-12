import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROLES, DEFAULT_WORKFLOW_TEMPLATE, WorkflowRun,
  ROLE_ID_INITIATOR, ROLE_ID_SUMMARIZER, ROLE_ID_RESEARCH, ROLE_ID_RISK, ROLE_ID_STRATEGY,
} from "../shared/workflow-types";

describe("DEFAULT_ROLES", () => {
  it("should have exactly 5 roles (1 initiator + 3 experts + 1 summarizer)", () => {
    expect(DEFAULT_ROLES).toHaveLength(5);
  });

  it("initiator role should exist and be correct type", () => {
    const initiator = DEFAULT_ROLES.find(r => r.id === ROLE_ID_INITIATOR);
    expect(initiator).toBeDefined();
    expect(initiator?.type).toBe("initiator");
  });

  it("should have exactly 3 expert roles", () => {
    const experts = DEFAULT_ROLES.filter(r => r.type === "expert");
    expect(experts).toHaveLength(3);
    experts.forEach(r => expect(r.type).toBe("expert"));
  });

  it("summarizer role should exist and be correct type", () => {
    const summarizer = DEFAULT_ROLES.find(r => r.id === ROLE_ID_SUMMARIZER);
    expect(summarizer).toBeDefined();
    expect(summarizer?.type).toBe("summarizer");
  });

  it("all roles should have non-empty systemPrompt", () => {
    DEFAULT_ROLES.forEach(role => {
      expect(role.systemPrompt.length).toBeGreaterThan(10);
    });
  });

  it("all roles should have unique string ids", () => {
    const ids = DEFAULT_ROLES.map(r => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(DEFAULT_ROLES.length);
    ids.forEach(id => expect(typeof id).toBe("string"));
  });

  it("default expert roles should be research, risk, strategy", () => {
    const expertIds = DEFAULT_ROLES.filter(r => r.type === "expert").map(r => r.id);
    expect(expertIds).toContain(ROLE_ID_RESEARCH);
    expect(expertIds).toContain(ROLE_ID_RISK);
    expect(expertIds).toContain(ROLE_ID_STRATEGY);
  });
});

describe("DEFAULT_WORKFLOW_TEMPLATE", () => {
  it("should reference valid role IDs", () => {
    const allIds = DEFAULT_ROLES.map(r => r.id);
    expect(allIds).toContain(DEFAULT_WORKFLOW_TEMPLATE.initiator.id);
    expect(allIds).toContain(DEFAULT_WORKFLOW_TEMPLATE.summarizer.id);
    DEFAULT_WORKFLOW_TEMPLATE.experts.forEach(expert => {
      expect(allIds).toContain(expert.id);
    });
  });

  it("should have 3 expert roles in default template", () => {
    expect(DEFAULT_WORKFLOW_TEMPLATE.experts).toHaveLength(3);
  });

  it("should be marked as default", () => {
    expect(DEFAULT_WORKFLOW_TEMPLATE.isDefault).toBe(true);
  });
});

describe("WorkflowRun status transitions", () => {
  it("should correctly identify completed run", () => {
    const run: WorkflowRun = {
      id: "test_1",
      templateId: DEFAULT_WORKFLOW_TEMPLATE.id,
      templateName: DEFAULT_WORKFLOW_TEMPLATE.name,
      input: "test task",
      startedAt: Date.now(),
      completedAt: Date.now(),
      roleOutputs: {},
      finalDocument: "Final document content",
      status: "completed",
    };
    expect(run.status).toBe("completed");
    expect(run.finalDocument).toBeDefined();
  });

  it("should correctly identify running phases", () => {
    const phases = ["idle", "running_role1", "running_parallel", "running_summary", "completed", "error"];
    phases.forEach(phase => {
      const run: WorkflowRun = {
        id: `test_${phase}`,
        templateId: DEFAULT_WORKFLOW_TEMPLATE.id,
        templateName: DEFAULT_WORKFLOW_TEMPLATE.name,
        input: "test",
        startedAt: Date.now(),
        roleOutputs: {},
        status: phase as WorkflowRun["status"],
      };
      expect(run.status).toBe(phase);
    });
  });
});

describe("Role data integrity", () => {
  it("each role should have required fields with correct types", () => {
    DEFAULT_ROLES.forEach(role => {
      expect(typeof role.id).toBe("string");
      expect(typeof role.name).toBe("string");
      expect(typeof role.systemPrompt).toBe("string");
      expect(typeof role.description).toBe("string");
      expect(["initiator", "expert", "summarizer"]).toContain(role.type);
    });
  });

  it("roles should have valid apiConfig when present", () => {
    DEFAULT_ROLES.forEach(role => {
      if (role.apiConfig) {
        expect(["builtin", "openai", "custom"]).toContain(role.apiConfig.provider);
        expect(["general", "data_analysis", "coding", "creative", "research", "risk", "finance", "strategy"])
          .toContain(role.apiConfig.capabilityType);
      }
    });
  });
});
