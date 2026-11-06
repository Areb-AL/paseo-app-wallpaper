/**
 * Pose le fond dans l'appli de bureau (et la version web) : l'image en fond de page, puis par-dessus, en CSS,
 * un voile et trois dégradés noirs : à gauche (barre latérale), à droite (panneau de droite), en bas (zone d'écriture).
 * L'image n'est jamais modifiée. Les grands panneaux opaques de Paseo sont rendus transparents pour la laisser voir.
 *
 * Fragile par nature : Paseo n'a pas d'API pour le fond, ce code s'appuie sur la page de l'appli.
 * Sur iPhone et Android il n'y a pas de page : tout est désactivé.
 */
import { Platform } from "react-native";
import type { BackgroundView } from "../shared/background";

interface Rect { top: number; left: number; right: number; bottom: number; width: number; height: number }
interface El {
  tagName: string;
  id: string;
  textContent: string | null;
  children: ArrayLike<El>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  closest(selector: string): El | null;
  matches(selector: string): boolean;
  querySelector(selector: string): El | null;
  getBoundingClientRect(): Rect;
  appendChild(el: El): void;
  remove(): void;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): void };
}
declare const document: {
  documentElement: El;
  head: El;
  body: El;
  getElementById(id: string): El | null;
  createElement(tag: "style"): El;
  querySelector(selector: string): El | null;
  querySelectorAll(selector: string): ArrayLike<El>;
  elementsFromPoint(x: number, y: number): El[];
};
declare const window: {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  screen: { width: number; height: number };
  addEventListener(type: "resize", listener: () => void): void;
  removeEventListener(type: "resize", listener: () => void): void;
};
declare function atob(data: string): string;
declare class Blob {
  constructor(parts: Uint8Array[], options: { type: string });
}
declare const URL: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void };
declare class Image {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  onload: (() => void) | null;
}
declare function requestAnimationFrame(cb: () => void): number;
declare function cancelAnimationFrame(id: number): void;
declare function setTimeout(cb: () => void, ms: number): number;
declare function clearTimeout(id: number): void;
declare function getComputedStyle(el: El): { backgroundColor: string; visibility: string; opacity: string };
declare const MutationObserver: new (cb: () => void) => {
  observe(target: El, options: { childList: boolean; subtree: boolean }): void;
  disconnect(): void;
};

const STYLE_ID = "app-wallpaper-style";
const CLEAR = "data-aw-clear";
const SHADE = "data-aw-shade";
const CHAT = '[data-testid="agent-chat-scroll"]';
// Pages de réglages : leurs cartes ont déjà un fond, un voile y ferait un rectangle sombre.
const SETTINGS = '[data-testid="settings-detail-pane"], [data-testid="settings-sidebar"]';
const SIDEBAR_HANDLE = '[data-testid="left-sidebar-resize-handle"]';
const COMPOSER = '[data-testid="message-input-root"]';
// Fenêtres, menus et popovers gardent leur fond : on ne touche qu'à la mise en page.
const FLOATING = '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]';

/** Taille de l'image affichée, pour dire dans les réglages si elle sera nette. */
let imageSize: { width: number; height: number; fit: "cover" | "contain" | "blur" } | undefined;

export interface Sharpness {
  imageWidth: number;
  imageHeight: number;
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
  /** Agrandissement appliqué à l'image : au-dessus de 1, elle est étirée (floue). */
  scale: number;
}

export function sharpness(): Sharpness | undefined {
  if (!isWeb() || !imageSize) return undefined;
  const dpr = window.devicePixelRatio || 1;
  const sx = (window.innerWidth * dpr) / imageSize.width;
  const sy = (window.innerHeight * dpr) / imageSize.height;
  return {
    imageWidth: imageSize.width,
    imageHeight: imageSize.height,
    windowWidth: Math.round(window.innerWidth * dpr),
    windowHeight: Math.round(window.innerHeight * dpr),
    pixelRatio: dpr,
    scale: imageSize.fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy),
  };
}

export const isWeb = () => Platform.OS === "web" && typeof document !== "undefined";

/**
 * Chrome refuse les URL de plus de 2 Mo : une grande image en data URL serait ignorée (fond noir).
 * On la transforme en Blob local, désigné par une URL courte.
 */
function toObjectUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  const mime = dataUrl.slice(5, comma).split(";")[0] || "image/jpeg";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function css(view: BackgroundView, imageUrl: string): string {
  const shades = `
    linear-gradient(to right, rgb(0 0 0 / var(--aw-left)) 0px, rgb(0 0 0 / calc(var(--aw-left) * 0.78)) calc(var(--aw-side) * 0.6), rgb(0 0 0 / calc(var(--aw-left) * 0.6)) var(--aw-side), rgb(0 0 0 / calc(var(--aw-left) * 0.25)) calc(var(--aw-side) + 140px), rgb(0 0 0 / 0) calc(var(--aw-side) + 320px)),
    linear-gradient(to left, rgb(0 0 0 / var(--aw-right, 0)) 0px, rgb(0 0 0 / calc(var(--aw-right, 0) * 0.78)) calc(var(--aw-rside, 0px) * 0.6), rgb(0 0 0 / calc(var(--aw-right, 0) * 0.6)) var(--aw-rside, 0px), rgb(0 0 0 / calc(var(--aw-right, 0) * 0.25)) calc(var(--aw-rside, 0px) + 140px), rgb(0 0 0 / 0) calc(var(--aw-rside, 0px) + 320px)),
    linear-gradient(to top, rgb(0 0 0 / var(--aw-bottom)) 0px, rgb(0 0 0 / calc(var(--aw-bottom) * 0.8)) var(--aw-composer), rgb(0 0 0 / 0) calc(var(--aw-composer) + 220px)),
    linear-gradient(rgb(0 0 0 / var(--aw-dim)), rgb(0 0 0 / var(--aw-dim))),
    url("${imageUrl}")`;
  const common = `
body, #root { background: transparent !important; }
[${CLEAR}] { background-color: transparent !important; }
[${SHADE}] { background-color: rgb(0 0 0 / var(--aw-panel)) !important; }
`;
  if (view.fit === "blur") {
    // Image entière au centre ; les bandes vides sont remplies par la même image, agrandie et floutée.
    // Deux calques fixes sous le contenu : ::before (flou) puis ::after (image nette + dégradés).
    return `
html { background: #000 !important; }
html::before, html::after { content: ""; position: fixed; pointer-events: none; }
html::before {
  inset: -60px;
  z-index: -2;
  background: url("${imageUrl}") center / cover no-repeat;
  filter: blur(40px) brightness(0.55) saturate(1.1);
}
html::after {
  inset: 0;
  z-index: -1;
  background-image: ${shades} !important;
  background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, contain !important;
  background-position: 0 0, 0 0, 0 0, 0 0, center !important;
  background-repeat: no-repeat !important;
}
${common}`;
  }
  const fit = view.fit === "contain" ? "contain" : "cover";
  return `
html {
  background-color: #000 !important;
  background-image: ${shades} !important;
  background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, ${fit} !important;
  background-position: 0 0, 0 0, 0 0, 0 0, center !important;
  background-repeat: no-repeat !important;
  background-attachment: fixed !important;
}
${common}`;
}


function opaque(color: string): boolean {
  if (!color || color === "transparent") return false;
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return true;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length < 4 || Number(parts[3]) > 0.05;
}

/**
 * Parcourt seulement les grands blocs de mise en page :
 * - leur fond opaque est effacé, pour laisser voir l'image ;
 * - un grand panneau vertical qui ne contient pas de conversation (terminal, fichiers…) et n'est pas
 *   la barre latérale reçoit un voile sombre, une seule fois (pas sur ses enfants).
 */
function clearLayout(root: El, side: number, shadePanels: boolean, report?: string[]): number {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const shaded = new Set<El>();
  let rightSide = 0;
  // Zones des conversations visibles : rien de ce qui les chevauche n'est voilé.
  const chats: Rect[] = [];
  const chatEls = document.querySelectorAll(CHAT);
  for (let i = 0; i < chatEls.length; i++) {
    const c = chatEls[i].getBoundingClientRect();
    if (c.width > 0 && c.height > 0) chats.push(c);
  }
  const overlapsChat = (r: Rect) =>
    chats.some((c) => Math.min(r.right, c.right) - Math.max(r.left, c.left) > 40 && Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) > 40);
  const walk = (el: El, depth: number, inShade: boolean) => {
    if (depth > 60) return;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      if (child.id === STYLE_ID) continue;
      const r = child.getBoundingClientRect();
      // Blocs sans boîte (display: contents, écrans en attente) : on regarde dedans sans y toucher.
      if (r.width === 0 && r.height === 0) {
        walk(child, depth + 1, inShade);
        continue;
      }
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      const big = (r.height >= vh * 0.45 && r.width >= 140) || (r.width >= vw * 0.45 && r.height >= 90);
      if (!big || child.closest(FLOATING)) continue;
      const computed = getComputedStyle(child);
      // Écrans d'autres onglets gardés en mémoire mais cachés : on n'y touche pas.
      if (computed.visibility === "hidden" || Number(computed.opacity) === 0) continue;
      let shade = false;
      const panel =
        r.height >= vh * 0.45 &&
        r.left >= side - 4 &&
        // Un panneau annexe, pas toute la zone de contenu.
        r.width < (vw - side) * 0.7 &&
        !overlapsChat(r) &&
        !child.matches(SETTINGS) &&
        !child.closest(SETTINGS) &&
        !child.querySelector(SETTINGS);
      if (!inShade && shadePanels && panel) {
        shade = true;
        shaded.add(child);
        // Panneau collé au bord droit : sa largeur cale le dégradé de droite.
        if (r.right >= vw - 4 && r.width < vw * 0.35) rightSide = Math.max(rightSide, Math.round(r.width));
        if (child.getAttribute(SHADE) === null) child.setAttribute(SHADE, "");
      }
      const bg = computed.backgroundColor;
      const clear = !shade && opaque(bg);
      if (clear && child.getAttribute(CLEAR) === null) child.setAttribute(CLEAR, "");
      if (report) {
        const testId = child.getAttribute("data-testid");
        report.push(`${"  ".repeat(depth)}${child.tagName.toLowerCase()}${testId ? `[${testId}]` : ""} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} bg=${bg}${clear ? " CLEARED" : ""}${shade ? " SHADED" : ""}`);
      }
      walk(child, depth + 1, inShade || shade);
    }
  };
  walk(root, 0, false);
  // Un panneau qui contient désormais une conversation (ou a disparu) perd son voile.
  const marked = document.querySelectorAll(`[${SHADE}]`);
  for (let i = 0; i < marked.length; i++) if (!shaded.has(marked[i])) marked[i].removeAttribute(SHADE);
  return rightSide;
}

/** Premier élément visible : Paseo garde les écrans des autres onglets montés mais cachés. */
function visible(selector: string): Rect | undefined {
  const all = document.querySelectorAll(selector);
  for (let i = 0; i < all.length; i++) {
    const r = all[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return undefined;
}

function measure(): number {
  const vh = window.innerHeight;
  const handle = visible(SIDEBAR_HANDLE);
  const side = handle && handle.height > vh * 0.3 ? Math.max(0, Math.round(handle.left)) : 0;
  const composer = visible(COMPOSER);
  const bottom = composer && composer.height > 0 ? Math.max(0, Math.round(vh - composer.top + 16)) : 0;
  const html = document.documentElement;
  html.style.setProperty("--aw-side", side + "px");
  html.style.setProperty("--aw-composer", bottom + "px");
  return side;
}

export interface BackgroundController {
  apply(view: BackgroundView): void;
  /** Renvoie la structure des grands blocs (mise au point). */
  probe(): string;
  stop(): void;
}

export function createBackground(): BackgroundController {
  if (!isWeb()) return { apply: () => {}, probe: () => "pas de page web (mobile)", stop: () => {} };
  let style: El | undefined;
  let imageKey = "";
  let objectUrl = "";
  let shadePanels = true;
  let frame = 0;
  let timer = 0;
  let lastPass = 0;
  let observer: { disconnect(): void } | undefined;

  const pass = () => {
    frame = 0;
    timer = 0;
    lastPass = Date.now();
    if (!style) return;
    const side = measure();
    const root = document.getElementById("root") ?? document.body;
    const rightSide = clearLayout(root, side, shadePanels);
    document.documentElement.style.setProperty("--aw-rside", rightSide + "px");
  };
  // Pendant qu'un agent écrit, la page change sans arrêt : une analyse toutes les 200 ms suffit.
  const schedule = () => {
    if (frame || timer) return;
    const wait = 200 - (Date.now() - lastPass);
    if (wait <= 0) frame = requestAnimationFrame(pass);
    else timer = setTimeout(() => {
      timer = 0;
      frame = requestAnimationFrame(pass);
    }, wait);
  };

  const teardown = () => {
    observer?.disconnect();
    observer = undefined;
    window.removeEventListener("resize", schedule);
    if (frame) cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
    frame = 0;
    timer = 0;
    style?.remove();
    style = undefined;
    imageKey = "";
    imageSize = undefined;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    for (const attr of [CLEAR, SHADE]) {
      const marked = document.querySelectorAll(`[${attr}]`);
      for (let i = 0; i < marked.length; i++) marked[i].removeAttribute(attr);
    }
    const html = document.documentElement;
    for (const name of ["--aw-side", "--aw-composer", "--aw-left", "--aw-right", "--aw-rside", "--aw-bottom", "--aw-dim", "--aw-panel"]) html.style.removeProperty(name);
  };

  return {
    apply(view) {
      if (!view.enabled || !view.dataUrl) return teardown();
      const html = document.documentElement;
      html.style.setProperty("--aw-left", String(view.leftShade));
      html.style.setProperty("--aw-bottom", String(view.bottomShade));
      html.style.setProperty("--aw-right", String(view.rightShade));
      html.style.setProperty("--aw-dim", String(view.dim));
      html.style.setProperty("--aw-panel", String(view.panelShade));
      shadePanels = view.panelShade > 0;
      const key = view.imageKey + ":" + view.fit;
      if (!style) {
        style = document.createElement("style");
        style.setAttribute("id", STYLE_ID);
        document.head.appendChild(style);
        const mo = new MutationObserver(schedule);
        mo.observe(document.body, { childList: true, subtree: true });
        observer = mo;
        window.addEventListener("resize", schedule);
      }
      if (key !== imageKey) {
        const previous = objectUrl;
        objectUrl = toObjectUrl(view.dataUrl);
        style.textContent = css(view, objectUrl);
        const probe = new Image();
        const fit = view.fit;
        probe.onload = () => {
          imageSize = { width: probe.naturalWidth, height: probe.naturalHeight, fit };
        };
        probe.src = objectUrl;
        if (previous) URL.revokeObjectURL(previous);
        imageKey = key;
      }
      schedule();
    },
    probe() {
      const report: string[] = [`viewport ${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio} screen=${window.screen.width}x${window.screen.height}`];
      const root = document.getElementById("root") ?? document.body;
      clearLayout(root, measure(), shadePanels, report);
      const handle = visible(SIDEBAR_HANDLE);
      const composer = visible(COMPOSER);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const points: Array<[string, number, number]> = [
        ["barre latérale", 120, vh * 0.5],
        ["chat", (handle?.right ?? 0) + (vw - (handle?.right ?? 0)) * 0.35, vh * 0.4],
        ["sous la zone d'écriture", (handle?.right ?? 0) + 40, vh - 20],
        ["zone d'écriture", composer ? composer.left + composer.width / 2 : vw / 2, composer ? composer.top + composer.height / 2 : vh - 80],
        ["bord droit", vw - 30, vh * 0.5],
        ["bord droit bas", vw - 30, vh - 20],
        ["bas milieu", vw * 0.5, vh - 8],
      ];
      for (const [name, x, y] of points) {
        report.push(`POINT ${name} (${Math.round(x)},${Math.round(y)})`);
        for (const el of document.elementsFromPoint(x, y)) {
          const bg = getComputedStyle(el).backgroundColor;
          if (!opaque(bg)) continue;
          const testId = el.getAttribute("data-testid");
          const r = el.getBoundingClientRect();
          report.push(`   opaque ${el.tagName.toLowerCase()}${testId ? `[${testId}]` : ""} ${Math.round(r.width)}x${Math.round(r.height)} bg=${bg}`);
        }
      }
      report.push(`sidebar-handle ${handle ? JSON.stringify(handle) : "absent"}`);
      report.push(`composer ${composer ? JSON.stringify(composer) : "absent"}`);
      return report.join("\n");
    },
    stop: teardown,
  };
}
