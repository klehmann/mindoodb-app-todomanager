import { Document } from "flexsearch";
import { computed, onBeforeUnmount, onMounted, reactive, ref, type ComputedRef, type Ref } from "vue";
import {
  canPreviewAttachment,
  type MindooDBAppAttachmentInfo,
  type MindooDBAppDatabase,
  type MindooDBAppDatabaseInfo,
} from "mindoodb-app-sdk";

import {
  buildTodoSelectionKey,
  buildTodoCreateInput,
  buildTodoPatch,
  EMPTY_TODO_DRAFT,
  readTodoItem,
  type TodoDraft,
  type TodoFilterMode,
  type TodoItem,
  type TodoQuadrant,
  type TodoSortMode,
} from "./todoTypes";

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function byDate(value: string | null) {
  return value ? Date.parse(value) || 0 : 0;
}

async function readAttachmentBlob(database: MindooDBAppDatabase, docId: string, attachmentName: string) {
  const stream = await database.attachments.openReadStream(docId, attachmentName);
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await stream.read();
      if (!chunk) {
        break;
      }
      chunks.push(chunk);
    }
  } finally {
    await stream.close();
  }

  return new Blob(chunks.map((chunk) => Uint8Array.from(chunk)));
}

function formatAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size < 1024) {
    return `${Math.max(0, Math.round(size || 0))} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`;
}

type TodoSearchDocument = {
  selectionKey: string;
  subject: string;
  assignedTo: string;
  description: string;
};

function createTodoSearchIndex() {
  return new Document<TodoSearchDocument>({
    id: "selectionKey",
    index: ["subject", "assignedTo", "description"],
  });
}

function addTodoToSearchIndex(index: Document<TodoSearchDocument>, todo: TodoItem) {
  index.add({
    selectionKey: todo.selectionKey,
    subject: todo.subject,
    assignedTo: todo.assignedTo,
    description: todo.description,
  });
}

const DRAG_START_DISTANCE = 10;

export interface UseTodosOptions {
  selectedDatabaseIds: Ref<string[]>;
  databases: Ref<MindooDBAppDatabaseInfo[]>;
  preferredDatabaseId: ComputedRef<string | null>;
  getDatabase: (databaseId: string) => Promise<MindooDBAppDatabase | null>;
  loading: Ref<boolean>;
  busyAction: Ref<string | null>;
  error: Ref<string | null>;
  setSuccess: (message: string | null) => void;
}

export function useTodos(options: UseTodosOptions) {
  const todos = ref<TodoItem[]>([]);
  const todoSearchIndex = ref<Document<TodoSearchDocument> | null>(null);
  const todoPointerDragState = reactive({
    todoId: "",
    active: false,
    started: false,
    pointerId: null as number | null,
    pointerType: "",
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    hoverQuadrant: null as TodoQuadrant | null,
    hoverRecycle: false,
  });
  const selectedTodoIds = ref<string[]>([]);
  const draggedTodoIds = ref<string[]>([]);
  const dialogVisible = ref(false);
  const dialogMode = ref<"create" | "edit">("create");
  const dialogTodoId = ref<string | null>(null);
  const draftDatabaseId = ref<string | null>(null);
  const dialogAttachments = ref<MindooDBAppAttachmentInfo[]>([]);
  const attachmentUploadInputKey = ref(0);
  const draft = ref<TodoDraft>({ ...EMPTY_TODO_DRAFT });
  const searchQuery = ref("");
  const filterMode = ref<TodoFilterMode>("open");
  const sortMode = ref<TodoSortMode>("updated-desc");
  const activeMobileQuadrant = ref<TodoQuadrant>(1);
  const databaseInfoById = computed<Record<string, MindooDBAppDatabaseInfo>>(() =>
    Object.fromEntries(options.databases.value.map((entry) => [entry.id, entry])),
  );
  const createTargetDatabases = computed(() => options.databases.value);
  const canCreateAny = computed(() =>
    createTargetDatabases.value.some((entry) => entry.capabilities.includes("create")),
  );
  const currentDialogTodo = computed(() =>
    dialogTodoId.value
      ? todos.value.find((todo) => todo.selectionKey === dialogTodoId.value) ?? null
      : null,
  );
  const dialogDatabaseId = computed(() =>
    currentDialogTodo.value?.databaseId
    ?? draftDatabaseId.value
    ?? null,
  );
  const dialogDatabaseInfo = computed(() =>
    dialogDatabaseId.value ? databaseInfoById.value[dialogDatabaseId.value] ?? null : null,
  );
  const dialogDocumentId = computed(() => currentDialogTodo.value?.id ?? null);

  const selectedTodoSet = computed(() => new Set(selectedTodoIds.value));
  const selectedCount = computed(() => selectedTodoIds.value.length);
  const selectedTodos = computed(() =>
    todos.value.filter((todo) => selectedTodoSet.value.has(todo.selectionKey)),
  );
  const selectedQuadrants = computed(() =>
    Array.from(new Set(selectedTodos.value.map((todo) => todo.quadrant))),
  );
  const canUpdateSelected = computed(() =>
    selectedTodos.value.length > 0
    && selectedTodos.value.every((todo) =>
      databaseInfoById.value[todo.databaseId]?.capabilities.includes("update") ?? false,
    ),
  );
  const canDeleteSelected = computed(() =>
    selectedTodos.value.length > 0
    && selectedTodos.value.every((todo) =>
      databaseInfoById.value[todo.databaseId]?.capabilities.includes("delete") ?? false,
    ),
  );
  const canUseDialogAttachments = computed(() =>
    dialogDatabaseId.value
      ? databaseInfoById.value[dialogDatabaseId.value]?.capabilities.includes("attachments") ?? false
      : false,
  );
  const canManageDialogAttachments = computed(() =>
    dialogDatabaseId.value
      ? (databaseInfoById.value[dialogDatabaseId.value]?.capabilities.includes("attachments") ?? false)
        && (databaseInfoById.value[dialogDatabaseId.value]?.capabilities.includes("update") ?? false)
      : false,
  );

  const filteredTodos = computed(() => {
    const query = searchQuery.value.trim();
    let filtered = todos.value.filter((todo) => {
      if (filterMode.value === "open" && todo.completed) {
        return false;
      }
      if (filterMode.value === "completed" && !todo.completed) {
        return false;
      }
      if (!query) {
        return true;
      }
      return true;
    });

    if (query) {
      const searchResults = todoSearchIndex.value?.search(query, {
        merge: true,
        limit: Math.max(todos.value.length, 1),
      }) ?? [];
      const matchingTodoIds = new Set(searchResults.map((result) => String(result.id)));
      filtered = filtered.filter((todo) => matchingTodoIds.has(todo.selectionKey));
    }

    filtered.sort((left, right) => {
      switch (sortMode.value) {
        case "subject-asc":
          return left.subject.localeCompare(right.subject);
        case "due-asc":
          return byDate(left.dueAt) - byDate(right.dueAt) || left.subject.localeCompare(right.subject);
        case "created-desc":
          return byDate(right.createdAt) - byDate(left.createdAt) || left.subject.localeCompare(right.subject);
        case "updated-desc":
        default:
          return byDate(right.updatedAt) - byDate(left.updatedAt) || left.subject.localeCompare(right.subject);
      }
    });

    return filtered;
  });

  const todosByQuadrant = computed(() => ({
    1: filteredTodos.value.filter((todo) => todo.quadrant === 1),
    2: filteredTodos.value.filter((todo) => todo.quadrant === 2),
    3: filteredTodos.value.filter((todo) => todo.quadrant === 3),
    4: filteredTodos.value.filter((todo) => todo.quadrant === 4),
  }));

  const mobileTodos = computed(() => todosByQuadrant.value[activeMobileQuadrant.value]);
  const dragPreviewTodo = computed(() => findTodoBySelectionKey(todoPointerDragState.todoId));
  const dragPreviewStyle = computed(() => ({
    transform: `translate(${todoPointerDragState.x + 12}px, ${todoPointerDragState.y + 12}px)`,
  }));

  let suppressTodoClickUntil = 0;

  function updateTodoDropTarget(clientX: number, clientY: number) {
    if (typeof document === "undefined") {
      todoPointerDragState.hoverQuadrant = null;
      todoPointerDragState.hoverRecycle = false;
      return;
    }

    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const recycleTarget = target?.closest("[data-todo-drop-target='recycle']");
    const quadrantTarget = target?.closest("[data-todo-quadrant]");
    todoPointerDragState.hoverRecycle = Boolean(recycleTarget);
    todoPointerDragState.hoverQuadrant = quadrantTarget
      ? Number(quadrantTarget.getAttribute("data-todo-quadrant")) as TodoQuadrant
      : null;
  }

  function resetTodoPointerDrag() {
    if (todoPointerDragState.active) {
      endDrag();
    }
    todoPointerDragState.todoId = "";
    todoPointerDragState.active = false;
    todoPointerDragState.started = false;
    todoPointerDragState.pointerId = null;
    todoPointerDragState.pointerType = "";
    todoPointerDragState.startX = 0;
    todoPointerDragState.startY = 0;
    todoPointerDragState.x = 0;
    todoPointerDragState.y = 0;
    todoPointerDragState.hoverQuadrant = null;
    todoPointerDragState.hoverRecycle = false;
  }

  function startTodoPointerDrag(clientX: number, clientY: number) {
    if (!todoPointerDragState.todoId || todoPointerDragState.started) {
      return;
    }
    todoPointerDragState.active = true;
    todoPointerDragState.started = true;
    todoPointerDragState.x = clientX;
    todoPointerDragState.y = clientY;
    beginDrag(todoPointerDragState.todoId);
    updateTodoDropTarget(clientX, clientY);
  }

  function shouldSuppressTodoCardClick() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    return now < suppressTodoClickUntil;
  }

  function handleTodoPointerDown(todoId: string, event: PointerEvent) {
    if (event.button === 2) {
      return;
    }

    todoPointerDragState.todoId = todoId;
    todoPointerDragState.pointerId = event.pointerId;
    todoPointerDragState.pointerType = event.pointerType;
    todoPointerDragState.startX = event.clientX;
    todoPointerDragState.startY = event.clientY;
    todoPointerDragState.x = event.clientX;
    todoPointerDragState.y = event.clientY;
    todoPointerDragState.hoverQuadrant = null;
    todoPointerDragState.hoverRecycle = false;
  }

  function handleTodoPointerMove(event: PointerEvent) {
    if (todoPointerDragState.pointerId !== event.pointerId || !todoPointerDragState.todoId) {
      return;
    }

    todoPointerDragState.x = event.clientX;
    todoPointerDragState.y = event.clientY;

    if (!todoPointerDragState.started) {
      const distance = Math.hypot(
        event.clientX - todoPointerDragState.startX,
        event.clientY - todoPointerDragState.startY,
      );
      if (distance >= DRAG_START_DISTANCE) {
        if (event.pointerType === "touch" && event.cancelable) {
          event.preventDefault();
        }
        startTodoPointerDrag(event.clientX, event.clientY);
      }
      return;
    }

    if (todoPointerDragState.active) {
      if (event.pointerType === "touch" && event.cancelable) {
        event.preventDefault();
      }
      updateTodoDropTarget(event.clientX, event.clientY);
    }
  }

  async function handleTodoPointerUp(event: PointerEvent) {
    if (todoPointerDragState.pointerId !== event.pointerId) {
      return;
    }

    const hoveredQuadrant = todoPointerDragState.hoverQuadrant;
    const hoveredRecycle = todoPointerDragState.hoverRecycle;
    const draggedIds = [...draggedTodoIds.value];
    const shouldDelete = todoPointerDragState.active && hoveredRecycle && draggedIds.length > 0;
    const shouldMove = todoPointerDragState.active
      && Boolean(hoveredQuadrant)
      && draggedIds.some((todoId) => findTodoBySelectionKey(todoId)?.quadrant !== hoveredQuadrant);

    if (todoPointerDragState.active || todoPointerDragState.started) {
      suppressTodoClickUntil = typeof performance !== "undefined" ? performance.now() + 250 : Date.now() + 250;
    }

    resetTodoPointerDrag();

    if (shouldDelete) {
      await deleteTodos(draggedIds);
      return;
    }

    if (shouldMove && hoveredQuadrant) {
      await moveTodos(draggedIds, hoveredQuadrant);
    }
  }

  function handleTodoPointerCancel() {
    resetTodoPointerDrag();
  }

  function setSelectedTodoIds(ids: string[]) {
    selectedTodoIds.value = Array.from(new Set(ids)).filter((id) =>
      todos.value.some((todo) => todo.selectionKey === id),
    );
  }

  function clearSelection() {
    selectedTodoIds.value = [];
  }

  function isSelected(todoKey: string) {
    return selectedTodoSet.value.has(todoKey);
  }

  function selectTodo(todoKey: string, additive = false) {
    if (additive) {
      if (isSelected(todoKey)) {
        selectedTodoIds.value = selectedTodoIds.value.filter((id) => id !== todoKey);
      } else {
        selectedTodoIds.value = [...selectedTodoIds.value, todoKey];
      }
      return;
    }

    selectedTodoIds.value = [todoKey];
  }

  function findTodoBySelectionKey(todoKey: string | null) {
    return todoKey ? todos.value.find((todo) => todo.selectionKey === todoKey) ?? null : null;
  }

  function defaultDraftDatabaseId() {
    if (draftDatabaseId.value && databaseInfoById.value[draftDatabaseId.value]) {
      return draftDatabaseId.value;
    }

    if (options.preferredDatabaseId.value && databaseInfoById.value[options.preferredDatabaseId.value]) {
      return options.preferredDatabaseId.value;
    }

    return options.databases.value[0]?.id ?? null;
  }

  function startCreateTodo(
    quadrant: TodoQuadrant = activeMobileQuadrant.value,
    databaseId = defaultDraftDatabaseId(),
  ) {
    dialogMode.value = "create";
    dialogTodoId.value = null;
    draftDatabaseId.value = databaseId;
    dialogAttachments.value = [];
    draft.value = {
      ...EMPTY_TODO_DRAFT,
      quadrant,
    };
    dialogVisible.value = true;
  }

  async function openTodo(todoKey: string) {
    const existingTodo = todos.value.find((entry) => entry.selectionKey === todoKey);
    if (!existingTodo) {
      return;
    }

    let todo = existingTodo;
    try {
      const database = await options.getDatabase(existingTodo.databaseId);
      const document = database ? await database.documents.get(existingTodo.id) : null;
      if (document) {
        todo = readTodoItem(document, existingTodo.databaseId);
      }
    } catch {
      // Fall back to the currently listed row when the full document cannot be fetched.
    }

    dialogMode.value = "edit";
    dialogTodoId.value = todo.selectionKey;
    draftDatabaseId.value = todo.databaseId;
    draft.value = {
      subject: todo.subject,
      assignedTo: todo.assignedTo,
      description: todo.description,
      quadrant: todo.quadrant,
      dueAt: todo.dueAt,
      startAt: todo.startAt,
      completed: todo.completed,
    };
    dialogAttachments.value = [...todo.attachments];
    dialogVisible.value = true;
  }

  function closeDialog() {
    dialogVisible.value = false;
    draftDatabaseId.value = null;
    dialogAttachments.value = [];
  }

  function setDraft<K extends keyof TodoDraft>(key: K, value: TodoDraft[K]) {
    draft.value = {
      ...draft.value,
      [key]: value,
    };
  }

  async function listDatabaseTodos(databaseId: string, searchIndex: Document<TodoSearchDocument>) {
    const databaseInfo = databaseInfoById.value[databaseId];
    if (!databaseInfo?.capabilities.includes("read")) {
      return [];
    }

    const database = await options.getDatabase(databaseId);
    if (!database) {
      return [];
    }

    const items: TodoItem[] = [];
    let cursor: string | null = null;

    while (true) {
      const page = await database.documents.list({
        cursor,
        limit: 250,
        status: "existing",
      });

      items.push(...page.items.map((item) => {
        const todo = readTodoItem(item, databaseId);
        addTodoToSearchIndex(searchIndex, todo);
        return todo;
      }));
      if (!page.nextCursor || page.nextCursor === cursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    return items;
  }

  async function listAllTodos() {
    const readableDatabaseIds = options.selectedDatabaseIds.value.filter((databaseId) =>
      databaseInfoById.value[databaseId]?.capabilities.includes("read") ?? false,
    );

    if (!readableDatabaseIds.length) {
      todos.value = [];
      todoSearchIndex.value = null;
      clearSelection();
      return;
    }

    const searchIndex = createTodoSearchIndex();
    const groups = await Promise.all(readableDatabaseIds.map(async (databaseId) => await listDatabaseTodos(databaseId, searchIndex)));
    todos.value = groups.flat();
    todoSearchIndex.value = searchIndex;
    setSelectedTodoIds(selectedTodoIds.value);
    if (dialogTodoId.value) {
      applyDialogAttachmentsFromTodoList(dialogTodoId.value);
    }
  }

  async function refreshTodos() {
    options.error.value = null;
    options.loading.value = true;
    try {
      await listAllTodos();
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to refresh todos.");
      throw error;
    } finally {
      options.loading.value = false;
    }
  }

  function canUseTodoAttachments(todoKey: string) {
    const todo = findTodoBySelectionKey(todoKey);
    if (!todo) {
      return false;
    }
    return databaseInfoById.value[todo.databaseId]?.capabilities.includes("attachments") ?? false;
  }

  function canManageTodoAttachments(todoKey: string) {
    const todo = findTodoBySelectionKey(todoKey);
    if (!todo) {
      return false;
    }
    const capabilities = databaseInfoById.value[todo.databaseId]?.capabilities ?? [];
    return capabilities.includes("attachments") && capabilities.includes("update");
  }

  function applyDialogAttachmentsFromTodoList(todoKey: string) {
    if (dialogTodoId.value !== todoKey) {
      return;
    }
    const todo = findTodoBySelectionKey(todoKey);
    dialogAttachments.value = todo ? [...todo.attachments] : [];
  }

  function getTodoAttachmentCount(todoKey: string) {
    return findTodoBySelectionKey(todoKey)?.attachments.length ?? 0;
  }

  function getTodoAttachmentTooltip(todoKey: string) {
    const todo = findTodoBySelectionKey(todoKey);
    const items = todo?.attachments;
    if (!items?.length) {
      return "No attachments";
    }

    return items
      .map((attachment) => `${attachment.fileName} (${formatAttachmentSize(attachment.size)})`)
      .join("\n");
  }

  async function uploadTodoAttachments(todoKey: string | null, fileList: FileList | readonly File[] | null) {
    const todo = findTodoBySelectionKey(todoKey);
    const files = fileList ? Array.from(fileList) : [];
    if (!todo || !files.length) {
      return;
    }
    if (!canManageTodoAttachments(todo.selectionKey)) {
      throw new Error("This todo does not allow managing attachments.");
    }

    const database = await options.getDatabase(todo.databaseId);
    if (!database) {
      throw new Error("Failed to open the todo database.");
    }

    options.busyAction.value = "Uploading attachment";
    options.error.value = null;

    try {
      for (const file of files) {
        const stream = await database.attachments.openWriteStream(
          todo.id,
          file.name,
          file.type || "application/octet-stream",
        );

        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const chunkSize = 64 * 1024;
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            await stream.write(bytes.slice(offset, offset + chunkSize));
          }
          await stream.close();
        } catch (streamError) {
          await stream.abort();
          throw streamError;
        }
      }

      attachmentUploadInputKey.value += 1;
      await listAllTodos();
      options.setSuccess(`Uploaded ${files.length} attachment${files.length === 1 ? "" : "s"}.`);
    } catch (uploadError) {
      options.error.value = readErrorMessage(uploadError, "The attachment upload failed.");
      throw uploadError;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function uploadDialogAttachments(fileList: FileList | readonly File[] | null) {
    await uploadTodoAttachments(dialogTodoId.value, fileList);
  }

  async function previewDialogAttachment(attachmentName: string) {
    const todo = currentDialogTodo.value;
    if (!todo || !canUseDialogAttachments.value) {
      return;
    }

    const database = await options.getDatabase(todo.databaseId);
    if (!database) {
      throw new Error("Failed to open the todo database.");
    }

    options.busyAction.value = "Opening attachment preview";
    options.error.value = null;

    try {
      await database.attachments.openPreview(todo.id, attachmentName);
    } catch (previewError) {
      options.error.value = readErrorMessage(previewError, "The attachment preview could not be opened.");
      throw previewError;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function downloadDialogAttachment(attachmentName: string) {
    const todo = currentDialogTodo.value;
    if (!todo || !canUseDialogAttachments.value) {
      return;
    }

    const database = await options.getDatabase(todo.databaseId);
    if (!database) {
      throw new Error("Failed to open the todo database.");
    }

    options.busyAction.value = "Extracting attachment";
    options.error.value = null;

    try {
      const blob = await readAttachmentBlob(database, todo.id, attachmentName);
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = attachmentName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      options.error.value = readErrorMessage(downloadError, "The attachment could not be extracted.");
      throw downloadError;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function removeDialogAttachment(attachmentName: string) {
    const todo = currentDialogTodo.value;
    if (!todo || !canManageDialogAttachments.value) {
      return;
    }

    const database = await options.getDatabase(todo.databaseId);
    if (!database) {
      throw new Error("Failed to open the todo database.");
    }

    options.busyAction.value = "Removing attachment";
    options.error.value = null;

    try {
      await database.attachments.remove(todo.id, attachmentName);
      attachmentUploadInputKey.value += 1;
      await listAllTodos();
      options.setSuccess(`Removed attachment ${attachmentName}.`);
    } catch (removeError) {
      options.error.value = readErrorMessage(removeError, "The attachment could not be removed.");
      throw removeError;
    } finally {
      options.busyAction.value = null;
    }
  }

  function canPreviewDialogAttachment(fileName: string, mimeType: string) {
    return canPreviewAttachment(fileName, mimeType);
  }

  async function saveDialogTodo() {
    const nextSubject = draft.value.subject.trim();
    if (!nextSubject) {
      options.error.value = "A subject is required.";
      return;
    }

    options.error.value = null;
    options.busyAction.value = dialogMode.value === "create" ? "Creating todo" : "Saving todo";

    try {
      if (dialogMode.value === "create") {
        const targetDatabaseId = draftDatabaseId.value ?? defaultDraftDatabaseId();
        if (!targetDatabaseId) {
          throw new Error("No target database is available for new todos.");
        }

        if (!(databaseInfoById.value[targetDatabaseId]?.capabilities.includes("create") ?? false)) {
          throw new Error("The selected database does not allow creating todos.");
        }

        const targetDatabase = await options.getDatabase(targetDatabaseId);
        if (!targetDatabase) {
          throw new Error("Failed to open the selected database.");
        }

        const created = await targetDatabase.documents.create(buildTodoCreateInput({
          ...draft.value,
          subject: nextSubject,
        }));
        await listAllTodos();
        setSelectedTodoIds([buildTodoSelectionKey(targetDatabaseId, created.id)]);
        options.setSuccess(`Created todo "${nextSubject}".`);
      } else {
        const current = todos.value.find((todo) => todo.selectionKey === dialogTodoId.value) ?? null;
        if (!current) {
          throw new Error("The todo could not be found.");
        }
        if (!(databaseInfoById.value[current.databaseId]?.capabilities.includes("update") ?? false)) {
          throw new Error("The selected database does not allow updating todos.");
        }

        const targetDatabase = await options.getDatabase(current.databaseId);
        if (!targetDatabase) {
          throw new Error("Failed to open the todo database.");
        }

        await targetDatabase.documents.update(
          current.id,
          buildTodoPatch(current, {
            ...draft.value,
            subject: nextSubject,
          }),
        );
        await listAllTodos();
        setSelectedTodoIds([current.selectionKey]);
        options.setSuccess(`Saved todo "${nextSubject}".`);
      }

      dialogVisible.value = false;
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to save the todo.");
      throw error;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function deleteTodos(todoIds: string[]) {
    if (!todoIds.length) {
      return;
    }

    options.busyAction.value = todoIds.length > 1 ? "Deleting todos" : "Deleting todo";
    options.error.value = null;
    try {
      const todosToDelete = todoIds
        .map((todoId) => todos.value.find((todo) => todo.selectionKey === todoId) ?? null)
        .filter((todo): todo is TodoItem => Boolean(todo));

      if (!todosToDelete.length) {
        return;
      }

      const groupedTodos = new Map<string, TodoItem[]>();
      for (const todo of todosToDelete) {
        if (!(databaseInfoById.value[todo.databaseId]?.capabilities.includes("delete") ?? false)) {
          throw new Error("One or more selected databases do not allow deleting todos.");
        }
        groupedTodos.set(todo.databaseId, [...(groupedTodos.get(todo.databaseId) ?? []), todo]);
      }

      await Promise.all(Array.from(groupedTodos.entries()).map(async ([databaseId, databaseTodos]) => {
        const database = await options.getDatabase(databaseId);
        if (!database) {
          throw new Error("Failed to open one of the selected databases.");
        }
        await Promise.all(databaseTodos.map(async (todo) => await database.documents.delete(todo.id)));
      }));
      await listAllTodos();
      clearSelection();
      options.setSuccess(todoIds.length > 1 ? `Deleted ${todoIds.length} todos.` : "Deleted todo.");
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to delete the selected todos.");
      throw error;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function deleteSelectedTodos() {
    await deleteTodos(selectedTodoIds.value);
  }

  async function moveTodos(todoIds: string[], quadrant: TodoQuadrant) {
    if (!todoIds.length) {
      return;
    }

    options.busyAction.value = todoIds.length > 1 ? "Moving todos" : "Moving todo";
    options.error.value = null;
    try {
      const todosToMove = todoIds
        .map((todoId) => todos.value.find((todo) => todo.selectionKey === todoId) ?? null)
        .filter((todo): todo is TodoItem => Boolean(todo));

      if (!todosToMove.length) {
        return;
      }

      const groupedTodos = new Map<string, TodoItem[]>();
      for (const todo of todosToMove) {
        if (!(databaseInfoById.value[todo.databaseId]?.capabilities.includes("update") ?? false)) {
          throw new Error("One or more selected databases do not allow updating todos.");
        }
        groupedTodos.set(todo.databaseId, [...(groupedTodos.get(todo.databaseId) ?? []), todo]);
      }

      await Promise.all(Array.from(groupedTodos.entries()).map(async ([databaseId, databaseTodos]) => {
        const database = await options.getDatabase(databaseId);
        if (!database) {
          throw new Error("Failed to open one of the selected databases.");
        }
        await Promise.all(databaseTodos.map(async (todo) => {
          await database.documents.update(todo.id, {
            set: {
              quadrant,
              updatedAt: new Date().toISOString(),
            },
          });
        }));
      }));
      await listAllTodos();
      setSelectedTodoIds(todoIds);
      activeMobileQuadrant.value = quadrant;
      options.setSuccess(todoIds.length > 1 ? `Moved ${todoIds.length} todos.` : "Moved todo.");
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to move the selected todos.");
      throw error;
    } finally {
      options.busyAction.value = null;
    }
  }

  async function moveSelectedTodos(quadrant: TodoQuadrant) {
    await moveTodos(selectedTodoIds.value, quadrant);
  }

  async function setTodosCompleted(todoIds: string[], completed: boolean) {
    if (!todoIds.length) {
      return;
    }

    options.busyAction.value = completed ? "Completing todo" : "Reopening todo";
    options.error.value = null;
    try {
      const todosToUpdate = todoIds
        .map((todoId) => todos.value.find((todo) => todo.selectionKey === todoId) ?? null)
        .filter((todo): todo is TodoItem => Boolean(todo));

      if (!todosToUpdate.length) {
        return;
      }

      const groupedTodos = new Map<string, TodoItem[]>();
      for (const todo of todosToUpdate) {
        if (!(databaseInfoById.value[todo.databaseId]?.capabilities.includes("update") ?? false)) {
          throw new Error("One or more selected databases do not allow updating todos.");
        }
        groupedTodos.set(todo.databaseId, [...(groupedTodos.get(todo.databaseId) ?? []), todo]);
      }

      await Promise.all(Array.from(groupedTodos.entries()).map(async ([databaseId, databaseTodos]) => {
        const database = await options.getDatabase(databaseId);
        if (!database) {
          throw new Error("Failed to open one of the selected databases.");
        }
        await Promise.all(databaseTodos.map(async (todo) => {
          await database.documents.update(todo.id, {
            set: {
              completed,
              updatedAt: new Date().toISOString(),
            },
          });
        }));
      }));
      await listAllTodos();
      setSelectedTodoIds(todoIds);
      options.setSuccess(
        completed
          ? (todoIds.length > 1 ? `Marked ${todoIds.length} todos as completed.` : "Marked todo as completed.")
          : (todoIds.length > 1 ? `Marked ${todoIds.length} todos as not completed.` : "Marked todo as not completed."),
      );
    } catch (error) {
      options.error.value = readErrorMessage(error, "Failed to update the selected todos.");
      throw error;
    } finally {
      options.busyAction.value = null;
    }
  }

  function beginDrag(todoId: string) {
    const ids = isSelected(todoId) ? [...selectedTodoIds.value] : [todoId];
    setSelectedTodoIds(ids);
    draggedTodoIds.value = ids;
    return ids;
  }

  function endDrag() {
    draggedTodoIds.value = [];
  }

  onMounted(() => {
    document.addEventListener("pointermove", handleTodoPointerMove);
    document.addEventListener("pointerup", handleTodoPointerUp);
    document.addEventListener("pointercancel", handleTodoPointerCancel);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointermove", handleTodoPointerMove);
    document.removeEventListener("pointerup", handleTodoPointerUp);
    document.removeEventListener("pointercancel", handleTodoPointerCancel);
  });

  return {
    todos,
    selectedTodoIds,
    selectedTodoSet,
    selectedCount,
    selectedTodos,
    selectedQuadrants,
    draggedTodoIds,
    dialogVisible,
    dialogMode,
    dialogTodoId,
    draftDatabaseId,
    dialogAttachments,
    dialogDatabaseId,
    dialogDatabaseInfo,
    dialogDocumentId,
    attachmentUploadInputKey,
    draft,
    searchQuery,
    filterMode,
    sortMode,
    activeMobileQuadrant,
    todoPointerDragState,
    dragPreviewTodo,
    dragPreviewStyle,
    createTargetDatabases,
    canCreateAny,
    canUpdateSelected,
    canDeleteSelected,
    canUseDialogAttachments,
    canManageDialogAttachments,
    filteredTodos,
    todosByQuadrant,
    mobileTodos,
    setSelectedTodoIds,
    clearSelection,
    isSelected,
    selectTodo,
    startCreateTodo,
    openTodo,
    closeDialog,
    setDraft,
    formatAttachmentSize,
    refreshTodos,
    saveDialogTodo,
    deleteTodos,
    deleteSelectedTodos,
    moveTodos,
    moveSelectedTodos,
    setTodosCompleted,
    canUseTodoAttachments,
    canManageTodoAttachments,
    uploadTodoAttachments,
    uploadDialogAttachments,
    previewDialogAttachment,
    downloadDialogAttachment,
    removeDialogAttachment,
    canPreviewDialogAttachment,
    getTodoAttachmentCount,
    getTodoAttachmentTooltip,
    beginDrag,
    endDrag,
    handleTodoPointerDown,
    shouldSuppressTodoCardClick,
  };
}
