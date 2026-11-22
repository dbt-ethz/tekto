// Runs tools/mcp.mjs holding the building itself (no page): on a file, or joined to a shared
// document on a stand-in for the dev server's collab backend. For tests/building-session.test.ts.
// The server loads the library from its build; here it gets a bundle of the sources instead.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { build } from "esbuild";
import tektoCollab from "../../tools/collab-vite-plugin.mjs";

let bundled;
/** The sources as one module the server can import (built once per test run). */
function library() {
  bundled ??= (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tekto-lib-"));
    const outfile = path.join(dir, "core.mjs");
    await build({ entryPoints: ["src/core.ts"], bundle: true, format: "esm", platform: "node", external: ["web-ifc"], outfile, logLevel: "silent" });
    return outfile;
  })();
  return bundled;
}

/** A fresh directory for a session's building file. */
export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tekto-file-"));
}

export const readText = (file) => fs.readFileSync(file, "utf8");
export const writeText = (file, text) => fs.writeFileSync(file, text);
export const exists = (file) => fs.existsSync(file);

/**
 * The dev server's collab backend (tools/collab-vite-plugin.mjs) on a plain HTTP server,
 * its records in `dir`. Resolves with its address and `close()`.
 */
export async function collabServer(dir) {
  let handler;
  tektoCollab({ dir }).configureServer({ watcher: { unwatch() {} }, middlewares: { use(_prefix, fn) { handler = fn; } } });
  const server = http.createServer((req, res) => {
    if (!req.url.startsWith("/__tekto/collab")) { res.statusCode = 404; return res.end(); }
    req.url = req.url.slice("/__tekto/collab".length) || "/";
    handler(req, res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close(); } };
}

/**
 * Send `messages` to a fresh MCP server working on a building file (`{ file }`) or joined to
 * a shared document (`{ doc, url }`), and resolve with the replies to the ones that have an
 * id, in id order. A message `{ wait: ms }` pauses before the next one.
 */
export async function mcpFileSession(messages, target) {
  const lib = await library();
  const where = typeof target === "string" ? { file: target } : target;
  const args = where.file ? ["--file", where.file] : ["--doc", where.doc];
  const child = spawn(process.execPath, ["tools/mcp.mjs", ...args], { env: { ...process.env, TEKTO_LIB: lib, TEKTO_AGENT: "Claude", ...(where.url ? { TEKTO_URL: where.url } : {}) } });
  const want = messages.filter((m) => m.id !== undefined).length;
  const replies = [];
  let errors = "";
  child.stderr.on("data", (d) => { errors += d; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out with ${replies.length}/${want} replies ${errors}`)), 20000);
      let buf = "";
      child.stdout.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          replies.push(JSON.parse(buf.slice(0, i)));
          buf = buf.slice(i + 1);
          if (replies.length === want) { clearTimeout(timer); resolve(); }
        }
      });
      void (async () => {
        for (const m of messages) {
          if (m.wait) { await new Promise((r) => setTimeout(r, m.wait)); continue; }
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
        }
      })();
    });
  } finally {
    child.kill();
  }
  return replies.sort((a, b) => a.id - b.id);
}
