<script setup lang="ts">
import { computed, ref } from "vue";
import Dialog from "primevue/dialog";
import Menubar from "primevue/menubar";
import type { MenuItem } from "primevue/menuitem";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import { TODO_QUADRANTS, type TodoFilterMode, type TodoSortMode, type TodoSyncMode } from "@/features/todos/composables/todoTypes";
import { quadrantLabels, t, tn, type MessageKey } from "@/lib/i18n";

const props = defineProps<{
  app: ReturnType<typeof useTodoManagerApp>;
}>();

const helpDialogVisible = ref(false);
const searchPanelVisible = ref(false);

const syncIndicatorVisible = computed(() => props.app.syncState.value === "syncing");

const filterOptions: Array<{ label: MessageKey; value: TodoFilterMode }> = [
  { label: "filterOpen", value: "open" },
  { label: "filterCompleted", value: "completed" },
  { label: "filterAll", value: "all" },
];

const sortOptions: Array<{ label: MessageKey; value: TodoSortMode }> = [
  { label: "sortUpdated", value: "updated-desc" },
  { label: "sortDue", value: "due-asc" },
  { label: "sortCreated", value: "created-desc" },
  { label: "sortSubject", value: "subject-asc" },
];

const intervalModes: Array<{ mode: Exclude<TodoSyncMode, "off">; seconds: number }> = [
  { mode: "10s", seconds: 10 },
  { mode: "30s", seconds: 30 },
  { mode: "60s", seconds: 60 },
];

function quadrantButtonLabel(quadrant: 1 | 2 | 3 | 4) {
  return t("quadrantButton", { number: quadrant, ...quadrantLabels(quadrant) });
}

function refreshModeIcon(mode: TodoSyncMode) {
  return props.app.refreshMode.value === mode ? "pi pi-check" : undefined;
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

function createTodo() {
  props.app.startCreateTodo(props.app.activeMobileQuadrant.value);
}

const menuItems = computed<MenuItem[]>(() => [
  {
    label: t("menuSync"),
    icon: "pi pi-cloud",
    items: [
      {
        label: t("refreshNow"),
        icon: "pi pi-refresh",
        disabled: props.app.isTimeTravelActive.value,
        command: () => {
          void handleManualRefresh();
        },
      },
      {
        label: t("syncOff"),
        icon: refreshModeIcon("off"),
        command: () => {
          props.app.setRefreshMode("off");
        },
      },
      ...intervalModes.map(({ mode, seconds }) => ({
        label: tn("syncEvery", seconds),
        icon: refreshModeIcon(mode),
        disabled: props.app.isTimeTravelActive.value,
        command: () => {
          props.app.setRefreshMode(mode);
        },
      })),
    ],
  },
  {
    label: t("menuSources"),
    icon: "pi pi-database",
    items: [
      {
        label: t("menuFilter"),
        icon: "pi pi-filter",
        items: filterOptions.map((option) => ({
          label: t(option.label),
          icon: props.app.filterMode.value === option.value ? "pi pi-check" : sourcesMenuIconOff,
          command: () => {
            props.app.filterMode.value = option.value;
          },
        })),
      },
      {
        label: t("menuSort"),
        icon: "pi pi-sort-amount-down",
        items: sortOptions.map((option) => ({
          label: t(option.label),
          icon: props.app.sortMode.value === option.value ? "pi pi-check" : sourcesMenuIconOff,
          command: () => {
            props.app.sortMode.value = option.value;
          },
        })),
      },
      {
        label: t("showSearch"),
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
    label: t("menuHelp"),
    icon: "pi pi-question-circle",
    items: [
      {
        label: t("helpTitle"),
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
      <button
        type="button"
        class="toolbar__new-todo"
        :disabled="!props.app.canCreateAny.value || props.app.isBusy.value"
        @click="createTodo"
      >
        <i class="pi pi-plus" aria-hidden="true" />
        <span>{{ t("newTodo") }}</span>
      </button>
      <button
        type="button"
        class="toolbar__history-button"
        :title="t('undoShortcut')"
        :aria-label="t('undo')"
        :disabled="!props.app.todoUndo.canUndo.value || props.app.isBusy.value || props.app.isTimeTravelActive.value"
        @click="props.app.undoLastChange()"
      >
        <i class="pi pi-undo" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="toolbar__history-button"
        :title="t('redoShortcut')"
        :aria-label="t('redo')"
        :disabled="!props.app.todoUndo.canRedo.value || props.app.isBusy.value || props.app.isTimeTravelActive.value"
        @click="props.app.redoLastChange()"
      >
        <i class="pi pi-undo toolbar__redo-icon" aria-hidden="true" />
      </button>
      <Menubar :model="menuItems" class="toolbar__menubar">
        <template #end>
          <div
            v-if="syncIndicatorVisible"
            class="toolbar__sync-indicator"
            :aria-label="t('refreshing')"
            :title="t('refreshing')"
          >
            <i class="pi pi-sync pi-spin" aria-hidden="true" />
          </div>
        </template>
      </Menubar>
      <span
        v-if="props.app.isTimeTravelActive.value"
        class="toolbar__time-travel"
        :title="t('timeTravelTitle', { date: props.app.timeTravelDateLabel.value })"
      >
        {{ t("timeTravelBadge", { date: props.app.timeTravelDateLabel.value }) }}
      </span>
    </div>

    <Transition name="toolbar-search-panel">
      <div
        v-if="searchPanelVisible"
        class="toolbar__subrow"
      >
        <label class="toolbar__field toolbar__search">
          <span>{{ t("search") }}</span>
          <input
            :value="props.app.searchQuery.value"
            type="search"
            class="native-input"
            :placeholder="t('searchPlaceholder')"
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
        :aria-label="quadrantButtonLabel(entry.quadrant)"
        :title="quadrantButtonLabel(entry.quadrant)"
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
    :header="t('helpTitle')"
    :style="{ width: '42rem', maxWidth: '96vw' }"
  >
    <div class="toolbar__help">
      <p>{{ t("helpIntro") }}</p>
      <ul>
        <li><strong>1</strong> {{ t("helpQ1") }}</li>
        <li><strong>2</strong> {{ t("helpQ2") }}</li>
        <li><strong>3</strong> {{ t("helpQ3") }}</li>
        <li><strong>4</strong> {{ t("helpQ4") }}</li>
      </ul>
      <p>{{ t("helpUndo") }}</p>
      <p>{{ t("helpSources") }}</p>
      <p>{{ t("helpCreate") }}</p>
      <p>{{ t("helpTouch") }}</p>
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

.toolbar--ios-multitasking .toolbar__new-todo {
  margin-left: 80px;
}

.toolbar__menu-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.65rem 0.52rem;
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--bg) 64%, transparent);
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.07),
    0 10px 28px rgb(0 0 0 / 0.2);
}

.toolbar__new-todo {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.35rem;
  border: 0;
  border-radius: 0.8rem;
  padding: 0.5rem 0.8rem;
  background: rgb(var(--primary-rgb) / 0.16);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-shadow:
    0 0 1px rgb(255 255 255 / 0.3),
    0 1px 1px rgb(0 0 0 / 0.45),
    0 1px 6px rgb(0 0 0 / 0.16);
}

.toolbar__new-todo:hover:not(:disabled) {
  background: rgb(var(--primary-rgb) / 0.24);
}

.toolbar__new-todo:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.toolbar__history-button {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 2.35rem;
  border: 0;
  border-radius: 0.8rem;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.toolbar__history-button:hover:not(:disabled) {
  background: rgb(var(--primary-rgb) / 0.16);
}

.toolbar__redo-icon {
  transform: scaleX(-1);
}

.toolbar__history-button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

:deep(.toolbar__menubar) {
  flex: 1 1 auto;
  min-width: 0;
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

.toolbar__time-travel {
  flex: 0 0 auto;
  display: inline-flex;
  margin-left: auto;
  white-space: nowrap;
  border: 1px solid rgb(var(--primary-rgb) / 0.35);
  border-radius: 999px;
  padding: 0.22rem 0.55rem;
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 700;
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
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--bg) 64%, transparent);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.07),
    0 10px 28px rgb(0 0 0 / 0.2);
  color: var(--text);
  font-weight: 700;
  text-shadow:
    0 0 1px rgb(255 255 255 / 0.3),
    0 1px 1px rgb(0 0 0 / 0.48),
    0 1px 6px rgb(0 0 0 / 0.18);
}

.toolbar__mobile-quadrant--active {
  border-color: var(--border-strong);
  background:
    linear-gradient(135deg, rgb(var(--primary-rgb) / 0.14), rgb(var(--accent-rgb) / 0.08)),
    color-mix(in srgb, var(--bg) 64%, transparent);
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

/* The quadrant number before its description, without language-specific punctuation. */
.toolbar__help li strong {
  display: inline-block;
  min-width: 1.1em;
  margin-inline-end: 0.35em;
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
