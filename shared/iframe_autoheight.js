// shared/iframe_autoheight.js
// Posts the iframe document height to the parent so the parent page can resize the iframe.
// Works same-origin and cross-origin (via postMessage); parent matches by contentWindow.

function measureHeight() {
  const de = document.documentElement;
  const b = document.body;
  const h1 = de ? de.scrollHeight : 0;
  const h2 = de ? de.offsetHeight : 0;
  const h3 = b ? b.scrollHeight : 0;
  const h4 = b ? b.offsetHeight : 0;
  return Math.max(h1, h2, h3, h4, 0);
}

function clampHeight(h) {
  const raw = Number(h);
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  const viewport = Math.max(
    Number(window.visualViewport?.height || 0),
    Number(window.innerHeight || 0)
  );
  if (!Number.isFinite(viewport) || viewport <= 0) return Math.round(raw);

  const cap = Math.max(320, Math.floor(viewport * 1.25));
  return Math.max(200, Math.min(Math.round(raw), cap));
}

let lastSent = 0;
let rafId = null;
function sendHeightSoon() {
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const h = clampHeight(measureHeight());
    if (!h || Math.abs(h - lastSent) < 2) return;
    lastSent = h;
    window.parent?.postMessage(
      {
        type: "vigt:iframeHeight",
        height: h,
      },
      "*"
    );
  });
}

// Initial + reactive updates
window.addEventListener("load", sendHeightSoon);
window.addEventListener("resize", sendHeightSoon);
document.addEventListener("DOMContentLoaded", sendHeightSoon);

if ("ResizeObserver" in window) {
  const ro = new ResizeObserver(() => sendHeightSoon());
  if (document.documentElement) ro.observe(document.documentElement);
  if (document.body) ro.observe(document.body);
}

// Fonts can shift layout after load.
if (document.fonts && "addEventListener" in document.fonts) {
  document.fonts.addEventListener("loadingdone", sendHeightSoon);
}

// Kick once right away.
sendHeightSoon();
