# UnieAI genome for dsh — Claude-Code working mode

A versionable harness configuration for `deepseek-harness` (the `unieai`
branch) that encodes a production-grade software-engineering operating mode and
a hardened security posture. It is scaffold/config only: **no model weights are
changed.** It is the dsh-side port of the CosmosMind `RSI-Harness` "genome"
methodology (instructions, tools, policies, runtime, integrations) mapped onto
dsh's real declarative surface.

## Contents

| Path | What it is |
| --- | --- |
| `genome.json` | Manifest; schema version 3, base `unieai`, 12-component mapping. |
| `instructions.md` | The operating-mode system prompt (source of the persona text). |
| `cordis.patch.yml` | The dsh-native declarative rows (persona, serial tool calls, subagent depth, web caps). |
| `security.md` | Security posture: what is applied, what is a documented gap. |
| `scripts/build-patch.mjs` | Combines the native rows with `@unieai/uac-plugins` inserts. |

## Apply

```sh
# 1. Install the UnieAI plugin catalog alongside dsh (it is external to this repo).
pnpm add -D @unieai/uac-plugins

# 2. Build the complete patch (native rows + plugin inserts).
node genome/scripts/build-patch.mjs > genome/cordis.full.patch.yml

# 3. Run the harness with the genome.
pnpm dsh --patch genome/cordis.full.patch.yml "your task"

# Stricter, read-only confinement for reviews / CI:
DSH_PERMISSION_MODE=read-only pnpm dsh --patch genome/cordis.full.patch.yml "review"
```

If `@unieai/uac-plugins` is not installed, `build-patch.mjs` emits the native
rows only and prints a warning; the plugin-derived behavior (wait_agents UX,
secret redaction, loop guard) is then absent.

## What it changes

- **Operating mode** — injects the Claude-Code workflow prompt via
  `system-prompt.config.personaPrefix` (the single declarative place dsh exposes
  for a deployment-authored system prompt fragment).
- **Determinism / auditability** — `agent-loop.maxParallelToolCalls: 1`.
- **Bounded delegation** — `subagent.maxDepth: 2`.
- **Bounded web access** — `tool-web` search/fetch with caps on results, queries,
  timeout and fetched output chars.
- **Keep harness identity and runtime context** — `includeHarnessIdentity` and
  `includeRuntimeContext` stay at their defaults.
- **Confinement** — sandbox mode stays `workspace-write` by default (ask
  approval); `DSH_PERMISSION_MODE=read-only` hardens it.

## Not changed / not set here

- Model, provider, and `maxTokens` are left to the deployment (`agent-loop
  agents[]`), per the no-model-change constraint.
- Whole-run `maxTurns` / deadline / steering-mode have no declarative dsh key;
  use the external `unieai-loop-guard` env (`UNIEAI_TURN_MAX_STEPS`,
  `UNIEAI_TURN_DEADLINE_MS`) and per-goal `goal.maxGoalRounds`.
- Dsh has no native danger-command blocklist or param-schema narrowing; the
  enforcement layer is sandbox mode + approval presets and per-child
  `subagent.toolFilter`. See `security.md`.

## Relation to upstream

The `unieai` branch is a merge of `deepseek-ai/deepseek-harness` (`master`) back
onto the fork, with UnieAI's own deltas re-applied: background-job ownership
isolation (security fix) and a curated plugin catalog (`@unieai/uac-plugins`).
See `REPORT.md` at the repo root for the upstream merge summary and the full
optimization report.