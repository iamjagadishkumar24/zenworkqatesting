import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = {
  children: ReactNode;
  fallback?: ReactNode | ((opts: { error: Error; reset: () => void }) => ReactNode);
  name?: string;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack ?? "";
    // First non-empty frame in a React component stack — that's the throwing component.
    const componentName =
      stack
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("at "))
        ?.replace(/^at\s+/, "")
        .split(" ")[0] ?? "unknown";
    const capturedAt = new Date().toISOString();
    // Always log to the console for fast local debugging.

    console.error(
      `[ErrorBoundary:${this.props.name || "component_error_boundary"}] ${componentName} @ ${capturedAt}`,
      error,
    );
    reportLovableError(error, {
      boundary: this.props.name || "component_error_boundary",
      componentStack: stack,
      componentName,
      capturedAt,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === "function") {
        return fallback({ error: this.state.error, reset: this.reset });
      }
      if (fallback !== undefined) return fallback;
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">This section couldn't load.</p>
          <p className="mt-1 text-xs text-muted-foreground">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="mt-2 rounded border px-2 py-1 text-xs hover:bg-muted"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
