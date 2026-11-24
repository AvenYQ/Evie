import type { ThreadDetailsUsageInput } from "../components/chat/ThreadDetailsUsage";
import { ThreadDetailsSection } from "../components/chat/ThreadDetailsSection";
import { ProviderInstanceIcon } from "../components/chat/ProviderInstanceIcon";
import { useNowMinute } from "../hooks/useNowMinute";
import { formatDuration } from "@t3tools/shared/usageLimitsCopy";
import { Link } from "@tanstack/react-router";
import { useGT, useMessages } from "gt-react";
import { ArrowUpRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
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

function buildCompactSubtitle(
  card: WeftAgentUsageCard,
  messages: ReturnType<typeof useMessages>,
  gt: ReturnType<typeof useGT>,
): string {
  const parts: string[] = [];
  if (card.secondary) {
    parts.push(`${card.secondary.label} ${card.secondary.remainingPercent}%`);
  } else if (card.primary) {
    parts.push(card.primary.label);
  }
  const reset = formatShortReset(card.primary, messages);
  if (reset) {
    parts.push(gt("{duration} reset", { duration: reset }));
  }
  return parts.join(" · ");
}

/**
 * Weft: multi-agent Liquid Glass usage panel integrated directly into the right details card.
 * Shows every enabled agent's subscription quota at a glance, with click-to-expand per-window tubes.
 */
export function WeftUsageLimitsSection({
  providerInstanceId = null,
  model = null,
  providers = [],
  sources = [],
}: Omit<ThreadDetailsUsageInput, "contextWindow">) {
  const gt = useGT();
  const messages = useMessages();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const cards = resolveAllAgentUsageCards({
    providerInstanceId,
    model,
    providers,
    sources,
    now,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);

  // Upgrade the enclosing floating right card into Integration 1 Liquid Glass with live caustic glare.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- binds pointermove caustic variables onto the enclosing details card DOM node
  useEffect(() => {
    const card = hostEl?.closest<HTMLElement>("[data-thread-details-card]");
    if (!card) return;
    card.dataset.weftGlassCard = "";
    const onPointerMove = (event: PointerEvent) => {
      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty("--weft-mx", `${x.toFixed(1)}%`);
      card.style.setProperty("--weft-my", `${y.toFixed(1)}%`);
    };
    card.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      card.removeEventListener("pointermove", onPointerMove);
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
          <span data-weft-lg="title">{gt("Agent quotas")}</span>
          <Link to="/usage" data-weft-lg="link">
            <span>{gt("Details")}</span>
            <ArrowUpRightIcon className="size-3" aria-hidden />
          </Link>
        </div>

        <div data-weft-lg="stack">
          {cards.map((card) => {
            const isOpen = expandedId === card.instanceId;
            const primary = card.primary;
            const tone = primary?.tone ?? "ok";
            const subtitle =
              card.unavailableNotice !== null
                ? gt("Unavailable")
                : buildCompactSubtitle(card, messages, gt);
            const canExpand = card.windows.length > 0;

            return (
              <div
                key={card.instanceId}
                data-weft-lg="pill"
                data-tone={tone}
                data-current={card.isCurrent ? "true" : undefined}
                data-open={isOpen ? "true" : undefined}
              >
                <div data-weft-lg="wash" aria-hidden />
                <button
                  type="button"
                  data-weft-lg="trigger"
                  aria-expanded={canExpand ? isOpen : undefined}
                  onClick={() => {
                    if (!canExpand) return;
                    setExpandedId((current) =>
                      current === card.instanceId ? null : card.instanceId,
                    );
                  }}
                >
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
                        {card.isCurrent ? <span data-weft-lg="now-dot" aria-hidden /> : null}
                      </div>
                      <div data-weft-lg="sub">{subtitle}</div>
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
                  </div>

                  {primary !== null ? (
                    <div data-weft-lg="mini-wrap">
                      <div data-weft-lg="tube">
                        <span
                          data-weft-lg="tube-fill"
                          style={{
                            width:
                              primary.remainingPercent > 0
                                ? `max(${primary.remainingPercent}%, 6px)`
                                : "0%",
                          }}
                        />
                        {primary.timeLeftPercent !== null ? (
                          <span
                            data-weft-lg="tube-pin"
                            style={{
                              left: `clamp(1px, ${primary.timeLeftPercent}%, calc(100% - 1px))`,
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </button>

                {canExpand ? (
                  <div data-weft-lg="drawer">
                    <div data-weft-lg="drawer-inner">
                      <div data-weft-lg="drawer-content">
                        {card.windows.map((window) => {
                          const reset = formatShortReset(window, messages);
                          return (
                            <div key={window.id} data-weft-lg="subwin" data-tone={window.tone}>
                              <div data-weft-lg="subhead">
                                <span>
                                  {window.label}
                                  {reset ? ` · ${reset}` : ""}
                                  {window.accountsCount > 1 ? ` · ${window.accountsCount}` : ""}
                                </span>
                                <strong>{window.remainingPercent}%</strong>
                              </div>
                              <div data-weft-lg="tube">
                                <span
                                  data-weft-lg="tube-fill"
                                  style={{
                                    width:
                                      window.remainingPercent > 0
                                        ? `max(${window.remainingPercent}%, 6px)`
                                        : "0%",
                                  }}
                                />
                                {window.timeLeftPercent !== null ? (
                                  <span
                                    data-weft-lg="tube-pin"
                                    style={{
                                      left: `clamp(1px, ${window.timeLeftPercent}%, calc(100% - 1px))`,
                                    }}
                                  />
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                        <Link to="/usage" data-weft-lg="drawer-link">
                          <span>{gt("Open full usage")}</span>
                          <ArrowUpRightIcon className="size-3" aria-hidden />
                        </Link>
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
