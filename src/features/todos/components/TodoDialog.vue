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
import { quadrantLabels, t, type MessageKey } from "@/lib/i18n";

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
    props.app.dialogMode.value === "edit" &&
    props.app.dialogTodoId.value &&
    props.app.canManageDialogAttachments.value &&
    !props.app.isBusy.value,
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

function copyWithTextareaFallback(value: string) {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}

async function copyInfoValue(value: string, labelKey: MessageKey) {
  const label = t(labelKey);
  if (!value) {
    return;
  }

  try {
    if (copyWithTextareaFallback(value)) {
      copiedInfoLabel.value = t("copied", { label });
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      copiedInfoLabel.value = t("copied", { label });
      return;
    }
  } catch {
    // Fall through to the shared failure message below.
  }

  copiedInfoLabel.value = t("copyFailed", { label });
}
</script>

<template>
  <Dialog
    v-model:visible="props.app.dialogVisible.value"
    modal
    :header="
      props.app.dialogMode.value === 'create'
        ? t('dialogCreateTitle')
        : t('dialogEditTitle')
    "
    :style="{ width: '44rem', maxWidth: '96vw' }"
  >
    <div class="dialog-shell">
      <Tabs v-model:value="activeTab" class="dialog-tabs">
        <TabList>
          <Tab value="general">{{ t("tabGeneral") }}</Tab>
          <Tab value="attachments">{{ t("tabAttachments") }}</Tab>
          <Tab value="info">{{ t("tabInfo") }}</Tab>
        </TabList>

        <TabPanels>
          <TabPanel value="general">
            <div class="dialog-general">
              <label class="field">
                <span class="field__label">{{ t("subject") }}</span>
                <input
                  :value="props.app.draft.value.subject"
                  class="native-input"
                  type="text"
                  :placeholder="t('subjectPlaceholder')"
                  @input="
                    props.app.setDraft(
                      'subject',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </label>

              <label class="field">
                <span class="field__label">{{ t("assignedTo") }}</span>
                <input
                  :value="props.app.draft.value.assignedTo"
                  class="native-input"
                  type="text"
                  :placeholder="t('assignedToPlaceholder')"
                  @input="
                    props.app.setDraft(
                      'assignedTo',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </label>

              <div class="dialog-grid">
                <label class="field">
                  <span class="field__label">{{ t("quadrant") }}</span>
                  <select
                    class="native-select"
                    :value="String(props.app.draft.value.quadrant)"
                    @change="
                      props.app.setDraft(
                        'quadrant',
                        Number(($event.target as HTMLSelectElement).value) as
                          | 1
                          | 2
                          | 3
                          | 4,
                      )
                    "
                  >
                    <option
                      v-for="entry in TODO_QUADRANTS"
                      :key="entry.quadrant"
                      :value="entry.quadrant"
                    >
                      {{ t("quadrantOption", { number: entry.quadrant, ...quadrantLabels(entry.quadrant) }) }}
                    </option>
                  </select>
                </label>

                <label class="field">
                  <span class="field__label">{{ t("dueBy") }}</span>
                  <input
                    :value="toDateInput(props.app.draft.value.dueAt)"
                    class="native-input"
                    type="date"
                    @input="
                      props.app.setDraft(
                        'dueAt',
                        fromDateInput(
                          ($event.target as HTMLInputElement).value,
                        ),
                      )
                    "
                  />
                </label>

                <label class="field">
                  <span class="field__label">{{ t("startBy") }}</span>
                  <input
                    :value="toDateInput(props.app.draft.value.startAt)"
                    class="native-input"
                    type="date"
                    @input="
                      props.app.setDraft(
                        'startAt',
                        fromDateInput(
                          ($event.target as HTMLInputElement).value,
                        ),
                      )
                    "
                  />
                </label>
              </div>

              <label class="field">
                <span class="field__label">{{ t("description") }}</span>
                <textarea
                  :value="props.app.draft.value.description"
                  class="native-textarea"
                  :placeholder="t('descriptionPlaceholder')"
                  @input="
                    props.app.setDraft(
                      'description',
                      ($event.target as HTMLTextAreaElement).value,
                    )
                  "
                />
              </label>

              <label class="dialog-check">
                <Checkbox
                  binary
                  :model-value="props.app.draft.value.completed"
                  @update:model-value="
                    props.app.setDraft('completed', Boolean($event))
                  "
                />
                <span>{{ t("completed") }}</span>
              </label>
            </div>
          </TabPanel>

          <TabPanel value="attachments">
            <section
              class="dialog-panel glass-card attachments-panel"
              :class="{
                'attachments-panel--drag-active': attachmentDragActive,
              }"
              @dragenter="handleAttachmentDragEnter"
              @dragover="handleAttachmentDragOver"
              @dragleave="handleAttachmentDragLeave"
              @drop="handleAttachmentDrop"
            >
              <div class="dialog-panel__header attachments-panel__header">
                <div>
                  <h3>{{ t("attachments") }}</h3>
                </div>
                <div class="attachments-panel__controls">
                  <label
                    class="upload-button"
                    :class="{
                      'upload-button--disabled':
                        !props.app.canManageDialogAttachments.value ||
                        props.app.isBusy.value,
                    }"
                  >
                    <input
                      :key="props.app.attachmentUploadInputKey.value"
                      class="sr-only"
                      type="file"
                      multiple
                      :disabled="
                        !props.app.canManageDialogAttachments.value ||
                        props.app.isBusy.value
                      "
                      @change="handleUpload"
                    />
                    <span>{{ t("upload") }}</span>
                  </label>
                  <Button
                    :label="t('scanDocument')"
                    severity="secondary"
                    :disabled="
                      !props.app.canManageDialogAttachments.value ||
                      props.app.isBusy.value
                    "
                    @click="props.app.scanDialogAttachment"
                  />
                </div>
              </div>

              <p
                v-if="props.app.dialogMode.value !== 'edit'"
                class="panel__empty"
              >
                {{ t("saveBeforeAttachments") }}
              </p>
              <p
                v-else-if="!props.app.canUseDialogAttachments.value"
                class="panel__empty"
              >
                {{ t("attachmentsUnavailable") }}
              </p>
              <p
                v-else-if="
                  props.app.canManageDialogAttachments.value &&
                  !props.app.isBusy.value
                "
                class="attachments-panel__hint"
              >
                {{ t("dropFilesHint") }}
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
                    <p>
                      {{ attachment.mimeType }} ·
                      {{ props.app.formatAttachmentSize(attachment.size) }}
                    </p>
                  </div>
                  <div class="attachment-item__actions">
                    <Button
                      icon="pi pi-eye"
                      rounded
                      text
                      severity="secondary"
                      :aria-label="t('previewFile', { name: attachment.fileName })"
                      :title="t('previewFile', { name: attachment.fileName })"
                      :disabled="
                        !props.app.canUseDialogAttachments.value ||
                        !props.app.canPreviewDialogAttachment(
                          attachment.fileName,
                          attachment.mimeType,
                        ) ||
                        props.app.isBusy.value
                      "
                      @click="
                        props.app.previewDialogAttachment(attachment.fileName)
                      "
                    />
                    <Button
                      icon="pi pi-download"
                      rounded
                      text
                      severity="secondary"
                      :aria-label="t('extractFile', { name: attachment.fileName })"
                      :title="t('extractFile', { name: attachment.fileName })"
                      :disabled="
                        !props.app.canUseDialogAttachments.value ||
                        props.app.isBusy.value
                      "
                      @click="
                        props.app.downloadDialogAttachment(attachment.fileName)
                      "
                    />
                    <Button
                      icon="pi pi-trash"
                      rounded
                      text
                      severity="danger"
                      :aria-label="t('removeFile', { name: attachment.fileName })"
                      :title="t('removeFile', { name: attachment.fileName })"
                      :disabled="
                        !props.app.canManageDialogAttachments.value ||
                        props.app.isBusy.value
                      "
                      @click="
                        props.app.removeDialogAttachment(attachment.fileName)
                      "
                    />
                  </div>
                </article>
              </div>
              <p
                v-else-if="
                  props.app.dialogMode.value === 'edit' &&
                  props.app.canUseDialogAttachments.value
                "
                class="panel__empty"
              >
                {{ t("noAttachmentsStored") }}
              </p>
            </section>
          </TabPanel>

          <TabPanel value="info">
            <section class="dialog-panel glass-card">
              <div class="dialog-panel__header">
                <div>
                  <h3>{{ t("identifiers") }}</h3>
                </div>
              </div>

              <div class="dialog-info-stack">
                <div class="dialog-info-row">
                  <div class="dialog-info-copy">
                    <span class="field__label">{{ t("databaseId") }}</span>
                    <code class="dialog-info-value">{{
                      props.app.dialogDatabaseId.value ?? "-"
                    }}</code>
                  </div>
                  <Button
                    :label="t('copy')"
                    text
                    size="small"
                    :disabled="!props.app.dialogDatabaseId.value"
                    @click="
                      copyInfoValue(
                        props.app.dialogDatabaseId.value ?? '',
                        'databaseId',
                      )
                    "
                  />
                </div>

                <div class="dialog-info-row">
                  <div class="dialog-info-copy">
                    <span class="field__label">{{ t("documentId") }}</span>
                    <code class="dialog-info-value">{{
                      props.app.dialogDocumentId.value ?? "-"
                    }}</code>
                  </div>
                  <Button
                    :label="t('copy')"
                    text
                    size="small"
                    :disabled="!props.app.dialogDocumentId.value"
                    @click="
                      copyInfoValue(
                        props.app.dialogDocumentId.value ?? '',
                        'documentId',
                      )
                    "
                  />
                </div>
              </div>

              <p
                v-if="props.app.dialogDatabaseInfo.value?.title"
                class="field__hint"
              >
                {{ props.app.dialogDatabaseInfo.value.title }}
              </p>
              <p v-if="copiedInfoLabel" class="field__hint">
                {{ copiedInfoLabel }}
              </p>
            </section>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="dialog-footer__create-target">
          <span>{{
            props.app.dialogMode.value === "create" ? t("createIn") : t("storedIn")
          }}</span>
          <select
            :value="props.app.draftDatabaseId.value ?? ''"
            class="native-select"
            :disabled="props.app.dialogMode.value !== 'create'"
            @change="
              props.app.draftDatabaseId.value = (
                $event.target as HTMLSelectElement
              ).value
            "
          >
            <option
              v-for="database in props.app.createTargetDatabases.value"
              :key="database.id"
              :value="database.id"
              :disabled="!database.capabilities.includes('create')"
            >
              {{
                database.capabilities.includes("create")
                  ? database.title
                  : t("databaseReadOnly", { title: database.title })
              }}
            </option>
          </select>
        </div>

        <Button
          class="dialog-footer__close"
          :label="t('close')"
          text
          @click="props.app.closeDialog()"
        />
        <Button
          :label="props.app.dialogMode.value === 'create' ? t('create') : t('save')"
          icon="pi pi-check"
          :disabled="
            props.app.dialogMode.value === 'create' &&
            !props.app.createTargetDatabases.value.some(
              (database) =>
                database.id === props.app.draftDatabaseId.value &&
                database.capabilities.includes('create'),
            )
          "
          :loading="
            props.app.busyAction.value === 'Creating todo' ||
            props.app.busyAction.value === 'Saving todo'
          "
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

.dialog-tabs :deep(.p-tab[aria-selected="true"]),
.dialog-tabs :deep(.p-tab[aria-selected="true"] .p-tab-title) {
  color: var(--quadrant-badge-fg, rgb(var(--primary-rgb)));
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

.attachments-panel__header {
  align-items: stretch;
  flex-direction: column;
}

.attachments-panel__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

.dialog-footer :deep(.dialog-footer__close),
.dialog-footer :deep(.dialog-footer__close .p-button-label),
.dialog-footer :deep(.dialog-footer__close .p-button-icon) {
  color: var(--quadrant-badge-fg, rgb(var(--primary-rgb)));
}

.dialog-shell
  :deep(
    .p-button.p-button-text:not(.p-button-danger):not(.p-button-primary)
      .p-button-label
  ),
.dialog-shell
  :deep(
    .p-button.p-button-text:not(.p-button-danger):not(.p-button-primary)
      .p-button-icon
  ),
.dialog-shell :deep(.p-button.p-button-secondary .p-button-label),
.dialog-shell :deep(.p-button.p-button-secondary .p-button-icon) {
  color: var(--quadrant-badge-fg, rgb(var(--primary-rgb)));
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
