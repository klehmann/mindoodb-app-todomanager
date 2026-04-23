import { describe, expect, it } from "vitest";

import { readAttachmentsFromDocData, readTodoItem } from "./todoTypes";

describe("todoTypes", () => {
  it("reads attachment metadata from data._attachments like the Vega app", () => {
    const items = readAttachmentsFromDocData({
      _attachments: [
        { attachmentId: "a1", fileName: "x.pdf", mimeType: "application/pdf", size: 99 },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      attachmentId: "a1",
      fileName: "x.pdf",
      mimeType: "application/pdf",
      size: 99,
    });
  });

  it("readTodoItem prefers top-level document.attachments when present", () => {
    const row = readTodoItem(
      {
        id: "d1",
        data: { subject: "T", quadrant: 1, _attachments: [] },
        updatedAt: "2026-01-01T00:00:00.000Z",
        attachments: [
          { attachmentId: "top", fileName: "a.png", mimeType: "image/png", size: 12 },
        ],
      },
      "db1",
    );
    expect(row.attachmentCount).toBe(1);
    expect(row.attachments[0]?.fileName).toBe("a.png");
  });
});
