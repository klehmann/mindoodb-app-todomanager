import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

import type { TodoSyncMode, TodoSyncState } from "@/features/todos/composables/todoTypes";
import { t } from "@/lib/i18n";

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function intervalForMode(mode: TodoSyncMode) {
  switch (mode) {
    case "10s":
      return 10_000;
    case "30s":
      return 30_000;
    case "60s":
      return 60_000;
    default:
      return null;
  }
}

export interface UsePeriodicSyncOptions {
  refreshMode: Ref<TodoSyncMode>;
  onSync: (reason: "manual" | "timer" | "initial") => Promise<void>;
}

export function usePeriodicSync(options: UsePeriodicSyncOptions) {
  const syncState = ref<TodoSyncState>("idle");
  const syncError = ref<string | null>(null);
  const lastSyncedAt = ref<string | null>(null);
  const refreshIntervalMs = computed(() => intervalForMode(options.refreshMode.value));

  let timer: ReturnType<typeof setInterval> | null = null;
  let syncPromise: Promise<boolean> | null = null;

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function runSync(reason: "manual" | "timer" | "initial") {
    if (syncPromise) {
      return syncPromise;
    }

    syncState.value = "syncing";
    syncError.value = null;

    syncPromise = options.onSync(reason)
      .then(() => {
        syncState.value = "idle";
        lastSyncedAt.value = new Date().toISOString();
        return true;
      })
      .catch((error: unknown) => {
        syncState.value = "error";
        syncError.value = readErrorMessage(error, t("syncFailed"));
        return false;
      })
      .finally(() => {
        syncPromise = null;
      });

    return syncPromise;
  }

  function startTimer() {
    clearTimer();
    const nextInterval = refreshIntervalMs.value;
    if (!nextInterval) {
      return;
    }

    timer = setInterval(() => {
      void runSync("timer");
    }, nextInterval);
  }

  function setRefreshMode(mode: TodoSyncMode) {
    options.refreshMode.value = mode;
  }

  watch(refreshIntervalMs, startTimer, { immediate: true });

  onBeforeUnmount(() => {
    clearTimer();
  });

  return {
    syncState,
    syncError,
    lastSyncedAt,
    runSync,
    setRefreshMode,
  };
}
