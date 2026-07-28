export function isTikzPrintContainer(
  containerEl: Pick<HTMLElement, "closest">,
): boolean {
  return containerEl.closest(".print") !== null;
}

export function trackTikzPostProcessorPromise(
  ctx: unknown,
  promise: Promise<unknown>,
): void {
  const promises = (ctx as { promises?: unknown }).promises;
  if (Array.isArray(promises)) promises.push(promise);
}
