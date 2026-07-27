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

  uploadButton: document.querySelector("#upload-button"),

  shareUrl: document.querySelector("#share-url"),
  deleteKey: document.querySelector("#delete-key"),

  statusMessage: document.querySelector("#status-message"),

  copyUrlButton: document.querySelector("#copy-url-button"),
  copyDeleteKeyButton: document.querySelector("#copy-delete-key-button"),
};


function showPreview() {
  elements.previewSection.hidden = false;
}


function showResult(result) {
  elements.resultSection.hidden = false;

  elements.shareUrl.value = result.url;
  elements.deleteKey.value = result.delete_key;
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
        const result = await uploadGpx(
          state.file,
        );

        state.uploadResult = result;

        showResult(result);

        setStatus(
          "Upload completed.",
        );

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

  elements.copyDeleteKeyButton.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(
          elements.deleteKey.value,
        );
        setStatus("Copied Delete Key.");
      } catch (error) {
        console.error(error);
        setStatus("Copy failed.");
      }
    },
  );
}


init();
