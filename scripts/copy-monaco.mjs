// Copies the Monaco editor files into public/ so the editor works offline (no CDN).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
const src = "node_modules/monaco-editor/min/vs";
const dest = "public/monaco/vs";
if (!existsSync(src)) {
  console.warn("monaco-editor not installed yet; skipping copy");
  process.exit(0);
}
mkdirSync("public/monaco", { recursive: true });
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("Copied Monaco editor to", dest);
