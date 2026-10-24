import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import WorkspaceShell from './WorkspaceShell';
import EditorErrorBoundary from './components/EditorErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EditorErrorBoundary>{new URLSearchParams(window.location.search).has('shell') ? <WorkspaceShell /> : <App />}</EditorErrorBoundary>
  </React.StrictMode>,
);
