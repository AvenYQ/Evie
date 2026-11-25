import { describe, expect, it, vi } from "vite-plus/test";
import "./weft.css";
import { createWeftSidebarIndicators } from "./sidebarIndicators";

function mount(rowCount: number) {
  const style = document.createElement("style");
  style.textContent = `
    ul { position: relative; margin: 0; padding: 0; width: 260px; }
    li { list-style: none; }
    button[data-sidebar-row] { position: relative; display: block; width: calc(100% - 7px); margin-left: 7px; height: 40px; }
    button[data-sidebar-row]::before { content: ""; position: absolute; top: 0; bottom: 0; left: 10px; width: 1px; }
  `;
  document.head.append(style);
  const list = document.createElement("ul");
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.dataset.sidebarRow = `thread-${index}`;
    row.dataset.sidebarParent = "folder:p:/repo";
    li.append(row);
    list.append(li);
    return row;
  });
  document.body.append(list);
  const indicators = createWeftSidebarIndicators(list);
  const indicator = (slot: string) =>
    list.querySelector<HTMLElement>(`[data-weft-indicator="${slot}"]`)!;
  return {
    list,
    rows,
    indicator,
    [Symbol.dispose]() {
      indicators.dispose();
      list.remove();
      style.remove();
    },
  };
}

const translateY = (element: HTMLElement) =>
  Number(/translate\([^,]+,\s*([-\d.]+)px\)/.exec(element.style.transform)?.[1]);
const waapiAnimations = (element: HTMLElement) =>
  element.getAnimations().filter((animation) => !(animation instanceof CSSTransition));
// What is on screen, including a running transform animation.
const shown = (element: HTMLElement) => {
  const matrix = new DOMMatrix(getComputedStyle(element).transform);
  return { top: matrix.f, length: parseFloat(element.style.height) * matrix.d };
};

describe("createWeftSidebarIndicators", () => {
  it("parks the selected tick on the guide of the current row", async () => {
    using harness = mount(4);
    const { rows, indicator } = harness;
    rows[2]!.setAttribute("aria-current", "page");
    const tick = indicator("selected-tick");
    await vi.waitFor(() => {
      expect(tick.style.opacity).toBe("1");
    });
    expect(translateY(tick)).toBeCloseTo(80 + (40 - 18) / 2, 0);
    expect(tick.style.transform).toContain("translate(16");
    const capsule = indicator("selected-capsule");
    expect(translateY(capsule)).toBeCloseTo(82, 0);
    expect(capsule.style.height).toBe("36px");
  });

  it("stretches the hover tick while it travels, then settles at tick length", async () => {
    using harness = mount(6);
    const { rows, indicator } = harness;
    rows[0]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    rows[5]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    const tick = indicator("hover-tick");
    // The motion is a browser animation, so it keeps playing while the main thread is busy.
    const animations = waapiAnimations(tick);
    expect(animations).toHaveLength(1);
    const anim = animations[0]!;
    anim.pause();
    let longest = 0;
    const duration = Number(anim.effect?.getTiming().duration ?? 0);
    for (let ms = 0; ms <= duration; ms += 16) {
      anim.currentTime = ms;
      longest = Math.max(longest, shown(tick).length);
    }
    anim.finish();
    expect(longest).toBeGreaterThan(30);
    expect(shown(tick).length).toBeCloseTo(18, 0);
    expect(shown(tick).top).toBeCloseTo(200 + 11, 0);
  });

  it("continues from where it is when the target changes mid-move", () => {
    using harness = mount(6);
    const { rows, indicator } = harness;
    rows[0]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    rows[5]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    const tick = indicator("hover-tick");
    const anim = waapiAnimations(tick)[0]!;
    anim.pause();
    anim.currentTime = 100;
    const before = shown(tick);
    rows[2]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    const after = shown(tick);
    expect(Math.abs(after.top - before.top)).toBeLessThan(1);
    expect(Math.abs(after.length - before.length)).toBeLessThan(1);
  });

  it("keeps the hover tick while the pointer crosses the gap between rows", () => {
    using harness = mount(3);
    const { list, rows, indicator } = harness;
    rows[0]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    const gapY = rows[0]!.getBoundingClientRect().bottom + 2;
    list.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: gapY }));
    expect(indicator("hover-tick").style.opacity).toBe("1");
    rows[1]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    // It slides over instead of reappearing on the next row.
    expect(waapiAnimations(indicator("hover-tick"))).toHaveLength(1);
  });

  it("starts the selected pieces toward a clicked row before the selection commits", async () => {
    using harness = mount(4);
    const { rows, indicator } = harness;
    rows[0]!.setAttribute("aria-current", "page");
    await vi.waitFor(() => {
      expect(indicator("selected-tick").style.opacity).toBe("1");
    });
    rows[3]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(waapiAnimations(indicator("selected-tick"))).toHaveLength(1);
    expect(translateY(indicator("selected-tick"))).toBeCloseTo(120 + 11, 0);
  });

  it("hides the hover pieces on the selected row and when the pointer leaves", async () => {
    using harness = mount(3);
    const { list, rows, indicator } = harness;
    rows[1]!.setAttribute("aria-current", "page");
    rows[1]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    await vi.waitFor(() => {
      expect(indicator("selected-tick").style.opacity).toBe("1");
    });
    expect(indicator("hover-tick").style.opacity).not.toBe("1");
    rows[0]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(indicator("hover-tick").style.opacity).toBe("1");
    list.dispatchEvent(new PointerEvent("pointerleave"));
    expect(indicator("hover-tick").style.opacity).toBe("0");
  });

  it("slides the hover tick out of the selected row instead of popping up at the next row", async () => {
    using harness = mount(3);
    const { rows, indicator } = harness;
    rows[1]!.setAttribute("aria-current", "page");
    await vi.waitFor(() => {
      expect(indicator("selected-tick").style.opacity).toBe("1");
    });
    const tick = indicator("hover-tick");
    rows[1]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(tick.style.opacity).toBe("0");
    expect(translateY(tick)).toBeCloseTo(40 + 11, 0);
    rows[2]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(tick.style.opacity).toBe("1");
    const slide = waapiAnimations(tick)[0]!;
    slide.pause();
    slide.currentTime = 0;
    expect(shown(tick).top).toBeCloseTo(40 + 11, 0);
  });

  it("leaves no fading copy when a hidden hover tick crosses into another folder", async () => {
    using harness = mount(6);
    const { list, rows, indicator } = harness;
    for (let index = 0; index < 3; index++) rows[index]!.dataset.sidebarParent = "folder:a";
    for (let index = 3; index < 6; index++) rows[index]!.dataset.sidebarParent = "folder:b";
    rows[0]!.setAttribute("aria-current", "page");
    await vi.waitFor(() => {
      expect(indicator("selected-tick").style.opacity).toBe("1");
    });
    rows[0]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    await vi.waitFor(() => {
      expect(getComputedStyle(indicator("hover-tick")).opacity).toBe("0");
    });
    rows[4]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(
      list.querySelectorAll('[data-weft-ghost][data-weft-indicator="hover-tick"]'),
    ).toHaveLength(0);
    expect(indicator("hover-tick").style.opacity).toBe("1");
  });

  // The cross-fade is skipped under reduced motion, which CI's macOS runners report.
  it.skipIf(matchMedia("(prefers-reduced-motion: reduce)").matches)(
    "fades out and fades in without stretching when moving across different project folders",
    async () => {
      using harness = mount(6);
      const { list, rows, indicator } = harness;
      // Split into two separate project folders (rows 0-2 in folder A, rows 3-5 in folder B).
      for (let index = 0; index < 3; index++) rows[index]!.dataset.sidebarParent = "folder:a";
      for (let index = 3; index < 6; index++) rows[index]!.dataset.sidebarParent = "folder:b";

      rows[0]!.setAttribute("aria-current", "page");
      const tick = indicator("selected-tick");
      await vi.waitFor(() => {
        expect(tick.style.opacity).toBe("1");
      });

      // Click row 5 in folder B -> should cross-fade instead of stretching across the gap.
      rows[5]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const ghosts = list.querySelectorAll<HTMLElement>("[data-weft-ghost]");
      expect(ghosts.length).toBeGreaterThanOrEqual(1);

      const anim = waapiAnimations(tick)[0]!;
      anim.pause();
      anim.currentTime = 40;
      // Length stays at 18px (no rubber-band stretch across folders).
      expect(shown(tick).length).toBeCloseTo(18, 0);
      // Position is already near row 5 (200 + 11 = 211), not mid-flight near row 2.
      expect(shown(tick).top).toBeGreaterThan(200);

      // Finish animations -> ghosts clean up cleanly.
      anim.finish();
      for (const ghost of ghosts) {
        for (const ghostAnim of ghost.getAnimations()) ghostAnim.finish();
      }
      await vi.waitFor(() => {
        expect(list.querySelectorAll("[data-weft-ghost]")).toHaveLength(0);
      });
    },
  );

  it("uses translucent capsules so glass sidebar backgrounds show through", () => {
    using harness = mount(2);
    const { list, indicator } = harness;
    list.style.setProperty("--sidebar-foreground", "rgb(255, 255, 255)");
    const hoverBg = getComputedStyle(indicator("hover-capsule")).backgroundColor;
    const selectedBg = getComputedStyle(indicator("selected-capsule")).backgroundColor;
    expect(hoverBg).toMatch(/0\.06|6%/);
    expect(selectedBg).toMatch(/0\.1\b|10%/);
  });
});
