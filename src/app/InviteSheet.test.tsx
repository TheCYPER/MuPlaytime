import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { InviteSheet } from "./InviteSheet";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <I18nProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Invite opener
      </button>
      {open && (
        <InviteSheet token={"a".repeat(64)} onClose={() => setOpen(false)} />
      )}
    </I18nProvider>
  );
}

describe("InviteSheet focus lifecycle", () => {
  it("focuses the invite, closes with Escape, and restores trigger focus", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Invite opener" });
    opener.focus();
    fireEvent.click(opener);

    expect(
      screen.getByRole("textbox", { name: "Copy invite link" }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
