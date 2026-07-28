const params = new URLSearchParams(
  location.search,
);
const id = params.get("id");

const tokenInput = document.querySelector("#delete-token");
const deleteButton = document.querySelector("#delete-button");
const statusMessage = document.querySelector("#status-message");

deleteButton.addEventListener(
  "click",
  async () => {
    const token = tokenInput.value.trim();

    if (!token) {
      statusMessage.textContent =
        "Delete token is required.";

      return;
    }

    deleteButton.disabled = true;

    statusMessage.textContent =
      "Deleting...";

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
      statusMessage.textContent =
        "Deleted successfully.";
    } else {
      statusMessage.textContent =
        "Delete failed.";

      deleteButton.disabled = false;
    }
  },
);
