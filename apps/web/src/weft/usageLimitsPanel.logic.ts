import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderInstanceId,
  type ServerProvider,
  type UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import {
  antigravityWindowLimitsModel,
  type LimitPace,
  paceOf,
  paceRemainingPercent,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { limitsNotice } from "@t3tools/shared/usageLimitsCopy";
import {
  nextPoolReset,
  resolveThreadDetailsLimits,
} from "../components/chat/ThreadDetailsUsage.logic";

export type WeftUsageTone = "ok" | "warning" | "error";

export interface WeftUsageWindow {
  readonly id: string;
  readonly label: string;
  readonly remainingPercent: number;
  readonly tone: WeftUsageTone;
  readonly pace: LimitPace | null;
  readonly timeLeftPercent: number | null;
  readonly resetsAt: string | null;
  readonly resetMs: number | null;
  readonly accountsCount: number;
}

export interface WeftAgentUsageCard {
  readonly instanceId: ProviderInstanceId;
  readonly driver: ServerProvider["driver"];
  readonly displayName: string;
  readonly accentColor: string | undefined;
  readonly isCurrent: boolean;
  readonly windows: readonly WeftUsageWindow[];
  readonly primary: WeftUsageWindow | null;
  readonly secondary: WeftUsageWindow | null;
  readonly unavailableNotice: string | null;
}

export function weftUsageTone(left: number): WeftUsageTone {
  if (left <= 10) return "error";
  if (left <= 20) return "warning";
  return "ok";
}

function resolveDisplayName(provider: ServerProvider): string {
  const custom = provider.displayName?.trim();
  if (custom) return custom;
  return PROVIDER_DISPLAY_NAMES[provider.driver] ?? String(provider.driver);
}

function parseResetMs(resetsAt: string | null | undefined, now: number): number | null {
  if (!resetsAt) return null;
  const parsed = Date.parse(resetsAt);
  if (!Number.isFinite(parsed) || parsed <= now) return null;
  return parsed - now;
}

function pickPrimaryWindow(
  driver: ServerProvider["driver"],
  windows: readonly WeftUsageWindow[],
  model: string | null,
  isCurrent: boolean,
): WeftUsageWindow | null {
  if (windows.length === 0) return null;
  if (driver === "antigravity" && isCurrent && model !== null) {
    const matching = windows.filter((window) => antigravityWindowLimitsModel(window, model));
    if (matching.length > 0) {
      return matching.reduce((lowest, candidate) =>
        candidate.remainingPercent < lowest.remainingPercent ? candidate : lowest,
      );
    }
  }
  // Surface the tightest bottleneck first so the user immediately sees if a 5h or 7d cap is low.
  return windows.reduce((lowest, candidate) =>
    candidate.remainingPercent < lowest.remainingPercent ? candidate : lowest,
  );
}

/**
 * Resolves usage quota cards for every enabled provider that reports subscription limits,
 * pinning the current thread's active agent to the top so the user can compare all agents at a glance.
 */
export function resolveAllAgentUsageCards(input: {
  readonly providerInstanceId: ProviderInstanceId | null | undefined;
  readonly model: string | null | undefined;
  readonly providers: readonly ServerProvider[] | undefined;
  readonly sources: UsageLimitSourceSnapshots | undefined;
  readonly now: number;
}): readonly WeftAgentUsageCard[] {
  const { providerInstanceId = null, model = null, providers, sources = [], now } = input;
  if (!providers || providers.length === 0) return [];
  const readable: WeftAgentUsageCard[] = [];
  let currentUnavailable: WeftAgentUsageCard | null = null;

  for (const provider of providers) {
    if (!provider.enabled || !provider.installed) continue;
    const isCurrent = provider.instanceId === providerInstanceId;
    const resolved = resolveThreadDetailsLimits(
      provider.instanceId,
      isCurrent ? model : null,
      providers,
      sources,
      now,
    );
    if (!resolved) continue;

    let windows: WeftUsageWindow[] = [];
    let unavailableNotice: string | null = null;

    if (resolved.kind === "pool") {
      windows = resolved.windows.map((window) => {
        const next = nextPoolReset(window, now);
        const resetsAt = next?.member.window.resetsAt ?? null;
        const resetMs = next && next.at > now ? next.at - now : null;
        return {
          id: window.id,
          label: window.label,
          remainingPercent: window.remainingPercent,
          tone: weftUsageTone(window.remainingPercent),
          pace: window.pace,
          timeLeftPercent:
            window.members.length === 1
              ? paceRemainingPercent(window.members[0]!.window, now)
              : null,
          resetsAt,
          resetMs,
          accountsCount: window.members.length,
        };
      });
    } else {
      const notice = limitsNotice(resolved.limits);
      if (notice !== null) {
        unavailableNotice = notice;
      } else {
        windows = resolved.limits.windows.map((window) => {
          const left = remainingPercent(window);
          return {
            id: window.id,
            label: window.label,
            remainingPercent: left,
            tone: weftUsageTone(left),
            pace: paceOf(window, now),
            timeLeftPercent: paceRemainingPercent(window, now),
            resetsAt: window.resetsAt ?? null,
            resetMs: parseResetMs(window.resetsAt, now),
            accountsCount: 1,
          };
        });
      }
    }

    const card: WeftAgentUsageCard = {
      instanceId: provider.instanceId,
      driver: provider.driver,
      displayName: resolveDisplayName(provider),
      accentColor: provider.accentColor,
      isCurrent,
      windows,
      primary: pickPrimaryWindow(provider.driver, windows, model, isCurrent),
      secondary: null,
      unavailableNotice,
    };

    if (windows.length > 0 && card.primary !== null) {
      const secondary = windows.find((window) => window.id !== card.primary!.id) ?? null;
      readable.push({ ...card, secondary });
    } else if (isCurrent && unavailableNotice !== null) {
      currentUnavailable = card;
    }
  }

  if (readable.length === 0) {
    return currentUnavailable ? [currentUnavailable] : [];
  }

  // Keep current thread's agent first; preserve stable configured order for all others.
  readable.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  return readable;
}
