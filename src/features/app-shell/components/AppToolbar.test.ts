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
    databases: ref([{ id: "main", title: "Main", capabilities: ["read", "create"] }]),
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
          Dialog: DialogStub,
        },
      },
    });

    expect(wrapper.find("header").classes()).toContain("toolbar--ios-multitasking");
  });

  it("shows the sync spinner only while syncing (Vega-style)", async () => {
    const app = createAppStub();
    const wrapper = mount(AppToolbar, {
      props: {
        app,
      },
      global: {
        stubs: {
          Menubar: MenubarStub,
          Dialog: DialogStub,
        },
      },
    });

    expect(wrapper.find(".toolbar__sync-indicator").exists()).toBe(false);

    app.syncState.value = "syncing";
    await nextTick();
    const indicator = wrapper.find(".toolbar__sync-indicator");
    expect(indicator.exists()).toBe(true);
    expect(indicator.attributes("aria-label")).toBe("Refreshing");
    expect(indicator.find("i.pi-sync.pi-spin").exists()).toBe(true);

    app.syncState.value = "error";
    app.syncError.value = "Sync failed";
    await nextTick();
    expect(wrapper.find(".toolbar__sync-indicator").exists()).toBe(false);

    app.syncState.value = "idle";
    await nextTick();
    expect(wrapper.find(".toolbar__sync-indicator").exists()).toBe(false);
  });
});
