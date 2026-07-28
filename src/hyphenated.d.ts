declare module "hyphenated" {
  interface HyphenationLanguage {
    id: string;
    patterns: string[];
    exceptions?: string[];
  }

  export function hyphenated(
    text: string,
    options?: { language?: HyphenationLanguage },
  ): string;
}
