export function sampleWithoutReplacement<T>(items: T[], count: number, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result.slice(0, Math.max(0, Math.min(count, result.length)));
}
