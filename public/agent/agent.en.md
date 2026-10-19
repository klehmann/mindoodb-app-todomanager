# Working with Mindoo TodoManager

TodoManager keeps todos in MindooDB databases and shows them on a 2x2 board after Covey's (Eisenhower's) four quadrants:

1. important and urgent: do it now
2. important, not urgent: plan it
3. urgent, not important: delegate or batch it
4. neither: reduce or drop it

The app labels urgent as "Due Soon". A todo has a subject, notes, an assignee, start and due dates, a done flag and optionally an origin (where it came from, e.g. a mind map node in Vega). TodoManager's tools appear only while it runs; field details are in each tool's description.

## Where ids come from

- `todoId`: `todo_list`, `todo_get_context` (selected todos and the todo open in the dialog), or the `created` list that `todo_create` returns.
- `databaseId`: `todo_get_context` (`canCreate` marks databases that take new todos). Usually you need none: `todo_list` searches all readable databases, and `todo_create` uses the app's main todo database.
- `userId` for `assigneeId`: `todo_users_search`.
- `undoStepId`: returned by every write tool.

Never invent ids, and never pass a subject where a todoId is expected.

## Answer "what do I have to do?"

1. `todo_get_context` gives today's date and weekday, the user's name and the open todos per quadrant. Use it to resolve "this week", "tomorrow" or "this todo".
2. `todo_list` with `forMe` true and `dueWithin` `this_week` (or `today`, `next_week`). `today` and `this_week` include overdue todos.
3. Also list quadrant 1 todos without a due date: they are urgent by definition. `todo_list` with `quadrants` `[1]` and `forMe` true.
4. Present them by quadrant, overdue first. Without `text`, results come sorted by quadrant, then due date.

For another person ("what does Paul have to do?"): `todo_users_search` with the name, then `todo_list` with `assigneeId`. If several people fit, ask which one is meant.

## Search

- Exact criteria: `status` (open by default; `completed` or `all` for done todos), `quadrants` or `important`/`urgent`, `dueBefore`, `dueAfter`, `dueWithin`, `overdue`, `assignee` (part of a typed name), `origin`, and `exact` for words that must appear literally.
- Topics: `text` searches the full-text index over subject, notes and assignee, matches word beginnings and small typos and ranks by `score`. Use `match` `any` for a rough topic search. If the result says `textSearch` is substring, there is no index and only literal words matched; retry with other words or use `exact`.
- Check `total` and `truncated`; raise `limit` when the user wants everything.

## Create todos

1. Turn each request into short subjects; put detail into `notes`.
2. Decide the quadrant from what the user says: `important` and `urgent` (or `quadrant` directly). Without either, a todo lands in quadrant 2. A near deadline usually means urgent.
3. Dates are `YYYY-MM-DD`. Work out relative dates ("by Friday") from `today` in `todo_get_context`.
4. Assign with `assigneeId` from `todo_users_search` when the person is in the directory; use free-text `assignee` only for people outside it.
5. One `todo_create` call with all todos (one undo step) beats many calls.

### Todos from another app

When a todo stands for something elsewhere (a Vega node, a document), pass `origin` `{ app, id, label }`, e.g. `{ "app": "vega", "id": "<mapId>/<nodeId>", "label": "Relaunch › Pricing" }`. A todo with the same origin is not created twice: it comes back under `existing`. If that one is done and the task is open again, reopen it with `todo_complete` and `completed` false. To find todos of one source later: `todo_list` with `origin` `{ app }` or `{ app, id }` and `status` `all`.

## Change todos

- `todo_update` changes only the fields you give. Moving between quadrants: say what changed. "No longer urgent" is `urgent` false (1 → 2, 3 → 4), "no longer important" is `important` false (1 → 3, 2 → 4), or set `quadrant`.
- `notes` `""`, `assignee` `""` and `start`/`due` null clear a field; `origin` null removes the origin.
- Done: `todo_complete` with `todoIds`. Done todos leave the board but stay listable with `status` `completed`. "Reopen" is `todo_complete` with `completed` false.
- `todo_delete` moves todos to the app's recycle bin, and Haven asks the user first. Prefer `todo_complete` when the user means "done".

## Show the user

`todo_show` selects todos on the board, opens one in its dialog (`openTodoId`), switches the filter (`open`, `completed`, `all`) or, on narrow screens, the visible quadrant. It refuses todos from databases the board does not show; then ask the user to turn that database on under Sources.

## Undo

Every write tool returns an `undoStepId`. `todo_undo` with that id takes back the step and every newer one; deleted todos come back. If the user changed something after your step, undo is refused; ask before passing `includeUserSteps`. `todo_history` lists the steps of this session, `todo_redo` re-applies an undone step.

## Pitfalls

- When TodoManager is in time travel (`readOnly` true in `todo_get_context`), every write is refused; ask the user to leave time travel in Haven.
- There are no attachment tools. A todo's `attachments` is only the number of files; point the user to the todo's dialog.
- `todo_users_search` needs TodoManager's directory permission. If it is refused, ask the user to grant it in Haven, or use a free-text `assignee`.
- Search reads this device's copy. If the user expects todos from others that are missing, start a sync (`haven_sync_start`) and search again.
- `forMe` also returns todos assigned to nobody; mention that when it matters.
