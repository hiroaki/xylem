const GPX_URL_PLACEHOLDER = "{GPX_URL}";

export function buildViewerUrl(
  viewerUrlTemplate: string,
  gpxUrl: string,
): string {
  if (!viewerUrlTemplate.includes(GPX_URL_PLACEHOLDER)) {
    throw new Error(
      `VIEWER_URL_TEMPLATE must contain ${GPX_URL_PLACEHOLDER}`,
    );
  }

  return viewerUrlTemplate.replace(
    GPX_URL_PLACEHOLDER,
    encodeURIComponent(gpxUrl),
  );
}
