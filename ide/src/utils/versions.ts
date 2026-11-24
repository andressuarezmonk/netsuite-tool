const STRICT_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/** "1.9.0" -> [1, 9, 0]; anything that isn't plain X.Y.Z -> null. */
export function parseVersion(version: string): [number, number, number] | null {
  const match = STRICT_VERSION_PATTERN.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative when `first` is older, positive when newer, 0 when equal. */
export function compareVersions(first: string, second: string): number {
  const firstParts = parseVersion(first);
  const secondParts = parseVersion(second);
  if (!firstParts || !secondParts) {
    throw new Error(`Can't compare "${first}" with "${second}".`);
  }
  for (let index = 0; index < 3; index++) {
    const difference = firstParts[index] - secondParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}
