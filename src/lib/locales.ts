/**
 * The languages Haven and this app speak, and how a Haven/browser tag maps onto them.
 * No imports: the startup recovery screen uses this before anything else has loaded.
 */
export const LOCALES = ["en", "de", "es", "fr", "it", "nb", "nl", "pl"] as const;
export type Locale = (typeof LOCALES)[number];

/** A tag ("de-AT", "nb-NO", "fr") → a shipped language by its primary subtag; English otherwise. */
export function resolveLocale(tag: string | undefined | null): Locale {
  const primary = (tag ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (primary === "no" || primary === "nn") return "nb";
  return (LOCALES as readonly string[]).includes(primary) ? (primary as Locale) : "en";
}
