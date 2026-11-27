import { describe, expect, it } from "vite-plus/test";

import { findProjectOwningFolder, isScratchProject } from "./projects.ts";

describe("isScratchProject", () => {
  it.each([null, undefined])(
    "recognises a loaded scratch project when its environment offers no available root (%s)",
    (scratchWorkspaceRoot) => {
      const project = { workspaceRoot: "/remote/scratch", isScratch: true as const };

      expect(isScratchProject(project, scratchWorkspaceRoot)).toBe(true);
    },
  );
});

describe("findProjectOwningFolder", () => {
  const projects = [
    { id: "moved", workspaceRoot: "/old/app", trackedFolders: [{ path: "/new/app/" }] },
    {
      id: "parent",
      workspaceRoot: "/work",
      trackedFolders: [{ path: "/work/repo", discovered: true }],
    },
    { id: "root", workspaceRoot: "/new/app" },
  ];

  it("prefers the project rooted at the folder", () => {
    expect(findProjectOwningFolder(projects, "/new/app")?.id).toBe("root");
  });

  it("finds a project that only has the folder added, so it is not added twice", () => {
    expect(findProjectOwningFolder(projects.slice(0, 2), "/new/app")?.id).toBe("moved");
  });

  it("lets a repository discovered inside another project become its own project", () => {
    expect(findProjectOwningFolder(projects, "/work/repo")).toBeUndefined();
  });
});

describe("findProjectOwningFolder with an archived duplicate", () => {
  it("opens the active project, not the archived one left on the same folder", () => {
    const projects = [
      { id: "archived", workspaceRoot: "/new/app", archivedAt: "2026-11-27T00:00:00.000Z" },
      { id: "moved", workspaceRoot: "/new/app", archivedAt: null },
    ];
    expect(findProjectOwningFolder(projects, "/new/app")?.id).toBe("moved");
  });
});
