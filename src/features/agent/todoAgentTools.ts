/**
 * TodoManager's tools for AI agents (WebMCP through Haven).
 *
 * Agents see todos in plain words: subject, quadrant with what it means
 * (important? urgent?), notes, assignee, dates, done or not, and where a todo
 * came from. Storage field names and the document API stay inside the app.
 * Every write is one undo step marked as made by an agent.
 */
import {
  MindooDBAppAgentToolError,
  type MindooDBAppAgentTool,
  type MindooDBAppDatabaseInfo,
} from "mindoodb-app-sdk";

import {
  quadrantFor,
  quadrantTraits,
  type TodoFilterMode,
  type TodoItem,
  type TodoQuadrant,
  type TodoSnapshot,
} from "@/features/todos/composables/todoTypes";
import { TodoUndoRefusedError, type TodoUndoStep } from "@/features/undo/todoUndo";

/** What the four quadrants mean, in the words agents get. */
export const QUADRANT_GUIDE = {
  1: "important and urgent (due soon): do it now",
  2: "important, not urgent: plan it",
  3: "urgent, not important: delegate or batch it",
  4: "neither important nor urgent: reduce or drop it",
} as const;

const QUADRANT_HELP =
  "Todos sit in four quadrants (Covey / Eisenhower): 1 = important and urgent, 2 = important, not urgent, " +
  "3 = urgent, not important, 4 = neither. The app labels urgent as 'Due Soon'.";

export type AgentTodo = {
  todoId: string;
  databaseId: string;
  subject: string;
  quadrant: TodoQuadrant;
  important: boolean;
  urgent: boolean;
  completed: boolean;
  notes?: string;
  assignee?: string;
  start?: string;
  due?: string;
  overdue?: boolean;
  attachments?: number;
  origin?: { app: string; id: string; label?: string };
  created?: string;
  updated?: string;
};

export type TodoAgentContext = {
  readOnly: boolean;
  databases: Array<{ databaseId: string; title: string; shown: boolean; canCreate: boolean }>;
  filter: TodoFilterMode;
  search: string;
  openTodos: Record<TodoQuadrant, number>;
  selected: AgentTodo[];
  openInDialog: AgentTodo | null;
};

export type TodoAgentDeps = {
  databases: () => MindooDBAppDatabaseInfo[];
  /** Databases the board currently shows. */
  shownDatabaseIds: () => string[];
  defaultDatabaseId: () => string | null;
  readOnly: () => boolean;
  loadTodos: (databaseId: string) => Promise<TodoItem[]>;
  createTodos: (
    inputs: Array<{ databaseId: string; fields: Partial<TodoSnapshot> }>,
    label: string,
  ) => Promise<{ created: Array<{ databaseId: string; id: string }>; step: TodoUndoStep | null }>;
  editTodos: (
    edits: Array<{ todo: TodoItem; set: Partial<TodoSnapshot> }>,
    label: string,
  ) => Promise<{ step: TodoUndoStep | null }>;
  removeTodos: (todos: TodoItem[], label: string) => Promise<{ step: TodoUndoStep | null }>;
  undoSteps: () => TodoUndoStep[];
  undo: (input: { stepId?: string; includeUserSteps?: boolean }) => Promise<TodoUndoStep[]>;
  redo: (input: { stepId?: string }) => Promise<TodoUndoStep[]>;
  show: (input: { todoKeys: string[]; openKey?: string; filter?: TodoFilterMode; quadrant?: TodoQuadrant }) => Promise<void>;
  context: () => TodoAgentContext;
  /** Today as YYYY-MM-DD, injectable for tests. */
  today?: () => string;
};

const MAX_LIST = 500;
const MAX_BATCH = 100;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function day(value: string | null) {
  return value ? value.slice(0, 10) : undefined;
}

export function toAgentTodo(todo: TodoItem, today = todayIso()): AgentTodo {
  const due = day(todo.dueAt);
  return {
    todoId: todo.id,
    databaseId: todo.databaseId,
    subject: todo.subject,
    quadrant: todo.quadrant,
    ...quadrantTraits(todo.quadrant),
    completed: todo.completed,
    ...(todo.description.trim() ? { notes: todo.description } : {}),
    ...(todo.assignedTo.trim() ? { assignee: todo.assignedTo } : {}),
    ...(day(todo.startAt) ? { start: day(todo.startAt) } : {}),
    ...(due ? { due } : {}),
    ...(due && !todo.completed && due < today ? { overdue: true } : {}),
    ...(todo.attachmentCount ? { attachments: todo.attachmentCount } : {}),
    ...(todo.origin ? { origin: { ...todo.origin } } : {}),
    ...(todo.createdAt ? { created: todo.createdAt } : {}),
    ...(todo.updatedAt ? { updated: todo.updatedAt } : {}),
  };
}

// --- input helpers -------------------------------------------------------

function invalid(message: string): never {
  throw new MindooDBAppAgentToolError("INVALID_INPUT", message);
}

function optionalString(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") invalid(`${field} must be a string.`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalBoolean(input: Record<string, unknown>, field: string): boolean | undefined {
  const value = input[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") invalid(`${field} must be true or false.`);
  return value;
}

function optionalQuadrant(input: Record<string, unknown>, field = "quadrant"): TodoQuadrant | undefined {
  const value = input[field];
  if (value === undefined || value === null) return undefined;
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4) invalid(`${field} must be 1, 2, 3 or 4.`);
  return value;
}

/** `undefined` = not given, `null` = clear, else midnight UTC as the app stores dates. */
function optionalDate(input: Record<string, unknown>, field: string): string | null | undefined {
  if (!(field in input) || input[field] === undefined) return undefined;
  const value = input[field];
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${field} must be a date like 2026-10-31, or null to clear it.`);
  }
  return `${value}T00:00:00.000Z`;
}

function stringList(input: Record<string, unknown>, field: string): string[] {
  const value = input[field];
  if (!Array.isArray(value) || !value.length || !value.every((entry) => typeof entry === "string" && entry.trim())) {
    invalid(`${field} must be a non-empty list of ids.`);
  }
  if (value.length > MAX_BATCH) invalid(`At most ${MAX_BATCH} todos per call.`);
  return value.map((entry: string) => entry.trim());
}

function objectList(input: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const value = input[field];
  if (!Array.isArray(value) || !value.length) invalid(`${field} must be a non-empty list.`);
  if (value.length > MAX_BATCH) invalid(`At most ${MAX_BATCH} todos per call.`);
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid(`Every entry of ${field} must be an object.`);
    return entry as Record<string, unknown>;
  });
}

function readOrigin(value: unknown): { app: string; id: string; label?: string } | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) invalid("origin must be an object { app, id, label? }.");
  const record = value as Record<string, unknown>;
  const app = typeof record.app === "string" ? record.app.trim().toLowerCase() : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(app) || !id) invalid("origin needs app (e.g. vega) and id.");
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : undefined;
  return label ? { app, id, label } : { app, id };
}

/** Quadrant from `quadrant`, or from `important`/`urgent` on top of the current one. */
function resolveQuadrant(entry: Record<string, unknown>, current: TodoQuadrant | null): TodoQuadrant | undefined {
  const quadrant = optionalQuadrant(entry);
  const important = optionalBoolean(entry, "important");
  const urgent = optionalBoolean(entry, "urgent");
  if (quadrant !== undefined) {
    if (important !== undefined || urgent !== undefined) {
      invalid("Give either quadrant or important/urgent, not both.");
    }
    return quadrant;
  }
  if (important === undefined && urgent === undefined) {
    return undefined;
  }
  const base = current ? quadrantTraits(current) : { important: true, urgent: false };
  return quadrantFor(important ?? base.important, urgent ?? base.urgent);
}

function originFields(origin: { app: string; id: string; label?: string } | null): Partial<TodoSnapshot> {
  return origin
    ? { originApp: origin.app, originId: origin.id, originLabel: origin.label ?? null }
    : { originApp: null, originId: null, originLabel: null };
}

function textMatches(todo: TodoItem, query: string) {
  const haystack = [todo.subject, todo.description, todo.assignedTo, todo.origin?.label ?? ""].join("\n").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

const TODO_FIELDS_SCHEMA = {
  subject: { type: "string", description: "Short title of the todo." },
  notes: { type: "string", description: "Longer description. \"\" clears it." },
  important: { type: "boolean", description: "Important? Together with urgent this picks the quadrant." },
  urgent: { type: "boolean", description: "Urgent / due soon? Together with important this picks the quadrant." },
  quadrant: { type: "integer", enum: [1, 2, 3, 4], description: "Set the quadrant directly instead of important/urgent." },
  assignee: { type: "string", description: "Who does it (free text, usually a name). \"\" clears it." },
  start: { type: ["string", "null"], description: "Start date YYYY-MM-DD, null clears it." },
  due: { type: ["string", "null"], description: "Due date YYYY-MM-DD, null clears it." },
} as const;

const ORIGIN_SCHEMA = {
  type: "object",
  description:
    "Where the todo comes from, e.g. { app: \"vega\", id: \"<mapId>/<nodeId>\", label: \"Relaunch › Pricing\" }. " +
    "Hidden in the app; used to find the todo again and avoid duplicates.",
  required: ["app", "id"],
  properties: {
    app: { type: "string" },
    id: { type: "string" },
    label: { type: "string" },
  },
} as const;

export function createTodoAgentTools(deps: TodoAgentDeps): MindooDBAppAgentTool[] {
  const today = () => deps.today?.() ?? todayIso();

  function readableDatabases(databaseId?: string) {
    const all = deps.databases().filter((info) => info.capabilities.includes("read"));
    if (!databaseId) return all;
    const match = all.find((info) => info.id === databaseId);
    if (!match) {
      throw new MindooDBAppAgentToolError(
        "NOT_FOUND",
        `There is no readable todo database "${databaseId}".`,
        "call todo_get_context for the databases",
      );
    }
    return [match];
  }

  async function loadAll(databaseId?: string) {
    const lists = await Promise.all(readableDatabases(databaseId).map((info) => deps.loadTodos(info.id)));
    return lists.flat();
  }

  async function findTodos(todoIds: string[]) {
    const all = await loadAll();
    return todoIds.map((todoId) => {
      const todo = all.find((entry) => entry.id === todoId);
      if (!todo) {
        throw new MindooDBAppAgentToolError("NOT_FOUND", `There is no todo "${todoId}".`, "call todo_list to find it");
      }
      return todo;
    });
  }

  function requireWritable() {
    if (deps.readOnly()) {
      throw new MindooDBAppAgentToolError(
        "INVALID_STATE",
        "TodoManager shows an older state of the data (time travel) and is read-only.",
        "ask the user to leave time travel in Haven",
      );
    }
  }

  function stepResult(step: TodoUndoStep | null) {
    return step ? { undoStepId: step.id } : {};
  }

  async function reload(keys: Array<{ databaseId: string; id: string }>) {
    const byDatabase = new Map<string, TodoItem[]>();
    for (const key of keys) {
      if (!byDatabase.has(key.databaseId)) byDatabase.set(key.databaseId, await deps.loadTodos(key.databaseId));
    }
    return keys
      .map((key) => byDatabase.get(key.databaseId)?.find((todo) => todo.id === key.id))
      .filter((todo): todo is TodoItem => Boolean(todo))
      .map((todo) => toAgentTodo(todo, today()));
  }

  const getContext: MindooDBAppAgentTool = {
    name: "get_context",
    description:
      `What the user sees in TodoManager right now: databases (and which are shown), the filter, open todos per ` +
      `quadrant, selected todos and the todo open in the dialog. ${QUADRANT_HELP} Use it to resolve "this todo" ` +
      "or \"the selected ones\".",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute() {
      return { quadrants: QUADRANT_GUIDE, ...deps.context() };
    },
  };

  const list: MindooDBAppAgentTool = {
    name: "list",
    description:
      `Lists todos with todoId, subject, quadrant (with important/urgent), notes, assignee, start/due dates, ` +
      `overdue and origin. ${QUADRANT_HELP} By default only open (not completed) todos of all databases; filter ` +
      "by quadrant, importance, urgency, text, assignee, dates or origin. Sorted by quadrant, then due date.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "completed", "all"], description: "Default open." },
        quadrants: { type: "array", items: { type: "integer", enum: [1, 2, 3, 4] } },
        important: { type: "boolean" },
        urgent: { type: "boolean" },
        text: { type: "string", description: "Words that must all appear in subject, notes or assignee." },
        assignee: { type: "string", description: "Part of the assignee's name." },
        dueBefore: { type: "string", description: "YYYY-MM-DD, inclusive." },
        dueAfter: { type: "string", description: "YYYY-MM-DD, inclusive." },
        overdue: { type: "boolean", description: "Only open todos whose due date has passed." },
        origin: {
          type: "object",
          description: "Only todos from this origin: { app } or { app, id }.",
          properties: { app: { type: "string" }, id: { type: "string" } },
        },
        databaseId: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIST, description: "Default 100." },
      },
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute(input) {
      const status = optionalString(input, "status") ?? "open";
      if (!["open", "completed", "all"].includes(status)) invalid("status must be open, completed or all.");
      const quadrants = Array.isArray(input.quadrants) ? (input.quadrants as unknown[]) : undefined;
      if (quadrants && !quadrants.every((entry) => entry === 1 || entry === 2 || entry === 3 || entry === 4)) {
        invalid("quadrants must contain 1, 2, 3 or 4.");
      }
      const important = optionalBoolean(input, "important");
      const urgent = optionalBoolean(input, "urgent");
      const text = optionalString(input, "text");
      const assignee = optionalString(input, "assignee")?.toLowerCase();
      const dueBefore = optionalDate(input, "dueBefore")?.slice(0, 10);
      const dueAfter = optionalDate(input, "dueAfter")?.slice(0, 10);
      const overdue = optionalBoolean(input, "overdue");
      const origin = input.origin as { app?: unknown; id?: unknown } | undefined;
      const originApp = typeof origin?.app === "string" ? origin.app.trim().toLowerCase() : undefined;
      const originId = typeof origin?.id === "string" ? origin.id.trim() : undefined;
      const limitValue = input.limit;
      const limit =
        typeof limitValue === "number" && Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), MAX_LIST) : 100;
      const now = today();

      const matching = (await loadAll(optionalString(input, "databaseId")))
        .filter((todo) => (status === "open" ? !todo.completed : status === "completed" ? todo.completed : true))
        .filter((todo) => !quadrants || quadrants.includes(todo.quadrant))
        .filter((todo) => important === undefined || quadrantTraits(todo.quadrant).important === important)
        .filter((todo) => urgent === undefined || quadrantTraits(todo.quadrant).urgent === urgent)
        .filter((todo) => !text || textMatches(todo, text))
        .filter((todo) => !assignee || todo.assignedTo.toLowerCase().includes(assignee))
        .filter((todo) => !dueBefore || (day(todo.dueAt) !== undefined && day(todo.dueAt)! <= dueBefore))
        .filter((todo) => !dueAfter || (day(todo.dueAt) !== undefined && day(todo.dueAt)! >= dueAfter))
        .filter((todo) => !overdue || (!todo.completed && day(todo.dueAt) !== undefined && day(todo.dueAt)! < now))
        .filter((todo) => !originApp || todo.origin?.app === originApp)
        .filter((todo) => !originId || todo.origin?.id === originId)
        .sort(
          (left, right) =>
            left.quadrant - right.quadrant ||
            (day(left.dueAt) ?? "9999").localeCompare(day(right.dueAt) ?? "9999") ||
            left.subject.localeCompare(right.subject),
        );
      return {
        total: matching.length,
        ...(matching.length > limit ? { truncated: true } : {}),
        todos: matching.slice(0, limit).map((todo) => toAgentTodo(todo, now)),
      };
    },
  };

  const create: MindooDBAppAgentTool = {
    name: "create",
    description:
      `Creates todos (one undo step). ${QUADRANT_HELP} Give important/urgent (or quadrant); without either a ` +
      "todo lands in 2 (important, not urgent). When a todo stands for something in another app (a mind map " +
      "node, a document), pass origin: a todo with the same origin is not created twice; the existing one comes " +
      "back under existing instead (reopen it with todo_complete if it was done).",
    inputSchema: {
      type: "object",
      required: ["todos"],
      properties: {
        todos: {
          type: "array",
          minItems: 1,
          maxItems: MAX_BATCH,
          items: {
            type: "object",
            required: ["subject"],
            properties: { ...TODO_FIELDS_SCHEMA, origin: ORIGIN_SCHEMA },
          },
        },
        databaseId: { type: "string", description: "Where to store them; default the app's main todo database." },
      },
    },
    async execute(input) {
      requireWritable();
      const entries = objectList(input, "todos");
      const databaseId = optionalString(input, "databaseId") ?? deps.defaultDatabaseId();
      const info = databaseId ? deps.databases().find((entry) => entry.id === databaseId) : undefined;
      if (!databaseId || !info) {
        throw new MindooDBAppAgentToolError("NOT_FOUND", "No todo database to store new todos in.", "call todo_get_context");
      }
      if (!info.capabilities.includes("create")) {
        throw new MindooDBAppAgentToolError("NOT_ALLOWED", `New todos cannot be stored in "${info.title}".`);
      }

      const existingTodos = await loadAll();
      const existing: Array<{ todo: AgentTodo; reason: string }> = [];
      const inputs: Array<{ databaseId: string; fields: Partial<TodoSnapshot> }> = [];
      const seenOrigins = new Set<string>();
      for (const entry of entries) {
        const subject = optionalString(entry, "subject");
        if (!subject) invalid("Every todo needs a subject.");
        const origin = readOrigin(entry.origin);
        if (origin) {
          const key = `${origin.app}\n${origin.id}`;
          const duplicate = existingTodos.find(
            (todo) => todo.origin?.app === origin.app && todo.origin.id === origin.id,
          );
          if (duplicate) {
            existing.push({ todo: toAgentTodo(duplicate, today()), reason: "a todo with this origin exists" });
            continue;
          }
          if (seenOrigins.has(key)) invalid(`Two todos in this call have the origin ${origin.app}/${origin.id}.`);
          seenOrigins.add(key);
        }
        inputs.push({
          databaseId,
          fields: {
            subject,
            description: optionalString(entry, "notes") ?? "",
            quadrant: resolveQuadrant(entry, null) ?? 2,
            assignedTo: optionalString(entry, "assignee") ?? "",
            startAt: optionalDate(entry, "start") ?? null,
            dueAt: optionalDate(entry, "due") ?? null,
            completed: false,
            ...originFields(origin ?? null),
          },
        });
      }
      if (!inputs.length) {
        return { created: [], existing };
      }
      const label =
        inputs.length > 1 ? `Agent: create ${inputs.length} todos` : `Agent: create "${String(inputs[0].fields.subject)}"`;
      const { created, step } = await deps.createTodos(inputs, label);
      return { created: await reload(created), ...(existing.length ? { existing } : {}), ...stepResult(step) };
    },
  };

  const update: MindooDBAppAgentTool = {
    name: "update",
    description:
      "Changes todos (one undo step); only the fields you give change. To move a todo between quadrants say " +
      "what changed: \"no longer urgent\" is urgent: false (1 → 2, 3 → 4), \"no longer important\" is " +
      "important: false (1 → 3, 2 → 4), or set quadrant directly. origin: null removes the origin.",
    inputSchema: {
      type: "object",
      required: ["todos"],
      properties: {
        todos: {
          type: "array",
          minItems: 1,
          maxItems: MAX_BATCH,
          items: {
            type: "object",
            required: ["todoId"],
            properties: {
              todoId: { type: "string" },
              ...TODO_FIELDS_SCHEMA,
              origin: { ...ORIGIN_SCHEMA, type: ["object", "null"] },
            },
          },
        },
      },
    },
    async execute(input) {
      requireWritable();
      const entries = objectList(input, "todos");
      const found = await findTodos(entries.map((entry) => optionalString(entry, "todoId") ?? invalid("todoId is missing.")));
      const edits = entries.map((entry, index) => {
        const todo = found[index];
        const set: Partial<TodoSnapshot> = {};
        const subject = optionalString(entry, "subject");
        if (subject) set.subject = subject;
        if (typeof entry.notes === "string") set.description = entry.notes;
        if (typeof entry.assignee === "string") set.assignedTo = entry.assignee.trim();
        const quadrant = resolveQuadrant(entry, todo.quadrant);
        if (quadrant !== undefined) set.quadrant = quadrant;
        const start = optionalDate(entry, "start");
        if (start !== undefined) set.startAt = start;
        const due = optionalDate(entry, "due");
        if (due !== undefined) set.dueAt = due;
        const origin = readOrigin(entry.origin);
        if (origin !== undefined) Object.assign(set, originFields(origin));
        if (!Object.keys(set).length) invalid(`Nothing to change for "${todo.subject}".`);
        return { todo, set };
      });
      const label = edits.length > 1 ? `Agent: change ${edits.length} todos` : `Agent: change "${edits[0].todo.subject}"`;
      const { step } = await deps.editTodos(edits, label);
      return { updated: await reload(found.map((todo) => ({ databaseId: todo.databaseId, id: todo.id }))), ...stepResult(step) };
    },
  };

  const complete: MindooDBAppAgentTool = {
    name: "complete",
    description:
      "Ticks todos off as done (completed: false reopens them). Done todos leave the board, which shows open " +
      "todos by default, but stay listable with status completed. One undo step.",
    inputSchema: {
      type: "object",
      required: ["todoIds"],
      properties: {
        todoIds: { type: "array", minItems: 1, maxItems: MAX_BATCH, items: { type: "string" } },
        completed: { type: "boolean", description: "Default true." },
      },
    },
    async execute(input) {
      requireWritable();
      const completed = optionalBoolean(input, "completed") ?? true;
      const found = await findTodos(stringList(input, "todoIds"));
      const what = found.length > 1 ? `${found.length} todos` : `"${found[0].subject}"`;
      const { step } = await deps.editTodos(
        found.map((todo) => ({ todo, set: { completed } })),
        `Agent: ${completed ? "complete" : "reopen"} ${what}`,
      );
      return { [completed ? "completed" : "reopened"]: found.map((todo) => todo.subject), ...stepResult(step) };
    },
  };

  const remove: MindooDBAppAgentTool = {
    name: "delete",
    description:
      "Deletes todos (the recycle bin in the app). Haven asks the user first. To tick a todo off as done use " +
      "todo_complete instead. One undo step; undo brings them back.",
    inputSchema: {
      type: "object",
      required: ["todoIds"],
      properties: { todoIds: { type: "array", minItems: 1, maxItems: MAX_BATCH, items: { type: "string" } } },
    },
    annotations: { consequentialHint: true },
    async execute(input) {
      requireWritable();
      const found = await findTodos(stringList(input, "todoIds"));
      const label = found.length > 1 ? `Agent: delete ${found.length} todos` : `Agent: delete "${found[0].subject}"`;
      const { step } = await deps.removeTodos(found, label);
      return { deleted: found.map((todo) => todo.subject), ...stepResult(step) };
    },
  };

  const show: MindooDBAppAgentTool = {
    name: "show",
    description:
      "Points the user at todos in the app: selects them, optionally opens one in its dialog, switches the " +
      "filter (open, completed, all) or, on narrow screens, the visible quadrant.",
    inputSchema: {
      type: "object",
      properties: {
        todoIds: { type: "array", items: { type: "string" } },
        openTodoId: { type: "string" },
        filter: { type: "string", enum: ["open", "completed", "all"] },
        quadrant: { type: "integer", enum: [1, 2, 3, 4] },
      },
    },
    async execute(input) {
      const todoIds = Array.isArray(input.todoIds) ? stringList(input, "todoIds") : [];
      const openTodoId = optionalString(input, "openTodoId");
      const found = await findTodos([...new Set([...todoIds, ...(openTodoId ? [openTodoId] : [])])]);
      const hidden = found.filter((todo) => !deps.shownDatabaseIds().includes(todo.databaseId));
      if (hidden.length) {
        throw new MindooDBAppAgentToolError(
          "INVALID_STATE",
          `"${hidden[0].subject}" is in a database the board does not show.`,
          "ask the user to turn that database on under Sources",
        );
      }
      const filter = optionalString(input, "filter") as TodoFilterMode | undefined;
      if (filter && !["open", "completed", "all"].includes(filter)) invalid("filter must be open, completed or all.");
      const keyOf = (todo: TodoItem) => `${todo.databaseId}:${todo.id}`;
      const openTodo = openTodoId ? found.find((todo) => todo.id === openTodoId) : undefined;
      await deps.show({
        todoKeys: found.map(keyOf),
        ...(openTodo ? { openKey: keyOf(openTodo) } : {}),
        ...(filter ? { filter } : {}),
        ...(optionalQuadrant(input) ? { quadrant: optionalQuadrant(input) } : {}),
      });
      return { shown: found.map((todo) => todo.subject) };
    },
  };

  const history: MindooDBAppAgentTool = {
    name: "history",
    description:
      "Lists the undo and redo steps of this session, newest first, with a label, whether an AI agent made " +
      "the step and the todos it touched. Write tools return the undoStepId of their step.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    async execute() {
      return {
        steps: [...deps.undoSteps()].reverse().map((step) => ({
          stepId: step.id,
          label: step.label,
          byAgent: step.byAgent,
          at: step.at,
          state: step.undone ? "undone" : "done",
          todos: step.changes.map((change) => change.subject),
        })),
      };
    },
  };

  const undo: MindooDBAppAgentTool = {
    name: "undo",
    description:
      "Takes back changes, like Ctrl+Z in the app. Pass the undoStepId a write tool returned: that step and " +
      "every newer one are undone. Without stepId only the newest step. If a newer step was made by the user, " +
      "the call is refused unless includeUserSteps is true (ask the user first). Deleted todos come back.",
    inputSchema: {
      type: "object",
      properties: { stepId: { type: "string" }, includeUserSteps: { type: "boolean" } },
    },
    async execute(input) {
      requireWritable();
      try {
        const steps = await deps.undo({
          stepId: optionalString(input, "stepId"),
          includeUserSteps: optionalBoolean(input, "includeUserSteps"),
        });
        return { undone: steps.map((step) => step.label) };
      } catch (error) {
        if (error instanceof TodoUndoRefusedError) {
          throw new MindooDBAppAgentToolError(
            "STATE_CHANGED",
            `${error.message} User steps: ${error.userSteps.map((step) => step.label).join("; ")}.`,
            "ask the user, then call again with includeUserSteps: true",
          );
        }
        throw new MindooDBAppAgentToolError("INVALID_INPUT", error instanceof Error ? error.message : String(error), "call todo_history");
      }
    },
  };

  const redo: MindooDBAppAgentTool = {
    name: "redo",
    description: "Re-applies steps that were undone (Ctrl+Shift+Z). Without stepId the step undone last.",
    inputSchema: { type: "object", properties: { stepId: { type: "string" } } },
    async execute(input) {
      requireWritable();
      try {
        const steps = await deps.redo({ stepId: optionalString(input, "stepId") });
        return { redone: steps.map((step) => step.label) };
      } catch (error) {
        throw new MindooDBAppAgentToolError("INVALID_INPUT", error instanceof Error ? error.message : String(error), "call todo_history");
      }
    },
  };

  return [getContext, list, create, update, complete, remove, show, history, undo, redo];
}
