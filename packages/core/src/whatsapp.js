import { randomBytes } from "node:crypto";

/**
 * In-process WhatsApp adapter. A real socket can replace these methods.
 * OTP delivery does not depend on this adapter being paired.
 */
export function createWhatsAppAdapter() {
  let paired = false;
  /** @type {string | null} */
  let qr = null;
  return {
    getStatus() {
      return { connected: paired, paired, adapter: "in-process", qr };
    },
    reconnect() {
      paired = false;
      qr = `bullpay-whatsapp-${randomBytes(8).toString("hex")}`;
      return this.getStatus();
    },
    disconnect() {
      paired = false;
      qr = null;
      return this.getStatus();
    },
    /**
     * @param {string} _mobile
     * @param {string} _code
     */
    async sendOtp(_mobile, _code) {
      return paired;
    },
  };
}
