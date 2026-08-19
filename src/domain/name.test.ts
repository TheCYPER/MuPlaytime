import { describe, expect, it } from "vitest";
import { normalizeNamePreview } from "./name";

describe("normalizeNamePreview", () => {
  it("normalizes NFC, outer whitespace, and lowercase", () => {
    expect(normalizeNamePreview("  PE\u0301RCY\u00a0")).toMatchObject({
      displayName: "PÉRCY",
      normalizedName: "pé​rcy".replace("​", ""),
    });
  });

  it("preserves internal whitespace and compatibility characters", () => {
    expect(normalizeNamePreview("A  B").normalizedName).toBe("a  b");
    expect(normalizeNamePreview("Ａ").normalizedName).toBe("ａ");
  });

  it("matches the cross-layer claim vectors without renaming semantics", () => {
    expect(normalizeNamePreview(" Percy ").normalizedName).toBe(
      normalizeNamePreview("percy").normalizedName,
    );
    expect(normalizeNamePreview("É").normalizedName).toBe(
      normalizeNamePreview("E\u0301").normalizedName,
    );
    expect(normalizeNamePreview("A  B").normalizedName).not.toBe(
      normalizeNamePreview("A B").normalizedName,
    );
    expect(normalizeNamePreview("Ａ").normalizedName).not.toBe(
      normalizeNamePreview("A").normalizedName,
    );
  });

  it("rejects blank input", () => {
    expect(() => normalizeNamePreview("\u2003\u00a0")).toThrow("name_empty");
  });
});
