import { installBootRecovery } from "@/pwa/bootRecovery";

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
