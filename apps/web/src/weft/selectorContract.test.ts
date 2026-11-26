import { describe, expect, it } from "vite-plus/test";
import alertDialogSrc from "../components/ui/alert-dialog.tsx?raw";
import appSidebarLayoutSrc from "../components/AppSidebarLayout.tsx?raw";
import commandSrc from "../components/ui/command.tsx?raw";
import composerBannerSrc from "../components/chat/ComposerBanner.tsx?raw";
import composerBannerStackSrc from "../components/chat/ComposerBannerStack.tsx?raw";
import composerSurfaceSrc from "../components/chat/ComposerSurface.tsx?raw";
import dialogSrc from "../components/ui/dialog.tsx?raw";
import sheetSrc from "../components/ui/sheet.tsx?raw";
import sidebarProjectFolderHeaderSrc from "../components/sidebar/SidebarProjectFolderHeader.tsx?raw";
import sidebarThreadRowSrc from "../components/sidebar/SidebarThreadRow.tsx?raw";
import threadDetailsCardSrc from "../components/chat/ThreadDetailsCard.tsx?raw";
import usageLimitRecoveryBannerSrc from "../components/chat/UsageLimitRecoveryBanner.tsx?raw";
import bootErrorSrc from "../lib/bootError.ts?raw";
import indexHtmlSrc from "../../index.html?raw";
import mainSrc from "../main.tsx?raw";

const CONTRACTS: ReadonlyArray<{
  readonly file: string;
  readonly source: string;
  readonly tokens: ReadonlyArray<string>;
}> = [
  {
    file: "index.html",
    source: indexHtmlSrc,
    tokens: ['id="root"', 'id="boot-shell"', 'id="boot-shell-logo" src="/src/weft/kiki-mark.svg"'],
  },
  {
    file: "lib/bootError.ts",
    source: bootErrorSrc,
    tokens: ['getElementById("boot-shell")', 'id: "boot-error"'],
  },
  {
    file: "main.tsx",
    source: mainSrc,
    tokens: ['import "./weft"', 'getElementById("root")'],
  },
  {
    file: "components/AppSidebarLayout.tsx",
    source: appSidebarLayoutSrc,
    tokens: ["data-app-sidebar"],
  },
  {
    file: "components/sidebar/SidebarProjectFolderHeader.tsx",
    source: sidebarProjectFolderHeaderSrc,
    tokens: ["sidebar-project-folder", "data-sidebar-row"],
  },
  {
    file: "components/sidebar/SidebarThreadRow.tsx",
    source: sidebarThreadRowSrc,
    tokens: ["data-thread-item", "data-sidebar-row", "data-sidebar-parent"],
  },
  {
    file: "components/chat/ThreadDetailsCard.tsx",
    source: threadDetailsCardSrc,
    tokens: ["data-thread-details-card", "data-thread-details-panel"],
  },
  {
    file: "components/chat/ComposerBanner.tsx",
    source: composerBannerSrc,
    tokens: [
      "data-composer-banner-surface",
      "composer-banner-attachment",
      "composer-banner-content",
      "composer-banner-actions",
      "composer-banner-icon",
      "data-composer-banner-row",
    ],
  },
  {
    file: "components/chat/ComposerBannerStack.tsx",
    source: composerBannerStackSrc,
    tokens: ["data-composer-banner-stack"],
  },
  {
    file: "components/chat/ComposerSurface.tsx",
    source: composerSurfaceSrc,
    tokens: ["data-chat-composer-main-surface"],
  },
  {
    file: "components/chat/UsageLimitRecoveryBanner.tsx",
    source: usageLimitRecoveryBannerSrc,
    tokens: ["GaugeIcon", 'variant: "warning"'],
  },
  {
    file: "components/ui/dialog.tsx",
    source: dialogSrc,
    tokens: ['data-slot="dialog-popup"'],
  },
  {
    file: "components/ui/alert-dialog.tsx",
    source: alertDialogSrc,
    tokens: ['data-slot="alert-dialog-popup"'],
  },
  {
    file: "components/ui/command.tsx",
    source: commandSrc,
    tokens: ['data-slot="command-dialog-popup"'],
  },
  {
    file: "components/ui/sheet.tsx",
    source: sheetSrc,
    tokens: ['data-slot="sheet-popup"'],
  },
];

describe("weft upstream selector contracts", () => {
  it.each(CONTRACTS)("preserves hooks in $file", ({ file, source, tokens }) => {
    for (const token of tokens) {
      expect(source, `Missing "${token}" in ${file}`).toContain(token);
    }
  });
});
