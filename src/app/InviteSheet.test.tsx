import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { InviteSheet } from "./InviteSheet";
import { ModalSheet } from "../ui/ModalSheet";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <I18nProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Invite opener
      </button>
      {open && (
        <ModalSheet title="Invite" onClose={() => setOpen(false)}>
          <InviteSheet token={"a".repeat(64)} />
        </ModalSheet>
      )}
    </I18nProvider>
  );
}

function HandoffHarness() {
  const [sheet, setSheet] = useState<"first" | "second" | null>(null);
  return (
    <I18nProvider>
      <button type="button" onClick={() => setSheet("first")}>
        Open handoff
      </button>
      {sheet && (
        <ModalSheet
          title={sheet === "first" ? "First" : "Second"}
          focusKey={sheet}
          onClose={() => setSheet(null)}
        >
          {sheet === "first" ? (
            <button
              data-dialog-initial-focus
              type="button"
              onClick={() => setSheet("second")}
            >
              Continue
            </button>
          ) : (
            <button data-dialog-initial-focus type="button">
              Final action
            </button>
          )}
        </ModalSheet>
      )}
    </I18nProvider>
  );
}

function AutoOpenHarness() {
  const [open, setOpen] = useState(true);
  return (
    <I18nProvider>
      <main id="main-content">
        <h1 tabIndex={-1}>Room heading</h1>
      </main>
      {open && (
        <ModalSheet
          title="Invite"
          fallbackFocusSelector="#main-content h1"
          onClose={() => setOpen(false)}
        >
          <InviteSheet token={"a".repeat(64)} />
        </ModalSheet>
      )}
    </I18nProvider>
  );
}

describe("InviteSheet focus lifecycle", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="root"></div><div id="modal-root"></div>';
  });

  it("focuses the invite, closes with Escape, and restores trigger focus", async () => {
    render(<Harness />, { container: document.getElementById("root")! });
    const opener = screen.getByRole("button", { name: "Invite opener" });
    opener.focus();
    fireEvent.click(opener);

    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Copy invite link" }),
      ).toHaveFocus(),
    );
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("keeps one locked dialog through an atomic StrictMode handoff", async () => {
    render(
      <StrictMode>
        <HandoffHarness />
      </StrictMode>,
      { container: document.getElementById("root")! },
    );
    const opener = screen.getByRole("button", { name: "Open handoff" });
    opener.focus();
    fireEvent.click(opener);

    const continueButton = await screen.findByRole("button", {
      name: "Continue",
    });
    await waitFor(() => expect(continueButton).toHaveFocus());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.getElementById("root")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(continueButton);
    const finalAction = await screen.findByRole("button", {
      name: "Final action",
    });
    await waitFor(() => expect(finalAction).toHaveFocus());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
    expect(document.body.style.overflow).toBe("");
    expect(document.getElementById("root")).not.toHaveAttribute("aria-hidden");
  });

  it("returns an auto-opened sheet to the explicit route fallback", async () => {
    render(<AutoOpenHarness />, {
      container: document.getElementById("root")!,
    });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Room heading" }),
      ).toHaveFocus(),
    );
  });

  it("closes only when the backdrop itself receives the pointer", async () => {
    render(<Harness />, { container: document.getElementById("root")! });
    fireEvent.click(screen.getByRole("button", { name: "Invite opener" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.pointerDown(dialog);
    expect(screen.getByRole("dialog")).toBeVisible();

    const backdrop = document.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
