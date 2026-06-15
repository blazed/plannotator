import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export type Phase = "idle" | "planning" | "executing";

export const PLAN_SUBMIT_TOOL = "plannotator_submit_plan";
export const PLANNING_DISCOVERY_TOOLS = ["grep", "find", "ls", "ask_user_question", "web_search", "fetch_content", "get_search_content", "code_search", "jj_context", "jj_todo"] as const;

const PLANNING_ONLY_TOOLS = new Set<string>([PLAN_SUBMIT_TOOL]);
const ALLOWED_PLAN_EXTENSIONS = new Set<string>([".md", ".mdx"]);

export function stripPlanningOnlyTools(tools: readonly string[]): string[] {
	return tools.filter((tool) => !PLANNING_ONLY_TOOLS.has(tool));
}

export function getToolsForPhase(
	baseTools: readonly string[],
	phase: Phase,
): string[] {
	const tools = stripPlanningOnlyTools(baseTools);
	if (phase !== "planning") {
		return [...new Set(tools)];
	}

	return [
		...new Set([...tools, ...PLANNING_DISCOVERY_TOOLS, PLAN_SUBMIT_TOOL]),
	];
}

export function validatePlanningJjTodoInput(input: unknown): string | null {
	if (typeof input !== "object" || input === null) return null;
	const params = input as { action?: unknown; dryRun?: unknown; fresh?: unknown };
	if (params.action !== "create" && params.action !== "update") return null;
	if (params.dryRun !== true) {
		return "Plannotator: during planning, jj_todo create/update may only be used as previews with dryRun: true.";
	}
	if (params.fresh !== false) {
		return "Plannotator: during planning, jj_todo create/update previews must set fresh: false to avoid snapshotting or mutating repository state.";
	}
	return null;
}

export interface PlanPathOptions {
	planRoot?: string;
	homeDir?: string;
}

function expandLeadingHome(path: string, homeDir: string): string {
	if (path === "~") return homeDir;
	if (path.startsWith("~/") || path.startsWith("~\\")) {
		return resolve(homeDir, path.slice(2));
	}
	return path;
}

function hasTraversalSegment(path: string): boolean {
	return path.split(/[\\/]+/).some((part) => part === "..");
}

function isSameOrChild(root: string, child: string): boolean {
	const rel = relative(resolve(root), resolve(child));
	return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

function isMarkdownPath(path: string): boolean {
	return ALLOWED_PLAN_EXTENSIONS.has(extname(path).toLowerCase());
}

export function resolvePlanWritePath(inputPath: string, cwd: string, options: PlanPathOptions = {}): string | null {
	if (!inputPath) return null;
	if (inputPath.startsWith("~") && inputPath !== "~" && !inputPath.startsWith("~/") && !inputPath.startsWith("~\\")) return null;
	if (hasTraversalSegment(inputPath)) return null;

	const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
	const expandedPath = homeDir ? expandLeadingHome(inputPath, homeDir) : inputPath;
	const targetAbs = resolve(cwd, expandedPath);
	if (!isMarkdownPath(targetAbs)) return null;

	const roots = [resolve(cwd)];
	if (options.planRoot) roots.push(resolve(options.planRoot));

	return roots.some((root) => isSameOrChild(root, targetAbs)) ? targetAbs : null;
}

// Used by both the planning-phase write gate and plannotator_submit_plan.
// Path must resolve inside cwd or the configured external plan root (no
// traversal/absolute escape) and end in a permitted markdown extension.
export function isPlanWritePathAllowed(inputPath: string, cwd: string, options: PlanPathOptions = {}): boolean {
	return resolvePlanWritePath(inputPath, cwd, options) !== null;
}
