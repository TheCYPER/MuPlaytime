const unicodeOuterWhitespace = /^\p{White_Space}+|\p{White_Space}+$/gu;

export const NORMALIZATION_VERSION = "unicode-root-lower-v1";

export interface NormalizedNamePreview {
  displayName: string;
  normalizedName: string;
  version: typeof NORMALIZATION_VERSION;
}

/**
 * Client preview of normalize_name_v1. The database result remains authoritative
 * because JavaScript and PostgreSQL may ship different Unicode data versions.
 */
export function normalizeNamePreview(input: string): NormalizedNamePreview {
  const displayName = input
    .normalize("NFC")
    .replace(unicodeOuterWhitespace, "");
  if (displayName.length === 0) {
    throw new Error("name_empty");
  }

  return {
    displayName,
    normalizedName: displayName.toLocaleLowerCase("und"),
    version: NORMALIZATION_VERSION,
  };
}
