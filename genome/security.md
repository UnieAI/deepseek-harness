# UnieAI security posture for dsh (Claude-Code working mode)

This genome hardens the harness without touching model weights. It maps the
RSI-Harness security model onto dsh, lists what is applied declaratively, and
states the remaining gaps explicitly.

## Applied (declarative / shipped)

### 1. Background-job ownership isolation (merged upstream in the `unieai` branch)
`packages/jobs/*` now enforces a symmetric rule: an unowned job is reachable only
by a caller with no session identity; a job owned by one session is never visible
to another. `list()` filters and `assertAccess()` throws on cross-session access.
Previously the upstream master code showed **unowned jobs to every session**, and
the fix re-applied to the current `SessionId`/`JobView` API. Unit tests
`packages/jobs/jobs-local/tests/jobs.spec.ts` and
`packages/jobs/tool-jobs/tests/tool-jobs.spec.ts` cover: owned-only listing,
cross-session read/kill/wait rejection, and unowned visibility rules.

### 2. Secret redaction
`@unieai/uac-plugins` `unieai-secret-redact` reads credentials and redacts their
values from anything that reaches the model. Enabled via the cli/studio profile.

### 3. Tool narrowing and resource caps (`genome/cordis.patch.yml`)
- `tool-web`: `search` and `fetch` are enabled but capped
  (`searchMaxResults: 8`, `searchMaxQueries: 3`, `fetchMaxOutputChars: 20000`) so
  an accidental prompt injection cannot balloon a turn or leak large pages.
- `sandbox-policy.mode` defaults to `workspace-write`; set
  `DSH_PERMISSION_MODE=read-only` (with `approval: ask`) for reviews, CI, or
  agents that must not mutate files.

### 4. Runtime bounds (`genome/cordis.patch.yml`)
- `agent-loop.maxParallelToolCalls: 1` — serial tool execution, deterministic and
  easier to audit than parallel fire-and-forget.
- `subagent.maxDepth: 2` — caps delegated-agent recursion (default 1 was only
  one level; the bound here prevents a runaway delegation tree).
- Per-tool deadlines via `timeout-policy` (`timeoutMs`); `bash-sandbox.timeoutMs`
  defaults to 60s.
- Turn/loop budget is **not** a declarative dsh key. Use `unieai-loop-guard`
  (`UNIEAI_TURN_MAX_STEPS`, `UNIEAI_TURN_DEADLINE_MS`) and per-goal
  `goal.maxGoalRounds`. See gaps.

### 5. Safer UX for background work (`@unieai/uac-plugins` `unieai-wait-agents`)
`wait_agents` no longer blocks the whole turn: it returns a partial snapshot on a
progress interval and returns `cancelled: true` (the current state) when the
caller steers or cancels instead of throwing. `progress_ms: 0` restores
block-until-settle for callers that want it.

## Gaps (no dsh declarative equivalent; documented, not silently assumed)
- **Whole-run `maxTurns` / deadline / steering-mode**: not present as dsh
  config. Wired via the external `unieai-loop-guard` plugin + env.
- **Danger-command blocklist**: dsh has no native `blocked_tools` for destructive
  shell patterns. RSI-Harness's `policies.tool.blocked_tools` has no exact
  mapping; a guard plugin hooking the shell tool would be required. Until then,
  the sandbox mode + approval preset is the enforcement layer.
- **Tool-schema narrowing (allowed-args only)**: dsh narrows behavior via config
  (web caps) and per-child `subagent.toolFilter`, but not by restricting a tool's
  parameter schema. `tools.restrict({allow,deny})` is programmatic.
- **Resource auto-discovery isolation**: RSI-Harness `resources.isolate` has no
  dsh key; dsh controls discovery per-plugin.
- **No model change**: model/provider/token config is intentionally not set
  here; it stays a deployment choice.

## Redaction / credentials reminder
Never commit secrets. The temp push credential used to update the branches is
outside the repo and must be removed after pushes are complete.