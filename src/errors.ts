import { Notice } from "obsidian";

export function logAndNotice(message: string, error: unknown): void {
  console.error(message, error);
  new Notice(message);
}

export async function runWithNotice<T>(
  fn: () => Promise<T>,
  failureMessage: string,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    logAndNotice(failureMessage, error);
    return undefined;
  }
}
