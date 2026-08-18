import { describe, expect, it } from "vitest";
import { en, zhCN } from "./catalogs";

describe("message catalogs", () => {
  it("have exact key parity", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
  });
});
