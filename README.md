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

Todos that another app (or an agent on its behalf) created may also carry
an origin: `originApp`, `originId`, `originLabel` (e.g. `vega`,
`<mapId>/<nodeId>`). The UI does not show them; agents use them to find a
todo again instead of creating a duplicate. `assignedToId` holds the
directory user id when a todo was assigned to a person from the tenant
directory (`assignedTo` then carries the readable name); typing a different
assignee in the dialog clears it.

## Undo and redo

Every change (create, edit, move, complete, delete; from the UI or from an
agent) is one step in a session-long history
([`src/features/undo/todoUndo.ts`](./src/features/undo/todoUndo.ts)): the
touched todos with their fields before and after. Undo writes the old state
back and brings deleted todos back with `undelete`, so they keep their id.
The toolbar arrows next to **New todo** and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z
trigger it.

## AI agents (WebMCP)

TodoManager offers its board to AI agents through Haven's agent tools
(WebMCP). Haven needs **Settings → General → Agent tools** on and **Offer
tools to AI agents** ticked for TodoManager; the console then logs
`[TodoManager] Offered 10 agent tools to Haven.` The tools carry the prefix
`todo_` (`agentToolPrefix` in `public/haven-app.json`). Code:
[`src/features/agent`](./src/features/agent).

Agents get the method in plain words: quadrant 1 = important and urgent,
2 = important, 3 = urgent, 4 = neither, and each todo with `important` and
`urgent` flags, so "no longer urgent" becomes a move from 1 to 2 (or 3 to 4).

| Tool | What it does |
| --- | --- |
| `todo_get_context` | Today's date and weekday, the signed-in user, and what the user sees: databases, filter, open todos per quadrant, selection, todo open in the dialog. |
| `todo_list` | Finds todos. Exact: status (default open), quadrant, important/urgent, dates, `dueWithin` (today, this week, next week), overdue, origin and `exact` words, as a `documents.query` filter; plus assignee, `assigneeId` (a person from the directory, also matching their typed name) and `forMe`. Topics: `text` through the full-text index (prefixes, small typos, ranked; `match: "any"` for a rough search), with a substring fallback where the index is off. |
| `todo_users_search` | People in the tenant directory by part of their name (needs the `directory` permission). |
| `todo_create` | New todos with subject, notes, important/urgent or quadrant, assignee, dates, origin; no duplicates per origin. |
| `todo_update` | Change fields or move between quadrants (`urgent: false`, `important: false`, or `quadrant`). |
| `todo_complete` | Tick todos off (they leave the board) or reopen them. |
| `todo_delete` | Delete todos; Haven asks the user first. |
| `todo_show` | Select todos, open one in its dialog, switch filter or the visible quadrant on phones. |
| `todo_history`, `todo_undo`, `todo_redo` | Session history; undo an agent's change by its step id. User steps only with `includeUserSteps`. |

Example requests:

- "What should I work on today?" (quadrant 1 and overdue todos)
- "What does Paul have to do today?" (`todo_users_search` "Paul", then `assigneeId` + `dueWithin: today`)
- "Assign *Send offer* to Paul." (stores his directory id, so renames and namesakes do not confuse the search)
- "What do I have to do this week?" (`forMe` + `dueWithin: this_week`, plus quadrant 1 without a date)
- "Add a todo: call the tax advisor by Friday, important and urgent."
- "The task *Website copy* is no longer urgent." / "*Team offsite* is no longer important."
- "Tick off *Pay invoice*." / "Reopen the todo I just completed."
- "What is overdue, and which of those could move to quadrant 2?"
- "Move everything assigned to Paul that is not important to quadrant 4."
- "Clean up: delete all completed todos in quadrant 4." (Haven asks first)
- "What did I get done this week?" (completed todos by last change)
- "Do I have anything about taxes or receipts?" (topic search: `text: "tax receipt"`, `match: "any"`)
- "Create a todo for every open task in the Vega map *Relaunch 2027*." (with origin, so running it again adds nothing twice)
- "Undo that."

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
