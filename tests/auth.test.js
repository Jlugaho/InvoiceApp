const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class Element {
  constructor() {
    this.listeners = {};
    this.hidden = true;
    this.value = "";
    this.textContent = "";
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  trigger(type) {
    return Promise.all((this.listeners[type] || []).map(listener =>
      listener({ preventDefault() {}, target: this })
    ));
  }
}

test("auth gate verifies a tab-scoped access key before showing protected pages", async () => {
  const elements = Object.fromEntries(
    ["authGate", "authError", "authForm", "apiKey", "signOutBtn"].map(id => [id, new Element()])
  );
  const protectedContent = new Element();
  const documentListeners = {};
  const document = {
    getElementById: id => elements[id],
    querySelectorAll: () => [protectedContent],
    addEventListener(type, listener) { documentListeners[type] = listener; }
  };
  const values = new Map();
  const sessionStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const requests = [];
  let reloads = 0;
  const window = { location: { reload: () => { reloads += 1; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8"), {
    document,
    window,
    sessionStorage,
    Headers,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (options.headers.get("Authorization") !== "Bearer valid-key") {
        return new Response(JSON.stringify({ error: "Invalid access key." }), { status: 401 });
      }
      return new Response(JSON.stringify({ authenticated: true }), { status: 200 });
    }
  });
  let authenticatedCallbacks = 0;
  window.InvoiceAuth.onAuthenticated(() => { authenticatedCallbacks += 1; });

  documentListeners.DOMContentLoaded();
  assert.equal(elements.authGate.hidden, false);
  assert.equal(protectedContent.hidden, true);

  elements.apiKey.value = "valid-key";
  await elements.authForm.trigger("submit");
  assert.equal(authenticatedCallbacks, 1);
  assert.equal(elements.authGate.hidden, true);
  assert.equal(protectedContent.hidden, false);
  assert.equal(values.get("invoiceapp-api-key"), "valid-key");

  await window.InvoiceAuth.request("/api/invoices");
  assert.equal(requests.at(-1).options.headers.get("Authorization"), "Bearer valid-key");

  await elements.signOutBtn.trigger("click");
  assert.equal(values.has("invoiceapp-api-key"), false);
  assert.equal(reloads, 1);
});
