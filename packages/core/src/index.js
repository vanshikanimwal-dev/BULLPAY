import { createRepositories } from "@bullpay/db";
import { updateBranding, updateReceivingAccount, updateSettings, getBranding, getOperations, getReceivingAccount, getSettings, internalStatus, listAndroidDevices, listCustomers, listCounter,
  listPayments, listTickets, replyTicket } from "./admin.js";
import { androidHeartbeat, enrollAndroidDevice, ingestAndroidSms } from "./android.js";
import { ingestCredit } from "./attribution.js";
import {
  banCustomer,
  checkUser,
  customerMe,
  logoutCustomer,
  presentCustomer,
  registerCustomer,
  requireCustomer,
  sendOtp,
  unbanCustomer,
  verifyOtp,
} from "./customers.js";
import {
  bindCustomer,
  cancelPayment,
  confirmCod,
  counterConfirm,
  counterDecline,
  createPayment,
  getCheckoutState,
  getPayment,
  markPaymentDone,
  selectMethod,
  sweep,
  upiUriForSession,
} from "./payments.js";
import { dispatchWebhook, processDueWebhooks } from "./webhooks.js";
import { createWhatsAppAdapter } from "./whatsapp.js";

/**
 * @param {any} transportRequest
 */
async function defaultTransport(transportRequest) {
  const response = await fetch(transportRequest.url, {
    method: "POST",
    headers: transportRequest.headers,
    body: transportRequest.body,
  });
  const text = await response.text();
  return { status: response.status, body: text.slice(0, 2000) };
}

/**
 * @param {{
 *   db: import('node:sqlite').DatabaseSync,
 *   repos?: ReturnType<typeof createRepositories>,
 *   secrets: Record<string, string>,
 *   config: Record<string, any>,
 *   now?: () => Date,
 *   transport?: (request: any) => Promise<{ status: number, body: string }>,
 *   whatsapp?: ReturnType<typeof createWhatsAppAdapter>,
 *   dataDir?: string,
 * }} options
 */
export function createCore(options) {
  const ctx = {
    db: options.db,
    repos: options.repos || createRepositories(options.db),
    secrets: options.secrets,
    config: options.config,
    now: options.now || (() => new Date()),
    transport: options.transport || defaultTransport,
    whatsapp: options.whatsapp || createWhatsAppAdapter(),
    masterKey: options.secrets.ENCRYPTION_MASTER_KEY,
    activeWindowMs: options.config.activeWindowMs,
    processingWindowMs: options.config.processingWindowMs,
    dataDir: options.dataDir || options.config.dataDir || "data",
    checkoutBase: options.config.publicCheckoutBase,
    devOtpLog: Boolean(options.config.devOtpLog),
    nodeEnv: options.config.nodeEnv || "development",
    pairing: new Map(),
  };

  return {
    ctx,
    createPayment: (input) => createPayment(ctx, input),
    getPayment: (id) => getPayment(ctx, id),
    getCheckoutState: (id) => getCheckoutState(ctx, id),
    upiUriForSession: (id) => upiUriForSession(ctx, id),
    bindCustomer: (id, token) => bindCustomer(ctx, id, token, requireCustomer),
    markPaymentDone: (id) => markPaymentDone(ctx, id),
    cancelPayment: (id) => cancelPayment(ctx, id),
    selectMethod: (id, method) => selectMethod(ctx, id, method),
    confirmCod: (id, token) => confirmCod(ctx, id, token, requireCustomer),
    counterConfirm: (input) => counterConfirm(ctx, input),
    counterDecline: (paymentId) => counterDecline(ctx, paymentId),
    sweep: () => sweep(ctx),
    ingestCredit: (input) => ingestCredit(ctx, input),
    ingestAndroidSms: (rawBody) => ingestAndroidSms(ctx, rawBody),
    androidHeartbeat: (body) => androidHeartbeat(ctx, body),
    enrollAndroidDevice: (input) => enrollAndroidDevice(ctx, input),
    checkUser: (mobile) => checkUser(ctx, mobile),
    registerCustomer: (input) => registerCustomer(ctx, input),
    sendOtp: (mobile) => sendOtp(ctx, mobile),
    verifyOtp: (input) => verifyOtp(ctx, input),
    logoutCustomer: (token) => logoutCustomer(ctx, token),
    customerMe: (token) => customerMe(ctx, token),
    banCustomer: (id, reason) => banCustomer(ctx, id, reason),
    unbanCustomer: (id) => unbanCustomer(ctx, id),
    listCustomers: () => listCustomers(ctx),
    getOperations: (merchantId) => getOperations(ctx, merchantId),
    getReceivingAccount: (merchantId) => getReceivingAccount(ctx, merchantId),
    updateReceivingAccount: (merchantId, input) => updateReceivingAccount(ctx, merchantId, input),
    getBranding: (merchantId) => getBranding(ctx, merchantId),
    updateBranding: (merchantId, input) => updateBranding(ctx, merchantId, input),
    listPayments: (merchantId) => listPayments(ctx, merchantId),
    listCounter: (merchantId) => listCounter(ctx, merchantId),
    listTickets: (merchantId) => listTickets(ctx, merchantId),
    replyTicket: (ticketId, message) => replyTicket(ctx, ticketId, message),
    listAndroidDevices: (merchantId) => listAndroidDevices(ctx, merchantId),
    getSettings: (merchantId) => getSettings(ctx, merchantId),
    updateSettings: (merchantId, input) => updateSettings(ctx, merchantId, input),
    internalStatus: (merchantId) => internalStatus(ctx, merchantId),
    whatsappStatus: () => ctx.whatsapp.getStatus(),
    whatsappReconnect: () => ctx.whatsapp.reconnect(),
    whatsappDisconnect: () => ctx.whatsapp.disconnect(),
    dispatchWebhook: (delivery) => dispatchWebhook(ctx, delivery),
    processDueWebhooks: () => processDueWebhooks(ctx),
    presentCustomer,
  };
}

export { createWhatsAppAdapter } from "./whatsapp.js";
