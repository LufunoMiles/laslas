(async () => {
  if (!await storeSession.requireAccount("admin")) return;
  let products = [];
  const sales = [];
  async function loadOrders() {
    for (let offset = 0; ; offset += 500) {
      const rows = await storeSession.request("/admin/orders?offset=" + offset);
      sales.push(...rows.map(row => ({ ...row, total: Number(row.total) })));
      if (rows.length < 500) break;
    }
  }
  async function reloadProducts() {
    products = await storeData.products();
    renderAdmin();
  }

  function renderCategoryOptions() {
    const categories = new Set(products.map(product => product.category).filter(Boolean));
    $("categoryOptions").innerHTML = [...categories].map(category => `<option value="${safe(category)}">`).join("");
  }

  function renderAdmin(){const q=$("adminSearch").value.toLowerCase();const list=products.filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(q));$("inventoryBody").innerHTML=list.map(p=>`<tr><td><strong>${safe(p.name)}</strong></td><td>${safe(p.category)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td><span class="status ${p.stock<=5?"low":""}">${p.stock<=5?"Low stock":"In stock"}</span></td><td><div class="table-actions"><button class="secondary" data-restock="${p.id}" title="Restock +5">+5</button><button class="secondary" data-edit="${p.id}" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="danger-btn" data-delete="${p.id}" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td></tr>`).join("");$("inventoryEmpty").hidden=list.length>0;$("inventoryEmpty").textContent=products.length?"No products match your search.":"No products yet. Use Add product to get started.";$("revenueStat").textContent=money(sales.reduce((n,s)=>n+s.total,0));$("ordersStat").textContent=sales.length;$("productsStat").textContent=products.length;$("lowStockStat").textContent=products.filter(p=>p.stock<=5).length;$("salesBody").innerHTML=sales.slice(0,30).map(s=>`<tr><td><strong>${safe(s.id)}</strong></td><td>${new Date(s.date).toLocaleString()}</td><td>${safe(s.customer)}</td><td>${safe(s.payment)}</td><td>${s.items.reduce((n,i)=>n+i.qty,0)}</td><td><strong>${money(s.total)}</strong></td><td><button class="secondary" data-receipt="${safe(s.id)}"><i class="fa-solid fa-print"></i></button></td></tr>`).join("");$("salesEmpty").style.display=sales.length?"none":"block";renderCategoryOptions()}
  function openProduct(id=null){const p=products.find(x=>x.id===id);$("productForm").reset();$("editProductId").value=p?.id||"";$("productModalTitle").textContent=p?"Edit product":"Add product";if(p){$("pName").value=p.name;$("pCategory").value=p.category;$("pPrice").value=p.price;$("pStock").value=p.stock;$("pIcon").value=p.icon||"fa-box";$("pImageUrl").value=p.imageUrl||""}openModal("productModal")}
  $("addProductBtn").onclick=()=>openProduct();$("adminSearch").addEventListener("input",renderAdmin);
  $("inventoryBody").addEventListener("click", async event => {
    const edit = event.target.closest("[data-edit]");
    const restock = event.target.closest("[data-restock]");
    const remove = event.target.closest("[data-delete]");
    if (edit) return openProduct(Number(edit.dataset.edit));
    const button = restock || remove;
    if (!button || button.disabled) return;
    const product = products.find(item => item.id === Number(restock?.dataset.restock ?? remove?.dataset.delete));
    if (!product || (remove && !confirm("Delete " + product.name + " from inventory?"))) return;
    button.disabled = true;
    try {
      const path = "/admin/products/" + product.id;
      if (restock) await storeSession.request(path + "/restock", { method: "POST" });
      else await storeSession.request(path, { method: "DELETE" });
      await reloadProducts();
      toast(restock ? product.name + ": 5 units added" : "Product deleted");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  function onSubmit(formId, action) {
    $(formId).onsubmit = async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      try {
        await action(event.currentTarget);
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    };
  }

  onSubmit("productForm", async () => {
    const id = $("editProductId").value;
    const body = {
      name: $("pName").value, category: $("pCategory").value,
      price: Number($("pPrice").value), stock: Number($("pStock").value),
      icon: $("pIcon").value, imageUrl: $("pImageUrl").value
    };
    const path = "/admin/products" + (id ? "/" + id : "");
    await storeSession.request(path, { method: id ? "PUT" : "POST", body });
    closeModal("productModal");
    await reloadProducts();
    toast(id ? "Product updated" : "Product added to inventory");
  });
  onSubmit("importProductsForm", async form => {
    const { imported } = await storeSession.request("/admin/import", { method: "POST", body: new FormData(form) });
    form.reset();
    await reloadProducts();
    toast(imported + " products imported.");
  });
  onSubmit("inviteForm", async form => {
    await storeSession.request("/admin/invitations", { method: "POST", body: { email: $("inviteEmail").value } });
    form.reset();
    toast("Invitation sent.");
  });

  $("salesBody").addEventListener("click",e=>{const b=e.target.closest("[data-receipt]");if(b){const s=sales.find(x=>x.id===b.dataset.receipt);if(s)receipt(s)}});
  $("exportSalesBtn").onclick = () => {
    if (!sales.length) return toast("There are no sales to export.");
    const rows = [["Order ID", "Date", "Customer", "Phone", "Payment", "Items", "Total"]];
    for (const sale of sales) {
      const items = sale.items.map(item => item.name + " x" + item.qty).join("; ");
      rows.push([sale.id, sale.date, sale.customer, sale.phone, sale.payment, items, sale.total.toFixed(2)]);
    }
    function cell(value) {
      const text = String(value ?? "");
      const safeValue = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
      return '"' + safeValue.replaceAll('"', '""') + '"';
    }
    const csv = rows.map(row => row.map(cell).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "laslas24-sales.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  initializePageControls();
  await loadOrders();
  await reloadProducts();
  $("pageStatus").hidden = true;
  $("pageContent").hidden = false;
})().catch(error => {
  $("pageStatus").textContent = error.message;
});
