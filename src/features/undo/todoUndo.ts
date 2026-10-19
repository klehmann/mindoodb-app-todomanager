/**
 * Undo and redo for todo changes, from the UI and from AI agents alike.
 *
 * Every write records one step: the todos it touched with their stored fields
 * before and after (`null` = the todo did not exist / was deleted). Undo writes
 * the "before" state back, redo the "after" state; a deleted todo comes back
 * with `undelete`, so it keeps its id. The history lives for this session only.
 */
import type { MindooDBAppDatabase } from "mindoodb-app-sdk";
import { computed, ref } from "vue";

import type { TodoSnapshot } from "@/features/todos/composables/todoTypes";
import { toStoredTodoFields } from "@/features/todos/composables/todoStoredValues";
import { t } from "@/lib/i18n";

export type TodoChange = {
  databaseId: string;
  todoId: string;
  /** For labels in the history, e.g. the subject before or after. */
  subject: string;
  before: TodoSnapshot | null;
  after: TodoSnapshot | null;
};

export type TodoUndoStep = {
  id: string;
  label: string;
  byAgent: boolean;
  at: string;
  changes: TodoChange[];
  undone: boolean;
};

/** An agent tried to undo past a step the user made, without saying so. */
export class TodoUndoRefusedError extends Error {
  constructor(readonly userSteps: TodoUndoStep[]) {
    super("Undoing this would also take back changes the user made.");
  }
}

const MAX_STEPS = 50;

export function createTodoUndo(options: {
  getDatabase: (databaseId: string) => Promise<MindooDBAppDatabase | null>;
  /** Called after undo/redo wrote to the databases, e.g. to reload the board. */
  afterApply: () => Promise<void>;
}) {
  const steps = ref<TodoUndoStep[]>([]);
  let counter = 0;

  const canUndo = computed(() => steps.value.some((step) => !step.undone));
  const canRedo = computed(() => steps.value.some((step) => step.undone));

  function record(label: string, changes: TodoChange[], byAgent = false): TodoUndoStep | null {
    if (!changes.length) {
      return null;
    }
    counter += 1;
    const step: TodoUndoStep = {
      id: `u${Date.now().toString(36)}${counter}`,
      label,
      byAgent,
      at: new Date().toISOString(),
      changes,
      undone: false,
    };
    // A new change ends the redo branch, like in any editor.
    steps.value = [...steps.value.filter((entry) => !entry.undone), step].slice(-MAX_STEPS);
    return step;
  }

  async function writeState(change: TodoChange, target: TodoSnapshot | null, current: TodoSnapshot | null) {
    const database = await options.getDatabase(change.databaseId);
    if (!database) {
      throw new Error(t("undoDatabaseMissing"));
    }
    if (target === null) {
      await database.documents.delete(change.todoId);
      return;
    }
    if (current === null) {
      await database.documents.undelete(change.todoId);
    }
    await database.documents.update(change.todoId, {
      set: toStoredTodoFields({ ...target, updatedAt: new Date().toISOString() }),
    });
  }

  async function applySteps(targets: TodoUndoStep[], direction: "undo" | "redo") {
    for (const step of targets) {
      const changes = direction === "undo" ? [...step.changes].reverse() : step.changes;
      for (const change of changes) {
        if (direction === "undo") {
          await writeState(change, change.before, change.after);
        } else {
          await writeState(change, change.after, change.before);
        }
      }
      steps.value = steps.value.map((entry) =>
        entry.id === step.id ? { ...entry, undone: direction === "undo" } : entry,
      );
    }
    await options.afterApply();
    return targets;
  }

  /**
   * Undoes the newest step, or `stepId` and every newer step. With `byAgent`,
   * steps the user made are only undone when `includeUserSteps` says so.
   */
  async function undo(input: { stepId?: string; byAgent?: boolean; includeUserSteps?: boolean } = {}) {
    const done = steps.value.filter((step) => !step.undone);
    let targets: TodoUndoStep[];
    if (input.stepId) {
      const index = done.findIndex((step) => step.id === input.stepId);
      if (index < 0) {
        throw new Error(`There is no undoable step "${input.stepId}".`);
      }
      targets = done.slice(index).reverse();
    } else {
      targets = done.slice(-1);
    }
    if (!targets.length) {
      return [];
    }
    const userSteps = targets.filter((step) => !step.byAgent);
    if (input.byAgent && userSteps.length && !input.includeUserSteps) {
      throw new TodoUndoRefusedError(userSteps);
    }
    return await applySteps(targets, "undo");
  }

  /** Redoes the step undone last, or every undone step up to `stepId`. */
  async function redo(input: { stepId?: string } = {}) {
    const undone = steps.value.filter((step) => step.undone);
    let targets: TodoUndoStep[];
    if (input.stepId) {
      const index = undone.findIndex((step) => step.id === input.stepId);
      if (index < 0) {
        throw new Error(`There is no redoable step "${input.stepId}".`);
      }
      targets = undone.slice(0, index + 1);
    } else {
      targets = undone.slice(0, 1);
    }
    if (!targets.length) {
      return [];
    }
    return await applySteps(targets, "redo");
  }

  return { steps, canUndo, canRedo, record, undo, redo };
}

export type TodoUndo = ReturnType<typeof createTodoUndo>;
