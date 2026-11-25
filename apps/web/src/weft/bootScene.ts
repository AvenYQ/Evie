// Weft: startup scene. React swaps the stock #boot-shell out in one frame, so before it mounts this
// covers the shell with a body-level copy; once the app has drawn, the tide comes in and the cover
// opens. Only the cover moves: transforming #root breaks the theme's fixed backgrounds and blur.

const WAVE_MS = 550;
const WAVE_STAGGER_MS = 80;
const WAVE_EASE = "cubic-bezier(0.37, 0, 0.18, 1)";
// The front layer nearly fills the circle; each layer also drifts left so the crests travel.
const RISE = [170, 215, 260] as const;
const DRIFT = [150, 175, 200] as const;
// The cover starts opening while the last wave is still arriving, so there is no pause between them.
const OPEN_DELAY_MS = 520;
const OPEN_MS = 450;
const OPEN_EASE = "cubic-bezier(0.45, 0, 0.55, 1)";
const REDUCED_MS = 160;
// Some first screens render nothing while they decide (FirstRunGate waits up to 4s after settings
// hydrate); after this long the cover leaves anyway.
const MAX_WAIT_AFTER_MOUNT_MS = 5000;
const READY =
  "[data-app-sidebar], main, [role='main'], [role='alert'], button, input, textarea, a[href], h1, h2";
// Only content that is actually on screen counts (not inside a hidden or aria-hidden container).
const isShown = (element: Element) =>
  element.getClientRects().length > 0 && element.closest("[hidden], [aria-hidden='true']") === null;

// Same geometry as the app icon and public/weft-boot-mark.svg; the waves extend one period past
// both sides so they can drift without showing an edge.
const WAVE_COLORS = ["#A89CF7", "#6650E8", "#3A2DB4"] as const;
const WAVE_TOPS = [470, 570, 670] as const;
const wavePath = (y: number) =>
  `M-212 ${y}${" c90.5 -73.15 90.5 -73.15 181 0 s90.5 73.15 181 0".repeat(4)} V1100 H-212 Z`;
const MARK = `<svg viewBox="212 212 600 600" width="100%" height="100%" aria-hidden="true" style="display:block">
<defs><clipPath id="weft-boot-clip"><circle cx="512" cy="512" r="300"/></clipPath></defs>
<g clip-path="url(#weft-boot-clip)"><rect x="212" y="212" width="600" height="600" fill="#DCD6FB"/>
${WAVE_TOPS.map((y, i) => `<path data-weft-boot-wave d="${wavePath(y)}" fill="${WAVE_COLORS[i]}"/>`).join("")}
</g></svg>`;

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
  mark.innerHTML = MARK;
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
      overlay.querySelectorAll("[data-weft-boot-wave]").forEach((wave, i) => {
        play(
          wave,
          [
            { transform: "translate(0px, 0px)" },
            { transform: `translate(${-(DRIFT[i] ?? 0)}px, ${-(RISE[i] ?? 0)}px)` },
          ],
          { duration: WAVE_MS, delay: i * WAVE_STAGGER_MS, easing: WAVE_EASE },
        );
      });
      play(overlay, [{ opacity: 1 }, { opacity: 0 }], {
        duration: OPEN_MS,
        delay: OPEN_DELAY_MS,
        easing: OPEN_EASE,
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
