<script setup lang="ts">
import Tag from "primevue/tag";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import type { TodoItem, TodoQuadrantDefinition } from "@/features/todos/composables/todoTypes";

const props = defineProps<{
  app: ReturnType<typeof useTodoManagerApp>;
  definition: TodoQuadrantDefinition;
  todos: TodoItem[];
  compact?: boolean;
}>();

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

function createGhostImage(count: number, subject: string) {
  const node = document.createElement("div");
  node.style.position = "fixed";
  node.style.top = "-1000px";
  node.style.left = "-1000px";
  node.style.padding = "0.75rem 1rem";
  node.style.borderRadius = "16px";
  node.style.background = "rgba(12, 18, 34, 0.92)";
  node.style.border = "1px solid rgba(212, 160, 23, 0.34)";
  node.style.color = "#eef2ff";
  node.style.font = "600 14px Inter, system-ui, sans-serif";
  node.style.boxShadow = "0 18px 38px rgba(1, 5, 16, 0.35)";
  node.textContent = count > 1 ? `${count} todos` : subject;
  document.body.appendChild(node);
  requestAnimationFrame(() => {
    node.remove();
  });
  return node;
}

function handleCardClick(todoId: string, event: MouseEvent) {
  props.app.selectTodo(todoId, event.metaKey || event.ctrlKey);
}

function handleCheckboxClick(todoId: string) {
  props.app.selectTodo(todoId, true);
}

function handleDragStart(todo: TodoItem, event: DragEvent) {
  const ids = props.app.beginDrag(todo.id);
  if (!event.dataTransfer) {
    return;
  }

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify(ids));
  event.dataTransfer.setData("application/x-mindoodb-todos", JSON.stringify(ids));
  event.dataTransfer.setDragImage(createGhostImage(ids.length, todo.subject), 18, 18);
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  await props.app.moveTodos(props.app.draggedTodoIds.value, props.definition.quadrant);
  props.app.endDrag();
}
</script>

<template>
  <section
    class="quadrant glass-card"
    :class="{ 'quadrant--compact': compact }"
    @dragover.prevent
    @drop="handleDrop"
  >
    <header class="quadrant__header">
      <div>
        <p class="panel__eyebrow">
          {{ definition.subtitle }}
        </p>
        <h2>{{ definition.title }}</h2>
      </div>
      <div class="quadrant__badge">
        {{ definition.quadrant }}
      </div>
    </header>

    <div
      v-if="!todos.length"
      class="quadrant__empty"
    >
      No todos here.
    </div>

    <div
      v-else
      class="quadrant__list"
    >
      <article
        v-for="todo in todos"
        :key="todo.id"
        class="todo-card"
        :class="{
          'todo-card--selected': props.app.isSelected(todo.id),
          'todo-card--completed': todo.completed,
          'todo-card--dragging': props.app.draggedTodoIds.value.includes(todo.id),
        }"
        draggable="true"
        @click="handleCardClick(todo.id, $event)"
        @dblclick="props.app.openTodo(todo.id)"
        @dragstart="handleDragStart(todo, $event)"
        @dragend="props.app.endDrag()"
      >
        <div class="todo-card__check">
          <input
            :checked="props.app.isSelected(todo.id)"
            type="checkbox"
            aria-label="Select todo"
            @click.stop="handleCheckboxClick(todo.id)"
          />
        </div>

        <div class="todo-card__body">
          <div class="todo-card__title-row">
            <strong>{{ todo.subject || "Untitled todo" }}</strong>
            <Tag
              v-if="todo.completed"
              severity="success"
              value="Done"
            />
          </div>

          <p
            v-if="todo.description"
            class="todo-card__description"
          >
            {{ todo.description }}
          </p>

          <div class="todo-card__meta">
            <span v-if="formatDate(todo.dueAt)">Due {{ formatDate(todo.dueAt) }}</span>
            <span v-if="formatDate(todo.startAt)">Start {{ formatDate(todo.startAt) }}</span>
            <span v-if="formatDate(todo.updatedAt)">Updated {{ formatDate(todo.updatedAt) }}</span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.quadrant {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.9rem;
  min-height: 0;
  padding: 1rem;
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

.quadrant__header h2 {
  margin: 0.15rem 0 0;
  font-size: 1.08rem;
}

.quadrant__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 999px;
  background: rgb(var(--primary-rgb) / 0.12);
  color: rgb(var(--primary-rgb));
  font-weight: 700;
}

.quadrant__empty {
  display: grid;
  place-items: center;
  min-height: 10rem;
  color: var(--muted);
  border: 1px dashed var(--border);
  border-radius: 1rem;
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
  background: rgb(255 255 255 / 0.03);
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.todo-card:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
}

.todo-card--selected {
  border-color: var(--border-strong);
  background: linear-gradient(135deg, rgb(var(--primary-rgb) / 0.14), rgb(var(--accent-rgb) / 0.12));
}

.todo-card--completed {
  opacity: 0.76;
}

.todo-card--dragging {
  opacity: 0.42;
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

.todo-card__description {
  margin: 0;
  color: var(--muted);
  white-space: pre-wrap;
}

.todo-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 0.85rem;
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
