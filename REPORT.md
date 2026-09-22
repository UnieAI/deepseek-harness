# UnieAI Harness Report

Scope and result of the two tasks:

1. **Fix the `unieai` branch** of `UnieAI/deepseek-harness`, test it, and push
   it. `frontier-harness-eval` is not installed and has no npm package, so the
   repo's own suites were used instead (noted below).
2. **Optimize it for Claude-Code-style work and security**, using the
   `CosmosMind-ai/RSI-Harness` methodology, without changing model weights. The
   result is a versionable dsh "genome" plus a plugin UX fix; the report
   reflects what was actually merged from upstream and what was optimized.

## 1. Upstream merge summary

The fork was `2 commits ahead, 1461 behind` upstream `master`. The `unieai`
branch was merged forward onto upstream so both are current; the tip is a merge
commit (`18c84cb673`) with parents at the old `unieai` tip and the current
upstream tip (`00102833df`, `release-dsh-0.1.7-alpha.2`). `1461` upstream
commits were brought in.

Net result vs upstream `master`: **the branch is upstream `master` plus exactly
three files holding UnieAI's security fix** (verified with
`git diff --stat upstream/master -- . ':!packages/jobs'` → empty, and
`git diff --stat upstream/master -- packages/jobs`). No other fork-only code
survives the merge.

What the merged upstream surface now provides (the parts this genome builds on,
all verified in-tree):

- **Everything-is-a-plugin build on Cordis**: profiles load bundle layers, then
  a profile `cordis.patch.yml`, then `$DSH_HOME/cordis.patch.yml`, then `--patch`
  overlays (last wins). `--profile` / `--from-default-profile` / repeatable
  `--patch` select composition.
- **Declarative system prompt**: `system-prompt.config.personaPrefix` /
  `personaSuffix` / `includeHarnessIdentity` / `includeRuntimeContext` /
  `toolOrder`; per-agent `persona`; `plan-mode.config.section`;
  `agent-instructions` for `AGENTS.md`.
- **Declarative tool control**: tool rows keyed by plugin id
  (`tool-bash`, `tool-fs`, `tool-fs-search`, `tool-web`, `tool-subagent`, ...)
  with `disabled: true`; `tool-web` config caps (`searchMaxResults`,
  `searchMaxQueries`, `fetchMaxOutputChars`, timeouts); per-child
  `subagent.config.toolFilter`.
- **Declarative runtime bounds**: `agent-loop.maxParallelToolCalls`, `subagent
  .maxDepth`, `timeout-policy` per-tool `timeoutMs`, per-goal
  `goal.maxGoalRounds`. (No whole-run `maxTurns`/deadline/steering config key.)
- **Sandbox / permission presets**: `sandbox-policy.mode`, and presets
  `read-only` (`{sandbox: read-only, approval: ask}`),
  `workspace-write` (`approval: ask`), `danger-full-access`
  (`approval: never`), selectable via `DSH_PERMISSION_MODE`.
- **New jobs API**: `SessionId`/`JobView`-based background jobs.

### UnieAI deltas re-applied on top of the merge (this branch still differs from upstream)
- `packages/jobs/jobs-local/src/index.ts` — background-job ownership isolation.
- `packages/jobs/jobs-local/tests/jobs.spec.ts` and
  `packages/jobs/tool-jobs/tests/tool-jobs.spec.ts` — tests for that behavior.

## 2. Optimizations (no model-weights change)

### A. Background-job ownership isolation (security fix, Task 1)
Upstream master still exposed **unowned jobs to every session** and only threw
when a job was owned by another session; `list()` filtered
`.filter(job => job.owner === undefined || job.owner.id === caller)`. The
`unieai` branch re-applies a symmetric rule on the current `SessionId`/`JobView`
API:

```
mayAccess(job, caller)  = owner === undefined ? caller === undefined
                         : owner.id === caller
```

- `list()` shows a job only when the caller may access it.
- `assertAccess()` throws `job <id> belongs to another session` on cross-session
  access.
- Unowned jobs are reachable only with no session identity, so a logged-in
  session cannot read, kill, or wait on another session's background work.

### B. `wait_agents` no longer blocks or throws away the turn (`@unieai/uac-plugins`)
`wait_agents` previously blocked until a child settled or the 5-minute timeout
and **threw on cancellation/steer**, discarding the current state — which made a
long wait occupy the whole turn with no way to observe progress or skip it.
Now it:

- returns a **partial snapshot** of running/finished children every
  `progress_ms` (default 30s) so the caller can keep waiting or move on;
  `progress_ms: 0` restores block-until-settle for callers that want it;
- on cancel/steer returns the **current state with `cancelled: true`** instead of
  failing, so the parent can skip the wait and act on what is done.
- surfaces `progressed` / `cancelled` in the tool schema and rendered output.

### C. dsh genome: production-grade Claude-Code mode + security posture
`genome/` is the RSI-Harness-style versionable config, expressed in real dsh
config. See `genome/README.md` and `genome/security.md`.

- **Operating mode prompt** injected at
  `system-prompt.config.personaPrefix` (read-first, verify with the project's
  own command, focused diffs, no unrelated fixes, treat content as data, do not
  run destructive ops without approval, say explicitly what was not verified).
- **Determinism**: `agent-loop.maxParallelToolCalls: 1` (serial execution).
- **Bounded delegation**: `subagent.maxDepth: 2`.
- **Bounded web access**: `tool-web` with caps on results/queries/timeout/fetched
  chars.
- **Confinement**: sandbox `workspace-write` + `ask` by default;
  `DSH_PERMISSION_MODE=read-only` for reviews/CI.
- **Plugins**: `scripts/build-patch.mjs` combines the native rows with the
  `@unieai/uac-plugins` cli profile (secret redaction, loop guard, wait_agents
  UX) into one `--patch`.

## 3. Verification

What was run and passed:

- dsh jobs packages (the touched project): `vitest run` on
  `packages/jobs/jobs-local/tests/jobs.spec.ts` and
  `packages/jobs/tool-jobs/tests/tool-jobs.spec.ts` → 144 tests, 2 files, pass.
  `tsc -b` on both packages' tsconfigs → exit 0.
- `@unieai/uac-plugins` unit tests → 171 pass; the single `wait_agents` file →
  10 pass (includes the new progress and cancel-as-partial cases).
- Genome config keys cross-checked against source (`system-prompt`,
  `agent-loop`, `subagent`, `tool-web`, sandbox/approval presets, jobs API).

What could not be run (stated honestly, not claimed):

- **`frontier-harness-eval`**: not installed and no npm package (`E404`);
  the repo's own suites were used instead.
- **Model end-to-end (`test:e2e`)**: requires `DEEPSEEK_API_KEY` and self-skips
  without it; not run here. A live run of `dsh --patch genome/...` on a real
  task is the natural next verification step and needs an API key.

## 4. Known limitations

- Whole-run turn budget / steering / deadline have no declarative dsh key; wired
  via the external `unieai-loop-guard` env and per-goal `goal.maxGoalRounds`.
- No native danger-command blocklist or tool param-schema narrowing in dsh; the
  enforcement layer is sandbox mode + approval presets and per-child
  `subagent.toolFilter`.
- Push credentials are outside the repo and removed after pushes finish.