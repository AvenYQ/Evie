import { observeResize } from "~/lib/observeResize";

// Weft: hover/selection capsules and guide ticks that slide between project thread rows.
const ROW = '[data-sidebar-row][data-sidebar-parent^="folder:"]';
const SELECTED = `${ROW}[aria-current]:not([aria-current="false"])`;
const TICK_LENGTH = 18;
const CAPSULE_GAP = 2;
const STIFF = 900;
const STRETCH = 2.8;
const DAMPING = 0.72;
const ROW_GAP_TOLERANCE = 12;

type Span = { top: number; bottom: number; left: number; width: number };
type Sample = { top: number; bottom: number; vTop: number; vBottom: number };

// Step length of the spring simulation; matched to the display's frame interval so the
// motion is the same as when it was stepped once per frame.
let frameStep = 1 / 60;
function measureFrameStep(view: (Window & typeof globalThis) | null) {
  if (view === null) return;
  const stamps: number[] = [];
  const probe = (now: number) => {
    stamps.push(now);
    if (stamps.length < 12) {
      view.requestAnimationFrame(probe);
      return;
    }
    const gaps = stamps
      .slice(1)
      .map((stamp, index) => stamp - stamps[index]!)
      .sort((a, b) => a - b);
    const median = gaps[gaps.length >> 1]! / 1000;
    if (median > 1 / 250 && median < 1 / 25) frameStep = Math.min(0.032, median);
  };
  view.requestAnimationFrame(probe);
}

// Two springs per element: the leading edge is stiff and the trailing edge soft, so a
// moving piece stretches toward its target and then recovers. The whole path is worked out
// up front and handed to the browser as a transform animation, so it keeps playing on the
// compositor while the main thread is busy (e.g. rendering a long conversation).
function simulate(from: Sample, target: Span, dt: number) {
  const spring = (x: number, v: number, to: number, k: number) => {
    const next = v + (k * (to - x) - 2 * DAMPING * Math.sqrt(k) * v) * dt;
    return [x + next * dt, next] as const;
  };
  const soft = STIFF / (STRETCH * STRETCH);
  const samples: Sample[] = [from];
  let state = from;
  for (let step = 0; step < 600; step++) {
    const down = target.bottom > state.bottom || target.top > state.top;
    const [top, vTop] = spring(state.top, state.vTop, target.top, down ? soft : STIFF);
    const [bottom, vBottom] = spring(state.bottom, state.vBottom, target.bottom, down ? STIFF : soft);
    state = { top, bottom, vTop, vBottom };
    const settled =
      Math.abs(target.top - top) +
        Math.abs(target.bottom - bottom) +
        Math.abs(vTop) +
        Math.abs(vBottom) <
      0.2;
    if (settled) break;
    samples.push(state);
  }
  samples.push({ top: target.top, bottom: target.bottom, vTop: 0, vBottom: 0 });
  return samples;
}

const sameSpan = (a: Span | null, b: Span) =>
  a !== null &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.bottom - b.bottom) < 0.5 &&
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5;

function createMover(element: HTMLElement, reducedMotion: MediaQueryList | undefined) {
  let target: Span | null = null;
  let rest: Sample = { top: 0, bottom: 0, vTop: 0, vBottom: 0 };
  let path: { samples: Sample[]; dt: number; animation: Animation } | null = null;
  let visible = false;

  const transform = (left: number, sample: Sample, height: number) =>
    `translate(${left}px, ${sample.top}px) scaleY(${Math.max(2, sample.bottom - sample.top) / height})`;

  // Where the element is right now, read from the running animation's clock.
  const current = (): Sample => {
    if (path === null) return rest;
    const { samples, dt, animation } = path;
    const elapsed = animation.currentTime === null ? 0 : Number(animation.currentTime) / 1000;
    const position = elapsed / dt;
    const index = Math.floor(position);
    if (index >= samples.length - 1) return samples[samples.length - 1]!;
    const a = samples[index]!;
    const b = samples[index + 1]!;
    const f = position - index;
    return {
      top: a.top + (b.top - a.top) * f,
      bottom: a.bottom + (b.bottom - a.bottom) * f,
      vTop: a.vTop + (b.vTop - a.vTop) * f,
      vBottom: a.vBottom + (b.vBottom - a.vBottom) * f,
    };
  };

  const stop = () => {
    path?.animation.cancel();
    path = null;
  };

  const place = (to: Span) => {
    const height = Math.max(2, to.bottom - to.top);
    rest = { top: to.top, bottom: to.bottom, vTop: 0, vBottom: 0 };
    element.style.width = `${to.width}px`;
    element.style.height = `${height}px`;
    element.style.transform = transform(to.left, rest, height);
  };

  return {
    moveTo(next: Span | null) {
      if (next === null) {
        if (visible) element.style.opacity = "0";
        visible = false;
        return;
      }
      if (visible && sameSpan(target, next)) return;
      target = next;
      if (!visible || reducedMotion?.matches) {
        stop();
        place(next);
        element.style.opacity = "1";
        visible = true;
        return;
      }
      const from = current();
      stop();
      place(next);
      const dt = frameStep;
      const samples = simulate(from, next, dt);
      if (samples.length < 3) return;
      const height = Math.max(2, next.bottom - next.top);
      const animation = element.animate(
        samples.map((sample) => ({ transform: transform(next.left, sample, height) })),
        { duration: (samples.length - 1) * dt * 1000, easing: "linear" },
      );
      path = { samples, dt, animation };
      animation.addEventListener("finish", () => {
        if (path?.animation === animation) path = null;
      });
    },
    dispose() {
      stop();
    },
  };
}

export function createWeftSidebarIndicators(list: HTMLUListElement) {
  const doc = list.ownerDocument;
  const reducedMotion = doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)");
  list.dataset.weftMotion = "";
  measureFrameStep(doc.defaultView);

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
  // A row just clicked, treated as selected before the app commits the selection, so the
  // selected pieces start moving before the (possibly heavy) conversation render begins.
  let pending: HTMLElement | null = null;
  let pendingTimer = 0;

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
    const committed = list.querySelector<HTMLElement>(SELECTED);
    if (pending !== null && (pending === committed || !pending.isConnected)) pending = null;
    const selectedRow = pending ?? committed;
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
    const target = event.target instanceof Element ? event.target : null;
    const anyRow = target?.closest<HTMLElement>("[data-sidebar-row]") ?? null;
    // In the gap between two rows the pointer is still "on" the row it came from; dropping
    // the hover there would hide the tick and make it reappear on the next row instead of sliding.
    if (anyRow === null && hovered !== null && hovered.isConnected) {
      const box = hovered.getBoundingClientRect();
      const nearby =
        event.clientY >= box.top - ROW_GAP_TOLERANCE &&
        event.clientY <= box.bottom + ROW_GAP_TOLERANCE;
      if (nearby) return;
    }
    const row = anyRow?.matches(ROW) ? anyRow : null;
    if (row === hovered) return;
    hovered = row;
    sync();
  };
  const onPointerLeave = () => {
    hovered = null;
    sync();
  };
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest<HTMLElement>(ROW);
    // Clicks on a row's own buttons or inputs don't select it.
    if (row === null || event.target.closest("button, a, input, textarea, [role='button']") !== row)
      return;
    pending = row;
    clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => {
      pending = null;
      sync();
    }, 1500);
    sync();
  };
  list.addEventListener("click", onClick);
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
      clearTimeout(pendingTimer);
      list.removeEventListener("click", onClick);
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
