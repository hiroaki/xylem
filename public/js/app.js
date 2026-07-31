import { setupUpload } from "./upload.js";
import { setupTiliaApp } from "./map.js";
import { uploadGpx } from "./api.js";
import {
  svgIconShow,
  svgIconHide,
  svgCopyOutline,
} from "./icons.js";

const state = {
  file: null,
  gpxContent: null,
  uploadResult: null,
};


const elements = {
  uploadSection: document.querySelector("#upload-section"),
  previewSection: document.querySelector("#preview-section"),
  resultSection: document.querySelector("#result-section"),

  dropZone: document.querySelector("#drop-zone"),
  dropZoneMessage: document.querySelector(".drop-zone-message"),
  fileInput: document.querySelector("#file-input"),

  map: document.querySelector("#map"),

  previewTitle: document.querySelector("#preview-title"),
  uploadActions: document.querySelector("#upload-actions"),
  placeholderUploadFilename: document.querySelector("#placeholder-upload-filename"),

  uploadButton: document.querySelector("#upload-button"),

  shareUrl: document.querySelector("#share-url"),
  deleteUrl: document.querySelector("#delete-url"),
  deleteToken: document.querySelector("#delete-token"),

  statusMessage: document.querySelector("#status-message"),

  copyShareUrlButton: document.querySelector("#copy-share-url-button"),
  copyDeleteUrlButton: document.querySelector("#copy-delete-url-button"),
  copyDeleteTokenButton: document.querySelector("#copy-delete-token-button"),
  toggleDeleteTokenButton: document.querySelector("#toggle-delete-token-button"),

  copyMessages: document.querySelectorAll(".copy-message"),
};

async function showPreview() {
  elements.previewSection.hidden = false;

  await new Promise((resolve) => {
    const map = elements.map;

    map.addEventListener(
      "transitionend",
      (event) => {
        if (event.propertyName === "height") {
          resolve();
        }
      },
      { once: true },
    );

    requestAnimationFrame(() => {
      map.classList.add("expanded");
    });
  });

  const tiliaApp = setupTiliaApp(elements.map);
  await tiliaApp.load(state.file);
}

function completeUploadUI() {
  // elements.previewTitle.hidden = true;

  elements.uploadActions.textContent =
    "\u{1f389} Upload completed!";

  elements.fileInput.disabled = true;
  elements.dropZone.classList.add("completed");

  elements.dropZoneMessage.innerHTML =
    "Upload completed.<br>" +
    "Reload this page to upload another GPX file.";
}

function showResult(result) {
  elements.resultSection.hidden = false;

  elements.shareUrl.value = result.url;
  elements.deleteUrl.value = result.deleteUrl;
  elements.deleteToken.value = result.deleteToken;

  elements.resultSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}


function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function setUploadFilename(filename) {
  elements.placeholderUploadFilename.textContent = filename;
}

function showCopyMessage(button, message) {
  const copyField = button.closest(".copy-field");

  const messageElement =
    copyField.querySelector(".copy-message");

  messageElement.textContent = message;

  setTimeout(() => {
    messageElement.textContent = "";
  }, 2000);
}

async function copyToClipboard(value, button) {
  try {
    await navigator.clipboard.writeText(value);

    showCopyMessage(
      button,
      "Copied",
    );

  } catch (error) {
    console.error(error);

    showCopyMessage(
      button,
      "Copy failed",
    );
  }
}

function init() {
  elements.previewSection.hidden = true;
  elements.resultSection.hidden = true;

  setupUpload({
    onFileSelected: async (file) => {
      state.file = file;

      await showPreview();

      elements.previewTitle.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      setUploadFilename(file.name);
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

        completeUploadUI();

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

  elements.copyShareUrlButton.addEventListener(
    "click",
    async () => {
      try {
        copyToClipboard(
          elements.shareUrl.value,
          elements.copyShareUrlButton,
        );
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
        copyToClipboard(
          elements.deleteUrl.value,
          elements.copyDeleteUrlButton,
        );
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
        copyToClipboard(
          elements.deleteToken.value,
          elements.copyDeleteTokenButton,
        );
      } catch (error) {
        console.error(error);
        setStatus("Copy failed.");
      }
    },
  );

  elements.toggleDeleteTokenButton.addEventListener(
    "click",
    () => {
      const input = elements.deleteToken;
      const button = elements.toggleDeleteTokenButton;

      const visible = input.type === "text";

      if (visible) {
        input.type = "password";

        button.innerHTML = svgIconShow();
        button.setAttribute(
          "aria-label",
          "Show delete token",
        );
      } else {
        input.type = "text";

        button.innerHTML = svgIconHide();
        button.setAttribute(
          "aria-label",
          "Hide delete token",
        );
      }
    },
  );

  elements.copyShareUrlButton.innerHTML = svgCopyOutline();
  elements.copyDeleteUrlButton.innerHTML = svgCopyOutline();
  elements.copyDeleteTokenButton.innerHTML = svgCopyOutline();

  elements.toggleDeleteTokenButton.innerHTML = svgIconShow();
}

init();
