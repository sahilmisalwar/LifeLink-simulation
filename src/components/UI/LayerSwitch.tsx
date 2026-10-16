// ============================================================
// LIFElink — UI: Layer Switch Toggle
// ============================================================

import { useCallback, useRef, useEffect } from 'react';
import { useSimulationStore, type ViewLayer } from '../../stores/simulationStore';
import './UI.css';

export default function LayerSwitch() {
  const activeLayer = useSimulationStore((s) => s.activeLayer);
  const setActiveLayer = useSimulationStore((s) => s.setActiveLayer);
  const setLayerTransition = useSimulationStore((s) => s.setLayerTransition);
  const animRef = useRef<number | null>(null);

  const animateTransition = useCallback(
    (target: ViewLayer) => {
      setActiveLayer(target);

      const start = target === 'signal' ? 0 : 1;
      const end = target === 'signal' ? 1 : 0;
      const duration = 800;
      const startTime = performance.now();

      if (animRef.current) cancelAnimationFrame(animRef.current);

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Ease in-out
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const value = start + (end - start) * eased;
        setLayerTransition(value);

        if (t < 1) {
          animRef.current = requestAnimationFrame(tick);
        }
      };

      animRef.current = requestAnimationFrame(tick);
    },
    [setActiveLayer, setLayerTransition]
  );

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="layer-switch">
      <button
        className={`layer-btn ${activeLayer === 'mine' ? 'active' : ''}`}
        onClick={() => animateTransition('mine')}
      >
        <span className="layer-icon">⛏️</span>
        Mine View
      </button>
      <button
        className={`layer-btn ${activeLayer === 'signal' ? 'active' : ''}`}
        onClick={() => animateTransition('signal')}
      >
        <span className="layer-icon">📡</span>
        Signal Network
      </button>
    </div>
  );
}
