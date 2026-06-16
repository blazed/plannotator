import { describe, expect, test } from "bun:test";
import { buildAgentCapabilities, parsePiListModelsOutput } from "./agent-jobs";

describe("buildAgentCapabilities", () => {
  test("enables tour when only Pi is available", () => {
    const capabilities = buildAgentCapabilities("review", {
      claude: false,
      codex: false,
      pi: true,
    });

    expect(capabilities.available).toBe(true);
    expect(capabilities.providers.find((p) => p.id === "pi")?.available).toBe(true);
    expect(capabilities.providers.find((p) => p.id === "tour")?.available).toBe(true);
  });

  test("disables tour when no supported engine is available", () => {
    const capabilities = buildAgentCapabilities("review", {
      claude: false,
      codex: false,
      pi: false,
    });

    expect(capabilities.available).toBe(false);
    expect(capabilities.providers.find((p) => p.id === "tour")?.available).toBe(false);
  });
});


describe("parsePiListModelsOutput", () => {
  test("parses Pi table output into provider-qualified model options", () => {
    const output = `provider      model                   context  max-out  thinking  images
margot        qwen3.6:27b-q8          262.1K   32.8K    yes       yes
openai-codex  gpt-5.5                 272K     128K     yes       yes
`;

    expect(parsePiListModelsOutput(output)).toEqual([
      {
        value: "margot/qwen3.6:27b-q8",
        label: "qwen3.6:27b-q8 (margot)",
        provider: "margot",
        model: "qwen3.6:27b-q8",
        context: "262.1K",
        maxOutput: "32.8K",
        thinking: true,
        images: true,
      },
      {
        value: "openai-codex/gpt-5.5",
        label: "gpt-5.5 (openai-codex)",
        provider: "openai-codex",
        model: "gpt-5.5",
        context: "272K",
        maxOutput: "128K",
        thinking: true,
        images: true,
      },
    ]);
  });
});
