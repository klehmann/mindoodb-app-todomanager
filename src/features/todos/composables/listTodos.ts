/**
 * The board's todos of one database, read from the host's summary buffer
 * (`documents.query`): no document is loaded or decrypted, so a refresh costs
 * the same however long a todo's edit history is. `documents.list` instead
 * materializes every document and, in Haven, replays each one's whole history
 * to name its last editor.
 *
 * A summary value larger than the host's cap (1 KB) is left out of the row
 * (or projected as missing). Rows without a `description` string are
 * therefore read whole (usually none or a few), so the board, the local
 * search fallback and undo snapshots always see the full notes.
 *
 * Hosts without `documents.query`, or whose query fails, fall back to the
 * changefeed listing.
 */
import type { MindooDBAppDatabase, MindooDBAppQueryRow } from "mindoodb-app-sdk";

import { readTodoItem, type TodoItem } from "./todoTypes";

/** Every field `readTodoItem` reads. */
export const TODO_LIST_FIELDS = [
  "subject",
  "assignedTo",
  "assignedToId",
  "description",
  "quadrant",
  "dueAt",
  "startAt",
  "completed",
  "originApp",
  "originId",
  "originLabel",
  "createdAt",
  "updatedAt",
  "_attachments",
];

const QUERY_PAGE = 500;
const LIST_PAGE = 250;
const GET_CONCURRENCY = 8;

export interface TodoListing {
  todos: TodoItem[];
  /** False while the host is still building the summary buffer: todos may be missing. */
  complete: boolean;
}

function rowToTodo(row: MindooDBAppQueryRow, databaseId: string): TodoItem {
  return readTodoItem(
    { id: row.docId, data: row.fields, updatedAt: new Date(row.lastModified).toISOString() } as never,
    databaseId,
  );
}

async function readWhole(database: MindooDBAppDatabase, databaseId: string, rows: MindooDBAppQueryRow[]) {
  const whole = new Map<string, TodoItem>();
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++]!;
      const document = await database.documents.get(row.docId).catch(() => null);
      if (document) {
        whole.set(row.docId, readTodoItem({ ...document, updatedAt: new Date(row.lastModified).toISOString() }, databaseId));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(GET_CONCURRENCY, rows.length) }, worker));
  return whole;
}

async function listByQuery(database: MindooDBAppDatabase, databaseId: string): Promise<TodoListing> {
  const rows: MindooDBAppQueryRow[] = [];
  let complete = true;
  for (let offset = 0; ; ) {
    const result = await database.documents.query({ fields: TODO_LIST_FIELDS, limit: QUERY_PAGE, offset });
    if (result.coverage === "rebuilding") complete = false;
    rows.push(...result.rows);
    offset += result.rows.length;
    if (!result.rows.length || offset >= result.total) break;
  }
  const whole = await readWhole(
    database,
    databaseId,
    rows.filter((row) => typeof row.fields.description !== "string"),
  );
  return {
    todos: rows.map((row) => whole.get(row.docId) ?? rowToTodo(row, databaseId)),
    complete,
  };
}

async function listByChangefeed(database: MindooDBAppDatabase, databaseId: string): Promise<TodoItem[]> {
  const todos: TodoItem[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await database.documents.list({ cursor, limit: LIST_PAGE, status: "existing" });
    todos.push(...page.items.map((item) => readTodoItem(item, databaseId)));
    if (!page.nextCursor || page.nextCursor === cursor) break;
    cursor = page.nextCursor;
  }
  return todos;
}

/**
 * All todos of `database`. With `requireComplete` (agent tools) a summary
 * that is still being built is not trusted: the changefeed listing answers.
 */
export async function listTodos(
  database: MindooDBAppDatabase,
  databaseId: string,
  options: { requireComplete?: boolean } = {},
): Promise<TodoListing> {
  if (typeof database.documents.query === "function") {
    try {
      const listing = await listByQuery(database, databaseId);
      if (listing.complete || !options.requireComplete) return listing;
    } catch (error) {
      console.warn("[TodoManager] summary query for the board failed, using the changefeed listing", error);
    }
  }
  return { todos: await listByChangefeed(database, databaseId), complete: true };
}
