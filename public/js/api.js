const API_BASE = "/api";


export async function uploadGpx(file) {
  const formData = new FormData();

  formData.append("file", file);


  const response = await fetch(
    `${API_BASE}/upload`,
    {
      method: "POST",
      body: formData,
    },
  );


  const contentType =
    response.headers.get("content-type") || "";


  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = {
      error: await response.text(),
    };
  }


  if (!response.ok) {
    throw new Error(
      data.error || "Upload failed",
    );
  }


  return data;
}
