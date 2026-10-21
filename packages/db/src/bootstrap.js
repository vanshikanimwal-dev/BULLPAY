import { join } from "node:path";
import { ensureDir, loadConfig, loadRuntimeSecrets, protectPath } from "@bullpay/common";
import { openDatabase, migrate } from "./connection.js";
import { seedDemo } from "./seed.js";

/**
 * Open the sqlite file, migrate, and seed the demo merchant on first boot.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function bootstrapDatabase(env = process.env) {
  const config = loadConfig(env);
  ensureDir(config.dataDir, 0o700);
  const secrets = loadRuntimeSecrets(config.dataDir, env);
  const databasePath = config.databasePath || join(config.dataDir, "bullpay.sqlite");
  ensureDir(config.dataDir, 0o700);
  const db = openDatabase(databasePath);
  migrate(db);
  seedDemo(db, {
    masterKey: secrets.ENCRYPTION_MASTER_KEY,
    webhookSecret: secrets.WEBHOOK_SECRET,
    webhookUrl: `${config.origins.demoStore}/api/webhook`,
    supportEmail: config.supportEmail,
    supportPhone: config.supportPhone,
  });
  protectPath(config.dataDir, 0o700);
  if (databasePath !== ":memory:") protectPath(databasePath, 0o600);
  return { db, secrets, config, databasePath };
}
