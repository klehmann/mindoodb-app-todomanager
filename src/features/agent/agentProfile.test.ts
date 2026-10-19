/**
 * The `agent` block of public/haven-app.json and public/agent/agent.en.md tell agents
 * what TodoManager's tools do before TodoManager runs. This keeps them in step with the
 * tools: every capability names registered tools, every tool belongs to a capability,
 * and the guide names no tool that does not exist.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkAgentManifest } from "mindoodb-app-sdk/testing";
import { describe, expect, it } from "vitest";

import { createTodoAgentTools, type TodoAgentDeps } from "@/features/agent/todoAgentTools";

// jsdom gives import.meta.url an http URL; vitest runs from the repo root.
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("TodoManager's agent profile", () => {
  it("matches the registered tools and the agent guide", () => {
    const definition = JSON.parse(read("public/haven-app.json"));
    // Only the declarations are read; no tool runs.
    const tools = createTodoAgentTools({} as TodoAgentDeps);

    const result = checkAgentManifest({
      definition,
      tools,
      guideTexts: {
        "agent.en.md": read(`public/${definition.agent.guide.en}`),
        ...Object.fromEntries(tools.map((tool) => [`${tool.name} description`, tool.description])),
      },
    });
    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it("keeps the guide within what Haven loads", () => {
    expect(new TextEncoder().encode(read("public/agent/agent.en.md")).length).toBeLessThanOrEqual(8 * 1024);
  });
});
