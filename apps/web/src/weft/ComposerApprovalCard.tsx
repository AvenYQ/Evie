import {
  FULL_ACCESS_OVERRIDE_QUESTION,
  fullAccessOverrideExplanation,
} from "@t3tools/client-runtime/state/thread-requests";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type {
  ProviderApprovalDecision,
  ProviderApprovalOption,
  RuntimeRequestId,
} from "@t3tools/contracts";
import { useMessages } from "gt-react";
import { TriangleAlertIcon } from "lucide-react";
import {
  memo,
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { cn } from "~/lib/utils";
import { isInSideChatPane } from "~/lib/sideChatPane";
import { getI18nSnapshot, subscribeI18n } from "../i18n/runtime";
import { type PendingApproval } from "../session-logic";
import { BackgroundThreadContext } from "../components/chat/backgroundThread";
import { ComposerBanner } from "../components/chat/ComposerBanner";
import { InlineButton } from "../components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../components/ui/popover";

// Weft: the active approval request shown as part of the composer, the way Claude Code and
// Codex ask: a question, the exact command, then numbered choices (1-9, arrows, Enter, Esc).
// The last choice declines by handing focus to the composer, where a message redirects the agent.

type Kind = PendingApproval["requestKind"];

interface ApprovalMessages {
  readonly question: Readonly<Record<Kind, string>>;
  readonly kind: Readonly<Record<Kind, string>>;
  readonly remaining: (count: number) => string;
  readonly decisions: Readonly<Partial<Record<ProviderApprovalDecision, string>>>;
  readonly declineWithFeedback: string;
  readonly declineOnly: string;
  readonly submitting: string;
  readonly expired: string;
  readonly failed: string;
  readonly choices: string;
}

const CATALOG: Readonly<Record<string, ApprovalMessages>> = {
  en: {
    question: {
      command: "Allow this command to run?",
      "file-change": "Allow these file changes?",
      "file-read": "Allow reading this file?",
      permission: "Grant this permission?",
      "mcp-elicitation": "Allow this app access?",
    },
    kind: {
      command: "Run command",
      "file-change": "Change files",
      "file-read": "Read file",
      permission: "App permission",
      "mcp-elicitation": "App access",
    },
    remaining: (count) => `${count} more waiting`,
    decisions: {
      accept: "Allow",
      acceptForSession: "Allow for this session",
      cancel: "Cancel",
    },
    declineWithFeedback: "Decline, and tell it what to do instead",
    declineOnly: "Just decline",
    submitting: "Submitting…",
    expired:
      "The agent process is gone, so this request can't be answered. Interrupt or restart the run.",
    failed: "Couldn't submit. The request is still waiting, so choose again.",
    choices: "Approval choices",
  },
  zh: {
    question: {
      command: "允许运行这个命令吗？",
      "file-change": "允许修改这些文件吗？",
      "file-read": "允许读取这个文件吗？",
      permission: "允许授予这个权限吗？",
      "mcp-elicitation": "允许这个应用访问吗？",
    },
    kind: {
      command: "运行命令",
      "file-change": "修改文件",
      "file-read": "读取文件",
      permission: "应用权限",
      "mcp-elicitation": "应用访问",
    },
    remaining: (count) => `后面还有 ${count} 项`,
    decisions: {
      accept: "允许",
      acceptForSession: "本会话中都允许",
      cancel: "取消",
    },
    declineWithFeedback: "拒绝，并告诉它怎么做",
    declineOnly: "直接拒绝",
    submitting: "提交中…",
    expired: "Agent 进程已断开，这个请求无法再提交。中断或重新运行后会产生新的请求。",
    failed: "提交失败，请求仍在等待，请再选一次。",
    choices: "审批选项",
  },
};

function useApprovalMessages(): ApprovalMessages {
  const { locale } = useSyncExternalStore(subscribeI18n, getI18nSnapshot);
  return CATALOG[locale] ?? CATALOG[locale.split("-")[0] ?? ""] ?? CATALOG.en!;
}

function isAtomCommandResult(
  value: unknown,
): value is Parameters<typeof isAtomCommandInterrupted>[0] {
  return typeof value === "object" && value !== null && "_tag" in value;
}

const DEFAULT_DECISIONS: ReadonlyArray<ProviderApprovalDecision> = [
  "accept",
  "acceptForSession",
  "cancel",
  "decline",
];

interface Choice {
  readonly decision: ProviderApprovalDecision;
  readonly label: string;
  readonly warning?: string | undefined;
}

/** Approvals first, in the provider's order, then cancel; decline is always the last row. */
function orderChoices(
  options: ReadonlyArray<ProviderApprovalOption> | undefined,
  t: ApprovalMessages,
): { choices: Choice[]; canDecline: boolean } {
  const source: Choice[] = options
    ? options.map((option) => ({
        decision: option.decision,
        label: option.label,
        warning: option.warning,
      }))
    : DEFAULT_DECISIONS.map((decision) => ({ decision, label: t.decisions[decision] ?? decision }));
  const rank = (decision: ProviderApprovalDecision) => (decision === "cancel" ? 1 : 0);
  const choices = source
    .filter((choice) => choice.decision !== "decline")
    .toSorted((a, b) => rank(a.decision) - rank(b.decision));
  const canDecline = source.some((choice) => choice.decision === "decline");
  if (canDecline) choices.push({ decision: "decline", label: t.declineWithFeedback });
  return { choices, canDecline };
}

const SHORTCUT_BLOCKERS =
  'select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [aria-modal="true"], [role="menu"], [role="combobox"], [data-slot$="popup"]';

export const ComposerApprovalCard = memo(function ComposerApprovalCard({
  approval,
  remainingCount,
  isResponding,
  disabled,
  onRespondToApproval,
  onDeclineWithFeedback,
}: {
  approval: PendingApproval;
  remainingCount: number;
  isResponding: boolean;
  disabled: boolean;
  onRespondToApproval: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
  /** Moves focus to the composer, where sending a message declines and redirects the agent. */
  onDeclineWithFeedback: () => void;
}) {
  const t = useApprovalMessages();
  const m = useMessages();
  const backgroundThread = use(BackgroundThreadContext);
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const [submitted, setSubmitted] = useState<ProviderApprovalDecision | null>(null);
  const [failed, setFailed] = useState(false);
  const live = approval.responseCapability === "live";
  const locked = !live || disabled || isResponding;
  const { choices } = orderChoices(approval.options, t);

  const respond = async (decision: ProviderApprovalDecision) => {
    if (locked) return;
    setFailed(false);
    setSubmitted(decision);
    const result = await onRespondToApproval(approval.requestId, decision);
    if (
      isAtomCommandResult(result) &&
      result._tag === "Failure" &&
      !isAtomCommandInterrupted(result)
    ) {
      setFailed(true);
    }
    setSubmitted(null);
  };

  const choose = (index: number) => {
    const choice = choices[index];
    if (!choice || locked) return;
    setSelected(index);
    if (choice.decision === "decline") {
      onDeclineWithFeedback();
      return;
    }
    void respond(choice.decision);
  };
  const chooseFromShortcut = useEffectEvent(choose);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes a document keydown listener for digit shortcuts while the request is answerable
  useEffect(() => {
    if (locked || backgroundThread) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (isInSideChatPane(target)) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.closest(SHORTCUT_BLOCKERS)) return;
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > Math.min(9, choices.length)) return;
      event.preventDefault();
      chooseFromShortcut(digit - 1);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [backgroundThread, choices.length, locked]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- takes keyboard focus for a new request only when nothing else holds it, so typing is never interrupted
  useEffect(() => {
    if (locked || backgroundThread) return;
    const active = document.activeElement;
    if (active === null || active === document.body) {
      listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    }
  }, [backgroundThread, locked]);

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked || event.nativeEvent.isComposing) return;
    const count = choices.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (selected + (event.key === "ArrowDown" ? 1 : count - 1)) % count;
      setSelected(next);
      listRef.current?.querySelector<HTMLButtonElement>(`[data-choice-index="${next}"]`)?.focus();
    } else if (event.key === "Escape" && choices.at(-1)?.decision === "decline") {
      event.preventDefault();
      choose(count - 1);
    }
  };

  return (
    <ComposerBanner.Attachment>
      <ComposerBanner.Root
        variant="info"
        density="spacious"
        data-chat-composer-top-drawer="true"
        data-weft-approval-card={live ? "live" : "expired"}
        role="region"
        aria-label={t.question[approval.requestKind]}
        aria-busy={isResponding}
      >
        <div className="flex min-w-0 flex-col text-sm">
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">
              {approval.appName
                ? `${approval.appName} · ${t.kind[approval.requestKind]}`
                : t.kind[approval.requestKind]}
            </span>
            {remainingCount > 0 ? (
              <span className="flex-none tabular-nums">{t.remaining(remainingCount)}</span>
            ) : null}
          </div>
          <p className="mt-0.5 font-semibold text-foreground">{t.question[approval.requestKind]}</p>
          {approval.reason ? (
            <p className="mt-0.5 text-xs text-muted-foreground select-text wrap-anywhere">
              {approval.reason}
            </p>
          ) : null}
          {approval.detail ? (
            <code
              tabIndex={0}
              className="mt-2 block max-h-32 overflow-auto rounded-lg bg-muted/70 px-2.5 py-1.5 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground select-text! wrap-anywhere [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
            >
              {approval.detail}
            </code>
          ) : null}

          {live ? (
            <div
              ref={listRef}
              role="listbox"
              aria-label={t.choices}
              className="mt-2 grid gap-px"
              onKeyDown={onListKeyDown}
            >
              {choices.map((choice, index) => {
                const isSelected = index === selected;
                const isDecline = choice.decision === "decline";
                const label = submitted === choice.decision ? t.submitting : choice.label;
                return (
                  <div key={choice.decision} className="flex items-center gap-1">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-description={choice.warning}
                      data-choice-index={index}
                      tabIndex={isSelected ? 0 : -1}
                      disabled={locked}
                      onClick={() => choose(index)}
                      onFocus={() => setSelected(index)}
                      className={cn(
                        "group/choice flex min-h-8 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1 text-start text-sm text-foreground outline-none",
                        "hover:bg-foreground/5 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/20",
                        "disabled:cursor-default disabled:opacity-60",
                        isSelected && "bg-foreground/[0.07] hover:bg-foreground/[0.07]",
                      )}
                    >
                      {index < 9 ? (
                        <kbd
                          className={cn(
                            "inline-flex size-5 flex-none items-center justify-center rounded-md border font-sans text-xs tabular-nums",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {index + 1}
                        </kbd>
                      ) : null}
                      {choice.warning ? (
                        <TriangleAlertIcon
                          aria-hidden
                          className="size-3.5 flex-none text-warning"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 wrap-break-word">{label}</span>
                      {isDecline ? (
                        <span className="flex-none text-xs text-muted-foreground">Esc</span>
                      ) : null}
                    </button>
                    {isDecline ? (
                      <InlineButton
                        tone="muted"
                        disabled={locked}
                        onClick={() => void respond("decline")}
                      >
                        {t.declineOnly}
                      </InlineButton>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{t.expired}</p>
          )}

          {failed ? (
            <p role="alert" className="mt-1.5 px-2 text-xs text-destructive">
              {t.failed}
            </p>
          ) : null}

          {approval.fullAccessOverride ? (
            <Popover>
              <PopoverTrigger
                openOnHover
                render={<InlineButton tone="muted" className="mt-1.5 self-start" />}
              >
                {m(FULL_ACCESS_OVERRIDE_QUESTION)}
              </PopoverTrigger>
              <PopoverPopup
                aria-label={m(FULL_ACCESS_OVERRIDE_QUESTION)}
                tooltipStyle
                side="top"
                className="max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal"
              >
                {fullAccessOverrideExplanation(approval.fullAccessOverride, m)}
              </PopoverPopup>
            </Popover>
          ) : null}
        </div>
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
});
