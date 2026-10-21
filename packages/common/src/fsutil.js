import { chmodSync, mkdirSync } from "node:fs";

/**
 * chmod can fail on Windows. Callers continue either way.
 * @param {string} target
 * @param {number} mode
 */
export function protectPath(target, mode) {
  try {
    chmodSync(target, mode);
  } catch {
    // Windows chmod may fail; continue.
  }
}

/**
 * @param {string} directory
 * @param {number} [mode]
 */
export function ensureDir(directory, mode = 0o700) {
  try {
    mkdirSync(directory, { recursive: true, mode });
  } catch {
    // The directory may already exist, or Windows may reject the mode.
  }
  protectPath(directory, mode);
}
