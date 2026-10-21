import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decryptString, encryptString, ensureDir, protectPath } from "@bullpay/common";

/**
 * @param {string} dataDir
 */
function tokenPath(dataDir) {
  return join(dataDir, ".secrets", "gmail-refresh-token");
}

/**
 * @param {string} dataDir
 */
function seenPath(dataDir) {
  return join(dataDir, "gmail-seen.json");
}

/**
 * @param {{ config: any, masterKey: string, postCredit: (body: Record<string, unknown>) => Promise<unknown> }} options
 */
export function createGmailClient(options) {
  const configured = Boolean(options.config.gmailClientId && options.config.gmailClientSecret && options.config.gmailRedirectUri);
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  function readRefreshToken() {
    const file = tokenPath(options.config.dataDir);
    if (!existsSync(file)) return "";
    return decryptString(readFileSync(file, "utf8").trim(), options.masterKey);
  }

  /**
   * @param {string} refreshToken
   */
  function writeRefreshToken(refreshToken) {
    ensureDir(join(options.config.dataDir, ".secrets"), 0o700);
    const file = tokenPath(options.config.dataDir);
    writeFileSync(file, encryptString(refreshToken, options.masterKey), { encoding: "utf8", mode: 0o600 });
    protectPath(file, 0o600);
  }

  function seenIds() {
    const file = seenPath(options.config.dataDir);
    if (!existsSync(file)) return new Set();
    return new Set(JSON.parse(readFileSync(file, "utf8")));
  }

  /**
   * @param {Set<string>} ids
   */
  function storeSeen(ids) {
    ensureDir(options.config.dataDir, 0o700);
    const list = Array.from(ids).slice(-500);
    writeFileSync(seenPath(options.config.dataDir), JSON.stringify(list));
  }

  function status() {
    let connected = false;
    try { connected = Boolean(readRefreshToken()); } catch { connected = false; }
    return { configured, connected };
  }

  function startUrl() {
    const params = new URLSearchParams({
      client_id: options.config.gmailClientId,
      redirect_uri: options.config.gmailRedirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /**
   * @param {string} code
   */
  async function exchangeCode(code) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: options.config.gmailClientId,
        client_secret: options.config.gmailClientSecret,
        redirect_uri: options.config.gmailRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    const body = await response.json();
    if (!response.ok || !body.refresh_token) {
      throw new Error(body.error_description || "Gmail token exchange failed");
    }
    writeRefreshToken(body.refresh_token);
    return status();
  }

  async function accessToken() {
    const refreshToken = readRefreshToken();
    if (!refreshToken) return "";
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: options.config.gmailClientId,
        client_secret: options.config.gmailClientSecret,
        grant_type: "refresh_token",
      }),
    });
    const body = await response.json();
    return body.access_token || "";
  }

  async function poll() {
    if (!configured) return;
    const access = await accessToken();
    if (!access) return;
    const query = encodeURIComponent('newer_than:1d (credited OR UPI OR "has been credited")');
    const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`, {
      headers: { authorization: `Bearer ${access}` },
    });
    if (!listResponse.ok) return;
    const list = await listResponse.json();
    const seen = seenIds();
    for (const message of list.messages || []) {
      if (seen.has(message.id)) continue;
      const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`, {
        headers: { authorization: `Bearer ${access}` },
      });
      if (!detailResponse.ok) continue;
      const detail = await detailResponse.json();
      const text = detail.snippet || "";
      if (!/credited|received|upi/i.test(text)) {
        seen.add(message.id);
        continue;
      }
      await options.postCredit({
        source: "GMAIL",
        rawText: text,
        observedAt: new Date(Number(detail.internalDate) || Date.now()).toISOString(),
      });
      seen.add(message.id);
    }
    storeSeen(seen);
  }

  return {
    configured,
    status,
    startUrl,
    exchangeCode,
    poll,
    start() {
      if (!configured || timer) return;
      timer = setInterval(() => {
        poll().catch((error) => console.error(error));
      }, options.config.gmailPollIntervalMs);
      timer.unref();
    },
  };
}
