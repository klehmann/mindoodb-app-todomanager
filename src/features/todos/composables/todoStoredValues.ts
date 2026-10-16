import { MindooDBAppValue } from "mindoodb-app-sdk";

/**
 * Fields people type into, kept as collaborative text: the todo's subject and
 * its description.
 *
 * Every other string a todo stores (assignee name and directory id, due and
 * start dates, origin app/id/label, timestamps) is replaced as a whole, so it
 * is written atomic: two devices that change the due date at the same time
 * end with one of the two dates instead of an interleaving of both. Reads
 * return plain strings either way, so todos written before keep working.
 */
export const TODO_TEXT_FIELDS: ReadonlySet<string> = new Set(["subject", "description"]);

/** Todo document fields as stored: text for `TODO_TEXT_FIELDS`, atomic strings for the rest. */
export function toStoredTodoFields(fields: Record<string, unknown>): Record<string, unknown> {
  const stored: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    stored[key] = typeof value === "string" && !TODO_TEXT_FIELDS.has(key) && !key.startsWith("_")
      ? MindooDBAppValue.atomic(value)
      : value;
  }
  return stored;
}
