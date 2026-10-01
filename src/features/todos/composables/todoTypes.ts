import type {
  MindooDBAppAttachmentInfo,
  MindooDBAppDocument,
  MindooDBAppDocumentSummary,
} from "mindoodb-app-sdk";

export type TodoQuadrant = 1 | 2 | 3 | 4;

export type TodoSyncMode = "off" | "10s" | "30s" | "60s";
export type TodoSyncState = "idle" | "syncing" | "error";
export type TodoSortMode = "updated-desc" | "subject-asc" | "due-asc" | "created-desc";
export type TodoFilterMode = "open" | "completed" | "all";

export type TodoDraft = {
  subject: string;
  assignedTo: string;
  description: string;
  quadrant: TodoQuadrant;
  dueAt: string | null;
  startAt: string | null;
  completed: boolean;
};

/**
 * Where a todo came from when another app (or an agent on its behalf) created
 * it, e.g. `{ app: "vega", id: "<mapId>/<nodeId>" }`. Not shown in the UI; it
 * lets agents find the todo again instead of creating a duplicate.
 */
export type TodoOrigin = {
  app: string;
  id: string;
  label?: string;
};

export type TodoItem = TodoDraft & {
  id: string;
  /**
   * Directory user id (canonical name) of the assignee when the todo was
   * assigned to a person from the tenant directory; `assignedTo` then holds
   * that person's readable name. `null` for free-text assignees.
   */
  assignedToId: string | null;
  origin: TodoOrigin | null;
  databaseId: string;
  selectionKey: string;
  /** Derived from `attachments.length`; kept for quick checks. */
  attachmentCount: number;
  attachments: MindooDBAppAttachmentInfo[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type TodoQuadrantDefinition = {
  quadrant: TodoQuadrant;
  title: string;
  subtitle: string;
};

export const TODO_QUADRANTS: TodoQuadrantDefinition[] = [
  { quadrant: 1, title: "Due Soon", subtitle: "Important" },
  { quadrant: 2, title: "Not Due Soon", subtitle: "Important" },
  { quadrant: 3, title: "Due Soon", subtitle: "Not Important" },
  { quadrant: 4, title: "Not Due Soon", subtitle: "Not Important" },
];

/** Fields of a todo document that undo/redo restores. */
export const TODO_STORED_FIELDS = [
  "subject",
  "assignedTo",
  "description",
  "quadrant",
  "dueAt",
  "startAt",
  "completed",
  "assignedToId",
  "originApp",
  "originId",
  "originLabel",
] as const;

export type TodoStoredField = (typeof TODO_STORED_FIELDS)[number];
export type TodoSnapshot = Record<TodoStoredField, unknown>;

/** Quadrant from the two questions of the method: important? urgent (due soon)? */
export function quadrantFor(important: boolean, urgent: boolean): TodoQuadrant {
  if (important) {
    return urgent ? 1 : 2;
  }
  return urgent ? 3 : 4;
}

export function quadrantTraits(quadrant: TodoQuadrant) {
  return { important: quadrant <= 2, urgent: quadrant === 1 || quadrant === 3 };
}

export function readTodoOrigin(data: Record<string, unknown> | null | undefined): TodoOrigin | null {
  const app = normalizeText(data?.originApp).trim();
  const id = normalizeText(data?.originId).trim();
  if (!app || !id) {
    return null;
  }
  const label = normalizeText(data?.originLabel).trim();
  return label ? { app, id, label } : { app, id };
}

/** The stored fields of a todo, for undo. */
export function snapshotTodo(todo: TodoItem): TodoSnapshot {
  return {
    subject: todo.subject,
    assignedTo: todo.assignedTo,
    description: todo.description,
    quadrant: todo.quadrant,
    dueAt: todo.dueAt,
    startAt: todo.startAt,
    completed: todo.completed,
    assignedToId: todo.assignedToId,
    originApp: todo.origin?.app ?? null,
    originId: todo.origin?.id ?? null,
    originLabel: todo.origin?.label ?? null,
  };
}

export const EMPTY_TODO_DRAFT: TodoDraft = {
  subject: "",
  assignedTo: "",
  description: "",
  quadrant: 1,
  dueAt: null,
  startAt: null,
  completed: false,
};

function asAttachmentString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asAttachmentSize(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeSdkAttachmentList(attachments: readonly MindooDBAppAttachmentInfo[]) {
  return attachments.map((attachment, index) => ({
    attachmentId: asAttachmentString(attachment.attachmentId, `attachment-${index}`),
    fileName: asAttachmentString(attachment.fileName, attachment.attachmentId || `attachment-${index}`),
    mimeType: asAttachmentString(attachment.mimeType, "application/octet-stream"),
    size: asAttachmentSize(attachment.size),
  }));
}

/**
 * Reads attachment metadata from the document JSON `data._attachments` array
 * (same source as the Vega app and MindooDB server payload).
 */
export function readAttachmentsFromDocData(data: Record<string, unknown> | null | undefined) {
  const raw = data?._attachments;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const row = entry as Record<string, unknown>;
    const attachmentId = asAttachmentString(row.attachmentId, `attachment-${index}`);
    const fileName = asAttachmentString(row.fileName, attachmentId);
    return [{
      attachmentId,
      fileName,
      mimeType: asAttachmentString(row.mimeType, "application/octet-stream"),
      size: asAttachmentSize(row.size),
    } satisfies MindooDBAppAttachmentInfo];
  });
}

function resolveAttachments(
  document: Pick<MindooDBAppDocument, "data"> & { attachments?: readonly MindooDBAppAttachmentInfo[] | null },
) {
  const data = (document.data ?? {}) as Record<string, unknown>;
  if (document.attachments && document.attachments.length > 0) {
    return normalizeSdkAttachmentList(document.attachments);
  }

  return readAttachmentsFromDocData(data);
}

function normalizeQuadrant(value: unknown): TodoQuadrant {
  if (value === 2 || value === 3 || value === 4) {
    return value;
  }

  return 1;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeNullableIso(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

export function readTodoDraft(data: Record<string, unknown> | null | undefined): TodoDraft {
  return {
    subject: normalizeText(data?.subject),
    assignedTo: normalizeText(data?.assignedTo),
    description: normalizeText(data?.description),
    quadrant: normalizeQuadrant(data?.quadrant),
    dueAt: normalizeNullableIso(data?.dueAt),
    startAt: normalizeNullableIso(data?.startAt),
    completed: normalizeBoolean(data?.completed),
  };
}

export function readTodoItem(
  summary: MindooDBAppDocumentSummary | MindooDBAppDocument,
  databaseId: string,
): TodoItem {
  const data = (summary.data ?? {}) as Record<string, unknown>;
  const draft = readTodoDraft(data);
  const createdAt = normalizeNullableIso(data.createdAt);
  const attachments = resolveAttachments(summary as MindooDBAppDocument);
  const attachmentCount = attachments.length;

  return {
    ...draft,
    id: summary.id,
    assignedToId: normalizeText(data.assignedToId).trim() || null,
    origin: readTodoOrigin(data),
    databaseId,
    selectionKey: buildTodoSelectionKey(databaseId, summary.id),
    attachments,
    attachmentCount,
    createdAt,
    updatedAt: normalizeNullableIso(summary.updatedAt) ?? normalizeNullableIso(data.updatedAt),
  };
}

export function buildTodoSelectionKey(databaseId: string, todoId: string) {
  return `${databaseId}:${todoId}`;
}

export function buildTodoCreateInput(draft: TodoDraft) {
  const now = new Date().toISOString();

  return {
    set: {
      ...draft,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function buildTodoPatch(current: TodoItem | null, draft: TodoDraft) {
  const set: Record<string, unknown> = {
    subject: draft.subject,
    assignedTo: draft.assignedTo,
    description: draft.description,
    quadrant: draft.quadrant,
    dueAt: draft.dueAt,
    startAt: draft.startAt,
    completed: draft.completed,
    updatedAt: new Date().toISOString(),
  };

  if (!current?.createdAt) {
    set.createdAt = new Date().toISOString();
  }

  return { set };
}

export function quadrantDefinition(quadrant: TodoQuadrant) {
  return TODO_QUADRANTS.find((entry) => entry.quadrant === quadrant) ?? TODO_QUADRANTS[0];
}
