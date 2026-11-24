import { observeResize } from "~/lib/observeResize";

// Weft: hover/selection capsules and guide ticks that slide between project thread rows.
const ROW = '[data-sidebar-row][data-sidebar-parent^="folder:"]';
const SELECTED = `${ROW}[aria-current]:not([aria-current="false"])`;
const TICK_LENGTH = 18;
const CAPSULE_GAP = 2;
const STIFF = 900;
const STRETCH = 2.8;
const DAMPING = 0.72;
const MAX_EXTRA_LENGTH = 38;

type Span = { top: number; bottom: number; left: number; width: number };

// Two springs per element: the leading edge is stiff and the trailing edge soft, so a
// moving piece stretches toward its target and then recovers. It only runs while moving.
function createMover(element: HTMLElement, reducedMotion: MediaQueryList | undefined) {
  const state = { top: 0, bottom: 0, vTop: 0, vBottom: 0, target: null as Span | null };
  let frame = 0;
  let last = 0;
  let visible = false;

  // The drawn length is capped on long moves; the end nearer its target (the leading one) stays.
  const paint = () => {
    const target = state.target!;
    let top = state.top;
    let bottom = state.bottom;
    const maxLength = target.bottom - target.top + MAX_EXTRA_LENGTH;
    if (bottom - top > maxLength) {
      if (target.bottom - bottom >= target.top - top) top = bottom - maxLength;
      else bottom = top + maxLength;
    }
    element.style.transform = `translate(${target.left}px, ${top}px)`;
    element.style.width = `${target.width}px`;
    element.style.height = `${Math.max(2, bottom - top)}px`;
  };
  const spring = (x: number, v: number, to: number, k: number, dt: number) => {
    const next = v + (k * (to - x) - 2 * DAMPING * Math.sqrt(k) * v) * dt;
    return [x + next * dt, next] as const;
  };
  const step = (now: number) => {
    const target = state.target!;
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const down = target.bottom > state.bottom || target.top > state.top;
    const soft = STIFF / (STRETCH * STRETCH);
    [state.top, state.vTop] = spring(state.top, state.vTop, target.top, down ? soft : STIFF, dt);
    [state.bottom, state.vBottom] = spring(
      state.bottom,
      state.vBottom,
      target.bottom,
      down ? STIFF : soft,
      dt,
    );
    const settled =
      Math.abs(target.top - state.top) +
        Math.abs(target.bottom - state.bottom) +
        Math.abs(state.vTop) +
        Math.abs(state.vBottom) <
      0.2;
    if (settled) {
      state.top = target.top;
      state.bottom = target.bottom;
      frame = 0;
    } else {
      frame = requestAnimationFrame(step);
    }
    paint();
  };

  return {
    moveTo(target: Span | null) {
      if (target === null) {
        if (visible) element.style.opacity = "0";
        visible = false;
        return;
      }
      state.target = target;
      if (!visible || reducedMotion?.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        state.top = target.top;
        state.bottom = target.bottom;
        state.vTop = state.vBottom = 0;
        paint();
        element.style.opacity = "1";
        visible = true;
        return;
      }
      if (frame === 0) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
    },
  };
}

export function createWeftSidebarIndicators(list: HTMLUListElement) {
  const doc = list.ownerDocument;
  const reducedMotion = doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)");
  list.dataset.weftMotion = "";

  const layer = doc.createElement("li");
  layer.dataset.weftLayer = "";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  const make = (slot: string) => {
    const element = doc.createElement("div");
    element.dataset.weftIndicator = slot;
    layer.append(element);
    return createMover(element, reducedMotion);
  };
  const hoverCapsule = make("hover-capsule");
  const selectedCapsule = make("selected-capsule");
  const hoverTick = make("hover-tick");
  const selectedTick = make("selected-tick");
  list.append(layer);

  let hovered: HTMLElement | null = null;

  const measure = (row: HTMLElement | null) => {
    if (row === null || !row.isConnected) return null;
    const box = row.getBoundingClientRect();
    if (box.height === 0) return null;
    const origin = list.getBoundingClientRect();
    const rowLeft = box.left - origin.left;
    const top = box.top - origin.top;
    const guide = getComputedStyle(row, "::before");
    const hasGuide = guide.content !== "none" && guide.position === "absolute";
    const guideX = rowLeft + (hasGuide ? parseFloat(guide.left) + parseFloat(guide.width) / 2 : 10);
    const capsuleLeft = hasGuide ? guideX + 7.5 : rowLeft;
    return {
      capsule: {
        top: top + CAPSULE_GAP,
        bottom: top + box.height - CAPSULE_GAP,
        left: capsuleLeft,
        width: box.right - origin.left - capsuleLeft,
      },
      tick: {
        top: top + (box.height - TICK_LENGTH) / 2,
        bottom: top + (box.height + TICK_LENGTH) / 2,
        left: guideX - 1.5,
        width: 3,
      },
    };
  };

  const sync = () => {
    if (!layer.isConnected) list.append(layer);
    const selectedRow = list.querySelector<HTMLElement>(SELECTED);
    const selected = measure(selectedRow);
    const hover = hovered === selectedRow ? null : measure(hovered);
    selectedCapsule.moveTo(selected?.capsule ?? null);
    selectedTick.moveTo(selected?.tick ?? null);
    hoverCapsule.moveTo(hover?.capsule ?? null);
    hoverTick.moveTo(hover?.tick ?? null);
  };

  // Rows move with the native list motion for a moment after a change; follow them once it settles.
  let settleTimer = 0;
  const syncSoon = () => {
    sync();
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(sync, 180);
  };

  const onPointerMove = (event: PointerEvent) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>(ROW) : null;
    if (row === hovered) return;
    hovered = row;
    sync();
  };
  const onPointerLeave = () => {
    hovered = null;
    sync();
  };
  list.addEventListener("pointermove", onPointerMove, { passive: true });
  list.addEventListener("pointerleave", onPointerLeave);

  const mutations = new MutationObserver((records) => {
    if (records.every((record) => record.target === layer || layer.contains(record.target)))
      return;
    if (hovered !== null && !hovered.isConnected) hovered = null;
    syncSoon();
  });
  mutations.observe(list, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-current"],
  });
  const stopResize = observeResize(list, syncSoon);

  sync();

  return {
    dispose() {
      clearTimeout(settleTimer);
      mutations.disconnect();
      stopResize();
      list.removeEventListener("pointermove", onPointerMove);
      list.removeEventListener("pointerleave", onPointerLeave);
      for (const mover of [hoverCapsule, selectedCapsule, hoverTick, selectedTick]) mover.dispose();
      layer.remove();
      delete list.dataset.weftMotion;
    },
  };
}
