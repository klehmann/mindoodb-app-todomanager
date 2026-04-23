<script setup lang="ts">
import { computed, ref } from "vue";
import Dialog from "primevue/dialog";
import Menubar from "primevue/menubar";
import type { MenuItem } from "primevue/menuitem";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import { TODO_QUADRANTS, type TodoFilterMode, type TodoSortMode, type TodoSyncMode } from "@/features/todos/composables/todoTypes";

const props = defineProps<{
  app: ReturnType<typeof useTodoManagerApp>;
}>();

const helpDialogVisible = ref(false);
const searchPanelVisible = ref(false);

const refreshModeLabels: Record<TodoSyncMode, string> = {
  off: "Sync off",
  "10s": "Every 10 seconds",
  "30s": "Every 30 seconds",
  "60s": "Every 60 seconds",
};

const syncIndicatorVisible = computed(() => props.app.syncState.value === "syncing");

const filterOptions: Array<{ label: string; value: TodoFilterMode }> = [
  { label: "Open", value: "open" },
  { label: "Completed", value: "completed" },
  { label: "All", value: "all" },
];

const sortOptions: Array<{ label: string; value: TodoSortMode }> = [
  { label: "Recently updated", value: "updated-desc" },
  { label: "Due date", value: "due-asc" },
  { label: "Recently created", value: "created-desc" },
  { label: "Subject", value: "subject-asc" },
];

function refreshModeIcon(mode: TodoSyncMode) {
  return props.app.refreshMode.value === mode ? "pi pi-check" : undefined;
}

async function handleRecycle() {
  await props.app.deleteSelectedTodos();
}

async function handleManualRefresh() {
  await props.app.refreshNow();
}

async function handleQuadrantDrop(quadrant: 1 | 2 | 3 | 4, event: DragEvent) {
  event.preventDefault();
  await props.app.moveTodos(props.app.draggedTodoIds.value, quadrant);
  props.app.endDrag();
}

const sourcesMenuIconOff = "pi pi-check toolbar__sources-menu-icon--off";

async function toggleSourceDatabase(databaseId: string) {
  const ids = props.app.selectedDatabaseIds.value;
  const isOn = ids.includes(databaseId);
  if (isOn) {
    if (ids.length <= 1) {
      return;
    }
    await props.app.selectDatabases(ids.filter((id) => id !== databaseId));
    return;
  }
  await props.app.selectDatabases([...ids, databaseId]);
}

function toggleSearchPanel() {
  searchPanelVisible.value = !searchPanelVisible.value;
}

const menuItems = computed<MenuItem[]>(() => [
  {
    label: "New todo",
    icon: "pi pi-plus",
    disabled: !props.app.canCreateAny.value || props.app.isBusy.value,
    command: () => {
      props.app.startCreateTodo(props.app.activeMobileQuadrant.value);
    },
  },
  {
    label: "Selection",
    icon: "pi pi-list-check",
    items: [
      ...TODO_QUADRANTS.map((entry) => ({
        label: `Move to Q${entry.quadrant}`,
        icon: props.app.selectedQuadrants.value.length === 1 && props.app.selectedQuadrants.value[0] === entry.quadrant
          ? "pi pi-check"
          : undefined,
        disabled: !props.app.selectedCount.value || !props.app.canUpdateSelected.value,
        command: () => {
          void props.app.moveSelectedTodos(entry.quadrant);
        },
      })),
      {
        separator: true,
      },
      {
        label: "Delete selected",
        icon: "pi pi-trash",
        disabled: !props.app.selectedCount.value || !props.app.canDeleteSelected.value,
        command: () => {
          void handleRecycle();
        },
      },
    ],
  },
  {
    label: "Sync",
    icon: "pi pi-cloud",
    items: [
      {
        label: "Refresh now",
        icon: "pi pi-refresh",
        command: () => {
          void handleManualRefresh();
        },
      },
      {
        label: "Sync off",
        icon: refreshModeIcon("off"),
        command: () => {
          props.app.setRefreshMode("off");
        },
      },
      {
        label: "Every 10 seconds",
        icon: refreshModeIcon("10s"),
        command: () => {
          props.app.setRefreshMode("10s");
        },
      },
      {
        label: "Every 30 seconds",
        icon: refreshModeIcon("30s"),
        command: () => {
          props.app.setRefreshMode("30s");
        },
      },
      {
        label: "Every 60 seconds",
        icon: refreshModeIcon("60s"),
        command: () => {
          props.app.setRefreshMode("60s");
        },
      },
    ],
  },
  {
    label: "Sources",
    icon: "pi pi-database",
    items: [
      {
        label: "Filter",
        icon: "pi pi-filter",
        items: filterOptions.map((option) => ({
          label: option.label,
          icon: props.app.filterMode.value === option.value ? "pi pi-check" : sourcesMenuIconOff,
          command: () => {
            props.app.filterMode.value = option.value;
          },
        })),
      },
      {
        label: "Sort",
        icon: "pi pi-sort-amount-down",
        items: sortOptions.map((option) => ({
          label: option.label,
          icon: props.app.sortMode.value === option.value ? "pi pi-check" : sourcesMenuIconOff,
          command: () => {
            props.app.sortMode.value = option.value;
          },
        })),
      },
      {
        label: "Show search",
        icon: searchPanelVisible.value ? "pi pi-check" : sourcesMenuIconOff,
        command: () => {
          toggleSearchPanel();
        },
      },
      { separator: true },
      ...props.app.databases.value.map((database) => {
        const canRead = database.capabilities.includes("read");
        const selected = props.app.selectedDatabaseIds.value.includes(database.id);
        const base = {
          label: database.title,
          icon: canRead
            ? (selected ? "pi pi-check" : sourcesMenuIconOff)
            : sourcesMenuIconOff,
          disabled: !canRead || props.app.isBusy.value,
        };
        if (!canRead) {
          return base;
        }
        return {
          ...base,
          command: () => {
            void toggleSourceDatabase(database.id);
          },
        };
      }),
    ],
  },
  {
    label: "Help",
    icon: "pi pi-question-circle",
    items: [
      {
        label: "How TodoManager works",
        icon: "pi pi-info-circle",
        command: () => {
          helpDialogVisible.value = true;
        },
      },
    ],
  },
]);
</script>

<template>
  <header
    class="toolbar glass-card glass-card--frost"
    :class="{ 'toolbar--ios-multitasking': props.app.hostUiPreferences.value.iosMultitaskingOptimized }"
  >
    <div class="toolbar__menu-row">
      <Menubar :model="menuItems" class="toolbar__menubar">
        <template #end>
          <div
            v-if="syncIndicatorVisible"
            class="toolbar__sync-indicator"
            aria-label="Refreshing"
            title="Refreshing"
          >
            <i class="pi pi-sync pi-spin" aria-hidden="true" />
          </div>
        </template>
      </Menubar>
    </div>

    <Transition name="toolbar-search-panel">
      <div
        v-if="searchPanelVisible"
        class="toolbar__subrow"
      >
        <label class="toolbar__field toolbar__search">
          <span>Search</span>
          <input
            :value="props.app.searchQuery.value"
            type="search"
            class="native-input"
            placeholder="Filter todos..."
            @input="props.app.searchQuery.value = ($event.target as HTMLInputElement).value"
          />
        </label>
      </div>
    </Transition>

    <div
      v-if="props.app.isCompactViewport.value"
      class="toolbar__mobile-targets"
    >
      <button
        v-for="entry in TODO_QUADRANTS"
        :key="entry.quadrant"
        type="button"
        class="toolbar__mobile-quadrant"
        :class="{
          'toolbar__mobile-quadrant--active': props.app.activeMobileQuadrant.value === entry.quadrant,
          'toolbar__mobile-quadrant--drag-hover': props.app.todoPointerDragState.hoverQuadrant === entry.quadrant
            && props.app.todoPointerDragState.active,
        }"
        :data-todo-quadrant="entry.quadrant"
        @click="props.app.setMobileQuadrant(entry.quadrant)"
        @dragover.prevent
        @drop="handleQuadrantDrop(entry.quadrant, $event)"
      >
        {{ entry.quadrant }}
      </button>
    </div>
  </header>

  <Dialog
    v-model:visible="helpDialogVisible"
    modal
    header="How TodoManager Works"
    :style="{ width: '42rem', maxWidth: '96vw' }"
  >
    <div class="toolbar__help">
      <p>
        TodoManager follows the 4 quadrant method: do urgent and important work first, plan important work
        that is not due soon, delegate or batch less important urgent work, and reduce low-value work where
        possible.
      </p>
      <ul>
        <li><strong>1:</strong> Important and due soon</li>
        <li><strong>2:</strong> Important and not due soon</li>
        <li><strong>3:</strong> Not important and due soon</li>
        <li><strong>4:</strong> Not important and not due soon</li>
      </ul>
      <p>
        Use the Sources menu for filter, sort, showing search, and which databases to read from. Drag todos
        between quadrants to re-prioritize them, or drag them to the recycle bin to delete them.
      </p>
      <p>
        Double click the background of a quadrant on desktop, or double tap it on touch devices, to create a
        new todo with that quadrant preselected.
      </p>
    </div>
  </Dialog>
</template>

<style scoped>
.toolbar {
  position: sticky;
  top: 2px;
  z-index: 20;
  display: grid;
  gap: 0.65rem;
  padding: 0;
  border-radius: 0.6rem;
  backdrop-filter: blur(26px);
}

.toolbar--ios-multitasking :deep(.p-menubar-button) {
  margin-left: 80px;
}

.toolbar__menu-row {
  padding: 0.45rem 0.65rem 0.52rem;
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--bg) 64%, transparent);
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.07),
    0 10px 28px rgb(0 0 0 / 0.2);
}

:deep(.toolbar__menubar) {
  border: 0;
  background: transparent;
  padding: 0 2px;
}

:deep(.toolbar__menubar .p-menubar-root-list) {
  gap: 0.15rem;
}

:deep(.toolbar__menubar .p-menubar-item-content) {
  border-radius: 0.8rem;
}

.toolbar__menu-row :deep(.p-menubar-item-label),
.toolbar__menu-row :deep(.p-menubar-item-icon) {
  color: var(--text);
  text-shadow:
    0 0 1px rgb(255 255 255 / 0.3),
    0 1px 1px rgb(0 0 0 / 0.45),
    0 1px 6px rgb(0 0 0 / 0.16);
}

.toolbar__menu-row :deep(.p-menubar-item-link) {
  color: var(--text);
}

.toolbar__sync-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 999px;
  background: rgb(var(--primary-rgb) / 0.12);
  color: rgb(var(--primary-rgb));
}

.toolbar__sync-indicator i {
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35));
}

.toolbar__subrow {
  display: grid;
  grid-template-columns: minmax(15rem, 1fr);
  gap: 0.75rem;
  align-items: end;
  padding: 0.55rem 0.72rem 0.62rem;
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--bg) 64%, transparent);
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.07),
    0 10px 28px rgb(0 0 0 / 0.2);
  overflow: hidden;
}

.toolbar__field {
  display: grid;
  gap: 0.25rem;
}

.toolbar__field span {
  color: var(--text);
  font-size: 0.74rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-shadow:
    0 0 1px rgb(255 255 255 / 0.55),
    0 0 10px rgb(255 255 255 / 0.22),
    0 1px 2px rgb(0 0 0 / 0.75),
    0 2px 14px rgb(0 0 0 / 0.35);
}

:deep(.toolbar__sources-menu-icon--off) {
  visibility: hidden;
}

.toolbar__mobile-targets {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.1rem 0.12rem;
}

.toolbar__mobile-quadrant {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 2.9rem;
  padding: 0.7rem 0.95rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: rgb(255 255 255 / 0.03);
  color: inherit;
}

.toolbar__mobile-quadrant--active {
  border-color: var(--border-strong);
  background: rgb(var(--primary-rgb) / 0.14);
}

.toolbar__mobile-quadrant--drag-hover {
  border-color: rgb(var(--primary-rgb));
  background: rgb(var(--primary-rgb) / 0.2);
  box-shadow: 0 0 0 1px rgb(var(--primary-rgb) / 0.28);
}

.toolbar__help {
  display: grid;
  gap: 0.8rem;
}

.toolbar__help p,
.toolbar__help ul {
  margin: 0;
}

.toolbar__help ul {
  padding-left: 1.2rem;
}

.toolbar-search-panel-enter-active,
.toolbar-search-panel-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease,
    max-height 260ms ease,
    margin 260ms ease;
}

.toolbar-search-panel-enter-from,
.toolbar-search-panel-leave-to {
  opacity: 0;
  transform: translateY(-0.45rem);
  max-height: 0;
  margin-top: -0.25rem;
}

.toolbar-search-panel-enter-to,
.toolbar-search-panel-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 7rem;
  margin-top: 0;
}

@media (max-width: 720px) {
  .toolbar__mobile-targets {
    justify-content: space-between;
  }
}
</style>
