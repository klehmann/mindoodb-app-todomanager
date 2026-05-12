<script setup lang="ts">
import { onMounted, watch } from "vue";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Toast from "primevue/toast";
import { useToast } from "primevue/usetoast";

import recyclePaperBasket from "@/assets/recycle-paper-basket.png";
import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import AppBackground from "@/features/app-shell/components/AppBackground.vue";
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

async function handleFooterRecycleDrop(event: DragEvent) {
  event.preventDefault();
  if (app.isTimeTravelActive.value) {
    return;
  }
  await app.deleteTodos(app.draggedTodoIds.value);
  app.endDrag();
}
</script>

<template>
  <AppBackground v-if="app.databases.value.length" />
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
    >
      <div class="footer-bar__main">
        <span class="footer-bar__text">
          Work from 1 to 4. Do the <em>ugliest</em> thing first. :-)
        </span>
      </div>
      <div
        class="footer-bar__recycle"
        :class="{ 'footer-bar__recycle--drag-hover': app.todoPointerDragState.hoverRecycle && app.todoPointerDragState.active }"
        data-todo-drop-target="recycle"
        aria-label="Recycle bin — drop todos here to delete them"
        title="Drop todos here to delete them"
        @dragover.prevent
        @drop="handleFooterRecycleDrop"
      >
        <img
          class="footer-bar__recycle-img"
          :src="recyclePaperBasket"
          width="256"
          height="256"
          alt=""
        />
      </div>
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
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.42rem 0.55rem 0.42rem 0.75rem;
  border-radius: 0.85rem;
  text-align: start;
}

/* Same tint chip + dual halo as the former quote-only panel; covers the whole footer bar. */
.footer-bar.glass-card--frost {
  background: color-mix(in srgb, var(--bg) 74%, transparent);
  backdrop-filter: blur(26px);
  -webkit-backdrop-filter: blur(26px);
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.05),
    0 1px 0 rgb(255 255 255 / 0.07),
    0 10px 28px rgb(0 0 0 / 0.2);
}

.footer-bar__main {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
}

.footer-bar__text {
  display: inline-block;
  max-width: min(56rem, 96vw);
  padding: 0.12rem 0.35rem;
  text-align: start;
  color: var(--text);
  text-shadow:
    0 0 1px rgb(255 255 255 / 0.3),
    0 1px 1px rgb(0 0 0 / 0.48),
    0 1px 6px rgb(0 0 0 / 0.18);
}

.footer-bar__text em {
  font-style: italic;
  color: inherit;
}

.footer-bar__recycle {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  /* Explicit square: avoid align-self:stretch + aspect-ratio flex sizing bugs (viewport-tall button). */
  width: 2.85rem;
  height: 2.85rem;
  padding: 0.2rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  cursor: default;
  transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease;
}

.footer-bar__recycle-img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
}

.footer-bar__recycle--drag-hover {
  transform: scale(1.05);
  filter: drop-shadow(0 8px 20px rgb(var(--primary-rgb) / 0.28));
}
</style>
