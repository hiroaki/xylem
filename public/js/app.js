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

function svgCopyOutline() {
  return `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 467 512.22"><path fill-rule="nonzero" d="M131.07 372.11c.37 1 .57 2.08.57 3.2 0 1.13-.2 2.21-.57 3.21v75.91c0 10.74 4.41 20.53 11.5 27.62s16.87 11.49 27.62 11.49h239.02c10.75 0 20.53-4.4 27.62-11.49s11.49-16.88 11.49-27.62V152.42c0-10.55-4.21-20.15-11.02-27.18l-.47-.43c-7.09-7.09-16.87-11.5-27.62-11.5H170.19c-10.75 0-20.53 4.41-27.62 11.5s-11.5 16.87-11.5 27.61v219.69zm-18.67 12.54H57.23c-15.82 0-30.1-6.58-40.45-17.11C6.41 356.97 0 342.4 0 326.52V57.79c0-15.86 6.5-30.3 16.97-40.78l.04-.04C27.51 6.49 41.94 0 57.79 0h243.63c15.87 0 30.3 6.51 40.77 16.98l.03.03c10.48 10.48 16.99 24.93 16.99 40.78v36.85h50c15.9 0 30.36 6.5 40.82 16.96l.54.58c10.15 10.44 16.43 24.66 16.43 40.24v302.01c0 15.9-6.5 30.36-16.96 40.82-10.47 10.47-24.93 16.97-40.83 16.97H170.19c-15.9 0-30.35-6.5-40.82-16.97-10.47-10.46-16.97-24.92-16.97-40.82v-69.78zM340.54 94.64V57.79c0-10.74-4.41-20.53-11.5-27.63-7.09-7.08-16.86-11.48-27.62-11.48H57.79c-10.78 0-20.56 4.38-27.62 11.45l-.04.04c-7.06 7.06-11.45 16.84-11.45 27.62v268.73c0 10.86 4.34 20.79 11.38 27.97 6.95 7.07 16.54 11.49 27.17 11.49h55.17V152.42c0-15.9 6.5-30.35 16.97-40.82 10.47-10.47 24.92-16.96 40.82-16.96h170.35z"/></svg>`
}

function svgIconShow() {
  return `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="122.879px" height="79.699px" viewBox="0 0 122.879 79.699" enable-background="new 0 0 122.879 79.699" xml:space="preserve"><g><path d="M0.955,37.326c2.922-3.528,5.981-6.739,9.151-9.625C24.441,14.654,41.462,7.684,59.01,7.334 c6.561-0.131,13.185,0.665,19.757,2.416l-5.904,5.904c-4.581-0.916-9.168-1.324-13.714-1.233 c-15.811,0.316-31.215,6.657-44.262,18.533l0,0c-2.324,2.115-4.562,4.39-6.702,6.82c4.071,4.721,8.6,8.801,13.452,12.227 c2.988,2.111,6.097,3.973,9.296,5.586l-5.262,5.262c-2.782-1.504-5.494-3.184-8.12-5.039c-6.143-4.338-11.813-9.629-16.78-15.85 C-0.338,40.563-0.228,38.59,0.955,37.326L0.955,37.326L0.955,37.326z M96.03,0l5.893,5.893L28.119,79.699l-5.894-5.895L96.03,0 L96.03,0z M97.72,17.609c4.423,2.527,8.767,5.528,12.994,9.014c3.877,3.196,7.635,6.773,11.24,10.735 c1.163,1.277,1.22,3.171,0.226,4.507c-4.131,5.834-8.876,10.816-14.069,14.963C95.119,67.199,79.338,72.305,63.352,72.377 c-6.114,0.027-9.798-3.141-15.825-4.576l3.545-3.543c4.065,0.705,8.167,1.049,12.252,1.031c14.421-0.064,28.653-4.668,40.366-14.02 c3.998-3.191,7.706-6.939,11.028-11.254c-2.787-2.905-5.627-5.543-8.508-7.918c-4.455-3.673-9.042-6.759-13.707-9.273L97.72,17.609 L97.72,17.609z M61.44,18.143c2.664,0,5.216,0.481,7.576,1.359l-5.689,5.689c-0.619-0.079-1.248-0.119-1.886-0.119 c-4.081,0-7.775,1.654-10.449,4.328c-2.674,2.674-4.328,6.369-4.328,10.45c0,0.639,0.04,1.268,0.119,1.885l-5.689,5.691 c-0.879-2.359-1.359-4.912-1.359-7.576c0-5.995,2.43-11.42,6.358-15.349C50.02,20.572,55.446,18.143,61.44,18.143L61.44,18.143z M82.113,33.216c0.67,2.09,1.032,4.32,1.032,6.634c0,5.994-2.43,11.42-6.357,15.348c-3.929,3.928-9.355,6.357-15.348,6.357 c-2.313,0-4.542-0.361-6.633-1.033l5.914-5.914c0.238,0.012,0.478,0.018,0.719,0.018c4.081,0,7.775-1.652,10.449-4.326 s4.328-6.369,4.328-10.449c0-0.241-0.006-0.48-0.018-0.72L82.113,33.216L82.113,33.216z"/></g></svg>`
}

function svgIconHide() {
  return `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 122.88 65.06" style="enable-background:new 0 0 122.88 65.06" xml:space="preserve"><g><path d="M0.95,30.01c2.92-3.53,5.98-6.74,9.15-9.63C24.44,7.33,41.46,0.36,59.01,0.01c17.51-0.35,35.47,5.9,51.7,19.29 c3.88,3.2,7.63,6.77,11.24,10.74c1.16,1.28,1.22,3.17,0.23,4.51c-4.13,5.83-8.88,10.82-14.07,14.96 C95.12,59.88,79.34,64.98,63.35,65.06c-15.93,0.07-32.06-4.86-45.8-14.57c-6.14-4.34-11.81-9.63-16.78-15.85 C-0.34,33.24-0.23,31.27,0.95,30.01L0.95,30.01z M61.44,26.46c0.59,0,1.17,0.09,1.71,0.24c-0.46,0.5-0.73,1.17-0.73,1.9 c0,1.56,1.26,2.82,2.82,2.82c0.77,0,1.46-0.3,1.97-0.8c0.2,0.6,0.3,1.24,0.3,1.9c0,3.35-2.72,6.07-6.07,6.07 c-3.35,0-6.07-2.72-6.07-6.07C55.37,29.18,58.09,26.46,61.44,26.46L61.44,26.46z M61.44,10.82c5.99,0,11.42,2.43,15.35,6.36 c3.93,3.93,6.36,9.35,6.36,15.35c0,5.99-2.43,11.42-6.36,15.35c-3.93,3.93-9.35,6.36-15.35,6.36c-5.99,0-11.42-2.43-15.35-6.36 c-3.93-3.93-6.36-9.35-6.36-15.35c0-5.99,2.43-11.42,6.36-15.35C50.02,13.25,55.45,10.82,61.44,10.82L61.44,10.82z M71.89,22.08 c-2.67-2.67-6.37-4.33-10.45-4.33c-4.08,0-7.78,1.65-10.45,4.33c-2.67,2.67-4.33,6.37-4.33,10.45c0,4.08,1.65,7.78,4.33,10.45 c2.67,2.67,6.37,4.33,10.45,4.33c4.08,0,7.78-1.65,10.45-4.33c2.67-2.67,4.33-6.37,4.33-10.45C76.22,28.45,74.56,24.75,71.89,22.08 L71.89,22.08z M14.89,25.63c-2.32,2.11-4.56,4.39-6.7,6.82c4.07,4.72,8.6,8.8,13.45,12.23c12.54,8.85,27.21,13.35,41.69,13.29 c14.42-0.07,28.65-4.67,40.37-14.02c4-3.19,7.7-6.94,11.03-11.25c-2.79-2.91-5.63-5.54-8.51-7.92C91.33,12.51,75,6.79,59.15,7.1 C43.34,7.42,27.93,13.76,14.89,25.63L14.89,25.63z"/></g></svg>`
}

init();
