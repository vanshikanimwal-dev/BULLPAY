import { bootstrapDatabase } from "@bullpay/db";
import { assertNodeVersion, loadEnvFile } from "./env.js";

assertNodeVersion();
loadEnvFile(".env");
process.env.BULLPAY_MODE = "localhost";
process.env.NODE_ENV = "development";
const boot = bootstrapDatabase();
boot.db.close();
await import("../apps/control-center/src/main.js");
