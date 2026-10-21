import { listen, loadConfig } from "@bullpay/common";
import { createAdminApp } from "./app.js";

const config = loadConfig();
const port = Number(process.env.PORT || config.ports.admin);
listen(createAdminApp({ config }), port, config.bindHost, "merchant-admin");
