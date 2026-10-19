export const MAX_WORK_PHOTOS = 24;
export const MAX_PHOTO_BYTES = 450_000;

export interface WorkPhotoCard {
  id: number;
  title: string;
  caption: string;
  created_at: number;
}

export async function countWorkPhotos(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM work_photos`).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function listWorkPhotos(db: D1Database): Promise<WorkPhotoCard[]> {
  const { results } = await db
    .prepare(`SELECT id, title, caption, created_at FROM work_photos ORDER BY created_at DESC, id DESC`)
    .all<WorkPhotoCard>();
  return results ?? [];
}

export async function insertWorkPhoto(
  db: D1Database,
  data: { title: string; caption: string; bytes: Uint8Array },
): Promise<number | "full" | "large"> {
  if (data.bytes.byteLength === 0 || data.bytes.byteLength > MAX_PHOTO_BYTES) return "large";
  if ((await countWorkPhotos(db)) >= MAX_WORK_PHOTOS) return "full";
  const result = await db
    .prepare(
      `INSERT INTO work_photos (title, caption, content_type, image) VALUES (?, ?, 'image/jpeg', ?)`,
    )
    .bind(data.title, data.caption, data.bytes)
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function readWorkPhoto(
  db: D1Database,
  id: number,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const row = await db
    .prepare(`SELECT image, content_type FROM work_photos WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ image: ArrayBuffer | Uint8Array; content_type: string }>();
  if (!row?.image) return null;
  const bytes = row.image instanceof Uint8Array ? row.image : new Uint8Array(row.image);
  return { bytes, contentType: row.content_type || "image/jpeg" };
}

export async function deleteWorkPhoto(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM work_photos WHERE id = ?`).bind(id).run();
}
