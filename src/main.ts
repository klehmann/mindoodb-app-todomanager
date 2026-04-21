import { createApp } from "vue";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import "primeicons/primeicons.css";

import App from "./App.vue";
import "@/assets/styles/main.css";
import { applyAppTheme, buildPrimeVueTheme, DEFAULT_THEME_PRESET } from "@/lib/theme";

const app = createApp(App);

app.use(PrimeVue, {
  ripple: true,
  theme: buildPrimeVueTheme(DEFAULT_THEME_PRESET),
});
app.use(ToastService);

applyAppTheme();
app.mount("#app");
