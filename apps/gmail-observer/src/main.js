import { listen, loadConfig, loadRuntimeSecrets } from "@bullpay/common";
import { createGmailApp } from "./app.js";
import { createGmailClient } from "./gmail.js";

const config = loadConfig();
const secrets = loadRuntimeSecrets(config.dataDir);
const gmail = createGmailClient({
  config,
  masterKey: secrets.ENCRYPTION_MASTER_KEY,
  postCredit: async (body) => {
    const response = await fetch(`${config.origins.paymentApi}/api/v1/observers/credit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secrets.OBSERVER_API_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) console.error(await response.text());
  },
});
gmail.start();
const port = Number(process.env.PORT || config.ports.gmailObserver);
listen(createGmailApp({ gmail }), port, config.bindHost, "gmail-observer");
