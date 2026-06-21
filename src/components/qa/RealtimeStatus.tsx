/**
 * Live/Realtime status indicator — intentionally removed from the UI per
 * product requirement. The realtime subscription still runs in the QA store
 * (see `QAProvider`); this component is preserved as a no-op so existing
 * imports keep compiling without ever surfacing a "Live" label, icon, or
 * tooltip on screen.
 */
export function RealtimeStatus(_props: { className?: string }) {
  return null;
}