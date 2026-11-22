/**
 * Puts a pointer to the agent docs at the top of every entry's .d.ts after `tsup --dts`.
 * The .d.ts is where a coding agent in a consuming project lands first; this tells it
 * where the API index is (tsup's CLI has no dts banner).
 */
import fs from "node:fs";
import path from "node:path";

const dist = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "dist");
const BANNER = `/**
 * tekto — API index for agents: ../llms.txt (start here: names, "use Y, not Z", five rules),
 * ../llms-full.txt (every export with its one-line doc), ../CHANGELOG.md (what changed per release).
 */
`;
for (const entry of ["index", "core", "2d", "react"]) {
  for (const ext of [".d.ts", ".d.mts"]) {
    const file = path.join(dist, entry + ext);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (!text.startsWith(BANNER)) fs.writeFileSync(file, BANNER + text);
  }
}
