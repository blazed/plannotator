import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPlannotatorConfig, formatTodoList, renderTemplate, resolveJjDefaultDiffType, resolvePhaseProfile, resolvePlanRoot } from "./config";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("plannotator config", () => {
  test("loads the shipped internal base config", () => {
    const cwdDir = makeTempDir("plannotator-config-base-");
    process.env.HOME = makeTempDir("plannotator-config-home-base-");

    const loaded = loadPlannotatorConfig(cwdDir);
    const planning = resolvePhaseProfile(loaded.config, "planning");

    expect(loaded.warnings).toEqual([]);
    expect(planning.statusLabel).toBe("⏸ plan");
    expect(planning.activeTools).toEqual([
      "grep",
      "find",
      "ls",
      "ask_user_question",
      "web_search",
      "fetch_content",
      "get_search_content",
      "code_search",
      "jj_context",
      "jj_todo",
      "plannotator_submit_plan",
    ]);
  });

  test("loads Pi defaults for external plan storage and configured JJ review diff", () => {
    const cwdDir = makeTempDir("plannotator-config-jj-default-");
    process.env.HOME = makeTempDir("plannotator-config-home-jj-default-");

    const loaded = loadPlannotatorConfig(cwdDir);

    expect(loaded.warnings).toEqual([]);
    expect(resolveJjDefaultDiffType(loaded.config)).toBe("jj-line");
    expect(resolvePlanRoot(loaded.config, cwdDir)).toBe(join(process.env.HOME!, ".pi", "agent", "plannotator-plans"));
  });

  test("allows a project config to clear an inherited phase with null", () => {
    const homeDir = makeTempDir("plannotator-config-home-null-");
    const cwdDir = makeTempDir("plannotator-config-cwd-null-");
    process.env.HOME = homeDir;

    const globalConfigDir = join(homeDir, ".pi", "agent");
    const projectConfigDir = join(cwdDir, ".pi");
    mkdirSync(globalConfigDir, { recursive: true });
    mkdirSync(projectConfigDir, { recursive: true });
    writeFileSync(
      join(globalConfigDir, "plannotator.json"),
      JSON.stringify({
        phases: { planning: { statusLabel: "global", activeTools: ["bash"] } },
      }),
      "utf-8",
    );
    writeFileSync(
      join(projectConfigDir, "plannotator.json"),
      JSON.stringify({
        phases: { planning: null },
      }),
      "utf-8",
    );

    const loaded = loadPlannotatorConfig(cwdDir);
    const planning = resolvePhaseProfile(loaded.config, "planning");

    expect(loaded.warnings).toEqual([]);
    expect(planning.statusLabel).toBeUndefined();
    expect(planning.activeTools).toBeUndefined();
  });

  test("loads global and project configs with project precedence", () => {
    const homeDir = makeTempDir("plannotator-config-home-");
    const cwdDir = makeTempDir("plannotator-config-cwd-");
    process.env.HOME = homeDir;

    const globalConfigDir = join(homeDir, ".pi", "agent");
    const projectConfigDir = join(cwdDir, ".pi");
    mkdirSync(globalConfigDir, { recursive: true });
    mkdirSync(projectConfigDir, { recursive: true });
    writeFileSync(
      join(globalConfigDir, "plannotator.json"),
      JSON.stringify({
        defaults: {
          thinking: "low",
          model: { provider: "anthropic", id: "claude-sonnet-4-5" },
        },
        phases: { planning: { statusLabel: "global", activeTools: ["bash"] } },
      }),
      "utf-8",
    );
    writeFileSync(
      join(projectConfigDir, "plannotator.json"),
      JSON.stringify({
        defaults: { thinking: null, model: null },
        phases: { planning: { statusLabel: "project", activeTools: [] } },
      }),
      "utf-8",
    );

    const loaded = loadPlannotatorConfig(cwdDir);
    const planning = resolvePhaseProfile(loaded.config, "planning");

    expect(loaded.warnings).toEqual([]);
    expect(planning.thinking).toBeUndefined();
    expect(planning.model).toBeUndefined();
    expect(planning.statusLabel).toBe("project");
    expect(planning.activeTools).toEqual([]);
  });

  test("loads planRoot and jjDefaultDiffType with project precedence", () => {
    const homeDir = makeTempDir("plannotator-config-home-plans-");
    const cwdDir = makeTempDir("plannotator-config-cwd-plans-");
    process.env.HOME = homeDir;

    const globalConfigDir = join(homeDir, ".pi", "agent");
    const projectConfigDir = join(cwdDir, ".pi");
    mkdirSync(globalConfigDir, { recursive: true });
    mkdirSync(projectConfigDir, { recursive: true });
    writeFileSync(
      join(globalConfigDir, "plannotator.json"),
      JSON.stringify({ planRoot: "~/global-plans", jjDefaultDiffType: "jj-current" }),
      "utf-8",
    );
    writeFileSync(
      join(projectConfigDir, "plannotator.json"),
      JSON.stringify({ planRoot: "project-plans", jjDefaultDiffType: "jj-line" }),
      "utf-8",
    );

    const loaded = loadPlannotatorConfig(cwdDir);

    expect(loaded.warnings).toEqual([]);
    expect(resolvePlanRoot(loaded.config, cwdDir)).toBe(join(cwdDir, "project-plans"));
    expect(resolveJjDefaultDiffType(loaded.config)).toBe("jj-line");
  });

  test("expands leading home in planRoot and ignores unsupported JJ defaults", () => {
    const homeDir = makeTempDir("plannotator-config-home-expand-");
    const cwdDir = makeTempDir("plannotator-config-cwd-expand-");
    process.env.HOME = homeDir;

    const projectConfigDir = join(cwdDir, ".pi");
    mkdirSync(projectConfigDir, { recursive: true });
    writeFileSync(
      join(projectConfigDir, "plannotator.json"),
      JSON.stringify({ planRoot: "~/plans", jjDefaultDiffType: "merge-base" }),
      "utf-8",
    );

    const loaded = loadPlannotatorConfig(cwdDir);

    expect(resolvePlanRoot(loaded.config, cwdDir)).toBe(join(homeDir, "plans"));
    expect(resolveJjDefaultDiffType(loaded.config)).toBe("jj-line");
  });

  test("allows project config to clear inherited default planRoot and JJ default", () => {
    const homeDir = makeTempDir("plannotator-config-home-clear-");
    const cwdDir = makeTempDir("plannotator-config-cwd-clear-");
    process.env.HOME = homeDir;

    const globalConfigDir = join(homeDir, ".pi", "agent");
    const projectConfigDir = join(cwdDir, ".pi");
    mkdirSync(globalConfigDir, { recursive: true });
    mkdirSync(projectConfigDir, { recursive: true });
    writeFileSync(
      join(globalConfigDir, "plannotator.json"),
      JSON.stringify({ planRoot: "~/global-plans", jjDefaultDiffType: "jj-last" }),
      "utf-8",
    );
    writeFileSync(
      join(projectConfigDir, "plannotator.json"),
      JSON.stringify({ planRoot: null, jjDefaultDiffType: null }),
      "utf-8",
    );

    const loaded = loadPlannotatorConfig(cwdDir);

    expect(resolvePlanRoot(loaded.config, cwdDir)).toBeUndefined();
    expect(resolveJjDefaultDiffType(loaded.config)).toBeUndefined();
  });

  test("treats empty strings as clearing values", () => {
    const profile = resolvePhaseProfile(
      {
        defaults: { statusLabel: "base", systemPrompt: "base prompt", activeTools: ["bash"] },
        phases: { planning: { statusLabel: "", systemPrompt: "", activeTools: [] } },
      },
      "planning",
    );

    expect(profile.statusLabel).toBeUndefined();
    expect(profile.systemPrompt).toBeUndefined();
    expect(profile.activeTools).toEqual([]);
  });

  test("allows clearing an entire phase with null", () => {
    const profile = resolvePhaseProfile(
      {
        defaults: { thinking: "low", activeTools: ["bash"], statusLabel: "base" },
        phases: { planning: null },
      },
      "planning",
    );

    expect(profile.thinking).toBe("low");
    expect(profile.activeTools).toEqual(["bash"]);
    expect(profile.statusLabel).toBe("base");
  });

  test("renders prompt templates and reports unknown variables", () => {
    const rendered = renderTemplate("Hello ${name} ${missing}", {
      planFilePath: "PLAN.md",
      planFileGuidance: "Choose a plan file.",
      todoList: "- [ ] A",
      completedCount: 1,
      totalCount: 2,
      remainingCount: 1,
      phase: "planning",
    });

    expect(rendered.text).toBe("Hello  ");
    expect(rendered.unknownVariables).toEqual(["name", "missing"]);
  });

  test("formats todo lists from checklist items", () => {
    const stats = formatTodoList([
      { step: 1, text: "First", completed: true },
      { step: 2, text: "Second", completed: false },
      { step: 3, text: "Third", completed: false },
    ]);

    expect(stats.completedCount).toBe(1);
    expect(stats.totalCount).toBe(3);
    expect(stats.remainingCount).toBe(2);
    expect(stats.todoList).toBe("- [ ] 2. Second\n- [ ] 3. Third");
  });
});
