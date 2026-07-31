import {
  svgIconShow,
  svgIconHide,
} from "./icons.js";

const params = new URLSearchParams(location.search);
const idInput = document.querySelector("#gpx-id");
idInput.value = params.get("id") ?? "";

const deleteSection = document.querySelector("#delete-section");
const tokenInput = document.querySelector("#delete-token");
const deleteButton = document.querySelector("#delete-button");
const statusMessage = document.querySelector("#status-message");
const toggleDeleteTokenButton = document.querySelector("#toggle-delete-token-button");

function init() {
  deleteButton.addEventListener(
    "click",
    async () => {
      const id = idInput.value.trim();
      const token = tokenInput.value.trim();

      if (!id) {
        statusMessage.textContent = "GPX ID is required.";
        return;
      }

      if (!token) {
        statusMessage.textContent = "Delete token is required.";
        return;
      }

      deleteButton.disabled = true;
      statusMessage.textContent = "Deleting...";
      const response = await fetch(
        `/api/gpx/${id}`,
        {
          method: "DELETE",
          headers: {
            "X-Delete-Token": token,
          },
        },
      );

      if (response.ok) {
        deleteSection.hidden = true;
        statusMessage.textContent = "This GPX file has been deleted.";
      } else if (
        response.status === 404 ||
        response.status === 410
      ) {
        statusMessage.textContent =
          "This GPX file has already been deleted or cannot be found. Please check that the GPX ID is correct.";
        deleteButton.disabled = true;
      } else if (
        response.status === 403
      ) {
        statusMessage.textContent =
          "Unable to delete this GPX file.\nPlease check that the delete token is correct and try again.";
        deleteButton.disabled = false;
      } else {
        statusMessage.textContent =
          "An unexpected error occurred.";
        deleteButton.disabled = false;
      }
    },
  );

  toggleDeleteTokenButton.addEventListener(
    "click",
    () => {
      const visible = tokenInput.type === "text";

      if (visible) {
        tokenInput.type = "password";
        toggleDeleteTokenButton.innerHTML = svgIconShow();
        toggleDeleteTokenButton.setAttribute(
          "aria-label",
          "Show delete token",
        );

      } else {
        tokenInput.type = "text";
        toggleDeleteTokenButton.innerHTML = svgIconHide();
        toggleDeleteTokenButton.setAttribute(
          "aria-label",
          "Hide delete token",
        );
      }
    },
  );

  toggleDeleteTokenButton.innerHTML = svgIconShow();
}

init();
