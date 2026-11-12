// Save helpers over the Rust bridge: the web's `<a download>` hack has no
// counterpart in the desktop shell. The share card PNG goes to Downloads
// (`save_to_downloads`); the sessions CSV opens the OS save dialog first
// (`save_file_as`, default folder = Desktop) so the operator picks the
// landing spot. Path sanitization lives in Rust, not here.

import { invoke } from "@tauri-apps/api/core";

export type SaveResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" }
  | { status: "failed" };

/** UTF-8 text → OS save dialog (default Desktop); cancel is not an error. */
export async function saveTextAs(
  filename: string,
  text: string,
): Promise<SaveResult> {
  try {
    const path = await invoke<string | null>("save_file_as", {
      filename,
      contents: Array.from(new TextEncoder().encode(text)),
    });

    return path === null ? { status: "cancelled" } : { status: "saved", path };
  } catch {
    return { status: "failed" };
  }
}

/** A `data:image/png` URL (the share card export) → Downloads. */
export async function savePngDataUrlToDownloads(
  dataUrl: string,
  filename: string,
): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return await invoke<string>("save_to_downloads", {
    filename,
    contents: Array.from(bytes),
  });
}
