import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { withSetup } from "@/test-utils/withSetup";

import { useTodos } from "./useTodos";

function createDatabaseStub(items: Array<Record<string, unknown>>) {
  return {
    documents: {
      list: vi.fn().mockResolvedValue({ items, nextCursor: null }),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

describe("useTodos", () => {
  it("loads todos and groups them by quadrant with filtering", async () => {
    const mainDatabase = createDatabaseStub([
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
    ]);
    const secondaryDatabase = createDatabaseStub([
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
    ]);
    const loading = ref(false);
    const busyAction = ref<string | null>(null);
    const error = ref<string | null>(null);
    const databases = {
      main: mainDatabase,
      secondary: secondaryDatabase,
    };
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabaseIds: ref(["main", "secondary"]),
      databases: ref([
        { id: "main", title: "Main", capabilities: ["read", "create", "update", "delete"] },
        { id: "secondary", title: "Secondary", capabilities: ["read", "create", "update", "delete"] },
      ] as any),
      preferredDatabaseId: computed(() => "main"),
      getDatabase: vi.fn(async (databaseId: string) => databases[databaseId as keyof typeof databases] as any),
      loading,
      busyAction,
      error,
      setSuccess: vi.fn(),
    }));

    await result.refreshTodos();

    expect(result.todos.value).toHaveLength(2);
    expect(result.todos.value[0]?.databaseId).toBe("main");
    expect(result.todosByQuadrant.value[2]).toHaveLength(1);
    expect(result.todosByQuadrant.value[4]).toHaveLength(0);

    result.filterMode.value = "all";
    expect(result.todosByQuadrant.value[4]).toHaveLength(1);

    unmount();
  });

  it("searches subject, assignedTo, and description through the Flexsearch index", async () => {
    const mainDatabase = createDatabaseStub([
      {
        id: "todo-1",
        data: {
          subject: "Alpha roadmap",
          assignedTo: "Alice Example",
          description: "Prepare the quarterly planning board",
          quadrant: 2,
          completed: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-21T00:00:00.000Z",
        },
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
    ]);
    const secondaryDatabase = createDatabaseStub([
      {
        id: "todo-2",
        data: {
          subject: "Beta release",
          assignedTo: "Bob Example",
          description: "Done and ready to archive",
          quadrant: 4,
          completed: true,
          createdAt: "2026-04-19T00:00:00.000Z",
          updatedAt: "2026-04-19T00:00:00.000Z",
        },
        updatedAt: "2026-04-19T00:00:00.000Z",
      },
    ]);
    const databases = {
      main: mainDatabase,
      secondary: secondaryDatabase,
    };
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabaseIds: ref(["main", "secondary"]),
      databases: ref([
        { id: "main", title: "Main", capabilities: ["read", "create", "update", "delete"] },
        { id: "secondary", title: "Secondary", capabilities: ["read", "create", "update", "delete"] },
      ] as any),
      preferredDatabaseId: computed(() => "main"),
      getDatabase: vi.fn(async (databaseId: string) => databases[databaseId as keyof typeof databases] as any),
      loading: ref(false),
      busyAction: ref<string | null>(null),
      error: ref<string | null>(null),
      setSuccess: vi.fn(),
    }));

    await result.refreshTodos();
    result.filterMode.value = "all";

    result.searchQuery.value = "Alpha";
    expect(result.filteredTodos.value.map((todo) => todo.subject)).toEqual(["Alpha roadmap"]);

    result.searchQuery.value = "Alice";
    expect(result.filteredTodos.value.map((todo) => todo.subject)).toEqual(["Alpha roadmap"]);

    result.searchQuery.value = "archive";
    expect(result.filteredTodos.value.map((todo) => todo.subject)).toEqual(["Beta release"]);
    expect(result.todosByQuadrant.value[4]).toHaveLength(1);

    unmount();
  });

  it("moves todos between quadrants through the custom pointer drag flow", async () => {
    const mainDatabase = createDatabaseStub([
      {
        id: "todo-1",
        data: {
          subject: "Alpha roadmap",
          assignedTo: "Alice Example",
          description: "Prepare the quarterly planning board",
          quadrant: 1,
          completed: false,
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-21T00:00:00.000Z",
        },
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
    ]);
    const databases = {
      main: mainDatabase,
    };
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabaseIds: ref(["main"]),
      databases: ref([
        { id: "main", title: "Main", capabilities: ["read", "create", "update", "delete"] },
      ] as any),
      preferredDatabaseId: computed(() => "main"),
      getDatabase: vi.fn(async (databaseId: string) => databases[databaseId as keyof typeof databases] as any),
      loading: ref(false),
      busyAction: ref<string | null>(null),
      error: ref<string | null>(null),
      setSuccess: vi.fn(),
    }));

    await result.refreshTodos();

    const dropTarget = document.createElement("div");
    dropTarget.setAttribute("data-todo-quadrant", "3");
    document.body.appendChild(dropTarget);
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => dropTarget),
    });
    const PointerCtor = (window.PointerEvent ?? window.MouseEvent) as typeof MouseEvent;

    result.handleTodoPointerDown(
      "main:todo-1",
      new PointerCtor("pointerdown", {
        button: 0,
        clientX: 10,
        clientY: 10,
      }) as PointerEvent,
    );

    document.dispatchEvent(new PointerCtor("pointermove", {
      clientX: 30,
      clientY: 30,
    }));
    document.dispatchEvent(new PointerCtor("pointerup", {
      clientX: 30,
      clientY: 30,
    }));

    await vi.waitFor(() => {
      expect(mainDatabase.documents.update).toHaveBeenCalledWith("todo-1", expect.objectContaining({
        set: expect.objectContaining({ quadrant: 3 }),
      }));
    });

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
    dropTarget.remove();
    unmount();
  });

  it("supports selection-driven drag, bulk moves, and bulk deletes", async () => {
    const mainDatabase = createDatabaseStub([
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
    ]);
    const secondaryDatabase = createDatabaseStub([
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
    ]);
    const setSuccess = vi.fn();
    const databases = {
      main: mainDatabase,
      secondary: secondaryDatabase,
    };
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabaseIds: ref(["main", "secondary"]),
      databases: ref([
        { id: "main", title: "Main", capabilities: ["read", "create", "update", "delete"] },
        { id: "secondary", title: "Secondary", capabilities: ["read", "create", "update", "delete"] },
      ] as any),
      preferredDatabaseId: computed(() => "main"),
      getDatabase: vi.fn(async (databaseId: string) => databases[databaseId as keyof typeof databases] as any),
      loading: ref(false),
      busyAction: ref<string | null>(null),
      error: ref<string | null>(null),
      setSuccess,
    }));

    await result.refreshTodos();
    result.setSelectedTodoIds(["main:todo-1", "secondary:todo-2"]);

    expect(result.beginDrag("main:todo-1")).toEqual(["main:todo-1", "secondary:todo-2"]);

    await result.moveSelectedTodos(3);
    expect(mainDatabase.documents.update).toHaveBeenCalledTimes(1);
    expect(secondaryDatabase.documents.update).toHaveBeenCalledTimes(1);

    await result.deleteSelectedTodos();
    expect(mainDatabase.documents.delete).toHaveBeenCalledTimes(1);
    expect(secondaryDatabase.documents.delete).toHaveBeenCalledTimes(1);
    expect(setSuccess).toHaveBeenCalled();

    unmount();
  });

  it("marks todos as completed across databases", async () => {
    const mainDatabase = createDatabaseStub([
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
    ]);
    const secondaryDatabase = createDatabaseStub([
      {
        id: "todo-2",
        data: {
          subject: "Beta",
          description: "",
          quadrant: 4,
          completed: false,
          createdAt: "2026-04-19T00:00:00.000Z",
          updatedAt: "2026-04-19T00:00:00.000Z",
        },
        updatedAt: "2026-04-19T00:00:00.000Z",
      },
    ]);
    const databases = {
      main: mainDatabase,
      secondary: secondaryDatabase,
    };
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabaseIds: ref(["main", "secondary"]),
      databases: ref([
        { id: "main", title: "Main", capabilities: ["read", "create", "update", "delete"] },
        { id: "secondary", title: "Secondary", capabilities: ["read", "create", "update", "delete"] },
      ] as any),
      preferredDatabaseId: computed(() => "main"),
      getDatabase: vi.fn(async (databaseId: string) => databases[databaseId as keyof typeof databases] as any),
      loading: ref(false),
      busyAction: ref<string | null>(null),
      error: ref<string | null>(null),
      setSuccess: vi.fn(),
    }));

    await result.refreshTodos();
    await result.setTodosCompleted(["main:todo-1", "secondary:todo-2"], true);

    expect(mainDatabase.documents.update).toHaveBeenCalledTimes(1);
    expect(secondaryDatabase.documents.update).toHaveBeenCalledTimes(1);
    expect(mainDatabase.documents.update).toHaveBeenCalledWith("todo-1", expect.objectContaining({
      set: expect.objectContaining({ completed: true }),
    }));

    unmount();
  });

  it("loads assignedTo from the full document when opening a todo", async () => {
    const database = {
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
          ],
          nextCursor: null,
        }),
        get: vi.fn().mockResolvedValue({
          id: "todo-1",
          data: {
            subject: "Alpha",
            assignedTo: "Alex Example",
            description: "",
            quadrant: 2,
            completed: false,
            createdAt: "2026-04-20T00:00:00.000Z",
            updatedAt: "2026-04-21T00:00:00.000Z",
          },
          updatedAt: "2026-04-21T00:00:00.000Z",
        }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ ok: true }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
      attachments: {
        list: vi.fn().mockResolvedValue([]),
      },
    };
    const { result, unmount } = withSetup(() => useTodos({
      selectedDatabaseIds: ref(["main"]),
      databases: ref([
        { id: "main", title: "Main", capabilities: ["read", "create", "update", "delete", "attachments"] },
      ] as any),
      preferredDatabaseId: computed(() => "main"),
      getDatabase: vi.fn(async () => database as any),
      loading: ref(false),
      busyAction: ref<string | null>(null),
      error: ref<string | null>(null),
      setSuccess: vi.fn(),
    }));

    await result.refreshTodos();
    await result.openTodo("main:todo-1");

    expect(result.draft.value.assignedTo).toBe("Alex Example");

    unmount();
  });
});
