export class BullpayError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "BullpayError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "BAD_REQUEST";
  }
}

export class MoneyError extends BullpayError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, { status: 400, code: "AMOUNT_INVALID" });
    this.name = "MoneyError";
  }
}
