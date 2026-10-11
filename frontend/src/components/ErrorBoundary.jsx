// frontend/src/components/ErrorBoundary.jsx
// Shows a render error instead of a blank white page.
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('BioToken render error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ maxWidth: 820, margin: '4rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.4rem', color: '#991B1B' }}>Something went wrong while rendering this page</h1>
        <pre style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#FEF2F2',
          border: '1px solid #FECACA', borderRadius: 8, padding: '1rem', fontSize: '0.8rem', color: '#7F1D1D',
        }}>{String(error?.stack || error)}</pre>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Reload
        </button>
      </div>
    );
  }
}
