import { assertProductionHostname } from "@bullpay/common";
import { bootstrapDatabase } from "@bullpay/db";
import { assertNodeVersion, loadEnvFile } from "./env.js";

assertNodeVersion();
loadEnvFile(".env");
process.env.NODE_ENV = "production";
process.env.BULLPAY_MODE = "production";
try {
  assertProductionHostname(process.env.PUBLIC_HOSTNAME);
} catch (error) {
  console.error(error instanceof Error ? error.message : "PUBLIC_HOSTNAME must be a real hostname. Refusing to start.");
  process.exit(1);
}
const boot = bootstrapDatabase();
boot.db.close();
await import("../apps/control-center/src/main.js");
