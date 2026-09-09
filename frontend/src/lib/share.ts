/** Touch + coarse pointer — desktop Safari must not call Web Share. */
export function isTouchShareDevice(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }
  if (!(navigator.maxTouchPoints > 0)) {
    return false;
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(pointer: coarse)").matches;
  }
  return true;
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

export type ShareUrlOutcome = "shared" | "copied" | "failed";

/** Desktop copies the URL. Touch uses Web Share, then clipboard on cancel or error. */
export async function shareOrCopyUrl(input: {
  title: string;
  url: string;
  text?: string;
}): Promise<ShareUrlOutcome> {
  const text = input.text ?? `${input.title} · Day2`;
  if (isTouchShareDevice() && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: input.title, url: input.url, text });
      return "shared";
    } catch {
      // cancelled or failed → clipboard
    }
  }
  return (await copyText(input.url)) ? "copied" : "failed";
}
