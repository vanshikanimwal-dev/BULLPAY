import { existsSync, readFileSync } from "node:fs";

/**
 * Load a .env file without overriding variables that are already set.
 * @param {string} file
 */
export function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

export function assertNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 24) {
    console.error(`BULLPAY requires Node.js 24 or newer. Current: ${process.version}`);
    process.exit(1);
  }
}
