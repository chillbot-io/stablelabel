import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-zinc-900">
          <div className="max-w-md w-full mx-4 rounded-lg border border-red-500/30 bg-red-950/20 p-8 text-center">
            <div className="mb-4 text-red-400 text-4xl">!</div>
            <h1 className="text-xl font-semibold text-zinc-100 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-zinc-400 mb-6">
              {this.state.errorMessage}
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded-md bg-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-600 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
