import { observeResize } from "~/lib/observeResize";

// Weft: hover/selection capsules and guide ticks that slide between project thread rows.
const ROW = '[data-sidebar-row][data-sidebar-parent^="folder:"]';
const SELECTED = `${ROW}[aria-current]:not([aria-current="false"])`;
const TICK_LENGTH = 18;
const CAPSULE_GAP = 2;
const STIFF = 900;
const DAMPING = 0.72;
// Long jumps would otherwise stretch a piece across every row between; the tail is dragged instead.
const TICK_MAX_STRETCH = 22;
const CAPSULE_MAX_STRETCH = 12;

type Span = { top: number; bottom: number; left: number; width: number };

// One spring moves the piece; its tail trails by a stretch that grows with speed and saturates
// at maxStretch, so a move leads with the head, stretches, then recovers. Length follows
// velocity, which is continuous, so it never jumps; a fixed timestep keeps dropped frames
// smooth. Only transform changes per frame (no layout), and it idles when at rest.
const STEP = 1 / 240;
const STRETCH_PER_SPEED = 0.03;
// Stretch eases in and out over ~40ms so a sudden start or reversal never snaps the length.
const STRETCH_SMOOTHING = 1 - Math.exp(-STEP / 0.04);

function createMover(
  element: HTMLElement,
  reducedMotion: MediaQueryList | undefined,
  maxStretch: number,
) {
  let target: Span | null = null;
  let center = 0;
  let velocity = 0;
  let stretch = 0;
  let frame = 0;
  let last = 0;
  let pending = 0;
  let visible = false;

  const paint = () => {
    const length = target!.bottom - target!.top;
    const top = center - length / 2 - Math.max(0, stretch);
    const scale = (length + Math.abs(stretch)) / length;
    element.style.transform = `translate(${target!.left}px, ${top}px) scaleY(${scale})`;
  };
  const step = (now: number) => {
    const goal = (target!.top + target!.bottom) / 2;
    pending += Math.min(0.05, (now - last) / 1000);
    last = now;
    while (pending >= STEP) {
      velocity += (STIFF * (goal - center) - 2 * DAMPING * Math.sqrt(STIFF) * velocity) * STEP;
      center += velocity * STEP;
      const desired = maxStretch * Math.tanh((velocity * STRETCH_PER_SPEED) / maxStretch);
      stretch += (desired - stretch) * STRETCH_SMOOTHING;
      pending -= STEP;
    }
    if (Math.abs(goal - center) + Math.abs(velocity) * STEP + Math.abs(stretch) < 0.05) {
      center = goal;
      velocity = 0;
      stretch = 0;
      frame = 0;
    } else {
      frame = requestAnimationFrame(step);
    }
    paint();
  };

  return {
    moveTo(next: Span | null) {
      if (next === null) {
        if (visible) element.style.opacity = "0";
        visible = false;
        return;
      }
      if (target === null || next.bottom - next.top !== target.bottom - target.top) {
        element.style.height = `${next.bottom - next.top}px`;
      }
      element.style.width = `${next.width}px`;
      target = next;
      if (!visible || reducedMotion?.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        center = (next.top + next.bottom) / 2;
        velocity = 0;
        stretch = 0;
        paint();
        element.style.opacity = "1";
        visible = true;
        return;
      }
      if (frame === 0) {
        last = performance.now();
        pending = 0;
        frame = requestAnimationFrame(step);
      }
      paint();
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
  const make = (slot: string, maxStretch: number) => {
    const element = doc.createElement("div");
    element.dataset.weftIndicator = slot;
    layer.append(element);
    return createMover(element, reducedMotion, maxStretch);
  };
  const hoverCapsule = make("hover-capsule", CAPSULE_MAX_STRETCH);
  const selectedCapsule = make("selected-capsule", CAPSULE_MAX_STRETCH);
  const hoverTick = make("hover-tick", TICK_MAX_STRETCH);
  const selectedTick = make("selected-tick", TICK_MAX_STRETCH);
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
