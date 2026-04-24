<script setup lang="ts">
import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import TodoQuadrant from "./TodoQuadrant.vue";
import TodoDragGhost from "./TodoDragGhost.vue";
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

    <TodoDragGhost :app="app" />
  </section>
</template>

<style scoped>
.board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  min-height: 0;
}

@media (max-width: 960px) {
  .board {
    grid-template-columns: 1fr;
  }
}
</style>
