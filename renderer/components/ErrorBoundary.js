/**
 * Error Boundary Component
 * Catches React errors and displays a fallback UI
 */

// Get React from window (loaded via CDN)
const { createElement: e, Component } = window.React;

/**
 * Error Boundary component that catches React errors and displays a fallback UI
 * Prevents the entire app from crashing when a component error occurs
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(_error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);

    // Store error details in state
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = () => {
    // Reset error boundary state and reload
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  toggleDetails = () => {
    this.setState(prevState => ({ showDetails: !prevState.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return e(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '40px',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          },
        },
        e(
          'div',
          {
            style: {
              backgroundColor: '#2a2a2a',
              padding: '32px',
              borderRadius: '8px',
              maxWidth: '600px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            },
          },
          e(
            'h1',
            {
              style: {
                margin: '0 0 16px 0',
                fontSize: '24px',
                fontWeight: '600',
                color: '#ff6b6b',
              },
            },
            'Something Went Wrong'
          ),
          e(
            'p',
            {
              style: {
                margin: '0 0 24px 0',
                fontSize: '16px',
                lineHeight: '1.5',
                color: '#cccccc',
              },
            },
            'The application encountered an unexpected error. You can reload the app to try again.'
          ),
          e(
            'div',
            {
              style: {
                display: 'flex',
                gap: '12px',
                marginBottom: '16px',
              },
            },
            e(
              'button',
              {
                onClick: this.handleReload,
                style: {
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#ffffff',
                  backgroundColor: '#4CAF50',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                },
                onMouseEnter: e => {
                  e.target.style.backgroundColor = '#45a049';
                },
                onMouseLeave: e => {
                  e.target.style.backgroundColor = '#4CAF50';
                },
              },
              'Reload App'
            ),
            e(
              'button',
              {
                onClick: this.toggleDetails,
                style: {
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#ffffff',
                  backgroundColor: '#555555',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                },
                onMouseEnter: e => {
                  e.target.style.backgroundColor = '#666666';
                },
                onMouseLeave: e => {
                  e.target.style.backgroundColor = '#555555';
                },
              },
              this.state.showDetails ? 'Hide Details' : 'View Details'
            )
          ),
          this.state.showDetails &&
            e(
              'div',
              {
                style: {
                  marginTop: '16px',
                  padding: '16px',
                  backgroundColor: '#1a1a1a',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#ff9999',
                  overflow: 'auto',
                  maxHeight: '300px',
                },
              },
              e(
                'div',
                {
                  style: { marginBottom: '12px', fontWeight: 'bold' },
                },
                'Error Details:'
              ),
              e('div', null, this.state.error && this.state.error.toString()),
              this.state.errorInfo &&
                e(
                  'div',
                  {
                    style: { marginTop: '12px', whiteSpace: 'pre-wrap' },
                  },
                  this.state.errorInfo.componentStack
                )
            )
        )
      );
    }

    return this.props.children;
  }
}
