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

  map: document.querySelector("#map"),

  previewTitle: document.querySelector("#preview-title"),
  uploadActions: document.querySelector("#upload-actions"),

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
