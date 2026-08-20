import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomRpcError } from "../data/repository";
import { I18nProvider } from "../i18n/I18nProvider";
import { ClaimForm } from "./EntryPages";

function renderJoin(onSubmit: () => Promise<void>) {
  render(
    <I18nProvider>
      <ClaimForm mode="join" onSubmit={onSubmit} />
    </I18nProvider>,
  );
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "Percy" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join" }));
}

describe("ClaimForm join failure states", () => {
  it("reports an authoritative invalid invite without offering service retry", async () => {
    renderJoin(() =>
      Promise.reject(new RoomRpcError("invite_invalid", "22023")),
    );

    expect(await screen.findByText(/This invite is invalid/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Join" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("keeps network failures retryable and does not call them invalid", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    renderJoin(onSubmit);

    expect(
      await screen.findByText(/could not reach the shared room service/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.queryByText(/invite is invalid/)).toBeNull();
  });
});
