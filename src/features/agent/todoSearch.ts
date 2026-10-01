/**
 * Todo search for agents, like Vega's: exact criteria (done or open,
 * quadrant, due dates, origin, exact words) run as a `documents.query`
 * filter on the host's summary buffer; topics (`text`) use the host's
 * full-text index (MiniSearch) with prefix and fuzzy matching, ranked by
 * relevance. Without an index, and when TodoManager may not switch it on,
 * topics fall back to a substring match, which the result reports.
 */
import {
  createViewLanguage,
  type MindooDBAppBooleanExpression,
  type MindooDBAppDatabase,
  type MindooDBAppQueryRow,
} from "mindoodb-app-sdk";

import { readTodoItem, type TodoItem, type TodoQuadrant } from "@/features/todos/composables/todoTypes";

/** Fields the full-text index covers (also the app's own search). */
export const TODO_FULLTEXT_FIELDS = ["subject", "assignedTo", "description"];

export type TodoSearchCriteria = {
  status?: "open" | "completed" | "all";
  quadrants?: TodoQuadrant[];
  /** YYYY-MM-DD, inclusive. */
  dueFrom?: string;
  dueTo?: string;
  originApp?: string;
  originId?: string;
  /** Words that must appear literally in subject or notes (case-insensitive). */
  exact?: string;
  /** Topic search over the full-text index. */
  text?: string;
  /** For text: every word must match (all) or any of them (any). */
  match?: "all" | "any";
};

export type TodoSearchMode = "none" | "index" | "substring";

type TodoFields = {
  completed: boolean;
  quadrant: number;
  dueAt: string;
  originApp: string;
  originId: string;
  subject: string;
  description: string;
};

const v = createViewLanguage<TodoFields>();
const ROW_FIELDS = [
  "subject",
  "assignedTo",
  "description",
  "quadrant",
  "dueAt",
  "startAt",
  "completed",
  "originApp",
  "originId",
  "originLabel",
  "createdAt",
  "updatedAt",
  "_attachments",
];
const QUERY_CAP = 1000;

function buildFilter(criteria: TodoSearchCriteria): MindooDBAppBooleanExpression | undefined {
  const parts: MindooDBAppBooleanExpression[] = [];
  if (criteria.status === "open") parts.push(v.not(v.eq(v.field("completed"), v.boolean(true))));
  if (criteria.status === "completed") parts.push(v.eq(v.field("completed"), v.boolean(true)));
  if (criteria.quadrants?.length && criteria.quadrants.length < 4) {
    parts.push(v.or(...criteria.quadrants.map((quadrant) => v.eq(v.field("quadrant"), v.number(quadrant)))));
  }
  // Dates are stored as midnight UTC ISO strings, so they compare as text.
  if (criteria.dueFrom) parts.push(v.gte(v.field("dueAt"), v.string(`${criteria.dueFrom}T00:00:00.000Z`)));
  if (criteria.dueTo) parts.push(v.lte(v.field("dueAt"), v.string(`${criteria.dueTo}T00:00:00.000Z`)));
  if (criteria.originApp) parts.push(v.eq(v.field("originApp"), v.string(criteria.originApp)));
  if (criteria.originId) parts.push(v.eq(v.field("originId"), v.string(criteria.originId)));
  for (const word of (criteria.exact ?? "").toLowerCase().split(/\s+/).filter(Boolean)) {
    parts.push(
      v.or(
        v.contains(v.lower(v.field("subject")), v.string(word)),
        v.contains(v.lower(v.field("description")), v.string(word)),
      ),
    );
  }
  if (!parts.length) return undefined;
  return parts.length === 1 ? parts[0] : v.and(...parts);
}

function toTodo(row: MindooDBAppQueryRow, databaseId: string): TodoItem {
  return readTodoItem(
    {
      id: row.docId,
      data: row.fields,
      updatedAt: typeof row.fields.updatedAt === "string" ? row.fields.updatedAt : new Date(row.lastModified).toISOString(),
    } as never,
    databaseId,
  );
}

function substringMatch(todo: TodoItem, query: string, match: "all" | "any") {
  const haystack = [todo.subject, todo.description, todo.assignedTo].join("\n").toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return match === "any" ? words.some((word) => haystack.includes(word)) : words.every((word) => haystack.includes(word));
}

function isFulltextUnavailable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : "";
  return code === "fulltext-not-enabled" || message.includes("fulltext-not-enabled");
}

/**
 * Todos of one database matching `criteria`, with a relevance score per
 * todo when `text` was searched through the index.
 */
export async function searchTodos(
  database: MindooDBAppDatabase,
  databaseId: string,
  criteria: TodoSearchCriteria,
  options: { mayEnableFulltext: boolean },
): Promise<{ todos: Array<{ todo: TodoItem; score?: number }>; mode: TodoSearchMode }> {
  const filter = buildFilter(criteria);
  const base = { ...(filter ? { filter } : {}), fields: ROW_FIELDS, limit: QUERY_CAP };
  const rows = (result: { rows: MindooDBAppQueryRow[] }) =>
    result.rows.map((row) => ({
      todo: toTodo(row, databaseId),
      ...(row.textScore !== undefined ? { score: Math.round(row.textScore * 100) / 100 } : {}),
    }));

  const query = criteria.text?.trim();
  if (!query) {
    return { todos: rows(await database.documents.query(base)), mode: "none" };
  }
  const text = {
    query,
    fields: TODO_FULLTEXT_FIELDS,
    prefix: true,
    fuzzy: 0.2,
    combineWith: criteria.match === "any" ? ("OR" as const) : ("AND" as const),
  };
  try {
    return { todos: rows(await database.documents.query({ ...base, text })), mode: "index" };
  } catch (error) {
    if (!isFulltextUnavailable(error)) throw error;
  }
  if (options.mayEnableFulltext) {
    try {
      const setup = await database.getFulltextSetup();
      if (setup?.enabled !== true) {
        await database.setFulltextSetup({ enabled: true, include: TODO_FULLTEXT_FIELDS });
      }
      return { todos: rows(await database.documents.query({ ...base, text })), mode: "index" };
    } catch {
      // Fall through to the substring match below.
    }
  }
  const all = rows(await database.documents.query(base));
  return {
    todos: all.filter((entry) => substringMatch(entry.todo, query, criteria.match ?? "all")),
    mode: "substring",
  };
}
