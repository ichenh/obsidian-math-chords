export function isTikzPrintContainer(
  containerEl: Pick<HTMLElement, "closest">,
): boolean {
  return containerEl.closest(".print") !== null;
}
