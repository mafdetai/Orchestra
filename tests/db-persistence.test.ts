import { describe, it, expect } from "vitest";
import { DEFAULT_WORKFLOW_TEMPLATE, WorkflowRun, WorkflowStatus } from "../shared/workflow-types";

// ── 模拟 dbRunToWorkflowRun 转换逻辑（与 workflow-context.tsx 保持一致） ──────────

type DbRunRow = {
  id: string;
  templateId: string;
  templateName: string;
  task: string;
  status: string;
  initiatorOutput: string | null;
  expertOutputs: string | null;
  summaryOutput: string | null;
  completedExperts: number;
  expertCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function dbRunToWorkflowRun(row: DbRunRow): WorkflowRun {
  const expertOutputsArr: Array<{ roleId: string; roleName: string; output: string }> =
    row.expertOutputs ? JSON.parse(row.expertOutputs) : [];

  const roleOutputs: Record<string, { roleId: string; output: string; status: "idle" | "running" | "completed" | "error" }> = {};
  if (row.initiatorOutput) {
    roleOutputs["initiator"] = { roleId: "initiator", output: row.initiatorOutput, status: "completed" };
  }
  for (const e of expertOutputsArr) {
    roleOutputs[e.roleId] = { roleId: e.roleId, output: e.output, status: "completed" };
  }
  if (row.summaryOutput) {
    roleOutputs["summarizer"] = { roleId: "summarizer", output: row.summaryOutput, status: "completed" };
  }

  const toMs = (v: string | Date) => {
    if (typeof v === "string") return new Date(v).getTime();
    return v.getTime();
  };

  return {
    id: row.id,
    templateId: row.templateId,
    templateName: row.templateName,
    input: row.task,
    status: (row.status as WorkflowStatus) ?? "completed",
    roleOutputs,
    finalDocument: row.summaryOutput ?? "",
    startedAt: toMs(row.createdAt),
    completedAt: toMs(row.updatedAt),
  };
}

// ── 测试套件 ──────────────────────────────────────────────────────────────────

describe("dbRunToWorkflowRun", () => {
  const now = new Date("2026-03-02T07:00:00.000Z");
  const later = new Date("2026-03-02T07:05:00.000Z");

  const baseRow: DbRunRow = {
    id: "run_001",
    templateId: DEFAULT_WORKFLOW_TEMPLATE.id,
    templateName: DEFAULT_WORKFLOW_TEMPLATE.name,
    task: "分析人工智能对教育的影响",
    status: "completed",
    initiatorOutput: "引导者分析结果",
    expertOutputs: JSON.stringify([
      { roleId: "role_research", roleName: "研究专家", output: "研究报告内容" },
      { roleId: "role_risk", roleName: "风险专家", output: "风险评估内容" },
    ]),
    summaryOutput: "最终综合报告",
    completedExperts: 2,
    expertCount: 2,
    createdAt: now,
    updatedAt: later,
  };

  it("should correctly map id, templateId, templateName", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.id).toBe("run_001");
    expect(run.templateId).toBe(DEFAULT_WORKFLOW_TEMPLATE.id);
    expect(run.templateName).toBe(DEFAULT_WORKFLOW_TEMPLATE.name);
  });

  it("should map task to input field", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.input).toBe("分析人工智能对教育的影响");
  });

  it("should map status correctly", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.status).toBe("completed");
  });

  it("should map summaryOutput to finalDocument", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.finalDocument).toBe("最终综合报告");
  });

  it("should map createdAt to startedAt (milliseconds)", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.startedAt).toBe(now.getTime());
  });

  it("should map updatedAt to completedAt (milliseconds)", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.completedAt).toBe(later.getTime());
  });

  it("should parse initiatorOutput into roleOutputs", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.roleOutputs["initiator"]).toBeDefined();
    expect(run.roleOutputs["initiator"].output).toBe("引导者分析结果");
    expect(run.roleOutputs["initiator"].status).toBe("completed");
  });

  it("should parse expertOutputs JSON into roleOutputs", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.roleOutputs["role_research"]).toBeDefined();
    expect(run.roleOutputs["role_research"].output).toBe("研究报告内容");
    expect(run.roleOutputs["role_risk"]).toBeDefined();
    expect(run.roleOutputs["role_risk"].output).toBe("风险评估内容");
  });

  it("should parse summaryOutput into summarizer roleOutput", () => {
    const run = dbRunToWorkflowRun(baseRow);
    expect(run.roleOutputs["summarizer"]).toBeDefined();
    expect(run.roleOutputs["summarizer"].output).toBe("最终综合报告");
  });

  it("should handle null initiatorOutput gracefully", () => {
    const row = { ...baseRow, initiatorOutput: null };
    const run = dbRunToWorkflowRun(row);
    expect(run.roleOutputs["initiator"]).toBeUndefined();
  });

  it("should handle null expertOutputs gracefully", () => {
    const row = { ...baseRow, expertOutputs: null };
    const run = dbRunToWorkflowRun(row);
    expect(run.roleOutputs["role_research"]).toBeUndefined();
    expect(run.roleOutputs["role_risk"]).toBeUndefined();
  });

  it("should handle null summaryOutput gracefully", () => {
    const row = { ...baseRow, summaryOutput: null };
    const run = dbRunToWorkflowRun(row);
    expect(run.finalDocument).toBe("");
    expect(run.roleOutputs["summarizer"]).toBeUndefined();
  });

  it("should handle string date format (JSON serialized)", () => {
    const row: DbRunRow = {
      ...baseRow,
      createdAt: "2026-03-02T07:00:00.000Z",
      updatedAt: "2026-03-02T07:05:00.000Z",
    };
    const run = dbRunToWorkflowRun(row);
    expect(run.startedAt).toBe(now.getTime());
    expect(run.completedAt).toBe(later.getTime());
  });

  it("should handle error status", () => {
    const row = { ...baseRow, status: "error" };
    const run = dbRunToWorkflowRun(row);
    expect(run.status).toBe("error");
  });

  it("should handle running status", () => {
    const row = { ...baseRow, status: "running" };
    const run = dbRunToWorkflowRun(row);
    expect(run.status).toBe("running");
  });
});

describe("WorkflowRun data model integrity", () => {
  it("should have all required fields", () => {
    const run: WorkflowRun = {
      id: "test_run",
      templateId: "tpl_001",
      templateName: "测试工作流",
      input: "测试任务",
      startedAt: Date.now(),
      roleOutputs: {},
      status: "completed",
    };
    expect(run.id).toBeDefined();
    expect(run.templateId).toBeDefined();
    expect(run.templateName).toBeDefined();
    expect(run.input).toBeDefined();
    expect(run.startedAt).toBeDefined();
    expect(run.status).toBeDefined();
  });

  it("should support optional fields", () => {
    const run: WorkflowRun = {
      id: "test_run",
      templateId: "tpl_001",
      templateName: "测试工作流",
      input: "测试任务",
      startedAt: Date.now(),
      completedAt: Date.now() + 5000,
      roleOutputs: { "initiator": { roleId: "initiator", output: "output", status: "completed" } },
      finalDocument: "最终文档",
      status: "completed",
    };
    expect(run.completedAt).toBeDefined();
    expect(run.finalDocument).toBeDefined();
    expect(Object.keys(run.roleOutputs)).toHaveLength(1);
  });

  it("all valid status values should be accepted", () => {
    const validStatuses: WorkflowStatus[] = [
      "idle", "running_role1", "running_parallel", "running_summary", "completed", "error"
    ];
    validStatuses.forEach(status => {
      const run: WorkflowRun = {
        id: `run_${status}`,
        templateId: "tpl_001",
        templateName: "测试",
        input: "任务",
        startedAt: Date.now(),
        roleOutputs: {},
        status,
      };
      expect(run.status).toBe(status);
    });
  });
});

describe("Workflow template persistence data model", () => {
  it("DEFAULT_WORKFLOW_TEMPLATE should be serializable to JSON", () => {
    const json = JSON.stringify(DEFAULT_WORKFLOW_TEMPLATE);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(DEFAULT_WORKFLOW_TEMPLATE.id);
    expect(parsed.name).toBe(DEFAULT_WORKFLOW_TEMPLATE.name);
    expect(parsed.initiator.id).toBe(DEFAULT_WORKFLOW_TEMPLATE.initiator.id);
    expect(parsed.experts).toHaveLength(DEFAULT_WORKFLOW_TEMPLATE.experts.length);
    expect(parsed.summarizer.id).toBe(DEFAULT_WORKFLOW_TEMPLATE.summarizer.id);
  });

  it("should preserve all role configurations after JSON round-trip", () => {
    const json = JSON.stringify(DEFAULT_WORKFLOW_TEMPLATE);
    const parsed = JSON.parse(json);
    
    expect(parsed.initiator.systemPrompt).toBe(DEFAULT_WORKFLOW_TEMPLATE.initiator.systemPrompt);
    expect(parsed.initiator.apiConfig.provider).toBe("builtin");
    
    parsed.experts.forEach((expert: { apiConfig: { provider: string } }, i: number) => {
      expect(expert.apiConfig.provider).toBe(DEFAULT_WORKFLOW_TEMPLATE.experts[i].apiConfig?.provider);
    });
  });
});
