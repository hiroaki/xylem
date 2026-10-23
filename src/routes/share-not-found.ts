import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readShareNotFoundHtml(publicDir: string): Promise<string | null> {
  try {
    return await readFile(join(publicDir, "share-not-found.html"), "utf8");
  } catch {
    // Optional presentation assets must not replace the original retrieval error.
    return null;
  }
}
