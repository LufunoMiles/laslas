import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { productInput, orderInput, importProducts, HttpError } from "./server/validation.js";

const root = dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } });

function result(response) {
  if (!response.error) return response.data;
  const { code } = response.error;
  if (code === "P0001") throw new HttpError(409, "Stock changed. Review your basket and try again.");
  if (code === "42501") throw new HttpError(403, "Access denied.");
  if (["22023", "22003", "23514"].includes(code)) throw new HttpError(400, "The submitted data is invalid.");
  if (code === "PGRST116") throw new HttpError(404, "Product not found.");
  throw new Error("Supabase request failed", { cause: response.error });
}

export function createApp(env = process.env, connect = createClient) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });

  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_SECRET_KEY: secret, APP_ORIGIN: origin } = env;
  function client(apiKey, token) {
    if (!url || !apiKey) throw new HttpError(503, "Supabase is not configured.");
    return connect(url, apiKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: token ? { Authorization: "Bearer " + token } : {} }
    });
  }

  app.get("/api/config", (req, res) => {
    if (!url || !key) throw new HttpError(503, "Supabase is not configured.");
    res.json({ url, key });
  });
  app.use("/api", async (req, res, next) => {
    const token = /^Bearer (\S+)$/i.exec(req.get("authorization") || "")?.[1];
    if (!token) throw new HttpError(401, "Sign in to continue.");
    req.db = client(key, token);
    const { data, error } = await req.db.auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, "Your session has expired.");
    req.user = data.user;
    next();
  });

  app.get("/api/session", async (req, res) => {
    res.json({ email: req.user.email, id: req.user.id, admin: result(await req.db.rpc("is_store_admin")) });
  });
  app.get("/api/products", async (req, res) => {
    const products = [];
    for (let offset = 0; ; offset += 500) {
      const batch = result(await req.db.from("products").select("*").order("id").range(offset, offset + 499));
      products.push(...batch);
      if (batch.length < 500) break;
    }
    res.json(products);
  });
  app.post("/api/orders", async (req, res) => {
    res.status(201).json(result(await req.db.rpc("place_order", orderInput(req.body))));
  });

  app.use("/api/admin", async (req, res, next) => {
    if (!result(await req.db.rpc("is_store_admin"))) throw new HttpError(403, "Administrator access required.");
    next();
  });
  app.get("/api/admin/orders", async (req, res) => {
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, "Invalid offset.");
    res.json(result(await req.db.from("orders").select("*").order("date", { ascending: false }).order("id").range(offset, offset + 499)));
  });
  app.post("/api/admin/products", async (req, res) => {
    res.status(201).json(result(await req.db.from("products").insert(productInput(req.body)).select().single()));
  });
  app.put("/api/admin/products/:id", async (req, res) => {
    res.json(result(await req.db.from("products").update(productInput(req.body)).eq("id", req.params.id).select().single()));
  });
  app.delete("/api/admin/products/:id", async (req, res) => {
    result(await req.db.from("products").delete().eq("id", req.params.id).select("id").single());
    res.sendStatus(204);
  });
  app.post("/api/admin/products/:id/restock", async (req, res) => {
    result(await req.db.rpc("restock_product", { product_id: req.params.id }));
    res.sendStatus(204);
  });
  app.post("/api/admin/import", upload.single("file"), async (req, res) => {
    const products = importProducts(req.file);
    result(await req.db.from("products").insert(products));
    res.status(201).json({ imported: products.length });
  });
  app.post("/api/admin/invitations", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (!origin || !secret) throw new HttpError(503, "Invitations are not configured.");
    const redirectTo = new URL("/auth.html", origin);
    redirectTo.searchParams.set("mode", "invite");
    const { error } = await client(secret).auth.admin.inviteUserByEmail(email, { redirectTo: redirectTo.href });
    if (error) throw new HttpError(400, "The invitation could not be sent.");
    res.sendStatus(204);
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "API route not found." }));

  // Explicit file references let the Vercel function tracer include these pages.
  app.get(["/", "/index.html"], async (req, res) => {
    const page = await readFile(new URL("./index.html", import.meta.url));
    res.type("html").send(page);
  });
  app.get("/admin.html", async (req, res) => {
    const page = await readFile(new URL("./admin.html", import.meta.url));
    res.type("html").send(page);
  });
  app.get("/auth.html", async (req, res) => {
    const page = await readFile(new URL("./auth.html", import.meta.url));
    res.type("html").send(page);
  });
  app.use("/assets", express.static(join(root, "assets")));
  app.get("/vendor/supabase.js", async (req, res) => {
    const sdk = await readFile(new URL("./node_modules/@supabase/supabase-js/dist/umd/supabase.js", import.meta.url));
    res.type("js").send(sdk);
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const multerError = error instanceof multer.MulterError;
    const status = error instanceof HttpError ? error.status : error.status === 413 || error.code === "LIMIT_FILE_SIZE" ? 413 : error.status === 400 || multerError ? 400 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 500 ? "The server could not complete the request." : status === 413 ? "The upload or request is too large." : error.message });
  });
  return app;
}

export default createApp();
