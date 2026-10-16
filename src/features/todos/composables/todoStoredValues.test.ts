import { next as Automerge } from "@automerge/automerge";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { MindooDBAppValue, type MindooDBAppDatabase } from "mindoodb-app-sdk";
import { createMockMindooDBAppSession } from "mindoodb-app-sdk/testing";

import { withSetup } from "@/test-utils/withSetup";

import { toStoredTodoFields } from "./todoStoredValues";
import { useTodos } from "./useTodos";

const atomic = MindooDBAppValue.atomic;

describe("toStoredTodoFields", () => {
  it("keeps subject and description as text and makes every other string atomic", () => {
    expect(toStoredTodoFields({
      subject: "Call Ada",
      description: "About **Q4**",
      assignedTo: "Ada Lovelace",
      assignedToId: "CN=Ada Lovelace/O=Acme",
      quadrant: 2,
      dueAt: "2026-10-20",
      startAt: null,
      completed: false,
      originApp: "vega",
      updatedAt: "2026-10-16T10:00:00.000Z",
    })).toEqual({
      subject: "Call Ada",
      description: "About **Q4**",
      assignedTo: atomic("Ada Lovelace"),
      assignedToId: atomic("CN=Ada Lovelace/O=Acme"),
      quadrant: 2,
      dueAt: atomic("2026-10-20"),
      startAt: null,
      completed: false,
      originApp: atomic("vega"),
      updatedAt: atomic("2026-10-16T10:00:00.000Z"),
    });
  });
});

/**
 * Guard: create, edit and undo todos through `useTodos` against a real
 * Automerge store and list every string that ended up as collaborative text.
 */
describe("stored todos", () => {
  function textPaths(binary: Uint8Array): string[] {
    const doc = Automerge.load<Record<string, unknown>>(binary);
    const found: string[] = [];
    const walk = (value: unknown, path: string[]) => {
      if (typeof value === "string") {
        found.push(path.join("."));
        return;
      }
      if (value === null || typeof value !== "object" || Automerge.isImmutableString(value)
        || Automerge.isCounter(value) || value instanceof Date || value instanceof Uint8Array) {
        return;
      }
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, [...path, key]);
      }
    };
    walk(doc, []);
    return found;
  }

  it("stores only subject and description as text", async () => {
    const controller = createMockMindooDBAppSession({
      databases: [{
        info: { id: "main", title: "Main", capabilities: ["read", "create", "update", "delete", "history"] },
        automerge: true,
        documents: [],
      }],
    });
    const database: MindooDBAppDatabase = await controller.session.openDatabase("main");
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabaseIds: ref(["main"]),
      databases: ref([
        { id: "main", title: "Main", capabilities: ["read", "create", "update", "delete"] },
      ] as any),
      preferredDatabaseId: computed(() => "main"),
      getDatabase: vi.fn(async () => database),
      loading: ref(false),
      busyAction: ref<string | null>(null),
      error: ref<string | null>(null),
      setSuccess: vi.fn(),
    }));

    const { created } = await result.createTodos([{
      databaseId: "main",
      fields: {
        subject: "Call Ada",
        description: "About Q4",
        assignedTo: "Ada Lovelace",
        assignedToId: "CN=Ada Lovelace/O=Acme",
        dueAt: "2026-10-20",
        startAt: "2026-10-17",
        originApp: "vega",
        originId: "map-1/node-2",
        originLabel: "Kickoff",
      },
    }], "Create");
    const todo = result.todos.value.find((entry) => entry.id === created[0]!.id)!;
    await result.editTodos([{ todo, set: { dueAt: "2026-10-21", quadrant: 3 } }], "Edit");
    await result.undoLastChange();

    const snapshot = await database.documents.getAutomergeSnapshot(todo.id);
    expect(textPaths(snapshot.binary).sort()).toEqual(["description", "subject"]);
    const stored = await database.documents.get(todo.id);
    expect(stored?.data).toMatchObject({ assignedToId: "CN=Ada Lovelace/O=Acme", dueAt: "2026-10-20" });

    unmount();
  });
});
