const storeData = (() => {
  function imageUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch {
      return "";
    }
  }

  const products = () => storeSession.request("/products").then(rows => rows.map(row => ({
    ...row, price: Number(row.price), imageUrl: row.image_url
  })));
  return { products, imageUrl };
})();
