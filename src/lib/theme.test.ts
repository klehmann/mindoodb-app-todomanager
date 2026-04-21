import { afterEach, describe, expect, it } from "vitest";

import { applyAppTheme, normalizeAppTheme } from "./theme";

describe("theme helpers", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preset");
  });

  it("defaults to the mindoo preset in dark mode", () => {
    expect(normalizeAppTheme()).toEqual({
      mode: "dark",
      preset: "mindoo",
    });
  });

  it("applies the host theme to the document root", () => {
    const result = applyAppTheme({
      mode: "light",
      preset: "mindoo",
    });

    expect(result).toEqual({
      mode: "light",
      preset: "mindoo",
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themePreset).toBe("mindoo");
  });

  it("falls back to mindoo for unknown presets", () => {
    const result = applyAppTheme({
      mode: "dark",
      preset: "unknown",
    });

    expect(result.preset).toBe("mindoo");
  });
});
