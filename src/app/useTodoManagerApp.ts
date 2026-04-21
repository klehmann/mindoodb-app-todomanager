import { computed, onBeforeUnmount, ref } from "vue";
import {
  createMindooDBAppBridge,
  type MindooDBAppDatabase,
  type MindooDBAppDatabaseInfo,
  type MindooDBAppHostTheme,
  type MindooDBAppLaunchContext,
  type MindooDBAppSession,
  type MindooDBAppUiPreferences,
  type MindooDBAppViewport,
} from "mindoodb-app-sdk";

import { usePeriodicSync } from "@/features/sync/composables/usePeriodicSync";
import { useTodos } from "@/features/todos/composables/useTodos";
import type { TodoQuadrant, TodoSyncMode } from "@/features/todos/composables/todoTypes";
import { applyAppTheme, normalizeAppTheme } from "@/lib/theme";

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useTodoManagerApp() {
  const session = ref<MindooDBAppSession | null>(null);
  const launchContext = ref<MindooDBAppLaunchContext | null>(null);
  const databases = ref<MindooDBAppDatabaseInfo[]>([]);
  const selectedDatabase = ref<MindooDBAppDatabase | null>(null);
  const selectedDatabaseId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const successMessage = ref<string | null>(null);
  const busyAction = ref<string | null>(null);
  const hostTheme = ref(normalizeAppTheme());
  const hostViewport = ref<MindooDBAppViewport | null>(null);
  const hostUiPreferences = ref<MindooDBAppUiPreferences>({
    iosMultitaskingOptimized: false,
  });
  const refreshMode = ref<TodoSyncMode>("off");
  const localViewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 1440);

  let stopThemeSync: (() => void) | null = null;
  let stopViewportSync: (() => void) | null = null;
  let stopUiPreferencesSync: (() => void) | null = null;
  const handleWindowResize = () => {
    localViewportWidth.value = window.innerWidth;
  };

  const selectedDatabaseInfo = computed(() =>
    databases.value.find((entry) => entry.id === selectedDatabaseId.value) ?? null,
  );
  const canRead = computed(() => selectedDatabaseInfo.value?.capabilities.includes("read") ?? false);
  const canCreate = computed(() => selectedDatabaseInfo.value?.capabilities.includes("create") ?? false);
  const canUpdate = computed(() => selectedDatabaseInfo.value?.capabilities.includes("update") ?? false);
  const canDelete = computed(() => selectedDatabaseInfo.value?.capabilities.includes("delete") ?? false);
  const isBusy = computed(() => loading.value || Boolean(busyAction.value));
  const viewportWidth = computed(() => hostViewport.value?.width ?? localViewportWidth.value);
  const isCompactViewport = computed(() => viewportWidth.value < 880);

  function setSuccess(message: string | null) {
    successMessage.value = message;
    if (message) {
      error.value = null;
    }
  }

  function setViewport(viewport: MindooDBAppViewport | null) {
    hostViewport.value = viewport;
    if (viewport) {
      localViewportWidth.value = viewport.width;
    }
  }

  function applyHostTheme(theme?: MindooDBAppHostTheme | null) {
    hostTheme.value = applyAppTheme(theme);
  }

  function setUiPreferences(uiPreferences: MindooDBAppUiPreferences) {
    hostUiPreferences.value = { ...uiPreferences };
  }

  function subscribeToHostEvents(nextSession: MindooDBAppSession, context: MindooDBAppLaunchContext) {
    stopThemeSync?.();
    stopViewportSync?.();
    stopUiPreferencesSync?.();

    applyHostTheme(context.theme);
    setViewport(context.viewport);
    setUiPreferences(context.uiPreferences);

    stopThemeSync = nextSession.onThemeChange((theme) => {
      applyHostTheme(theme);
    });
    stopViewportSync = nextSession.onViewportChange((viewport) => {
      setViewport(viewport);
    });
    stopUiPreferencesSync = nextSession.onUiPreferencesChange((uiPreferences) => {
      setUiPreferences(uiPreferences);
    });
  }

  function teardownSubscriptions() {
    stopThemeSync?.();
    stopThemeSync = null;
    stopViewportSync?.();
    stopViewportSync = null;
    stopUiPreferencesSync?.();
    stopUiPreferencesSync = null;
  }

  const todos = useTodos({
    selectedDatabase,
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    loading,
    busyAction,
    error,
    setSuccess,
  });

  const periodicSync = usePeriodicSync({
    refreshMode,
    onSync: async () => {
      await todos.refreshTodos();
    },
  });

  async function connect() {
    loading.value = true;
    error.value = null;
    setSuccess(null);

    try {
      const bridge = createMindooDBAppBridge();
      const nextSession = await bridge.connect();
      const context = await nextSession.getLaunchContext();

      session.value = nextSession;
      launchContext.value = context;
      databases.value = context.databases;
      subscribeToHostEvents(nextSession, context);

      const preferredDatabaseId = context.preferredDatabaseId
        ?? context.databases[0]?.id
        ?? null;
      if (preferredDatabaseId) {
        await selectDatabase(preferredDatabaseId);
      } else {
        await periodicSync.runSync("initial");
      }
    } catch (connectError) {
      applyAppTheme();
      error.value = readErrorMessage(
        connectError,
        "Failed to connect to MindooDB Haven. Launch the app from Haven or provide a compatible bridge host.",
      );
    } finally {
      loading.value = false;
    }
  }

  async function disconnect() {
    teardownSubscriptions();
    const currentSession = session.value;
    session.value = null;
    if (!currentSession) {
      return;
    }

    try {
      await currentSession.disconnect();
    } catch {
      // Ignore teardown errors.
    }
  }

  async function selectDatabase(databaseId: string) {
    if (!session.value) {
      return;
    }

    loading.value = true;
    error.value = null;
    setSuccess(null);

    try {
      selectedDatabaseId.value = databaseId;
      selectedDatabase.value = await session.value.openDatabase(databaseId);
      await todos.refreshTodos();
    } catch (databaseError) {
      error.value = readErrorMessage(databaseError, "Failed to load the selected database.");
      throw databaseError;
    } finally {
      loading.value = false;
    }
  }

  async function refreshNow() {
    const succeeded = await periodicSync.runSync("manual");
    if (succeeded) {
      setSuccess("Sync complete.");
    } else if (periodicSync.syncError.value) {
      error.value = periodicSync.syncError.value;
    }
    return succeeded;
  }

  function setMobileQuadrant(quadrant: TodoQuadrant) {
    todos.activeMobileQuadrant.value = quadrant;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleWindowResize);
  }

  onBeforeUnmount(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", handleWindowResize);
    }
    void disconnect();
  });

  return {
    loading,
    error,
    successMessage,
    busyAction,
    isBusy,
    launchContext,
    databases,
    selectedDatabase,
    selectedDatabaseId,
    selectedDatabaseInfo,
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    hostTheme,
    hostViewport,
    hostUiPreferences,
    refreshMode,
    syncState: periodicSync.syncState,
    syncError: periodicSync.syncError,
    lastSyncedAt: periodicSync.lastSyncedAt,
    viewportWidth,
    isCompactViewport,
    connect,
    selectDatabase,
    refreshNow,
    setRefreshMode: periodicSync.setRefreshMode,
    setMobileQuadrant,
    ...todos,
  };
}
