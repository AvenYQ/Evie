import type { ThreadDetailsUsageInput } from "../components/chat/ThreadDetailsUsage";
import { ThreadDetailsSection } from "../components/chat/ThreadDetailsSection";
import { ProviderInstanceIcon } from "../components/chat/ProviderInstanceIcon";
import { getDisplayModelName } from "../components/chat/providerIconUtils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useNowMinute } from "../hooks/useNowMinute";
import { formatDuration } from "@t3tools/shared/usageLimitsCopy";
import { Link } from "@tanstack/react-router";
import { useGT, useMessages } from "gt-react";
import { ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useWeftMessages, type WeftMessages } from "./i18n";
import {
  resolveAllAgentUsageCards,
  type WeftAgentUsageCard,
  type WeftUsageWindow,
} from "./usageLimitsPanel.logic";

function formatShortReset(
  window: WeftUsageWindow | null,
  messages: ReturnType<typeof useMessages>,
): string | null {
  if (!window || window.resetMs === null) return null;
  return formatDuration(window.resetMs, messages);
}

// The subtitle stays the same whether the card is open or closed, so toggling never swaps text.
function buildSubtitle(
  card: WeftAgentUsageCard,
  modelName: string | null,
  messages: ReturnType<typeof useMessages>,
  weftMessages: WeftMessages,
): string {
  if (card.unavailableNotice !== null) return card.unavailableNotice;
  // Names the window behind the big number on the right, and when it resets. The current
  // agent leads with its model; its windows' reset times are in the open drawer below.
  const parts: string[] = [];
  if (card.isCurrent && modelName) parts.push(modelName);
  if (card.primary) parts.push(card.primary.label);
  if (card.isCurrent && modelName) return parts.join(" · ");
  const reset = formatShortReset(card.primary, messages);
  if (reset) {
    parts.push(weftMessages.resetsIn(reset));
  }
  return parts.join(" · ");
}

function UsageTube({ window, label }: { window: WeftUsageWindow; label: string }) {
  const gt = useGT();
  const timeLeft =
    window.timeLeftPercent === null
      ? null
      : gt("{timeLeft}% of the window left", { timeLeft: window.timeLeftPercent });
  return (
    <div
      data-weft-lg="tube"
      role="img"
      aria-label={timeLeft === null ? label : `${label} · ${timeLeft}`}
    >
      <span
        data-weft-lg="tube-fill"
        style={{
          width: window.remainingPercent > 0 ? `max(${window.remainingPercent}%, 6px)` : "0%",
        }}
      />
      {window.timeLeftPercent !== null ? (
        <span
          data-weft-lg="tube-pin"
          style={{ left: `clamp(1px, ${window.timeLeftPercent}%, calc(100% - 1px))` }}
        />
      ) : null}
    </div>
  );
}

/**
 * Weft: multi-agent Liquid Glass usage panel integrated directly into the right details card.
 * Keeps the active thread's agent pinned first and expanded by default (e.g. 5h + weekly rows),
 * while other enabled agents stay compact until clicked.
 */
export function WeftUsageLimitsSection({
  providerInstanceId = null,
  model = null,
  providers = [],
  sources = [],
}: Omit<ThreadDetailsUsageInput, "contextWindow">) {
  const gt = useGT();
  const weftMessages = useWeftMessages();
  const messages = useMessages();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const currentModel =
    model === null
      ? undefined
      : providers
          .find((provider) => provider.instanceId === providerInstanceId)
          ?.models.find((candidate) => candidate.slug === model);
  const modelName = currentModel ? getDisplayModelName(currentModel) : model;
  const cards = resolveAllAgentUsageCards({
    providerInstanceId,
    model,
    providers,
    sources,
    now,
    resolve: messages,
  });

  // Keyed by `${providerInstanceId}:${instanceId}` so switching agents automatically resets to
  // "current agent expanded, other agents collapsed" without a syncing effect.
  const [openByScope, setOpenByScope] = useState<
    Readonly<Record<string, { readonly current?: boolean; readonly other?: string | null }>>
  >({});
  const scope = providerInstanceId ?? "";
  const scopeOpen = openByScope[scope] ?? {};
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);

  // Upgrade the enclosing floating right card into Integration 1 Liquid Glass with hover-only caustic glare.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- binds pointermove/pointerleave caustic variables onto the enclosing details card DOM node
  useEffect(() => {
    const card = hostEl?.closest<HTMLElement>("[data-thread-details-card]");
    if (!card) return;
    card.dataset.weftGlassCard = "";
    const view = card.ownerDocument.defaultView;
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const clearHover = () => {
      if (frame) view?.cancelAnimationFrame(frame);
      frame = 0;
      delete card.dataset.weftHover;
    };
    // At most one style write per frame: the sheen sits over a backdrop-filter surface.
    const paint = () => {
      frame = 0;
      if (pointer === null) return;
      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = ((pointer.x - rect.left) / rect.width) * 100;
      const y = ((pointer.y - rect.top) / rect.height) * 100;
      card.style.setProperty("--weft-mx", `${x.toFixed(1)}%`);
      card.style.setProperty("--weft-my", `${y.toFixed(1)}%`);
      card.dataset.weftHover = "true";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (view?.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame && view) frame = view.requestAnimationFrame(paint);
    };
    card.addEventListener("pointermove", onPointerMove, { passive: true });
    card.addEventListener("pointerleave", clearHover, { passive: true });
    card.addEventListener("pointercancel", clearHover, { passive: true });
    window.addEventListener("blur", clearHover);
    return () => {
      card.removeEventListener("pointermove", onPointerMove);
      card.removeEventListener("pointerleave", clearHover);
      card.removeEventListener("pointercancel", clearHover);
      window.removeEventListener("blur", clearHover);
      clearHover();
      delete card.dataset.weftGlassCard;
      card.style.removeProperty("--weft-mx");
      card.style.removeProperty("--weft-my");
    };
  }, [hostEl]);

  if (cards.length === 0) return null;

  return (
    <ThreadDetailsSection
      headingId="weft-usage-heading"
      title={gt("Usage limits")}
      showHeading={false}
    >
      <div ref={setHostEl} data-weft-usage="">
        <div data-weft-lg="head">
          <span data-weft-lg="title">{gt("Usage limits")}</span>
          <Link to="/usage" data-weft-lg="link">
            <span>{gt("Open usage")}</span>
            <ArrowUpRightIcon className="size-3" aria-hidden />
          </Link>
        </div>

        <div data-weft-lg="stack">
          {cards.map((card) => {
            const canExpand = card.windows.length > 0;
            const isOpen =
              canExpand &&
              (card.isCurrent ? (scopeOpen.current ?? true) : scopeOpen.other === card.instanceId);
            const primary = card.primary;
            const tone = primary?.tone ?? "ok";
            const drawerId = `weft-usage-drawer-${card.instanceId}`;

            const summary: ReactNode = (
              <>
                <div data-weft-lg="row-top">
                  <span data-weft-lg="orb" aria-hidden>
                    <ProviderInstanceIcon
                      driverKind={card.driver}
                      displayName={card.displayName}
                      accentColor={card.accentColor}
                      size="compact"
                      showBadge={false}
                    />
                  </span>
                  <div data-weft-lg="meta">
                    <div data-weft-lg="name-line">
                      <span data-weft-lg="name">{card.displayName}</span>
                      {card.isCurrent ? (
                        <span data-weft-lg="current-badge">
                          <span data-weft-lg="now-dot" aria-hidden />
                          <span>{weftMessages.current}</span>
                        </span>
                      ) : null}
                    </div>
                    <div
                      data-weft-lg="sub"
                      data-wrap={card.unavailableNotice !== null ? "true" : undefined}
                    >
                      {buildSubtitle(card, modelName, messages, weftMessages)}
                    </div>
                  </div>
                  {primary !== null ? (
                    <div data-weft-lg="val">
                      {primary.remainingPercent}
                      <small>%</small>
                    </div>
                  ) : (
                    <div data-weft-lg="val" data-unavailable="true">
                      --
                    </div>
                  )}
                  {canExpand ? <ChevronDownIcon data-weft-lg="chevron" aria-hidden /> : null}
                </div>

                {primary !== null ? (
                  <div data-weft-lg="mini-wrap">
                    <UsageTube
                      window={primary}
                      label={gt("{label}: {left}% left", {
                        label: primary.label,
                        left: primary.remainingPercent,
                      })}
                    />
                  </div>
                ) : null}
              </>
            );

            return (
              <div
                key={card.instanceId}
                data-weft-lg="pill"
                data-tone={tone}
                data-current={card.isCurrent ? "true" : undefined}
                data-open={isOpen ? "true" : undefined}
              >
                <div data-weft-lg="wash" aria-hidden />
                {canExpand ? (
                  <button
                    type="button"
                    data-weft-lg="trigger"
                    aria-expanded={isOpen}
                    aria-controls={drawerId}
                    onClick={() => {
                      // At most one other agent is open; opening another replaces it.
                      setOpenByScope((current) => {
                        const state = current[scope] ?? {};
                        const next = card.isCurrent
                          ? { ...state, current: !(state.current ?? true) }
                          : {
                              ...state,
                              other: state.other === card.instanceId ? null : card.instanceId,
                            };
                        return { ...current, [scope]: next };
                      });
                    }}
                  >
                    {summary}
                  </button>
                ) : (
                  <Link to="/usage" data-weft-lg="trigger">
                    {summary}
                  </Link>
                )}

                {canExpand ? (
                  <div data-weft-lg="drawer" id={drawerId} inert={!isOpen}>
                    <div data-weft-lg="drawer-inner" data-weft-usage-drawer="">
                      <div data-weft-lg="drawer-content">
                        {card.windows.map((window) => {
                          const reset = formatShortReset(window, messages);
                          const details = [
                            window.label,
                            reset ? weftMessages.resetsIn(reset) : null,
                            window.accountsCount > 1
                              ? gt(
                                  "{count, plural, one {{count} account} other {{count} accounts}}",
                                  {
                                    count: window.accountsCount,
                                  },
                                )
                              : null,
                          ].filter((part) => part !== null);
                          const row = (
                            <div
                              key={window.id}
                              data-weft-lg="subwin"
                              data-tone={window.tone}
                              data-active-model={window.matchesCurrentModel ? "true" : undefined}
                            >
                              <div data-weft-lg="subhead">
                                <span>{details.join(" · ")}</span>
                                <strong>{window.remainingPercent}%</strong>
                              </div>
                              <UsageTube
                                window={window}
                                label={gt("{label}: {left}% left", {
                                  label: window.label,
                                  left: window.remainingPercent,
                                })}
                              />
                            </div>
                          );
                          if (window.timeLeftPercent === null) return row;
                          // The pin on the bar marks how much of the window's time is left.
                          return (
                            <Tooltip key={window.id}>
                              <TooltipTrigger render={row} />
                              <TooltipPopup side="left" sideOffset={16}>
                                {gt("{timeLeft}% of the window left", {
                                  timeLeft: window.timeLeftPercent,
                                })}
                              </TooltipPopup>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </ThreadDetailsSection>
  );
}
