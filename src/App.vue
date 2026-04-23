<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Toast from "primevue/toast";
import { useToast } from "primevue/usetoast";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import AppBackground from "@/features/app-shell/components/AppBackground.vue";
import AppToolbar from "@/features/app-shell/components/AppToolbar.vue";
import TodoBoard from "@/features/board/components/TodoBoard.vue";
import TodoMobileBoard from "@/features/board/components/TodoMobileBoard.vue";
import TodoDialog from "@/features/todos/components/TodoDialog.vue";

const app = useTodoManagerApp();
const toast = useToast();

/** See AppBackground: per-slide heuristic for quote legibility on the frosted footer. */
const footerQuoteContrast = ref<"on-dark" | "on-bright">("on-dark");

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
  <AppBackground
    v-if="app.databases.value.length"
    @footer-quote-contrast="footerQuoteContrast = $event"
  />
  <main class="app-shell">
    <Toast group="todo-bottom" position="bottom-center" />
    <AppToolbar
      v-if="app.databases.value.length"
      :app="app"
    />

    <section class="content-shell glass-card glass-card--frost glass-card--frost-tinted">
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
          No database mapping is configured for this application yet. Please create a database mapping for the
          application in Haven.
        </Message>
      </div>

      <div
        v-else
        class="board-shell"
      >
        <TodoMobileBoard
          v-if="app.isCompactViewport.value"
          :app="app"
        />

        <TodoBoard
          v-else
          :app="app"
        />
      </div>
    </section>

    <footer
      v-if="app.databases.value.length"
      class="footer-bar glass-card glass-card--frost"
      :class="`footer-bar--quote-${footerQuoteContrast}`"
    >
      <span>Work from 1 to 4. Do the <em>ugliest</em> thing first. :-)</span>
    </footer>

    <TodoDialog :app="app" />
  </main>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
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

.status-view {
  display: grid;
  place-items: center;
  gap: 0.8rem;
  min-height: 18rem;
  text-align: center;
  color: var(--muted);
}

.board-shell {
  min-height: 0;
}

.footer-bar {
  position: sticky;
  bottom: 2px;
  z-index: 10;
  display: flex;
  justify-content: center;
  padding: 0.5rem 0.9rem;
  border-radius: 0;
  color: var(--muted);
  text-align: center;
}

.footer-bar em {
  font-style: italic;
}

/* Chosen from AppBackground slide – light copy on dim scenes, dark copy on bright ground/sky. */
.footer-bar--quote-on-dark {
  color: rgba(236, 240, 255, 0.9);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.footer-bar--quote-on-dark em {
  color: rgba(255, 255, 255, 0.95);
}

.footer-bar--quote-on-bright {
  color: rgba(16, 24, 42, 0.9);
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.25);
}

.footer-bar--quote-on-bright em {
  color: rgba(10, 16, 32, 0.95);
}
</style>
