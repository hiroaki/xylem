import { Hono } from "hono";
import { getConfig } from "../config.js";

const router = new Hono();

function isValidId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

router.get("/s/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.text("Not Found", 404);
  }

  const config = getConfig();

  const shareUrl =
    `${config.xylemPublicOrigin}/s/${encodeURIComponent(id)}`;
  const ogImageUrl =
    `${config.chloroplastPublicOrigin}/og/${encodeURIComponent(id)}`;

  const html = viewerTemplate()
    .replaceAll("{{TITLE}}", "GPX Share (Beta)")
    .replaceAll("{{OG_TITLE}}", "GPX Share (Beta)")
    .replaceAll("{{OG_URL}}", shareUrl)
    .replaceAll("{{OG_IMAGE}}", ogImageUrl)
    .replaceAll("{{ID}}", id);

  return c.html(html);
});

export default router;

function viewerTemplate(): string {
  return String.raw`
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta property="og:type" content="website">
    <meta property="og:title" content="{{OG_TITLE}}">
    <meta property="og:url" content="{{OG_URL}}">
    <meta property="og:image" content="{{OG_IMAGE}}">
    <title>{{TITLE}}</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.css"
    />
    <style>
      :root {
        --bg: #f5f5f4;
      }

      html,
      body {
        margin: 0;
        height: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
      }

      .app {
        height: 100%;
      }

      .app.drop-active {
        box-shadow: inset 0 0 0 4px #0f766e66;
      }

      #map {
        height: 100%;
        width: 100%;
      }
    </style>
    <script type="importmap">
      {
        "imports": {
          "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js",
          "exifr": "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js"
        }
      }
    </script>
  </head>
  <body>
    <div id="app-root" class="app">
      <div id="map"></div>
    </div>

    <script type="module">
      import { createDefaultTiliaApp } from "/tilia/src/index.js";

      async function loadGpx(id) {
        const response = await fetch("/api/gpx/" + encodeURIComponent(id));
        if (!response.ok) {
          throw new Error("GPX request failed: " + response.status);
        }

        const blob = await response.blob();
        return new File([blob], id + ".gpx", {
          type: blob.type || "application/gpx+xml",
        });
      }

      const app = createDefaultTiliaApp("map", {
        baseMapOptions: { zoom: 1, center: [0.0, 139.7413575] },
        plugins: [
          "tilia-panel",
          "tilia-status",
          "tilia-base-maps-control",
          "tilia-layers",
          "tilia-elevation",
          "tilia-query-import",
          "x-gsi-base-maps",
          "x-opentopomap-base-maps",
          "x-milestone",
          "x-gpx-export"
        ],
      });
      try {
        const file = await loadGpx("{{ID}}");
        await app.load(file);
      } catch (error) {
        app.setStatus(error.message);
      }
    </script>
  </body>
</html>
  `
}
