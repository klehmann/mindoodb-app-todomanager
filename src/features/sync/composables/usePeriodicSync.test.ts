import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { withSetup } from "@/test-utils/withSetup";

import { usePeriodicSync } from "./usePeriodicSync";

describe("usePeriodicSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs manual sync and tracks the last sync time", async () => {
    const onSync = vi.fn().mockResolvedValue(undefined);
    const refreshMode = ref<"off" | "10s" | "30s" | "60s">("off");
    const { result, unmount } = withSetup(() => usePeriodicSync({ refreshMode, onSync }));

    const promise = result.runSync("manual");
    await promise;

    expect(onSync).toHaveBeenCalledWith("manual");
    expect(result.syncState.value).toBe("idle");
    expect(result.lastSyncedAt.value).toBeTruthy();

    unmount();
  });

  it("fires periodic sync for the selected interval and cleans up on unmount", async () => {
    const onSync = vi.fn().mockResolvedValue(undefined);
    const refreshMode = ref<"off" | "10s" | "30s" | "60s">("off");
    const { result, unmount } = withSetup(() => usePeriodicSync({ refreshMode, onSync }));

    result.setRefreshMode("10s");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onSync).toHaveBeenCalledWith("timer");

    unmount();
    onSync.mockClear();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(onSync).not.toHaveBeenCalled();
  });

  it("moves to the error state when syncing fails", async () => {
    const onSync = vi.fn().mockRejectedValue(new Error("boom"));
    const refreshMode = ref<"off" | "10s" | "30s" | "60s">("off");
    const { result, unmount } = withSetup(() => usePeriodicSync({ refreshMode, onSync }));

    await result.runSync("manual");

    expect(result.syncState.value).toBe("error");
    expect(result.syncError.value).toBe("boom");

    unmount();
  });
});
