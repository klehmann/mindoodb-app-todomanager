import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import type { TodoFilterMode, TodoSortMode, TodoSyncMode } from "@/features/todos/composables/todoTypes";

import AppToolbar from "./AppToolbar.vue";

const MenubarStub = defineComponent({
  props: {
    model: {
      type: Array,
      required: false,
      default: () => [],
    },
  },
  template: `
    <div class="menubar-stub">
      <slot name="start" />
      <slot />
      <slot name="end" />
    </div>
  `,
});

const MultiSelectStub = defineComponent({
  props: {
    modelValue: {
      type: Array,
      required: false,
      default: () => [],
    },
  },
  template: `<div class="multiselect-stub">{{ modelValue.join(",") }}</div>`,
});

const DialogStub = defineComponent({
  template: `<div class="dialog-stub"><slot /></div>`,
});

function createAppStub() {
  return {
    hostUiPreferences: ref({ iosMultitaskingOptimized: true }),
    syncState: ref<"idle" | "syncing" | "error">("idle"),
    syncError: ref<string | null>(null),
    refreshMode: ref<TodoSyncMode>("30s"),
    searchQuery: ref(""),
    filterMode: ref<TodoFilterMode>("open"),
    sortMode: ref<TodoSortMode>("updated-desc"),
    selectedDatabaseIds: ref(["main"]),
    databases: ref([{ id: "main", title: "Main" }]),
    canCreateAny: ref(true),
    canUpdateSelected: ref(true),
    canDeleteSelected: ref(true),
    isBusy: ref(false),
    selectedCount: ref(0),
    selectedQuadrants: ref<number[]>([]),
    activeMobileQuadrant: ref(1),
    isCompactViewport: ref(false),
    draggedTodoIds: ref<string[]>([]),
    startCreateTodo: vi.fn(),
    refreshNow: vi.fn().mockResolvedValue(true),
    moveSelectedTodos: vi.fn().mockResolvedValue(undefined),
    deleteSelectedTodos: vi.fn().mockResolvedValue(undefined),
    deleteTodos: vi.fn().mockResolvedValue(undefined),
    endDrag: vi.fn(),
    setRefreshMode: vi.fn(),
    setMobileQuadrant: vi.fn(),
    selectDatabases: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("AppToolbar", () => {
  it("applies the iOS multitasking class when requested by the host", () => {
    const wrapper = mount(AppToolbar, {
      props: {
        app: createAppStub(),
      },
      global: {
        stubs: {
          Menubar: MenubarStub,
          MultiSelect: MultiSelectStub,
          Dialog: DialogStub,
        },
      },
    });

    expect(wrapper.find("header").classes()).toContain("toolbar--ios-multitasking");
  });

  it("updates the sync indicator across idle, syncing, and error states", async () => {
    const app = createAppStub();
    const wrapper = mount(AppToolbar, {
      props: {
        app,
      },
      global: {
        stubs: {
          Menubar: MenubarStub,
          MultiSelect: MultiSelectStub,
          Dialog: DialogStub,
        },
      },
    });

    expect(wrapper.find(".toolbar__sync-indicator").text()).toContain("Every 30 seconds");

    app.syncState.value = "syncing";
    await nextTick();
    expect(wrapper.find(".toolbar__sync-indicator").text()).toContain("Syncing");
    expect(wrapper.find(".toolbar__sync-indicator").classes()).toContain("toolbar__sync-indicator--syncing");

    app.syncState.value = "error";
    app.syncError.value = "Sync failed";
    await nextTick();
    expect(wrapper.find(".toolbar__sync-indicator").text()).toContain("Sync failed");
    expect(wrapper.find(".toolbar__sync-indicator").classes()).toContain("toolbar__sync-indicator--error");
  });
});
