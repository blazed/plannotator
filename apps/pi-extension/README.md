# Plannotator for Pi

Plannotator integration for the [Pi coding agent](https://github.com/earendil-works/pi). Adds file-based plan mode with a visual browser UI for reviewing, annotating, and approving agent plans.

## Install

**From npm** (recommended):

```bash
pi install npm:@blazed/plannotator-pi-extension
```

**From source:**

```bash
git clone https://github.com/backnotprop/plannotator.git
pi install ./plannotator/apps/pi-extension
```

**Try without installing:**

```bash
pi -e npm:@blazed/plannotator-pi-extension
```

## Build from source

If installing from a local clone, build the HTML assets first:

```bash
cd plannotator
bun install
bun run build:pi
```

This builds the plan review and code review UIs and copies them into `apps/pi-extension/`.

## Usage

### Plan mode

Start Pi in plan mode:

```bash
pi --plan
```

Or toggle it during a session with `/plannotator` or `Ctrl+Alt+P`. The agent chooses a markdown plan path, or you can pass one explicitly (`/plannotator plans/auth.md`). By default, the planning prompt recommends a session-unique file under `~/.pi/agent/plannotator-plans/<project>/<session-or-task-slug>.md`.

In plan mode the agent is restricted — destructive commands are blocked, writes are limited to markdown plan files under the working directory or configured external `planRoot` (default `~/.pi/agent/plannotator-plans`). It explores your codebase with structured tools, asks clarifying questions when needed, then writes a plan using markdown checklists:

```markdown
- [ ] Add validation to the login form
- [ ] Write tests for the new validation logic
- [ ] Update error messages in the UI
```

When the agent calls `plannotator_submit_plan`, the Plannotator UI opens in your browser. You can:

- **Approve** the plan to begin execution in the current session, or choose **Fresh session** from the approve menu to prefill a fresh-session handoff command in Pi (press Enter to start with only the approved plan)
- **Deny with annotations** to send structured feedback back to the agent
- **Approve with notes** to proceed but include implementation guidance

The agent iterates on the plan until you approve, then executes with full tool access. On resubmission, Plan Diff highlights what changed since the previous version.

### Programmatic plan-mode control

Other Pi extensions can enter, exit, toggle, or query Plannotator plan mode through the shared Pi event bus without invoking the `/plannotator` slash command:

```ts
import { PLANNOTATOR_REQUEST_CHANNEL } from "@blazed/plannotator-pi-extension/plannotator-events";

const response = await new Promise((resolve) => {
  pi.events.emit(PLANNOTATOR_REQUEST_CHANNEL, {
    requestId: crypto.randomUUID(),
    action: "plan-mode",
    payload: { mode: "enter" }, // "enter" | "exit" | "toggle" | "status"
    respond: resolve,
  });
});
```

A handled response returns the resulting phase, for example `{ status: "handled", result: { phase: "planning" } }`.

### Configuring per-phase behavior

Plannotator loads configuration in three layers:

1. Built-in base config shipped with the package: `plannotator.json`
2. Global user config: `~/.pi/agent/plannotator.json`
3. Project-local config: `<cwd>/.pi/plannotator.json`

Later layers overwrite earlier ones. If a field is omitted, it inherits the value from lower-precedence layers. If a value is set to `null`, an empty string, or an empty array, it clears the inherited value instead of merging it. You can also set `defaults` or an entire phase object to `null` to clear all inherited settings from lower-precedence layers.

#### Top-level shape

```json
{
  "planRoot": "~/.pi/agent/plannotator-plans",
  "jjDefaultDiffType": "jj-line",
  "defaults": {
    "model": { "provider": "anthropic", "id": "claude-sonnet-4-5" },
    "thinking": "medium",
    "activeTools": ["read", "bash"],
    "statusLabel": "Ready",
    "systemPrompt": "Optional prompt template"
  },
  "phases": {
    "planning": {
      "model": null,
      "thinking": null,
      "activeTools": ["grep", "find", "ls", "ask_user_question", "jj_context", "plannotator_submit_plan"],
      "statusLabel": "⏸ plan",
      "systemPrompt": "[PLANNING]\n${planFileGuidance}"
    },
    "executing": {
      "model": { "provider": "anthropic", "id": "claude-sonnet-4-5" },
      "thinking": "high",
      "activeTools": [],
      "statusLabel": "",
      "systemPrompt": "[EXECUTING]\nRemaining steps:\n${todoList}"
    }
  }
}
```

#### Option reference

| Option | Type | Meaning |
|--------|------|---------|
| `defaults` | object | Base values applied to every phase before phase-specific overrides |
| `phases` | object | Phase-specific overrides |
| `planRoot` | string \| `null` | External base directory for plan files; defaults to `~/.pi/agent/plannotator-plans`. Planning prompts recommend a sanitized project subdirectory and unique filename under it |
| `jjDefaultDiffType` | `jj-current` \| `jj-last` \| `jj-line` \| `jj-evolog` \| `jj-all` \| `null` | Default JJ diff view for code review; the built-in Pi config uses `jj-line` |
| `phases.planning` | object | Settings for planning mode |
| `phases.executing` | object | Settings for execution mode |
| `phases.reviewing` | object | Reserved for future review-mode customization |
| `model` | `{ provider, id }` \| `null` | Sets the model for the phase; `null` leaves the current model unchanged |
| `thinking` | `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `null` | Sets the thinking level; `null` leaves the current level unchanged |
| `activeTools` | string[] \| `null` | Extra tools to enable for the phase; `[]` or `null` means no extra phase tools |
| `statusLabel` | string \| `null` | Optional UI label for the phase; empty/null clears it |
| `systemPrompt` | string \| `null` | Phase system prompt template; empty/null disables prompt injection |

#### Prompt variables

Use these inside `systemPrompt` strings:

- `${planFilePath}` — current plan file path
- `${planRoot}` — resolved external plan root (default `~/.pi/agent/plannotator-plans`, unless cleared)
- `${planFileGuidance}` — ready-to-use guidance for choosing the correct plan path
- `${todoList}` — remaining checklist items as markdown checkboxes
- `${completedCount}` — completed checklist count
- `${totalCount}` — total checklist count
- `${remainingCount}` — remaining checklist count
- `${phase}` — current runtime phase (`planning`, `executing`, `reviewing`, or `idle`)

#### Behavior notes

- Unknown template variables trigger a warning in the UI and are rendered as empty strings.
- `activeTools` are additive with the tools currently active in the session, so Plannotator still preserves tools provided by other extensions.
- Execution progress remains dynamic (`[DONE:n]` + checklist tracking), even if `statusLabel` is set.
- `planRoot` defaults to `~/.pi/agent/plannotator-plans`; plan write/edit/submit guards allow markdown files under that external tree in addition to the working directory. Set `planRoot` to `null` or an empty string in a higher-precedence config to clear it. Non-markdown files and path traversal are rejected.
- Planning prompts prefer structured tools such as `read`, `grep`, `find`, `ls`, `ask_user_question`, search/content tools, and `jj_context`. `jj_todo` is only for planning previews: `create`/`update` must set `dryRun: true` and `fresh: false`.

#### Example files

- Built-in base config shipped with the package: `apps/pi-extension/plannotator.json`
- Global user override: `~/.pi/agent/plannotator.json`
- Project-local override: `<cwd>/.pi/plannotator.json`

### Code review

Run `/plannotator-review` to open your current changes in the code review UI. Annotate specific lines, switch between diff views, and submit feedback that gets sent to the agent. In JJ workspaces the built-in Pi config defaults to the `jj-line` diff view. For PR reviews inside a JJ repo, Git local checkout/worktree behavior is intentionally disabled unless you pass `--git`; `--local` alone is not enough.

### Shared Plannotator event API

Plannotator also listens on the shared `plannotator:request` event channel so other extensions can reuse the same browser review flows without importing Plannotator internals.

Supported actions and payloads:

- `plan-review`: `{ planContent, planFilePath? }`
- `review-status`: `{ reviewId }`
- `code-review`: `{ cwd?, defaultBranch?, diffType? }`
- `annotate`: `{ filePath, markdown?, mode?, folderPath? }`
- `annotate-last`: `{ markdown? }`
- `archive`: `{ customPlanPath? }`

Plan review is asynchronous:

- callers send `plannotator:request` with action `plan-review`
- Plannotator opens the browser review and immediately responds with `{ status: "handled", result: { status: "pending", reviewId } }`
- when the human approves or rejects in the browser, Plannotator emits `plannotator:review-result` with `{ reviewId, approved, feedback, savedPath?, agentSwitch?, permissionMode?, approvalSession? }`
- callers can query `review-status` with the same `reviewId` to recover from startup races or session restarts

The other shared actions remain request/response flows. Payloads are intentionally minimal and only include fields the shared implementation actually uses.

### Markdown annotation

Run `/plannotator-annotate <file.md>` to open any markdown file in the annotation UI. Useful for reviewing documentation or design specs with the agent.

### Annotate last message

Run `/plannotator-last` to annotate the agent's most recent response. The message opens in the annotation UI where you can highlight text, add comments, and send structured feedback back to the agent.

### Archive browser

The Plannotator archive browser is available through the shared event API as `archive`, which opens the saved plan/decision browser for future callers. The orchestrator does not expose a dedicated archive command yet.

### Progress tracking

During execution, the agent marks completed steps with `[DONE:n]` markers. Progress is shown in the status line and as a checklist widget in the terminal.

## Commands

| Command | Description |
|---------|-------------|
| `/plannotator` | Toggle plan mode. The agent writes a markdown plan file under the working directory or configured external `planRoot`, then submits its path |
| `/plannotator-review` | Open code review UI for current changes or PRs; in JJ repos use `--git` to intentionally opt into Git local checkout behavior |
| `/plannotator-annotate <file>` | Open markdown file in annotation UI |
| `/plannotator-last` | Annotate the last assistant message |

## Flags

| Flag | Description |
|------|-------------|
| `--plan` | Start in plan mode |
| `--git` | For review commands, force Git behavior. Required before PR reviews in JJ repos use Git local checkout/worktree behavior |
| `--local` | For PR review commands, request local checkout in Git mode; in JJ repos this has no effect unless `--git` is also supplied |
| `--no-local` | For PR review commands, force remote/no-local PR diff behavior |

## Keyboard shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+Alt+P` | Toggle plan mode |

## How it works

The extension manages a state machine: **idle** → **planning** → **executing** → **idle**.

During **planning**:
- All tools from other extensions remain available
- Structured tools are preferred; bash should be used sparingly for tests/build metadata or CLIs when no structured tool fits
- Writes and edits are restricted to markdown plan files under the working directory or configured `planRoot`
During **executing**:
- Full tool access: `read`, `bash`, `edit`, `write`
- Progress tracked via `[DONE:n]` markers in agent responses
- Plan re-read from disk each turn to stay current

State persists across session restarts via Pi's `appendEntry` API.

## Requirements

- [Pi](https://github.com/earendil-works/pi) >= 0.74.0
