<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Menubar from "primevue/menubar";
import type { MenuItem } from "primevue/menuitem";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import { TODO_QUADRANTS, type TodoFilterMode, type TodoSortMode, type TodoSyncMode } from "@/features/todos/composables/todoTypes";

const props = defineProps<{
  app: ReturnType<typeof useTodoManagerApp>;
}>();

const refreshModeLabels: Record<TodoSyncMode, string> = {
  off: "Sync off",
  "10s": "Every 10 seconds",
  "30s": "Every 30 seconds",
  "60s": "Every 60 seconds",
};

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

const syncIconClass = computed(() => {
  if (props.app.syncState.value === "syncing") {
    return "pi pi-sync pi-spin";
  }
  if (props.app.syncState.value === "error") {
    return "pi pi-exclamation-triangle";
  }
  return props.app.refreshMode.value === "off" ? "pi pi-cloud" : "pi pi-clock";
});

const syncIndicatorLabel = computed(() => {
  if (props.app.syncState.value === "syncing") {
    return "Syncing";
  }
  if (props.app.syncState.value === "error") {
    return props.app.syncError.value ?? "Sync error";
  }
  return refreshModeLabels[props.app.refreshMode.value];
});

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

async function handleRecycleDrop(event: DragEvent) {
  event.preventDefault();
  await props.app.deleteTodos(props.app.draggedTodoIds.value);
  props.app.endDrag();
}

const menuItems = computed<MenuItem[]>(() => [
  {
    label: "File",
    icon: "pi pi-file",
    items: [
      {
        label: "New todo",
        icon: "pi pi-plus",
        disabled: !props.app.canCreate.value || props.app.isBusy.value,
        command: () => {
          props.app.startCreateTodo(props.app.activeMobileQuadrant.value);
        },
      },
      {
        label: "Refresh now",
        icon: "pi pi-refresh",
        command: () => {
          void handleManualRefresh();
        },
      },
    ],
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
        disabled: !props.app.selectedCount.value || !props.app.canUpdate.value,
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
        disabled: !props.app.selectedCount.value || !props.app.canDelete.value,
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
]);
</script>

<template>
  <header
    class="toolbar glass-card"
    :class="{ 'toolbar--ios-multitasking': props.app.hostUiPreferences.value.iosMultitaskingOptimized }"
  >
    <Menubar :model="menuItems" class="toolbar__menubar">
      <template #end>
        <div
          class="toolbar__sync-indicator"
          :class="`toolbar__sync-indicator--${props.app.syncState.value}`"
          :title="syncIndicatorLabel"
          :aria-label="syncIndicatorLabel"
        >
          <i :class="syncIconClass" aria-hidden="true" />
          <span class="toolbar__sync-text">{{ syncIndicatorLabel }}</span>
        </div>
      </template>
    </Menubar>

    <div class="toolbar__subrow">
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

      <label class="toolbar__field">
        <span>Filter</span>
        <select
          class="native-select"
          :value="props.app.filterMode.value"
          @change="props.app.filterMode.value = ($event.target as HTMLSelectElement).value as TodoFilterMode"
        >
          <option
            v-for="option in filterOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="toolbar__field">
        <span>Sort</span>
        <select
          class="native-select"
          :value="props.app.sortMode.value"
          @change="props.app.sortMode.value = ($event.target as HTMLSelectElement).value as TodoSortMode"
        >
          <option
            v-for="option in sortOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="toolbar__field">
        <span>Database</span>
        <select
          class="native-select"
          :value="props.app.selectedDatabaseId.value ?? ''"
          @change="props.app.selectDatabase(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="database in props.app.databases.value"
            :key="database.id"
            :value="database.id"
          >
            {{ database.title }}
          </option>
        </select>
      </label>

      <div
        v-if="props.app.isCompactViewport.value"
        class="toolbar__mobile-targets"
      >
        <button
          v-for="entry in TODO_QUADRANTS"
          :key="entry.quadrant"
          type="button"
          class="toolbar__mobile-quadrant"
          :class="{ 'toolbar__mobile-quadrant--active': props.app.activeMobileQuadrant.value === entry.quadrant }"
          @click="props.app.setMobileQuadrant(entry.quadrant)"
          @dragover.prevent
          @drop="handleQuadrantDrop(entry.quadrant, $event)"
        >
          {{ entry.quadrant }}
        </button>
      </div>

      <button
        type="button"
        class="toolbar__recycle"
        :disabled="!props.app.selectedCount.value && !props.app.draggedTodoIds.value.length"
        @click="handleRecycle"
        @dragover.prevent
        @drop="handleRecycleDrop"
      >
        <i class="pi pi-trash" aria-hidden="true" />
        <span>Recycle Bin</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  position: sticky;
  top: 2px;
  z-index: 20;
  display: grid;
  gap: 0.65rem;
  padding: 0.2rem;
  border-radius: 0.6rem;
  backdrop-filter: blur(26px);
}

.toolbar--ios-multitasking :deep(.p-menubar-button) {
  margin-left: 80px;
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

.toolbar__sync-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: rgb(var(--primary-rgb) / 0.12);
  color: rgb(var(--primary-rgb));
}

.toolbar__sync-indicator--error {
  background: rgb(var(--danger-rgb) / 0.14);
  color: var(--danger);
}

.toolbar__sync-indicator--syncing {
  background: rgb(var(--accent-rgb) / 0.14);
  color: var(--accent);
}

.toolbar__sync-text {
  font-size: 0.84rem;
  color: var(--muted);
}

.toolbar__subrow {
  display: grid;
  grid-template-columns: minmax(15rem, 1.3fr) repeat(3, minmax(10rem, 0.7fr)) auto;
  gap: 0.75rem;
  align-items: end;
  padding: 0 0.4rem 0.35rem;
}

.toolbar__field {
  display: grid;
  gap: 0.25rem;
}

.toolbar__field span {
  color: var(--muted);
  font-size: 0.74rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.toolbar__mobile-targets {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.toolbar__mobile-quadrant,
.toolbar__recycle {
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

.toolbar__recycle {
  justify-self: end;
}

.toolbar__recycle:disabled {
  opacity: 0.55;
}

@media (max-width: 1040px) {
  .toolbar__subrow {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar__recycle {
    justify-self: stretch;
  }
}

@media (max-width: 720px) {
  .toolbar__subrow {
    grid-template-columns: 1fr;
  }

  .toolbar__mobile-targets {
    justify-content: space-between;
  }

  .toolbar__sync-text {
    display: none;
  }
}
</style>
