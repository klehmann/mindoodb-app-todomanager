import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import type { TodoItem } from "@/features/todos/composables/todoTypes";

import TodoQuadrant from "./TodoQuadrant.vue";

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
  } as any;
}

const todo: TodoItem = {
  id: "todo-1",
  subject: "Finish release notes",
  description: "Wrap up the release summary",
  quadrant: 1,
  dueAt: null,
  startAt: null,
  completed: false,
  createdAt: null,
  updatedAt: null,
};

describe("TodoQuadrant", () => {
  it("sets up a ghost image when dragging a todo card", async () => {
    const app = createAppStub(["todo-1", "todo-2"]);
    const setData = vi.fn();
    const setDragImage = vi.fn();
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
    });

    await wrapper.find(".todo-card").trigger("dragstart", {
      dataTransfer: {
        setData,
        setDragImage,
      },
    });

    expect(app.beginDrag).toHaveBeenCalledWith("todo-1");
    expect(setData).toHaveBeenCalled();
    expect(setDragImage).toHaveBeenCalled();
  });
});
