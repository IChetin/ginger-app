export const HAND_SLUG_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const HAND_SLUG_LENGTH = 10;

export function generateHandSlug(): string {
  const bytes = new Uint8Array(HAND_SLUG_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => HAND_SLUG_ALPHABET[byte % HAND_SLUG_ALPHABET.length]).join("");
}

export function isHandSlug(value: string): boolean {
  return (
    value.length === HAND_SLUG_LENGTH && [...value].every((ch) => HAND_SLUG_ALPHABET.includes(ch))
  );
}
