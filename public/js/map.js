import { createDefaultTiliaApp } from "/tilia/src/index.js";

const instances = new WeakMap();


export function setupTiliaApp(container) {
  let app = instances.get(container);

  if (app) {
    return app;
  }

  if (!isVisible(container)) {
    console.error(
      "Cannot initialize Tilia app: container is not visible.",
      container,
    );

    throw new Error(
      "Tilia container must be visible before initialization.",
    );
  }

  app = createDefaultTiliaApp(container.id);

  const tiliaApp = {
    async load(file) {
      app.core.clearAll();
      await app.load(file);
    }
  };

  instances.set(container, tiliaApp);

  return tiliaApp;
}


function isVisible(element) {
  if (!element) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}