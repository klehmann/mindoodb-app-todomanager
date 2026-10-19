/**
 * Every language ships every string. The type check already rejects a missing or
 * extra key (`satisfies Record<Locale, Messages>`); this test covers what types cannot
 * see: the `{placeholders}`, the plural forms each language needs, empty strings,
 * French typography, the startup texts outside Vue and the localized store listing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { bootMessages, bootTexts } from "@/lib/bootMessages";
import {
  formatDate,
  formatFileSize,
  intlLocale,
  language,
  LOCALES,
  messages,
  quadrantLabels,
  resolveLocale,
  setLocale,
  t,
  tn,
  tSplit,
  type PluralForms,
} from "@/lib/i18n";

type Entry = string | PluralForms;
const tables: Record<string, Record<string, Record<string, Entry>>> = {
  messages: messages as unknown as Record<string, Record<string, Entry>>,
  bootMessages: bootMessages as unknown as Record<string, Record<string, Entry>>,
};

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

function texts(entry: Entry): string[] {
  return typeof entry === "string" ? [entry] : Object.values(entry);
}

afterEach(() => setLocale("en"));

describe.each(Object.keys(tables))("%s", (name) => {
  const table = tables[name]!;
  const english = table.en!;

  it("covers exactly the Haven languages", () => {
    expect(Object.keys(table).sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)("%s has exactly the English keys", (locale) => {
    expect(Object.keys(table[locale]!).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(LOCALES)("%s keeps the English placeholders and string/plural shape", (locale) => {
    for (const [key, source] of Object.entries(english)) {
      const entry = table[locale]![key]!;
      expect(typeof entry, key).toBe(typeof source);
      if (typeof source === "string") {
        expect(placeholders(entry as string), `${locale}.${key}`).toEqual(placeholders(source));
      } else {
        const forms = entry as PluralForms;
        // The general form carries every placeholder; a specific one ("one") may leave out the number.
        expect(placeholders(forms.other), `${locale}.${key}.other`).toEqual(placeholders(source.other));
        for (const [category, text] of Object.entries(forms)) {
          for (const placeholder of placeholders(text!)) {
            expect(placeholders(source.other), `${locale}.${key}.${category}`).toContain(placeholder);
          }
        }
      }
    }
  });

  it.each(LOCALES)("%s has a plural form for every count its plural rules pick", (locale) => {
    const rules = new Intl.PluralRules(locale);
    for (const [key, entry] of Object.entries(table[locale]!)) {
      if (typeof entry === "string") continue;
      for (let count = 0; count <= 200; count++) {
        const category = rules.select(count);
        expect(entry[category], `${locale}.${key} for ${count} (${category})`).toBeTypeOf("string");
      }
    }
  });

  it.each(LOCALES)("%s has no empty strings", (locale) => {
    for (const [key, entry] of Object.entries(table[locale]!)) {
      for (const text of texts(entry)) expect(text.trim(), `${locale}.${key}`).not.toBe("");
    }
  });

  it("French puts a non-breaking space before : ; ? ! and inside « »", () => {
    for (const [key, entry] of Object.entries(table.fr!)) {
      for (const text of texts(entry)) {
        expect(text, `fr.${key}`).not.toMatch(/ [:;?!»]|« /);
        expect(text, `fr.${key}`).not.toMatch(/[^\s  ][;?!]/);
        expect(text, `fr.${key}`).not.toMatch(/[^\s  /]:(?!\/\/)/);
      }
    }
  });
});

describe("locale selection", () => {
  it.each([
    ["en", "en"],
    ["en-US", "en"],
    ["de-AT", "de"],
    ["de_CH", "de"],
    ["fr-CA", "fr"],
    ["es-MX", "es"],
    ["it", "it"],
    ["nb-NO", "nb"],
    ["no", "nb"],
    ["nn-NO", "nb"],
    ["nl-BE", "nl"],
    ["PL", "pl"],
    ["ja-JP", "en"],
    ["", "en"],
    [undefined, "en"],
  ])("%s → %s", (tag, expected) => {
    expect(resolveLocale(tag)).toBe(expected);
  });

  it("switches strings, formatting and the page language with Haven's locale", () => {
    setLocale("de-AT");
    expect(language.value).toBe("de");
    expect(intlLocale.value).toBe("de-AT");
    expect(document.documentElement.lang).toBe("de-AT");
    expect(t("save")).toBe("Speichern");
    setLocale("nb-NO");
    expect(t("newTodo")).toBe("Ny oppgave");
    setLocale("pl");
    expect(intlLocale.value).toBe("pl-PL");
    expect(t("created", { subject: "x" })).toBe("Utworzono zadanie „x”.");
    setLocale("ja");
    expect(t("save")).toBe("Save");
  });

  it("picks plural forms by count", () => {
    setLocale("pl");
    expect(tn("deleted", 1)).toBe("Usunięto zadanie.");
    expect(tn("deleted", 3)).toBe("Usunięto 3 zadania.");
    expect(tn("deleted", 5)).toBe("Usunięto 5 zadań.");
    expect(tn("deleted", 22)).toBe("Usunięto 22 zadania.");
    setLocale("en");
    expect(tn("moved", 1)).toBe("Moved todo.");
    expect(tn("moved", 2)).toBe("Moved 2 todos.");
    expect(tn("syncEvery", 30)).toBe("Every 30 seconds");
  });

  it("formats dates and sizes with the active locale", () => {
    setLocale("de");
    expect(formatDate("2026-03-14T00:00:00.000Z")).toBe(
      new Date("2026-03-14T00:00:00.000Z").toLocaleDateString("de-DE", { dateStyle: "medium" }),
    );
    expect(formatDate(null)).toBeNull();
    expect(formatDate("not a date")).toBeNull();
    expect(formatFileSize(1536)).toBe(
      new Intl.NumberFormat("de-DE", { style: "unit", unit: "kilobyte", unitDisplay: "short", maximumFractionDigits: 2 }).format(1.5),
    );
  });

  it("splits a sentence around its emphasized word", () => {
    expect(tSplit("footerMotto", "ugliest")).toEqual({ before: "Work from 1 to 4. Do the ", after: " thing first. :-)" });
    setLocale("pl");
    expect(tSplit("footerMotto", "ugliest")).toEqual({ before: "Pracuj od 1 do 4. Najpierw zrób to, co ", after: ". :-)" });
  });

  it("names the quadrants in the active language", () => {
    expect(quadrantLabels(1)).toEqual({ importance: "Important", urgency: "Due Soon" });
    setLocale("fr");
    expect(quadrantLabels(4)).toEqual({ importance: "Pas important", urgency: "Échéance lointaine" });
  });

  it("shows the startup recovery in the browser's language", () => {
    expect(bootTexts("nb-NO").bootDismiss).toBe("Lukk");
    expect(bootTexts("ja").bootDismiss).toBe("Dismiss");
  });
});

describe("index.html", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

  it("has the program-files fallback in every language", () => {
    const block = /var loadFailed = \{([\s\S]*?)\};/.exec(html)?.[1] ?? "";
    const keys = [...block.matchAll(/^\s*(\w+):\s*"[^"]+"/gm)].map((match) => match[1]);
    expect(keys.sort()).toEqual([...LOCALES].sort());
  });
});

describe("haven-app.json", () => {
  const definition: unknown = JSON.parse(readFileSync(resolve(process.cwd(), "public/haven-app.json"), "utf8"));

  /** Every `{ "en": … }` map: the localized texts Haven shows. */
  function localizedMaps(value: unknown, path: string, found: [string, Record<string, unknown>][] = []) {
    if (Array.isArray(value)) value.forEach((item, index) => localizedMaps(item, `${path}[${index}]`, found));
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.en === "string") found.push([path, record]);
      else for (const [key, child] of Object.entries(record)) localizedMaps(child, `${path}.${key}`, found);
    }
    return found;
  }

  it("names every localized text in all eight languages", () => {
    // The agent guide (agent/agent.en.md) is read by the model, not shown to the user.
    const maps = localizedMaps(definition, "").filter(([path]) => path !== ".agent.guide");
    expect(maps.length).toBeGreaterThanOrEqual(2);
    for (const [path, map] of maps) {
      expect(Object.keys(map).sort(), path).toEqual([...LOCALES].sort());
      for (const locale of LOCALES) expect(String(map[locale]).trim(), `${path}.${locale}`).not.toBe("");
    }
  });
});
