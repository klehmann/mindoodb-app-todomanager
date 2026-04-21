<script setup lang="ts">
import { onMounted, watch } from "vue";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Toast from "primevue/toast";
import { useToast } from "primevue/usetoast";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import AppToolbar from "@/features/app-shell/components/AppToolbar.vue";
import TodoBoard from "@/features/board/components/TodoBoard.vue";
import TodoMobileBoard from "@/features/board/components/TodoMobileBoard.vue";
import TodoDialog from "@/features/todos/components/TodoDialog.vue";

const app = useTodoManagerApp();
const toast = useToast();

watch(
  () => app.error.value,
  (message) => {
    if (!message) {
      return;
    }

    toast.add({
      severity: "warn",
      summary: "To Do Manager",
      detail: message,
      life: 3200,
      group: "todo-bottom",
    });
  },
);

watch(
  () => app.successMessage.value,
  (message) => {
    if (!message) {
      return;
    }

    toast.add({
      severity: "success",
      summary: "To Do Manager",
      detail: message,
      life: 2200,
      group: "todo-bottom",
    });
  },
);

onMounted(() => {
  void app.connect();
});
</script>

<template>
  <main class="app-shell">
    <Toast group="todo-bottom" position="bottom-center" />
    <AppToolbar :app="app" />

    <section class="content-shell glass-card">
      <div
        v-if="app.loading.value && !app.filteredTodos.value.length"
        class="status-view"
      >
        <ProgressSpinner stroke-width="4" />
        <p>Loading todos...</p>
      </div>

      <div
        v-else-if="!app.databases.value.length"
        class="status-view"
      >
        <Message severity="info">
          No database mapping is available for this app yet.
        </Message>
      </div>

      <div
        v-else
        class="board-shell"
      >
        <div
          v-if="!app.filteredTodos.value.length"
          class="empty-board"
        >
          <h2>No todos match the current view.</h2>
          <p>
            Adjust the search or filters, or create a new todo to get started.
          </p>
        </div>

        <TodoMobileBoard
          v-else-if="app.isCompactViewport.value"
          :app="app"
        />

        <TodoBoard
          v-else
          :app="app"
        />
      </div>
    </section>

    <TodoDialog :app="app" />
  </main>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 2px;
  margin: 0 auto;
  max-width: 100%;
  min-height: 100dvh;
  padding: 2px;
}

.content-shell {
  min-height: 0;
  padding: 0.95rem;
}

.status-view,
.empty-board {
  display: grid;
  place-items: center;
  gap: 0.8rem;
  min-height: 18rem;
  text-align: center;
  color: var(--muted);
}

.empty-board h2 {
  margin: 0;
  color: var(--text);
}

.empty-board p {
  margin: 0;
  max-width: 32rem;
}

.board-shell {
  min-height: 0;
}
</style>
