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
  const openedDatabasesById = ref<Record<string, MindooDBAppDatabase>>({});
  const selectedDatabaseIds = ref<string[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const successMessage = ref<string | null>(null);
  const busyAction = ref<string | null>(null);
  const hostTheme = ref(normalizeAppTheme());
  const hostViewport = ref<MindooDBAppViewport | null>(null);
  const hostUiPreferences = ref<MindooDBAppUiPreferences>({
    iosMultitaskingOptimized: false,
    reduceMotion: false,
  });
  const refreshMode = ref<TodoSyncMode>("off");
  const localViewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 1440);

  let stopThemeSync: (() => void) | null = null;
  let stopViewportSync: (() => void) | null = null;
  let stopUiPreferencesSync: (() => void) | null = null;
  const handleWindowResize = () => {
    localViewportWidth.value = window.innerWidth;
  };

  const databaseInfoById = computed<Record<string, MindooDBAppDatabaseInfo>>(() =>
    Object.fromEntries(databases.value.map((entry) => [entry.id, entry])),
  );
  const selectedDatabaseInfos = computed(() =>
    selectedDatabaseIds.value
      .map((databaseId) => databaseInfoById.value[databaseId])
      .filter((entry): entry is MindooDBAppDatabaseInfo => Boolean(entry)),
  );
  const selectedReadableDatabases = computed(() =>
    selectedDatabaseInfos.value.filter((entry) => entry.capabilities.includes("read")),
  );
  const isTimeTravelActive = computed(() => launchContext.value?.timeTravelDate != null);
  const timeTravelDateLabel = computed(() =>
    launchContext.value?.timeTravelDate == null ? "" : new Date(launchContext.value.timeTravelDate).toLocaleString(),
  );
  const canRead = computed(() => selectedReadableDatabases.value.length > 0);
  const canCreate = computed(() => !isTimeTravelActive.value && databases.value.some((entry) => entry.capabilities.includes("create")));
  const isBusy = computed(() => loading.value || Boolean(busyAction.value));
  const viewportWidth = computed(() => hostViewport.value?.width ?? localViewportWidth.value);
  const isCompactViewport = computed(() => viewportWidth.value < 880);
  const preferredDatabaseId = computed(() =>
    launchContext.value?.preferredDatabaseId
    ?? databases.value[0]?.id
    ?? null,
  );

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
    selectedDatabaseIds,
    databases,
    preferredDatabaseId,
    getDatabase: async (databaseId) => await openDatabaseById(databaseId),
    isTimeTravelActive,
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
      openedDatabasesById.value = {};
      subscribeToHostEvents(nextSession, context);

      const initialDatabaseId = context.preferredDatabaseId
        ?? context.databases[0]?.id
        ?? null;
      if (initialDatabaseId) {
        await selectDatabases([initialDatabaseId]);
      } else {
        selectedDatabaseIds.value = [];
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

  function normalizeDatabaseSelection(databaseIds: string[]) {
    const knownDatabaseIds = new Set(databases.value.map((entry) => entry.id));
    return Array.from(new Set(databaseIds)).filter((databaseId) => knownDatabaseIds.has(databaseId));
  }

  async function openDatabaseById(databaseId: string) {
    if (!session.value) {
      return null;
    }

    const existing = openedDatabasesById.value[databaseId];
    if (existing) {
      return existing;
    }

    const openedDatabase = await session.value.openDatabase(databaseId);
    openedDatabasesById.value = {
      ...openedDatabasesById.value,
      [databaseId]: openedDatabase,
    };
    return openedDatabase;
  }

  async function selectDatabases(databaseIds: string[]) {
    if (!session.value) {
      return;
    }

    const nextDatabaseIds = normalizeDatabaseSelection(databaseIds);

    loading.value = true;
    error.value = null;
    setSuccess(null);

    try {
      await Promise.all(nextDatabaseIds.map(async (databaseId) => {
        await openDatabaseById(databaseId);
      }));
      selectedDatabaseIds.value = nextDatabaseIds;
      await todos.refreshTodos();
    } catch (databaseError) {
      error.value = readErrorMessage(databaseError, "Failed to load the selected databases.");
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
    session,
    loading,
    error,
    successMessage,
    busyAction,
    isBusy,
    launchContext,
    databases,
    openedDatabasesById,
    selectedDatabaseIds,
    selectedDatabaseInfos,
    selectedReadableDatabases,
    preferredDatabaseId,
    isTimeTravelActive,
    timeTravelDateLabel,
    canRead,
    canCreate,
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
    selectDatabases,
    refreshNow,
    setRefreshMode: periodicSync.setRefreshMode,
    setMobileQuadrant,
    ...todos,
  };
}
