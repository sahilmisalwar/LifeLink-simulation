// ============================================================
// LIFElink — UI: Legend
// ============================================================

import './UI.css';

export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Legend</div>
      <div className="legend-items">
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#22C55E' }} />
          Worker (Normal)
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#EF4444' }} />
          Worker (Danger)
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#FFD700' }} />
          Helmet
        </div>
        <div className="legend-item">
          <span className="legend-line" style={{ background: '#00E5FF' }} />
          Signal Link
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#00E5FF', boxShadow: '0 0 6px #00E5FF' }} />
          Data Packet
        </div>
      </div>
    </div>
  );
}
