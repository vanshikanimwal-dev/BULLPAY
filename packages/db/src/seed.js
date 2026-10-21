import { encryptString, DEMO_ACCOUNT_ID, DEMO_MERCHANT_ID, PLACEHOLDER_UPI } from "@bullpay/common";

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ masterKey: string, webhookSecret: string, webhookUrl?: string, supportEmail?: string, supportPhone?: string, now?: Date }} options
 */
export function seedDemo(db, options) {
  const existing = db.prepare("SELECT id FROM merchants WHERE id = ?").get(DEMO_MERCHANT_ID);
  if (existing) return { created: false };
  const now = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const branding = JSON.stringify({
    appName: "Bullpay",
    primaryColor: "#0f766e",
    logoUrl: null,
    faviconUrl: null,
  });
  db.prepare(
    `INSERT INTO merchants (
      id, business_name, slug, contact_email, contact_phone, webhook_url, webhook_secret, branding, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    DEMO_MERCHANT_ID,
    "Bullpay Demo Store",
    "demo-store",
    options.supportEmail || null,
    options.supportPhone || null,
    options.webhookUrl || "http://127.0.0.1:5000/api/webhook",
    encryptString(options.webhookSecret, options.masterKey),
    branding,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO payment_receiving_accounts (
      id, merchant_id, upi_id, payee_name, is_active, is_slot_busy, current_active_session_id
    ) VALUES (?, ?, ?, ?, 1, 0, NULL)`,
  ).run(DEMO_ACCOUNT_ID, DEMO_MERCHANT_ID, PLACEHOLDER_UPI, "Bullpay Demo Store");
  return { created: true };
}
