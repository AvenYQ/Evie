import type { RowEnterMotion, RowShiftMotion, WeftSidebarIndicators } from "./sidebarIndicators";

// Weft: compositor-only sidebar list motion (Preset A: staggered cascade reveal + clipped
// collapse curtain + new-thread entry + lockstep indicator follow).
const OPEN_DURATION = 250;
const CLOSE_DURATION = 210;
const NEW_THREAD_DURATION = 280;
const NEW_THREAD_SHIFT_DURATION = 260;
const OPEN_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const CLOSE_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const CASCADE_STAGGER = 22;
const CASCADE_MAX_DELAY = 110;
const CLOSE_ROW_DURATION = 130;
const CLOSE_ROW_STAGGER = 14;
const CLOSE_ROW_MAX_DELAY = 70;
const FRESH_INK_DURATION = 560;
const STOCK_TIMING = { duration: 150, easing: "ease-out" } as const;
const MAX_FADED_ROWS_PER_UPDATE = 40;
const VIEWPORT_MARGIN = 120;

const rowTravel = (height: number) => Math.min(height, 40);

type RowSnapshot = {
  top: number;
  left: number;
  width: number;
  height: number;
  folderKey: string | null;
  expanded: boolean;
  parentFolder: string | null;
};

function progress(animation: Animation) {
  return animation.playState === "finished"
    ? 1
    : Number(animation.effect?.getComputedTiming().progress ?? 0);
}

function stripCloneIdentifiers(root: HTMLElement) {
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of Array.from(element.attributes)) {
      if (
        (attribute.name === "id" && element.namespaceURI !== "http://www.w3.org/2000/svg") ||
        attribute.name === "data-thread-item" ||
        attribute.name === "data-thread-selection-safe" ||
        attribute.name === "data-testid"
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

function snapshotRow(node: HTMLElement): RowSnapshot {
  let folderKey: string | null = null;
  let expanded = false;
  if (node.dataset.testid === "sidebar-project-folder") {
    const headerRow = node.querySelector<HTMLElement>('[data-sidebar-row^="folder:"]');
    folderKey = headerRow?.dataset.sidebarRow ?? null;
    expanded = headerRow?.getAttribute("aria-expanded") === "true";
  }
  const parentFolder =
    folderKey === null
      ? (node.querySelector<HTMLElement>('[data-sidebar-parent^="folder:"]')?.dataset
          .sidebarParent ?? null)
      : null;
  return {
    top: node.offsetTop,
    left: node.offsetLeft,
    width: node.offsetWidth,
    height: node.offsetHeight,
    folderKey,
    expanded,
    parentFolder,
  };
}

/** Position the list so all direct children's offsetTop share an origin. */
export function createWeftSidebarListMotion(
  parent: HTMLUListElement,
  indicators?: WeftSidebarIndicators,
) {
  let positions: Map<HTMLElement, RowSnapshot> | null = null;
  let disposed = false;
  const reducedMotion = parent.ownerDocument.defaultView?.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const running = new Map<HTMLElement, { animation: Animation; offset: number }>();
  const entering = new Map<HTMLElement, { animation: Animation; travel: number }>();
  const exiting = new Map<HTMLElement, Animation>();
  const curtains = new Map<HTMLElement, Animation>();
  const freshTimers = new Map<HTMLElement, number>();
  let released: Map<HTMLElement, number> | null = null;

  const scroller = parent.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  let scrollTop = scroller?.scrollTop ?? 0;
  const trackScroll = () => {
    scrollTop = scroller?.scrollTop ?? 0;
  };
  scroller?.addEventListener("scroll", trackScroll, { passive: true });

  const isRealListChild = (node: Element): node is HTMLElement =>
    node instanceof HTMLElement &&
    !exiting.has(node) &&
    !curtains.has(node) &&
    !node.hasAttribute("data-weft-layer") &&
    !node.hasAttribute("data-weft-curtain");

  const isNearViewport = (top: number, height: number) => {
    if (scroller === null || scroller.clientHeight === 0) return true;
    const viewTop = scroller.scrollTop - VIEWPORT_MARGIN;
    const viewBottom = scroller.scrollTop + scroller.clientHeight + VIEWPORT_MARGIN;
    return top + height >= viewTop && top <= viewBottom;
  };

  const remainingOffset = (node: HTMLElement) => {
    const current = running.get(node);
    const run = current ? current.offset * (1 - progress(current.animation)) : 0;
    const entry = entering.get(node);
    const enter = entry ? entry.travel * (1 - progress(entry.animation)) : 0;
    return run + enter;
  };

  const clearCurtains = () => {
    for (const animation of curtains.values()) animation.cancel();
    for (const curtain of curtains.keys()) curtain.remove();
    curtains.clear();
  };

  const clearFades = () => {
    for (const entry of entering.values()) entry.animation.cancel();
    for (const animation of exiting.values()) animation.cancel();
    for (const node of exiting.keys()) node.remove();
    entering.clear();
    exiting.clear();
    clearCurtains();
  };

  const clearFreshTimers = () => {
    for (const [row, timer] of freshTimers) {
      clearTimeout(timer);
      delete row.dataset.weftFresh;
    }
    freshTimers.clear();
  };

  const markFresh = (node: HTMLElement) => {
    const row = node.querySelector<HTMLElement>("[data-sidebar-row]");
    if (row === null) return;
    const existing = freshTimers.get(row);
    if (existing !== undefined) clearTimeout(existing);
    row.dataset.weftFresh = "true";
    const timer = window.setTimeout(() => {
      delete row.dataset.weftFresh;
      freshTimers.delete(row);
    }, FRESH_INK_DURATION);
    freshTimers.set(row, timer);
  };

  const fadeOutStock = (node: HTMLElement, position: RowSnapshot, travel: number, shift: number) => {
    if (position.height === 0) return;
    const clone = node.cloneNode(true) as HTMLElement;
    stripCloneIdentifiers(clone);
    clone.setAttribute("aria-hidden", "true");
    clone.inert = true;
    Object.assign(clone.style, {
      position: "absolute",
      top: `${position.top + remainingOffset(node) + shift}px`,
      left: `${position.left}px`,
      width: `${position.width}px`,
      height: `${position.height}px`,
      margin: "0",
      boxSizing: "border-box",
      contentVisibility: "visible",
      transform: "none",
      transition: "none",
      pointerEvents: "none",
    });
    parent.append(clone);
    const entry = entering.get(node);
    const entryProgress = entry ? progress(entry.animation) : 1;
    const animation = clone.animate(
      [
        { opacity: entryProgress, transform: "translateY(0px)" },
        { opacity: 0, transform: `translateY(${travel}px)` },
      ],
      STOCK_TIMING,
    );
    exiting.set(clone, animation);
    animation.addEventListener(
      "finish",
      () => {
        clone.remove();
        exiting.delete(clone);
      },
      { once: true },
    );
  };

  const collapseFolderCurtain = (
    items: Array<{ node: HTMLElement; position: RowSnapshot; visualTop: number }>,
    topAnchor: number,
    isFolderClose: boolean,
  ) => {
    const visibleItems = items.filter((item) => isNearViewport(item.visualTop, item.position.height));
    if (visibleItems.length === 0) return;
    const last = visibleItems[visibleItems.length - 1]!;
    const totalH = Math.max(0, last.visualTop + last.position.height - topAnchor);
    if (totalH <= 0) return;

    const curtain = parent.ownerDocument.createElement("li");
    curtain.dataset.weftCurtain = "";
    curtain.setAttribute("aria-hidden", "true");
    curtain.inert = true;
    Object.assign(curtain.style, {
      position: "absolute",
      top: `${topAnchor}px`,
      left: "0",
      right: "0",
      height: `${totalH}px`,
      margin: "0",
      padding: "0",
      listStyle: "none",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: "0",
    });

    visibleItems.forEach(({ node, position, visualTop }, index) => {
      const clone = node.cloneNode(true) as HTMLElement;
      stripCloneIdentifiers(clone);
      clone.setAttribute("aria-hidden", "true");
      clone.inert = true;
      Object.assign(clone.style, {
        position: "absolute",
        top: `${visualTop - topAnchor}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        margin: "0",
        boxSizing: "border-box",
        contentVisibility: "visible",
        transform: "none",
        transition: "none",
        pointerEvents: "none",
      });
      curtain.append(clone);
      const rev = visibleItems.length - 1 - index;
      const delay = isFolderClose ? Math.min(rev * CLOSE_ROW_STAGGER, CLOSE_ROW_MAX_DELAY) : 0;
      const duration = isFolderClose ? CLOSE_ROW_DURATION : 160;
      clone.animate(
        [
          { opacity: 1, transform: "translateY(0px)" },
          { opacity: 0, transform: "translateY(-6px)" },
        ],
        { duration, delay, easing: "ease-in", fill: "forwards" },
      );
    });

    parent.append(curtain);
    const clipAnim = curtain.animate(
      [
        { clipPath: "inset(0px 0px 0px 0px)" },
        { clipPath: `inset(0px 0px ${totalH}px 0px)` },
      ],
      { duration: CLOSE_DURATION, easing: CLOSE_EASING, fill: "forwards" },
    );
    curtains.set(curtain, clipAnim);
    clipAnim.addEventListener(
      "finish",
      () => {
        curtain.remove();
        curtains.delete(curtain);
      },
      { once: true },
    );
  };

  const cancel = (node: HTMLElement) => {
    running.get(node)?.animation.cancel();
    running.delete(node);
  };

  const suspend = () => {
    for (const node of running.keys()) cancel(node);
    clearFades();
    positions = null;
    released = null;
  };

  const move = (node: HTMLElement, offset: number, duration: number, easing: string) => {
    cancel(node);
    const entry = entering.get(node);
    if (entry) entry.travel = 0;
    if (offset === 0 && !entry) return;
    const animation = node.animate(
      [{ transform: `translateY(${offset}px)` }, { transform: "translateY(0px)" }],
      { duration, easing },
    );
    running.set(node, { animation, offset });
    animation.addEventListener(
      "finish",
      () => {
        if (running.get(node)?.animation === animation) running.delete(node);
      },
      { once: true },
    );
  };

  return {
    update(animate: boolean) {
      if (disposed) return;
      // A hidden list (the closed narrow sheet stays mounted) reports zero
      // offsets, which would make the first pass after it opens animate every row.
      if (parent.getClientRects().length === 0) {
        suspend();
        return;
      }

      const next = new Map<HTMLElement, RowSnapshot>(
        Array.from(parent.children)
          .filter(isRealListChild)
          .map((node) => [node, snapshotRow(node)]),
      );

      const nextOrder = [...next.keys()];
      const oldOrder = positions === null ? [] : [...positions.keys()];
      const hasFolders =
        nextOrder.some((node) => next.get(node)!.folderKey !== null) ||
        oldOrder.some((node) => positions?.get(node)?.folderKey !== null);

      const openedFolders = new Set<string>();
      const closedFolders = new Set<string>();
      const headerAfterByFolder = new Map<string, RowSnapshot>();
      if (hasFolders && positions !== null) {
        const prevExpanded = new Map<string, boolean>();
        for (const snapshot of positions.values()) {
          if (snapshot.folderKey !== null) prevExpanded.set(snapshot.folderKey, snapshot.expanded);
        }
        for (const snapshot of next.values()) {
          if (snapshot.folderKey === null) continue;
          headerAfterByFolder.set(snapshot.folderKey, snapshot);
          const beforeExpanded = prevExpanded.get(snapshot.folderKey);
          if (beforeExpanded === false && snapshot.expanded) openedFolders.add(snapshot.folderKey);
          if (beforeExpanded === true && !snapshot.expanded) closedFolders.add(snapshot.folderKey);
        }
      }

      let fadeCount = 0;
      if (positions !== null) {
        for (const [node, position] of positions) {
          if (!next.has(node) && position.height > 0) fadeCount++;
        }
        for (const [node, position] of next) {
          if (!positions.has(node) && position.height > 0) fadeCount++;
        }
      }

      const isFolderToggle = openedFolders.size > 0 || closedFolders.size > 0;
      const shouldAnimate =
        animate &&
        positions !== null &&
        !reducedMotion?.matches &&
        (isFolderToggle || fadeCount <= MAX_FADED_ROWS_PER_UPDATE);

      // A removal near the bottom shrinks the list and the browser clamps scrollTop, moving
      // every row on screen; offsets include that shift so those rows slide instead of jump.
      let shift = 0;
      if (scroller !== null) {
        const max = scroller.scrollHeight - scroller.clientHeight;
        if (scrollTop > max && scroller.scrollTop >= max - 1) {
          shift = scroller.scrollTop - scrollTop;
        }
      }

      const movedDelta = new Map<HTMLElement, number>();
      const ridingDelta = (
        order: readonly HTMLElement[],
        index: number,
        retained: (node: HTMLElement) => boolean,
      ) => {
        for (let cursor = index - 1; cursor >= 0; cursor--) {
          const node = order[cursor]!;
          const delta = movedDelta.get(node);
          if (delta !== undefined) return delta;
          if (retained(node)) return remainingOffset(node);
        }
        return undefined;
      };

      const enteredByFolder = new Map<string, HTMLElement[]>();
      const removedByFolder = new Map<
        string,
        Array<{ node: HTMLElement; position: RowSnapshot; visualTop: number }>
      >();
      let hasNewThreadInOpenFolder = false;

      if (!shouldAnimate) {
        clearFades();
      } else {
        clearCurtains();
        for (const [node, position] of next) {
          const previousTop = positions!.get(node)?.top;
          if (previousTop === undefined || previousTop + shift === position.top) continue;
          movedDelta.set(node, previousTop + remainingOffset(node) - position.top + shift);
        }

        for (const [node, position] of next) {
          if (positions!.has(node) || position.height === 0 || position.parentFolder === null)
            continue;
          const group = enteredByFolder.get(position.parentFolder) ?? [];
          group.push(node);
          enteredByFolder.set(position.parentFolder, group);
          if (!openedFolders.has(position.parentFolder)) hasNewThreadInOpenFolder = true;
        }

        for (const [node, position] of positions!) {
          if (next.has(node) || position.height === 0) continue;
          if (hasFolders && position.parentFolder !== null) {
            const listForFolder = removedByFolder.get(position.parentFolder) ?? [];
            listForFolder.push({
              node,
              position,
              visualTop: position.top + remainingOffset(node) + shift,
            });
            removedByFolder.set(position.parentFolder, listForFolder);
          } else {
            const delta = ridingDelta(oldOrder, oldOrder.indexOf(node), (n) => next.has(n));
            fadeOutStock(node, position, delta === undefined ? rowTravel(position.height) : -delta, shift);
          }
        }
      }

      for (const [node, entry] of entering) {
        if (!next.has(node)) {
          entry.animation.cancel();
          entering.delete(node);
        }
      }
      for (const node of running.keys()) {
        if (!shouldAnimate || !next.has(node)) cancel(node);
      }

      let shiftDuration: number = STOCK_TIMING.duration;
      let shiftEasing: string = STOCK_TIMING.easing;
      if (hasFolders) {
        if (closedFolders.size > 0 && openedFolders.size === 0) {
          shiftDuration = CLOSE_DURATION;
          shiftEasing = CLOSE_EASING;
        } else if (openedFolders.size > 0) {
          shiftDuration = OPEN_DURATION;
          shiftEasing = OPEN_EASING;
        } else if (hasNewThreadInOpenFolder) {
          shiftDuration = NEW_THREAD_SHIFT_DURATION;
          shiftEasing = OPEN_EASING;
        } else {
          shiftDuration = CLOSE_DURATION;
          shiftEasing = CLOSE_EASING;
        }
      }

      if (shouldAnimate) {
        // Compute planned folder-expand enter timings up front so indicators for a selected row
        // revealed inside an expanding folder enter together with that row.
        const plannedFolderEnters = new Map<HTMLElement, RowEnterMotion>();
        for (const [folderKey, group] of enteredByFolder) {
          if (!openedFolders.has(folderKey)) continue;
          const visibleGroup = group.filter((node) => {
            const pos = next.get(node)!;
            return isNearViewport(pos.top, pos.height);
          });
          visibleGroup.forEach((node, index) => {
            const delay = Math.min(index * CASCADE_STAGGER, CASCADE_MAX_DELAY);
            const duration = Math.max(120, OPEN_DURATION - delay + 45);
            const travel = -Math.min(12, 8 + index * 1.5);
            plannedFolderEnters.set(node, { travel, duration, delay, easing: OPEN_EASING });
          });
        }

        // Cancel surviving transforms before asking indicators to measure resting layout spans,
        // so selected tick/capsule animate in exact 1:1 lockstep with their shifted <li>.
        for (const node of movedDelta.keys()) cancel(node);
        if (indicators !== undefined) {
          const shiftMap = new Map<HTMLElement, RowShiftMotion>();
          for (const [node, deltaY] of movedDelta) {
            shiftMap.set(node, { deltaY, duration: shiftDuration, easing: shiftEasing });
          }
          indicators.followShift(shiftMap, plannedFolderEnters);
        }

        // 1. Animate folder collapse / thread removal curtains (clipped, zero bleed).
        for (const [folderKey, removedItems] of removedByFolder) {
          const headerAfter = headerAfterByFolder.get(folderKey);
          const isClose = closedFolders.has(folderKey);
          const topAnchor =
            isClose && headerAfter !== undefined
              ? headerAfter.top + headerAfter.height
              : removedItems[0]!.visualTop;
          collapseFolderCurtain(removedItems, topAnchor, isClose);
        }

        // 2. Animate folder expand (Preset A staggered cascade) & new-thread entry.
        const animatedFolderEnters = new Set<HTMLElement>();
        for (const [folderKey, group] of enteredByFolder) {
          const isOpen = openedFolders.has(folderKey);
          if (isOpen) {
            for (const node of group) {
              const plan = plannedFolderEnters.get(node);
              if (plan === undefined) continue;
              animatedFolderEnters.add(node);
              const animation = node.animate(
                [
                  {
                    opacity: 0,
                    transform: `translateY(${plan.travel}px)`,
                    clipPath: "inset(0px 0px 100% 0px)",
                  },
                  {
                    opacity: 1,
                    transform: "translateY(0px)",
                    clipPath: "inset(0px 0px 0px 0px)",
                  },
                ],
                {
                  duration: plan.duration,
                  delay: plan.delay,
                  easing: plan.easing,
                  fill: "backwards",
                },
              );
              entering.set(node, { animation, travel: plan.travel });
              animation.addEventListener(
                "finish",
                () => {
                  if (entering.get(node)?.animation === animation) entering.delete(node);
                },
                { once: true },
              );
            }
          } else {
            for (const node of group) {
              animatedFolderEnters.add(node);
              const pos = next.get(node)!;
              if (!isNearViewport(pos.top, pos.height)) continue;
              markFresh(node);
              const animation = node.animate(
                [
                  { opacity: 0, transform: "translateY(-10px) scale(0.985)" },
                  { opacity: 1, transform: "translateY(0px) scale(1)" },
                ],
                { duration: NEW_THREAD_DURATION, easing: OPEN_EASING },
              );
              entering.set(node, { animation, travel: -10 });
              animation.addEventListener(
                "finish",
                () => {
                  if (entering.get(node)?.animation === animation) entering.delete(node);
                },
                { once: true },
              );
            }
          }
        }

        // 3. Animate non-folder entering rows & all shifted surviving rows.
        for (const [index, node] of nextOrder.entries()) {
          const position = next.get(node)!;
          const previousTop = positions!.get(node)?.top;
          if (previousTop === undefined) {
            if (!animatedFolderEnters.has(node) && position.height > 0 && position.parentFolder === null) {
              const delta = ridingDelta(nextOrder, index, (n) => positions!.has(n));
              const travel = delta === undefined ? -rowTravel(position.height) : delta;
              const animation = node.animate(
                [
                  { opacity: 0, transform: `translateY(${travel}px)` },
                  { opacity: 1, transform: "translateY(0px)" },
                ],
                STOCK_TIMING,
              );
              entering.set(node, { animation, travel });
              animation.addEventListener(
                "finish",
                () => {
                  if (entering.get(node)?.animation === animation) entering.delete(node);
                },
                { once: true },
              );
            }
            continue;
          }
          const delta = movedDelta.get(node);
          if (delta !== undefined) move(node, delta, shiftDuration, shiftEasing);
        }
      }

      if (released !== null) {
        if (!reducedMotion?.matches) {
          for (const [node, position] of next) {
            const top = released.get(node);
            if (top !== undefined) move(node, top - position.top, STOCK_TIMING.duration, STOCK_TIMING.easing);
          }
        }
        released = null;
      }

      positions = next;
      if (scroller !== null) scrollTop = scroller.scrollTop;
    },
    release() {
      suspend();
      const origin = parent.getBoundingClientRect().top;
      released = new Map(
        Array.from(parent.children)
          .filter(isRealListChild)
          .map((node) => [node, node.getBoundingClientRect().top - origin]),
      );
    },
    suspend,
    dispose() {
      suspend();
      clearFreshTimers();
      scroller?.removeEventListener("scroll", trackScroll);
      disposed = true;
    },
  };
}
