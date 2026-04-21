<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";

import { useTodoManagerApp } from "@/app/useTodoManagerApp";
import { TODO_QUADRANTS } from "@/features/todos/composables/todoTypes";

const props = defineProps<{
  app: ReturnType<typeof useTodoManagerApp>;
}>();

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function fromDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}
</script>

<template>
  <Dialog
    v-model:visible="props.app.dialogVisible.value"
    modal
    :header="props.app.dialogMode.value === 'create' ? 'New To Do Entry' : 'To Do Entry'"
    :style="{ width: '44rem', maxWidth: '96vw' }"
  >
    <div class="dialog-shell">
      <label class="field">
        <span class="field__label">Subject</span>
        <input
          :value="props.app.draft.value.subject"
          class="native-input"
          type="text"
          placeholder="Todo subject"
          @input="props.app.setDraft('subject', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <div class="dialog-grid">
        <label class="field">
          <span class="field__label">Quadrant</span>
          <select
            class="native-select"
            :value="String(props.app.draft.value.quadrant)"
            @change="props.app.setDraft('quadrant', Number(($event.target as HTMLSelectElement).value) as 1 | 2 | 3 | 4)"
          >
            <option
              v-for="entry in TODO_QUADRANTS"
              :key="entry.quadrant"
              :value="entry.quadrant"
            >
              Q{{ entry.quadrant }} - {{ entry.subtitle }} / {{ entry.title }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">Due by</span>
          <input
            :value="toDateInput(props.app.draft.value.dueAt)"
            class="native-input"
            type="date"
            @input="props.app.setDraft('dueAt', fromDateInput(($event.target as HTMLInputElement).value))"
          />
        </label>

        <label class="field">
          <span class="field__label">Start by</span>
          <input
            :value="toDateInput(props.app.draft.value.startAt)"
            class="native-input"
            type="date"
            @input="props.app.setDraft('startAt', fromDateInput(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>

      <label class="field">
        <span class="field__label">Description</span>
        <textarea
          :value="props.app.draft.value.description"
          class="native-textarea"
          placeholder="Describe the todo"
          @input="props.app.setDraft('description', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>

      <label class="dialog-check">
        <Checkbox
          binary
          :model-value="props.app.draft.value.completed"
          @update:model-value="props.app.setDraft('completed', Boolean($event))"
        />
        <span>Completed</span>
      </label>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <Button label="Close" text @click="props.app.closeDialog()" />
        <Button
          :label="props.app.dialogMode.value === 'create' ? 'Create' : 'Save'"
          icon="pi pi-check"
          :loading="props.app.busyAction.value === 'Creating todo' || props.app.busyAction.value === 'Saving todo'"
          @click="props.app.saveDialogTodo()"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-shell {
  display: grid;
  gap: 1rem;
}

.dialog-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem;
}

.dialog-check {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--muted);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  width: 100%;
}

@media (max-width: 720px) {
  .dialog-grid {
    grid-template-columns: 1fr;
  }
}
</style>
