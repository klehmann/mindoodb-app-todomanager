import { isLaunchedByHaven, renderHavenAppLandingPage } from "mindoodb-app-sdk";

import { installBootRecovery } from "@/pwa/bootRecovery";

// Opened directly (a shared link, a bookmark) there is no Haven to talk to: show what
// the app is and a button that installs it, instead of booting into a connection error.
if (!isLaunchedByHaven()) {
  void renderHavenAppLandingPage();
} else {
  void installBootRecovery()
    .then((bootRecovery) =>
      import("./main").catch((error) => {
        void bootRecovery.reportBootFailure("main-import-failed", error);
      }),
    )
    .catch((error) => {
      console.error("MindooDB To Do Manager boot recovery could not start.", error);
      return import("./main");
    });
}
