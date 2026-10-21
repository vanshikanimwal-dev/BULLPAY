import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureDir, protectPath } from "./fsutil.js";

export const SECRET_NAMES = [
  "ENCRYPTION_MASTER_KEY",
  "WEBHOOK_SECRET",
  "ADMIN_API_TOKEN",
  "OBSERVER_API_TOKEN",
  "INTERNAL_SERVICE_TOKEN",
];

/**
 * @param {string} value
 */
export function assertMasterKey(value) {
  if (!/^[0-9a-fA-F]{64}$/.test(value || "")) {
    throw new Error("ENCRYPTION_MASTER_KEY must be 64 hex characters");
  }
}

/**
 * Use the environment value when it is set. Otherwise create a 32-byte hex
 * secret once under data/.secrets and reuse that file.
 * @param {{ name: string, dataDir: string, env?: NodeJS.ProcessEnv, validate?: (value: string) => void }} options
 */
export function loadOrCreateSecret(options) {
  const env = options.env ?? process.env;
  const fromEnv = env[options.name];
  if (fromEnv != null && fromEnv !== "") {
    if (options.validate) options.validate(fromEnv);
    return fromEnv;
  }
  const file = join(options.dataDir, ".secrets", options.name);
  ensureDir(dirname(file), 0o700);
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (options.validate) options.validate(existing);
    return existing;
  }
  const created = randomBytes(32).toString("hex");
  if (options.validate) options.validate(created);
  try {
    writeFileSync(file, `${created}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "EEXIST") {
      const existing = readFileSync(file, "utf8").trim();
      if (options.validate) options.validate(existing);
      return existing;
    }
    throw error;
  }
  protectPath(file, 0o600);
  return created;
}

/**
 * @param {string} dataDir
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadRuntimeSecrets(dataDir, env = process.env) {
  ensureDir(join(dataDir, ".secrets"), 0o700);
  /** @type {Record<string, string>} */
  const secrets = {};
  for (const name of SECRET_NAMES) {
    secrets[name] = loadOrCreateSecret({
      name,
      dataDir,
      env,
      validate: name === "ENCRYPTION_MASTER_KEY" ? assertMasterKey : undefined,
    });
  }
  return secrets;
}
