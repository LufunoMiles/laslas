const storeSession = (() => {
  let connection;

  function client() {
    connection ??= fetch("/api/config").then(async response => {
      if (!response.ok) throw new Error("Supabase is not configured. Check the server environment.");
      const { url, key } = await response.json();
      return supabase.createClient(url, key);
    });
    return connection;
  }

  function destination() {
    return new URLSearchParams(location.search).get("next") === "admin" ? "admin.html" : "index.html";
  }

  async function request(path, { method = "GET", body } = {}) {
    const sdk = await client();
    const { data: { session }, error } = await sdk.auth.getSession();
    if (error || !session) throw new Error("Sign in to continue.");
    const headers = { Authorization: "Bearer " + session.access_token };
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch("/api" + path, { method, body, headers });
    if (response.status === 204) return;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }

  async function requireAccount(page = "store") {
    const sdk = await client();
    const { data: { session } } = await sdk.auth.getSession();
    if (!session) {
      location.replace("auth.html?mode=signin&next=" + page);
      return false;
    }

    const account = await request("/session");
    if (page === "admin" && !account.admin) {
      location.replace("index.html?notice=admin");
      return false;
    }
    document.getElementById("accountEmail").textContent = "Signed in as " + account.email;
    if (!account.admin) document.querySelector('a[href="admin.html"]')?.setAttribute("hidden", "");
    document.getElementById("signOutBtn").onclick = async () => {
      const { error } = await sdk.auth.signOut({ scope: "local" });
      if (error) return toast(error.message);
      location.replace("auth.html?mode=signin");
    };
    window.addEventListener("pageshow", event => {
      if (event.persisted) location.reload();
    });
    return account;
  }

  return { client, destination, request, requireAccount };
})();
