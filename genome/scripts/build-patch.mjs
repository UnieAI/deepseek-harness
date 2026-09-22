#!/usr/bin/env node
// Combine the dsh-native genome rows with the @unieai/uac-plugins inserts and
// emit a single complete Cordis patch to stdout.
//
//   node genome/scripts/build-patch.mjs > genome/cordis.full.patch.yml
//   pnpm dsh --patch genome/cordis.full.patch.yml "task"
//
// The dsh-native rows (system-prompt, agent-loop, subagent, tool-web) are
// written AFTER the plugin patch so they win on any same-id row conflict
// (Cordis applies rows in file order, later wins).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const native = readFileSync(resolve(here, "..", "cordis.patch.yml"), "utf8");
const profile = process.env.UNIEAI_DSH_PROFILE ?? "cli";

let pluginPatch = "";
try {
  const { renderPatch, selectPlugins } = await import("@unieai/uac-plugins/catalog");
  const plugins = selectPlugins({ profile });
  pluginPatch = renderPatch({ plugins, profile });
} catch (err) {
  process.stderr.write(
    `@unieai/uac-plugins is not resolvable here (${err.code ?? err.message}); ` +
      "emitting dsh-native rows only.\n",
  );
}

process.stdout.write(`${pluginPatch}\n${native}\n`);