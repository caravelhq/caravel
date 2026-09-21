<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount, useTemplateRef } from "vue";
import { renderMarkdown, stripFrontmatter } from "../../lib/markdown";
import { yamlRender } from "../../lib/yaml-render";
import { escHtml, detectLang, isYaml, isImageFile, highlightCode } from "../../lib/highlight";

// Props: path to render, optional branch, optional kind.
// kind="report" uses cache:no-store (reports mutate while tasks run).
const props = defineProps<{
  path: string;
  branch?: string;
  kind?: "file" | "report";
}>();

const contentEl = useTemplateRef<HTMLDivElement>("content");

let currentPath = "";
// Tracks a path that arrived before mount (immediate watch fires during setup(),
// before contentEl is populated). Flushed in onMounted so ⇥ and alt-click paths work.
let pendingPath = "";
let pendingBranch = "";

watch(() => [props.path, props.branch] as const, ([p, b]) => {
  if (!p) {
    if (contentEl.value) setEmpty();
    return;
  }
  if (!contentEl.value) {
    // Watch fired before mount; park the path and flush in onMounted.
    pendingPath = p;
    pendingBranch = b || "";
    return;
  }
  renderPath(p, b);
}, { immediate: true });

onMounted(() => {
  if (pendingPath) {
    const p = pendingPath;
    const b = pendingBranch;
    pendingPath = "";
    pendingBranch = "";
    renderPath(p, b || undefined);
  }
});

onBeforeUnmount(() => {
  // Nothing to clean up for fetch; any in-flight request resolves harmlessly
});

function setEmpty() {
  if (!contentEl.value) return;
  contentEl.value.innerHTML = '<div class="files-empty">Select a file to view</div>';
}

async function renderPath(filePath: string, branch?: string): Promise<void> {
  currentPath = filePath;
  const el = contentEl.value;
  if (!el) return;

  if (isImageFile(filePath)) {
    renderImageInto(el, filePath, branch);
    notifySpeaker();
    return;
  }

  el.innerHTML = '<div class="files-loading">Loading...</div>';

  try {
    let url = "/api/files/read?path=" + encodeURIComponent(filePath);
    if (branch) url += "&branch=" + encodeURIComponent(branch);

    const fetchOpts: RequestInit = props.kind === "report" ? { cache: "no-store" } : {};
    const res = await fetch(url, fetchOpts);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "failed");

    // Guard against a newer renderPath completing first.
    if (currentPath !== filePath) return;

    el.textContent = "";

    if (data.markdown) {
      const { fm, body } = stripFrontmatter(data.content || "");
      const fmHtml = fm ? '<pre class="files-md-frontmatter">' + escHtml(fm) + "</pre>" : "";
      const div = document.createElement("div");
      div.className = "files-md";
      div.innerHTML = fmHtml + renderMarkdown(body);
      hydrateLinks(div);
      el.appendChild(div);
    } else if (isYaml(filePath)) {
      const ydiv = document.createElement("div");
      ydiv.className = "files-yaml";
      ydiv.innerHTML = yamlRender(data.content);
      el.appendChild(ydiv);
    } else {
      const lang = detectLang(filePath);
      if (lang) {
        const pre = document.createElement("pre");
        pre.className = "files-code";
        const code = document.createElement("code");
        code.innerHTML = highlightCode(data.content, lang);
        pre.appendChild(code);
        el.appendChild(pre);
      } else {
        const raw = document.createElement("pre");
        raw.className = "files-raw";
        raw.textContent = data.content;
        el.appendChild(raw);
      }
    }
  } catch (err) {
    if (currentPath !== filePath) return;
    el.innerHTML =
      '<div class="files-empty">Error: ' +
      escHtml(String(err instanceof Error ? err.message : err)) +
      "</div>";
  }
  notifySpeaker();
}

// Hydrate links in rendered markdown so alt-click throws to reading pane (Phase 2 reading pane).
// Plain click keeps its default behaviour (navigate to Files panel in app context).
function hydrateLinks(container: HTMLElement): void {
  container.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("http") || href.startsWith("#")) return;
    a.setAttribute("data-open-file", href);
  });
}

function notifySpeaker(): void {
  if (typeof (window as any).__updateSpeakerDisabled === "function") {
    (window as any).__updateSpeakerDisabled();
  }
}

// ── Image viewer (zoom/pan/pinch) ──────────────────────────────────────────
// Ported verbatim from client.js:3548–3755.
function renderImageInto(filesContent: HTMLElement, filePath: string, branch?: string): void {
  let url = "/api/files/raw?path=" + encodeURIComponent(filePath);
  if (branch) url += "&branch=" + encodeURIComponent(branch);

  filesContent.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "files-image-view";

  const meta = document.createElement("div");
  meta.className = "files-image-meta";
  const info = document.createElement("span");
  info.className = "files-image-info";
  info.textContent = "Loading…";

  function mkBtn(label: string, title?: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "files-image-toggle";
    b.textContent = label;
    if (title) b.title = title;
    return b;
  }

  const zoomOutBtn = mkBtn("−", "Zoom out (or scroll down)");
  const zoomLevel = document.createElement("span");
  zoomLevel.className = "files-image-zoom";
  zoomLevel.textContent = "—";
  const zoomInBtn = mkBtn("+", "Zoom in (or scroll up)");
  const fitBtn = mkBtn("Fit", "Fit to width");
  const oneBtn = mkBtn("1:1", "Actual pixels");
  const toggle = mkBtn("Pixelated: on", "Toggle crisp / smooth scaling");
  meta.appendChild(info);
  meta.appendChild(zoomOutBtn);
  meta.appendChild(zoomLevel);
  meta.appendChild(zoomInBtn);
  meta.appendChild(fitBtn);
  meta.appendChild(oneBtn);
  meta.appendChild(toggle);

  const imgWrap = document.createElement("div");
  imgWrap.className = "files-image-canvas";
  const img = document.createElement("img");
  img.className = "files-image is-pixelated";
  img.alt = filePath;

  let natW = 0, natH = 0, scale = 1, pixelated = true, loaded = false;
  const MIN_SCALE = 0.05, MAX_SCALE = 64;

  function clamp(s: number) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)); }

  function apply() {
    if (!natW) return;
    img.style.width = Math.max(1, Math.round(natW * scale)) + "px";
    img.style.height = Math.max(1, Math.round(natH * scale)) + "px";
    const pct = scale >= 1 ? ("×" + (Math.round(scale * 100) / 100)) : (Math.round(scale * 100) + "%");
    zoomLevel.textContent = pct;
    info.textContent = natW + " × " + natH + " px";
  }

  function fitScale() {
    const avail = (imgWrap.clientWidth || 400) - 24;
    if (!natW) return 1;
    return natW <= avail ? defaultScale() : avail / natW;
  }

  function defaultScale() {
    if (natW <= 512) return Math.max(1, Math.floor(384 / natW));
    return 1;
  }

  function zoomAt(factor: number, cx: number, cy: number) {
    if (!natW) return;
    const prev = scale;
    scale = clamp(scale * factor);
    if (scale === prev) return;
    const rect = imgWrap.getBoundingClientRect();
    const px = imgWrap.scrollLeft + (cx - rect.left);
    const py = imgWrap.scrollTop + (cy - rect.top);
    const ratio = scale / prev;
    apply();
    imgWrap.scrollLeft = px * ratio - (cx - rect.left);
    imgWrap.scrollTop = py * ratio - (cy - rect.top);
  }

  function zoomCenter(factor: number) {
    const rect = imgWrap.getBoundingClientRect();
    zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  zoomInBtn.addEventListener("click", () => zoomCenter(1.25));
  zoomOutBtn.addEventListener("click", () => zoomCenter(1 / 1.25));
  oneBtn.addEventListener("click", () => { const p = scale; scale = clamp(1); if (scale !== p) apply(); });
  fitBtn.addEventListener("click", () => { scale = clamp(fitScale()); apply(); imgWrap.scrollTop = 0; imgWrap.scrollLeft = 0; });
  toggle.addEventListener("click", () => {
    pixelated = !pixelated;
    img.classList.toggle("is-pixelated", pixelated);
    toggle.textContent = "Pixelated: " + (pixelated ? "on" : "off");
  });

  imgWrap.addEventListener("wheel", (ev) => {
    if (!loaded) return;
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(factor, ev.clientX, ev.clientY);
  }, { passive: false });

  // Pointer handling: 1 = pan, 2 = pinch-zoom + two-finger pan.
  const pointers = new Map<number, { x: number; y: number }>();
  let panActive = false, panSL = 0, panST = 0, panSX = 0, panSY = 0;
  let pinchPrevDist = 0, pinchPrevMid: { x: number; y: number } | null = null;

  function ptList() { return Array.from(pointers.values()); }
  function pinchMid() { const p = ptList(); return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; }
  function pinchSpread() { const p = ptList(); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }

  function startPan(x: number, y: number) {
    panActive = true; panSX = x; panSY = y;
    panSL = imgWrap.scrollLeft; panST = imgWrap.scrollTop;
    imgWrap.classList.add("is-grabbing");
  }

  imgWrap.addEventListener("pointerdown", (ev) => {
    if (!loaded) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { imgWrap.setPointerCapture(ev.pointerId); } catch (_) {}
    if (pointers.size === 1) {
      startPan(ev.clientX, ev.clientY);
    } else if (pointers.size === 2) {
      panActive = false;
      imgWrap.classList.remove("is-grabbing");
      pinchPrevDist = pinchSpread();
      pinchPrevMid = pinchMid();
    }
  });

  imgWrap.addEventListener("pointermove", (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size >= 2) {
      ev.preventDefault();
      const dist = pinchSpread();
      const mid = pinchMid();
      if (pinchPrevDist > 0 && dist > 0) {
        zoomAt(dist / pinchPrevDist, mid.x, mid.y);
        if (pinchPrevMid) {
          imgWrap.scrollLeft -= (mid.x - pinchPrevMid.x);
          imgWrap.scrollTop -= (mid.y - pinchPrevMid.y);
        }
      }
      pinchPrevDist = dist; pinchPrevMid = mid;
    } else if (panActive) {
      imgWrap.scrollLeft = panSL - (ev.clientX - panSX);
      imgWrap.scrollTop = panST - (ev.clientY - panSY);
    }
  });

  function dropPointer(ev: PointerEvent) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    try { imgWrap.releasePointerCapture(ev.pointerId); } catch (_) {}
    if (pointers.size === 1) {
      const rem = ptList()[0];
      pinchPrevDist = 0; pinchPrevMid = null;
      startPan(rem.x, rem.y);
    } else if (pointers.size === 0) {
      panActive = false;
      pinchPrevDist = 0; pinchPrevMid = null;
      imgWrap.classList.remove("is-grabbing");
    }
  }

  imgWrap.addEventListener("pointerup", dropPointer);
  imgWrap.addEventListener("pointercancel", dropPointer);

  img.addEventListener("load", () => {
    natW = img.naturalWidth; natH = img.naturalHeight;
    if (!natW || !natH) { info.textContent = "image"; return; }
    loaded = true;
    if (natW > 512) {
      pixelated = false;
      img.classList.remove("is-pixelated");
      toggle.textContent = "Pixelated: off";
      scale = clamp(fitScale());
    } else {
      scale = clamp(defaultScale());
    }
    apply();
  });

  img.addEventListener("error", () => {
    wrap.innerHTML = '<div class="files-empty">Could not load image: ' + escHtml(filePath) + "</div>";
  });

  img.src = url;
  imgWrap.appendChild(img);
  wrap.appendChild(meta);
  wrap.appendChild(imgWrap);
  filesContent.appendChild(wrap);
}
</script>

<template>
  <div ref="content" class="files-content">
    <div class="files-empty">Select a file to view</div>
  </div>
</template>
