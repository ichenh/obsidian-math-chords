export function tikzAccessibleName(source: string): string {
  const match = /^\s*%\s*alt\s*:\s*(.+?)\s*$/imu.exec(source);
  return match?.[1]?.replace(/\s+/gu, " ").slice(0, 240) || "";
}
