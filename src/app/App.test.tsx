import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { App } from "./App";

describe("App configuration boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "#/";
  });

  it("fails clearly without embedding privileged fallback configuration", () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Connection setup needed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("VITE_SUPABASE_URL", { exact: false }),
    ).toBeInTheDocument();
  });
});
