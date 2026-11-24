import { describe, expect, it, vi } from "vite-plus/test";
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
    const animations = tick.getAnimations();
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
    const anim = tick.getAnimations()[0]!;
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
    expect(indicator("hover-tick").getAnimations()).toHaveLength(1);
  });

  it("starts the selected pieces toward a clicked row before the selection commits", async () => {
    using harness = mount(4);
    const { rows, indicator } = harness;
    rows[0]!.setAttribute("aria-current", "page");
    await vi.waitFor(() => {
      expect(indicator("selected-tick").style.opacity).toBe("1");
    });
    rows[3]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(indicator("selected-tick").getAnimations()).toHaveLength(1);
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
});
