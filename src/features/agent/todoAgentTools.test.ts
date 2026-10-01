import { MindooDBAppAgentToolError, type MindooDBAppDatabaseInfo } from "mindoodb-app-sdk";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { evaluateExpression } from "mindoodb-view-language";

import { createTodoAgentTools, type TodoAgentDeps } from "@/features/agent/todoAgentTools";
import { searchTodos } from "@/features/agent/todoSearch";
import { useTodos } from "@/features/todos/composables/useTodos";
import { withSetup } from "@/test-utils/withSetup";

/** In-memory todo database with the document calls the app uses. */
function createMemoryDatabase(seed: Array<{ id: string; data: Record<string, unknown> }> = []) {
  const docs = new Map(seed.map((doc) => [doc.id, { data: { ...doc.data }, deleted: false }]));
  let counter = 0;
  const fulltext = { enabled: false };
  return {
    docs,
    fulltext,
    getFulltextSetup: vi.fn(async () => ({ enabled: fulltext.enabled })),
    setFulltextSetup: vi.fn(async (setup: { enabled: boolean }) => {
      fulltext.enabled = setup.enabled;
    }),
    documents: {
      // Filter through the real expression evaluator; text through a crude
      // stand-in for the index: word prefixes, score = matched words.
      query: vi.fn(async (options: { filter?: any; text?: { query: string; combineWith?: string } }) => {
        if (options.text && !fulltext.enabled) {
          throw Object.assign(new Error("fulltext-not-enabled"), { code: "fulltext-not-enabled" });
        }
        const rows = [...docs.entries()]
          .filter(([, doc]) => !doc.deleted)
          .filter(
            ([id, doc]) =>
              !options.filter ||
              evaluateExpression(options.filter, { doc: doc.data, values: {}, origin: "", variables: {} }) === true,
          )
          .map(([id, doc]) => {
            if (!options.text) return { docId: id, fields: { ...doc.data }, lastModified: 0 };
            const words = String(doc.data.subject) + " " + String(doc.data.description ?? "");
            const tokens = words.toLowerCase().split(/\W+/);
            const terms = options.text.query.toLowerCase().split(/\s+/);
            const hits = terms.filter((term) => tokens.some((token) => token.startsWith(term))).length;
            const ok = options.text.combineWith === "OR" ? hits > 0 : hits === terms.length;
            return ok ? { docId: id, fields: { ...doc.data }, lastModified: 0, textScore: hits } : null;
          })
          .filter(Boolean);
        return { rows, total: rows.length };
      }),
      list: vi.fn(async () => ({
        items: [...docs.entries()]
          .filter(([, doc]) => !doc.deleted)
          .map(([id, doc]) => ({ id, data: { ...doc.data }, updatedAt: doc.data.updatedAt })),
        nextCursor: null,
      })),
      get: vi.fn(async (id: string) => ({ id, data: { ...docs.get(id)!.data } })),
      create: vi.fn(async ({ set }: { set: Record<string, unknown> }) => {
        counter += 1;
        const id = `new-${counter}`;
        docs.set(id, { data: { ...set }, deleted: false });
        return { id, data: { ...set } };
      }),
      update: vi.fn(async (id: string, { set }: { set: Record<string, unknown> }) => {
        const doc = docs.get(id)!;
        doc.data = { ...doc.data, ...set };
        return { ok: true };
      }),
      delete: vi.fn(async (id: string) => {
        docs.get(id)!.deleted = true;
        return { ok: true };
      }),
      undelete: vi.fn(async (id: string) => {
        docs.get(id)!.deleted = false;
        return { ok: true };
      }),
    },
  };
}

function setup(seed: Array<{ id: string; data: Record<string, unknown> }> = []) {
  const database = createMemoryDatabase(seed);
  const databases = ref<MindooDBAppDatabaseInfo[]>([
    { id: "main", title: "Todos", capabilities: ["read", "create", "update", "delete"] } as MindooDBAppDatabaseInfo,
  ]);
  const { result: todos, unmount } = withSetup(() =>
    useTodos({
      selectedDatabaseIds: ref(["main"]),
      databases,
      preferredDatabaseId: computed(() => "main"),
      getDatabase: async () => database as never,
      loading: ref(false),
      busyAction: ref(null),
      error: ref(null),
      setSuccess: vi.fn(),
    }),
  );
  const deps: TodoAgentDeps = {
    databases: () => databases.value,
    shownDatabaseIds: () => ["main"],
    defaultDatabaseId: () => "main",
    readOnly: () => false,
    loadTodos: async (databaseId) => await todos.listDatabaseTodos(databaseId),
    searchTodos: async (databaseId, criteria) =>
      await searchTodos(database as never, databaseId, criteria, { mayEnableFulltext: true }),
    createTodos: async (inputs, label) => await todos.createTodos(inputs, label, true),
    editTodos: async (edits, label) => await todos.editTodos(edits, label, true),
    removeTodos: async (list, label) => await todos.removeTodos(list, label, true),
    undoSteps: () => todos.todoUndo.steps.value,
    undo: async (input) => await todos.todoUndo.undo({ ...input, byAgent: true }),
    redo: async (input) => await todos.todoUndo.redo(input),
    show: vi.fn(async () => undefined),
    userName: () => "Karsten Lehmann",
    userId: () => "CN=Karsten Lehmann/O=Mindoo",
    searchUsers: async (query) =>
      ["CN=Paul Meyer/O=Mindoo", "CN=Paula Schmidt/O=Mindoo", "CN=Karsten Lehmann/O=Mindoo"]
        .filter((userId) => userId.toLowerCase().includes(query.toLowerCase()))
        .map((userId) => ({ userId, name: userId.slice(3).split("/")[0] })),
    context: () => ({
      you: { name: "Karsten Lehmann" },
      readOnly: false,
      databases: [],
      filter: "open",
      search: "",
      openTodos: { 1: 0, 2: 0, 3: 0, 4: 0 },
      selected: [],
      openInDialog: null,
    }),
    today: () => "2026-10-02",
  };
  const tools = Object.fromEntries(createTodoAgentTools(deps).map((tool) => [tool.name, tool]));
  const call = async (name: string, input: Record<string, unknown> = {}) =>
    (await tools[name].execute(input)) as Record<string, any>;
  return { database, todos, call, unmount };
}

const seedTodo = (id: string, data: Record<string, unknown>) => ({
  id,
  data: { subject: id, description: "", assignedTo: "", quadrant: 1, completed: false, dueAt: null, startAt: null, ...data },
});

describe("todo agent tools", () => {
  it("creates todos in the quadrant that important/urgent describe", async () => {
    const { call, unmount } = setup();
    const result = await call("create", {
      todos: [
        { subject: "Pay invoice", important: true, urgent: true, due: "2026-10-03" },
        { subject: "Plan Q1" },
        { subject: "Answer survey", urgent: true, important: false },
      ],
    });
    expect(result.created.map((todo: any) => [todo.subject, todo.quadrant])).toEqual([
      ["Pay invoice", 1],
      ["Plan Q1", 2],
      ["Answer survey", 3],
    ]);
    expect(result.created[0].due).toBe("2026-10-03");
    expect(result.undoStepId).toBeTruthy();
    unmount();
  });

  it("turns 'no longer urgent' and 'no longer important' into quadrant moves", async () => {
    const { call, unmount } = setup([seedTodo("a", { quadrant: 1 }), seedTodo("b", { quadrant: 2 })]);
    const result = await call("update", {
      todos: [
        { todoId: "a", urgent: false },
        { todoId: "b", important: false },
      ],
    });
    expect(result.updated.map((todo: any) => todo.quadrant)).toEqual([2, 4]);
    await expect(call("update", { todos: [{ todoId: "a", quadrant: 3, urgent: true }] })).rejects.toBeInstanceOf(
      MindooDBAppAgentToolError,
    );
    unmount();
  });

  it("ticks todos off so they leave the open list", async () => {
    const { call, unmount } = setup([seedTodo("a", {}), seedTodo("b", { quadrant: 4 })]);
    await call("complete", { todoIds: ["a"] });
    const open = await call("list");
    expect(open.todos.map((todo: any) => todo.todoId)).toEqual(["b"]);
    const done = await call("list", { status: "completed" });
    expect(done.todos.map((todo: any) => todo.todoId)).toEqual(["a"]);
    unmount();
  });

  it("does not create a second todo for the same origin", async () => {
    const { call, database, unmount } = setup();
    const origin = { app: "vega", id: "map-1/node-7", label: "Relaunch › Pricing" };
    await call("create", { todos: [{ subject: "Pricing", origin }] });
    const again = await call("create", { todos: [{ subject: "Pricing again", origin }] });
    expect(again.created).toEqual([]);
    expect(again.existing[0].todo.origin).toEqual(origin);
    expect(database.documents.create).toHaveBeenCalledTimes(1);
    const byOrigin = await call("list", { origin: { app: "vega", id: "map-1/node-7" } });
    expect(byOrigin.total).toBe(1);
    unmount();
  });

  it("lists overdue todos and filters by urgency", async () => {
    const { call, unmount } = setup([
      seedTodo("late", { quadrant: 2, dueAt: "2026-09-30T00:00:00.000Z" }),
      seedTodo("later", { quadrant: 3, dueAt: "2026-10-09T00:00:00.000Z" }),
    ]);
    expect((await call("list", { overdue: true })).todos.map((todo: any) => todo.todoId)).toEqual(["late"]);
    expect((await call("list", { urgent: true })).todos.map((todo: any) => todo.todoId)).toEqual(["later"]);
    unmount();
  });

  it("undoes an agent step, brings deleted todos back with their id, and redoes", async () => {
    const { call, database, unmount } = setup([seedTodo("a", { quadrant: 1 })]);
    const moved = await call("update", { todos: [{ todoId: "a", important: false }] });
    const deleted = await call("delete", { todoIds: ["a"] });
    expect((await call("list")).total).toBe(0);

    await call("undo", { stepId: moved.undoStepId });
    const back = await call("list");
    expect(back.todos.map((todo: any) => [todo.todoId, todo.quadrant])).toEqual([["a", 1]]);
    expect(database.documents.undelete).toHaveBeenCalledWith("a");

    await call("redo", { stepId: deleted.undoStepId });
    expect((await call("list")).total).toBe(0);
    const history = await call("history");
    expect(history.steps.map((step: any) => step.state)).toEqual(["done", "done"]);
    unmount();
  });

  it("answers 'what do I have to do this week' with forMe and dueWithin", async () => {
    // 2026-10-02 is a Friday; the week ends on Sunday 2026-10-04.
    const { call, unmount } = setup([
      seedTodo("overdue", { dueAt: "2026-09-28T00:00:00.000Z" }),
      seedTodo("sunday", { dueAt: "2026-10-04T00:00:00.000Z", assignedTo: "Karsten" }),
      seedTodo("monday", { dueAt: "2026-10-05T00:00:00.000Z" }),
      seedTodo("pauls", { dueAt: "2026-10-03T00:00:00.000Z", assignedTo: "Paul" }),
    ]);
    const thisWeek = await call("list", { dueWithin: "this_week", forMe: true });
    expect(thisWeek.todos.map((todo: any) => todo.todoId).sort()).toEqual(["overdue", "sunday"]);
    const nextWeek = await call("list", { dueWithin: "next_week" });
    expect(nextWeek.todos.map((todo: any) => todo.todoId)).toEqual(["monday"]);
    expect((await call("get_context")).weekday).toBe("Friday");
    unmount();
  });

  it("searches exactly through the query filter and by topic through the full-text index", async () => {
    const { call, database, unmount } = setup([
      seedTodo("tax", { subject: "Steuererklärung abgeben", description: "Belege sammeln", quadrant: 1 }),
      seedTodo("receipts", { subject: "Belege scannen", quadrant: 3 }),
      seedTodo("offsite", { subject: "Team offsite planen", quadrant: 2, completed: true }),
    ]);
    // Exact words: literal substring in subject or notes, done by the DB query.
    const exact = await call("list", { exact: "belege" });
    expect(exact.todos.map((todo: any) => todo.todoId).sort()).toEqual(["receipts", "tax"]);
    expect(database.fulltext.enabled).toBe(false);

    // Topic: switches the index on, matches word beginnings, ranks by score.
    const topic = await call("list", { text: "steuer beleg", match: "any" });
    expect(topic.textSearch).toBe("full-text index");
    expect(topic.todos.map((todo: any) => todo.todoId)).toEqual(["tax", "receipts"]);
    expect(topic.todos[0].score).toBeGreaterThan(topic.todos[1].score);

    // Exact criteria still apply alongside text.
    expect((await call("list", { text: "team", status: "completed" })).todos.map((todo: any) => todo.todoId)).toEqual([
      "offsite",
    ]);
    expect((await call("list", { important: false })).todos.map((todo: any) => todo.todoId)).toEqual(["receipts"]);
    unmount();
  });

  it("assigns todos to directory people and finds what Paul has to do today", async () => {
    const { call, unmount } = setup([
      seedTodo("typed", { subject: "Typed for Paul", assignedTo: "Paul", dueAt: "2026-10-02T00:00:00.000Z" }),
      seedTodo("later", { subject: "Later", assignedTo: "Paul Meyer", dueAt: "2026-10-20T00:00:00.000Z" }),
      seedTodo("mine", { subject: "Mine", dueAt: "2026-10-02T00:00:00.000Z" }),
    ]);
    const { users } = await call("users_search", { query: "paul" });
    expect(users.map((user: any) => user.name)).toEqual(["Paul Meyer", "Paula Schmidt"]);
    const paul = users[0].userId;

    const created = await call("create", { todos: [{ subject: "Send offer", assigneeId: paul, due: "2026-10-02" }] });
    expect(created.created[0]).toMatchObject({ assignee: "Paul Meyer", assigneeId: paul });

    const today = await call("list", { assigneeId: paul, dueWithin: "today" });
    expect(today.todos.map((todo: any) => todo.subject).sort()).toEqual(["Send offer", "Typed for Paul"]);
    // Paul's todos are not the signed-in user's.
    expect((await call("list", { forMe: true, dueWithin: "today" })).todos.map((todo: any) => todo.subject)).toEqual([
      "Mine",
    ]);
    await expect(call("update", { todos: [{ todoId: "mine", assigneeId: paul, assignee: "x" }] })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    unmount();
  });

  it("refuses to undo the user's own change unless told to", async () => {
    const { call, todos, unmount } = setup([seedTodo("a", { quadrant: 1 })]);
    const agentStep = await call("update", { todos: [{ todoId: "a", urgent: false }] });
    await todos.refreshTodos();
    await todos.moveTodos(["main:a"], 4);
    await expect(call("undo", { stepId: agentStep.undoStepId })).rejects.toMatchObject({ code: "STATE_CHANGED" });
    const result = await call("undo", { stepId: agentStep.undoStepId, includeUserSteps: true });
    expect(result.undone).toHaveLength(2);
    expect((await call("list")).todos[0].quadrant).toBe(1);
    unmount();
  });
});
