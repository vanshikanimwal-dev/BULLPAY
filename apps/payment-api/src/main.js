import { listen } from "@bullpay/common";
import { createCore } from "@bullpay/core";
import { bootstrapDatabase } from "@bullpay/db";
import { createApp } from "./app.js";

const boot = bootstrapDatabase();
const core = createCore({
  db: boot.db,
  secrets: boot.secrets,
  config: boot.config,
  dataDir: boot.config.dataDir,
});
const port = Number(process.env.PORT || boot.config.ports.paymentApi);
listen(createApp({ core, secrets: boot.secrets, config: boot.config }), port, boot.config.bindHost, "payment-api");

const sweepTimer = setInterval(() => {
  core.sweep().catch((error) => console.error(error));
}, 1000);
const webhookTimer = setInterval(() => {
  core.processDueWebhooks().catch((error) => console.error(error));
}, 1000);
sweepTimer.unref();
webhookTimer.unref();