import { describe, expect, test } from "bun:test";
import {
	getToolsForPhase,
	isPlanWritePathAllowed,
	PLAN_SUBMIT_TOOL,
	resolvePlanWritePath,
	stripPlanningOnlyTools,
	validatePlanningJjTodoInput,
} from "./tool-scope";

describe("pi plan tool scoping", () => {
	test("planning phase adds the submit tool and discovery helpers", () => {
		expect(getToolsForPhase(["read", "bash", "edit", "write"], "planning")).toEqual([
			"read",
			"bash",
			"edit",
			"write",
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
			PLAN_SUBMIT_TOOL,
		]);
	});

	test("idle and executing phases strip the planning-only submit tool", () => {
		const leakedTools = ["read", "bash", "grep", PLAN_SUBMIT_TOOL, "write"];

		expect(getToolsForPhase(leakedTools, "idle")).toEqual([
			"read",
			"bash",
			"grep",
			"write",
		]);
		expect(getToolsForPhase(leakedTools, "executing")).toEqual([
			"read",
			"bash",
			"grep",
			"write",
		]);
	});

	test("stripping planning-only tools preserves unrelated tools", () => {
		expect(stripPlanningOnlyTools([PLAN_SUBMIT_TOOL, "todo", "question", "read"])).toEqual([
			"todo",
			"question",
			"read",
		]);
	});
});

	test("guards jj_todo create and update during planning", () => {
		expect(validatePlanningJjTodoInput({ action: "list" })).toBeNull();
		expect(validatePlanningJjTodoInput({ action: "create", dryRun: true, fresh: false })).toBeNull();
		expect(validatePlanningJjTodoInput({ action: "update", dryRun: true, fresh: false })).toBeNull();
		expect(validatePlanningJjTodoInput({ action: "create", dryRun: false, fresh: false })).toContain("dryRun: true");
		expect(validatePlanningJjTodoInput({ action: "update", dryRun: true })).toContain("fresh: false");
	});

describe("plan write path gate", () => {
	const cwd = "/r";

	test("allows markdown files anywhere inside cwd", () => {
		expect(isPlanWritePathAllowed("PLAN.md", cwd)).toBe(true);
		expect(isPlanWritePathAllowed("plans/auth.md", cwd)).toBe(true);
		expect(isPlanWritePathAllowed("deeply/nested/dir/notes.mdx", cwd)).toBe(true);
	});

	test("rejects non-markdown extensions", () => {
		expect(isPlanWritePathAllowed("src/app.ts", cwd)).toBe(false);
		expect(isPlanWritePathAllowed("notes.txt", cwd)).toBe(false);
		expect(isPlanWritePathAllowed("config.json", cwd)).toBe(false);
	});

	test("rejects files with no extension or bare directories", () => {
		expect(isPlanWritePathAllowed("plans", cwd)).toBe(false);
		expect(isPlanWritePathAllowed("PLAN", cwd)).toBe(false);
	});

	test("rejects traversal and absolute paths outside cwd", () => {
		expect(isPlanWritePathAllowed("../escape.md", cwd)).toBe(false);
		expect(isPlanWritePathAllowed("../../etc/passwd.md", cwd)).toBe(false);
		expect(isPlanWritePathAllowed("/tmp/leak.md", cwd)).toBe(false);
	});

	test("allows absolute paths that resolve inside cwd", () => {
		expect(isPlanWritePathAllowed("/r/plans/foo.md", cwd)).toBe(true);
	});

	test("rejects empty path and the cwd itself", () => {
		expect(isPlanWritePathAllowed("", cwd)).toBe(false);
		expect(isPlanWritePathAllowed(".", cwd)).toBe(false);
	});

	test("extension check is case-insensitive", () => {
		expect(isPlanWritePathAllowed("PLAN.MD", cwd)).toBe(true);
		expect(isPlanWritePathAllowed("notes.MdX", cwd)).toBe(true);
	});

	test("allows markdown files under configured external plan root", () => {
		const planRoot = "/external/plans";
		expect(isPlanWritePathAllowed("/external/plans/repo/session-abc.md", cwd, { planRoot })).toBe(true);
		expect(isPlanWritePathAllowed("/external/plans/repo/session-abc-2.mdx", cwd, { planRoot })).toBe(true);
		expect(resolvePlanWritePath("/external/plans/repo/session-abc.md", cwd, { planRoot })).toBe("/external/plans/repo/session-abc.md");
	});

	test("expands leading home paths only when they stay under the configured plan root", () => {
		const homeDir = "/home/alice";
		const planRoot = "/home/alice/.pi/agent/plannotator-plans";
		expect(isPlanWritePathAllowed("~/.pi/agent/plannotator-plans/project/session.md", cwd, { homeDir, planRoot })).toBe(true);
		expect(isPlanWritePathAllowed("~bob/plans/session.md", cwd, { homeDir, planRoot })).toBe(false);
	});

	test("rejects traversal even if it would resolve into the external plan root", () => {
		const planRoot = "/external/plans";
		expect(isPlanWritePathAllowed("../external/plans/project/session.md", cwd, { planRoot })).toBe(false);
		expect(isPlanWritePathAllowed("/external/plans/../plans/project/session.md", cwd, { planRoot })).toBe(false);
	});

	test("rejects external absolute paths outside cwd and plan root", () => {
		const planRoot = "/external/plans";
		expect(isPlanWritePathAllowed("/external/other/session.md", cwd, { planRoot })).toBe(false);
		expect(isPlanWritePathAllowed("/tmp/leak.md", cwd, { planRoot })).toBe(false);
	});

	test("allows project subdirectories and unique session filenames under plan root", () => {
		const planRoot = "/external/plans";
		expect(isPlanWritePathAllowed("/external/plans/my-project/2026-06-15-auth-plan.md", cwd, { planRoot })).toBe(true);
		expect(isPlanWritePathAllowed("/external/plans/my-project/2026-06-15-auth-plan-2.md", cwd, { planRoot })).toBe(true);
	});

	test("applies extension casing checks under plan root", () => {
		const planRoot = "/external/plans";
		expect(isPlanWritePathAllowed("/external/plans/project/SESSION.MD", cwd, { planRoot })).toBe(true);
		expect(isPlanWritePathAllowed("/external/plans/project/SESSION.txt", cwd, { planRoot })).toBe(false);
	});
});