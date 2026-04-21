import { Theme, definePreset } from "@primeuix/styled";
import Aura from "@primeuix/themes/aura";
import Lara from "@primeuix/themes/lara";
import Material from "@primeuix/themes/material";
import Nora from "@primeuix/themes/nora";

import type { MindooDBAppHostTheme, MindooDBAppThemeMode } from "mindoodb-app-sdk";

const MINDOO_PRIMARY_SCALE = {
  50: "#eef2ff",
  100: "#dce5ff",
  200: "#bfceff",
  300: "#98adff",
  400: "#6f88f6",
  500: "#4d67d9",
  600: "#354fb9",
  700: "#253c92",
  800: "#1f3a8a",
  900: "#182a63",
  950: "#0b1020",
} as const;

const MINDOO_GOLD_SCALE = {
  50: "#fff8e8",
  100: "#fbeec6",
  200: "#f6df91",
  300: "#efcb58",
  400: "#e2b33f",
  500: "#d4a017",
  600: "#b88812",
  700: "#91690f",
  800: "#6c4f0f",
  900: "#503c10",
  950: "#2d2109",
} as const;

const VEGA_PRIMARY_SCALE = {
  50: "#edf6ff",
  100: "#d5e6ff",
  200: "#abcfff",
  300: "#7bb4ff",
  400: "#5298f7",
  500: "#327fd8",
  600: "#2363af",
  700: "#1c4c85",
  800: "#173a64",
  900: "#102541",
  950: "#09111f",
} as const;

const VEGA_GOLD_SCALE = {
  50: "#fff6dd",
  100: "#fae7b0",
  200: "#f2d576",
  300: "#e8bf3c",
  400: "#dbad1b",
  500: "#be960d",
  600: "#97760d",
  700: "#72580f",
  800: "#513e10",
  900: "#382a0d",
  950: "#221806",
} as const;

const MINDOO_THEME_PRESET = definePreset(Aura, {
  semantic: {
    primary: MINDOO_PRIMARY_SCALE,
    colorScheme: {
      light: {
        primary: {
          color: "#1f3a8a",
          contrastColor: "#ffffff",
          hoverColor: "#243c8f",
          activeColor: "#182a63",
        },
        highlight: {
          background: "rgba(31, 58, 138, 0.12)",
          focusBackground: "rgba(31, 58, 138, 0.18)",
          color: "#17233b",
          focusColor: "#0b1020",
        },
      },
      dark: {
        primary: {
          color: "#1f3a8a",
          contrastColor: "#ffffff",
          hoverColor: "#243c8f",
          activeColor: "#182a63",
        },
        highlight: {
          background: "rgba(31, 58, 138, 0.2)",
          focusBackground: "rgba(31, 58, 138, 0.28)",
          color: "#f4f7fb",
          focusColor: "#ffffff",
        },
      },
    },
    focusRing: {
      width: "2px",
      style: "solid",
      color: "rgba(212, 160, 23, 0.38)",
      offset: "2px",
      shadow: "none",
    },
  },
  extend: {
    brand: {
      gold: MINDOO_GOLD_SCALE,
    },
  },
});

const VEGA_THEME_PRESET = definePreset(Aura, {
  semantic: {
    primary: VEGA_PRIMARY_SCALE,
    colorScheme: {
      light: {
        primary: {
          color: "#173a64",
          contrastColor: "#ffffff",
          hoverColor: "#1c4c85",
          activeColor: "#102541",
        },
        highlight: {
          background: "rgba(35, 99, 175, 0.12)",
          focusBackground: "rgba(35, 99, 175, 0.18)",
          color: "#17233b",
          focusColor: "#09111f",
        },
      },
      dark: {
        primary: {
          color: "#5298f7",
          contrastColor: "#081325",
          hoverColor: "#7bb4ff",
          activeColor: "#327fd8",
        },
        highlight: {
          background: "rgba(82, 152, 247, 0.22)",
          focusBackground: "rgba(82, 152, 247, 0.3)",
          color: "#f7fbff",
          focusColor: "#ffffff",
        },
      },
    },
    focusRing: {
      width: "2px",
      style: "solid",
      color: "rgba(232, 191, 60, 0.38)",
      offset: "2px",
      shadow: "none",
    },
  },
  extend: {
    brand: {
      gold: VEGA_GOLD_SCALE,
    },
  },
});

const THEME_PRESET_REGISTRY = {
  mindoo: {
    label: "Mindoo",
    preset: MINDOO_THEME_PRESET,
  },
  vega: {
    label: "Vega",
    preset: VEGA_THEME_PRESET,
  },
  aura: {
    label: "Aura",
    preset: Aura,
  },
  lara: {
    label: "Lara",
    preset: Lara,
  },
  material: {
    label: "Material",
    preset: Material,
  },
  nora: {
    label: "Nora",
    preset: Nora,
  },
} as const;

export type ThemePresetKey = keyof typeof THEME_PRESET_REGISTRY;

export type AppThemeState = {
  mode: MindooDBAppThemeMode;
  preset: ThemePresetKey;
};

export const DEFAULT_THEME_PRESET: ThemePresetKey = "mindoo";
export const DEFAULT_THEME_MODE: MindooDBAppThemeMode = "dark";

export function resolveThemePreset(value: unknown): ThemePresetKey {
  if (typeof value === "string" && value in THEME_PRESET_REGISTRY) {
    return value as ThemePresetKey;
  }

  return DEFAULT_THEME_PRESET;
}

export function buildPrimeVueTheme(themePreset: ThemePresetKey) {
  return {
    preset: THEME_PRESET_REGISTRY[themePreset].preset,
    options: {
      darkModeSelector: "[data-theme='dark']",
    },
  };
}

export function normalizeAppTheme(theme?: Partial<MindooDBAppHostTheme> | null): AppThemeState {
  return {
    mode: theme?.mode === "light" ? "light" : "dark",
    preset: resolveThemePreset(theme?.preset),
  };
}

export function applyAppTheme(theme?: Partial<MindooDBAppHostTheme> | null): AppThemeState {
  const resolved = normalizeAppTheme(theme);

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved.mode;
    document.documentElement.dataset.themePreset = resolved.preset;
  }

  Theme.setTheme(buildPrimeVueTheme(resolved.preset));
  return resolved;
}
