import { spawn } from "node:child_process";
import { createRouter, sendHtml, sendJson } from "@bullpay/common";

/**
 * @param {{ name: string, script: string, port: number, restarts?: number }} service
 * @param {{ root: string, restart: boolean, children: Map<string, any>, shuttingDown: () => boolean }} options
 */
export function startService(service, options) {
  const child = spawn(process.execPath, [service.script], {
    cwd: options.root,
    env: { ...process.env, PORT: String(service.port) },
    stdio: "inherit",
    windowsHide: true,
  });
  const record = {
    name: service.name,
    port: service.port,
    script: service.script,
    up: true,
    restarts: service.restarts || 0,
    child,
  };
  options.children.set(service.name, record);
  child.on("exit", () => {
    record.up = false;
    if (options.shuttingDown()) return;
    if (options.restart && record.restarts < 10) {
      const restarts = record.restarts + 1;
      setTimeout(() => {
        if (options.shuttingDown()) return;
        startService({ ...service, restarts }, options);
      }, 1000);
    }
  });
  return record;
}

/**
 * @param {Map<string, { name: string, port: number, up: boolean }>} children
 */
export function supervisorPage(children) {
  const rows = Array.from(children.values()).map((service) =>
    `<tr><td>${service.name}</td><td>${service.port}</td><td>${service.up ? "up" : "down"}</td></tr>`,
  ).join("");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Bullpay supervisor</title></head>
<body style="font:16px/1.5 Segoe UI,sans-serif;max-width:760px;margin:32px auto">
<h1>Bullpay supervisor</h1>
<p>Ctrl+C stops the children. In development, a child that exits is restarted.</p>
<table><thead><tr><th>Process</th><th>Port</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

/**
 * @param {{ children: Map<string, { name: string, port: number, up: boolean }> }} options
 */
export function createSupervisorApp(options) {
  const router = createRouter();
  router.get("/health", async (_req, res) => {
    sendJson(res, 200, { ok: true, service: "supervisor" });
  });
  router.get("/", async (_req, res) => {
    sendHtml(res, 200, supervisorPage(options.children));
  });
  return (req, res) => router.handle(req, res);
}
