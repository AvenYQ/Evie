import kikiMark from "./kiki-mark.svg?raw";

// The body-level cover survives React replacing the shell without transforming the app beneath it.
const BLINK_MS = 250;
const BLINK_DELAY_MS = 70;
const FADE_DELAY_MS = 260;
const FADE_MS = 210;
const REDUCED_MS = 160;
// Some first screens render nothing while they decide (FirstRunGate waits up to 4s after settings
// hydrate); after this long the cover leaves anyway.
const MAX_WAIT_AFTER_MOUNT_MS = 5000;
const READY =
  "[data-app-sidebar], main, [role='main'], [role='alert'], button, input, textarea, a[href], h1, h2";
// Only content that is actually on screen counts (not inside a hidden or aria-hidden container).
const isShown = (element: Element) =>
  element.getClientRects().length > 0 && element.closest("[hidden], [aria-hidden='true']") === null;

function opaqueBackground(view: Window, elements: ReadonlyArray<Element | null>) {
  for (const element of elements) {
    if (element === null) continue;
    const color = view.getComputedStyle(element).backgroundColor;
    if (color && color !== "transparent" && !/[,/]\s*0(?:\.0+)?\)$/.test(color)) return color;
  }
  // oxlint-disable-next-line t3code/no-untranslated-copy -- CSS system color keyword, not copy.
  return "Canvas";
}

export function startWeftBootScene(doc: Document = document) {
  const shell = doc.getElementById("boot-shell");
  const root = doc.getElementById("root");
  const logo = doc.getElementById("boot-shell-logo");
  const view = doc.defaultView;
  if (shell === null || root === null || view === null) return () => {};
  if (shell.querySelector("#boot-error") !== null) return () => {};
  if (doc.querySelector("[data-weft-boot]") !== null) return () => {};

  const overlay = doc.createElement("div");
  overlay.dataset.weftBoot = "";
  overlay.setAttribute("aria-hidden", "true");
  // #boot-shell inherits a transparent background when no theme is selected; take the first real color.
  overlay.style.backgroundColor = opaqueBackground(view, [shell, root, doc.body, doc.documentElement]);
  const mark = doc.createElement("div");
  mark.dataset.weftBootMark = "";
  // Placed relative to the viewport center (where the shell centers the logo), so it stays on the
  // logo's spot if the window is resized while the app loads.
  const logoBox = logo?.getBoundingClientRect();
  const laidOut = logoBox !== undefined && logoBox.width > 0;
  const box = laidOut ? logoBox : shell.getBoundingClientRect();
  const size = laidOut ? logoBox.width : 64;
  const dx = box.left + box.width / 2 - view.innerWidth / 2;
  const dy = box.top + box.height / 2 - view.innerHeight / 2;
  mark.style.width = `${size}px`;
  mark.style.height = `${size}px`;
  mark.style.left = `calc(50% + ${dx - size / 2}px)`;
  mark.style.top = `calc(50% + ${dy - size / 2}px)`;
  mark.innerHTML = kikiMark;
  overlay.append(mark);
  doc.body.append(overlay);

  let done = false;
  let leaving = false;
  let fallback = 0;
  let frame = 0;
  const animations: Animation[] = [];

  const finish = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    view.clearTimeout(fallback);
    view.cancelAnimationFrame(frame);
    doc.removeEventListener("visibilitychange", onVisible);
    for (const animation of animations) animation.cancel();
    overlay.remove();
  };

  const play = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(keyframes, { fill: "forwards", ...options });
    animations.push(animation);
    return animation;
  };

  const exit = () => {
    if (done || leaving) return;
    leaving = true;
    observer.disconnect();
    view.clearTimeout(fallback);
    try {
      // Animations, not CSS transitions: a theme refresh adds .no-transitions, which zeroes those.
      if (view.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        play(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: REDUCED_MS, easing: "ease-out" })
          .finished.then(finish, finish);
        return;
      }
      const eyes = mark.querySelector("[data-weft-boot-eyes]");
      if (eyes !== null) {
        play(
          eyes,
          [
            { transform: "scaleY(1)", offset: 0, easing: "ease-in" },
            { transform: "scaleY(0.04)", offset: 0.32 },
            { transform: "scaleY(0.04)", offset: 0.44, easing: "ease-out" },
            { transform: "scaleY(1)", offset: 1 },
          ],
          { duration: BLINK_MS, delay: BLINK_DELAY_MS, iterations: 1 },
        );
      }
      play(overlay, [{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_MS,
        delay: FADE_DELAY_MS,
        easing: "ease-out",
      }).finished.then(finish, finish);
    } catch {
      finish();
    }
  };

  // Play only once the window is on screen and the app has painted, so the scene is actually seen.
  const onVisible = () => {
    if (done || doc.visibilityState !== "visible") return;
    doc.removeEventListener("visibilitychange", onVisible);
    frame = view.requestAnimationFrame(() => {
      frame = view.requestAnimationFrame(exit);
    });
  };
  const leaveWhenVisible = () => {
    observer.disconnect();
    view.clearTimeout(fallback);
    doc.addEventListener("visibilitychange", onVisible);
    onVisible();
  };
  const check = () => {
    if (done || leaving) return;
    // A startup failure renders into the shell; never cover the error page.
    if (doc.getElementById("boot-error") !== null) return finish();
    if (shell.isConnected) return;
    if (fallback === 0) fallback = view.setTimeout(leaveWhenVisible, MAX_WAIT_AFTER_MOUNT_MS);
    if (Array.from(root.querySelectorAll(READY)).some(isShown)) leaveWhenVisible();
  };
  const observer = new MutationObserver(check);
  observer.observe(root, { childList: true, subtree: true });
  check();

  return finish;
}
