/**
 * Offers TodoManager's agent tools to Haven once a session exists, and keeps
 * the agent context (shown databases, filter, selection) current.
 *
 * Hosts that predate agent tools have no `session.agent`; then nothing
 * happens. Whether agents can actually call the tools is Haven's decision
 * (global switch plus the per-app permission).
 */
import { abbreviateCanonicalName, type MindooDBAppDatabaseInfo, type MindooDBAppSession } from "mindoodb-app-sdk";
import { computed, watch, type ComputedRef, type Ref } from "vue";

import {
  createTodoAgentTools,
  toAgentTodo,
  type TodoAgentContext,
  type TodoAgentDeps,
} from "@/features/agent/todoAgentTools";
import type { TodoFilterMode, TodoItem, TodoQuadrant } from "@/features/todos/composables/todoTypes";
import type { useTodos } from "@/features/todos/composables/useTodos";

const CONTEXT_DEBOUNCE_MS = 300;

export function useTodoAgentTools(options: {
  session: Ref<MindooDBAppSession | null>;
  databases: Ref<MindooDBAppDatabaseInfo[]>;
  selectedDatabaseIds: Ref<string[]>;
  preferredDatabaseId: ComputedRef<string | null>;
  isTimeTravelActive: ComputedRef<boolean>;
  /** Canonical name of the signed-in user (CN=…/O=…). */
  userName: ComputedRef<string>;
  todos: ReturnType<typeof useTodos>;
}) {
  const { todos } = options;

  const userName = computed(() => {
    const raw = options.userName.value;
    return raw ? abbreviateCanonicalName(raw).split("/")[0] : "";
  });

  const context = computed<Omit<TodoAgentContext, "today" | "weekday">>(() => {
    const openCounts: Record<TodoQuadrant, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const todo of todos.todos.value) {
      if (!todo.completed) openCounts[todo.quadrant] += 1;
    }
    const dialogTodo =
      todos.dialogVisible.value && todos.dialogMode.value === "edit"
        ? (todos.todos.value.find((todo) => todo.selectionKey === todos.dialogTodoId.value) ?? null)
        : null;
    return {
      you: { name: userName.value },
      readOnly: options.isTimeTravelActive.value,
      databases: options.databases.value.map((info) => ({
        databaseId: info.id,
        title: info.title,
        shown: options.selectedDatabaseIds.value.includes(info.id),
        canCreate: info.capabilities.includes("create"),
      })),
      filter: todos.filterMode.value,
      search: todos.searchQuery.value,
      openTodos: openCounts,
      selected: todos.selectedTodos.value.slice(0, 50).map((todo) => toAgentTodo(todo)),
      openInDialog: dialogTodo ? toAgentTodo(dialogTodo) : null,
    };
  });

  const deps: TodoAgentDeps = {
    databases: () => options.databases.value,
    shownDatabaseIds: () => options.selectedDatabaseIds.value,
    defaultDatabaseId: () =>
      options.preferredDatabaseId.value &&
      options.databases.value.some(
        (info) => info.id === options.preferredDatabaseId.value && info.capabilities.includes("create"),
      )
        ? options.preferredDatabaseId.value
        : (options.databases.value.find((info) => info.capabilities.includes("create"))?.id ?? null),
    readOnly: () => options.isTimeTravelActive.value,
    loadTodos: async (databaseId): Promise<TodoItem[]> => await todos.listDatabaseTodos(databaseId),
    createTodos: async (inputs, label) => await todos.createTodos(inputs, label, true),
    editTodos: async (edits, label) => await todos.editTodos(edits, label, true),
    removeTodos: async (list, label) => await todos.removeTodos(list, label, true),
    undoSteps: () => todos.todoUndo.steps.value,
    undo: async (input) => await todos.todoUndo.undo({ ...input, byAgent: true }),
    redo: async (input) => await todos.todoUndo.redo(input),
    show: async ({ todoKeys, openKey, filter, quadrant }) => {
      if (filter) todos.filterMode.value = filter as TodoFilterMode;
      if (quadrant) todos.activeMobileQuadrant.value = quadrant;
      todos.setSelectedTodoIds(todoKeys);
      if (openKey) await todos.openTodo(openKey);
    },
    context: () => context.value,
    userName: () => userName.value,
  };
  const tools = createTodoAgentTools(deps);

  watch(
    options.session,
    (session) => {
      if (!session) {
        return;
      }
      if (!session.agent) {
        console.info("[TodoManager] This Haven offers no agent tools (it predates them); the AI tools stay off.");
        return;
      }
      session.agent
        .registerTools(tools)
        .then((registration) => {
          console.info(
            registration.enabled
              ? `[TodoManager] Offered ${registration.exposedNames.length} agent tools to Haven.`
              : `[TodoManager] Declared ${registration.exposedNames.length} agent tools; Haven does not offer them yet ` +
                  '(switch on "Agent tools" in Haven\'s settings and "Offer tools to AI agents" for TodoManager).',
            registration.exposedNames,
          );
        })
        .catch((error: unknown) => {
          console.warn("[TodoManager] Could not offer agent tools to Haven.", error);
        });
      void session.agent.setContext(context.value).catch(() => undefined);
    },
    { immediate: true },
  );

  let contextTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    () => JSON.stringify(context.value),
    () => {
      if (contextTimer) {
        clearTimeout(contextTimer);
      }
      contextTimer = setTimeout(() => {
        contextTimer = null;
        void options.session.value?.agent?.setContext(context.value).catch(() => undefined);
      }, CONTEXT_DEBOUNCE_MS);
    },
  );
}
