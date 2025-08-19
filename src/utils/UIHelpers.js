export function showToast(message = "OK", timeout = 1800) {
  console.log("[ATO] Toast:", message);
  if (typeof window === "undefined" || !document?.body) return;
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:24px",
    "transform:translateX(-50%)",
    "background:#111827",
    "color:#e5e7eb",
    "border:1px solid #374151",
    "padding:8px 12px",
    "border-radius:8px",
    "box-shadow:0 6px 20px rgba(0,0,0,0.3)",
    "z-index:9999",
    'font: 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  ].join(";");
  document.body.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, timeout);
}
