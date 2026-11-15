/**
 * "Copy link" for the open document (`session.links`).
 *
 * Haven puts the link on the clipboard and confirms it (`session.links.copy`,
 * SDK 0.0.98+). Older SDKs or Havens without it: the link is made with
 * `links.create` and copied from the app's frame, and the caller confirms it.
 */
import type { MindooDBAppSession } from "mindoodb-app-sdk";

export interface DocumentLinkInput {
  databaseId: string;
  docId: string;
  /** A place in the document after `#` (`slide=s_3`), in the app's own words. */
  target?: string;
  /** Link text when pasted into mail or rich text. */
  title?: string;
}

/**
 * - `copied` / `shown`: Haven copied it and told the user, or shows it to copy.
 * - `copiedByApp`: the app copied it; confirm it in the app.
 * - `failed`: nothing could copy it; show `url`.
 */
export interface DocumentLinkCopyResult {
  status: "copied" | "shown" | "copiedByApp" | "failed";
  url: string;
}

type LinksApi = MindooDBAppSession["links"] & {
  copy?: (input: DocumentLinkInput) => Promise<DocumentLinkCopyResult>;
};

/** Whether this Haven makes links to documents at all. */
export function canLinkDocuments(session: MindooDBAppSession | null | undefined): boolean {
  return typeof (session as Partial<MindooDBAppSession> | null | undefined)?.links?.create === "function";
}

export async function copyDocumentLink(
  session: MindooDBAppSession,
  input: DocumentLinkInput,
): Promise<DocumentLinkCopyResult> {
  const links = session.links as LinksApi;
  if (typeof links.copy === "function") {
    const result = await links.copy(input);
    return { status: result.status, url: result.url };
  }
  const { url } = await links.create(input);
  return { status: (await copyInFrame(url, input.title)) ? "copiedByApp" : "failed", url };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

async function copyInFrame(url: string, title?: string): Promise<boolean> {
  const html = `<a href="${escapeHtml(url)}">${escapeHtml(title?.trim() || url)}</a>`;
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([url], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    }
  } catch {
    // try the next way
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // try the next way
  }
  const onCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData("text/plain", url);
    event.clipboardData?.setData("text/html", html);
    event.preventDefault();
  };
  const field = document.createElement("textarea");
  field.value = url;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  document.addEventListener("copy", onCopy);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", onCopy);
    field.remove();
  }
}
