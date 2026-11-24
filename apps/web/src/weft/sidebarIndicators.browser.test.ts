import { describe, expect, it } from "vite-plus/test";
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

// These tests sample the spring frame by frame: the stretch only exists mid-flight.
// oxlint-disable-next-line t3code/no-frame-waits-in-browser-tests -- measuring motion shape, not waiting for a state
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const translateY = (element: HTMLElement) =>
  Number(/translate\([^,]+,\s*([-\d.]+)px\)/.exec(element.style.transform)?.[1]);
const hover = (row: HTMLElement) =>
  row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));

describe("createWeftSidebarIndicators", () => {
  it("parks the selected tick on the guide of the current row", async () => {
    using view = mount(4);
    view.rows[2]!.setAttribute("aria-current", "page");
    await nextFrame();
    const tick = view.indicator("selected-tick");
    expect(tick.style.opacity).toBe("1");
    expect(translateY(tick)).toBeCloseTo(80 + (40 - 18) / 2, 0);
    expect(tick.style.transform).toContain("translate(16");
    const capsule = view.indicator("selected-capsule");
    expect(translateY(capsule)).toBeCloseTo(82, 0);
    expect(capsule.style.height).toBe("36px");
  });

  it("stretches the hover tick while it travels, then settles at tick length", async () => {
    using view = mount(6);
    hover(view.rows[0]!);
    hover(view.rows[5]!);
    const tick = view.indicator("hover-tick");
    let longest = 0;
    for (let frame = 0; frame < 90; frame++) {
      await nextFrame();
      longest = Math.max(longest, parseFloat(tick.style.height));
    }
    expect(longest).toBeGreaterThan(30);
    expect(parseFloat(tick.style.height)).toBeCloseTo(18, 0);
    expect(translateY(tick)).toBeCloseTo(200 + 11, 0);
  });

  it("caps the stretch on a long jump without wobbling the leading end", async () => {
    using view = mount(12);
    view.rows[0]!.setAttribute("aria-current", "page");
    await nextFrame();
    view.rows[0]!.setAttribute("aria-current", "false");
    view.rows[11]!.setAttribute("aria-current", "page");
    const tick = view.indicator("selected-tick");
    let longest = 0;
    let previousBottom = translateY(tick) + 18;
    let reversals = 0;
    let lastDirection = 0;
    for (let frame = 0; frame < 120; frame++) {
      await nextFrame();
      const length = parseFloat(tick.style.height);
      const bottom = translateY(tick) + length;
      longest = Math.max(longest, length);
      const direction = Math.sign(Math.round(bottom - previousBottom));
      if (direction && lastDirection && direction !== lastDirection) reversals++;
      if (direction) lastDirection = direction;
      previousBottom = bottom;
    }
    expect(longest).toBeGreaterThan(40);
    expect(longest).toBeLessThanOrEqual(18 + 38 + 0.5);
    expect(reversals).toBeLessThanOrEqual(2);
    expect(translateY(tick)).toBeCloseTo(440 + 11, 0);
    expect(parseFloat(tick.style.height)).toBeCloseTo(18, 0);
  });

  it("hides the hover pieces on the selected row and when the pointer leaves", async () => {
    using view = mount(3);
    view.rows[1]!.setAttribute("aria-current", "page");
    hover(view.rows[1]!);
    await nextFrame();
    expect(view.indicator("hover-tick").style.opacity).not.toBe("1");
    hover(view.rows[0]!);
    expect(view.indicator("hover-tick").style.opacity).toBe("1");
    view.list.dispatchEvent(new PointerEvent("pointerleave"));
    expect(view.indicator("hover-tick").style.opacity).toBe("0");
  });
});
