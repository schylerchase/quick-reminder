/**
 * Format a millisecond timestamp as a `datetime-local` input value
 * (`YYYY-MM-DDTHH:mm`). Shared by the dashboard view and the reminder-manager
 * modal so the two edit rows produce identical input values.
 *
 * Built from local-time field accessors so it stays correct across DST
 * boundaries — the old offset-subtraction trick shifted by an hour for any
 * time on the other side of a DST transition.
 */
export function formatInputDate(ms: number): string {
  const date = new Date(ms);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
