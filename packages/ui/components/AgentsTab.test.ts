import { describe, expect, test } from "bun:test";
import type { AgentCapabilities } from "../types";
import {
  availableTourEnginesFromCapabilities,
  buildTourLaunchParams,
  piModelOptionsFromCapabilities,
} from "./AgentsTab";

const piOnlyCapabilities: AgentCapabilities = {
  mode: "review",
  available: true,
  providers: [
    { id: "claude", name: "Claude Code", available: false },
    { id: "codex", name: "Codex CLI", available: false },
    { id: "pi", name: "Pi", available: true },
    { id: "tour", name: "Code Tour", available: true },
  ],
};

describe("AgentsTab engine derivation", () => {
  test("derives Pi as an available tour engine", () => {
    expect(availableTourEnginesFromCapabilities(piOnlyCapabilities)).toEqual(["pi"]);
  });

  test("builds Pi model options from capabilities", () => {
    const capabilities: AgentCapabilities = {
      ...piOnlyCapabilities,
      providers: piOnlyCapabilities.providers.map((provider) => provider.id === "pi"
        ? {
            ...provider,
            models: [
              { value: "openai-codex/gpt-5.5", label: "gpt-5.5 (openai-codex)" },
            ],
          }
        : provider),
    };

    expect(piModelOptionsFromCapabilities(capabilities)).toEqual([
      { value: "", label: "Pi default" },
      { value: "openai-codex/gpt-5.5", label: "gpt-5.5 (openai-codex)" },
    ]);
  });

  test("builds Pi tour launch payload with selected model and thinking", () => {
    expect(buildTourLaunchParams({
      tourEngine: "pi",
      tourClaudeModel: "sonnet",
      tourClaudeEffort: "medium",
      tourCodexModel: "gpt-5.3-codex",
      tourCodexReasoning: "medium",
      tourCodexFast: true,
      tourPiModel: "openai-codex/gpt-5.5",
      tourPiThinking: "high",
    })).toEqual({
      provider: "tour",
      label: "Code Tour",
      engine: "pi",
      model: "openai-codex/gpt-5.5",
      effort: "high",
    });
});
});
