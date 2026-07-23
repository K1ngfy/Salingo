/** Concrete recharts colors per theme. SVG presentation attributes can't read CSS vars,
 *  so charts resolve their palette from the effective dark-mode boolean instead. */
export function chartColors(dark: boolean) {
  return {
    grid: dark ? "#26262a" : "#ededE9",
    axisTick: dark ? "#8a8a8a" : "#999",
    axisTickDim: dark ? "#6f6f6f" : "#aaa",
    cursor: dark ? "#222226" : "#f5f5f1",
    accent: "#58cc02",
    tooltip: dark
      ? { borderRadius: 14, border: "2px solid #2a2a2e", backgroundColor: "#17181c", color: "#ececeb", fontWeight: 700 }
      : { borderRadius: 14, border: "2px solid #e8e8e3", fontWeight: 700 },
  } as const;
}
