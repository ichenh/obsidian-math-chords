import { en, type TranslationKey } from "./locales/en";
import {
  BUNDLED_LOCALE_GZIP_BASE64,
  BUNDLED_LOCALE_KEYS,
} from "./locales/index";

export async function loadBundledLocale(
  code: string,
): Promise<Record<TranslationKey, string> | null> {
  if (code === "en") return en;
  const encoded = BUNDLED_LOCALE_GZIP_BASE64[code];
  if (!encoded) return null;
  const compressed = decodeBase64(encoded);
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const values = JSON.parse(await new Response(stream).text()) as unknown;
  if (
    !Array.isArray(values) ||
    values.length !== BUNDLED_LOCALE_KEYS.length ||
    values.some((value) => typeof value !== "string")
  ) {
    throw new Error(`Bundled locale ${code} is invalid.`);
  }
  return Object.fromEntries(
    BUNDLED_LOCALE_KEYS.map((key, index) => [key, values[index]]),
  ) as Record<TranslationKey, string>;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
