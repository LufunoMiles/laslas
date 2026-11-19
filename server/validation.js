import * as XLSX from "xlsx";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function productInput(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const price = Number(body?.price);
  const stock = Number(body?.stock);
  const icon = String(body?.icon || "fa-box");
  let imageUrl = String(body?.image_url ?? body?.imageUrl ?? "").trim();
  if (!name || name.length > 70 || !category || category.length > 70 ||
      !Number.isFinite(price) || price < 0.01 || price > 99999999.99 ||
      body?.stock == null || !Number.isInteger(stock) || stock < 0 || stock > 2147483642 ||
      !/^fa-[a-z0-9-]+$/.test(icon)) {
    throw new HttpError(400, "Enter a valid product name, category, price, and stock quantity.");
  }
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.href.length > 2048) throw new Error();
      imageUrl = parsed.href;
    } catch {
      throw new HttpError(400, "Use a valid HTTPS image URL.");
    }
  }
  return { name, category, price, stock, icon, image_url: imageUrl };
}

export function orderInput(body) {
  const customer = typeof body?.customer === "string" ? body.customer.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const validId = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const items = body?.items;
  if (!uuid.test(body?.requestId) || !customer || customer.length > 120 || phone.length > 40 ||
      !["Cash", "Card", "Mobile payment", "EFT"].includes(body?.payment) ||
      !Array.isArray(items) || items.length < 1 || items.length > 100 ||
      !items.every(item => validId(item?.id) && validId(item?.qty) && item.qty <= 10000) ||
      new Set(items.map(item => item.id)).size !== items.length) {
    throw new HttpError(400, "Enter valid customer and basket details.");
  }
  return {
    order_request: body.requestId, customer_name: customer, customer_phone: phone,
    payment_method: body.payment, basket: items.map(({ id, qty }) => ({ id, qty }))
  };
}

export function importProducts(file) {
  if (!file || !/\.(csv|xlsx)$/i.test(file.originalname)) {
    throw new HttpError(400, "Choose a CSV or XLSX file.");
  }
  let rows;
  try {
    const workbook = XLSX.read(file.buffer, { type: "buffer", sheetRows: 502, sheets: 0 });
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  } catch {
    throw new HttpError(400, "The spreadsheet could not be read.");
  }
  if (!rows.length || rows.length > 500) throw new HttpError(400, "Import between 1 and 500 products.");
  return rows.map((row, index) => {
    try {
      return productInput(row);
    } catch (error) {
      throw new HttpError(400, "Data row " + (index + 1) + ": " + error.message);
    }
  });
}
