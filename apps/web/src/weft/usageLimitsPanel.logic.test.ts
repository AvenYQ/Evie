import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUsageLimits,
  type UsageLimitSourceSnapshot,
  UsageLimitSourceId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { resolveAllAgentUsageCards, weftUsageTone } from "./usageLimitsPanel.logic";

const now = Date.parse("2026-10-30T12:00:00.000Z");
const checkedAt = "2026-10-30T11:59:00.000Z";

function makeProvider(input: {
  id: string;
  driver: "codex" | "claudeAgent" | "antigravity" | "pi";
  displayName?: string;
  enabled?: boolean;
  installed?: boolean;
  endpoint?: string;
  usageLimits?: ServerProviderUsageLimits;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.id),
    driver: ProviderDriverKind.make(input.driver),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    enabled: input.enabled ?? true,
    installed: input.installed ?? true,
    version: null,
    status: "ready",
    auth: input.endpoint
      ? {
          status: "authenticated",
          type: "customEndpoint",
          label: "Custom API endpoint",
          endpoint: input.endpoint,
        }
      : { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    ...(input.usageLimits ? { usageLimits: input.usageLimits } : {}),
  };
}

describe("weftUsageTone", () => {
  it("classifies remaining percent into error, warning, and ok tones", () => {
    expect(weftUsageTone(0)).toBe("error");
    expect(weftUsageTone(10)).toBe("error");
    expect(weftUsageTone(11)).toBe("warning");
    expect(weftUsageTone(20)).toBe("warning");
    expect(weftUsageTone(21)).toBe("ok");
    expect(weftUsageTone(100)).toBe("ok");
  });
});

describe("resolveAllAgentUsageCards", () => {
  it("aggregates all enabled providers with readable limits and pins the current agent first", () => {
    const codex = makeProvider({
      id: "codex",
      driver: "codex",
      usageLimits: {
        checkedAt,
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "5h",
            usedPercent: 18,
            windowDurationMins: 300,
            resetsAt: "2026-10-30T15:00:00.000Z",
          },
          {
            id: "seven_day",
            kind: "weekly",
            label: "7d",
            usedPercent: 46,
            windowDurationMins: 10080,
            resetsAt: "2026-11-04T12:00:00.000Z",
          },
        ],
      },
    });
    const claude = makeProvider({
      id: "claudeAgent",
      driver: "claudeAgent",
      usageLimits: {
        checkedAt,
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "5h",
            usedPercent: 85,
            windowDurationMins: 300,
            resetsAt: "2026-10-30T13:30:00.000Z",
          },
          {
            id: "seven_day",
            kind: "weekly",
            label: "7d",
            usedPercent: 40,
            windowDurationMins: 10080,
            resetsAt: "2026-11-02T12:00:00.000Z",
          },
        ],
      },
    });
    const antigravity = makeProvider({
      id: "antigravity",
      driver: "antigravity",
      usageLimits: {
        checkedAt,
        windows: [
          {
            id: "gemini",
            kind: "other",
            label: "Gemini 3.1",
            usedPercent: 92,
            resetsAt: "2026-10-30T14:00:00.000Z",
          },
        ],
      },
    });
    const disabled = makeProvider({
      id: "codex-disabled",
      driver: "codex",
      enabled: false,
      usageLimits: {
        checkedAt,
        windows: [{ id: "five_hour", kind: "session", label: "5h", usedPercent: 10 }],
      },
    });
    const piUnsupported = makeProvider({
      id: "pi",
      driver: "pi",
      usageLimits: { checkedAt, windows: [], unavailable: { reason: "unsupported" } },
    });

    const cards = resolveAllAgentUsageCards({
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-opus-4-6",
      providers: [codex, claude, antigravity, disabled, piUnsupported],
      sources: [],
      now,
    });

    expect(cards.map((card) => card.instanceId)).toEqual(["claudeAgent", "codex", "antigravity"]);
    expect(cards[0]?.isCurrent).toBe(true);
    expect(cards[0]?.primary?.id).toBe("five_hour");
    expect(cards[0]?.primary?.remainingPercent).toBe(15);
    expect(cards[0]?.primary?.tone).toBe("warning");
    // Codex has 5h at 82% left and 7d at 54% left -> bottleneck 7d surfaces as primary.
    expect(cards[1]?.primary?.id).toBe("seven_day");
    expect(cards[1]?.primary?.remainingPercent).toBe(54);
    // Antigravity at 8% left -> error tone.
    expect(cards[2]?.primary?.remainingPercent).toBe(8);
    expect(cards[2]?.primary?.tone).toBe("error");
  });

  it("orders session (5h) before weekly (7d) even when the provider returns weekly first", () => {
    const codex = makeProvider({
      id: "codex",
      driver: "codex",
      usageLimits: {
        checkedAt,
        windows: [
          { id: "seven_day", kind: "weekly", label: "7d", usedPercent: 46 },
          { id: "five_hour", kind: "session", label: "5h", usedPercent: 18 },
        ],
      },
    });

    const cards = resolveAllAgentUsageCards({
      providerInstanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
      providers: [codex],
      sources: [],
      now,
    });

    expect(cards[0]?.windows.map((window) => window.id)).toEqual(["five_hour", "seven_day"]);
  });

  it("falls back to the current unavailable agent only when no enabled agent has readable limits", () => {
    const failed = makeProvider({
      id: "claudeAgent",
      driver: "claudeAgent",
      usageLimits: { checkedAt, windows: [], unavailable: { reason: "probeFailed" } },
    });

    const cards = resolveAllAgentUsageCards({
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      model: null,
      providers: [failed],
      sources: [],
      now,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.primary).toBeNull();
    expect(cards[0]?.unavailableNotice).not.toBeNull();
  });

  it("keeps a read failure on the current agent visible next to readable agents", () => {
    const readable = makeProvider({
      id: "codex",
      driver: "codex",
      usageLimits: {
        checkedAt,
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "5h",
            usedPercent: 10,
            windowDurationMins: 300,
            resetsAt: "2026-10-30T15:00:00.000Z",
          },
        ],
      },
    });
    const cardsFor = (reason: "probeFailed" | "unsupported") =>
      resolveAllAgentUsageCards({
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        model: null,
        providers: [
          readable,
          makeProvider({
            id: "claudeAgent",
            driver: "claudeAgent",
            usageLimits: { checkedAt, windows: [], unavailable: { reason } },
          }),
        ],
        sources: [],
        now,
      });

    const failed = cardsFor("probeFailed");
    expect(failed.map((card) => card.instanceId)).toEqual(["claudeAgent", "codex"]);
    expect(failed[0]?.unavailableNotice).not.toBeNull();
    expect(cardsFor("unsupported").map((card) => card.instanceId)).toEqual(["codex"]);
  });

  it("shows nothing for a current account that has no subscription limits", () => {
    const cards = resolveAllAgentUsageCards({
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      model: null,
      providers: [
        makeProvider({
          id: "claudeAgent",
          driver: "claudeAgent",
          usageLimits: { checkedAt, windows: [], unavailable: { reason: "unsupported" } },
        }),
      ],
      sources: [],
      now,
    });
    expect(cards).toEqual([]);
  });

  it("resolves pooled hub limits for a custom-endpoint provider", () => {
    const pooledClaude = makeProvider({
      id: "claudeAgent",
      driver: "claudeAgent",
      endpoint: "http://127.0.0.1:8317",
      usageLimits: { checkedAt, windows: [], unavailable: { reason: "unsupported" } },
    });
    const source: UsageLimitSourceSnapshot = {
      id: UsageLimitSourceId.make("Hub"),
      kind: "cliproxy",
      label: "Hub",
      origin: "http://127.0.0.1:8317",
      checkedAt,
      accounts: [
        {
          id: "a.json",
          driver: ProviderDriverKind.make("claudeAgent"),
          usageLimits: {
            checkedAt,
            windows: [
              {
                id: "five_hour",
                kind: "session",
                label: "Session",
                usedPercent: 25,
                windowDurationMins: 300,
                resetsAt: "2026-10-30T14:00:00.000Z",
              },
            ],
          },
        },
      ],
    };

    const cards = resolveAllAgentUsageCards({
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      model: null,
      providers: [pooledClaude],
      sources: [source],
      now,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.primary?.remainingPercent).toBe(75);
    expect(cards[0]?.primary?.accountsCount).toBe(1);
  });

  it("handles undefined providers safely", () => {
    expect(
      resolveAllAgentUsageCards({
        providerInstanceId: undefined,
        model: undefined,
        providers: undefined,
        sources: undefined,
        now,
      }),
    ).toEqual([]);
  });
});
