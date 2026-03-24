/**
 * React Error Boundary — catches component crashes and shows a
 * user-friendly fallback instead of a white screen.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-zinc-100">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            An unexpected error occurred. You can try reloading the page or
            navigating back to the dashboard.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Reload
            </button>
            <a
              href="/"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Go Home
            </a>
          </div>

          {this.state.error && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-400">
                Error details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-red-400">
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
