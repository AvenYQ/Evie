import { describe, expect, it } from "vite-plus/test";

import { bundleOf, pickMacZip, swapScript } from "./macSelfUpdate.ts";

const file = (name: string) => ({
  url: new URL(`https://example.test/v1/${name}`),
  info: { url: name },
});

describe("macSelfUpdate", () => {
  it("finds the app bundle the process runs from", () => {
    expect(bundleOf("/Applications/Tide.app/Contents/MacOS/Tide")).toBe("/Applications/Tide.app");
    expect(bundleOf("/usr/local/bin/node")).toBeUndefined();
  });

  it("prefers the zip built for this architecture", () => {
    const files = [file("Tide-1-x64-mac.zip"), file("Tide-1-arm64-mac.zip"), file("Tide-1.dmg")];
    expect(pickMacZip(files, "arm64")?.info.url).toBe("Tide-1-arm64-mac.zip");
    expect(pickMacZip([file("Tide-1-mac.zip")], "arm64")?.info.url).toBe("Tide-1-mac.zip");
    expect(pickMacZip([file("Tide-1.dmg")], "arm64")).toBeUndefined();
  });

  it("keeps the old bundle until the new one is in place, and reopens only when asked", () => {
    const script = swapScript({
      pid: 42,
      from: "/tmp/new/Tide.app",
      to: "/Applications/Tide's.app",
      log: "/tmp/swap.log",
      reopen: true,
    });
    expect(script).toContain("while kill -0 42");
    expect(script).toContain(`mv '/Applications/Tide'\\''s.app' "$old"`);
    expect(script.indexOf('rm -rf "$old"')).toBeGreaterThan(
      script.indexOf("mv '/tmp/new/Tide.app'"),
    );
    expect(script).toContain("/usr/bin/open");
    expect(script).toContain("lsregister -f");
    expect(swapScript({ pid: 1, from: "/a", to: "/b", log: "/c", reopen: false })).not.toContain(
      "/usr/bin/open",
    );
    const renamed = swapScript({
      pid: 7,
      from: "/tmp/new/Evie.app",
      to: "/Applications/Tide.app",
      target: "/Applications/Evie.app",
      log: "/tmp/swap.log",
      reopen: true,
    });
    expect(renamed).toContain(`mv '/tmp/new/Evie.app' '/Applications/Evie.app'`);
    expect(renamed).toContain(`/usr/bin/open '/Applications/Evie.app'`);
  });
});
