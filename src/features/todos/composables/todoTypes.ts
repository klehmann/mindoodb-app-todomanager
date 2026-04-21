import type {
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
  description: string;
  quadrant: TodoQuadrant;
  dueAt: string | null;
  startAt: string | null;
  completed: boolean;
};

export type TodoItem = TodoDraft & {
  id: string;
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

export const EMPTY_TODO_DRAFT: TodoDraft = {
  subject: "",
  description: "",
  quadrant: 1,
  dueAt: null,
  startAt: null,
  completed: false,
};

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
    description: normalizeText(data?.description),
    quadrant: normalizeQuadrant(data?.quadrant),
    dueAt: normalizeNullableIso(data?.dueAt),
    startAt: normalizeNullableIso(data?.startAt),
    completed: normalizeBoolean(data?.completed),
  };
}

export function readTodoItem(
  summary: MindooDBAppDocumentSummary | MindooDBAppDocument,
): TodoItem {
  const data = summary.data ?? {};
  const draft = readTodoDraft(data);
  const createdAt = normalizeNullableIso(data.createdAt);

  return {
    ...draft,
    id: summary.id,
    createdAt,
    updatedAt: normalizeNullableIso(summary.updatedAt) ?? normalizeNullableIso(data.updatedAt),
  };
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
