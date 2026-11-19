(async () => {
  const account = await storeSession.requireAccount();
  if (!account) return;
  const cartKey = "laslas_cart_" + account.id;
  const pendingKey = cartKey + "_pending_order";
  let cart = storeStorage.read(cartKey, []);
  const save = () => storeStorage.write(cartKey, cart);
  let products = await storeData.products();
  $("pageStatus").hidden = true;
  $("pageContent").hidden = false;
  if (new URLSearchParams(location.search).get("notice") === "admin") toast("Administrator access required.");

  function productVisual(product) {
    const icon = `<i class="fa-solid ${safe(product.icon || "fa-box")}" aria-hidden="true"></i>`;
    const imageUrl = storeData.imageUrl(product.imageUrl);
    return imageUrl
      ? `${icon}<img src="${safe(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : icon;
  }

  let activeCategory = "All";
  function totalQty(){return cart.reduce((n,i)=>n+i.qty,0)}
  function cartTotal(){return cart.reduce((n,i)=>{const p=products.find(x=>x.id===i.id);return n+(p?p.price*i.qty:0)},0)}
  function renderCategories(){const cats=["All",...new Set(products.map(p=>p.category).filter(Boolean))];$("categories").innerHTML=cats.map(c=>`<button class="chip ${c===activeCategory?"active":""}" data-cat="${safe(c)}">${safe(c)}</button>`).join("")}
  function renderProducts(){let list=products.filter(p=>(activeCategory==="All"||p.category===activeCategory)&&(`${p.name} ${p.category}`).toLowerCase().includes($("searchInput").value.toLowerCase()));const sort=$("sortSelect").value;if(sort==="name")list.sort((a,b)=>a.name.localeCompare(b.name));if(sort==="price-low")list.sort((a,b)=>a.price-b.price);if(sort==="price-high")list.sort((a,b)=>b.price-a.price);$("productCount").textContent=`${list.length} product${list.length===1?"":"s"}`;$("productGrid").innerHTML=list.length?list.map(p=>`<article class="product-card"><div class="product-visual">${productVisual(p)}</div><div class="product-meta">${safe(p.category)}</div><h3>${safe(p.name)}</h3><div class="price-row"><span class="price">${money(p.price)}</span><span class="stock-tag ${p.stock<=5?"low":""}">${p.stock>0?`${p.stock} left`:"Sold out"}</span></div><button class="primary add-btn" data-add="${p.id}" ${p.stock<=0?"disabled":""}><i class="fa-solid fa-plus"></i> Add to basket</button></article>`).join(""):`<div class="empty" style="grid-column:1/-1">${products.length ? "No products match your search." : "No products are available yet."}</div>`}
  function renderCart(){cart=cart.filter(i=>products.some(p=>p.id===i.id));$("cartCount").textContent=totalQty();$("basketTotal").textContent=money(cartTotal());$("basketItems").innerHTML=cart.length?cart.map(i=>{const p=products.find(x=>x.id===i.id);return `<div class="basket-item"><div><strong>${safe(p.name)}</strong><small>${money(p.price)} each · ${money(p.price*i.qty)}</small></div><div class="qty-control"><button data-qty="${p.id}" data-delta="-1" aria-label="Decrease quantity">−</button><b>${i.qty}</b><button data-qty="${p.id}" data-delta="1" aria-label="Increase quantity">+</button><button data-remove="${p.id}" aria-label="Remove item" style="border:0;color:var(--red);background:transparent"><i class="fa-solid fa-trash"></i></button></div></div>`}).join(""):`<div class="basket-empty"><i class="fa-solid fa-basket-shopping"></i>Your basket is empty.<br><small>Add a few essentials to get started.</small></div>`;$("checkoutBtn").disabled=!cart.length;$("checkoutBtn").style.opacity=cart.length?1:.5;save()}
  function addToCart(id){const p=products.find(x=>x.id===id);if(!p)return;const item=cart.find(x=>x.id===id);if((item?.qty||0)>=p.stock)return toast("You have reached the available stock.");if(item)item.qty++;else cart.push({id,qty:1});renderCart();toast(`${p.name} added to basket`)}
  $("categories").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(b){activeCategory=b.dataset.cat;renderCategories();renderProducts()}});
  $("productGrid").addEventListener("click",e=>{const b=e.target.closest("[data-add]");if(b)addToCart(Number(b.dataset.add))});
  $("basketItems").addEventListener("click",e=>{const q=e.target.closest("[data-qty]"),r=e.target.closest("[data-remove]");if(q){const id=Number(q.dataset.qty),delta=Number(q.dataset.delta),p=products.find(x=>x.id===id),i=cart.find(x=>x.id===id);if(!i)return;if(delta>0&&i.qty>=p.stock)return toast("Not enough stock available.");i.qty+=delta;if(i.qty<=0)cart=cart.filter(x=>x.id!==id);renderCart()}if(r){cart=cart.filter(x=>x.id!==Number(r.dataset.remove));renderCart()}});
  $("searchInput").addEventListener("input",renderProducts);$("sortSelect").addEventListener("change",renderProducts);
  $("checkoutBtn").onclick=()=>{if(!cart.length)return; $("checkoutSummary").innerHTML=`<strong>${totalQty()} item(s)</strong><span style="float:right;font-weight:800">${money(cartTotal())}</span><p style="margin:8px 0 0;color:var(--muted)">Stock will be deducted after you confirm the purchase.</p>`;openModal("checkoutModal")};
  $("checkoutForm").onsubmit = async event => {
    event.preventDefault();
    if (!cart.length) return;
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    const order = {
      customer: $("customerName").value.trim(),
      phone: $("customerPhone").value.trim(),
      payment: $("paymentMethod").value,
      items: cart.map(({ id, qty }) => ({ id, qty }))
    };
    try {
      const encodedOrder = new TextEncoder().encode(JSON.stringify(order));
      const digest = await crypto.subtle.digest("SHA-256", encodedOrder);
      const fingerprint = Array.from(new Uint8Array(digest)).join(",");
      const pending = storeStorage.read(pendingKey, null);
      order.requestId = pending?.fingerprint === fingerprint ? pending.requestId : crypto.randomUUID();
      storeStorage.write(pendingKey, { fingerprint, requestId: order.requestId });
      const sale = await storeSession.request("/orders", { method: "POST", body: order });
      const quantities = new Map(order.items.map(({ id, qty }) => [id, qty]));
      for (const product of products) product.stock -= quantities.get(product.id) || 0;
      cart = [];
      storeStorage.remove(pendingKey);
      closeModal("checkoutModal");
      $("checkoutForm").reset();
      renderCart();
      renderProducts();
      toast("Order placed successfully.");
      const printReceipt = $("printReceiptBtn");
      printReceipt.hidden = false;
      printReceipt.onclick = () => receipt(sale);
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  };

  $("productGrid").addEventListener("error", event => {
    if (event.target.matches(".product-visual img")) event.target.remove();
  }, true);
  $("jumpCart").onclick = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("basketPanel").scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
  };
  initializePageControls();
  renderCategories();
  renderProducts();
  renderCart();
})().catch(error => {
  $("pageStatus").textContent = error.message;
});
