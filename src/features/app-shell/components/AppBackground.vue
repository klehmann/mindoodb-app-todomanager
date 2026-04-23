<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import alpineNightStars from "@/assets/backgrounds/todo-bg-alpine-night-stars.png";
import desertTwilight from "@/assets/backgrounds/todo-bg-desert-twilight.png";
import fjordBlueHour from "@/assets/backgrounds/todo-bg-fjord-blue-hour.png";
import rainforestMistMorning from "@/assets/backgrounds/todo-bg-rainforest-mist-morning.png";
import savannaDawn from "@/assets/backgrounds/todo-bg-savanna-dawn.png";
import scottishHighlandsEvening from "@/assets/backgrounds/todo-bg-scottish-highlands-evening.png";

const BACKGROUNDS = [
  savannaDawn,
  scottishHighlandsEvening,
  desertTwilight,
  rainforestMistMorning,
  fjordBlueHour,
  alpineNightStars,
] as const;

const ROTATE_MS = 120_000;

const url0 = ref("");
const url1 = ref("");
const topSlot = ref(0);
let imageIndex = 0;
let timer: number | undefined;
const n = BACKGROUNDS.length;

function seedLayers() {
  imageIndex = Math.floor(Math.random() * n);
  url0.value = BACKGROUNDS[imageIndex];
  url1.value = BACKGROUNDS[(imageIndex + 1) % n];
  topSlot.value = 0;
}

function advance() {
  const nextIndex = (imageIndex + 1) % n;
  const incomingSlot = 1 - topSlot.value;
  if (incomingSlot === 0) {
    url0.value = BACKGROUNDS[nextIndex];
  } else {
    url1.value = BACKGROUNDS[nextIndex];
  }
  topSlot.value = incomingSlot;
  imageIndex = nextIndex;
  const hiddenSlot = 1 - topSlot.value;
  const preloadIndex = (imageIndex + 1) % n;
  if (hiddenSlot === 0) {
    url0.value = BACKGROUNDS[preloadIndex];
  } else {
    url1.value = BACKGROUNDS[preloadIndex];
  }
}

onMounted(() => {
  seedLayers();
  timer = window.setInterval(advance, ROTATE_MS);
});

onBeforeUnmount(() => {
  if (timer !== undefined) {
    window.clearInterval(timer);
  }
});
</script>

<template>
  <div
    class="app-background"
    aria-hidden="true"
  >
    <div
      class="app-background__layer"
      :class="{ 'app-background__layer--visible': topSlot === 0 }"
      :style="{ backgroundImage: `url(${url0})` }"
    />
    <div
      class="app-background__layer"
      :class="{ 'app-background__layer--visible': topSlot === 1 }"
      :style="{ backgroundImage: `url(${url1})` }"
    />
    <div class="app-background__veil" />
  </div>
</template>

<style scoped>
.app-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.app-background__layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transform: scale(1.02);
  opacity: 0;
  transition: opacity 1.15s ease;
}

.app-background__layer--visible {
  z-index: 1;
  opacity: 1;
}

.app-background__veil {
  position: absolute;
  inset: 0;
  z-index: 2;
  /* Minimal wash — keep the photo visible; slightly more at bottom for legibility. */
  background: linear-gradient(
    180deg,
    rgba(3, 6, 14, 0.04) 0%,
    rgba(3, 6, 14, 0.08) 50%,
    rgba(2, 4, 12, 0.12) 100%
  );
}

@media (prefers-reduced-motion: reduce) {
  .app-background__layer {
    transition: none;
  }
}
</style>
