import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Tooltip from "primevue/tooltip";
import ToastService from "primevue/toastservice";
import "primeicons/primeicons.css";

import App from "./App.vue";
import "@/assets/styles/main.css";
import { applyAppTheme, buildPrimeVueTheme, DEFAULT_THEME_PRESET } from "@/lib/theme";
import { registerTodoManagerServiceWorker } from "@/pwa/appUpdate";
import { TODOMANAGER_BOOT_COMPLETED_EVENT } from "@/pwa/bootRecovery";

async function bootstrap() {
  const app = createApp(App);

  app.use(PrimeVue, {
    ripple: true,
    theme: buildPrimeVueTheme(DEFAULT_THEME_PRESET),
  });
  app.use(ToastService);
  app.directive("tooltip", Tooltip);

  applyAppTheme();
  await registerTodoManagerServiceWorker();
  app.mount("#app");
  window.dispatchEvent(new Event(TODOMANAGER_BOOT_COMPLETED_EVENT));
}

void bootstrap();
