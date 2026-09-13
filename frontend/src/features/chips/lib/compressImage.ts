/**
 * Скриншот оплаты сжимаем на телефоне до ~1500 px по длинной стороне (ТЗ §3.4): скрины из
 * банка тяжёлые, а сеть бывает плохой. Если браузер не умеет (HEIC, старые движки) —
 * отправляем как есть, сервер примет до 10 МБ.
 */
export async function compressImage(file: File, maxSide = 1500, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1_500_000) {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
