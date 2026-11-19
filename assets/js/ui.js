const $ = id => document.getElementById(id);
  const money = amount => "R" + Number(amount || 0).toFixed(2);
  function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2200)}
  function safe(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function openModal(id){$(id).classList.add("open")}function closeModal(id){$(id).classList.remove("open")}
  function receipt(s){const w=window.open("","_blank","width=420,height=650");if(!w)return toast("Please allow pop-ups to print receipts.");w.document.write(`<html><head><title>Receipt ${safe(s.id)}</title><style>body{font:14px Arial;padding:25px;color:#171717}h2{text-align:center}hr{border:0;border-top:1px dashed #aaa;margin:16px 0}.line{display:flex;justify-content:space-between;margin:9px 0}.total{font-size:20px;font-weight:bold}</style></head><body><h2>LASLAS 24</h2><p style="text-align:center">Your neighbourhood store</p><hr><p>Receipt: ${safe(s.id)}<br>Date: ${new Date(s.date).toLocaleString()}<br>Customer: ${safe(s.customer)}<br>Payment: ${safe(s.payment)}</p><hr>${s.items.map(i=>`<div class="line"><span>${safe(i.name)} × ${i.qty}</span><b>${money(i.price*i.qty)}</b></div>`).join("")}<hr><div class="line total"><span>TOTAL</span><span>${money(s.total)}</span></div><p style="text-align:center;margin-top:30px">Thank you for shopping with us!</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}

function initializePageControls() {
  $("year").textContent = new Date().getFullYear();
  const navToggle = $("navToggle");
  const navLinks = $("navLinks");
  const menuIsOpen = () => navToggle.getAttribute("aria-expanded") === "true";
  const setMenuOpen = open => navToggle.setAttribute("aria-expanded", String(open));

  navToggle.onclick = () => setMenuOpen(!menuIsOpen());
  document.addEventListener("click", event => {
    if (menuIsOpen() && !navToggle.contains(event.target) && !navLinks.contains(event.target)) {
      setMenuOpen(false);
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menuIsOpen()) {
      setMenuOpen(false);
      if (navLinks.contains(document.activeElement)) navToggle.focus();
    }
  });
  const compactNavigation = window.matchMedia("(max-width: 760px), (max-width: 1024px) and (max-height: 500px)");
  compactNavigation.addEventListener("change", () => setMenuOpen(false));

  document.querySelectorAll("[data-close]").forEach(button => {
    button.onclick = () => closeModal(button.dataset.close);
  });
  document.querySelectorAll(".modal-backdrop").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal.id);
    });
  });
}
