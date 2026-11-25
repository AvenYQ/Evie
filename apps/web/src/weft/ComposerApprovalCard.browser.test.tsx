import { RuntimeRequestId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { render } from "../../test/render";
import type { PendingApproval } from "../session-logic";
import { ComposerApprovalCard } from "./ComposerApprovalCard";

const approval: PendingApproval = {
  requestId: RuntimeRequestId.make("req-1"),
  requestKind: "command",
  createdAt: "2026-11-25T00:00:00.000Z",
  detail: "pnpm build",
  reason: "Check the desktop build.",
  responseCapability: "live",
};

function card(overrides: Partial<Parameters<typeof ComposerApprovalCard>[0]> = {}) {
  return (
    <ComposerApprovalCard
      approval={approval}
      remainingCount={0}
      isResponding={false}
      disabled={false}
      onDeclineWithFeedback={vi.fn()}
      onRespondToApproval={vi.fn(async () => undefined)}
      {...overrides}
    />
  );
}

it("asks a question with the command and numbered choices, decline last", async () => {
  await using _screen = await render(card({ remainingCount: 2 }));

  await expect.element(page.getByText("Allow this command to run?")).toBeVisible();
  await expect.element(page.getByText("pnpm build")).toBeVisible();
  await expect.element(page.getByText("2 more waiting")).toBeVisible();
  const labels = page
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(labels).toEqual([
    "1Allow",
    "2Allow for this session",
    "3Cancel",
    "4Decline, and tell it what to do insteadEsc",
  ]);
});

it("answers from a digit key and hands decline to the composer", async () => {
  const respond = vi.fn(async () => undefined);
  const declineWithFeedback = vi.fn();
  await using _screen = await render(
    card({ onRespondToApproval: respond, onDeclineWithFeedback: declineWithFeedback }),
  );

  await userEvent.keyboard("2");
  expect(respond).toHaveBeenCalledWith(approval.requestId, "acceptForSession");

  await userEvent.keyboard("4");
  expect(declineWithFeedback).toHaveBeenCalledOnce();
  expect(respond).toHaveBeenCalledTimes(1);

  await page.getByRole("button", { name: "Just decline" }).click();
  expect(respond).toHaveBeenLastCalledWith(approval.requestId, "decline");
});

it("keeps the request and says so when submitting fails", async () => {
  const respond = vi.fn(async () => AsyncResult.failure(Cause.fail(new Error("offline"))));
  await using _screen = await render(card({ onRespondToApproval: respond }));

  await page.getByRole("option", { name: /Allow$/ }).click();

  expect(respond).toHaveBeenCalledWith(approval.requestId, "accept");
  await expect
    .element(page.getByText("Couldn't submit. The request is still waiting, so choose again."))
    .toBeVisible();
});

it("offers no choices once the provider process is gone", async () => {
  await using _screen = await render(
    card({ approval: { ...approval, responseCapability: "not_resumable" } }),
  );

  await expect.element(page.getByText(/agent process is gone/)).toBeVisible();
  expect(page.getByRole("option").elements()).toHaveLength(0);
});
