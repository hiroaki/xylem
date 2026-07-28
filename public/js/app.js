import { setupUpload } from "./upload.js";
import { setupTiliaApp } from "./map.js";
import { uploadGpx } from "./api.js";

const state = {
  file: null,
  gpxContent: null,
  uploadResult: null,
};


const elements = {
  uploadSection: document.querySelector("#upload-section"),
  previewSection: document.querySelector("#preview-section"),
  resultSection: document.querySelector("#result-section"),

  map: document.querySelector("#map"),

  previewTitle: document.querySelector("#preview-title"),
  uploadActions: document.querySelector("#upload-actions"),

  uploadButton: document.querySelector("#upload-button"),

  shareUrl: document.querySelector("#share-url"),
  deleteUrl: document.querySelector("#delete-url"),
  deleteToken: document.querySelector("#delete-token"),

  statusMessage: document.querySelector("#status-message"),

  copyUrlButton: document.querySelector("#copy-url-button"),
  copyDeleteUrlButton: document.querySelector("#copy-delete-url-button"),
  copyDeleteTokenButton: document.querySelector("#copy-delete-token-button"),
};

function showPreview() {
  elements.previewSection.hidden = false;
}

async function completeUploadUI() {
  elements.previewTitle.hidden = true;

  elements.uploadActions.textContent =
    "Upload completed";

  await collapseUploadSection();
}

function collapseUploadSection() {
  return new Promise((resolve) => {
    const element = elements.uploadSection;

    const height = element.offsetHeight;

    element.style.height = `${height}px`;
    element.style.overflow = "hidden";

    requestAnimationFrame(() => {
      element.style.height = "0px";
      element.style.opacity = "0";
    });

    element.addEventListener(
      "transitionend",
      () => {
        element.remove();
        resolve();
      },
      { once: true },
    );
  });
}

function showResult(result) {
  elements.resultSection.hidden = false;

  elements.shareUrl.value = result.url;
  elements.deleteUrl.value = result.deleteUrl;
  elements.deleteToken.value = result.deleteToken;
}


function setStatus(message) {
  elements.statusMessage.textContent = message;
}


function init() {
  elements.previewSection.hidden = true;
  elements.resultSection.hidden = true;

  setupUpload({
    onFileSelected: async (file) => {
      state.file = file;

      showPreview();
      const tiliaApp = setupTiliaApp(elements.map);
      await tiliaApp.load(file);

      setStatus(`Selected: ${file.name}`);
    },
    onError: (message) => {
      setStatus(message);
    },
  });

  elements.uploadButton.addEventListener(
    "click",
    async () => {
      if (!state.file) {
        return;
      }


      setStatus("Uploading...");

      try {
        const result = await uploadGpx(state.file);

        state.uploadResult = result;

        await completeUploadUI();

        showResult(result);
        setStatus("");
      } catch (error) {
        console.error(error);

        setStatus(
          error.message,
        );
      }
    },
  );

  elements.copyUrlButton.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(
          elements.shareUrl.value,
        );
        setStatus("Copied URL.");
      } catch (error) {
        console.error(error);
        setStatus("Copy failed.");
      }
    },
  );

  elements.copyDeleteUrlButton.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(
          elements.deleteUrl.value,
        );
        setStatus("Copied Delete URL.");
      } catch (error) {
        console.error(error);
        setStatus("Copy failed.");
      }
    },
  );

  elements.copyDeleteTokenButton.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(
          elements.deleteToken.value,
        );
        setStatus("Copied Delete Token.");
      } catch (error) {
        console.error(error);
        setStatus("Copy failed.");
      }
    },
  );
}


init();
