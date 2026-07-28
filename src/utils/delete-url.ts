export function buildDeleteUrl(
  origin: string,
  id: string,
): string {
  const url = new URL(
    "/delete.html",
    origin,
  );

  url.searchParams.set("id", id);

  return url.toString();
}
