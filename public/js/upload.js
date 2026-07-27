export function setupUpload({
  onFileSelected,
}) {

  const dropZone =
    document.querySelector("#drop-zone");

  const input =
    document.querySelector("#file-input");


  input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    onFileSelected(file);

    input.value = "";
  });


  dropZone.addEventListener(
    "dragenter",
    (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    },
  );


  dropZone.addEventListener(
    "dragover",
    (event) => {
      event.preventDefault();
    },
  );


  dropZone.addEventListener(
    "dragleave",
    (event) => {
      event.preventDefault();

      if (
        !dropZone.contains(event.relatedTarget)
      ) {
        dropZone.classList.remove(
          "drag-over",
        );
      }
    },
  );


  dropZone.addEventListener(
    "drop",
    (event) => {
      event.preventDefault();

      dropZone.classList.remove(
        "drag-over",
      );

      const file =
        event.dataTransfer?.files?.[0];

      if (!file) {
        return;
      }

      onFileSelected(file);
    },
  );

}
