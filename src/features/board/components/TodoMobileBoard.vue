<script setup lang="ts">
import { computed } from "vue";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import TodoDragGhost from "./TodoDragGhost.vue";
import TodoQuadrant from "./TodoQuadrant.vue";
import { quadrantDefinition } from "@/features/todos/composables/todoTypes";

const props = defineProps<{
  app: ReturnType<typeof useTodoManagerApp>;
}>();

const activeDefinition = computed(() => quadrantDefinition(props.app.activeMobileQuadrant.value));
</script>

<template>
  <section class="mobile-board">
    <TodoQuadrant
      :app="app"
      :definition="activeDefinition"
      :todos="app.mobileTodos.value"
      compact
    />
    <TodoDragGhost :app="app" />
  </section>
</template>

<style scoped>
.mobile-board {
  min-height: 0;
}
</style>
