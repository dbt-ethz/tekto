import type { McpReply } from "./mcp-session.mjs";
/** Run tools/mcp.mjs holding the building itself, on a file or a shared document; see mcp-file-session.mjs. */
export function mcpFileSession(messages: object[], target: string | { file: string; propose?: boolean } | { doc: string; url: string; propose?: boolean }): Promise<McpReply[]>;
/** The dev server's collab backend on a plain HTTP server, its records in `dir`. */
export function collabServer(dir: string): Promise<{ url: string; close(): void }>;
/** A fresh temporary directory. */
export function tempDir(): string;
export function readText(file: string): string;
export function writeText(file: string, text: string): void;
export function exists(file: string): boolean;
