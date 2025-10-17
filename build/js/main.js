// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("../js/service-worker.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.error("Service Worker failed:", err));
  });
}

// Theme initialization and toggle wiring
// Apply stored theme on every page load so the site respects user's preference even
// when the toggle input is not present on the page.
function applyStoredTheme() {
  const stored = localStorage.getItem("theme");
  const theme = stored === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
}

applyStoredTheme();

// Wire any toggle elements that may appear on pages. Use a delegated approach
// to be safe if script executes before the DOM fully contains the input.
function wireThemeToggle() {
  const themeToggle = document.getElementById("theme-toggle");
  if (!themeToggle) return;
  // initialize checkbox to reflect stored value
  themeToggle.checked = localStorage.getItem("theme") === "dark";
  themeToggle.addEventListener("change", () => {
    const newTheme = themeToggle.checked ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  });
}

// Attempt to wire after DOMContentLoaded in case input is in body markup
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireThemeToggle);
} else {
  wireThemeToggle();
}

// Auto cache toggle
const cacheToggle = document.getElementById("cache-toggle");
if (cacheToggle) {
  cacheToggle.checked = localStorage.getItem("autoCache") === "true";
  cacheToggle.addEventListener("change", () => {
    localStorage.setItem("autoCache", cacheToggle.checked);
  });
}

// Custom circular cursor (JS-driven). Disabled on touch devices or if user
// prefers reduced motion. Adds #custom-cursor to the document and follows pointer.
(function enableCustomCursor() {
  // feature detect
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
    return;
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;

  const cursor = document.createElement("div");
  cursor.id = "custom-cursor";
  document.body.appendChild(cursor);
  document.documentElement.classList.add("custom-cursor-enabled");

  let isDown = false;

  function move(e) {
    const x =
      e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
    const y =
      e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
    cursor.style.left = x + "px";
    cursor.style.top = y + "px";
  }

  function setDown(down) {
    isDown = !!down;
    if (isDown) {
      cursor.style.transform = "translate(-50%, -50%) scale(1.6)";
      cursor.style.opacity = "0.9";
    } else {
      cursor.style.transform = "translate(-50%, -50%) scale(1)";
      cursor.style.opacity = "1";
    }
  }

  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerdown", () => setDown(true));
  window.addEventListener("pointerup", () => setDown(false));

  // Hide cursor when leaving the window
  window.addEventListener("pointerleave", () => (cursor.style.opacity = "0"));
  window.addEventListener("pointerenter", () => (cursor.style.opacity = "1"));

  // Make interactive targets slightly enlarge the cursor on hover
  document.addEventListener("mouseover", (e) => {
    const t = e.target;
    if (
      t &&
      (t.tagName === "A" ||
        t.tagName === "BUTTON" ||
        (t.closest && t.closest("button,a")))
    ) {
      cursor.style.transform = "translate(-50%, -50%) scale(1.4)";
      cursor.style.background = "white";
      cursor.style.borderColor = "var(--accent)";
    }
  });
  document.addEventListener("mouseout", (e) => {
    if (!isDown) cursor.style.transform = "translate(-50%, -50%) scale(1)";
    cursor.style.background = "var(--accent)";
    cursor.style.borderColor =
      window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--accent") || "white";
  });
})();

// Cache size utilities for the Preferences page
async function getCacheSizeBytes(cacheName = "buildlab-cache-v1") {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    let total = 0;
    for (const req of requests) {
      try {
        const res = await cache.match(req);
        if (!res) continue;
        // Try to get length from Content-Length header first
        const len = res.headers.get("content-length");
        if (len) {
          total += parseInt(len, 10);
          continue;
        }
        // Fallback: clone and read blob size (may be slow)
        const blob = await res.clone().blob();
        total += blob.size || 0;
      } catch (err) {
        console.warn("Error sizing cache entry", req.url, err);
      }
    }
    return total;
  } catch (err) {
    console.warn("Cache size check failed", err);
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === null) return "unknown";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

async function wireCacheUi() {
  const sizeEl = document.getElementById("cache-size");
  const refreshBtn = document.getElementById("cache-refresh");
  const clearBtn = document.getElementById("cache-clear");
  if (!sizeEl) return;

  async function refresh() {
    sizeEl.textContent = "calculating...";
    const bytes = await getCacheSizeBytes();
    sizeEl.textContent = bytes === null ? "unknown" : formatBytes(bytes);
  }

  if (refreshBtn) refreshBtn.addEventListener("click", refresh);
  if (clearBtn)
    clearBtn.addEventListener("click", async () => {
      if (!confirm("Clear cached files?")) return;
      try {
        await caches.delete("buildlab-cache-v1");
        alert("Cache cleared");
      } catch (err) {
        alert("Failed to clear cache");
      }
      refresh();
    });

  refresh();
}

// Wire cache UI after DOM ready
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", wireCacheUi);
else wireCacheUi();

// FPS overlay for model-viewer elements
function setupFpsOverlays() {
  const fpsToggle = document.getElementById("fps-toggle");
  const fpsEnabled = localStorage.getItem("showFps") === "true";
  if (fpsToggle) fpsToggle.checked = fpsEnabled;

  const viewers = Array.from(
    document.querySelectorAll(".asset-card model-viewer")
  );
  const overlays = new Map();

  viewers.forEach((mv, idx) => {
    const assetWrap = mv.closest(".asset-card");
    if (!assetWrap) return;
    // Ensure the model-viewer is inside a .model-wrap so overlay sits inside model area
    let modelWrap =
      mv.parentElement &&
      mv.parentElement.classList &&
      mv.parentElement.classList.contains("model-wrap")
        ? mv.parentElement
        : null;
    if (!modelWrap) {
      modelWrap = document.createElement("div");
      modelWrap.className = "model-wrap";
      mv.parentNode.insertBefore(modelWrap, mv);
      modelWrap.appendChild(mv);
    }
    const overlay = document.createElement("div");
    overlay.className = "fps-overlay";
    overlay.textContent = "FPS —";
    modelWrap.appendChild(overlay);
    overlays.set(mv, {
      overlay,
      rafId: null,
      last: performance.now(),
      frames: 0,
      fps: 0,
    });
  });

  function startLoop(mv, state) {
    function loop(now) {
      state.frames++;
      const dt = now - state.last;
      if (dt >= 500) {
        state.fps = Math.round((state.frames / dt) * 1000);
        state.overlay.textContent = state.fps + " FPS";
        state.frames = 0;
        state.last = now;
      }
      state.rafId = requestAnimationFrame(loop);
    }
    state.rafId = requestAnimationFrame(loop);
  }

  function stopLoop(state) {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  function applyEnabled(enabled) {
    overlays.forEach((state, mv) => {
      state.overlay.style.display = enabled ? "block" : "none";
      if (enabled) {
        state.last = performance.now();
        state.frames = 0;
        startLoop(mv, state);
      } else {
        stopLoop(state);
      }
    });
  }

  // initialize
  applyEnabled(fpsEnabled);

  // wire toggle
  if (fpsToggle) {
    fpsToggle.addEventListener("change", () => {
      const v = fpsToggle.checked;
      localStorage.setItem("showFps", v);
      applyEnabled(v);
    });
  }
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", setupFpsOverlays);
else setupFpsOverlays();

// PDF auto-size: use PDF.js to read the first page's aspect ratio and size the container
async function autosizePdfs() {
  if (typeof pdfjsLib === "undefined") return;
  const pdfIframes = Array.from(document.querySelectorAll(".pdf-wrap iframe"));
  if (!pdfIframes.length) return;

  for (const iframe of pdfIframes) {
    const src = iframe.getAttribute("src");
    if (!src) continue;
    try {
      const loadingTask = pdfjsLib.getDocument(src);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const aspect = viewport.width / viewport.height;
      // Calculate container height based on current width
      const wrap = iframe.closest(".pdf-wrap");
      if (!wrap) continue;
      const width = wrap.clientWidth || wrap.getBoundingClientRect().width;
      if (width && aspect) {
        wrap.style.height = Math.round(width / aspect) + "px";
      }
    } catch (err) {
      console.warn("PDF autosize failed for", src, err);
      // leave existing height
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    autosizePdfs();
    window.addEventListener("resize", autosizePdfs);
  });
} else {
  autosizePdfs();
  window.addEventListener("resize", autosizePdfs);
}
