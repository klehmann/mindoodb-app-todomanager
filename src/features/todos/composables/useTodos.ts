import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { MindooDBAppDatabase } from "mindoodb-app-sdk";

import {
  buildTodoCreateInput,
  buildTodoPatch,
  EMPTY_TODO_DRAFT,
  readTodoItem,
  type TodoDraft,
  type TodoFilterMode,
  type TodoItem,
  type TodoQuadrant,
  type TodoSortMode,
} from "./todoTypes";

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function byDate(value: string | null) {
  return value ? Date.parse(value) || 0 : 0;
}

export interface UseTodosOptions {
  selectedDatabase: Ref<MindooDBAppDatabase | null>;
  canRead: ComputedRef<boolean>;
  canCreate: ComputedRef<boolean>;
  canUpdate: ComputedRef<boolean>;
  canDelete: ComputedRef<boolean>;
  loading: Ref<boolean>;
  busyAction: Ref<string | null>;
  error: Ref<string | null>;
  setSuccess: (message: string | null) => void;
}

export function useTodos(options: UseTodosOptions) {
  const todos = ref<TodoItem[]>([]);
  const selectedTodoIds = ref<string[]>([]);
  const draggedTodoIds = ref<string[]>([]);
  const dialogVisible = ref(false);
  const dialogMode = ref<"create" | "edit">("create");
  const dialogTodoId = ref<string | null>(null);
  const draft = ref<TodoDraft>({ ...EMPTY_TODO_DRAFT });
  const searchQuery = ref("");
  const filterMode = ref<TodoFilterMode>("open");
  const sortMode = ref<TodoSortMode>("updated-desc");
  const activeMobileQuadrant = ref<TodoQuadrant>(1);

  const selectedTodoSet = computed(() => new Set(selectedTodoIds.value));
  const selectedCount = computed(() => selectedTodoIds.value.length);
  const selectedTodos = computed(() =>
    todos.value.filter((todo) => selectedTodoSet.value.has(todo.id)),
  );
  const selectedQuadrants = computed(() =>
    Array.from(new Set(selectedTodos.value.map((todo) => todo.quadrant))),
  );

  const filteredTodos = computed(() => {
    const query = searchQuery.value.trim().toLocaleLowerCase();
    const filtered = todos.value.filter((todo) => {
      if (filterMode.value === "open" && todo.completed) {
        return false;
      }
      if (filterMode.value === "completed" && !todo.completed) {
        return false;
      }
      if (!query) {
        return true;
      }

      return `${todo.subject}\n${todo.description}`.toLocaleLowerCase().includes(query);
    });

    filtered.sort((left, right) => {
      switch (sortMode.value) {
        case "subject-asc":
          return left.subject.localeCompare(right.subject);
        case "due-asc":
          return byDate(left.dueAt) - byDate(right.dueAt) || left.subject.localeCompare(right.subject);
        case "created-desc":
          return byDate(right.createdAt) - byDate(left.createdAt) || left.subject.localeCompare(right.subject);
        case "updated-desc":
        default:
          return byDate(right.updatedAt) - byDate(left.updatedAt) || left.subject.localeCompare(right.subject);
      }
    });

    return filtered;
  });

  const todosByQuadrant = computed(() => ({
    1: filteredTodos.value.filter((todo) => todo.quadrant === 1),
    2: filteredTodos.value.filter((todo) => todo.quadrant === 2),
    3: filteredTodos.value.filter((todo) => todo.quadrant === 3),
    4: filteredTodos.value.filter((todo) => todo.quadrant === 4),
  }));

  const mobileTodos = computed(() => todosByQuadrant.value[activeMobileQuadrant.value]);

  function setSelectedTodoIds(ids: string[]) {
    selectedTodoIds.value = Array.from(new Set(ids)).filter((id) => todos.value.some((todo) => todo.id === id));
  }

  function clearSelection() {
    selectedTodoIds.value = [];
  }

  function isSelected(todoId: string) {
    return selectedTodoSet.value.has(todoId);
  }

  function selectTodo(todoId: string, additive = false) {
    if (additive) {
      if (isSelected(todoId)) {
        selectedTodoIds.value = selectedTodoIds.value.filter((id) => id !== todoId);
      } else {
        selectedTodoIds.value = [...selectedTodoIds.value, todoId];
      }
      return;
    }

    selectedTodoIds.value = [todoId];
  }

  function startCreateTodo(quadrant: TodoQuadrant = activeMobileQuadrant.value) {
    dialogMode.value = "create";
    dialogTodoId.value = null;
    draft.value = {
      ...EMPTY_TODO_DRAFT,
      quadrant,
    };
    dialogVisible.value = true;
  }

  function openTodo(todoId: string) {
    const todo = todos.value.find((entry) => entry.id === todoId);
    if (!todo) {
      return;
    }

    dialogMode.value = "edit";
    dialogTodoId.value = todo.id;
    draft.value = {
      subject: todo.subject,
      description: todo.description,
      quadrant: todo.quadrant,
      dueAt: todo.dueAt,
      startAt: todo.startAt,
      completed: todo.completed,
    };
    dialogVisible.value = true;
  }

  function closeDialog() {
    dialogVisible.value = false;
  }

  function setDraft<K extends keyof TodoDraft>(key: K, value: TodoDraft[K]) {
    draft.value = {
      ...draft.value,
      [key]: value,
    };
  }

  async function listAllTodos() {
    if (!options.selectedDatabase.value || !options.canRead.value) {
      todos.value = [];
      clearSelection();
      return;
    }

    const items: TodoItem[] = [];
    let cursor: string | null = null;

    while (true) {
      const page = await options.selectedDatabase.value.documents.list({
        cursor,
        limit: 250,
        status: "existing",
      });

      items.push(...page.items.map((item) => readTodoItem(item)));
      if (!page.nextCursor || page.nextCursor === cursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    todos.value = items;
    setSelectedTodoIds(selectedTodoIds.value);
  }

  async function refreshTodos() {
    options.error.value = null;
    options.loading.value = true;
    try {
      await listAllTodos();
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to refresh todos.");
      throw error;
    } finally {
      options.loading.value = false;
    }
  }

  async function saveDialogTodo() {
    if (!options.selectedDatabase.value) {
      return;
    }

    const nextSubject = draft.value.subject.trim();
    if (!nextSubject) {
      options.error.value = "A subject is required.";
      return;
    }

    options.error.value = null;
    options.busyAction.value = dialogMode.value === "create" ? "Creating todo" : "Saving todo";

    try {
      if (dialogMode.value === "create") {
        if (!options.canCreate.value) {
          throw new Error("The selected database does not allow creating todos.");
        }

        const created = await options.selectedDatabase.value.documents.create(buildTodoCreateInput({
          ...draft.value,
          subject: nextSubject,
        }));
        await listAllTodos();
        setSelectedTodoIds([created.id]);
        options.setSuccess(`Created todo "${nextSubject}".`);
      } else {
        if (!options.canUpdate.value || !dialogTodoId.value) {
          throw new Error("The selected database does not allow updating todos.");
        }

        const current = todos.value.find((todo) => todo.id === dialogTodoId.value) ?? null;
        await options.selectedDatabase.value.documents.update(
          dialogTodoId.value,
          buildTodoPatch(current, {
            ...draft.value,
            subject: nextSubject,
          }),
        );
        await listAllTodos();
        setSelectedTodoIds([dialogTodoId.value]);
        options.setSuccess(`Saved todo "${nextSubject}".`);
      }

      dialogVisible.value = false;
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to save the todo.");
      throw error;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function deleteTodos(todoIds: string[]) {
    if (!options.selectedDatabase.value || !todoIds.length) {
      return;
    }
    if (!options.canDelete.value) {
      throw new Error("The selected database does not allow deleting todos.");
    }

    options.busyAction.value = todoIds.length > 1 ? "Deleting todos" : "Deleting todo";
    options.error.value = null;
    try {
      await Promise.all(todoIds.map((todoId) => options.selectedDatabase.value!.documents.delete(todoId)));
      await listAllTodos();
      clearSelection();
      options.setSuccess(todoIds.length > 1 ? `Deleted ${todoIds.length} todos.` : "Deleted todo.");
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to delete the selected todos.");
      throw error;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function deleteSelectedTodos() {
    await deleteTodos(selectedTodoIds.value);
  }

  async function moveTodos(todoIds: string[], quadrant: TodoQuadrant) {
    if (!options.selectedDatabase.value || !todoIds.length) {
      return;
    }
    if (!options.canUpdate.value) {
      throw new Error("The selected database does not allow updating todos.");
    }

    options.busyAction.value = todoIds.length > 1 ? "Moving todos" : "Moving todo";
    options.error.value = null;
    try {
      await Promise.all(todoIds.map(async (todoId) => {
        await options.selectedDatabase.value!.documents.update(todoId, {
          set: {
            quadrant,
            updatedAt: new Date().toISOString(),
          },
        });
      }));
      await listAllTodos();
      setSelectedTodoIds(todoIds);
      activeMobileQuadrant.value = quadrant;
      options.setSuccess(todoIds.length > 1 ? `Moved ${todoIds.length} todos.` : "Moved todo.");
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to move the selected todos.");
      throw error;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function moveSelectedTodos(quadrant: TodoQuadrant) {
    await moveTodos(selectedTodoIds.value, quadrant);
  }

  function beginDrag(todoId: string) {
    const ids = isSelected(todoId) ? [...selectedTodoIds.value] : [todoId];
    setSelectedTodoIds(ids);
    draggedTodoIds.value = ids;
    return ids;
  }

  function endDrag() {
    draggedTodoIds.value = [];
  }

  return {
    todos,
    selectedTodoIds,
    selectedTodoSet,
    selectedCount,
    selectedTodos,
    selectedQuadrants,
    draggedTodoIds,
    dialogVisible,
    dialogMode,
    dialogTodoId,
    draft,
    searchQuery,
    filterMode,
    sortMode,
    activeMobileQuadrant,
    filteredTodos,
    todosByQuadrant,
    mobileTodos,
    setSelectedTodoIds,
    clearSelection,
    isSelected,
    selectTodo,
    startCreateTodo,
    openTodo,
    closeDialog,
    setDraft,
    refreshTodos,
    saveDialogTodo,
    deleteTodos,
    deleteSelectedTodos,
    moveTodos,
    moveSelectedTodos,
    beginDrag,
    endDrag,
  };
}
