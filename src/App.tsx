import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Radio,
  AlertTriangle,
  RotateCcw,
  Layers,
  Zap,
  Play,
  Heart,
  Thermometer,
  Wind,
  Activity,
  Gamepad2,
  Smartphone,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Compass,
  Shield
} from 'lucide-react';

const _zee = new THREE.Vector3(0, 0, 1);
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X
const _yawQ = new THREE.Quaternion();

function setDeviceOrientationQuat(
  quaternion: THREE.Quaternion,
  alpha: number,
  beta: number,
  gamma: number,
  orient: number,
  yawOffset: number
) {
  _euler.set(beta, alpha, -gamma, 'YXZ');
  quaternion.setFromEuler(_euler);
  quaternion.multiply(_q1);
  quaternion.multiply(_q0.setFromAxisAngle(_zee, -orient));

  if (yawOffset !== 0) {
    _yawQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOffset);
    quaternion.premultiply(_yawQ);
  }
}

class MineAudioEngine {
  ctx: AudioContext | null = null;
  isMuted = false;
  masterGain: GainNode | null = null;
  surfaceGain: GainNode | null = null;
  undergroundGain: GainNode | null = null;
  machineryGain: GainNode | null = null;
  meshGain: GainNode | null = null;
  noiseBuffer: AudioBuffer | null = null;
  windFilter: BiquadFilterNode | null = null;
  fanOsc: OscillatorNode | null = null;
  isInitialized = false;
  lastDrillTime = 0;
  lastCartTime = 0;
  lastPingTime = 0;
  lastAlarmTime = 0;

  init() {
    if (this.isInitialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : 0.75;
    this.masterGain.connect(this.ctx.destination);

    // Create shared noise buffer (3 seconds of pink/brown-like filtered noise)
    const bufferSize = this.ctx.sampleRate * 3;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.04 * white) / 1.04;
      lastOut = output[i];
      output[i] *= 2.5;
    }

    // 1. Surface Wind & Mountain Breeze Loop
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = this.noiseBuffer;
    windSource.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 1.8;
    this.surfaceGain = this.ctx.createGain();
    this.surfaceGain.gain.value = 0.08;
    windSource.connect(windFilter);
    windFilter.connect(this.surfaceGain);
    this.surfaceGain.connect(this.masterGain);
    windSource.start(0);
    this.windFilter = windFilter;

    // 2. Deep Underground Cavern & Ventilation Fan Drone Loop
    const caveSource = this.ctx.createBufferSource();
    caveSource.buffer = this.noiseBuffer;
    caveSource.loop = true;
    const caveFilter = this.ctx.createBiquadFilter();
    caveFilter.type = 'lowpass';
    caveFilter.frequency.value = 115;
    this.undergroundGain = this.ctx.createGain();
    this.undergroundGain.gain.value = 0.18;
    caveSource.connect(caveFilter);
    caveFilter.connect(this.undergroundGain);
    this.undergroundGain.connect(this.masterGain);
    caveSource.start(0);

    // Ventilation Fan Blade Hum (60Hz + 120Hz harmonic)
    const fanOsc = this.ctx.createOscillator();
    fanOsc.type = 'sawtooth';
    fanOsc.frequency.value = 58;
    const fanFilter = this.ctx.createBiquadFilter();
    fanFilter.type = 'lowpass';
    fanFilter.frequency.value = 130;
    this.machineryGain = this.ctx.createGain();
    this.machineryGain.gain.value = 0.05;
    fanOsc.connect(fanFilter);
    fanFilter.connect(this.machineryGain);
    this.machineryGain.connect(this.masterGain);
    fanOsc.start(0);
    this.fanOsc = fanOsc;

    this.isInitialized = true;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (!this.isInitialized && !muted) {
      this.init();
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.75, this.ctx.currentTime, 0.08);
    }
    if (muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // Called in animation loop to dynamically mix spatial audio based on camera position & state
  updateSpatialMix(
    cameraPos: THREE.Vector3,
    time: number,
    layer: number,
    activeScenario: ScenarioDef | null,
    alertStage: number
  ) {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;

    // Camera height balance: y > 5 favors surface breeze, y < 3 favors underground acoustics
    const surfFactor = THREE.MathUtils.clamp((cameraPos.y + 2) / 14, 0.03, 1.0);
    const deepFactor = THREE.MathUtils.clamp((10 - cameraPos.y) / 16, 0.05, 1.0);
    const zoomProximity = THREE.MathUtils.clamp(38 / Math.max(8, cameraPos.z), 0.35, 1.6);

    if (this.surfaceGain) {
      this.surfaceGain.gain.setTargetAtTime(0.06 * surfFactor * zoomProximity, now, 0.1);
    }
    if (this.windFilter) {
      this.windFilter.frequency.setTargetAtTime(
        280 + Math.sin(time * 0.45) * 90 + surfFactor * 120,
        now,
        0.1
      );
    }

    if (this.undergroundGain) {
      this.undergroundGain.gain.setTargetAtTime(0.22 * deepFactor * zoomProximity, now, 0.1);
    }
    if (this.machineryGain) {
      this.machineryGain.gain.setTargetAtTime(0.045 * deepFactor * zoomProximity, now, 0.1);
    }
    if (this.fanOsc) {
      this.fanOsc.frequency.setTargetAtTime(55 + Math.sin(time * 1.1) * 4, now, 0.1);
    }

    // Rhythmic Pneumatic Jackhammer bursts from M-102 (Level 1 East)
    const distToDrill = Math.hypot(cameraPos.x - 5.8, cameraPos.y - 2.35);
    const drillAudibility = THREE.MathUtils.clamp((26 - distToDrill) / 26, 0.08, 1.0) * zoomProximity;
    if (time - this.lastDrillTime > 0.13) {
      this.lastDrillTime = time;
      if (Math.floor(time * 2) % 4 !== 0) {
        this.triggerDrillPulse(drillAudibility * 0.09);
      }
    }

    // Ore Cart Rail Clatter on Level 1 & Level 3
    if (time - this.lastCartTime > 0.65) {
      this.lastCartTime = time;
      this.triggerRailClack(deepFactor * zoomProximity * 0.055);
    }

    // Layer 2 Wireless Mesh Telemetry Packet Pings
    if (layer === 2 && time - this.lastPingTime > 0.52) {
      this.lastPingTime = time;
      this.triggerMeshPing(Boolean(activeScenario));
    }

    // Active Emergency Alarm Pulses
    if (activeScenario) {
      const alarmInterval = activeScenario.severity === 'critical' ? 0.85 : 1.25;
      if (time - this.lastAlarmTime > alarmInterval) {
        this.lastAlarmTime = time;
        this.triggerScenarioPulse(activeScenario, alertStage);
      }
    }
  }

  triggerDrillPulse(volume: number) {
    if (!this.ctx || !this.masterGain || volume <= 0.005) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.045);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  triggerRailClack(volume: number) {
    if (!this.ctx || !this.masterGain || volume <= 0.004) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.04);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  triggerMeshPing(isEmergency: boolean) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = isEmergency ? 1320 : 1046.5;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.09);

    gain.gain.setValueAtTime(0.038, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playLayerSwitch(toLayer: number) {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    if (toLayer === 2) {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(1180, now + 0.22);
    } else {
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(390, now + 0.18);
    }
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playUIClick() {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(1020, now + 0.04);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  triggerScenarioPulse(scenario: ScenarioDef, alertStage: number) {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (scenario.id === 'biometric') {
      [0, 0.16].forEach((offset) => {
        if (!this.ctx || !this.masterGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, now + offset);
        gain.gain.setValueAtTime(0.085, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.11);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.12);
      });
    } else if (scenario.id === 'fall') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.setValueAtTime(880, now + 0.18);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1600;
      gain.gain.setValueAtTime(0.075, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.38);
    } else if (scenario.id === 'temperature') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (scenario.id === 'gas') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.linearRampToValueAtTime(520, now + 0.28);
      gain.gain.setValueAtTime(0.075, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.32);
    }

    if (alertStage === 1) {
      const upOsc = this.ctx.createOscillator();
      const upGain = this.ctx.createGain();
      upOsc.type = 'sine';
      upOsc.frequency.setValueAtTime(1100, now + 0.2);
      upOsc.frequency.exponentialRampToValueAtTime(1760, now + 0.35);
      upGain.gain.setValueAtTime(0.045, now + 0.2);
      upGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      upOsc.connect(upGain);
      upGain.connect(this.masterGain);
      upOsc.start(now + 0.2);
      upOsc.stop(now + 0.38);
    }
  }

  playEmergencyInitialImpact(scenario: ScenarioDef, worker: WorkerConfig) {
    this.init();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (scenario.id === 'fall') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.32);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.36);
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(
        `Alert. ${scenario.title} detected on unit ${worker.id}, Level ${scenario.level}. Uplinking to Surface Surveillance Room.`
      );
      msg.rate = 1.06;
      msg.pitch = 0.96;
      msg.volume = 0.85;
      window.speechSynthesis.speak(msg);
    }
  }

  playSurfaceVerifiedChime() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.07, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.26);
    });
  }
}

interface WorkerConfig {
  id: string;
  name: string;
  role: string;
  level: number;
  zone: string;
  basePos: [number, number, number];
  labelPos: [number, number, number];
  activity: string;
  suitColor: number;
  vestColor: number;
  helmetColor: number;
  skinColor: number;
}

const WORKER_CONFIGS: WorkerConfig[] = [
  {
    id: 'M-101',
    name: 'M. Vance',
    role: 'Upper Haulage & Cart Operator',
    level: 1,
    zone: 'Level 1 — West Haulage Drift (-45m)',
    basePos: [-5.8, 2.35, 0.45],
    labelPos: [-6.1, 4.95, 0.8],
    activity: 'push_cart',
    suitColor: 0x1e293b,
    vestColor: 0xf97316,
    helmetColor: 0xfacc15,
    skinColor: 0xf1b894
  },
  {
    id: 'M-102',
    name: 'E. Rostova & K. Diaz',
    role: 'Structural & Rock-Drill Team',
    level: 1,
    zone: 'Level 1 — East Inspection Bay (-45m)',
    basePos: [2.4, 2.35, 0.45],
    labelPos: [4.2, 4.95, 0.8],
    activity: 'clipboard_and_drill',
    suitColor: 0x1e293b,
    vestColor: 0xf97316,
    helmetColor: 0xfacc15,
    skinColor: 0xfbd3b6
  },
  {
    id: 'M-103',
    name: 'D. Kalu & T. Brooks',
    role: 'Heavy Equipment Logistics Pair',
    level: 2,
    zone: 'Level 2 — West Supply Drift (-95m)',
    basePos: [-5.5, -2.55, 0.45],
    labelPos: [-6.1, 0.05, 0.8],
    activity: 'carry_box_pair',
    suitColor: 0x1d4ed8,
    vestColor: 0xf97316,
    helmetColor: 0xfacc15,
    skinColor: 0xd99b72
  },
  {
    id: 'M-104',
    name: 'S. Chen',
    role: 'Mid-Level Extraction & Telemetry Tech',
    level: 2,
    zone: 'Level 2 — East Extraction Bay (-95m)',
    basePos: [6.4, -2.55, 0.45],
    labelPos: [4.2, 0.05, 0.8],
    activity: 'seated_tech',
    suitColor: 0x1d4ed8,
    vestColor: 0xf97316,
    helmetColor: 0xfacc15,
    skinColor: 0xf5cba7
  },
  {
    id: 'M-105',
    name: 'J. Morales',
    role: 'Deep Ore Cart Operator',
    level: 3,
    zone: 'Level 3 — Deep West Drift (-145m)',
    basePos: [-5.8, -7.45, 0.45],
    labelPos: [-6.1, -4.85, 0.8],
    activity: 'push_cart',
    suitColor: 0x1d4ed8,
    vestColor: 0xf97316,
    helmetColor: 0xfacc15,
    skinColor: 0xd99b72
  },
  {
    id: 'M-106',
    name: 'A. Lindqvist',
    role: 'Deep Loader & Ventilation Tech',
    level: 3,
    zone: 'Level 3 — Deep East Excavation (-145m)',
    basePos: [5.8, -7.45, 0.45],
    labelPos: [4.2, -4.85, 0.8],
    activity: 'guide_loader',
    suitColor: 0x1d4ed8,
    vestColor: 0xf97316,
    helmetColor: 0xfacc15,
    skinColor: 0xfde2cc
  }
];

interface ScenarioDef {
  id: string;
  sensorCode: string;
  title: string;
  category: string;
  targetWorkerId: string;
  severity: string;
  colorHex: string;
  colorInt: number;
  level: number;
  routeNodes: string[];
}

const SCENARIOS: Record<string, ScenarioDef> = {
  fall: {
    id: 'fall',
    sensorCode: 'MPU6050',
    title: 'Motion / Fall',
    category: 'FALL / IMPACT DETECTED',
    targetWorkerId: 'M-101',
    severity: 'critical',
    colorHex: '#ef4444',
    colorInt: 0xef4444,
    level: 1,
    routeNodes: ['M-101', 'R-L1', 'GW-SURF', 'SURV-ROOM']
  },
  biometric: {
    id: 'biometric',
    sensorCode: 'MAX30102',
    title: 'Heart Rate / SpO₂',
    category: 'BIOMETRIC ANOMALY (HR / SpO₂)',
    targetWorkerId: 'M-104',
    severity: 'critical',
    colorHex: '#ef4444',
    colorInt: 0xef4444,
    level: 2,
    routeNodes: ['M-104', 'M-103', 'R-L2', 'R-L1', 'GW-SURF', 'SURV-ROOM']
  },
  temperature: {
    id: 'temperature',
    sensorCode: 'DS18B20',
    title: 'Temperature',
    category: 'THERMAL THRESHOLD WARNING',
    targetWorkerId: 'M-102',
    severity: 'warning',
    colorHex: '#f59e0b',
    colorInt: 0xf59e0b,
    level: 1,
    routeNodes: ['M-102', 'M-101', 'R-L1', 'GW-SURF', 'SURV-ROOM']
  },
  gas: {
    id: 'gas',
    sensorCode: 'MQ-135',
    title: 'Air-Quality / Gas',
    category: 'AIR-QUALITY / GAS ANOMALY',
    targetWorkerId: 'M-106',
    severity: 'warning',
    colorHex: '#eab308',
    colorInt: 0xeab308,
    level: 3,
    routeNodes: ['M-106', 'M-105', 'R-L3', 'R-L2', 'R-L1', 'GW-SURF', 'SURV-ROOM']
  }
};

const INFRA_NODES: Record<string, [number, number, number]> = {
  'R-L1': [-11.5, 4.3, 0.9],
  'R-L2': [-11.5, -0.6, 0.9],
  'R-L3': [-11.5, -5.5, 0.9],
  'GW-SURF': [12.8, 12.8, 0.2],
  'SURV-ROOM': [10.4, 8.8, 0.4]
};

const MESH_LINKS = [
  { from: 'M-102', to: 'M-101', type: 'peer' },
  { from: 'M-101', to: 'R-L1', type: 'relay' },
  { from: 'M-104', to: 'M-103', type: 'peer' },
  { from: 'M-103', to: 'R-L2', type: 'relay' },
  { from: 'M-106', to: 'M-105', type: 'peer' },
  { from: 'M-105', to: 'R-L3', type: 'relay' },
  { from: 'M-102', to: 'M-104', type: 'cross' },
  { from: 'M-104', to: 'M-106', type: 'cross' },
  { from: 'R-L3', to: 'R-L2', type: 'trunk' },
  { from: 'R-L2', to: 'R-L1', type: 'trunk' },
  { from: 'R-L1', to: 'GW-SURF', type: 'trunk' },
  { from: 'GW-SURF', to: 'SURV-ROOM', type: 'surface' }
];

const CAMERA_PRESETS: Record<string, { position: [number, number, number]; target: [number, number, number]; label: string }> = {
  overview: {
    position: [0.0, 0.9, 31.2],
    target: [0.0, -0.4, 0.0],
    label: 'Cross-Section'
  },
  surface: {
    position: [10.2, 9.6, 12.8],
    target: [10.2, 8.6, 0.0],
    label: 'Surveillance Room'
  },
  underground: {
    position: [0.5, -2.0, 21.0],
    target: [0.5, -2.4, 0.0],
    label: 'Deep Tunnels'
  }
};

function drawSurveillanceMultiWall(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scenario: ScenarioDef | null,
  alertStage: number,
  layer: number
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#050b16';
  ctx.fillRect(0, 0, w, h);

  const panelW = (w - 50) / 4;
  const panelH = h - 24;

  for (let i = 0; i < 4; i++) {
    const px = 10 + i * (panelW + 10);
    const py = 12;

    // Panel background
    ctx.fillStyle = '#09192e';
    ctx.fillRect(px, py, panelW, panelH);

    // Subtle cyan tech grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.lineWidth = 1;
    for (let gx = px; gx < px + panelW; gx += 32) {
      ctx.beginPath();
      ctx.moveTo(gx, py);
      ctx.lineTo(gx, py + panelH);
      ctx.stroke();
    }
    for (let gy = py; gy < py + panelH; gy += 32) {
      ctx.beginPath();
      ctx.moveTo(px, gy);
      ctx.lineTo(px + panelW, gy);
      ctx.stroke();
    }

    // Panel top header strip
    ctx.fillStyle = 'rgba(14, 165, 233, 0.22)';
    ctx.fillRect(px, py, panelW, 38);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#7dd3fc';

    if (i === 0) {
      ctx.fillText('MESH RADAR • NODES', px + 14, py + 26);
      const cx = px + panelW / 2;
      const cy = py + panelH / 2 + 16;
      [60, 110, 155].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - 165, cy);
      ctx.lineTo(cx + 165, cy);
      ctx.moveTo(cx, cy - 165);
      ctx.lineTo(cx, cy + 165);
      ctx.stroke();

      // Node dots on radar
      const radarPts: [number, number, string][] = [
        [-65, -45, 'M-101'],
        [55, -55, 'M-102'],
        [-80, 20, 'M-103'],
        [75, 35, 'M-104'],
        [-40, 95, 'M-105'],
        [65, 105, 'M-106']
      ];
      radarPts.forEach(([dx, dy, id]) => {
        const isTarget = scenario && scenario.targetWorkerId === id;
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, isTarget ? 12 : 7, 0, Math.PI * 2);
        ctx.fillStyle = isTarget ? scenario.colorHex : '#10b981';
        ctx.fill();
        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(id, cx + dx + 14, cy + dy + 5);
      });
    } else if (i === 1) {
      ctx.fillText('3D DRIFT CORRIDOR', px + 14, py + 26);
      const cx = px + panelW / 2;
      const cy = py + panelH / 2 + 18;
      ctx.fillStyle = '#0f291e';
      ctx.beginPath();
      ctx.moveTo(px + 20, py + panelH - 12);
      ctx.lineTo(cx - 45, cy - 35);
      ctx.lineTo(cx + 45, cy - 35);
      ctx.lineTo(px + panelW - 20, py + panelH - 12);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + 40, py + panelH - 12);
      ctx.lineTo(cx, cy - 35);
      ctx.lineTo(px + panelW - 40, py + panelH - 12);
      ctx.stroke();

      [0.25, 0.55, 0.82].forEach((tStep, idx) => {
        const ny = cy - 20 + tStep * 165;
        ctx.beginPath();
        ctx.arc(cx, ny, 9, 0, Math.PI * 2);
        ctx.fillStyle = idx === 1 && scenario ? scenario.colorHex : '#34d399';
        ctx.fill();
      });
    } else if (i === 2) {
      ctx.fillText('LIVE TUNNEL FEEDS', px + 14, py + 26);
      const cw = (panelW - 30) / 2;
      const ch = (panelH - 70) / 2;
      ['CAM L1-W', 'CAM L1-E', 'CAM L2-E', 'CAM L3-E'].forEach((cam, cIdx) => {
        const col = cIdx % 2;
        const row = Math.floor(cIdx / 2);
        const fx = px + 10 + col * (cw + 10);
        const fy = py + 48 + row * (ch + 10);

        const isAlertCam =
          (scenario?.level === 1 && cIdx <= 1) ||
          (scenario?.level === 2 && cIdx === 2) ||
          (scenario?.level === 3 && cIdx === 3);

        ctx.fillStyle = isAlertCam ? '#3b1219' : '#271c15';
        ctx.fillRect(fx, fy, cw, ch);
        ctx.strokeStyle = isAlertCam ? '#ef4444' : '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(fx, fy, cw, ch);

        ctx.fillStyle = isAlertCam ? '#ef4444' : '#fbbf24';
        ctx.fillRect(fx + 22, fy + 14, cw - 44, 6);

        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = '#fde68a';
        ctx.fillText(cam, fx + 10, fy + ch - 10);
      });
    } else if (i === 3) {
      const isEmergency = Boolean(scenario);
      ctx.fillStyle = isEmergency ? 'rgba(239, 68, 68, 0.35)' : 'rgba(14, 165, 233, 0.22)';
      ctx.fillRect(px, py, panelW, 38);
      ctx.fillStyle = isEmergency ? '#fecaca' : '#7dd3fc';
      ctx.fillText(
        isEmergency ? `ALERT • ${scenario?.targetWorkerId}` : `TELEMETRY • L${layer}`,
        px + 14,
        py + 26
      );

      if (isEmergency && scenario) {
        const tx = px + 95;
        const ty = py + 175;
        ctx.fillStyle = scenario.colorHex;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 65);
        ctx.lineTo(tx - 62, ty + 48);
        ctx.lineTo(tx + 62, ty + 48);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 58px sans-serif';
        ctx.fillText('!', tx - 10, ty + 35);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 38px monospace';
        ctx.fillText(scenario.targetWorkerId, px + 175, py + 130);

        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(scenario.sensorCode, px + 175, py + 168);

        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 19px sans-serif';
        ctx.fillText(scenario.title.toUpperCase(), px + 175, py + 205);

        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(px + 20, py + 265, panelW - 40, 75);
        ctx.strokeStyle = scenario.colorHex;
        ctx.strokeRect(px + 20, py + 265, panelW - 40, 75);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 19px monospace';
        ctx.fillText(
          alertStage >= 2 ? 'STATUS: SURFACE VERIFIED' : 'STATUS: MESH UPLINKING',
          px + 36,
          py + 310
        );
      } else {
        WORKER_CONFIGS.forEach((wc, idx) => {
          const by = py + 54 + idx * 54;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(px + 16, by, panelW - 32, 44);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.strokeRect(px + 16, by, panelW - 32, 44);

          ctx.beginPath();
          ctx.arc(px + 40, by + 22, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 20px monospace';
          ctx.fillText(wc.id, px + 60, by + 29);

          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 17px monospace';
          ctx.fillText('NOMINAL • OK', px + panelW - 165, by + 28);
        });
      }
    }

    ctx.strokeStyle =
      i === 3 && scenario ? scenario.colorHex : 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(px, py, panelW, panelH);
  }
}

interface WorkerLabelItem {
  worker: WorkerConfig;
  x: number;
  y: number;
  visible: boolean;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<MineAudioEngine | null>(null);
  if (!audioRef.current) {
    audioRef.current = new MineAudioEngine();
  }

  const [isSceneReady, setIsSceneReady] = useState(false);
  const [layer, setLayer] = useState(1); // 1 = Mine View, 2 = Signal Network
  const [activeScenarioKey, setActiveScenarioKey] = useState<string | null>('biometric');
  const [alertStage, setAlertStage] = useState(2);
  const [activePresetName, setActivePresetName] = useState('overview');
  const [workerLabels, setWorkerLabels] = useState<WorkerLabelItem[]>([]);
  const [isFlyingKeyActive, setIsFlyingKeyActive] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

  // Phone View & 360-Degree Panorama / Gyro Mode State
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth <= 768 ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    );
  });
  const [forceMobileMode, setForceMobileMode] = useState<boolean | null>(null);
  const effectiveIsMobile = forceMobileMode !== null ? forceMobileMode : isMobile;

  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [isControllerOpen, setIsControllerOpen] = useState(false);
  const [isBoostActive, setIsBoostActive] = useState(false);
  const [isMobileEmergencyOpen, setIsMobileEmergencyOpen] = useState(false);
  const [headingDegrees, setHeadingDegrees] = useState(0);

  // Virtual navigation state ref for the controller
  const virtualNavRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false
  });

  const gyroActiveRef = useRef(false);
  const gyroYawOffsetRef = useRef(0);
  const isBoostActiveRef = useRef(false);
  const deviceOrientationRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);

  useEffect(() => {
    gyroActiveRef.current = gyroEnabled;
  }, [gyroEnabled]);

  useEffect(() => {
    isBoostActiveRef.current = isBoostActive;
  }, [isBoostActive]);

  useEffect(() => {
    const handleCheckMobile = () => {
      setIsMobile(
        window.innerWidth <= 768 ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      );
    };
    window.addEventListener('resize', handleCheckMobile);
    return () => window.removeEventListener('resize', handleCheckMobile);
  }, []);

  const stateRef = useRef<{
    layer: number;
    activeScenario: ScenarioDef | null;
    alertStage: number;
    networkOpacity: number;
    cameraGoal: {
      position: THREE.Vector3;
      target: THREE.Vector3;
      isTransitioning: boolean;
    };
    needsScreenRedraw: boolean;
  }>({
    layer: 1,
    activeScenario: SCENARIOS.biometric,
    alertStage: 2,
    networkOpacity: 0,
    cameraGoal: {
      position: new THREE.Vector3(...CAMERA_PRESETS.overview.position),
      target: new THREE.Vector3(...CAMERA_PRESETS.overview.target),
      isTransitioning: false
    },
    needsScreenRedraw: true
  });

  const activeScenario = activeScenarioKey ? SCENARIOS[activeScenarioKey] : null;

  const ensureAudioReady = () => {
    if (audioRef.current) {
      audioRef.current.init();
      setIsAudioUnlocked(true);
    }
  };

  const handleToggleAudio = () => {
    const nextMuted = !isAudioMuted;
    setIsAudioMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.init();
      audioRef.current.setMuted(nextMuted);
      setIsAudioUnlocked(true);
    }
  };

  useEffect(() => {
    stateRef.current.layer = layer;
    stateRef.current.activeScenario = activeScenario;
    stateRef.current.alertStage = alertStage;
    stateRef.current.needsScreenRedraw = true;
  }, [layer, activeScenario, alertStage]);

  const moveCameraTo = (
    posArray: [number, number, number],
    targetArray: [number, number, number],
    presetName = 'custom'
  ) => {
    const cg = stateRef.current.cameraGoal;
    cg.position.set(...posArray);
    cg.target.set(...targetArray);
    cg.isTransitioning = true;
    setActivePresetName(presetName);
  };

  const handleSelectCameraPreset = (presetKey: string) => {
    ensureAudioReady();
    audioRef.current?.playUIClick();
    const preset = CAMERA_PRESETS[presetKey];
    if (preset) {
      moveCameraTo(preset.position, preset.target, presetKey);
    }
  };

  const handleFocusWorker = (worker: WorkerConfig) => {
    ensureAudioReady();
    audioRef.current?.playUIClick();
    const [wx, wy] = worker.basePos;
    moveCameraTo([wx, wy + 1.4, 12.5], [wx, wy + 0.8, 0.4], 'custom');
  };

  const handleTriggerScenario = (scenarioKey: string) => {
    ensureAudioReady();
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) return;

    setActiveScenarioKey(scenarioKey);
    setAlertStage(1);

    const targetWorker = WORKER_CONFIGS.find((w) => w.id === scenario.targetWorkerId);
    if (targetWorker) {
      audioRef.current?.playEmergencyInitialImpact(scenario, targetWorker);
      const [wx, wy] = targetWorker.basePos;
      moveCameraTo([wx * 0.65, wy + 1.5, 18.5], [wx * 0.55, wy + 0.6, 0.4], 'custom');
    }
  };

  useEffect(() => {
    if (!activeScenarioKey) {
      setAlertStage(0);
      return;
    }
    const timer = setTimeout(() => {
      setAlertStage(2);
      audioRef.current?.playSurfaceVerifiedChime();
      moveCameraTo(
        CAMERA_PRESETS.overview.position,
        CAMERA_PRESETS.overview.target,
        'overview'
      );
    }, 2200);

    return () => clearTimeout(timer);
  }, [activeScenarioKey]);

  const handleResetSimulation = () => {
    ensureAudioReady();
    audioRef.current?.playUIClick();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setActiveScenarioKey(null);
    setAlertStage(0);
    handleSelectCameraPreset('overview');
  };

  const requestGyroPermission = async () => {
    if (
      typeof window !== 'undefined' &&
      typeof (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent !== 'undefined' &&
      typeof (window as unknown as { DeviceOrientationEvent: { requestPermission: () => Promise<string> } }).DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const response = await (window as unknown as { DeviceOrientationEvent: { requestPermission: () => Promise<string> } }).DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          setGyroEnabled((prev) => !prev);
        } else {
          alert('Gyroscope sensor permission was denied on this device.');
        }
      } catch (err) {
        console.warn('Gyro permission error:', err);
        setGyroEnabled((prev) => !prev);
      }
    } else {
      setGyroEnabled((prev) => !prev);
    }
  };

  const handleVirtualNavDown = (action: 'forward' | 'backward' | 'left' | 'right' | 'up' | 'down') => {
    virtualNavRef.current[action] = true;
    if (stateRef.current.cameraGoal.isTransitioning) {
      stateRef.current.cameraGoal.isTransitioning = false;
    }
    setActivePresetName('mobile-nav');
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch {}
    }
  };

  const handleVirtualNavUp = (action: 'forward' | 'backward' | 'left' | 'right' | 'up' | 'down') => {
    virtualNavRef.current[action] = false;
  };

  const handleStopAllNav = () => {
    virtualNavRef.current.forward = false;
    virtualNavRef.current.backward = false;
    virtualNavRef.current.left = false;
    virtualNavRef.current.right = false;
    virtualNavRef.current.up = false;
    virtualNavRef.current.down = false;
  };

  const handleTurn180 = () => {
    gyroYawOffsetRef.current += Math.PI;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch {}
    }
  };

  const handleRecenter = () => {
    if (gyroActiveRef.current && deviceOrientationRef.current) {
      const alphaRad = deviceOrientationRef.current.alpha * (Math.PI / 180);
      gyroYawOffsetRef.current = -alphaRad;
    } else {
      handleSelectCameraPreset('overview');
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch {}
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e3a5f);
    scene.fog = new THREE.FogExp2(0x1e3a5f, 0.0045);

    const camera = new THREE.PerspectiveCamera(37, width / height, 0.5, 250);
    camera.position.set(...CAMERA_PRESETS.overview.position);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Helper: Procedural Rock Texture Generator for tactile strata
    const createRockCanvasTexture = (baseHex: string, darkHex: string, highlightHex: string) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      if (!ctx) return new THREE.CanvasTexture(c);
      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 240; i++) {
        ctx.fillStyle = i % 2 === 0 ? darkHex : highlightHex;
        const rx = Math.random() * 256;
        const ry = Math.random() * 256;
        const rw = 14 + Math.random() * 42;
        const rh = 4 + Math.random() * 14;
        ctx.fillRect(rx, ry, rw, rh);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(4, 2);
      return tex;
    };

    const rockTex = createRockCanvasTexture('#6b4226', '#3d2314', '#8c5835');

    // Helper: Articulated Pixar-Style Miner Character Builder
    const createRoundedLimb = (
      rTop: number,
      rBot: number,
      length: number,
      material: THREE.Material
    ) => {
      const group = new THREE.Group();
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, length, 14),
        material
      );
      cyl.position.y = -length / 2;
      cyl.castShadow = true;
      const topJoint = new THREE.Mesh(new THREE.SphereGeometry(rTop, 12, 10), material);
      const botJoint = new THREE.Mesh(new THREE.SphereGeometry(rBot, 12, 10), material);
      botJoint.position.y = -length;
      group.add(topJoint, cyl, botJoint);
      return group;
    };

    const buildMinerFigure = ({
      skinColor = 0xf1b894,
      suitColor = 0x1d4ed8,
      vestColor = 0xf97316,
      helmetColor = 0xfacc15,
      scale = 1.15
    }: {
      skinColor?: number;
      suitColor?: number;
      vestColor?: number;
      helmetColor?: number;
      scale?: number;
    }) => {
      const root = new THREE.Group();
      root.scale.setScalar(scale);

      const bodyGroup = new THREE.Group();
      root.add(bodyGroup);

      const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.42 });
      const suitMat = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.58 });
      const vestMat = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.4 });
      const bootMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6 });
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const helmetMat = new THREE.MeshStandardMaterial({
        color: helmetColor,
        roughness: 0.28,
        metalness: 0.15
      });

      const hipsGroup = new THREE.Group();
      hipsGroup.position.set(0, 0.58, 0);
      bodyGroup.add(hipsGroup);

      const pelvis = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.15, 0.16, 14),
        suitMat
      );
      hipsGroup.add(pelvis);

      const buildLeg = (side: number) => {
        const thighGroup = new THREE.Group();
        thighGroup.position.set(side * 0.095, -0.04, 0);
        thighGroup.add(createRoundedLimb(0.075, 0.064, 0.25, suitMat));

        const shinGroup = new THREE.Group();
        shinGroup.position.set(0, -0.25, 0);
        shinGroup.add(createRoundedLimb(0.062, 0.052, 0.23, suitMat));

        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.21), bootMat);
        boot.position.set(0, -0.24, 0.035);
        shinGroup.add(boot);

        thighGroup.add(shinGroup);
        hipsGroup.add(thighGroup);
        return { thighGroup, shinGroup };
      };

      const leftLeg = buildLeg(-1);
      const rightLeg = buildLeg(1);

      const spineGroup = new THREE.Group();
      spineGroup.position.set(0, 0.07, 0);
      hipsGroup.add(spineGroup);

      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.165, 0.4, 16),
        suitMat
      );
      torso.position.y = 0.2;
      const vest = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.175, 0.35, 16),
        vestMat
      );
      vest.position.y = 0.2;
      const stripe1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.203, 0.198, 0.04, 16),
        stripeMat
      );
      stripe1.position.y = 0.14;
      const stripe2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.205, 0.202, 0.038, 16),
        stripeMat
      );
      stripe2.position.y = 0.27;
      spineGroup.add(torso, vest, stripe1, stripe2);

      const buildArm = (side: number) => {
        const upperArmGroup = new THREE.Group();
        upperArmGroup.position.set(side * 0.22, 0.36, 0);
        upperArmGroup.add(createRoundedLimb(0.062, 0.052, 0.2, suitMat));

        const forearmGroup = new THREE.Group();
        forearmGroup.position.set(0, -0.2, 0);
        forearmGroup.add(createRoundedLimb(0.05, 0.044, 0.19, skinMat));

        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 10), skinMat);
        hand.position.y = -0.2;
        forearmGroup.add(hand);

        upperArmGroup.add(forearmGroup);
        spineGroup.add(upperArmGroup);
        return { upperArmGroup, forearmGroup };
      };

      const leftArm = buildArm(-1);
      const rightArm = buildArm(1);

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.5, 0);
      spineGroup.add(headGroup);

      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 16), skinMat);
      skull.scale.set(0.96, 1.06, 0.96);
      skull.position.y = 0.07;
      headGroup.add(skull);

      // Eyes
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(0, 0.09, 0.148);
      [-1, 1].forEach((s) => {
        const sclera = new THREE.Mesh(
          new THREE.SphereGeometry(0.028, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        sclera.position.x = s * 0.054;
        const pupil = new THREE.Mesh(
          new THREE.SphereGeometry(0.015, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x0f172a })
        );
        pupil.position.set(s * 0.054, 0, 0.014);
        eyeGroup.add(sclera, pupil);
      });
      headGroup.add(eyeGroup);

      // Hard Hat + Headlamp + Smart Beacon
      const helmetDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        helmetMat
      );
      helmetDome.position.y = 0.13;
      const helmetBrim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.22, 0.025, 18),
        helmetMat
      );
      helmetBrim.scale.set(0.95, 1, 1.12);
      helmetBrim.position.set(0, 0.14, 0.02);

      const headlamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.042, 0.05, 12),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      headlamp.rotation.x = Math.PI / 2;
      headlamp.position.set(0, 0.21, 0.185);

      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), beaconMat);
      beaconMesh.position.set(0, 0.35, 0);

      headGroup.add(helmetDome, helmetBrim, headlamp, beaconMesh);

      return {
        root,
        bodyGroup,
        hipsGroup,
        spineGroup,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        headGroup,
        eyeGroup,
        beaconMat
      };
    };

    const skyGeo = new THREE.SphereGeometry(125, 32, 24);
    const skyPos = skyGeo.attributes.position;
    const skyColors: number[] = [];
    const topSky = new THREE.Color(0x1e60b8);
    const midSky = new THREE.Color(0x60a5fa);
    const botSky = new THREE.Color(0xdbeafe);
    for (let i = 0; i < skyPos.count; i++) {
      const py = skyPos.getY(i);
      const normY = THREE.MathUtils.clamp((py + 5) / 70, 0, 1);
      const c = new THREE.Color();
      if (normY < 0.35) {
        c.lerpColors(botSky, midSky, normY / 0.35);
      } else {
        c.lerpColors(midSky, topSky, (normY - 0.35) / 0.65);
      }
      skyColors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
    scene.add(
      new THREE.Mesh(
        skyGeo,
        new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
      )
    );

    // Bright Daylight + Warm Underground Contrast Lighting
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.78);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x451a03, 0.65);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    dirLight.position.set(-22, 34, 24);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -26;
    dirLight.shadow.camera.right = 26;
    dirLight.shadow.camera.top = 24;
    dirLight.shadow.camera.bottom = -24;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Lush Green Forested Mountain Range on the Horizon
    const mountainGroup = new THREE.Group();
    [
      { x: -21, y: 6.8, z: -12, r: 8.5, h: 9.5, col: 0x3b7a57 },
      { x: -9.5, y: 6.8, z: -14, r: 10.5, h: 11.2, col: 0x2e6f40 },
      { x: 1.5, y: 6.8, z: -11, r: 8.2, h: 8.8, col: 0x4d9057 },
      { x: 11.5, y: 6.8, z: -15, r: 11.0, h: 11.8, col: 0x3b7a57 },
      { x: 22.0, y: 6.8, z: -12, r: 9.0, h: 9.2, col: 0x408253 }
    ].forEach((m) => {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(m.r, m.h, 7),
        new THREE.MeshStandardMaterial({
          color: m.col,
          roughness: 0.85,
          flatShading: true
        })
      );
      cone.position.set(m.x, m.y + m.h / 2, m.z);
      mountainGroup.add(cone);
    });
    scene.add(mountainGroup);

    // Fluffy White Daytime Clouds
    const cloudsGroup = new THREE.Group();
    const cloudDefs = [
      { pos: [-16, 15.5, -9], scale: 1.25, speed: 0.25 },
      { pos: [1, 15.0, -8], scale: 1.5, speed: 0.22 },
      { pos: [17, 16.0, -10], scale: 1.3, speed: 0.28 }
    ];
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    cloudDefs.forEach((cd) => {
      const cg = new THREE.Group();
      cg.position.set(cd.pos[0], cd.pos[1], cd.pos[2]);
      cg.scale.setScalar(cd.scale);
      [
        [0, 0.2, 0, 1.35],
        [-1.2, -0.1, 0.1, 1.0],
        [1.2, -0.1, 0.1, 1.05],
        [-0.5, 0.4, -0.1, 0.95],
        [0.5, 0.35, 0.1, 0.95]
      ].forEach(([cx, cy, cz, cr]) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(cr, 14, 14), cloudMat);
        puff.position.set(cx, cy, cz);
        cg.add(puff);
      });
      cloudsGroup.add(cg);
    });
    scene.add(cloudsGroup);

    // Surface Green Meadow Ground Strip (y = 7.0)
    const surfaceMeadow = new THREE.Mesh(
      new THREE.BoxGeometry(39.0, 0.55, 10.5),
      new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.8 })
    );
    surfaceMeadow.position.set(0, 6.95, -2.5);
    surfaceMeadow.receiveShadow = true;
    scene.add(surfaceMeadow);

    // Pine Trees
    const addPineTree = (x: number, y: number, z: number, scale = 1.0) => {
      const tree = new THREE.Group();
      tree.position.set(x, y, z);
      tree.scale.setScalar(scale);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.2, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 })
      );
      trunk.position.y = 0.45;
      tree.add(trunk);

      [
        { y: 1.15, r: 0.88, h: 1.35, c: 0x2d6a4f },
        { y: 1.85, r: 0.68, h: 1.2, c: 0x40916c },
        { y: 2.45, r: 0.48, h: 1.0, c: 0x52b788 }
      ].forEach((l) => {
        const foliage = new THREE.Mesh(
          new THREE.ConeGeometry(l.r, l.h, 9),
          new THREE.MeshStandardMaterial({ color: l.c, roughness: 0.72 })
        );
        foliage.position.y = l.y;
        foliage.castShadow = true;
        tree.add(foliage);
      });
      scene.add(tree);
    };

    [
      [-17.2, 7.2, -0.4, 1.15],
      [-15.6, 7.2, -1.5, 1.35],
      [-14.1, 7.2, -2.2, 1.05],
      [-5.4, 7.2, -2.8, 0.95],
      [-0.8, 7.2, -2.5, 1.1],
      [2.8, 7.2, -2.2, 1.05],
      [4.4, 7.2, -1.2, 1.35],
      [16.2, 7.2, -1.0, 1.3],
      [17.8, 7.2, -0.4, 1.1]
    ].forEach(([tx, ty, tz, ts]) => addPineTree(tx, ty, tz, ts));

    const shaftX = -11.5;
    const headframeGroup = new THREE.Group();
    headframeGroup.position.set(shaftX, 7.2, -0.2);
    scene.add(headframeGroup);

    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x263238,
      metalness: 0.65,
      roughness: 0.35
    });
    const yellowRailMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.35
    });

    // 4 Main Tower Legs + Cross Bracing Lattice
    [
      [-1.05, 3.2, -0.85],
      [1.05, 3.2, -0.85],
      [-1.05, 3.2, 0.85],
      [1.05, 3.2, 0.85]
    ].forEach((pos) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.4, 0.22), darkSteelMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      headframeGroup.add(leg);
    });

    [1.6, 3.2, 4.8, 6.2].forEach((y) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.16, 1.95), darkSteelMat);
      frame.position.set(0, y, 0);
      headframeGroup.add(frame);

      const diag1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), darkSteelMat);
      diag1.position.set(0, y - 0.8, 0.85);
      diag1.rotation.z = 0.55;
      const diag2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), darkSteelMat);
      diag2.position.set(0, y - 0.8, 0.85);
      diag2.rotation.z = -0.55;
      headframeGroup.add(diag1, diag2);
    });

    // Inclined Conveyor / Hoist Strut on the left of Headframe
    [-0.6, 0.6].forEach((z) => {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6.6, 0.18), darkSteelMat);
      ramp.position.set(-2.9, 2.75, z);
      ramp.rotation.z = -0.68;
      headframeGroup.add(ramp);
    });

    // Top Cabin with Yellow Guardrails & Roof
    const topDeck = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.2, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    topDeck.position.set(0, 6.4, 0);
    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(2.65, 0.45, 2.15),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, wireframe: true })
    );
    topRail.position.set(0, 6.72, 0);
    const topRoof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 2.3), darkSteelMat);
    topRoof.position.set(0, 7.55, 0);
    headframeGroup.add(topDeck, topRail, topRoof);

    // Yellow Collar Safety Railing at Surface Shaft Opening
    const collarFence = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.45, 0.1), yellowRailMat);
    collarFence.position.set(0, 0.25, 1.15);
    headframeGroup.add(collarFence);

    // Adjacent Concrete Hoist House Building
    const hoistHouse = new THREE.Group();
    hoistHouse.position.set(-8.2, 8.35, -1.35);
    const houseBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 2.3, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.75 })
    );
    hoistHouse.add(houseBody);
    [-1.1, -0.3, 0.5, 1.2].forEach((wx) => {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.42, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x1e293b })
      );
      win.position.set(wx, 0.35, 1.31);
      hoistHouse.add(win);
    });
    scene.add(hoistHouse);

    // Surface Vehicles: Yellow Dump Truck + Crushed Ore Pile + Light Pole + Loader
    const dumpTruck = new THREE.Group();
    dumpTruck.position.set(-3.8, 7.2, -0.2);
    const dtChassis = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.4, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    dtChassis.position.y = 0.42;
    const dtCab = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35 })
    );
    dtCab.position.set(-0.65, 0.95, 0);
    const dtBed = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.75, 1.38),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 })
    );
    dtBed.position.set(0.4, 1.0, 0);
    dumpTruck.add(dtChassis, dtCab, dtBed);
    [-0.65, 0.65].forEach((wx) => {
      [-0.62, 0.62].forEach((wz) => {
        const wMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14),
          new THREE.MeshStandardMaterial({ color: 0x0f172a })
        );
        wMesh.rotation.x = Math.PI / 2;
        wMesh.position.set(wx, 0.36, wz);
        dumpTruck.add(wMesh);
      });
    });
    scene.add(dumpTruck);

    // Ore Stockpile Mound
    const surfaceOrePile = new THREE.Group();
    surfaceOrePile.position.set(-1.3, 7.2, -0.3);
    for (let i = 0; i < 14; i++) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.32 + (i % 3) * 0.12, 0),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x475569 : 0x64748b,
          roughness: 0.9,
          flatShading: true
        })
      );
      rock.position.set(
        ((i % 5) - 2) * 0.32,
        Math.floor(i / 5) * 0.24 + 0.15,
        ((i % 3) - 1) * 0.25
      );
      surfaceOrePile.add(rock);
    }
    scene.add(surfaceOrePile);

    // Surface Light Pole
    const lightPole = new THREE.Group();
    lightPole.position.set(0.6, 7.2, -0.3);
    const poleRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 3.6, 8),
      darkSteelMat
    );
    poleRod.position.y = 1.8;
    const poleLamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.14, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    poleLamp.position.set(0, 3.6, 0);
    lightPole.add(poleRod, poleLamp);
    scene.add(lightPole);

    // Surface Small Yellow Loader Tractor
    const surfLoader = new THREE.Group();
    surfLoader.position.set(3.1, 7.2, -0.1);
    const slBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.65, 1.05),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b })
    );
    slBody.position.y = 0.55;
    const slCab = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.65, 0.95),
      new THREE.MeshStandardMaterial({ color: 0xfacc15 })
    );
    slCab.position.set(0.15, 1.15, 0);
    surfLoader.add(slBody, slCab);
    [-0.45, 0.45].forEach((wx) => {
      [-0.5, 0.5].forEach((wz) => {
        const w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12),
          new THREE.MeshStandardMaterial({ color: 0x0f172a })
        );
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.28, wz);
        surfLoader.add(w);
      });
    });
    scene.add(surfLoader);

    const survRoomGroup = new THREE.Group();
    survRoomGroup.position.set(10.4, 7.2, 0.0);
    scene.add(survRoomGroup);

    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.6,
      metalness: 0.2
    });
    const innerWallMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.5
    });

    const srFloor = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.28, 4.4), bldgMat);
    srFloor.position.y = 0.14;
    const srBack = new THREE.Mesh(new THREE.BoxGeometry(9.4, 3.8, 0.24), innerWallMat);
    srBack.position.set(0, 2.0, -2.0);
    const srLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.8, 4.4), bldgMat);
    srLeft.position.set(-4.64, 2.0, 0);
    const srRight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.8, 4.4), bldgMat);
    srRight.position.set(4.64, 2.0, 0);
    const srRoof = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.55, 4.6), bldgMat);
    srRoof.position.set(0, 4.1, 0);
    survRoomGroup.add(srFloor, srBack, srLeft, srRight, srRoof);

    // "SURVEILLANCE ROOM" Sign Fascia Texture
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024;
    signCanvas.height = 128;
    const sCtx = signCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#475569';
      sCtx.fillRect(0, 0, 1024, 128);
      sCtx.font = 'bold 58px sans-serif';
      sCtx.fillStyle = '#f8fafc';
      sCtx.textAlign = 'center';
      sCtx.fillText('SURVEILLANCE ROOM', 512, 84);
    }
    const signTex = new THREE.CanvasTexture(signCanvas);
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 0.52),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signBoard.position.set(0, 4.1, 2.31);
    survRoomGroup.add(signBoard);

    // Interior Warm Recessed Ceiling Lights
    [-3.0, -1.0, 1.0, 3.0].forEach((lx) => {
      const cLamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.06, 0.35),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      cLamp.position.set(lx, 3.78, -0.4);
      survRoomGroup.add(cLamp);
    });

    // 4-Panel Wall Monitoring Display inside Surveillance Room
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 2048;
    screenCanvas.height = 512;
    const screenCtx = screenCanvas.getContext('2d');
    const screenTexture = new THREE.CanvasTexture(screenCanvas);

    const wallScreenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(8.2, 2.05),
      new THREE.MeshBasicMaterial({ map: screenTexture })
    );
    wallScreenMesh.position.set(0, 2.35, -1.84);
    survRoomGroup.add(wallScreenMesh);

    // Control Desk + 6 Desktop Monitors + 4 Seated Operators
    const controlDesk = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 0.72, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })
    );
    controlDesk.position.set(0, 0.64, -0.25);
    survRoomGroup.add(controlDesk);

    [-3.2, -1.9, -0.6, 0.7, 2.0, 3.3].forEach((mx) => {
      const mon = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.44, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      mon.position.set(mx, 1.24, -0.35);
      survRoomGroup.add(mon);
    });

    const survOperators: { group: THREE.Group; head: THREE.Mesh }[] = [];
    [-3.1, -1.1, 0.9, 2.9].forEach((ox) => {
      const op = new THREE.Group();
      op.position.set(ox, 0.28, 0.42);
      const chair = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.85, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x0f172a })
      );
      chair.position.y = 0.45;
      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.15, 0.52, 12),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8 })
      );
      torso.position.set(0, 0.75, -0.08);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xf1b894 })
      );
      head.position.set(0, 1.15, -0.08);
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.168, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: 0x27272a })
      );
      hair.position.set(0, 1.17, -0.08);
      op.add(chair, torso, head, hair);
      survRoomGroup.add(op);
      survOperators.push({ group: op, head });
    });

    const survRoomLight = new THREE.PointLight(0xfffbeb, 1.6, 12);
    survRoomLight.position.set(0, 3.2, 0.8);
    survRoomGroup.add(survRoomLight);

    // Roof Satellite Dish + Radio Tower on top of Surveillance Room
    const dishGroup = new THREE.Group();
    dishGroup.position.set(-2.6, 4.4, -0.5);
    const dishBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.12, 0.25, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4 })
    );
    dishBowl.rotation.z = -0.6;
    dishGroup.add(dishBowl);
    survRoomGroup.add(dishGroup);

    const radioTower = new THREE.Group();
    radioTower.position.set(2.4, 4.4, -0.6);
    const towerMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.35, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xd97706, wireframe: true })
    );
    towerMast.position.y = 1.6;
    const gwBeaconMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const gwBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), gwBeaconMat);
    gwBeacon.position.y = 3.3;
    const gwWaveMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    const gwWaveRing = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.38, 28), gwWaveMat);
    gwWaveRing.position.y = 3.3;
    gwWaveRing.rotation.x = Math.PI / 2;
    radioTower.add(towerMast, gwBeacon, gwWaveRing);
    survRoomGroup.add(radioTower);

    const cliffRockMat = new THREE.MeshStandardMaterial({
      map: rockTex,
      color: 0x8b5a3c,
      roughness: 0.9,
      flatShading: true
    });
    const darkStrataMat = new THREE.MeshStandardMaterial({
      map: rockTex,
      color: 0x5c3d28,
      roughness: 0.92,
      flatShading: true
    });

    // Helper to build organic sculpted rock strata slabs
    const buildRockSlab = (xCenter: number, yCenter: number, widthSlab: number, heightSlab: number, zFront = 1.15) => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(widthSlab, heightSlab, 4.2),
        cliffRockMat
      );
      core.position.set(xCenter, yCenter, -0.9);
      core.receiveShadow = true;
      g.add(core);

      const numCrags = Math.max(4, Math.floor(widthSlab / 1.45));
      for (let i = 0; i < numCrags; i++) {
        const rx = xCenter - widthSlab / 2 + 0.7 + i * (widthSlab / numCrags);
        const crag = new THREE.Mesh(
          new THREE.DodecahedronGeometry(heightSlab * 0.58, 1),
          i % 2 === 0 ? cliffRockMat : darkStrataMat
        );
        crag.scale.set(1.45, 0.62, 0.55);
        crag.position.set(
          rx,
          yCenter + ((i % 3) - 1) * 0.12,
          zFront - 0.35 + (i % 2) * 0.12
        );
        crag.castShadow = true;
        crag.receiveShadow = true;
        g.add(crag);
      }
      scene.add(g);
    };

    // 1. Dark Back Wall
    const deepBackWall = new THREE.Mesh(
      new THREE.BoxGeometry(39.0, 17.5, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.95 })
    );
    deepBackWall.position.set(0, -1.6, -2.6);
    scene.add(deepBackWall);

    // 2. Left Cliff Wall
    for (let ly = -8.2; ly <= 6.0; ly += 1.65) {
      buildRockSlab(-16.3, ly, 6.4, 1.75, 1.45);
    }

    // 3. Right Cliff Wall
    for (let ry = -8.2; ry <= 6.0; ry += 1.65) {
      buildRockSlab(15.4, ry, 7.8, 1.75, 1.45);
    }

    // 4. Horizontal Rock Strata Layers
    buildRockSlab(0.8, 6.1, 21.4, 1.35, 1.25);
    buildRockSlab(0.8, 1.35, 21.4, 1.55, 1.25);
    buildRockSlab(0.8, -3.55, 21.4, 1.55, 1.25);
    buildRockSlab(0.0, -8.35, 39.0, 1.35, 1.45);

    // 5. Vertical Elevator Shaft Structure
    const shaftGroup = new THREE.Group();
    shaftGroup.position.set(shaftX, -0.5, 0);
    scene.add(shaftGroup);

    const shaftBackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.9, 15.6, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
    );
    shaftBackMesh.position.set(0, 0, -1.4);
    shaftGroup.add(shaftBackMesh);

    [-1.38, 1.38].forEach((sx) => {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 15.6, 1.9),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 })
      );
      col.position.set(sx, 0, -0.2);
      shaftGroup.add(col);
    });

    const ladderGroup = new THREE.Group();
    ladderGroup.position.set(0, 0, -0.85);
    [-0.32, 0.32].forEach((lx) => {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 15.2, 8),
        yellowRailMat
      );
      rail.position.x = lx;
      ladderGroup.add(rail);
    });
    for (let ry = -7.2; ry <= 7.0; ry += 0.48) {
      const rung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.64, 6),
        yellowRailMat
      );
      rung.rotation.z = Math.PI / 2;
      rung.position.y = ry;
      ladderGroup.add(rung);
    }
    shaftGroup.add(ladderGroup);

    [4.8, 1.8, -1.8, -5.2].forEach((ly) => {
      const sLamp = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.12, 0.18),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      sLamp.position.set(0, ly, -0.6);
      const sLight = new THREE.PointLight(0xfde68a, 1.2, 5.5);
      sLight.position.set(0, ly, 0.2);
      shaftGroup.add(sLamp, sLight);
    });

    // Bright Yellow Elevator Cage + Miner Riding Inside
    const elevatorCage = new THREE.Group();
    elevatorCage.position.set(0, -0.8, 0.25);
    const cageFloor = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 1.4), yellowRailMat);
    cageFloor.position.y = -1.1;
    const cageRoof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.18, 1.4), yellowRailMat);
    cageRoof.position.y = 1.1;
    elevatorCage.add(cageFloor, cageRoof);
    [
      [-0.84, 0, 0.62],
      [0.84, 0, 0.62],
      [-0.84, 0, -0.62],
      [0.84, 0, -0.62]
    ].forEach(([cx, cy, cz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), yellowRailMat);
      post.position.set(cx, cy, cz);
      elevatorCage.add(post);
    });
    const cageGuard = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 0.1), yellowRailMat);
    cageGuard.position.set(0, -0.15, 0.62);
    elevatorCage.add(cageGuard);

    const hoistMiner = buildMinerFigure({
      suitColor: 0x1d4ed8,
      vestColor: 0xf97316,
      helmetColor: 0xfacc15,
      scale: 1.05
    });
    hoistMiner.root.position.set(0, -1.02, 0.05);
    elevatorCage.add(hoistMiner.root);
    shaftGroup.add(elevatorCage);

    const tunnelFans: THREE.Group[] = [];
    const bayEmergencyLights: Record<string, THREE.PointLight> = {};
    const bayWarningSigns: Record<string, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }> = {};

    const createOreCart = (x: number, y: number, z: number) => {
      const cg = new THREE.Group();
      cg.position.set(x, y, z);
      const tub = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.72, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.55, roughness: 0.45 })
      );
      tub.position.y = 0.56;
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(1.65, 0.08, 0.96),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 })
      );
      rim.position.y = 0.92;
      cg.add(tub, rim);

      [-0.48, 0.48].forEach((wx) => {
        [-0.44, 0.44].forEach((wz) => {
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 0.1, 14),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 })
          );
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx, 0.22, wz);
          cg.add(wheel);
        });
      });

      for (let r = 0; r < 9; r++) {
        const ore = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.24, 0),
          new THREE.MeshStandardMaterial({
            color: r % 2 === 0 ? 0xa16207 : 0x78350f,
            roughness: 0.75,
            flatShading: true
          })
        );
        ore.position.set(((r % 3) - 1) * 0.38, 0.98 + (r % 2) * 0.12, ((r % 2) - 0.5) * 0.24);
        cg.add(ore);
      }
      return cg;
    };

    const createWoodenCrate = (x: number, y: number, z: number, w = 1.15, h = 0.78) => {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.75 })
      );
      crate.position.set(x, y + h / 2, z);
      return crate;
    };

    const buildTunnelLevel = (levelIdx: number, floorY: number) => {
      const tg = new THREE.Group();
      tg.position.set(0, floorY, 0);
      scene.add(tg);

      const floorDeck = new THREE.Mesh(
        new THREE.BoxGeometry(21.4, 0.26, 3.4),
        new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.85 })
      );
      floorDeck.position.set(0.8, -0.12, 0.1);
      floorDeck.receiveShadow = true;
      tg.add(floorDeck);

      const ductPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 20.6, 14),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.65, roughness: 0.35 })
      );
      ductPipe.rotation.z = Math.PI / 2;
      ductPipe.position.set(0.8, 2.72, -0.95);
      tg.add(ductPipe);

      const fanHousing = new THREE.Group();
      fanHousing.position.set(-9.1, 2.25, -1.15);
      const fanRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.09, 10, 24),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 })
      );
      const rotor = new THREE.Group();
      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.98, 0.15, 0.04),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
        );
        blade.rotation.z = (b * Math.PI) / 4;
        rotor.add(blade);
      }
      fanHousing.add(fanRing, rotor);
      tunnelFans.push(rotor);
      tg.add(fanHousing);

      tg.add(createWoodenCrate(-9.1, 0, -0.4, 1.2, 0.82));

      const centerPier = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 3.05, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
      );
      centerPier.position.set(-0.3, 1.5, -0.8);
      tg.add(centerPier);

      const doorway = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 2.15, 0.12),
        new THREE.MeshStandardMaterial({
          color: levelIdx === 1 ? 0xeab308 : 0x0f172a,
          roughness: 0.45
        })
      );
      doorway.position.set(-0.3, 1.08, 0.02);
      tg.add(doorway);

      [-2.1, 1.35].forEach((lx) => {
        const lGroup = new THREE.Group();
        lGroup.position.set(lx, 1.45, -0.75);
        [-0.2, 0.2].forEach((rx) => {
          const rMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 2.9, 6),
            yellowRailMat
          );
          rMesh.position.x = rx;
          lGroup.add(rMesh);
        });
        for (let sy = -1.2; sy <= 1.2; sy += 0.4) {
          const step = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6),
            yellowRailMat
          );
          step.rotation.z = Math.PI / 2;
          step.position.y = sy;
          lGroup.add(step);
        }
        tg.add(lGroup);
      });

      [-7.4, -3.3, 2.8, 7.6].forEach((lx) => {
        const lampBar = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 0.12, 0.28),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        lampBar.position.set(lx, 2.82, 0.15);

        const pLight = new THREE.PointLight(0xffedd5, 1.65, 9.5);
        pLight.position.set(lx, 2.45, 0.65);
        tg.add(lampBar, pLight);
      });

      return tg;
    };

    const level1Group = buildTunnelLevel(1, 2.35);
    const level2Group = buildTunnelLevel(2, -2.55);
    const level3Group = buildTunnelLevel(3, -7.45);

    [1.35, -3.55].forEach((strataY) => {
      const stepCutout = new THREE.Group();
      stepCutout.position.set(-0.3, strataY, 1.05);
      const recess = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.62, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x1e293b })
      );
      stepCutout.add(recess);
      for (let sy = -0.6; sy <= 0.6; sy += 0.3) {
        const rung = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.07, 0.25),
          new THREE.MeshStandardMaterial({ color: 0x64748b })
        );
        rung.position.set(0, sy, 0.15);
        stepCutout.add(rung);
      }
      scene.add(stepCutout);
    });

    const cartL1 = createOreCart(-4.1, 0, 0.35);
    level1Group.add(cartL1);
    level1Group.add(createWoodenCrate(8.4, 0, -0.25, 1.65, 0.9));

    const cartL2Left = createOreCart(-2.9, 0, 0.35);
    const cartL2Right = createOreCart(8.5, 0, 0.35);
    level2Group.add(cartL2Left, cartL2Right);

    const rubbleL2 = new THREE.Group();
    rubbleL2.position.set(4.1, 0, -0.35);
    for (let i = 0; i < 12; i++) {
      const rStone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.38 + (i % 3) * 0.12, 0),
        cliffRockMat
      );
      rStone.position.set(
        ((i % 4) - 1.5) * 0.38,
        Math.floor(i / 4) * 0.32 + 0.22,
        ((i % 2) - 0.5) * 0.3
      );
      rubbleL2.add(rStone);
    }
    level2Group.add(rubbleL2);

    const cartL3 = createOreCart(-4.1, 0, 0.35);
    level3Group.add(cartL3);

    const scoopLoader = new THREE.Group();
    scoopLoader.position.set(7.8, 0, 0.35);
    const lBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.82, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35 })
    );
    lBody.position.y = 0.62;
    const lCab = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.8, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    lCab.position.set(-0.2, 1.32, 0);
    const lBucket = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.55, 1.15),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 })
    );
    lBucket.position.set(-1.35, 0.42, 0);
    scoopLoader.add(lBody, lCab, lBucket);
    [-0.65, 0.65].forEach((wx) => {
      [-0.52, 0.52].forEach((wz) => {
        const w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14),
          new THREE.MeshStandardMaterial({ color: 0x0f172a })
        );
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.36, wz);
        scoopLoader.add(w);
      });
    });
    level3Group.add(scoopLoader);

    const gasHazeMat = new THREE.MeshBasicMaterial({
      color: 0xeab308,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const gasHazeMesh = new THREE.Mesh(new THREE.BoxGeometry(10.0, 2.7, 2.6), gasHazeMat);
    gasHazeMesh.position.set(5.5, 1.35, 0.2);
    level3Group.add(gasHazeMesh);

    const createHoloAlertSign = () => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
        ctx.beginPath();
        ctx.moveTo(128, 28);
        ctx.lineTo(24, 218);
        ctx.lineTo(232, 218);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#fecaca';
        ctx.lineWidth = 8;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 115px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', 128, 196);
      }

      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), mat);
      return { mesh, mat };
    };

    interface WorkerRig {
      config: WorkerConfig;
      index: number;
      stationGroup: THREE.Group;
      primaryMiner: ReturnType<typeof buildMinerFigure>;
      partnerMiner: ReturnType<typeof buildMinerFigure> | null;
      propMesh: THREE.Object3D | null;
      pulseRing: THREE.Mesh;
      pulseRingMat: THREE.MeshBasicMaterial;
      floorAlertMat: THREE.MeshBasicMaterial;
    }

    const workerRigMap: Record<string, WorkerRig> = {};
    const workerLiveHelmetPos: Record<string, THREE.Vector3> = {};

    WORKER_CONFIGS.forEach((wc, idx) => {
      const stationGroup = new THREE.Group();
      stationGroup.position.set(...wc.basePos);
      scene.add(stationGroup);

      const primaryMiner = buildMinerFigure({
        skinColor: wc.skinColor,
        suitColor: wc.suitColor,
        vestColor: wc.vestColor,
        helmetColor: wc.helmetColor,
        scale: 1.18
      });
      stationGroup.add(primaryMiner.root);

      let partnerMiner: ReturnType<typeof buildMinerFigure> | null = null;
      let propMesh: THREE.Object3D | null = null;

      if (wc.activity === 'clipboard_and_drill') {
        const clipboard = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.3, 0.03),
          new THREE.MeshBasicMaterial({ color: 0xfacc15 })
        );
        clipboard.position.set(0.28, 1.05, 0.25);
        clipboard.rotation.x = -0.6;
        primaryMiner.root.add(clipboard);

        partnerMiner = buildMinerFigure({
          skinColor: 0xd99b72,
          suitColor: 0x1d4ed8,
          vestColor: 0xf97316,
          helmetColor: 0xfacc15,
          scale: 1.18
        });
        partnerMiner.root.position.set(3.4, 0, 0);
        stationGroup.add(partnerMiner.root);

        const drillGroup = new THREE.Group();
        drillGroup.position.set(0, 0.55, 0.35);
        const drillBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.09, 0.52, 10),
          yellowRailMat
        );
        const drillBit = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.015, 0.55, 8),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
        );
        drillBit.position.y = -0.45;
        drillGroup.add(drillBody, drillBit);
        partnerMiner.root.add(drillGroup);
        propMesh = drillGroup;
      } else if (wc.activity === 'carry_box_pair') {
        partnerMiner = buildMinerFigure({
          skinColor: 0xf1b894,
          suitColor: 0x1d4ed8,
          vestColor: 0xf97316,
          helmetColor: 0xfacc15,
          scale: 1.18
        });
        partnerMiner.root.position.set(1.25, 0, 0);
        stationGroup.add(partnerMiner.root);

        const carriedBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.58, 0.42, 0.42),
          new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 })
        );
        carriedBox.position.set(0.62, 0.92, 0);
        stationGroup.add(carriedBox);
        propMesh = carriedBox;
      }

      const pulseRingMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
      });
      const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 28), pulseRingMat);
      pulseRing.position.set(0, 1.55, 0);
      pulseRing.rotation.x = Math.PI / 2;
      stationGroup.add(pulseRing);

      const bayLight = new THREE.PointLight(0xef4444, 0.0, 8.5);
      bayLight.position.set(0.3, 1.85, 0.8);
      stationGroup.add(bayLight);
      bayEmergencyLights[wc.id] = bayLight;

      const holoSign = createHoloAlertSign();
      holoSign.mesh.position.set(0.45, 2.05, 0.35);
      stationGroup.add(holoSign.mesh);
      bayWarningSigns[wc.id] = holoSign;

      const floorAlertMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
      });
      const floorAlertDisc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), floorAlertMat);
      floorAlertDisc.rotation.x = -Math.PI / 2;
      floorAlertDisc.position.set(0, 0.03, 0);
      stationGroup.add(floorAlertDisc);

      workerRigMap[wc.id] = {
        config: wc,
        index: idx,
        stationGroup,
        primaryMiner,
        partnerMiner,
        propMesh,
        pulseRing,
        pulseRingMat,
        floorAlertMat
      };

      workerLiveHelmetPos[wc.id] = new THREE.Vector3(
        wc.basePos[0],
        wc.basePos[1] + 1.55,
        wc.basePos[2]
      );
    });

    const meshNetworkGroup = new THREE.Group();
    scene.add(meshNetworkGroup);

    const linkObjects = MESH_LINKS.map((link) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3()
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: link.type === 'trunk' ? 0x38bdf8 : 0x22d3ee,
        transparent: true,
        opacity: 0.0
      });
      const line = new THREE.Line(geo, mat);
      meshNetworkGroup.add(line);

      const packets = [0.0, 0.5].map((offset) => {
        const pMat = new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.0
        });
        const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), pMat);
        meshNetworkGroup.add(pMesh);
        return {
          mesh: pMesh,
          mat: pMat,
          offset,
          speed: link.type === 'trunk' ? 0.72 : 0.48
        };
      });

      return { ...link, line, geo, mat, packets };
    });

    let isDragging = false;
    let isPanning = false;
    let prevMouse = { x: 0, y: 0 };
    const currentTarget = new THREE.Vector3(...CAMERA_PRESETS.overview.target);

    const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const syncEulerFromCamera = () => {
      camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    };
    camera.lookAt(currentTarget);
    syncEulerFromCamera();

    const keysPressed: Record<string, boolean> = {};

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'KeyE',
          'KeyQ',
          'KeyC',
          'Space',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'ShiftLeft',
          'ShiftRight'
        ].includes(code)
      ) {
        if (code === 'Space' || code.startsWith('Arrow')) {
          e.preventDefault();
        }
        ensureAudioReady();
        keysPressed[code] = true;
        stateRef.current.cameraGoal.isTransitioning = false;
        setActivePresetName('freefly');
        setIsFlyingKeyActive(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      delete keysPressed[e.code];
      const stillPressed = Object.keys(keysPressed).some((k) => !k.startsWith('Shift'));
      if (!stillPressed) {
        setIsFlyingKeyActive(false);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      ensureAudioReady();
      isDragging = true;
      isPanning = e.button === 2 || e.shiftKey;
      prevMouse = { x: e.clientX, y: e.clientY };
      stateRef.current.cameraGoal.isTransitioning = false;
      syncEulerFromCamera();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      prevMouse = { x: e.clientX, y: e.clientY };

      if (isPanning) {
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        camera.position.addScaledVector(right, -dx * 0.028);
        camera.position.addScaledVector(up, dy * 0.028);
      } else {
        if (gyroActiveRef.current) {
          // In Gyro mode, horizontal swipe adjusts forward heading calibration offset
          gyroYawOffsetRef.current -= dx * 0.005;
        } else {
          camEuler.y -= dx * 0.0042;
          camEuler.x = THREE.MathUtils.clamp(
            camEuler.x - dy * 0.0042,
            -Math.PI / 2.1,
            Math.PI / 2.1
          );
          camera.quaternion.setFromEuler(camEuler);
        }
      }

      const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      currentTarget.copy(camera.position).addScaledVector(lookDir, 15);
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.cameraGoal.isTransitioning = false;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(forward, -e.deltaY * 0.016);
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -42, 42);
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, -16, 32);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, 2.0, 56);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    let initialPinchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDist = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const deltaDist = dist - initialPinchDist;
        initialPinchDist = dist;

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        camera.position.addScaledVector(forward, deltaDist * 0.045);
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -42, 42);
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, -16, 32);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, 2.0, 56);
      }
    };

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
        deviceOrientationRef.current = {
          alpha: e.alpha,
          beta: e.beta,
          gamma: e.gamma
        };
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', onPointerDown);
    domElem.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });
    domElem.addEventListener('touchstart', onTouchStart, { passive: true });
    domElem.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('deviceorientation', onDeviceOrientation, true);

    const clock = new THREE.Clock();
    let frameId: number;
    let lastLabelSync = 0;
    let lastHeadingSync = 0;

    const isEmergencyLink = (scenario: ScenarioDef | null, from: string, to: string) => {
      if (!scenario) return false;
      const r = scenario.routeNodes;
      for (let i = 0; i < r.length - 1; i++) {
        if ((r[i] === from && r[i + 1] === to) || (r[i] === to && r[i + 1] === from)) {
          return true;
        }
      }
      return false;
    };

    setIsSceneReady(true);

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const t = clock.getElapsedTime();

      const {
        layer: curLayer,
        activeScenario: curScenario,
        alertStage: curAlertStage,
        cameraGoal
      } = stateRef.current;

      // Smooth Layer 1 <-> Layer 2 Network Fade
      const targetNetOpacity = curLayer === 2 ? 1.0 : 0.0;
      stateRef.current.networkOpacity = THREE.MathUtils.lerp(
        stateRef.current.networkOpacity,
        targetNetOpacity,
        delta * 4.5
      );
      const netAlpha = stateRef.current.networkOpacity;

      // Gyroscope 360-degree orientation tracking
      if (gyroActiveRef.current && deviceOrientationRef.current) {
        const { alpha, beta, gamma } = deviceOrientationRef.current;
        const degToRad = Math.PI / 180;
        const orient =
          typeof window.screen?.orientation?.angle === 'number'
            ? window.screen.orientation.angle * degToRad
            : typeof (window as unknown as { orientation: number }).orientation === 'number'
            ? (window as unknown as { orientation: number }).orientation * degToRad
            : 0;

        setDeviceOrientationQuat(
          camera.quaternion,
          alpha * degToRad,
          beta * degToRad,
          gamma * degToRad,
          orient,
          gyroYawOffsetRef.current
        );
        syncEulerFromCamera();
        const lookForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        currentTarget.copy(camera.position).addScaledVector(lookForward, 15);
      }

      // Camera Preset Transitions vs Game-Style / Virtual Controller Free-Fly
      if (cameraGoal.isTransitioning) {
        const step = Math.min(1, delta * 3.2);
        camera.position.lerp(cameraGoal.position, step);
        currentTarget.lerp(cameraGoal.target, step);
        camera.lookAt(currentTarget);
        syncEulerFromCamera();
        if (
          camera.position.distanceTo(cameraGoal.position) < 0.1 &&
          currentTarget.distanceTo(cameraGoal.target) < 0.1
        ) {
          cameraGoal.isTransitioning = false;
        }
      } else {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

        const vNav = virtualNavRef.current;
        const isSprint =
          keysPressed['ShiftLeft'] ||
          keysPressed['ShiftRight'] ||
          vNav.boost ||
          isBoostActiveRef.current;
        const flySpeed = (isSprint ? 24.0 : 11.5) * delta;

        if (keysPressed['KeyW'] || keysPressed['ArrowUp'] || vNav.forward) {
          camera.position.addScaledVector(forward, flySpeed);
        }
        if (keysPressed['KeyS'] || keysPressed['ArrowDown'] || vNav.backward) {
          camera.position.addScaledVector(forward, -flySpeed);
        }
        if (keysPressed['KeyD'] || keysPressed['ArrowRight'] || vNav.right) {
          camera.position.addScaledVector(right, flySpeed);
        }
        if (keysPressed['KeyA'] || keysPressed['ArrowLeft'] || vNav.left) {
          camera.position.addScaledVector(right, -flySpeed);
        }
        if (keysPressed['KeyE'] || keysPressed['Space'] || vNav.up) {
          camera.position.y += flySpeed;
        }
        if (keysPressed['KeyQ'] || keysPressed['KeyC'] || vNav.down) {
          camera.position.y -= flySpeed;
        }

        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -42, 42);
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, -16, 32);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, 2.0, 56);
      }

      // Periodic Heading calculation for 360 Panorama indicator (~10fps)
      if (t - lastHeadingSync > 0.1) {
        lastHeadingSync = t;
        const deg = Math.round(((-camEuler.y * 180) / Math.PI) % 360 + 360) % 360;
        setHeadingDegrees(deg);
      }

      // Redraw 4-Screen Surveillance Room Wall Texture when needed
      if (stateRef.current.needsScreenRedraw && screenCtx) {
        drawSurveillanceMultiWall(
          screenCtx,
          2048,
          512,
          curScenario,
          curAlertStage,
          curLayer
        );
        screenTexture.needsUpdate = true;
        stateRef.current.needsScreenRedraw = false;
      }

      // Animate Clouds, Fans, Elevator Cage, and Surveillance Operators
      cloudsGroup.children.forEach((c, idx) => {
        c.position.x += cloudDefs[idx].speed * delta;
        if (c.position.x > 28) c.position.x = -28;
      });
      tunnelFans.forEach((tf) => {
        tf.rotation.z += delta * 6.5;
      });

      elevatorCage.position.y = -0.8 + Math.sin(t * 0.55) * 2.8;
      hoistMiner.headGroup.rotation.y = Math.sin(t * 1.4) * 0.25;

      survOperators.forEach((op, idx) => {
        op.head.rotation.y = Math.sin(t * 1.2 + idx) * 0.22;
      });

      const gwColor = curScenario ? curScenario.colorInt : 0x22d3ee;
      gwBeaconMat.color.setHex(gwColor);
      gwWaveMat.color.setHex(gwColor);
      const gwPhase = (t * (curScenario ? 2.2 : 1.1)) % 1;
      gwWaveRing.scale.setScalar(1 + gwPhase * 2.6);
      gwWaveMat.opacity = (1 - gwPhase) * Math.max(netAlpha * 0.7, curScenario ? 0.75 : 0.2);

      const targetGas = curScenario?.id === 'gas' ? 0.22 + Math.sin(t * 3.5) * 0.06 : 0.0;
      gasHazeMat.opacity = THREE.MathUtils.lerp(gasHazeMat.opacity, targetGas, delta * 4);

      // Animate Workers
      WORKER_CONFIGS.forEach((wc) => {
        const rig = workerRigMap[wc.id];
        const pm = rig.primaryMiner;
        const isAffected = curScenario?.targetWorkerId === wc.id;

        const bayLight = bayEmergencyLights[wc.id];
        const holoSign = bayWarningSigns[wc.id];

        if (isAffected) {
          bayLight.color.setHex(curScenario.colorInt);
          bayLight.intensity = 3.2 + Math.sin(t * 7.0) * 1.1;
          holoSign.mat.opacity = 0.88 + Math.sin(t * 7.0) * 0.12;
          holoSign.mesh.position.y = 2.02 + Math.sin(t * 3.5) * 0.08;
          rig.floorAlertMat.color.setHex(curScenario.colorInt);
          rig.floorAlertMat.opacity = 0.35 + Math.sin(t * 6.0) * 0.12;
        } else {
          bayLight.intensity = THREE.MathUtils.lerp(bayLight.intensity, 0, delta * 5);
          holoSign.mat.opacity = THREE.MathUtils.lerp(holoSign.mat.opacity, 0, delta * 6);
          rig.floorAlertMat.opacity = 0.0;
        }

        if (wc.activity === 'push_cart') {
          if (isAffected && curScenario?.id === 'fall') {
            pm.bodyGroup.rotation.y = Math.PI / 2;
            pm.hipsGroup.position.y = 0.34;
            pm.spineGroup.rotation.x = 0.55;
            pm.leftLeg.thighGroup.rotation.x = -1.15;
            pm.leftLeg.shinGroup.rotation.x = 1.35;
            pm.rightLeg.thighGroup.rotation.x = 0.4;
            pm.rightLeg.shinGroup.rotation.x = 0.9;
            pm.leftArm.upperArmGroup.rotation.x = -0.9;
            pm.rightArm.upperArmGroup.rotation.x = -1.1;
          } else {
            const pushOffset = Math.sin(t * 1.4 + rig.index) * 0.35;
            pm.root.position.x = pushOffset;
            if (wc.id === 'M-101') cartL1.position.x = -4.1 + pushOffset;
            if (wc.id === 'M-105') cartL3.position.x = -4.1 + pushOffset;

            pm.bodyGroup.rotation.y = Math.PI / 2;
            pm.hipsGroup.position.y = 0.56;
            pm.spineGroup.rotation.x = 0.22;
            const walkSin = Math.sin(t * 4.2);
            pm.leftLeg.thighGroup.rotation.x = walkSin * 0.45;
            pm.rightLeg.thighGroup.rotation.x = -walkSin * 0.45;
            pm.leftArm.upperArmGroup.rotation.x = -1.15;
            pm.rightArm.upperArmGroup.rotation.x = -1.15;
          }
        } else if (wc.activity === 'clipboard_and_drill') {
          pm.bodyGroup.rotation.y = Math.PI / 2 - 0.25;
          pm.leftArm.upperArmGroup.rotation.x = -0.85;
          pm.rightArm.upperArmGroup.rotation.x = -0.75 + Math.sin(t * 3.0) * 0.15;
          pm.headGroup.rotation.x = 0.18 + Math.sin(t * 2.0) * 0.08;

          if (isAffected) {
            pm.leftArm.upperArmGroup.rotation.x = -1.45 + Math.sin(t * 6.0) * 0.2;
          }

          if (rig.partnerMiner) {
            const p2 = rig.partnerMiner;
            const vib = Math.sin(t * 28.0) * 0.022;
            p2.hipsGroup.position.y = 0.56 + vib;
            p2.leftArm.upperArmGroup.rotation.x = -0.95;
            p2.rightArm.upperArmGroup.rotation.x = -0.95;
            if (rig.propMesh) rig.propMesh.position.y = 0.55 + vib;
          }
        } else if (wc.activity === 'carry_box_pair') {
          const bob = Math.sin(t * 3.2) * 0.03;
          pm.bodyGroup.rotation.y = Math.PI / 2;
          pm.hipsGroup.position.y = 0.57 + bob;
          pm.leftArm.upperArmGroup.rotation.x = -0.95;
          pm.rightArm.upperArmGroup.rotation.x = -0.95;

          if (rig.partnerMiner) {
            const p2 = rig.partnerMiner;
            p2.bodyGroup.rotation.y = -Math.PI / 2;
            p2.hipsGroup.position.y = 0.57 + bob;
            p2.leftArm.upperArmGroup.rotation.x = -0.95;
            p2.rightArm.upperArmGroup.rotation.x = -0.95;
          }
          if (rig.propMesh) rig.propMesh.position.y = 0.92 + bob;
        } else if (wc.activity === 'seated_tech') {
          pm.bodyGroup.rotation.y = Math.PI / 2 - 0.2;
          pm.hipsGroup.position.y = 0.26;
          pm.spineGroup.rotation.x = isAffected ? 0.22 + Math.sin(t * 6.5) * 0.06 : 0.1;
          pm.leftLeg.thighGroup.rotation.x = -1.35;
          pm.leftLeg.shinGroup.rotation.x = 0.35;
          pm.rightLeg.thighGroup.rotation.x = -1.25;
          pm.rightLeg.shinGroup.rotation.x = 0.45;
          pm.leftArm.upperArmGroup.rotation.x = isAffected
            ? -0.95 + Math.sin(t * 5.0) * 0.15
            : -0.65;
          pm.rightArm.upperArmGroup.rotation.x = -0.85;
          pm.headGroup.rotation.y = Math.sin(t * 2.2) * 0.18;
        } else if (wc.activity === 'guide_loader') {
          pm.bodyGroup.rotation.y = Math.PI / 2;
          pm.leftArm.upperArmGroup.rotation.x = -0.85 + Math.sin(t * 3.5) * 0.25;
          pm.rightArm.upperArmGroup.rotation.x = -0.75;
          scoopLoader.position.x = 7.8 + Math.sin(t * 1.1) * 0.35;

          if (isAffected) {
            pm.rightArm.upperArmGroup.rotation.x = -1.25;
            pm.rightArm.upperArmGroup.rotation.z = Math.sin(t * 7.0) * 0.35;
          } else {
            pm.rightArm.upperArmGroup.rotation.z = 0;
          }
        }

        pm.beaconMat.color.setHex(
          isAffected ? curScenario.colorInt : curLayer === 2 ? 0x22d3ee : 0x10b981
        );
        const phase = (t * (isAffected ? 2.4 : 1.1) + rig.index * 0.3) % 1;
        rig.pulseRing.scale.setScalar(0.35 + phase * (isAffected ? 2.6 : 1.8));
        rig.pulseRingMat.color.setHex(isAffected ? curScenario.colorInt : 0x22d3ee);
        const ringAlpha = isAffected ? 0.85 : Math.max(0.12, netAlpha * 0.65);
        rig.pulseRingMat.opacity = (1 - phase) * ringAlpha;

        workerLiveHelmetPos[wc.id].set(
          wc.basePos[0] + pm.root.position.x,
          wc.basePos[1] + 1.45,
          wc.basePos[2]
        );
      });

      const getNodePos = (id: string) => {
        if (workerLiveHelmetPos[id]) return workerLiveHelmetPos[id];
        const inf = INFRA_NODES[id];
        return new THREE.Vector3(inf[0], inf[1], inf[2]);
      };

      linkObjects.forEach((lo) => {
        const start = getNodePos(lo.from);
        const end = getNodePos(lo.to);
        const isAlertPath = isEmergencyLink(curScenario, lo.from, lo.to);

        const posArr = lo.geo.attributes.position.array as Float32Array;
        posArr[0] = start.x;
        posArr[1] = start.y;
        posArr[2] = start.z;
        posArr[3] = end.x;
        posArr[4] = end.y;
        posArr[5] = end.z;
        lo.geo.attributes.position.needsUpdate = true;

        lo.mat.color.setHex(
          isAlertPath
            ? curScenario!.colorInt
            : lo.type === 'trunk' || lo.type === 'surface'
            ? 0x38bdf8
            : 0x22d3ee
        );
        const baseAlpha = lo.type === 'cross' ? 0.35 : 0.78;
        lo.mat.opacity = isAlertPath ? 0.95 : netAlpha * baseAlpha;

        lo.packets.forEach((pkt) => {
          const speedMult = isAlertPath ? 1.85 : 1.0;
          const prog = (t * pkt.speed * speedMult + pkt.offset) % 1;
          pkt.mesh.position.lerpVectors(start, end, prog);
          pkt.mat.color.setHex(isAlertPath ? curScenario!.colorInt : 0x67e8f9);
          pkt.mat.opacity = isAlertPath ? 1.0 : netAlpha * 0.92;
          pkt.mesh.scale.setScalar(isAlertPath ? 1.4 : 0.95);
        });
      });

      // Project Fixed Tunnel Ceiling Badges (M-101 to M-106)
      if (t - lastLabelSync > 0.045) {
        lastLabelSync = t;
        const cW = domElem.clientWidth;
        const cH = domElem.clientHeight;
        const projected = WORKER_CONFIGS.map((wc) => {
          const worldPos = new THREE.Vector3(...wc.labelPos);
          worldPos.project(camera);
          const sx = (worldPos.x * 0.5 + 0.5) * cW;
          const sy = (-(worldPos.y * 0.5) + 0.5) * cH;
          const visible =
            worldPos.z < 1.0 && sx > 30 && sx < cW - 30 && sy > 30 && sy < cH - 30;
          return {
            worker: wc,
            x: sx,
            y: sy,
            visible
          };
        });
        setWorkerLabels(projected);
      }

      audioRef.current?.updateSpatialMix(
        camera.position,
        t,
        curLayer,
        curScenario,
        curAlertStage
      );

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      domElem.removeEventListener('pointerdown', onPointerDown);
      domElem.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      domElem.removeEventListener('wheel', onWheel);
      domElem.removeEventListener('touchstart', onTouchStart);
      domElem.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('deviceorientation', onDeviceOrientation, true);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* INITIALIZATION LOADING OVERLAY */}
      {!isSceneReady && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-200">
          <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <div className="text-sm font-bold tracking-wider uppercase text-cyan-300">
            Initializing LifeLink 3D Mine Environment...
          </div>
        </div>
      )}

      {/* FULL-SCREEN THREE.JS 3D CANVAS */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* FLOATING TUNNEL WORKER PILLS (M-101 TO M-106) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {workerLabels.map(({ worker, x, y, visible }) => {
          if (!visible) return null;
          const isAffected = activeScenario?.targetWorkerId === worker.id;
          const isWarning = isAffected && activeScenario?.severity === 'warning';
          const dotColor = isAffected
            ? isWarning
              ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'
              : 'bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse'
            : 'bg-emerald-400 shadow-[0_0_6px_#10b981]';

          return (
            <button
              key={worker.id}
              style={{
                transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
              }}
              onClick={() => handleFocusWorker(worker)}
              className={`pointer-events-auto absolute top-0 left-0 cursor-pointer transition-all duration-200 px-3 py-1 rounded-full flex items-center gap-2 backdrop-blur-md shadow-lg border ${
                isAffected
                  ? 'bg-slate-950/90 border-red-500/80 text-white scale-105'
                  : 'bg-slate-950/80 hover:bg-slate-900 border-white/15 text-slate-100'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
              <span className="text-xs font-bold tracking-wide font-sans">{worker.id}</span>
            </button>
          );
        })}
      </div>

      {effectiveIsMobile ? (
        /* ============================================================ */
        /* PHONE VIEW (360-DEGREE PANORAMA / GYRO MODE & CONTROLLER)     */
        /* ============================================================ */
        <>
          {/* 1. PHONE TOP HUD: BRAND, 360° HEADING, GYRO TOGGLE, LAYER SWITCH */}
          <div className="pointer-events-none fixed top-3 inset-x-3 z-30 flex items-center justify-between gap-1.5">
            {/* Brand & Heading Pill */}
            <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-white/15 rounded-xl px-2.5 py-1.5 shadow-xl flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shrink-0">
                <Shield className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="text-xs font-black text-white">LifeLink</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                    360°
                  </span>
                </div>
                <div className="text-[9px] font-mono text-slate-400 leading-tight">
                  {headingDegrees}°{' '}
                  {headingDegrees < 45 || headingDegrees >= 315
                    ? 'N'
                    : headingDegrees < 135
                    ? 'E'
                    : headingDegrees < 225
                    ? 'S'
                    : 'W'}
                </div>
              </div>
            </div>

            {/* Right Group: Gyro Mode Toggle + Layer Switch + Desktop Mode Switch */}
            <div className="pointer-events-auto flex items-center gap-1.5">
              {/* Gyro Mode Toggle Button */}
              <button
                onClick={requestGyroPermission}
                title="Toggle 360° Gyroscope Sensor"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xl backdrop-blur-md border ${
                  gyroEnabled
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-pulse'
                    : 'bg-slate-950/85 hover:bg-slate-900 border-white/15 text-slate-300'
                }`}
              >
                <Smartphone className={`w-3.5 h-3.5 ${gyroEnabled ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{gyroEnabled ? 'Gyro ON' : 'Gyro Mode'}</span>
              </button>

              {/* Layer 1 / Layer 2 Toggle */}
              <button
                onClick={() => {
                  ensureAudioReady();
                  const nextLayer = layer === 1 ? 2 : 1;
                  audioRef.current?.playLayerSwitch(nextLayer);
                  setLayer(nextLayer);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border backdrop-blur-md shadow-xl transition-all ${
                  layer === 1
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>L{layer}</span>
              </button>

              {/* Return to Desktop view toggle */}
              <button
                onClick={() => setForceMobileMode(false)}
                title="Switch to Desktop Layout"
                className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-mono bg-white/10 hover:bg-white/20 border border-white/15 text-slate-300 transition-colors"
              >
                <span>💻 Desktop</span>
              </button>
            </div>
          </div>

          {/* Active Emergency Alert Pill on Phone View */}
          {activeScenario && (
            <div className="pointer-events-none fixed top-14 inset-x-3 z-30 flex justify-center">
              <div className="pointer-events-auto bg-red-950/90 backdrop-blur-md border border-red-500 rounded-xl px-3 py-1.5 shadow-2xl flex items-center gap-2 max-w-sm animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <div className="text-[11px] leading-tight text-white font-bold flex-1 truncate">
                  {activeScenario.sensorCode}: {activeScenario.category}
                </div>
                <button
                  onClick={handleResetSimulation}
                  className="px-2 py-0.5 rounded bg-red-600/80 text-[10px] font-bold text-white shrink-0 hover:bg-red-500"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Gyro Active Hint Banner */}
          {gyroEnabled && (
            <div className="pointer-events-none fixed top-24 inset-x-0 z-20 flex justify-center px-4">
              <div className="bg-cyan-950/80 border border-cyan-400/40 text-cyan-200 text-[10px] font-mono px-3 py-1 rounded-full shadow-lg backdrop-blur-md animate-fade-in flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
                <span>360° Gyro Active: Rotate &amp; tilt phone • Drag to adjust heading</span>
              </div>
            </div>
          )}

          {/* 2. FLOATING EMERGENCY SIMULATOR TRIGGER FOR PHONE (Bottom-Left) */}
          {!isMobileEmergencyOpen ? (
            <div className="fixed bottom-5 left-5 z-40">
              <button
                onClick={() => setIsMobileEmergencyOpen(true)}
                aria-label="Simulate Emergency"
                className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-950/90 hover:bg-slate-900 border-2 border-red-500/70 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] backdrop-blur-xl transition-all active:scale-95"
              >
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </button>
            </div>
          ) : (
            <div className="fixed bottom-4 left-4 z-40 w-64 bg-slate-950/95 backdrop-blur-2xl border border-red-500/50 rounded-2xl p-3 shadow-[0_12px_40px_rgba(0,0,0,0.92)] text-white select-none animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Simulate Alert</span>
                </div>
                <button
                  onClick={() => setIsMobileEmergencyOpen(false)}
                  className="p-1 rounded-md bg-white/10 text-slate-300 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                {[
                  { key: 'fall', label: 'MPU6050 Motion / Fall', code: 'M-101', color: 'text-red-400' },
                  { key: 'biometric', label: 'MAX30102 Heart / SpO₂', code: 'M-104', color: 'text-rose-400' },
                  { key: 'temperature', label: 'DS18B20 Temperature', code: 'M-102', color: 'text-amber-400' },
                  { key: 'gas', label: 'MQ-135 Gas / Air-Quality', code: 'M-106', color: 'text-orange-400' }
                ].map((scen) => (
                  <button
                    key={scen.key}
                    onClick={() => {
                      handleTriggerScenario(scen.key);
                      setIsMobileEmergencyOpen(false);
                    }}
                    className={`flex items-center justify-between p-2 rounded-xl border text-left transition-all ${
                      activeScenarioKey === scen.key
                        ? 'bg-red-950 border-red-500 text-white font-bold'
                        : 'bg-slate-900/80 hover:bg-slate-800 border-white/10 text-slate-200'
                    }`}
                  >
                    <div className="text-[11px] leading-tight font-medium">
                      <div className={`font-mono text-[9px] ${scen.color}`}>{scen.code}</div>
                      <div>{scen.label}</div>
                    </div>
                  </button>
                ))}

                {activeScenario && (
                  <button
                    onClick={() => {
                      handleResetSimulation();
                      setIsMobileEmergencyOpen(false);
                    }}
                    className="mt-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-red-600/30 hover:bg-red-600/40 border border-red-500/50 text-red-200 text-xs font-bold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Simulation</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ============================================================ */
        /* DESKTOP VIEW                                                 */
        /* ============================================================ */
        <>
          {/* 1. TOP-LEFT: LIFELINK 3D BRAND PILL CARD */}
          <div className="pointer-events-none absolute top-4 left-4 z-20 flex flex-col gap-2">
            <div className="pointer-events-auto bg-slate-950/80 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-2.5 shadow-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="w-6 h-6"
                >
                  <path d="M4 13a8 8 0 0 1 16 0v2H4v-2Z" />
                  <path d="M2 15h20" />
                  <circle cx="12" cy="9" r="2" />
                  <path d="M7 15v2a5 5 0 0 0 10 0v-2" />
                </svg>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-extrabold tracking-tight text-white">LifeLink</span>
                  <span className="text-lg font-extrabold tracking-tight text-cyan-400">3D</span>
                </div>
                <p className="text-[11px] text-slate-300/90 leading-tight">
                  Underground Mine Safety &amp; Mesh Network
                </p>
              </div>
            </div>

            {/* Test Phone 360 / Gyro Mode Toggle */}
            <div className="pointer-events-auto self-start">
              <button
                onClick={() => setForceMobileMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-cyan-400/40 text-cyan-300 text-[11px] font-bold shadow-lg backdrop-blur-md transition-all"
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                <span>Test Phone 360 / Gyro</span>
              </button>
            </div>
          </div>

          {/* 2. TOP-CENTER: LAYER 1 / LAYER 2 PILL SWITCH */}
          <div className="pointer-events-none absolute top-4 inset-x-0 z-20 flex justify-center px-4">
            <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-white/15 p-1 rounded-full shadow-2xl flex items-center gap-1">
              <button
                onClick={() => {
                  ensureAudioReady();
                  audioRef.current?.playLayerSwitch(1);
                  setLayer(1);
                }}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-200 ${
                  layer === 1
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Layer 1 — Mine View</span>
              </button>

              <button
                onClick={() => {
                  ensureAudioReady();
                  audioRef.current?.playLayerSwitch(2);
                  setLayer(2);
                }}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-200 ${
                  layer === 2
                    ? 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Radio className="w-4 h-4" />
                <span>Layer 2 — Signal Network</span>
              </button>
            </div>
          </div>

          {/* 3. TOP-RIGHT: SPATIAL AUDIO TOGGLE + RESET CAMERA PILL BUTTONS */}
          <div className="pointer-events-none absolute top-4 right-4 z-20 flex items-center gap-2">
            <button
              onClick={handleToggleAudio}
              title={isAudioMuted ? 'Unmute 3D Spatial Audio' : 'Mute 3D Spatial Audio'}
              className={`pointer-events-auto backdrop-blur-md border px-3.5 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-2xl transition-all ${
                !isAudioMuted && isAudioUnlocked
                  ? 'bg-slate-950/85 hover:bg-slate-900 border-cyan-400/40 text-cyan-300'
                  : 'bg-slate-950/80 hover:bg-slate-900 border-white/15 text-slate-300'
              }`}
            >
              {!isAudioMuted ? (
                <span className="flex items-end gap-0.5 h-3.5">
                  <span
                    className={`w-0.5 bg-cyan-400 rounded-full transition-all ${
                      isAudioUnlocked ? 'h-3 animate-pulse' : 'h-1.5'
                    }`}
                  />
                  <span
                    className={`w-0.5 bg-cyan-400 rounded-full transition-all ${
                      isAudioUnlocked ? 'h-3.5 animate-bounce' : 'h-2.5'
                    }`}
                  />
                  <span
                    className={`w-0.5 bg-cyan-400 rounded-full transition-all ${
                      isAudioUnlocked ? 'h-2.5 animate-pulse' : 'h-1.5'
                    }`}
                  />
                </span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-500" />
              )}
              <span>
                {isAudioMuted
                  ? 'Audio Muted'
                  : isAudioUnlocked
                  ? '3D Audio Live'
                  : 'Enable 3D Audio'}
              </span>
            </button>

            <button
              onClick={() => handleSelectCameraPreset('overview')}
              className="pointer-events-auto bg-slate-950/80 hover:bg-slate-900 backdrop-blur-md border border-white/15 text-slate-100 px-4 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-2xl transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Reset Camera</span>
            </button>
          </div>

          {/* 4. BOTTOM-LEFT: LEGEND CARD */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-col gap-2">
            <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3.5 shadow-2xl w-52">
              <div className="text-xs font-bold text-white mb-2.5">Legend</div>
              <div className="flex flex-col gap-2 text-xs text-slate-200">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] inline-block shrink-0" />
                  <span>Normal Worker</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] inline-block shrink-0" />
                  <span>Warning</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444] inline-block shrink-0" />
                  <span>Emergency</span>
                </div>
                <div className="flex items-center gap-2.5 pt-0.5">
                  <span className="w-5 h-0.5 bg-cyan-400 shadow-[0_0_6px_#22d3ee] inline-block shrink-0" />
                  <span>Mesh Signal</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 border-b-2 border-dashed border-cyan-400 inline-block shrink-0" />
                  <span>Uplink to Surface</span>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-white/10 text-[10px] text-slate-400 flex items-center justify-between">
                <span
                  className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                    isFlyingKeyActive
                      ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50'
                      : 'bg-white/10 text-amber-300'
                  }`}
                >
                  WASD + Mouse
                </span>
                <span>Free-Fly Camera</span>
              </div>
            </div>
          </div>

          {/* 5. RIGHT-SIDE: VERTICAL "SIMULATE EMERGENCY" CARD */}
          <div className="pointer-events-none absolute bottom-6 right-5 z-20 w-72 sm:w-80">
            <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-white/15 rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-sm font-bold text-white">Simulate Emergency</span>
                </div>
                {activeScenario && (
                  <button
                    onClick={handleResetSimulation}
                    className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 flex items-center gap-1 bg-cyan-500/15 px-2 py-0.5 rounded-full border border-cyan-400/30"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                {[
                  {
                    key: 'fall',
                    title: 'Motion / Fall',
                    code: 'MPU6050',
                    icon: Activity,
                    badgeBg: 'bg-red-500/20 border-red-500/40 text-red-400'
                  },
                  {
                    key: 'biometric',
                    title: 'Heart Rate / SpO₂',
                    code: 'MAX30102',
                    icon: Heart,
                    badgeBg: 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                  },
                  {
                    key: 'temperature',
                    title: 'Temperature',
                    code: 'DS18B20',
                    icon: Thermometer,
                    badgeBg: 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                  },
                  {
                    key: 'gas',
                    title: 'Air-Quality / Gas',
                    code: 'MQ-135',
                    icon: Wind,
                    badgeBg: 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                  }
                ].map((item) => {
                  const IconComponent = item.icon;
                  const isSelected = activeScenarioKey === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleTriggerScenario(item.key)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all duration-150 text-left ${
                        isSelected
                          ? 'bg-slate-900/95 border-cyan-400/70 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                          : 'bg-slate-900/65 hover:bg-slate-900 border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 ${item.badgeBg}`}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white leading-tight">
                            {item.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {item.code}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                            : 'bg-slate-800/80 text-cyan-400 border-cyan-500/30'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* FLOATING POPUP CONTROLLER BUTTON (FLOAT)                      */}
      {/* ============================================================ */}
      {!isControllerOpen ? (
        <div
          className={`fixed z-40 transition-all ${
            effectiveIsMobile
              ? 'bottom-5 right-5'
              : 'bottom-6 right-[300px] sm:right-[340px]'
          }`}
        >
          <button
            onClick={() => setIsControllerOpen(true)}
            aria-label="Open Navigation Controller"
            className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-slate-950/90 hover:bg-slate-900 border-2 border-cyan-400/70 text-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.55)] backdrop-blur-xl transition-all duration-300 active:scale-95"
          >
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500 border-2 border-slate-950"></span>
            </span>
            <Gamepad2 className="w-7 h-7 text-cyan-300 group-hover:scale-110 transition-transform" />
            <span className="sr-only">Open Controller</span>
          </button>
        </div>
      ) : (
        /* POPPED-UP NAVIGATION CONTROLLER */
        <div
          className={`fixed z-40 w-[290px] sm:w-[315px] bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/40 rounded-2xl p-3.5 shadow-[0_12px_45px_rgba(0,0,0,0.92)] text-white select-none animate-in fade-in zoom-in-95 duration-150 ${
            effectiveIsMobile
              ? 'bottom-4 right-4'
              : 'bottom-6 right-[300px] sm:right-[340px]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-cyan-300">
                  Mine Navigator
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  {gyroEnabled ? '360° Gyro Steering' : '360° Touch Steering'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const nextBoost = !isBoostActive;
                  setIsBoostActive(nextBoost);
                  virtualNavRef.current.boost = nextBoost;
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                  isBoostActive
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/40'
                    : 'bg-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>{isBoostActive ? '2x' : '1x'}</span>
              </button>

              <button
                onClick={() => {
                  handleStopAllNav();
                  setIsControllerOpen(false);
                }}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close Controller"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* D-Pad & Elevation Controls */}
          <div className="flex items-center justify-between gap-2.5 mb-2.5">
            {/* Tactical D-Pad */}
            <div className="relative w-36 h-36 bg-slate-900/80 rounded-2xl border border-white/10 p-1 flex items-center justify-center shadow-inner">
              {/* Forward */}
              <button
                onPointerDown={() => handleVirtualNavDown('forward')}
                onPointerUp={() => handleVirtualNavUp('forward')}
                onPointerLeave={() => handleVirtualNavUp('forward')}
                onPointerCancel={() => handleVirtualNavUp('forward')}
                className="absolute top-1.5 w-11 h-10 rounded-xl bg-cyan-950/70 active:bg-cyan-500 hover:bg-cyan-900/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300 active:text-slate-950 active:scale-95 transition-all shadow-md"
                title="Forward"
              >
                <ArrowUp className="w-5 h-5" />
              </button>

              {/* Backward */}
              <button
                onPointerDown={() => handleVirtualNavDown('backward')}
                onPointerUp={() => handleVirtualNavUp('backward')}
                onPointerLeave={() => handleVirtualNavUp('backward')}
                onPointerCancel={() => handleVirtualNavUp('backward')}
                className="absolute bottom-1.5 w-11 h-10 rounded-xl bg-cyan-950/70 active:bg-cyan-500 hover:bg-cyan-900/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300 active:text-slate-950 active:scale-95 transition-all shadow-md"
                title="Backward"
              >
                <ArrowDown className="w-5 h-5" />
              </button>

              {/* Left Strafe */}
              <button
                onPointerDown={() => handleVirtualNavDown('left')}
                onPointerUp={() => handleVirtualNavUp('left')}
                onPointerLeave={() => handleVirtualNavUp('left')}
                onPointerCancel={() => handleVirtualNavUp('left')}
                className="absolute left-1.5 w-10 h-11 rounded-xl bg-cyan-950/70 active:bg-cyan-500 hover:bg-cyan-900/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300 active:text-slate-950 active:scale-95 transition-all shadow-md"
                title="Strafe Left"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {/* Right Strafe */}
              <button
                onPointerDown={() => handleVirtualNavDown('right')}
                onPointerUp={() => handleVirtualNavUp('right')}
                onPointerLeave={() => handleVirtualNavUp('right')}
                onPointerCancel={() => handleVirtualNavUp('right')}
                className="absolute right-1.5 w-10 h-11 rounded-xl bg-cyan-950/70 active:bg-cyan-500 hover:bg-cyan-900/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300 active:text-slate-950 active:scale-95 transition-all shadow-md"
                title="Strafe Right"
              >
                <ArrowRight className="w-5 h-5" />
              </button>

              {/* Center: 180 Turn */}
              <button
                onClick={handleTurn180}
                title="Turn 180°"
                className="w-10 h-10 rounded-full bg-slate-800 active:bg-cyan-400 border border-white/20 flex items-center justify-center text-slate-300 active:text-slate-950 text-[10px] font-bold shadow-sm"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Elevation & Recenter */}
            <div className="flex-1 flex flex-col gap-1.5">
              <button
                onPointerDown={() => handleVirtualNavDown('up')}
                onPointerUp={() => handleVirtualNavUp('up')}
                onPointerLeave={() => handleVirtualNavUp('up')}
                onPointerCancel={() => handleVirtualNavUp('up')}
                className="w-full py-2.5 rounded-xl bg-amber-950/60 active:bg-amber-400 hover:bg-amber-900/70 border border-amber-500/40 flex items-center justify-center gap-1 text-amber-300 active:text-slate-950 text-xs font-bold transition-all shadow-md"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Ascend</span>
              </button>

              <button
                onPointerDown={() => handleVirtualNavDown('down')}
                onPointerUp={() => handleVirtualNavUp('down')}
                onPointerLeave={() => handleVirtualNavUp('down')}
                onPointerCancel={() => handleVirtualNavUp('down')}
                className="w-full py-2.5 rounded-xl bg-amber-950/60 active:bg-amber-400 hover:bg-amber-900/70 border border-amber-500/40 flex items-center justify-center gap-1 text-amber-300 active:text-slate-950 text-xs font-bold transition-all shadow-md"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Descend</span>
              </button>

              <button
                onClick={handleRecenter}
                className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 active:bg-cyan-400 active:text-slate-950 border border-white/15 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
              >
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>Recenter</span>
              </button>
            </div>
          </div>

          {/* Fast Teleport Jumps */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-1 text-[10px]">
            <span className="text-slate-400 font-mono text-[9px] uppercase">Jump:</span>
            <button
              onClick={() => handleSelectCameraPreset('overview')}
              className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                activePresetName === 'overview'
                  ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50'
                  : 'bg-white/5 hover:bg-white/15 text-slate-200'
              }`}
            >
              Main
            </button>
            <button
              onClick={() => handleSelectCameraPreset('surface')}
              className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                activePresetName === 'surface'
                  ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50'
                  : 'bg-white/5 hover:bg-white/15 text-slate-200'
              }`}
            >
              Surface
            </button>
            <button
              onClick={() => moveCameraTo([-1.8, 3.2, 13.5], [-1.8, 2.5, 0.4], 'l1')}
              className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                activePresetName === 'l1'
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50'
                  : 'bg-white/5 hover:bg-white/15 text-amber-400'
              }`}
            >
              L1
            </button>
            <button
              onClick={() => moveCameraTo([0.5, -1.8, 13.5], [0.5, -2.4, 0.4], 'l2')}
              className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                activePresetName === 'l2'
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50'
                  : 'bg-white/5 hover:bg-white/15 text-amber-400'
              }`}
            >
              L2
            </button>
            <button
              onClick={() => moveCameraTo([0.5, -6.8, 13.5], [0.5, -7.2, 0.4], 'l3')}
              className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                activePresetName === 'l3'
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50'
                  : 'bg-white/5 hover:bg-white/15 text-amber-400'
              }`}
            >
              L3
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
