import { describe, expect, it, vi } from "vite-plus/test";
import { fakeTimers } from "../../test/render";
import "./weft.css";
import { startWeftBootScene } from "./bootScene";

// The stock boot markup from index.html, with the shell's background left to inherit (no theme selected).
function mount({ errorFirst = false, logoStyle = "width:64px;height:64px;display:block" } = {}) {
  document.body.style.backgroundColor = "rgb(12, 34, 56)";
  const root = document.createElement("div");
  root.id = "root";
  root.innerHTML = `<div id="boot-shell" style="background: inherit; display:flex; height: 300px; align-items:center; justify-content:center">
    <div id="boot-shell-card">${errorFirst ? `<div id="boot-error"></div>` : ""}<img id="boot-shell-logo" src="/src/weft/yaya-folder.svg" alt="YaYa" style="${logoStyle}" /></div>
  </div>`;
  document.body.append(root);
  const stop = startWeftBootScene();
  return {
    root,
    stop,
    cover: () => document.querySelector<HTMLElement>("[data-weft-boot]"),
    appears: (html = `<aside data-app-sidebar><button>New</button></aside>`) => {
      root.innerHTML = html;
    },
    [Symbol.dispose]() {
      stop();
      root.remove();
      document.body.style.backgroundColor = "";
      vi.restoreAllMocks();
    },
  };
}

const animationsIn = (element: Element) =>
  element.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSTransition));
// MutationObserver callbacks run as microtasks; let them land before asserting nothing happened.
const settleObservers = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("startWeftBootScene", () => {
  it("covers the shell with a real color and the mark at the logo's exact spot", () => {
    using scene = mount();
    const logo = document.getElementById("boot-shell-logo")!.getBoundingClientRect();
    const cover = scene.cover()!;
    expect(getComputedStyle(cover).backgroundColor).toBe("rgb(12, 34, 56)");
    const mark = cover.querySelector("[data-weft-boot-mark]")!.getBoundingClientRect();
    expect(Math.abs(mark.left - logo.left)).toBeLessThan(1);
    expect(Math.abs(mark.top - logo.top)).toBeLessThan(1);
    expect(mark.width).toBe(logo.width);
    expect(getComputedStyle(cover).pointerEvents).toBe("none");
  });

  it("waits with the folder, then reveals the duck and ticket before fading out", async () => {
    using scene = mount();
    const cover = scene.cover()!;
    scene.appears("<div></div>");
    await settleObservers();
    expect(animationsIn(cover)).toHaveLength(0);
    const mark = cover.querySelector("[data-weft-boot-mark]")!;
    expect(mark.hasAttribute("data-yaya-waiting")).toBe(true);

    scene.appears();
    await vi.waitFor(() => {
      expect(animationsIn(cover)).toHaveLength(8);
    });
    expect(mark.hasAttribute("data-yaya-waiting")).toBe(false);
    const duck = cover.querySelector('[data-yaya-part="duck"]')!;
    const ticket = cover.querySelector('[data-yaya-part="ticket"]')!;
    const eyes = cover.querySelector('[data-yaya-part="eyes"]')!;
    expect(duck.getAnimations()[0]!.effect?.getTiming().delay).toBe(140);
    expect(ticket.getAnimations()[0]!.effect?.getTiming().delay).toBe(575);
    const [blink] = eyes.getAnimations();
    expect(blink!.effect?.getTiming().iterations).toBe(1);
    expect((blink!.effect as KeyframeEffect).getKeyframes().map((frame) => frame.transform)).toEqual(
      ["scaleY(1)", "scaleY(0.05)", "scaleY(0.05)", "scaleY(1)"],
    );
    expect(getComputedStyle(scene.root).transform).toBe("none");
    expect(getComputedStyle(scene.root).opacity).toBe("1");

    for (const animation of animationsIn(cover)) animation.finish();
    await vi.waitFor(() => {
      expect(scene.cover()).toBeNull();
    });
  });

  it("keeps playing when a theme refresh turns transitions off", async () => {
    using scene = mount();
    const cover = scene.cover()!;
    scene.appears();
    await vi.waitFor(() => {
      expect(animationsIn(cover).length).toBeGreaterThan(0);
    });
    // The rule useTheme turns on during a theme refresh (index.css): it zeroes CSS animations/transitions.
    const style = document.createElement("style");
    style.textContent = ".no-transitions, .no-transitions * { transition-duration: 0s !important; animation-duration: 0s !important; }";
    document.head.append(style);
    document.documentElement.classList.add("no-transitions");
    try {
      const overlayAnimation = cover.getAnimations()[0]!;
      expect(overlayAnimation.playState).toBe("running");
      expect(Number(overlayAnimation.effect?.getComputedTiming().duration)).toBeGreaterThan(0);
      expect(animationsIn(cover).every((animation) => animation.playState === "running")).toBe(true);
    } finally {
      document.documentElement.classList.remove("no-transitions");
      style.remove();
    }
  });

  it("gets out of the way at once when startup fails", async () => {
    using scene = mount();
    expect(scene.cover()).not.toBeNull();
    const error = document.createElement("div");
    error.id = "boot-error";
    document.getElementById("boot-shell")!.replaceChildren(error);
    await vi.waitFor(() => {
      expect(scene.cover()).toBeNull();
    });
  });

  it("never covers an error page that is already there", () => {
    using scene = mount({ errorFirst: true });
    expect(scene.cover()).toBeNull();
  });

  it("only fades when reduced motion is on", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) => ({ matches: query.includes("reduce"), media: query }) as MediaQueryList,
    );
    using scene = mount();
    const cover = scene.cover()!;
    scene.appears();
    await vi.waitFor(() => {
      expect(animationsIn(cover)).toHaveLength(1);
    });
    const fade = cover.getAnimations()[0]!;
    expect(fade.effect?.getTiming().fill).toBe("both");
    fade.finish();
    await vi.waitFor(() => {
      expect(scene.cover()).toBeNull();
    });
  });

  it("does not count hidden content as the app being ready", async () => {
    using scene = mount();
    const cover = scene.cover()!;
    scene.appears(
      `<button hidden>a</button><div hidden><button>b</button></div><div aria-hidden="true"><a href="#">c</a></div><div style="display:none"><h1>d</h1></div>`,
    );
    await settleObservers();
    expect(animationsIn(cover)).toHaveLength(0);
  });

  it("leaves on its own if the app never draws anything", async () => {
    using _clock = fakeTimers();
    using scene = mount();
    const cover = scene.cover()!;
    scene.appears("<div></div>");
    await settleObservers();
    vi.advanceTimersByTime(4900);
    expect(animationsIn(cover)).toHaveLength(0);
    // Past the 5s fallback, plus the two frames it waits before playing.
    vi.advanceTimersByTime(200);
    expect(animationsIn(cover)).toHaveLength(8);
  });

  it("centers the mark when the logo has not been laid out yet", () => {
    using scene = mount({ logoStyle: "width:0;height:0;display:block" });
    const shell = document.getElementById("boot-shell")!.getBoundingClientRect();
    const mark = scene.cover()!.querySelector("[data-weft-boot-mark]")!.getBoundingClientRect();
    expect(mark.width).toBe(124);
    expect(Math.abs(mark.left + mark.width / 2 - (shell.left + shell.width / 2))).toBeLessThan(1);
    expect(Math.abs(mark.top + mark.height / 2 - (shell.top + shell.height / 2))).toBeLessThan(1);
  });

  it("waits for the window to be visible before playing", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    using scene = mount();
    const cover = scene.cover()!;
    scene.appears();
    await settleObservers();
    expect(animationsIn(cover)).toHaveLength(0);

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => {
      expect(animationsIn(cover)).toHaveLength(8);
    });
  });

  it("never locks the app behind the cover if animations fail", async () => {
    vi.spyOn(Element.prototype, "animate").mockImplementation(() => {
      throw new Error("no animations");
    });
    using scene = mount();
    scene.appears();
    await vi.waitFor(() => {
      expect(scene.cover()).toBeNull();
    });
  });

  it("takes over only once and cleans up when disposed (hot reload)", () => {
    using scene = mount();
    const again = startWeftBootScene();
    expect(document.querySelectorAll("[data-weft-boot]")).toHaveLength(1);
    again();
    expect(scene.cover()).not.toBeNull();
    scene.stop();
    expect(scene.cover()).toBeNull();
  });
});
