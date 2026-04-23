<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import TabPanel from "primevue/tabpanel";
import TabPanels from "primevue/tabpanels";
import Tabs from "primevue/tabs";

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

const activeTab = ref("general");
const copiedInfoLabel = ref<string | null>(null);
const attachmentDragActive = ref(false);
const attachmentDragDepth = ref(0);

watch(
  () => props.app.dialogVisible.value,
  (visible) => {
    if (!visible) {
      activeTab.value = "general";
      copiedInfoLabel.value = null;
      attachmentDragActive.value = false;
      attachmentDragDepth.value = 0;
    }
  },
);

function canAcceptAttachmentDrop() {
  return Boolean(
    props.app.dialogMode.value === "edit"
      && props.app.dialogTodoId.value
      && props.app.canManageDialogAttachments.value
      && !props.app.isBusy.value,
  );
}

function dataTransferHasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === "Files") return true;
  }
  return false;
}

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  void props.app.uploadDialogAttachments(input.files);
}

function handleAttachmentDragEnter(event: DragEvent) {
  if (!dataTransferHasFiles(event) || !canAcceptAttachmentDrop()) return;
  event.preventDefault();
  attachmentDragDepth.value += 1;
  attachmentDragActive.value = true;
}

function handleAttachmentDragOver(event: DragEvent) {
  if (!dataTransferHasFiles(event)) return;
  if (!canAcceptAttachmentDrop()) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function handleAttachmentDragLeave(event: DragEvent) {
  if (!dataTransferHasFiles(event)) return;
  attachmentDragDepth.value = Math.max(0, attachmentDragDepth.value - 1);
  if (attachmentDragDepth.value === 0) {
    attachmentDragActive.value = false;
  }
}

function handleAttachmentDrop(event: DragEvent) {
  attachmentDragDepth.value = 0;
  attachmentDragActive.value = false;
  if (!dataTransferHasFiles(event) || !canAcceptAttachmentDrop()) return;
  event.preventDefault();
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  void props.app.uploadDialogAttachments(files);
}

async function copyInfoValue(value: string, label: string) {
  if (!value) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "true");
      input.style.position = "absolute";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    copiedInfoLabel.value = `${label} copied.`;
  } catch {
    copiedInfoLabel.value = `Unable to copy ${label.toLowerCase()}.`;
  }
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
      <Tabs v-model:value="activeTab" class="dialog-tabs">
        <TabList>
          <Tab value="general">General</Tab>
          <Tab value="attachments">Attachments</Tab>
          <Tab value="info">Info</Tab>
        </TabList>

        <TabPanels>
          <TabPanel value="general">
            <div class="dialog-general">
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

              <label class="field">
                <span class="field__label">Assigned to</span>
                <input
                  :value="props.app.draft.value.assignedTo"
                  class="native-input"
                  type="text"
                  placeholder="Who owns this todo?"
                  @input="props.app.setDraft('assignedTo', ($event.target as HTMLInputElement).value)"
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
          </TabPanel>

          <TabPanel value="attachments">
            <section
              class="dialog-panel glass-card attachments-panel"
              :class="{ 'attachments-panel--drag-active': attachmentDragActive }"
              @dragenter="handleAttachmentDragEnter"
              @dragover="handleAttachmentDragOver"
              @dragleave="handleAttachmentDragLeave"
              @drop="handleAttachmentDrop"
            >
              <div class="dialog-panel__header">
                <div>
                  <p class="dialog-panel__eyebrow">Attachments</p>
                  <h3>Files</h3>
                </div>
                <label
                  class="upload-button"
                  :class="{ 'upload-button--disabled': !props.app.canManageDialogAttachments.value || props.app.isBusy.value }"
                >
                  <input
                    :key="props.app.attachmentUploadInputKey.value"
                    class="sr-only"
                    type="file"
                    multiple
                    :disabled="!props.app.canManageDialogAttachments.value || props.app.isBusy.value"
                    @change="handleUpload"
                  />
                  <span>Upload</span>
                </label>
              </div>

              <p
                v-if="props.app.dialogMode.value !== 'edit'"
                class="panel__empty"
              >
                Save the todo before adding attachments.
              </p>
              <p
                v-else-if="!props.app.canUseDialogAttachments.value"
                class="panel__empty"
              >
                Attachment actions are unavailable for this database binding.
              </p>
              <p
                v-else-if="props.app.canManageDialogAttachments.value && !props.app.isBusy.value"
                class="attachments-panel__hint"
              >
                Drop files here to attach them to this todo.
              </p>

              <div
                v-if="props.app.dialogAttachments.value.length"
                class="attachment-list"
              >
                <article
                  v-for="attachment in props.app.dialogAttachments.value"
                  :key="attachment.attachmentId"
                  class="attachment-item"
                >
                  <div class="attachment-item__details">
                    <strong>{{ attachment.fileName }}</strong>
                    <p>{{ attachment.mimeType }} · {{ props.app.formatAttachmentSize(attachment.size) }}</p>
                  </div>
                  <div class="attachment-item__actions">
                    <Button
                      icon="pi pi-eye"
                      rounded
                      text
                      severity="secondary"
                      :aria-label="`Preview ${attachment.fileName}`"
                      :title="`Preview ${attachment.fileName}`"
                      :disabled="
                        !props.app.canUseDialogAttachments.value
                        || !props.app.canPreviewDialogAttachment(attachment.fileName, attachment.mimeType)
                        || props.app.isBusy.value
                      "
                      @click="props.app.previewDialogAttachment(attachment.fileName)"
                    />
                    <Button
                      icon="pi pi-download"
                      rounded
                      text
                      severity="secondary"
                      :aria-label="`Extract ${attachment.fileName}`"
                      :title="`Extract ${attachment.fileName}`"
                      :disabled="!props.app.canUseDialogAttachments.value || props.app.isBusy.value"
                      @click="props.app.downloadDialogAttachment(attachment.fileName)"
                    />
                    <Button
                      icon="pi pi-trash"
                      rounded
                      text
                      severity="danger"
                      :aria-label="`Remove ${attachment.fileName}`"
                      :title="`Remove ${attachment.fileName}`"
                      :disabled="!props.app.canManageDialogAttachments.value || props.app.isBusy.value"
                      @click="props.app.removeDialogAttachment(attachment.fileName)"
                    />
                  </div>
                </article>
              </div>
              <p
                v-else-if="props.app.dialogMode.value === 'edit' && props.app.canUseDialogAttachments.value"
                class="panel__empty"
              >
                No attachments are stored for this todo.
              </p>
            </section>
          </TabPanel>

          <TabPanel value="info">
            <section class="dialog-panel glass-card">
              <div class="dialog-panel__header">
                <div>
                  <p class="dialog-panel__eyebrow">Info</p>
                  <h3>Identifiers</h3>
                </div>
              </div>

              <div class="dialog-info-stack">
                <div class="dialog-info-row">
                  <div class="dialog-info-copy">
                    <span class="field__label">Database id</span>
                    <code class="dialog-info-value">{{ props.app.dialogDatabaseId.value ?? "-" }}</code>
                  </div>
                  <Button
                    label="Copy"
                    text
                    size="small"
                    :disabled="!props.app.dialogDatabaseId.value"
                    @click="copyInfoValue(props.app.dialogDatabaseId.value ?? '', 'Database id')"
                  />
                </div>

                <div class="dialog-info-row">
                  <div class="dialog-info-copy">
                    <span class="field__label">Document id</span>
                    <code class="dialog-info-value">{{ props.app.dialogDocumentId.value ?? "-" }}</code>
                  </div>
                  <Button
                    label="Copy"
                    text
                    size="small"
                    :disabled="!props.app.dialogDocumentId.value"
                    @click="copyInfoValue(props.app.dialogDocumentId.value ?? '', 'Document id')"
                  />
                </div>
              </div>

              <p
                v-if="props.app.dialogDatabaseInfo.value?.title"
                class="field__hint"
              >
                {{ props.app.dialogDatabaseInfo.value.title }}
              </p>
              <p v-if="copiedInfoLabel" class="field__hint">{{ copiedInfoLabel }}</p>
            </section>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="dialog-footer__create-target">
          <span>{{ props.app.dialogMode.value === 'create' ? 'Create in' : 'Stored in' }}</span>
          <select
            :value="props.app.draftDatabaseId.value ?? ''"
            class="native-select"
            :disabled="props.app.dialogMode.value !== 'create'"
            @change="props.app.draftDatabaseId.value = ($event.target as HTMLSelectElement).value"
          >
            <option
              v-for="database in props.app.createTargetDatabases.value"
              :key="database.id"
              :value="database.id"
              :disabled="!database.capabilities.includes('create')"
            >
              {{ database.title }}{{ database.capabilities.includes('create') ? '' : ' (read only)' }}
            </option>
          </select>
        </div>

        <Button label="Close" text @click="props.app.closeDialog()" />
        <Button
          :label="props.app.dialogMode.value === 'create' ? 'Create' : 'Save'"
          icon="pi pi-check"
          :disabled="
            props.app.dialogMode.value === 'create'
            && !props.app.createTargetDatabases.value.some(
              (database) =>
                database.id === props.app.draftDatabaseId.value && database.capabilities.includes('create'),
            )
          "
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

.dialog-tabs {
  display: grid;
  gap: 1rem;
}

.dialog-general {
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

.dialog-panel {
  display: grid;
  gap: 1rem;
  margin-top: 0.35rem;
  padding: 1rem;
}

.dialog-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.dialog-panel__header h3,
.dialog-panel__eyebrow {
  margin: 0;
}

.dialog-panel__eyebrow {
  color: var(--muted);
  font-size: 0.74rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.attachments-panel--drag-active {
  border: 1px dashed rgb(var(--primary-rgb));
  background: rgb(var(--primary-rgb) / 0.08);
}

.attachments-panel__hint,
.panel__empty,
.field__hint {
  margin: 0;
  color: var(--muted);
}

.attachment-list {
  display: grid;
  gap: 0.75rem;
}

.attachment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: rgb(255 255 255 / 0.03);
}

.attachment-item__details {
  min-width: 0;
}

.attachment-item__details strong,
.attachment-item__details p {
  display: block;
  margin: 0;
}

.attachment-item__details p {
  color: var(--muted);
}

.attachment-item__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.upload-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.5rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.03);
  cursor: pointer;
}

.upload-button--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-info-stack {
  display: grid;
  gap: 0.85rem;
}

.dialog-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.dialog-info-copy {
  display: grid;
  gap: 0.35rem;
}

.dialog-info-value {
  word-break: break-all;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  width: 100%;
}

.dialog-footer__create-target {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: min(100%, 20rem);
}

.dialog-footer__create-target span {
  color: var(--muted);
  white-space: nowrap;
}

.dialog-footer :deep(.p-button) {
  flex-shrink: 0;
}

@media (max-width: 720px) {
  .attachment-item,
  .dialog-info-row {
    flex-direction: column;
    align-items: stretch;
  }

  .dialog-footer {
    justify-content: flex-end;
  }

  .dialog-footer__create-target {
    width: 100%;
  }
}

@media (max-width: 720px) {
  .dialog-grid {
    grid-template-columns: 1fr;
  }
}
</style>
