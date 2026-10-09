import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="unlock-screen" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20 }}>
          <div className="glass card unlock-card stack text-center" style={{ maxWidth: 480, margin: 'auto' }}>
            <h2 style={{ color: 'var(--danger)', margin: '0 0 8px' }}>Something went wrong</h2>
            <p className="subtle" style={{ margin: '0 0 16px', fontSize: 14 }}>
              {this.state.error?.message || 'An unexpected error occurred while rendering the workspace.'}
            </p>
            <button
              type="button"
              className="btn btn-hot w-full"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Reload Health OS
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
