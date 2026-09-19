# Mindoo TodoManager — Haven app

A Covey-style four-quadrant task board for [MindooDB
Haven](https://mindoodb.com). It turns
[the 2×2 method](https://appfluence.com/productivity/time-management-strategies-for-busy-people-using-the-4-quadrant-method/)
into a visual workflow: organise work by importance and urgency, then
move through the board in priority order — including tackling the
ugliest task first.

Todos live in a mapped MindooDB database. The UI is a Vue 3 tile that
connects through the [MindooDB App SDK](../mindoodb-app-sdk): launch
context, theme and viewport events, documents, attachments, full-text
search, and time travel. It complements
[`mindoodb-app-example`](../mindoodb-app-example) (SDK APIs) and
[`mindoodb-app-weather`](../mindoodb-app-weather) (embedded UX); this
app concentrates on a **collaborative document board** with desktop
and phone layouts.

The published catalog entry is
<https://app-todomanager.mindoodb.com>.

## What it does

- Organises todos in a clear 2×2 matrix:
  1. Important and due soon
  2. Important and not due soon
  3. Not important and due soon
  4. Not important and not due soon
- Creates, edits, completes, and deletes todos (subject, assignee,
  description, start/due dates, attachments).
- Moves tasks quickly with drag and drop across desktop, tablet, and
  phone layouts. Drop on another quadrant to re-prioritise; drop on
  the recycle bin to delete.
- Filters (open / completed / all), sorts, and searches subject,
  assignee, and description (full-text index when the database has
  one; otherwise a local substring fallback).
- Can read from more than one mapped database at once.
- Follows Haven's light/dark theme and viewport. Below 880px the
  board collapses to a single active quadrant with numbered targets
  in the toolbar.
- Supports Haven time travel: the board becomes read-only at the
  selected point in history.
- Optional periodic refresh (10 / 30 / 60 seconds) plus a manual
  sync from the toolbar.

## App parameters

This app has **no launch parameters**. The catalog manifest ships
`launchParameters: {}`. Behaviour comes from the mapped
`todomanager` database and from in-app toolbar choices (filter, sort,
search, sync interval, source databases).

Haven's `preferredDatabaseId` from the launch context is used as the
default write target when more than one database is mapped.

## Registering the app in Haven

1. Open a Haven workspace and add **Mindoo TodoManager** from the
   app store, or register this app with its running URL (see below).
2. Create a database mapping for the logical id `todomanager`. The
   catalog default maps that id to a local database of the same name,
   with write, delete, history, attachments, and views.
3. Without a mapping the tile shows that no database is configured;
   it will not invent a local store of its own.
4. Reload the tile. Open todos appear in their quadrants as soon as
   the first database list returns.

A hosted-bundle install works too: `vite` builds with `base: "./"`
and the `havenBundle()` plugin so the same `dist/` can be imported
into Haven.

## Running the app

### Local development against the published SDK

```bash
pnpm install
pnpm dev
```

The dev server listens on <http://127.0.0.1:4202>. Point a Haven
registration at that URL. The app has no standalone demo data: it
expects to be launched from Haven so the SDK bridge can supply a
session and mapped databases.

### Local development against sibling MindooDB sources

If you're iterating on the Haven app SDK in the same workspace, use
the `:local` variants to alias the sources instead of the published
packages:

```bash
pnpm dev:local      # aliases ../mindoodb-app-sdk/src and ../mindoodb-view-language/src
pnpm build:local    # ditto, for a production build
```

### Cloudflare Pages deployment

Deploying the bundle to [Cloudflare Pages](https://pages.cloudflare.com)
mirrors the workflow used by `mindoodb-app-example`:

```bash
pnpm build
pnpm deploy         # builds + wrangler deploy
pnpm preview        # local Pages preview of the built assets
```

The [`wrangler.jsonc`](./wrangler.jsonc) config treats `./dist` as
the asset directory. Missing files return a real 404
(`public/404.html`) rather than an SPA fallback, so a hashed JS URL
is never answered with cacheable HTML.

## Data model

Each todo is a MindooDB document. The fields the board reads and
writes are:

| Field | Meaning |
|---|---|
| `subject` | Title shown on the card |
| `assignedTo` | Assignee string |
| `description` | Longer notes |
| `quadrant` | `1`–`4` (defaults to `1`) |
| `dueAt` / `startAt` | ISO timestamps, or `null` |
| `completed` | Boolean |
| `createdAt` / `updatedAt` | ISO timestamps maintained by the app |
| `_attachments` | Attachment metadata (and the SDK attachment API for the bytes) |

Document shape helpers live in
[`src/features/todos/composables/todoTypes.ts`](./src/features/todos/composables/todoTypes.ts).

## Visual treatment

The board follows Haven's theme through `onThemeChange` and maps the
host palette onto PrimeVue (Aura / Lara / Material / Nora) plus a
frosted glass treatment. Unlike Weather, light/dark is applied to
the UI. Compact viewports switch from the 2×2 grid to
`TodoMobileBoard`; iOS multitasking gets a slightly tighter toolbar.

## Project layout

```
src/
├── boot.ts                       # PWA recovery, then main.ts
├── main.ts                       # createApp, PrimeVue, mount
├── App.vue                       # shell: toolbar, board, dialog, recycle drop
├── app/                          # useTodoManagerApp: SDK session + host events
├── features/
│   ├── app-shell/                # toolbar, help dialog, background
│   ├── board/                    # 2×2 desktop board + compact mobile board
│   ├── todos/                    # useTodos, document mapping, edit dialog
│   └── sync/                     # periodic refresh
├── lib/                          # Haven theme → PrimeVue preset
├── pwa/                          # update banner + boot recovery
├── sw.ts                         # Workbox injectManifest worker
└── test-utils/                   # withSetup helper
```

## Extending the app

- **More languages**: the UI strings are currently inline English
  (toolbar, help dialog, toasts). Extract them the same way Weather
  does under `src/i18n/` if you need a second locale.
- **More document fields**: extend `TodoDraft` /
  `readTodoDraft` in `todoTypes.ts` and the form in
  `TodoDialog.vue`.
- **Different priority model**: `TODO_QUADRANTS` and
  `todosByQuadrant` are the switch; keep the `quadrant` field
  numeric if existing documents should keep loading.
- **Another layout breakpoint**: `isCompactViewport` in
  `useTodoManagerApp.ts` (currently `< 880`).

## Running the tests

```bash
pnpm test       # runs Vitest once
pnpm test:watch # watch mode
```

Tests cover document mapping, quadrant grouping and filters, pointer
and touch drag, creating a todo from a quadrant double-click,
toolbar wiring, periodic sync, and theme normalisation.

## License

Licensed under the [Apache License, Version 2.0](./LICENSE). Copyright 2026
Mindoo GmbH.
