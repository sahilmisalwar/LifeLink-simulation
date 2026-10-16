// ============================================================
// LIFElink — Global State Store (Zustand)
// ============================================================

import { create } from 'zustand';

export type ViewLayer = 'mine' | 'signal';

export type EmergencyType = 'fall' | 'heartrate' | 'temperature' | 'gas' | null;

export interface SimulationState {
  // Layer
  activeLayer: ViewLayer;
  setActiveLayer: (layer: ViewLayer) => void;
  layerTransition: number; // 0 = mine, 1 = signal (for animation)
  setLayerTransition: (t: number) => void;

  // Emergency
  activeEmergency: EmergencyType;
  affectedWorkerId: string | null;
  emergencyPhase: 'idle' | 'detecting' | 'alerting' | 'received';
  triggerEmergency: (type: EmergencyType, workerId?: string) => void;
  setEmergencyPhase: (phase: 'idle' | 'detecting' | 'alerting' | 'received') => void;
  resetEmergency: () => void;

  // Camera
  shouldResetCamera: boolean;
  resetCamera: () => void;
  clearCameraReset: () => void;

  // Loading
  isLoaded: boolean;
  setLoaded: (loaded: boolean) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  // Layer
  activeLayer: 'mine',
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  layerTransition: 0,
  setLayerTransition: (t) => set({ layerTransition: t }),

  // Emergency
  activeEmergency: null,
  affectedWorkerId: null,
  emergencyPhase: 'idle',
  triggerEmergency: (type, workerId) =>
    set({
      activeEmergency: type,
      affectedWorkerId: workerId || 'W-03',
      emergencyPhase: 'detecting',
    }),
  setEmergencyPhase: (phase) => set({ emergencyPhase: phase }),
  resetEmergency: () =>
    set({
      activeEmergency: null,
      affectedWorkerId: null,
      emergencyPhase: 'idle',
    }),

  // Camera
  shouldResetCamera: false,
  resetCamera: () => set({ shouldResetCamera: true }),
  clearCameraReset: () => set({ shouldResetCamera: false }),

  // Loading
  isLoaded: false,
  setLoaded: (loaded) => set({ isLoaded: loaded }),
}));
