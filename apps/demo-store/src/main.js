import { listen, loadConfig, loadRuntimeSecrets } from "@bullpay/common";
import { createDemoApp } from "./app.js";

const config = loadConfig();
const secrets = loadRuntimeSecrets(config.dataDir);
const port = Number(process.env.PORT || config.ports.demoStore);
listen(createDemoApp({ config, secret: secrets.WEBHOOK_SECRET }), port, config.bindHost, "demo-store");
