import { describe, expect, it, vi } from "vite-plus/test";
import "./weft.css";
import { createWeftSidebarIndicators } from "./sidebarIndicators";
import { createWeftSidebarListMotion } from "./sidebarListMotion";

function createFolderHeader(folderKey: string, expanded: boolean) {
  const li = document.createElement("li");
  li.dataset.testid = "sidebar-project-folder";
  li.style.height = "36px";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.sidebarRow = folderKey;
  btn.setAttribute("aria-expanded", String(expanded));
  btn.style.cssText = "display: block; width: 100%; height: 36px;";
  li.append(btn);
  return { li, btn };
}

function createThreadItem(id: string, folderKey: string) {
  const li = document.createElement("li");
  li.style.height = "40px";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.sidebarRow = id;
  btn.dataset.sidebarParent = folderKey;
  btn.style.cssText =
    "position: relative; display: block; width: calc(100% - 7px); margin-left: 7px; height: 40px;";
  li.append(btn);
  return { li, btn };
}

function mountFolderList() {
  const style = document.createElement("style");
  style.textContent = `
    ul.weft-test-list { position: relative; margin: 0; padding: 0; width: 260px; list-style: none; }
    ul.weft-test-list > li { list-style: none; }
    ul.weft-test-list [data-sidebar-row][data-sidebar-parent^="folder:"]::before {
      content: ""; position: absolute; top: 0; bottom: 0; left: 10px; width: 1px;
    }
  `;
  document.head.append(style);
  const list = document.createElement("ul");
  list.className = "weft-test-list";
  document.body.append(list);

  const indicators = createWeftSidebarIndicators(list);
  const motion = createWeftSidebarListMotion(list, indicators);

  const indicator = (slot: string) =>
    list.querySelector<HTMLElement>(`[data-weft-indicator="${slot}"]`)!;

  return {
    list,
    indicators,
    motion,
    indicator,
    [Symbol.dispose]() {
      motion.dispose();
      indicators.dispose();
      list.remove();
      style.remove();
      delete document.documentElement.dataset.themeId;
      document.documentElement.classList.remove("dark");
      document.documentElement.style.removeProperty("--app-theme-accent");
    },
  };
}

describe("createWeftSidebarListMotion", () => {
  it("cascades entering rows and moves lower projects + selected indicator in lockstep on expand", async () => {
    using harness = mountFolderList();
    const { list, motion, indicator } = harness;
    const folderA = createFolderHeader("folder:a", false);
    const folderB = createFolderHeader("folder:b", true);
    const b0 = createThreadItem("b0", "folder:b");
    b0.btn.setAttribute("aria-current", "page");
    list.append(folderA.li, folderB.li, b0.li);
    motion.update(false);

    const tick = indicator("selected-tick");
    await vi.waitFor(() => {
      expect(tick.style.opacity).toBe("1");
    });
    const tickBefore = tick.getBoundingClientRect().top;
    const b0Before = b0.li.getBoundingClientRect().top;

    // Expand folder A with 3 threads
    folderA.btn.setAttribute("aria-expanded", "true");
    const a0 = createThreadItem("a0", "folder:a");
    const a1 = createThreadItem("a1", "folder:a");
    const a2 = createThreadItem("a2", "folder:a");
    list.insertBefore(a0.li, folderB.li);
    list.insertBefore(a1.li, folderB.li);
    list.insertBefore(a2.li, folderB.li);
    motion.update(true);

    // Pause animations at frame 0 to inspect initial lockstep positions
    for (const el of [a0.li, a1.li, a2.li, folderB.li, b0.li, tick]) {
      for (const anim of el.getAnimations()) anim.pause();
    }

    // Entered rows have staggered delays (0ms, 22ms, 44ms)
    const delays = [a0.li, a1.li, a2.li].map((el) =>
      Number(el.getAnimations()[0]?.effect?.getTiming().delay ?? -1),
    );
    expect(delays).toEqual([0, 22, 44]);

    // Lower project row and its selected tick start at their pre-expand visual position (no jump!)
    expect(b0.li.getBoundingClientRect().top).toBeCloseTo(b0Before, 0);
    expect(tick.getBoundingClientRect().top).toBeCloseTo(tickBefore, 0);
  });

  it("uses a clipped temporary curtain when collapsing a folder and removes it after finish", async () => {
    using harness = mountFolderList();
    const { list, motion } = harness;
    const folderA = createFolderHeader("folder:a", true);
    const a0 = createThreadItem("a0", "folder:a");
    const a1 = createThreadItem("a1", "folder:a");
    const folderB = createFolderHeader("folder:b", true);
    const b0 = createThreadItem("b0", "folder:b");
    list.append(folderA.li, a0.li, a1.li, folderB.li, b0.li);
    motion.update(false);

    folderA.btn.setAttribute("aria-expanded", "false");
    a0.li.remove();
    a1.li.remove();
    motion.update(true);

    const curtain = list.querySelector<HTMLElement>("[data-weft-curtain]");
    expect(curtain).not.toBeNull();
    expect(curtain!.inert).toBe(true);
    expect(curtain!.getAnimations()).toHaveLength(1);
    expect(folderB.li.getAnimations()).toHaveLength(1);

    // Finish curtain animation -> curtain cleans itself up
    curtain!.getAnimations()[0]!.finish();
    await vi.waitFor(() => {
      expect(list.querySelector("[data-weft-curtain]")).toBeNull();
    });
  });

  it("animates a new thread entering an already-open folder and marks it fresh", () => {
    using harness = mountFolderList();
    const { list, motion } = harness;
    const folderA = createFolderHeader("folder:a", true);
    const a1 = createThreadItem("a1", "folder:a");
    list.append(folderA.li, a1.li);
    motion.update(false);

    const fresh = createThreadItem("a0", "folder:a");
    list.insertBefore(fresh.li, a1.li);
    motion.update(true);

    expect(fresh.btn.dataset.weftFresh).toBe("true");
    expect(fresh.li.getAnimations()).toHaveLength(1);
    expect(a1.li.getAnimations()).toHaveLength(1);
  });

  it("resolves theme-specific tick colors for dune-garden and dune-plotter-tide in light and dark mode", () => {
    using harness = mountFolderList();
    const { list, indicator } = harness;
    const tick = indicator("selected-tick");
    document.documentElement.style.setProperty("--app-theme-accent", "#d45c3d");

    // Default / 网点晨昏 -> uses --app-theme-accent
    document.documentElement.dataset.themeId = "dune-halftone-quota";
    expect(getComputedStyle(tick).backgroundColor).toBe("rgb(212, 92, 61)");

    // 剪纸花园 light & dark
    document.documentElement.dataset.themeId = "dune-garden";
    expect(getComputedStyle(tick).backgroundColor).toBe("rgb(93, 122, 74)");
    document.documentElement.classList.add("dark");
    expect(getComputedStyle(tick).backgroundColor).toBe("rgb(168, 196, 142)");

    // 绘图纸潮汐 dark & light
    document.documentElement.dataset.themeId = "dune-plotter-tide";
    expect(getComputedStyle(tick).backgroundColor).toBe("rgb(170, 182, 208)");
    document.documentElement.classList.remove("dark");
    expect(getComputedStyle(tick).backgroundColor).toBe("rgb(91, 107, 140)");

    expect(list.dataset.weftMotion).toBe("");
  });
});
