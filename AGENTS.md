# AGENTS.md

Notes for people and coding agents working on this repo.

## Languages

Every user-facing string ships in all languages the product supports, in the same
change that adds it: labels, buttons, placeholders, empty states, errors,
`aria-label`s, notifications and dialogs. For Haven and its apps that is
**en, de, es, fr, it, nb, nl, pl** — never only English, never only English and German.

- **Make a gap impossible to merge.** Typed tables
  (`satisfies Record<Locale, Messages>`, `Messages` derived from English), in Rust a
  `match` over the language enum, or — with one file per locale — a test that compares
  every locale's keys and `{placeholders}` with `en`. Falling back to English is for
  languages Haven does not offer, not for strings nobody translated.
- **Map the tag** by its primary subtag: `de-AT` → `de`, `no`/`nn` → `nb`, anything
  else → `en`. Dates and numbers go through `Intl` with the active locale.
- **Say it as Haven says it.** Haven's terms (database, tenant, attachment, …) and its
  form of address: German *du*, Spanish *tú*, French *vous*, Italian *tu*,
  Norwegian *du*, Dutch *je*, Polish informal.

**In this repo:** the UI strings live in `src/lib/i18n.ts` (typed tables,
`satisfies Record<Locale, Messages>`, `t()` / `tn()` with `Intl.PluralRules`, dates and
file sizes via `Intl`), following Haven's locale (`launchContext.locale`,
`onLocaleChange`). The startup recovery screen has its own dependency-free table in
`src/lib/bootMessages.ts`, and `index.html` an inline fallback map. `src/lib/i18n.test.ts`
checks keys, `{placeholders}`, plural forms, French spacing, the `index.html` map and the
store listing texts in `public/haven-app.json`. Agent tool descriptions, results and undo
step labels (read by agents through `todo_history`) stay English.
