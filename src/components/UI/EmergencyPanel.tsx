// ============================================================
// LIFElink — UI: Emergency Panel
// ============================================================

import { useCallback, useRef, useEffect } from 'react';
import { useSimulationStore, type EmergencyType } from '../../stores/simulationStore';
import { WORKERS } from '../../utils/constants';
import './UI.css';

const SCENARIOS: { type: EmergencyType; label: string; sensor: string; icon: string }[] = [
  { type: 'fall', label: 'Fall Detection', sensor: 'MPU6050', icon: '🔻' },
  { type: 'heartrate', label: 'Heart Rate / SpO₂', sensor: 'MAX30102', icon: '❤️' },
  { type: 'temperature', label: 'Temperature', sensor: 'DS18B20', icon: '🌡️' },
  { type: 'gas', label: 'Air Quality / Gas', sensor: 'MQ-135', icon: '💨' },
];

export default function EmergencyPanel() {
  const activeEmergency = useSimulationStore((s) => s.activeEmergency);
  const emergencyPhase = useSimulationStore((s) => s.emergencyPhase);
  const triggerEmergency = useSimulationStore((s) => s.triggerEmergency);
  const setEmergencyPhase = useSimulationStore((s) => s.setEmergencyPhase);
  const resetEmergency = useSimulationStore((s) => s.resetEmergency);
  const affectedId = useSimulationStore((s) => s.affectedWorkerId);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const handleTrigger = useCallback(
    (type: EmergencyType) => {
      if (activeEmergency) return;

      // Select the default affected worker (W-03 for most, W-05 for gas)
      const targetWorker = type === 'gas' ? 'W-05' : 'W-03';
      triggerEmergency(type, targetWorker);

      // Phase progression: detecting → alerting → received
      const t1 = setTimeout(() => setEmergencyPhase('alerting'), 2000);
      const t2 = setTimeout(() => setEmergencyPhase('received'), 4500);
      timerRef.current = [t1, t2];
    },
    [activeEmergency, triggerEmergency, setEmergencyPhase]
  );

  const handleReset = useCallback(() => {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
    resetEmergency();
  }, [resetEmergency]);

  useEffect(() => {
    return () => {
      timerRef.current.forEach(clearTimeout);
    };
  }, []);

  const affectedWorker = WORKERS.find((w) => w.id === affectedId);

  return (
    <div className="emergency-panel">
      <div className="panel-header">
        <span className="panel-title">Simulate Emergency</span>
      </div>

      <div className="scenario-buttons">
        {SCENARIOS.map((s) => (
          <button
            key={s.type}
            className={`scenario-btn ${activeEmergency === s.type ? 'active' : ''}`}
            onClick={() => handleTrigger(s.type)}
            disabled={activeEmergency !== null && activeEmergency !== s.type}
          >
            <span className="scenario-icon">{s.icon}</span>
            <span className="scenario-label">{s.label}</span>
            <span className="scenario-sensor">{s.sensor}</span>
          </button>
        ))}
      </div>

      {activeEmergency && (
        <div className="alert-status">
          <div className="alert-info">
            <div className="alert-badge" data-phase={emergencyPhase}>
              {emergencyPhase === 'detecting' && '🔍 Detecting...'}
              {emergencyPhase === 'alerting' && '⚠️ Alert Sent'}
              {emergencyPhase === 'received' && '🚨 Alert Received'}
            </div>
            {affectedWorker && (
              <div className="alert-details">
                <span>Worker: {affectedWorker.name} ({affectedWorker.id})</span>
                <span>Zone: {affectedWorker.zone}</span>
              </div>
            )}
          </div>
          <button className="reset-btn" onClick={handleReset}>
            ↺ Reset
          </button>
        </div>
      )}
    </div>
  );
}
