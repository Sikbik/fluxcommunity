import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Rendered instead of the children after a render error. */
  fallback: ReactNode | ((error: Error) => ReactNode);
  /** Called with the error, for logging. */
  onError?: (error: Error) => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Contains a render error to one subtree: a crashing section or overlay never takes the
 * page down. Errors are logged with `console.error`.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[flux-community] a component crashed and was contained:', error, info.componentStack);
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const { fallback } = this.props;
      return typeof fallback === 'function' ? fallback(error) : fallback;
    }
    return this.props.children;
  }
}
