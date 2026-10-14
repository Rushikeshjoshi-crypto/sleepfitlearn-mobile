// A summary metric's display label ("heart_rate" → "heart rate"). The
// family summary passes metric_type straight from the child's rows, which an
// older client can leave null — that used to crash the whole screen.
export function metricTypeLabel(metricType: string | null | undefined): string {
  return (metricType ?? "").replace(/_/g, " ");
}
