import { listen, loadConfig, loadRuntimeSecrets } from "@bullpay/common";
import { createSmsApp } from "./app.js";

const config = loadConfig();
const secrets = loadRuntimeSecrets(config.dataDir);
const port = Number(process.env.PORT || config.ports.smsObserver);
listen(createSmsApp({
  config,
  observerToken: secrets.OBSERVER_API_TOKEN,
  forward: async (body) => {
    const response = await fetch(`${config.origins.paymentApi}/api/v1/observers/credit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secrets.OBSERVER_API_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    return response.json();
  },
}), port, config.bindHost, "sms-observer");
