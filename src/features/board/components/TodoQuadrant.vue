<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ContextMenu from "primevue/contextmenu";
import type { MenuItem } from "primevue/menuitem";
import Tag from "primevue/tag";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import type { TodoItem, TodoQuadrantDefinition } from "@/features/todos/composables/todoTypes";

const props = defineProps<{
  app: ReturnType<typeof useTodoManagerApp>;
  definition: TodoQuadrantDefinition;
  todos: TodoItem[];
  compact?: boolean;
}>();

let lastBackgroundTouchTimestamp = 0;
const localContextMenuRef = ref<{ show: (event: MouseEvent) => void; hide: () => void } | null>(null);
const contextMenuTodo = ref<TodoItem | null>(null);
const fileDropTargetTodoKey = ref<string | null>(null);
const fileDragDepth = new Map<string, number>();
const canUseHostedContextMenu = computed(() =>
  props.app.launchContext.value?.runtime === "iframe" && Boolean(props.app.session.value?.menus),
);

type TodoContextMenuAction =
  | "move:1"
  | "move:2"
  | "move:3"
  | "move:4"
  | "toggle-completed"
  | "delete"
  | "properties";

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString();
}

function formatDateRange(startAt: string | null, dueAt: string | null) {
  const startLabel = formatDate(startAt);
  const dueLabel = formatDate(dueAt);

  if (startLabel && dueLabel) {
    return `${startLabel} - ${dueLabel}`;
  }

  return startLabel ?? dueLabel;
}

function handleCardClick(todoId: string, event: MouseEvent) {
  if (props.app.shouldSuppressTodoCardClick?.()) {
    return;
  }
  props.app.selectTodo(todoId, event.metaKey || event.ctrlKey);
}

function handleCheckboxClick(todoId: string) {
  props.app.selectTodo(todoId, true);
}

function dataTransferHasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === "Files") return true;
  }
  return false;
}

function clearTodoFileDragState() {
  fileDragDepth.clear();
  fileDropTargetTodoKey.value = null;
}

function canAcceptTodoFileDrop(todo: TodoItem) {
  return props.app.canManageTodoAttachments(todo.selectionKey) && !props.app.isBusy.value;
}

function handleTodoFileDragEnter(todo: TodoItem, event: DragEvent) {
  if (!dataTransferHasFiles(event) || !canAcceptTodoFileDrop(todo)) return;
  event.preventDefault();
  event.stopPropagation();
  const next = (fileDragDepth.get(todo.selectionKey) ?? 0) + 1;
  fileDragDepth.set(todo.selectionKey, next);
  fileDropTargetTodoKey.value = todo.selectionKey;
}

function handleTodoFileDragOver(todo: TodoItem, event: DragEvent) {
  if (!dataTransferHasFiles(event)) return;
  if (!canAcceptTodoFileDrop(todo)) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  fileDropTargetTodoKey.value = todo.selectionKey;
}

function handleTodoFileDragLeave(todo: TodoItem, event: DragEvent) {
  if (!dataTransferHasFiles(event)) return;
  const next = Math.max(0, (fileDragDepth.get(todo.selectionKey) ?? 0) - 1);
  if (next === 0) {
    fileDragDepth.delete(todo.selectionKey);
    if (fileDropTargetTodoKey.value === todo.selectionKey) {
      fileDropTargetTodoKey.value = null;
    }
  } else {
    fileDragDepth.set(todo.selectionKey, next);
  }
}

function handleTodoFileDrop(todo: TodoItem, event: DragEvent) {
  fileDragDepth.delete(todo.selectionKey);
  if (fileDropTargetTodoKey.value === todo.selectionKey) {
    fileDropTargetTodoKey.value = null;
  }
  if (!dataTransferHasFiles(event) || !canAcceptTodoFileDrop(todo)) return;
  event.preventDefault();
  event.stopPropagation();
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  clearTodoFileDragState();
  void props.app.uploadTodoAttachments(todo.selectionKey, files);
}

function getHostedMenuApi() {
  return props.app.session.value?.menus ?? null;
}

async function hideHostedContextMenu() {
  const menus = getHostedMenuApi();
  if (!canUseHostedContextMenu.value || !menus) {
    return;
  }

  try {
    await menus.hide();
  } catch (error) {
    console.warn("Failed to hide the hosted TodoManager context menu.", error);
  }
}

function buildHostedContextMenuItems(todo: TodoItem) {
  return [
    { id: "move:1", label: "Move to Q1" },
    { id: "move:2", label: "Move to Q2" },
    { id: "move:3", label: "Move to Q3" },
    { id: "move:4", label: "Move to Q4" },
    { separator: true },
    {
      id: "toggle-completed",
      label: todo.completed ? "Mark as not completed" : "Mark as completed",
    },
    { separator: true },
    { id: "delete", label: "Delete", destructive: true },
    { separator: true },
    { id: "properties", label: "Properties" },
  ] as const;
}

const localContextMenuItems = computed<MenuItem[]>(() => [
  {
    label: "Move to Q1",
    command: () => {
      void executeTodoContextMenuAction("move:1");
    },
  },
  {
    label: "Move to Q2",
    command: () => {
      void executeTodoContextMenuAction("move:2");
    },
  },
  {
    label: "Move to Q3",
    command: () => {
      void executeTodoContextMenuAction("move:3");
    },
  },
  {
    label: "Move to Q4",
    command: () => {
      void executeTodoContextMenuAction("move:4");
    },
  },
  {
    separator: true,
  },
  {
    label: contextMenuTodo.value?.completed ? "Mark as not completed" : "Mark as completed",
    command: () => {
      void executeTodoContextMenuAction("toggle-completed");
    },
  },
  {
    separator: true,
  },
  {
    label: "Delete",
    command: () => {
      void executeTodoContextMenuAction("delete");
    },
  },
  {
    separator: true,
  },
  {
    label: "Properties",
    command: () => {
      void executeTodoContextMenuAction("properties");
    },
  },
]);

async function executeTodoContextMenuAction(
  action: TodoContextMenuAction,
  todo = contextMenuTodo.value,
) {
  if (!todo) {
    return;
  }

  contextMenuTodo.value = null;

  switch (action) {
    case "move:1":
    case "move:2":
    case "move:3":
    case "move:4":
      await props.app.moveTodos([todo.selectionKey], Number(action.slice(-1)) as 1 | 2 | 3 | 4);
      break;
    case "toggle-completed":
      await props.app.setTodosCompleted([todo.selectionKey], !todo.completed);
      break;
    case "delete":
      await props.app.deleteTodos([todo.selectionKey]);
      break;
    case "properties":
      props.app.openTodo(todo.selectionKey);
      break;
    default:
      break;
  }
}

async function openHostedContextMenu(event: MouseEvent, todo: TodoItem) {
  const menus = getHostedMenuApi();
  if (!menus) {
    return false;
  }

  await hideHostedContextMenu();

  try {
    const result = await menus.show({
      anchor: {
        type: "point",
        x: event.clientX,
        y: event.clientY,
      },
      kind: "context",
        items: [...buildHostedContextMenuItems(todo)],
    });

    if (result.action === "selected" && "itemId" in result) {
      await executeTodoContextMenuAction(result.itemId as TodoContextMenuAction, todo);
    }
    return true;
  } catch (error) {
    console.warn("Falling back to the local TodoManager context menu.", error);
    return false;
  }
}

function openLocalContextMenu(event: MouseEvent, todo: TodoItem) {
  contextMenuTodo.value = todo;
  localContextMenuRef.value?.hide();
  localContextMenuRef.value?.show(event);
}

function dismissContextMenu() {
  contextMenuTodo.value = null;
  localContextMenuRef.value?.hide();
  void hideHostedContextMenu();
}

async function handleTodoContextMenu(todo: TodoItem, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  props.app.selectTodo(todo.selectionKey);

  if (canUseHostedContextMenu.value) {
    const openedHostedMenu = await openHostedContextMenu(event, todo);
    if (openedHostedMenu) {
      return;
    }
  }

  openLocalContextMenu(event, todo);
}

function isBackgroundInteractionTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !target.closest(".todo-card");
}

function openCreateFromBackground() {
  props.app.startCreateTodo(props.definition.quadrant);
}

function handleBackgroundDoubleClick(event: MouseEvent) {
  if (!isBackgroundInteractionTarget(event.target)) {
    return;
  }

  openCreateFromBackground();
}

function handleBackgroundPointerUp(event: PointerEvent) {
  if (event.pointerType !== "touch" || !isBackgroundInteractionTarget(event.target)) {
    return;
  }

  const now = Date.now();
  if (now - lastBackgroundTouchTimestamp < 320) {
    lastBackgroundTouchTimestamp = 0;
    openCreateFromBackground();
    return;
  }

  lastBackgroundTouchTimestamp = now;
}

onBeforeUnmount(() => {
  clearTodoFileDragState();
  dismissContextMenu();
});

onMounted(() => {
  document.addEventListener("click", dismissContextMenu);
  document.addEventListener("scroll", dismissContextMenu, true);
  document.addEventListener("drop", clearTodoFileDragState, true);
  document.addEventListener("dragend", clearTodoFileDragState, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", dismissContextMenu);
  document.removeEventListener("scroll", dismissContextMenu, true);
  document.removeEventListener("drop", clearTodoFileDragState, true);
  document.removeEventListener("dragend", clearTodoFileDragState, true);
});
</script>

<template>
  <section
    class="quadrant glass-card glass-card--frost"
    :class="{
      'quadrant--compact': compact,
      'quadrant--drop-target': props.app.todoPointerDragState.hoverQuadrant === props.definition.quadrant
        && props.app.todoPointerDragState.active,
    }"
    :data-todo-quadrant="definition.quadrant"
    @dblclick="handleBackgroundDoubleClick"
    @pointerdown.capture="dismissContextMenu"
    @pointerup="handleBackgroundPointerUp"
  >
    <header class="quadrant__header">
      <div class="quadrant__titles">
        <p class="panel__eyebrow quadrant__titles-eyebrow">
          {{ definition.subtitle }}
        </p>
        <h2 class="quadrant__titles-heading">
          {{ definition.title }}
        </h2>
      </div>
      <div class="quadrant__badge">
        {{ definition.quadrant }}
      </div>
    </header>

    <div class="quadrant__list">
      <article
        v-for="todo in todos"
        :key="todo.selectionKey"
        class="todo-card"
        :class="{
          'todo-card--selected': props.app.isSelected(todo.selectionKey),
          'todo-card--completed': todo.completed,
          'todo-card--dragging': props.app.draggedTodoIds.value.includes(todo.selectionKey),
          'todo-card--file-drop-target': fileDropTargetTodoKey === todo.selectionKey,
        }"
        @click="handleCardClick(todo.selectionKey, $event)"
        @dblclick="props.app.openTodo(todo.selectionKey)"
        @contextmenu.stop="handleTodoContextMenu(todo, $event)"
        @pointerdown="props.app.handleTodoPointerDown(todo.selectionKey, $event)"
        @dragenter="handleTodoFileDragEnter(todo, $event)"
        @dragover="handleTodoFileDragOver(todo, $event)"
        @dragleave="handleTodoFileDragLeave(todo, $event)"
        @drop="handleTodoFileDrop(todo, $event)"
      >
        <div class="todo-card__check">
          <input
            :checked="props.app.isSelected(todo.selectionKey)"
            type="checkbox"
            aria-label="Select todo"
            @pointerdown.stop
            @click.stop="handleCheckboxClick(todo.selectionKey)"
          />
        </div>

        <div class="todo-card__body">
          <div class="todo-card__title-row">
            <strong>{{ todo.subject || "Untitled todo" }}</strong>
            <div class="todo-card__badges">
              <span
                v-if="props.app.getTodoAttachmentCount(todo.selectionKey) > 0"
                v-tooltip.bottom="props.app.getTodoAttachmentTooltip(todo.selectionKey)"
                class="todo-card__attachment"
                tabindex="0"
              >
                <i class="pi pi-paperclip" aria-hidden="true" />
              </span>
              <Tag
                v-if="todo.completed"
                severity="success"
                value="Done"
              />
            </div>
          </div>

          <p
            v-if="todo.description"
            class="todo-card__description"
          >
            {{ todo.description }}
          </p>

          <p
            v-if="todo.assignedTo"
            class="todo-card__assigned"
          >
            {{ todo.assignedTo }}
          </p>

          <div class="todo-card__meta">
            <span
              v-if="formatDateRange(todo.startAt, todo.dueAt)"
              class="todo-card__date-range"
            >
              <i class="pi pi-calendar" aria-hidden="true" />
              <span>{{ formatDateRange(todo.startAt, todo.dueAt) }}</span>
            </span>
          </div>
        </div>
      </article>
    </div>

    <ContextMenu
      ref="localContextMenuRef"
      :model="localContextMenuItems"
      append-to="body"
    />
  </section>
</template>

<style scoped>
.quadrant {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.9rem;
  min-height: 0;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.08),
    0 10px 28px rgb(0 0 0 / 0.16);
}

.quadrant--drop-target {
  border-color: rgb(var(--primary-rgb) / 0.78);
  box-shadow:
    inset 0 0 0 1px rgb(var(--primary-rgb) / 0.4),
    0 0 0 1px rgb(var(--primary-rgb) / 0.24),
    0 14px 34px rgb(0 0 0 / 0.2);
}

.quadrant--compact {
  min-height: 48vh;
}

.quadrant__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
}

.quadrant__titles {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
  padding: 0.42rem 0.72rem;
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--bg) 64%, transparent);
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.07),
    0 10px 28px rgb(0 0 0 / 0.2);
}

.quadrant__titles-eyebrow {
  margin: 0;
}

.quadrant__titles-heading {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.22;
}

/* Dual-direction halo: readable on bright foliage or dark sky behind the glass. */
.quadrant__titles-eyebrow,
.quadrant__titles-heading {
  color: var(--text);
  text-shadow:
    0 0 1px rgb(255 255 255 / 0.3),
    0 1px 1px rgb(0 0 0 / 0.48),
    0 1px 6px rgb(0 0 0 / 0.18);
}

.quadrant__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 999px;
  background: color-mix(in srgb, rgb(var(--primary-rgb)) 22%, var(--bg));
  border: 1px solid rgb(255 255 255 / 0.12);
  color: rgb(var(--primary-rgb));
  font-weight: 700;
  text-shadow:
    0 0 1px rgb(255 255 255 / 0.35),
    0 1px 2px rgb(0 0 0 / 0.55);
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.18);
}

.quadrant__list {
  display: grid;
  align-content: start;
  gap: 0.7rem;
  min-height: 0;
  overflow: auto;
}

.todo-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  /* Opaque surface so titles/meta stay sharp; shell stays frosted. */
  background: var(--bg-elevated);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background 160ms ease;
}

.todo-card:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
}

.todo-card--selected {
  border-color: var(--border-strong);
  background:
    linear-gradient(135deg, rgb(var(--primary-rgb) / 0.22), rgb(var(--accent-rgb) / 0.16)),
    var(--bg-elevated);
}

.todo-card--completed {
  opacity: 0.76;
}

.todo-card--dragging {
  opacity: 0.42;
}

.todo-card--file-drop-target {
  border-color: rgb(var(--primary-rgb));
  background:
    linear-gradient(135deg, rgb(var(--primary-rgb) / 0.22), rgb(var(--primary-rgb) / 0.1)),
    var(--bg-elevated);
}

.todo-card__check {
  padding-top: 0.12rem;
}

.todo-card__body {
  display: grid;
  gap: 0.45rem;
}

.todo-card__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.todo-card__badges {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.todo-card__attachment {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 999px;
  color: var(--muted);
}

.todo-card__description {
  margin: 0;
  color: var(--muted);
  white-space: pre-wrap;
}

.todo-card__assigned {
  margin: 0;
  color: var(--text);
}

.todo-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 0.85rem;
  color: var(--muted);
  font-size: 0.8rem;
}

.todo-card__date-range {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

</style>
