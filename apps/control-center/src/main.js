import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@bullpay/common";
import { bootstrapDatabase } from "@bullpay/db";
import { createSupervisorApp, startService } from "./supervisor.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const boot = bootstrapDatabase();
boot.db.close();
const config = boot.config || loadConfig();
const children = new Map();
let stopping = false;
const runtime = {
  root,
  restart: config.mode === "localhost" && config.nodeEnv !== "production",
  children,
  shuttingDown: () => stopping,
};
const services = [
  { name: "payment-api", script: "apps/payment-api/src/main.js", port: config.ports.paymentApi },
  { name: "demo-store", script: "apps/demo-store/src/main.js", port: config.ports.demoStore },
  { name: "checkout-portal", script: "apps/checkout-portal/src/main.js", port: config.ports.checkout },
  { name: "merchant-admin", script: "apps/merchant-admin/src/main.js", port: config.ports.admin },
  { name: "sms-observer", script: "apps/sms-observer/src/main.js", port: config.ports.smsObserver },
  { name: "gmail-observer", script: "apps/gmail-observer/src/main.js", port: config.ports.gmailObserver },
  { name: "help", script: "apps/help/src/main.js", port: config.ports.help },
];

const port = Number(process.env.SUPERVISOR_PORT || config.ports.supervisor);
const server = createServer(createSupervisorApp({ children }));
server.on("error", (error) => {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  if (code === "EADDRINUSE") {
    console.error(`supervisor cannot bind 127.0.0.1:${port} because that port is already in use.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
server.listen(port, config.bindHost, () => {
  console.log(`supervisor listening on http://127.0.0.1:${port}`);
  for (const service of services) startService(service, runtime);
});

function stop() {
  if (stopping) return;
  stopping = true;
  for (const record of children.values()) {
    if (record.child && !record.child.killed) record.child.kill();
  }
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
