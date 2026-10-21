import { listen, loadConfig } from "@bullpay/common";
import { createCheckoutApp } from "./app.js";

const config = loadConfig();
const port = Number(process.env.PORT || config.ports.checkout);
listen(createCheckoutApp({ config }), port, config.bindHost, "checkout-portal");
