import { afterEach, describe, expect, it } from "vitest";
import { createWeftSidebarIndicators } from "./sidebarIndicators";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

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
  cleanups.push(() => {
    indicators.dispose();
    list.remove();
    style.remove();
  });
  const indicator = (slot: string) =>
    list.querySelector<HTMLElement>(`[data-weft-indicator="${slot}"]`)!;
  return { list, rows, indicator };
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const translateY = (element: HTMLElement) =>
  Number(/translate\([^,]+,\s*([-\d.]+)px\)/.exec(element.style.transform)?.[1]);

describe("createWeftSidebarIndicators", () => {
  it("parks the selected tick on the guide of the current row", async () => {
    const { rows, indicator } = mount(4);
    rows[2]!.setAttribute("aria-current", "page");
    await nextFrame();
    const tick = indicator("selected-tick");
    expect(tick.style.opacity).toBe("1");
    expect(translateY(tick)).toBeCloseTo(80 + (40 - 18) / 2, 0);
    expect(tick.style.transform).toContain("translate(16");
    const capsule = indicator("selected-capsule");
    expect(translateY(capsule)).toBeCloseTo(82, 0);
    expect(capsule.style.height).toBe("36px");
  });

  it("stretches the hover tick while it travels, then settles at tick length", async () => {
    const { rows, indicator } = mount(6);
    rows[0]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    rows[5]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    const tick = indicator("hover-tick");
    let longest = 0;
    for (let frame = 0; frame < 90; frame++) {
      await nextFrame();
      longest = Math.max(longest, parseFloat(tick.style.height));
    }
    expect(longest).toBeGreaterThan(30);
    expect(parseFloat(tick.style.height)).toBeCloseTo(18, 0);
    expect(translateY(tick)).toBeCloseTo(200 + 11, 0);
  });

  it("hides the hover pieces on the selected row and when the pointer leaves", async () => {
    const { list, rows, indicator } = mount(3);
    rows[1]!.setAttribute("aria-current", "page");
    rows[1]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    await nextFrame();
    expect(indicator("hover-tick").style.opacity).not.toBe("1");
    rows[0]!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(indicator("hover-tick").style.opacity).toBe("1");
    list.dispatchEvent(new PointerEvent("pointerleave"));
    expect(indicator("hover-tick").style.opacity).toBe("0");
  });
});
