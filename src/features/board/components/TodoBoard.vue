<script setup lang="ts">
import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import TodoQuadrant from "./TodoQuadrant.vue";
import { TODO_QUADRANTS } from "@/features/todos/composables/todoTypes";

defineProps<{
  app: ReturnType<typeof useTodoManagerApp>;
}>();
</script>

<template>
  <section class="board">
    <TodoQuadrant
      v-for="definition in TODO_QUADRANTS"
      :key="definition.quadrant"
      :app="app"
      :definition="definition"
      :todos="app.todosByQuadrant.value[definition.quadrant]"
    />

    <Teleport to="body">
      <div
        v-if="app.dragPreviewTodo.value && app.todoPointerDragState.active"
        class="todo-drag-ghost"
        :style="app.dragPreviewStyle.value"
      >
        <div class="todo-drag-ghost__top">
          <div class="todo-drag-ghost__content">
            <header class="todo-drag-ghost__header">
              <strong>{{ app.dragPreviewTodo.value.subject || "Untitled todo" }}</strong>
            </header>
            <p
              v-if="app.dragPreviewTodo.value.description"
              class="todo-drag-ghost__description"
            >
              {{ app.dragPreviewTodo.value.description }}
            </p>
          </div>
          <span
            v-if="app.draggedTodoIds.value.length > 1"
            class="todo-drag-ghost__count"
          >
            +{{ app.draggedTodoIds.value.length - 1 }}
          </span>
        </div>

        <div class="todo-drag-ghost__meta">
          <span v-if="app.dragPreviewTodo.value.assignedTo">{{ app.dragPreviewTodo.value.assignedTo }}</span>
          <span v-if="app.dragPreviewTodo.value.dueAt">
            Due {{ new Date(app.dragPreviewTodo.value.dueAt).toLocaleDateString() }}
          </span>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  min-height: 0;
}

.todo-drag-ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 35;
  width: min(20rem, 72vw);
  pointer-events: none;
  display: grid;
  gap: 0.7rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid rgb(255 255 255 / 0.16);
  border-radius: 1rem;
  background: rgb(18 28 44 / 0.92);
  backdrop-filter: blur(18px);
  box-shadow: 0 20px 42px rgb(0 0 0 / 0.28);
  color: rgb(245 247 255);
  transform-origin: top left;
}

.todo-drag-ghost__top {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 0;
}

.todo-drag-ghost__content {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.45rem;
}

.todo-drag-ghost__header strong {
  display: block;
  font-size: 1rem;
  line-height: 1.35;
}

.todo-drag-ghost__description {
  margin: 0;
  color: rgb(226 232 240 / 0.9);
  font-size: 0.92rem;
  line-height: 1.45;
}

.todo-drag-ghost__count {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.9rem;
  height: 1.9rem;
  padding: 0 0.55rem;
  border-radius: 999px;
  background: rgb(var(--primary-rgb) / 0.22);
  color: rgb(255 255 255 / 0.95);
  font-size: 0.84rem;
  font-weight: 700;
}

.todo-drag-ghost__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: rgb(226 232 240 / 0.84);
  font-size: 0.84rem;
}

@media (max-width: 960px) {
  .board {
    grid-template-columns: 1fr;
  }
}
</style>
