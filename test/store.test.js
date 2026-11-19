import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../app.js";
import { importProducts, orderInput, productInput } from "../server/validation.js";
import * as XLSX from "xlsx";

const product = { name: "Chicken", category: "Meat", price: 25, stock: 3 };
const order = {
  customer: "Customer",
  phone: "",
  payment: "Cash",
  requestId: "58bf4d4e-1b93-4fc0-b24c-55a9f5a851db",
  items: [{ id: 1, qty: 1 }]
};

test("validates product metadata and rejects unsafe image URLs", () => {
  assert.equal(productInput(product).stock, 3);
  assert.throws(() => productInput({ ...product, stock: -1 }), { status: 400 });
  assert.throws(() => productInput({ ...product, imageUrl: "http://example.com/a" }), { status: 400 });
});

test("only passes product IDs and quantities to checkout", () => {
  const input = orderInput({ ...order, items: [{ ...order.items[0], price: 0.01 }] });
  assert.deepEqual(input.basket, [{ id: 1, qty: 1 }]);
  assert.equal(input.order_request, order.requestId);
  assert.throws(() => orderInput({ ...order, items: [...order.items, ...order.items] }), { status: 400 });
});

test("imports CSV and Excel and rejects invalid rows", () => {
  const csv = "name,category,price,stock\nChicken,Meat,25,3\n";
  assert.deepEqual(importProducts({ originalname: "products.csv", buffer: Buffer.from(csv) }), [productInput(product)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([product]), "Products");
  const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  assert.deepEqual(importProducts({ originalname: "products.xlsx", buffer: file }), [productInput(product)]);
  assert.throws(() => importProducts({ originalname: "products.csv", buffer: Buffer.from(csv.replace(",25,", ",-25,")) }), { status: 400 });
});

test("serves storefront assets and checks Supabase user and admin access in Express", async context => {
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public",
    SUPABASE_SECRET_KEY: "secret",
    APP_ORIGIN: "https://store.example"
  };
  const server = createApp(env, (url, key, options) => ({
    auth: {
      getUser: async token => ({ data: { user: token === "invalid" ? null : { id: token, email: "user@example.com" } } }),
      admin: {
        async inviteUserByEmail(email, { redirectTo }) {
          assert.equal(key, "secret");
          assert.equal(email, "invitee@example.com");
          assert.equal(redirectTo, "https://store.example/auth.html?mode=invite");
          return { error: null };
        }
      }
    },
    rpc: async (name, body) => {
      if (name === "is_store_admin") return { data: options.global.headers.Authorization === "Bearer admin" };
      assert.equal(name, "place_order");
      return { data: { id: body.order_request, total: 25 } };
    },
    from: table => {
      if (table === "products") return { insert: async products => {
        assert.deepEqual(products, [productInput(product)]);
        return { error: null };
      } };
      assert.equal(table, "orders");
      return { select: () => ({ order() { return this; }, range: async () => ({ data: [] }) }) };
    }
  })).listen(0, "127.0.0.1");
  context.after(() => server.close());
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const user = { Authorization: "Bearer user", "Content-Type": "application/json" };
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/assets/css/styles.css")).status, 200);
  assert.equal((await fetch(base + "/vendor/supabase.js")).status, 200);
  const config = await fetch(base + "/api/config");
  assert.deepEqual(await config.json(), { url: env.SUPABASE_URL, key: "public" });
  assert.equal((await fetch(base + "/api/session")).status, 401);
  assert.equal((await fetch(base + "/api/session", { headers: { Authorization: "Bearer invalid" } })).status, 401);
  assert.equal((await fetch(base + "/api/admin/orders", { headers: user })).status, 403);
  assert.equal((await fetch(base + "/api/admin/orders", { headers: { Authorization: "Bearer admin" } })).status, 200);
  const checkout = await fetch(base + "/api/orders", { method: "POST", headers: user, body: JSON.stringify(order) });
  assert.equal(checkout.status, 201);
  assert.equal((await checkout.json()).total, 25);
  const data = new FormData();
  data.append("file", new Blob(["name,category,price,stock\nChicken,Meat,25,3\n"]), "products.csv");
  assert.equal((await fetch(base + "/api/admin/import", { method: "POST", headers: { Authorization: "Bearer user" }, body: data })).status, 403);
  const imported = await fetch(base + "/api/admin/import", { method: "POST", headers: { Authorization: "Bearer admin" }, body: data });
  assert.equal(imported.status, 201);
  assert.deepEqual(await imported.json(), { imported: 1 });
  const invitation = await fetch(base + "/api/admin/invitations", {
    method: "POST",
    headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
    body: JSON.stringify({ email: "invitee@example.com" })
  });
  assert.equal(invitation.status, 204);
});
