import { listen, loadConfig } from "@bullpay/common";
import { createHelpApp } from "./app.js";

const config = loadConfig();
const port = Number(process.env.PORT || config.ports.help);
listen(createHelpApp({ config }), port, config.bindHost, "help");
