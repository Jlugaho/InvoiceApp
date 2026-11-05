(() => {
  const tokenKey = "invoiceapp-api-key";
  const callbacks = [];
  let authenticated = false;

  async function request(path, options = {}) {
    const token = sessionStorage.getItem(tokenKey);
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(path, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin"
    });
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Request failed with status ${response.status}.`);
    }
    return result;
  }

  function showGate(message = "") {
    authenticated = false;
    document.getElementById("authGate").hidden = false;
    document.querySelectorAll(".protected-content").forEach(element => { element.hidden = true; });
    document.getElementById("authError").textContent = message;
  }

  function showApp() {
    authenticated = true;
    document.getElementById("authGate").hidden = true;
    document.querySelectorAll(".protected-content").forEach(element => { element.hidden = false; });
    document.getElementById("authError").textContent = "";
    callbacks.splice(0).forEach(callback => callback());
  }

  async function verifyKey() {
    try {
      await request("/api/auth/me");
      showApp();
      return true;
    } catch (error) {
      if (error.message === "Invalid access key.") {
        sessionStorage.removeItem(tokenKey);
        showGate(error.message);
      } else {
        showGate("Could not reach the invoice server. Check that the backend is running and try again.");
      }
      return false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("authForm");
    const keyInput = document.getElementById("apiKey");
    const signOutButton = document.getElementById("signOutBtn");

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const key = keyInput.value.trim();
      if (!key) {
        document.getElementById("authError").textContent = "Enter the server access key.";
        return;
      }
      sessionStorage.setItem(tokenKey, key);
      keyInput.value = "";
      await verifyKey();
    });

    signOutButton.addEventListener("click", () => {
      sessionStorage.removeItem(tokenKey);
      window.location.reload();
    });

    if (sessionStorage.getItem(tokenKey)) verifyKey();
    else showGate();
  });

  window.InvoiceAuth = {
    request,
    onAuthenticated(callback) {
      if (authenticated) callback();
      else callbacks.push(callback);
    }
  };
})();
