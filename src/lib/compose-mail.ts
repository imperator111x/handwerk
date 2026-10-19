import type { EmailAttachment } from "./email";
import { htmlToPlainText, replaceEditorImages, sanitizeMailHtml } from "./mail-html";
import {
  MAX_FILES,
  MAX_TOTAL_BYTES,
  readFormUploads,
  type PreparedUpload,
} from "./mail-files";

export type ComposeCode = "bad_subject" | "bad_body" | "bad_file";

export interface PreparedMail {
  subject: string;
  emailBodyHtml: string;
  storedBodyHtml: string;
  plainBody: string;
  uploads: PreparedUpload[];
}

export async function prepareRichMail(
  form: FormData,
): Promise<{ ok: true; mail: PreparedMail } | { ok: false; code: ComposeCode }> {
  const subject = String(form.get("subject") ?? "").trim();
  const bodyHtmlRaw = String(form.get("body_html") ?? form.get("body") ?? "");
  if (subject.length < 3 || subject.length > 200) return { ok: false, code: "bad_subject" };
  if (bodyHtmlRaw.length > 60_000) return { ok: false, code: "bad_body" };

  const images = await readFormUploads(form.getAll("images"), "image");
  const documents = await readFormUploads(form.getAll("documents"), "document");
  if (!images || !documents) return { ok: false, code: "bad_file" };
  const uploads = [...images, ...documents];
  const totalBytes = uploads.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (uploads.length > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
    return { ok: false, code: "bad_file" };
  }

  const imageMap = new Map<string, { cid: string; filename: string }>();
  for (const file of images) {
    if (!file.uploadId) continue;
    imageMap.set(file.uploadId, {
      cid: `img-${file.uploadId}`,
      filename: file.filename,
    });
  }
  const attachmentNotes = documents
    .map((file) => `<p>Anhang: ${escapeHtml(file.filename)}</p>`)
    .join("");
  const emailBodyHtml = sanitizeMailHtml(
    `${replaceEditorImages(bodyHtmlRaw, imageMap, "email")}${attachmentNotes}`,
  );
  const storedBodyHtml = sanitizeMailHtml(
    `${replaceEditorImages(bodyHtmlRaw, imageMap, "store")}${attachmentNotes}`,
  );
  const plainBody = htmlToPlainText(emailBodyHtml);
  if (plainBody.length < 5 && uploads.length === 0) return { ok: false, code: "bad_body" };

  return {
    ok: true,
    mail: {
      subject,
      emailBodyHtml,
      storedBodyHtml,
      plainBody,
      uploads,
    },
  };
}

export function mailAttachments(uploads: PreparedUpload[]): EmailAttachment[] {
  return uploads.map((file) => {
    if (file.kind === "image" && file.uploadId) {
      return {
        filename: file.filename,
        type: file.type,
        disposition: "inline" as const,
        contentId: `img-${file.uploadId}`,
        content: file.bytes,
      };
    }
    return {
      filename: file.filename,
      type: file.type,
      disposition: "attachment" as const,
      content: file.bytes,
    };
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
