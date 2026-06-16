import { describe, expect, test } from "bun:test";
import { parsePiJsonReviewOutput, parsePiReviewText, formatPiJsonLogEvent } from "./pi-review";

describe("parsePiReviewText", () => {
  test("parses bare JSON review output", () => {
    const output = parsePiReviewText(JSON.stringify({
      findings: [{
        severity: "important",
        file: "src/app.ts",
        line: 12,
        end_line: 13,
        description: "Null dereference on missing user.",
        reasoning: "The changed call path passes undefined when lookup fails.",
      }],
      summary: { important: 1, nit: 0, pre_existing: 0 },
    }));

    expect(output?.findings).toHaveLength(1);
    expect(output?.findings[0].file).toBe("src/app.ts");
    expect(output?.summary.important).toBe(1);
  });

  test("parses fenced JSON and derives missing summary counts", () => {
    const output = parsePiReviewText(`Here is the result:\n\n\`\`\`json\n{"findings":[{"severity":"nit","file":"src/app.ts","line":"4","end_line":"4","description":"Use the existing helper.","reasoning":"The helper handles this edge case."}]}\n\`\`\``);

    expect(output?.summary).toEqual({ important: 0, nit: 1, pre_existing: 0 });
    expect(output?.findings[0].line).toBe(4);
  });
});

describe("parsePiJsonReviewOutput", () => {
  test("extracts final assistant text from Pi JSON events", () => {
    const review = { findings: [], summary: { important: 0, nit: 0, pre_existing: 0 } };
    const stdout = [
      JSON.stringify({ type: "session", id: "abc" }),
      JSON.stringify({ type: "agent_start" }),
      JSON.stringify({
        type: "agent_end",
        messages: [
          { role: "user", content: "review this" },
          { role: "assistant", content: [{ type: "text", text: JSON.stringify(review) }] },
        ],
      }),
    ].join("\n");

    expect(parsePiJsonReviewOutput(stdout)).toEqual(review);
  });
});

describe("formatPiJsonLogEvent", () => {
  test("formats Pi text deltas", () => {
    const line = JSON.stringify({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "checking diff" },
    });

    expect(formatPiJsonLogEvent(line)).toBe("checking diff");
  });

  test("hides session events", () => {
    expect(formatPiJsonLogEvent(JSON.stringify({ type: "session" }))).toBeNull();
  });
});
