/**
 * Realtime health dropdown — removed from the UI per product requirement.
 * Kept as a no-op so existing route imports keep compiling. Realtime itself
 * still runs in the QA store, gated by the backend `liveEnabled` toggle.
 */
export function RealtimeHealthMenu(_props: { className?: string }) {
  return null;
}
