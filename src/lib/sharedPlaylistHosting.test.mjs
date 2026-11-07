import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("hosting serves every playlist token and publishes the Android association file", async () => {
  const config = JSON.parse(await readFile(new URL("../../firebase.json", import.meta.url), "utf8"));
  assert.ok(config.hosting.rewrites.some((rule) => rule.source === "/musica/lista/**" && rule.destination === "/musica/lista/index.html"));
  assert.ok(!config.hosting.ignore.includes("**/.*"));
  const association = JSON.parse(await readFile(new URL("../../public/.well-known/assetlinks.json", import.meta.url), "utf8"));
  assert.equal(association[0].target.package_name, "com.ronaldcolocho.taskly");
  assert.match(association[0].target.sha256_cert_fingerprints[0], /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
});

test("visiting a shared list never replaces the cached homepage", async () => {
  const handlers = new Map();
  const saved = new Map();
  let online = true;
  const cache = { put: async (key, response) => saved.set(key, response), match: async (key) => saved.get(key)?.clone() };
  vm.runInNewContext(await readFile(new URL("../../public/sw.js", import.meta.url), "utf8"), {
    self: { location: { origin: "https://tasksv.web.app" }, addEventListener: (name, fn) => handlers.set(name, fn) },
    caches: { open: async () => cache }, URL, Response,
    fetch: async (request) => { if (!online) throw new Error("Offline"); return new Response(new URL(request.url).pathname === "/" ? "homepage" : "playlist"); },
  });
  async function navigate(url) {
    let result;
    handlers.get("fetch")({ request: { url, method: "GET", mode: "navigate" }, respondWith: (response) => { result = response; } });
    return (await result).text();
  }
  const root = "https://tasksv.web.app/";
  const list = "https://tasksv.web.app/musica/lista/0123456789abcdef0123456789abcdef";
  assert.equal(await navigate(root), "homepage");
  assert.equal(await navigate(list), "playlist");
  online = false;
  assert.equal(await navigate(root), "homepage");
  assert.equal(await navigate(list), "playlist");
});
