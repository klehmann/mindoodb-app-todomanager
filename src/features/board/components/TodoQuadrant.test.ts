import { defineComponent, h, reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

import type { TodoItem } from "@/features/todos/composables/todoTypes";

import TodoQuadrant from "./TodoQuadrant.vue";

const contextMenuShow = vi.fn();
const contextMenuHide = vi.fn();

const ContextMenuStub = defineComponent({
  name: "ContextMenu",
  setup(_props, { expose }) {
    expose({
      show: contextMenuShow,
      hide: contextMenuHide,
    });
    return () => h("div", { class: "context-menu-stub" });
  },
});

function createAppStub(selectedIds: string[] = []) {
  return {
    selectedTodoIds: ref(selectedIds),
    draggedTodoIds: ref<string[]>([]),
    isSelected: vi.fn((todoId: string) => selectedIds.includes(todoId)),
    selectTodo: vi.fn(),
    openTodo: vi.fn(),
    beginDrag: vi.fn(() => selectedIds.length ? selectedIds : ["todo-1"]),
    endDrag: vi.fn(),
    moveTodos: vi.fn().mockResolvedValue(undefined),
    setTodosCompleted: vi.fn().mockResolvedValue(undefined),
    deleteTodos: vi.fn().mockResolvedValue(undefined),
    uploadTodoAttachments: vi.fn().mockResolvedValue(undefined),
    canManageTodoAttachments: vi.fn(() => true),
    getTodoAttachmentCount: vi.fn(() => 0),
    getTodoAttachmentTooltip: vi.fn(() => "No attachments"),
    isBusy: ref(false),
    launchContext: ref({ runtime: "window" }),
    session: ref(null),
    todoPointerDragState: reactive({
      hoverQuadrant: null as number | null,
      active: false,
    }),
    handleTodoPointerDown: vi.fn(),
    shouldSuppressTodoCardClick: vi.fn(() => false),
  } as any;
}

const todo: TodoItem = {
  id: "todo-1",
  databaseId: "main",
  selectionKey: "main:todo-1",
  subject: "Finish release notes",
  assignedTo: "Alex Example",
  description: "Wrap up the release summary",
  quadrant: 1,
  dueAt: "2026-04-24T00:00:00.000Z",
  startAt: "2026-04-23T00:00:00.000Z",
  completed: false,
  createdAt: null,
  updatedAt: null,
  attachmentCount: 0,
  attachments: [],
};

describe("TodoQuadrant", () => {
  it("uses the local context menu in standalone windows", async () => {
    contextMenuShow.mockClear();
    contextMenuHide.mockClear();
    const app = createAppStub();
    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 1,
          title: "Due Soon",
          subtitle: "Important",
        },
        todos: [todo],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    await wrapper.find(".todo-card").trigger("contextmenu", {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 20,
      clientY: 40,
    });

    expect(app.selectTodo).toHaveBeenCalledWith("main:todo-1");
    expect(contextMenuHide).toHaveBeenCalled();
    expect(contextMenuShow).toHaveBeenCalled();
  });

  it("uses the hosted menu inside Haven iframes", async () => {
    contextMenuShow.mockClear();
    contextMenuHide.mockClear();
    const show = vi.fn().mockResolvedValue({ action: "selected", itemId: "move:2" });
    const hide = vi.fn().mockResolvedValue(undefined);
    const app = createAppStub();
    app.launchContext = ref({ runtime: "iframe" });
    app.session = ref({ menus: { show, hide } });

    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 1,
          title: "Due Soon",
          subtitle: "Important",
        },
        todos: [todo],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    await wrapper.find(".todo-card").trigger("contextmenu", {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 30,
      clientY: 60,
    });

    expect(hide).toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(expect.objectContaining({
      kind: "context",
      items: expect.arrayContaining([
        expect.objectContaining({ id: "move:1", label: "Move to Q1" }),
        expect.objectContaining({ id: "toggle-completed", label: "Mark as completed" }),
        expect.objectContaining({ id: "properties", label: "Properties" }),
      ]),
    }));
    expect(app.moveTodos).toHaveBeenCalledWith(["main:todo-1"], 2);
    expect(contextMenuShow).not.toHaveBeenCalled();
  });

  it("dismisses hosted menus when the page background is clicked", async () => {
    const show = vi.fn().mockResolvedValue({ action: "dismissed", reason: "outside_click" });
    const hide = vi.fn().mockResolvedValue(undefined);
    const app = createAppStub();
    app.launchContext = ref({ runtime: "iframe" });
    app.session = ref({ menus: { show, hide } });

    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 1,
          title: "Due Soon",
          subtitle: "Important",
        },
        todos: [todo],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    await wrapper.find(".todo-card").trigger("contextmenu", {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 30,
      clientY: 60,
    });

    hide.mockClear();
    document.dispatchEvent(new MouseEvent("click"));

    expect(hide).toHaveBeenCalled();
  });

  it("starts the custom pointer drag flow from a todo card", async () => {
    const app = createAppStub(["main:todo-1", "main:todo-2"]);
    const PointerCtor = (window.PointerEvent ?? window.MouseEvent) as typeof MouseEvent;
    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 1,
          title: "Due Soon",
          subtitle: "Important",
        },
        todos: [todo],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    wrapper.find(".todo-card").element.dispatchEvent(new PointerCtor("pointerdown", {
      clientX: 20,
      clientY: 30,
    }));

    expect(app.handleTodoPointerDown).toHaveBeenCalledWith("main:todo-1", expect.anything());
  });

  it("uploads files dropped onto a todo card", async () => {
    const app = createAppStub();
    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 1,
          title: "Due Soon",
          subtitle: "Important",
        },
        todos: [todo],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    await wrapper.find(".todo-card").trigger("drop", {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        types: ["Files"],
        files: [{ name: "spec.pdf" }],
      },
    });

    expect(app.uploadTodoAttachments).toHaveBeenCalledWith("main:todo-1", expect.anything());
  });

  it("opens a new todo when the quadrant background is double clicked", async () => {
    const app = createAppStub();
    app.startCreateTodo = vi.fn();
    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 2,
          title: "Not Due Soon",
          subtitle: "Important",
        },
        todos: [],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    await wrapper.find("section.quadrant").trigger("dblclick");

    expect(app.startCreateTodo).toHaveBeenCalledWith(2);
  });

  it("renders assigned to and the date range when available", () => {
    const app = createAppStub();
    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 1,
          title: "Due Soon",
          subtitle: "Important",
        },
        todos: [todo],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    expect(wrapper.find(".todo-card__assigned").text()).toContain("Alex Example");
    expect(wrapper.find(".todo-card__date-range").text()).toContain(
      `${new Date(todo.startAt!).toLocaleDateString()} - ${new Date(todo.dueAt!).toLocaleDateString()}`,
    );
  });

  it("shows an attachment icon when attachments exist", () => {
    const app = createAppStub();
    app.getTodoAttachmentCount = vi.fn(() => 2);
    app.getTodoAttachmentTooltip = vi.fn(() => "brief.pdf (12 KB)\nphoto.jpg (2.1 MB)");
    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 1,
          title: "Due Soon",
          subtitle: "Important",
        },
        todos: [todo],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    expect(wrapper.find(".todo-card__attachment").exists()).toBe(true);
  });

  it("marks a todo as completed from the context menu action", async () => {
    const show = vi.fn().mockResolvedValue({ action: "selected", itemId: "toggle-completed" });
    const hide = vi.fn().mockResolvedValue(undefined);
    const app = createAppStub();
    app.launchContext = ref({ runtime: "iframe" });
    app.session = ref({ menus: { show, hide } });

    const wrapper = mount(TodoQuadrant, {
      props: {
        app,
        definition: {
          quadrant: 1,
          title: "Due Soon",
          subtitle: "Important",
        },
        todos: [todo],
      },
      global: {
        stubs: {
          ContextMenu: ContextMenuStub,
        },
      },
    });

    await wrapper.find(".todo-card").trigger("contextmenu", {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 30,
      clientY: 60,
    });

    expect(app.setTodosCompleted).toHaveBeenCalledWith(["main:todo-1"], true);
  });
});
