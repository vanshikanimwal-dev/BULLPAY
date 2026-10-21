import { createServer } from "node:http";
import { BullpayError } from "./errors.js";
import { isLoopbackUrl } from "./config.js";

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {NodeJS.ProcessEnv} [env]
 */
export function applyCors(req, res, env = process.env) {
  const origin = req.headers.origin;
  if (!origin || Array.isArray(origin)) return;
  const publicHost = env.PUBLIC_HOSTNAME;
  const loopback = origin.startsWith("http://127.0.0.1:") || origin === "http://127.0.0.1";
  const published = Boolean(publicHost) &&
    (origin === `https://${publicHost}` || origin === `http://${publicHost}`);
  if (!loopback && !published) return;
  if (!loopback && isLoopbackUrl(origin)) return;
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "origin");
  res.setHeader(
    "access-control-allow-headers",
    "authorization, content-type, idempotency-key, x-merchant-id",
  );
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} html
 * @param {Record<string, string>} [headers]
 */
export function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(html);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limit]
 */
export function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) {
        reject(new BullpayError("Body too large", { status: 413, code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
export async function readJson(req) {
  const raw = await readBody(req);
  req.rawBody = raw;
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new BullpayError("Invalid JSON", { status: 400, code: "BAD_JSON" });
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
export function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(Array.isArray(header) ? header[0] : header);
  return match ? match[1] : "";
}

/**
 * @param {string} path
 */
function compilePath(path) {
  /** @type {string[]} */
  const keys = [];
  const parts = path.split("/").map((part) => {
    if (part.startsWith(":")) {
      keys.push(part.slice(1));
      return "([^/]+)";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return { regex: new RegExp(`^${parts.join("/")}$`), keys };
}

/**
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
export function createRouter(options = {}) {
  const env = options.env ?? process.env;
  /** @type {{ method: string, regex: RegExp, keys: string[], handler: Function }[]} */
  const routes = [];

  /**
   * @param {string} method
   * @param {string} path
   * @param {Function} handler
   */
  function add(method, path, handler) {
    const compiled = compilePath(path);
    routes.push({ method, regex: compiled.regex, keys: compiled.keys, handler });
  }

  return {
    /** @param {string} path @param {Function} handler */
    get(path, handler) {
      add("GET", path, handler);
      return this;
    },
    /** @param {string} path @param {Function} handler */
    post(path, handler) {
      add("POST", path, handler);
      return this;
    },
    /** @param {string} path @param {Function} handler */
    put(path, handler) {
      add("PUT", path, handler);
      return this;
    },
    /** @param {string} path @param {Function} handler */
    patch(path, handler) {
      add("PATCH", path, handler);
      return this;
    },
    /**
     * @param {import('node:http').IncomingMessage} req
     * @param {import('node:http').ServerResponse} res
     */
    async handle(req, res) {
      applyCors(req, res, env);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const url = new URL(req.url || "/", "http://127.0.0.1");
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = url.pathname.match(route.regex);
        if (!match) continue;
        /** @type {Record<string, string>} */
        const params = {};
        route.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(match[index + 1]);
        });
        try {
          await route.handler(req, res, { params, url });
        } catch (error) {
          if (res.headersSent) {
            res.end();
            return;
          }
          const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "ERROR";
          const message = error instanceof Error ? error.message : "Internal error";
          if (status >= 500) console.error(error);
          sendJson(res, status, { error: message, code });
        }
        return;
      }
      sendJson(res, 404, { error: "Not found", code: "NOT_FOUND" });
    },
  };
}

/**
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} handler
 * @param {number} port
 * @param {string} [host]
 * @param {string} [label]
 */
export function listen(handler, port, host = "127.0.0.1", label = "service") {
  const server = createServer(handler);
  server.on("error", (error) => {
    const code = error && typeof error === "object" && "code" in error ? error.code : "";
    if (code === "EADDRINUSE") {
      console.error(`${label} cannot bind 127.0.0.1:${port} because that port is already in use.`);
    } else {
      console.error(error);
    }
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`${label} listening on http://${host}:${port}`);
  });
  return server;
}
