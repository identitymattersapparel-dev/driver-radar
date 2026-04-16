export function calcProjectedFinish(completed, total, startTime) {
  const elapsedHrs = (Date.now() - startTime) / 3600000;
  if (elapsedHrs < 0.01 || completed === 0) return null;
  return new Date(
    Date.now() + ((total - completed) / (completed / elapsedHrs)) * 3600000
  );
}

export function getPaceLabel(completed, total, startTime, targetFinishTime) {
  if (completed === 0) return "START";
  const elapsedHrs = (Date.now() - startTime) / 3600000;
  if (elapsedHrs < 0.01) return "START";
  const totalDurationHrs = targetFinishTime
    ? (targetFinishTime - startTime) / 3600000
    : 8;
  const expectedByNow = (total / totalDurationHrs) * elapsedHrs;
  if (completed >= expectedByNow * 1.05) return "AHEAD";
  if (completed >= expectedByNow * 0.92) return "ON PACE";
  return "BEHIND";
}

export function paceColor(label) {
  if (label === "AHEAD")  return "#60a5fa";
  if (label === "BEHIND") return "#f87171";
  if (label === "START")  return "#94a3b8";
  return "#22c55e";
}
