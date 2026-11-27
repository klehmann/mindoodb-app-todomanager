import { describe, expect, it, vi } from "vitest";
import type { MindooDBAppDatabase } from "mindoodb-app-sdk";

import { listTodos, TODO_LIST_FIELDS } from "./listTodos";

type Stored = { id: string; data: Record<string, unknown>; lastModified: number };

function todo(index: number, extra: Record<string, unknown> = {}): Stored {
  return {
    id: `todo-${index}`,
    data: { subject: `Todo ${index}`, description: "", quadrant: 1, completed: false, ...extra },
    lastModified: Date.UTC(2026, 10, 1) + index * 1000,
  };
}

/** A host whose summary drops values over 1 KB, like Haven's. */
function fakeDatabase(stored: Stored[], options: { coverage?: "full" | "rebuilding"; withQuery?: boolean } = {}) {
  const query = vi.fn(async ({ limit = 50, offset = 0, fields }: { limit?: number; offset?: number; fields?: string[] }) => {
    const rows = stored.slice(offset, offset + limit).map((doc) => ({
      docId: doc.id,
      lastModified: doc.lastModified,
      // Requested fields the summary does not hold come back as `undefined`, like the SDK mock.
      fields: Object.fromEntries(
        (fields ?? Object.keys(doc.data)).map((key) => {
          const value = doc.data[key];
          return [key, value !== undefined && JSON.stringify(value).length <= 1024 ? value : undefined];
        }),
      ),
    }));
    return { rows, total: stored.length, coverage: options.coverage ?? "full" };
  });
  const list = vi.fn(async ({ cursor }: { cursor?: string | null }) => {
    const start = cursor ? Number(cursor) : 0;
    const items = stored.slice(start, start + 250).map((doc) => ({
      id: doc.id,
      data: doc.data,
      updatedAt: new Date(doc.lastModified).toISOString(),
    }));
    const next = start + items.length;
    return { items, nextCursor: next < stored.length ? String(next) : null };
  });
  const get = vi.fn(async (id: string) => {
    const doc = stored.find((entry) => entry.id === id);
    return doc ? { id: doc.id, data: doc.data, attachments: [] } : null;
  });
  const database = {
    documents: { ...(options.withQuery === false ? {} : { query }), list, get },
  } as unknown as MindooDBAppDatabase;
  return { database, query, list, get };
}

describe("listTodos", () => {
  it("reads every todo from the summary buffer, paged, without the changefeed", async () => {
    const stored = Array.from({ length: 1203 }, (_, index) => todo(index));
    const { database, query, list, get } = fakeDatabase(stored);

    const listing = await listTodos(database, "main");

    expect(listing.complete).toBe(true);
    expect(listing.todos).toHaveLength(1203);
    expect(listing.todos[0]).toMatchObject({ id: "todo-0", subject: "Todo 0", databaseId: "main", selectionKey: "main:todo-0" });
    expect(listing.todos[5]!.updatedAt).toBe(new Date(stored[5]!.lastModified).toISOString());
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0]![0].fields).toEqual(TODO_LIST_FIELDS);
    expect(list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("reads todos whole whose notes are too long for the summary", async () => {
    const longNotes = "x".repeat(3000);
    const { database, get } = fakeDatabase([todo(1), todo(2, { description: longNotes }), todo(3)]);

    const listing = await listTodos(database, "main");

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("todo-2");
    expect(listing.todos.map((entry) => entry.id)).toEqual(["todo-1", "todo-2", "todo-3"]);
    expect(listing.todos[1]!.description).toBe(longNotes);
  });

  it("reports an incomplete board while the summary is being built", async () => {
    const { database, list } = fakeDatabase([todo(1)], { coverage: "rebuilding" });

    const listing = await listTodos(database, "main");

    expect(listing.complete).toBe(false);
    expect(listing.todos).toHaveLength(1);
    expect(list).not.toHaveBeenCalled();
  });

  it("walks the changefeed when a complete list is required and the summary is being built", async () => {
    const stored = Array.from({ length: 600 }, (_, index) => todo(index));
    const { database, list } = fakeDatabase(stored, { coverage: "rebuilding" });

    const listing = await listTodos(database, "main", { requireComplete: true });

    expect(listing.complete).toBe(true);
    expect(listing.todos).toHaveLength(600);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it("walks the changefeed on hosts without documents.query", async () => {
    const { database, list } = fakeDatabase([todo(1), todo(2)], { withQuery: false });

    const listing = await listTodos(database, "main");

    expect(listing.todos.map((entry) => entry.id)).toEqual(["todo-1", "todo-2"]);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
