import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { withSetup } from "@/test-utils/withSetup";

import { useTodos } from "./useTodos";

function createDatabaseStub() {
  return {
    documents: {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: "todo-1",
            data: {
              subject: "Alpha",
              description: "",
              quadrant: 2,
              completed: false,
              createdAt: "2026-04-20T00:00:00.000Z",
              updatedAt: "2026-04-21T00:00:00.000Z",
            },
            updatedAt: "2026-04-21T00:00:00.000Z",
          },
          {
            id: "todo-2",
            data: {
              subject: "Beta",
              description: "Done",
              quadrant: 4,
              completed: true,
              createdAt: "2026-04-19T00:00:00.000Z",
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
            updatedAt: "2026-04-19T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

describe("useTodos", () => {
  it("loads todos and groups them by quadrant with filtering", async () => {
    const database = createDatabaseStub();
    const loading = ref(false);
    const busyAction = ref<string | null>(null);
    const error = ref<string | null>(null);
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabase: ref(database as any),
      canRead: computed(() => true),
      canCreate: computed(() => true),
      canUpdate: computed(() => true),
      canDelete: computed(() => true),
      loading,
      busyAction,
      error,
      setSuccess: vi.fn(),
    }));

    await result.refreshTodos();

    expect(result.todos.value).toHaveLength(2);
    expect(result.todosByQuadrant.value[2]).toHaveLength(1);
    expect(result.todosByQuadrant.value[4]).toHaveLength(0);

    result.filterMode.value = "all";
    expect(result.todosByQuadrant.value[4]).toHaveLength(1);

    unmount();
  });

  it("supports selection-driven drag, bulk moves, and bulk deletes", async () => {
    const database = createDatabaseStub();
    const setSuccess = vi.fn();
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabase: ref(database as any),
      canRead: computed(() => true),
      canCreate: computed(() => true),
      canUpdate: computed(() => true),
      canDelete: computed(() => true),
      loading: ref(false),
      busyAction: ref<string | null>(null),
      error: ref<string | null>(null),
      setSuccess,
    }));

    await result.refreshTodos();
    result.setSelectedTodoIds(["todo-1", "todo-2"]);

    expect(result.beginDrag("todo-1")).toEqual(["todo-1", "todo-2"]);

    await result.moveSelectedTodos(3);
    expect(database.documents.update).toHaveBeenCalledTimes(2);

    await result.deleteSelectedTodos();
    expect(database.documents.delete).toHaveBeenCalledTimes(2);
    expect(setSuccess).toHaveBeenCalled();

    unmount();
  });
});
