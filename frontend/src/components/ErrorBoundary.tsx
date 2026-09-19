import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one broken page does not blank the whole app.
 * Query and mutation errors are handled separately, inline, by each page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">Something broke.</p>
          <p className="mt-1 text-sm">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
