// ============================================================
// LIFElink — UI: Loading Screen
// ============================================================

import './UI.css';

export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-logo">
          <span className="loading-icon">⛑️</span>
          <h1 className="loading-title">LIFElink</h1>
          <p className="loading-subtitle">Underground Mine Safety System</p>
        </div>
        <div className="loading-bar-container">
          <div className="loading-bar" />
        </div>
        <p className="loading-text">Initializing 3D Environment...</p>
      </div>
    </div>
  );
}
