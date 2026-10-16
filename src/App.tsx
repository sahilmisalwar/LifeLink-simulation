import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Shield,
  Radio,
  AlertTriangle,
  RotateCcw,
  Compass,
  Layers,
  Zap,
  Gamepad2,
  Smartphone,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCw
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

interface WorkerConfig {
  id: string;
  name: string;
  role: string;
  level: number;
  zone: string;
  basePos: [number, number, number];
  activity: string;
  suitColor: number;
  helmetColor: number;
}

const WORKER_CONFIGS: WorkerConfig[] = [
  {
    id: 'W-101',
    name: 'M. Vance',
    role: 'Tunnel Patrol & Tool Carrier',
    level: 1,
    zone: 'Level 1 — Upper West Drift (-45m)',
    basePos: [-6.5, 3.05, 0.75],
    activity: 'walk',
    suitColor: 0xd97706,
    helmetColor: 0xfbbf24
  },
  {
    id: 'W-102',
    name: 'E. Rostova',
    role: 'Wall & Bolt Inspector',
    level: 1,
    zone: 'Level 1 — Upper East Drift (-45m)',
    basePos: [6.5, 3.05, 0.65],
    activity: 'inspect_wall',
    suitColor: 0xea580c,
    helmetColor: 0xfbbf24
  },
  {
    id: 'W-103',
    name: 'D. Kalu',
    role: 'Haulage Supervisor',
    level: 2,
    zone: 'Level 2 — Mid Extraction Drift (-95m)',
    basePos: [-5.8, -3.95, 0.75],
    activity: 'comm_left',
    suitColor: 0xd97706,
    helmetColor: 0xf59e0b
  },
  {
    id: 'W-104',
    name: 'S. Chen',
    role: 'Relay & Track Tech',
    level: 2,
    zone: 'Level 2 — Central Junction (-95m)',
    basePos: [-2.6, -3.95, 0.75],
    activity: 'comm_right',
    suitColor: 0xea580c,
    helmetColor: 0xfbbf24
  },
  {
    id: 'W-105',
    name: 'J. Morales',
    role: 'Excavation Drill Operator',
    level: 3,
    zone: 'Level 3 — Deep Excavation Face (-145m)',
    basePos: [8.0, -10.95, 0.75],
    activity: 'operate_drill',
    suitColor: 0xd97706,
    helmetColor: 0xf59e0b
  },
  {
    id: 'W-106',
    name: 'A. Lindqvist',
    role: 'Deep Ventilation Inspector',
    level: 3,
    zone: 'Level 3 — Deep West Chamber (-145m)',
    basePos: [-4.5, -10.95, 0.75],
    activity: 'inspect_gas',
    suitColor: 0xea580c,
    helmetColor: 0xfbbf24
  }
];

interface ScenarioDef {
  id: string;
  sensorCode: string;
  title: string;
  category: string;
  description: string;
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
    title: 'Motion / Fall Detection',
    category: 'FALL / IMPACT DETECTED',
    description: 'Simulated 6-axis accelerometer & gyroscope impact event followed by worker immobility.',
    targetWorkerId: 'W-101',
    severity: 'critical',
    colorHex: '#ef4444',
    colorInt: 0xef4444,
    level: 1,
    routeNodes: ['W-101', 'R-L1', 'GW-SURF', 'SURV-ROOM']
  },
  biometric: {
    id: 'biometric',
    sensorCode: 'MAX30102',
    title: 'Heart Rate & SpO₂',
    category: 'BIOMETRIC ANOMALY (HR / SpO₂)',
    description: 'Simulated optical pulse oximetry & heart-rate threshold warning during heavy drilling.',
    targetWorkerId: 'W-105',
    severity: 'critical',
    colorHex: '#ef4444',
    colorInt: 0xef4444,
    level: 3,
    routeNodes: ['W-105', 'W-106', 'R-L3', 'R-L2', 'R-L1', 'GW-SURF', 'SURV-ROOM']
  },
  temperature: {
    id: 'temperature',
    sensorCode: 'DS18B20',
    title: 'Temperature Warning',
    category: 'THERMAL THRESHOLD EXCEEDED',
    description: 'Simulated digital thermal probe warning indicating elevated ambient/helmet temperature.',
    targetWorkerId: 'W-102',
    severity: 'warning',
    colorHex: '#f59e0b',
    colorInt: 0xf59e0b,
    level: 1,
    routeNodes: ['W-102', 'W-101', 'R-L1', 'GW-SURF', 'SURV-ROOM']
  },
  gas: {
    id: 'gas',
    sensorCode: 'MQ-135',
    title: 'Air-Quality / Gas Anomaly',
    category: 'AIR-QUALITY / GAS ANOMALY',
    description: 'Simulated MQ-135 air-quality sensor anomaly inside the deep excavation drift.',
    targetWorkerId: 'W-106',
    severity: 'warning',
    colorHex: '#f59e0b',
    colorInt: 0xf59e0b,
    level: 3,
    routeNodes: ['W-106', 'R-L3', 'R-L2', 'R-L1', 'GW-SURF', 'SURV-ROOM']
  }
};

const INFRA_NODES: Record<string, [number, number, number]> = {
  'R-L1': [-12.6, 5.4, 1.2],
  'R-L2': [-12.6, -1.6, 1.2],
  'R-L3': [-12.6, -8.6, 1.2],
  'GW-SURF': [2.7, 14.85, 0.6],
  'SURV-ROOM': [12.5, 12.5, 0.4]
};

const MESH_LINKS = [
  { from: 'W-102', to: 'W-101', type: 'peer' },
  { from: 'W-101', to: 'R-L1', type: 'relay' },
  { from: 'W-104', to: 'W-103', type: 'peer' },
  { from: 'W-103', to: 'R-L2', type: 'relay' },
  { from: 'W-105', to: 'W-106', type: 'peer' },
  { from: 'W-106', to: 'R-L3', type: 'relay' },
  { from: 'W-102', to: 'W-104', type: 'cross' },
  { from: 'W-104', to: 'W-105', type: 'cross' },
  { from: 'R-L3', to: 'R-L2', type: 'trunk' },
  { from: 'R-L2', to: 'R-L1', type: 'trunk' },
  { from: 'R-L1', to: 'GW-SURF', type: 'trunk' },
  { from: 'GW-SURF', to: 'SURV-ROOM', type: 'surface' }
];

const CAMERA_PRESETS: Record<string, { position: [number, number, number]; target: [number, number, number]; label: string }> = {
  overview: {
    position: [0, 1.5, 34.0],
    target: [0, -1.2, 0.5],
    label: 'Cross-Section'
  },
  surface: {
    position: [9.5, 13.8, 13.5],
    target: [10.5, 11.8, 0],
    label: 'Surveillance Room'
  },
  underground: {
    position: [0.5, -3.2, 20.5],
    target: [0.5, -4.2, 0.5],
    label: 'Deep Tunnels'
  }
};

function drawSurveillanceWallScreen(
  ctx: CanvasRenderingContext2D | null,
  width: number,
  height: number,
  scenario: ScenarioDef | null,
  alertStage: number,
  layer: number
) {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  const isEmergency = Boolean(scenario);
  const isVerified = Boolean(scenario && alertStage >= 2);

  // Background fill
  ctx.fillStyle = isEmergency
    ? isVerified
      ? '#28080d'
      : '#291805'
    : '#061222';
  ctx.fillRect(0, 0, width, height);

  // Subtle technological grid
  ctx.strokeStyle = isEmergency ? 'rgba(239,68,68,0.12)' : 'rgba(34,211,238,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = isEmergency
    ? isVerified
      ? '#ef4444'
      : '#f59e0b'
    : '#0ea5e9';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, width - 8, height - 8);

  // Top Header Bar
  ctx.fillStyle = isEmergency ? 'rgba(239,68,68,0.22)' : 'rgba(14,165,233,0.16)';
  ctx.fillRect(12, 12, width - 24, 62);

  // Status Dot
  ctx.beginPath();
  ctx.arc(42, 43, 11, 0, Math.PI * 2);
  ctx.fillStyle = isEmergency ? (isVerified ? '#ef4444' : '#f59e0b') : '#10b981';
  ctx.fill();

  // Header Title
  ctx.font = 'bold 25px monospace';
  ctx.fillStyle = '#e0f2fe';
  ctx.fillText('LIFELINK SURFACE SURVEILLANCE WALL • MINE TELEMETRY', 68, 51);

  // Right Status Pill in Header
  ctx.font = 'bold 21px monospace';
  ctx.fillStyle = isEmergency ? '#fecaca' : '#67e8f9';
  const statusText = isEmergency
    ? isVerified
      ? 'ALERT VERIFIED'
      : 'INCOMING UPLINK...'
    : `MESH ONLINE • L${layer}`;
  ctx.fillText(statusText, width - 285, 50);

  if (scenario) {
    const targetWorker = WORKER_CONFIGS.find((w) => w.id === scenario.targetWorkerId);

    // Left Box: Affected Worker ID
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(24, 92, 340, 250);
    ctx.strokeStyle = scenario.colorHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 92, 340, 250);

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('AFFECTED WORKER NODE', 44, 132);

    ctx.font = 'bold 68px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(scenario.targetWorkerId, 44, 212);

    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#fcd34d';
    ctx.fillText(targetWorker ? targetWorker.name : '', 44, 258);

    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(targetWorker ? targetWorker.role : '', 44, 292);

    // Right Box: Sensor & Zone Details
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(384, 92, width - 408, 250);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(384, 92, width - 408, 250);

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`SENSOR MODULE: ${scenario.sensorCode} (SIMULATED EVENT)`, 408, 134);

    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(scenario.category, 408, 186);

    ctx.font = '22px monospace';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`ZONE: ${targetWorker ? targetWorker.zone : ''}`, 408, 240);

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = isVerified ? '#4ade80' : '#fde047';
    ctx.fillText(
      `UPLINK ROUTE: ${scenario.routeNodes.join(' -> ')}`,
      408,
      296
    );
  } else {
    // Nominal 6-Worker Status Grid
    const cardW = 152;
    const cardH = 235;
    const startX = 26;
    const gap = 14;

    WORKER_CONFIGS.forEach((w, idx) => {
      const cx = startX + idx * (cardW + gap);
      const cy = 96;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx, cy, cardW, cardH);

      // Green nominal indicator
      ctx.beginPath();
      ctx.arc(cx + 26, cy + 36, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();

      ctx.font = 'bold 28px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(w.id, cx + 45, cy + 46);

      ctx.font = 'bold 19px sans-serif';
      ctx.fillStyle = '#bae6fd';
      ctx.fillText(w.name, cx + 16, cy + 95);

      ctx.font = '18px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`LEVEL ${w.level}`, cx + 16, cy + 138);

      ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
      ctx.fillRect(cx + 16, cy + 172, cardW - 32, 38);
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#34d399';
      ctx.fillText('NOMINAL', cx + 32, cy + 197);
    });
  }

  // Bottom Footer Bar
  ctx.fillStyle = 'rgba(15,23,42,0.9)';
  ctx.fillRect(12, height - 60, width - 24, 46);
  ctx.font = '20px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    'GATEWAY: GW-SURF-01 (SIMULATED MESH)   |   SURFACE CONTROL CENTER ACTIVE',
    32,
    height - 30
  );
}

interface WorkerLabelItem {
  worker: WorkerConfig;
  x: number;
  y: number;
  visible: boolean;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [isSceneReady, setIsSceneReady] = useState(false);
  const [layer, setLayer] = useState(1); // 1 = Mine View, 2 = Signal Network
  const [activeScenarioKey, setActiveScenarioKey] = useState<string | null>(null);
  const [alertStage, setAlertStage] = useState(0); // 0 = nominal, 1 = uplink, 2 = surface room verified
  const [activePresetName, setActivePresetName] = useState('overview');
  const [workerLabels, setWorkerLabels] = useState<WorkerLabelItem[]>([]);
  const [isFlyingKeyActive, setIsFlyingKeyActive] = useState(false);

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

  const requestGyroPermission = async () => {
    if (
      typeof window !== 'undefined' &&
      typeof (window as any).DeviceOrientationEvent !== 'undefined' &&
      typeof (window as any).DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const response = await (window as any).DeviceOrientationEvent.requestPermission();
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

  // Mutable refs shared with the Three.js animation loop
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
    activeScenario: null,
    alertStage: 0,
    networkOpacity: 0,
    cameraGoal: {
      position: new THREE.Vector3(...CAMERA_PRESETS.overview.position),
      target: new THREE.Vector3(...CAMERA_PRESETS.overview.target),
      isTransitioning: false
    },
    needsScreenRedraw: true
  });

  const activeScenario = activeScenarioKey ? SCENARIOS[activeScenarioKey] : null;

  useEffect(() => {
    stateRef.current.layer = layer;
    stateRef.current.activeScenario = activeScenario;
    stateRef.current.alertStage = alertStage;
    stateRef.current.needsScreenRedraw = true;
  }, [layer, activeScenario, alertStage]);

  const moveCameraTo = (posArray: [number, number, number], targetArray: [number, number, number], presetName = 'custom') => {
    const cg = stateRef.current.cameraGoal;
    cg.position.set(...posArray);
    cg.target.set(...targetArray);
    cg.isTransitioning = true;
    setActivePresetName(presetName);
  };

  const handleSelectCameraPreset = (presetKey: string) => {
    const preset = CAMERA_PRESETS[presetKey];
    if (preset) {
      moveCameraTo(preset.position, preset.target, presetKey);
    }
  };

  const handleFocusWorker = (worker: WorkerConfig) => {
    const [wx, wy] = worker.basePos;
    moveCameraTo([wx, wy + 1.6, 11.5], [wx, wy + 1.0, 0.7], 'custom');
  };

  const handleTriggerScenario = (scenarioKey: string) => {
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) return;

    setActiveScenarioKey(scenarioKey);
    setAlertStage(1);

    const targetWorker = WORKER_CONFIGS.find((w) => w.id === scenario.targetWorkerId);
    if (targetWorker) {
      const [wx, wy] = targetWorker.basePos;
      moveCameraTo([wx * 0.75, wy + 1.8, 16.5], [wx * 0.65, wy + 0.9, 0.7], 'custom');
    }
  };

  useEffect(() => {
    if (!activeScenarioKey) {
      setAlertStage(0);
      return;
    }
    const timer = setTimeout(() => {
      setAlertStage(2);
      moveCameraTo([1.2, 2.0, 33.5], [1.0, -0.5, 0.5], 'overview');
    }, 2200);

    return () => clearTimeout(timer);
  }, [activeScenarioKey]);

  const handleResetSimulation = () => {
    setActiveScenarioKey(null);
    setAlertStage(0);
    handleSelectCameraPreset('overview');
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c192c);
    scene.fog = new THREE.FogExp2(0x0c192c, 0.0085);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 220);
    camera.position.set(...CAMERA_PRESETS.overview.position);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Atmospheric Sky Backdrop & Sun Disc
    const skyGeo = new THREE.SphereGeometry(95, 32, 24);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x1e3a5f,
      side: THREE.BackSide
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);

    const horizonGeo = new THREE.PlaneGeometry(140, 42);
    const horizonMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28
    });
    const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
    horizonMesh.position.set(0, 22, -22);
    scene.add(horizonMesh);

    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    sunMesh.position.set(24, 26, -18);
    scene.add(sunMesh);

    // Scene Lighting
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.65);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.55);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.55);
    dirLight.position.set(22, 32, 24);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.left = -26;
    dirLight.shadow.camera.right = 26;
    dirLight.shadow.camera.top = 26;
    dirLight.shadow.camera.bottom = -26;
    scene.add(dirLight);

    const cloudsGroup = new THREE.Group();
    const cloudDefs = [
      { pos: [-18, 21.5, -8], scale: 1.25, speed: 0.35 },
      { pos: [-2, 23.5, -10], scale: 1.55, speed: 0.28 },
      { pos: [14, 21.0, -7], scale: 1.2, speed: 0.42 },
      { pos: [25, 23.0, -11], scale: 1.35, speed: 0.31 }
    ];
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.95,
      transparent: true,
      opacity: 0.88
    });
    cloudDefs.forEach((cd) => {
      const cGroup = new THREE.Group();
      cGroup.position.set(...cd.pos as [number, number, number]);
      cGroup.scale.setScalar(cd.scale);
      const s1 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 14), cloudMat);
      const s2 = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 14), cloudMat);
      s2.position.set(1.35, -0.2, 0.25);
      const s3 = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 14), cloudMat);
      s3.position.set(-1.25, -0.25, -0.2);
      cGroup.add(s1, s2, s3);
      cloudsGroup.add(cGroup);
    });
    scene.add(cloudsGroup);

    const addPineTree = (x: number, y: number, z: number, scale = 1) => {
      const tree = new THREE.Group();
      tree.position.set(x, y, z);
      tree.scale.setScalar(scale);
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
      );
      trunk.position.y = 0.4;
      const c1 = new THREE.Mesh(
        new THREE.ConeGeometry(0.75, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.85 })
      );
      c1.position.y = 1.1;
      const c2 = new THREE.Mesh(
        new THREE.ConeGeometry(0.58, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a7033, roughness: 0.85 })
      );
      c2.position.y = 1.75;
      const c3 = new THREE.Mesh(
        new THREE.ConeGeometry(0.38, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x478540, roughness: 0.85 })
      );
      c3.position.y = 2.25;
      tree.add(trunk, c1, c2, c3);
      scene.add(tree);
    };
    addPineTree(-8.8, 10.0, 2.2, 0.9);
    addPineTree(-6.4, 10.0, 2.6, 0.75);
    addPineTree(-3.2, 10.0, -2.2, 1.05);
    addPineTree(6.8, 10.0, 2.5, 0.85);

    const headframeGroup = new THREE.Group();
    headframeGroup.position.set(-14.0, 10.0, 0);
    scene.add(headframeGroup);

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.6,
      roughness: 0.4
    });

    const collarBase = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.5, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 })
    );
    collarBase.position.set(0, 0.25, 0);
    headframeGroup.add(collarBase);

    [
      [-1.3, 3.2, -1.1],
      [1.3, 3.2, -1.1],
      [-1.3, 3.2, 1.1],
      [1.3, 3.2, 1.1]
    ].forEach((pos) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.4, 0.22), steelMat);
      leg.position.set(...pos as [number, number, number]);
      headframeGroup.add(leg);
    });

    [-0.8, 0.8].forEach((z) => {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6.2, 0.2), steelMat);
      brace.position.set(-2.4, 2.8, z);
      brace.rotation.z = -0.36;
      headframeGroup.add(brace);
    });
    [2.0, 4.0, 6.0].forEach((y) => {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 2.5), steelMat);
      plat.position.set(0, y, 0);
      headframeGroup.add(plat);
    });
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.28, 2.8),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
    );
    crown.position.set(0, 6.4, 0);
    headframeGroup.add(crown);

    const createSheaveWheel = (radius: number, colorHex: number) => {
      const wg = new THREE.Group();
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.08, 12, 24),
        new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.7, roughness: 0.3 })
      );
      wg.add(rim);
      for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, radius * 1.95, 6),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 })
        );
        spoke.rotation.z = (i * Math.PI) / 4;
        wg.add(spoke);
      }
      return wg;
    };
    const wheelTop = createSheaveWheel(0.75, 0xf59e0b);
    wheelTop.position.set(0, 6.9, 0.35);
    const wheelMid = createSheaveWheel(0.6, 0xeab308);
    wheelMid.position.set(0.5, 5.4, -0.35);
    headframeGroup.add(wheelTop, wheelMid);

    // Surface Ventilation Shed + Rotating Fan
    const shedGroup = new THREE.Group();
    shedGroup.position.set(-3.5, 1.1, 0);
    const shedBox = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.0, 2.8),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7, metalness: 0.3 })
    );
    shedGroup.add(shedBox);
    const surfaceFanGroup = new THREE.Group();
    surfaceFanGroup.position.set(0, 0.2, 1.48);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.16, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
      );
      blade.rotation.z = (b * Math.PI) / 3;
      surfaceFanGroup.add(blade);
    }
    shedGroup.add(surfaceFanGroup);
    headframeGroup.add(shedGroup);

    // Hoist Cable & Descending Elevator Cage
    const hoistCable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 23.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8 })
    );
    hoistCable.position.set(0, -5.0, 0.35);
    headframeGroup.add(hoistCable);

    const elevatorCage = new THREE.Group();
    elevatorCage.position.set(0, -15.0, 0.35);
    const cageMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 2.1, 1.4),
      new THREE.MeshStandardMaterial({
        color: 0xb45309,
        metalness: 0.5,
        roughness: 0.5,
        transparent: true,
        opacity: 0.88
      })
    );
    const cageLight = new THREE.PointLight(0xfde68a, 0.8, 4.5);
    cageLight.position.set(0, 0.3, 0.4);
    elevatorCage.add(cageMesh, cageLight);
    headframeGroup.add(elevatorCage);

    // Shaft Relay Nodes (R-L1, R-L2, R-L3)
    [-4.6, -11.6, -18.6].forEach((ry) => {
      const rGroup = new THREE.Group();
      rGroup.position.set(1.4, ry, 1.2);
      const rBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.6, 0.32),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 })
      );
      const ledMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
      const rLed = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), ledMat);
      rLed.position.set(0, 0, 0.2);
      rGroup.add(rBox, rLed);
      headframeGroup.add(rGroup);
    });

    const gatewayGroup = new THREE.Group();
    gatewayGroup.position.set(2.5, 10.0, 0.6);
    scene.add(gatewayGroup);

    const gwPad = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.4, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 })
    );
    gwPad.position.y = 0.2;
    const gwMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.24, 4.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.75, roughness: 0.25 })
    );
    gwMast.position.set(0.2, 2.5, 0);

    const gwBeaconMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const gwBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), gwBeaconMat);
    gwBeacon.position.set(0.2, 4.85, 0);

    const gwWaveMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    const gwWaveRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 32), gwWaveMat);
    gwWaveRing.position.set(0.2, 4.85, 0);
    gwWaveRing.rotation.x = Math.PI / 2;

    gatewayGroup.add(gwPad, gwMast, gwBeacon, gwWaveRing);

    // 3D Surface Surveillance Room
    const survRoomGroup = new THREE.Group();
    survRoomGroup.position.set(12.5, 10.0, 0);
    scene.add(survRoomGroup);

    const roomPad = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 0.4, 4.8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 })
    );
    roomPad.position.y = 0.2;
    const roomFloor = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 0.12, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
    );
    roomFloor.position.y = 0.45;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.3
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(8.0, 3.8, 0.25), wallMat);
    backWall.position.set(0, 2.35, -2.0);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 4.2), wallMat);
    leftWall.position.set(-3.9, 2.35, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 4.2), wallMat);
    rightWall.position.set(3.9, 2.35, 0);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 0.28, 4.8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })
    );
    roof.position.set(0, 4.35, 0.1);
    roof.rotation.x = 0.06;

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.8, 0.18), pillarMat);
    leftPillar.position.set(-3.9, 2.35, 2.05);
    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.8, 0.18), pillarMat);
    rightPillar.position.set(3.9, 2.35, 2.05);

    survRoomGroup.add(roomPad, roomFloor, backWall, leftWall, rightWall, roof, leftPillar, rightPillar);

    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 1024;
    screenCanvas.height = 420;
    const screenCtx = screenCanvas.getContext('2d');
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;

    const screenBezel = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 2.4, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.8, roughness: 0.2 })
    );
    screenBezel.position.set(0.3, 2.55, -1.82);

    const screenDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(5.38, 2.2),
      new THREE.MeshBasicMaterial({ map: screenTexture })
    );
    screenDisplay.position.set(0.3, 2.55, -1.75);
    survRoomGroup.add(screenBezel, screenDisplay);

    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.75, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5 })
    );
    desk.position.set(0.2, 0.9, 0.3);
    survRoomGroup.add(desk);

    const deskScreenMats: THREE.MeshBasicMaterial[] = [];
    [-1.3, 0, 1.3].forEach((dx) => {
      const mFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.48, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x0f172a })
      );
      mFrame.position.set(0.2 + dx, 1.52, 0.15);
      const dmMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
      deskScreenMats.push(dmMat);
      const mFace = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.4), dmMat);
      mFace.position.set(0.2 + dx, 1.52, 0.19);
      survRoomGroup.add(mFrame, mFace);
    });

    const createOperator = (shirtColor: number, x: number, z: number) => {
      const op = new THREE.Group();
      op.position.set(x, 0.65, z);
      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.68, 0.28),
        new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.6 })
      );
      torso.position.y = 0.58;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xfdba74, roughness: 0.6 })
      );
      head.position.y = 1.08;
      op.add(torso, head);
      return op;
    };
    const op1 = createOperator(0x1d4ed8, -0.9, 1.05);
    const op2 = createOperator(0x0f766e, 1.1, 1.1);
    survRoomGroup.add(op1, op2);

    const survRoomLight = new THREE.PointLight(0x38bdf8, 1.2, 9);
    survRoomLight.position.set(0, 3.7, 0.2);
    survRoomGroup.add(survRoomLight);

    const addStrataBlock = (x: number, y: number, z: number, w: number, h: number, d: number, colorHex: number) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 })
      );
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };

    // Helper that creates a horizontal strata band across x = [-19, 19] with a gap for the vertical shaft (x = [-15.8, -12.2])
    const addCutawayStrataLayer = (yBottom: number, yTop: number, colorHex: number, extraGapRange: [number, number] | null = null) => {
      const h = yTop - yBottom;
      const yCenter = (yBottom + yTop) / 2;
      // Left of Vertical Shaft: x from -19.0 to -15.8
      addStrataBlock(-17.4, yCenter, -0.5, 3.2, h, 5.4, colorHex);

      // Right of Vertical Shaft: x from -12.2 to +19.0
      if (!extraGapRange) {
        addStrataBlock(3.4, yCenter, -0.5, 31.2, h, 5.4, colorHex);
      } else {
        const [gx1, gx2] = extraGapRange;
        const leftW = gx1 - -12.2;
        if (leftW > 0.1) {
          addStrataBlock(-12.2 + leftW / 2, yCenter, -0.5, leftW, h, 5.4, colorHex);
        }
        const rightW = 19.0 - gx2;
        if (rightW > 0.1) {
          addStrataBlock(gx2 + rightW / 2, yCenter, -0.5, rightW, h, 5.4, colorHex);
        }
      }
    };

    // 1. Back Wall behind the entire underground cutaway (z = -3.2 to -1.6) so tunnels have rock behind them, NEVER in front
    addStrataBlock(0, -1.5, -2.4, 38.0, 23.0, 1.6, 0x1c1917);

    // 2. Left & Right Outer Rock Pillars framing the tunnels (leaving x = -12.2 to +15.2 completely open for tunnels)
    addStrataBlock(-17.4, -2.0, -0.5, 3.2, 24.0, 5.4, 0x292524);
    addStrataBlock(17.1, -4.0, -0.5, 3.8, 18.0, 5.4, 0x292524);

    // 3. Strata Band above Level 1 Tunnel (y = 6.55 to 10.0) — completely above the tunnel ceiling!
    addCutawayStrataLayer(9.45, 10.0, 0x3f6212); // Surface Grass & Sod
    addCutawayStrataLayer(8.1, 9.45, 0x78350f); // Topsoil & Loam
    addCutawayStrataLayer(6.55, 8.1, 0x92400e); // Upper Ochre Sandstone

    // 4. Strata Band between Level 1 Floor (y = 2.95) and Level 2 Ceiling (y = -0.45)
    // Includes a vertical ventilation/manway raise gap at x = [1.8, 3.4]
    addCutawayStrataLayer(1.25, 2.95, 0x78350f, [1.8, 3.4]);
    addCutawayStrataLayer(-0.45, 1.25, 0x57534e, [1.8, 3.4]);

    // 5. Strata Band between Level 2 Floor (y = -4.05) and Level 3 Ceiling (y = -7.45)
    // Includes a vertical winze raise gap at x = [-3.8, -2.2]
    addCutawayStrataLayer(-5.75, -4.05, 0x44403c, [-3.8, -2.2]);
    addCutawayStrataLayer(-7.45, -5.75, 0x3f3f46, [-3.8, -2.2]);

    // 6. Deep Bedrock Base below Level 3 Floor (y = -13.5 to -11.05)
    addStrataBlock(0, -12.3, -0.5, 38.0, 2.5, 5.4, 0x18181b);

    // 7. Vertical Main Shaft Dark Interior Backing & Guide Rails (x = -14.0)
    const shaftBack = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 21.2, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.95 })
    );
    shaftBack.position.set(-14.0, -0.6, -1.4);
    scene.add(shaftBack);

    [-15.5, -12.5].forEach((sx) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 21.0, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 })
      );
      rail.position.set(sx, -0.6, 0.35);
      scene.add(rail);
    });

    // Inter-level Ladders inside the connecting vertical winzes
    const buildWinzeLadder = (wx: number, yStart: number, yEnd: number) => {
      const h = yEnd - yStart;
      const wg = new THREE.Group();
      wg.position.set(wx, (yStart + yEnd) / 2, 0.2);
      const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 });
      [-0.25, 0.25].forEach((lx) => {
        const sRail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 6), railMat);
        sRail.position.x = lx;
        wg.add(sRail);
      });
      const rungs = Math.floor(h / 0.45);
      for (let i = 0; i < rungs; i++) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), railMat);
        rung.rotation.z = Math.PI / 2;
        rung.position.y = -h / 2 + 0.25 + i * 0.45;
        wg.add(rung);
      }
      scene.add(wg);
    };
    buildWinzeLadder(2.6, -0.45, 2.95);
    buildWinzeLadder(-3.0, -7.45, -4.05);

    const tunnelPointLights: Record<number, THREE.PointLight[]> = { 1: [], 2: [], 3: [] };
    const tunnelFans: THREE.Group[] = [];

    const buildTunnelLevel = (levelNum: number, centerY: number, beamColor: number) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(0, centerY, 0.5);
      scene.add(tGroup);

      // Tunnel Back Wall (only at the back, NEVER blocking the front cutaway!)
      const backWallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(27.8, 3.4, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 0.95 })
      );
      backWallMesh.position.set(1.5, 0, -1.85);

      // Tunnel Floor Slab
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(27.8, 0.22, 3.6),
        new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.85 })
      );
      floor.position.set(1.5, -1.72, -0.1);
      floor.receiveShadow = true;

      // Tunnel Ceiling Slab
      const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(27.8, 0.18, 3.6),
        new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 })
      );
      ceiling.position.set(1.5, 1.72, -0.1);

      tGroup.add(backWallMesh, floor, ceiling);

      // Support Arches (Recessed & Thin so they frame the tunnel without hiding workers)
      const archMat = new THREE.MeshStandardMaterial({ color: beamColor, roughness: 0.75 });
      [-10.5, -6.0, -1.5, 3.0, 7.5, 12.0].forEach((ax) => {
        const topBeam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 3.4), archMat);
        topBeam.position.set(ax, 1.55, -0.1);
        const backPost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.3, 0.22), archMat);
        backPost.position.set(ax, 0, -1.65);
        tGroup.add(topBeam, backPost);
      });

      // Underground Rotating Booster Fan on Left Shaft Entry
      const uFanGroup = new THREE.Group();
      uFanGroup.position.set(-11.4, 0.85, -1.1);
      const fanHousing = new THREE.Mesh(
        new THREE.TorusGeometry(0.48, 0.08, 10, 20),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 })
      );
      const fanRotor = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.82, 0.14, 0.04),
          new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8 })
        );
        blade.rotation.z = (b * Math.PI) / 3;
        fanRotor.add(blade);
      }
      uFanGroup.add(fanHousing, fanRotor);
      tunnelFans.push(fanRotor);
      tGroup.add(uFanGroup);

      // Overhead Tunnel Lamps & Bright Warm PointLights
      [-9.0, -3.5, 2.0, 7.5, 12.5].forEach((lx) => {
        const lamp = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.28, 0.14, 10),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        lamp.position.set(lx, 1.55, 0.25);
        const pLight = new THREE.PointLight(0xfde68a, 1.65, 10.5);
        pLight.position.set(lx, 1.2, 0.6);
        tunnelPointLights[levelNum].push(pLight);
        tGroup.add(lamp, pLight);
      });

      return tGroup;
    };

    const level1Group = buildTunnelLevel(1, 4.75, 0x92400e);
    const level2Group = buildTunnelLevel(2, -2.25, 0x475569);
    const level3Group = buildTunnelLevel(3, -9.25, 0x334155);

    const ductL1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 25, 12),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.65, roughness: 0.35 })
    );
    ductL1.rotation.z = Math.PI / 2;
    ductL1.position.set(0.5, 1.25, -1.25);
    level1Group.add(ductL1);

    // Level 2 Rail Tracks & Animated Ore Cart
    [-0.55, 0.05].forEach((rz) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(26, 0.06, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
      );
      rail.position.set(1.0, -1.58, rz);
      level2Group.add(rail);
    });
    const oreCartGroup = new THREE.Group();
    oreCartGroup.position.set(2.5, -1.18, -0.25);
    const cartBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.72, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 })
    );
    const oreChunk = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 })
    );
    oreChunk.position.set(0, 0.4, 0);
    oreCartGroup.add(cartBody, oreChunk);
    level2Group.add(oreCartGroup);

    // Level 3 Heavy Excavation Drill Rig
    const drillRigGroup = new THREE.Group();
    drillRigGroup.position.set(11.4, -1.12, 0.15);
    const rigBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.85, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.4, roughness: 0.4 })
    );
    rigBody.position.set(-0.2, 0.15, 0);
    const drillBoom = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.24, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6 })
    );
    drillBoom.position.set(1.35, 0.35, 0);
    drillBoom.rotation.z = -0.12;
    const drillHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.95, 12),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.2 })
    );
    drillHead.rotation.z = -Math.PI / 2;
    drillHead.position.set(2.55, 0.22, 0);
    drillRigGroup.add(rigBody, drillBoom, drillHead);
    level3Group.add(drillRigGroup);

    // MQ-135 Air-Quality / Gas Anomaly Volumetric Warning Haze on Level 3
    const gasHazeMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const gasHazeMesh = new THREE.Mesh(new THREE.BoxGeometry(12.5, 2.9, 2.5), gasHazeMat);
    gasHazeMesh.position.set(-3.5, 0, 0.3);
    level3Group.add(gasHazeMesh);

    // Floating Underground Dust Motes
    const dustCount = 140;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 28;
      dustPositions[i * 3 + 1] = -10.5 + Math.random() * 16.5;
      dustPositions[i * 3 + 2] = 0.2 + Math.random() * 1.8;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0xfde68a, size: 0.14, transparent: true, opacity: 0.45 })
    );
    scene.add(dustPoints);

    const workerRigMap: Record<string, any> = {};
    const workerLiveHelmetPos: Record<string, THREE.Vector3> = {};

    WORKER_CONFIGS.forEach((wc) => {
      const root = new THREE.Group();
      root.position.set(...wc.basePos);
      root.scale.setScalar(1.32); // Scaled for clear cross-section readability
      scene.add(root);

      const bodyGroup = new THREE.Group();
      root.add(bodyGroup);

      const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
      const suitMat = new THREE.MeshStandardMaterial({ color: wc.suitColor, roughness: 0.65 });

      const leftLeg = new THREE.Group();
      leftLeg.position.set(-0.12, 0.55, 0);
      const lLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), legMat);
      lLegMesh.position.y = -0.25;
      leftLeg.add(lLegMesh);

      const rightLeg = new THREE.Group();
      rightLeg.position.set(0.12, 0.55, 0);
      const rLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), legMat);
      rLegMesh.position.y = -0.25;
      rightLeg.add(rLegMesh);

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.24), suitMat);
      torso.position.y = 0.88;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.43, 0.08, 0.25),
        new THREE.MeshBasicMaterial({ color: 0xfde047 })
      );
      stripe.position.y = 0.88;

      const leftArm = new THREE.Group();
      leftArm.position.set(-0.28, 1.1, 0);
      const lArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.46, 0.13), suitMat);
      lArmMesh.position.y = -0.22;
      leftArm.add(lArmMesh);

      const rightArm = new THREE.Group();
      rightArm.position.set(0.28, 1.1, 0);
      const rArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.46, 0.13), suitMat);
      rArmMesh.position.y = -0.22;
      const toolMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.14, 0.26),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      toolMesh.position.set(0, -0.44, 0.12);
      rightArm.add(rArmMesh, toolMesh);

      // Head & Smart Helmet
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.32, 0);
      const faceMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xfdba74, roughness: 0.6 })
      );
      const helmetDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8),
        new THREE.MeshStandardMaterial({ color: wc.helmetColor, metalness: 0.3, roughness: 0.4 })
      );
      helmetDome.position.y = 0.06;

      // Headlamp Cone
      const lightCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.36, 1.25, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      lightCone.rotation.x = -Math.PI / 2;
      lightCone.position.set(0, 0.04, 0.8);

      // Smart Helmet Sensor Node Beacon
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), beaconMat);
      beaconMesh.position.set(0, 0.28, -0.02);

      headGroup.add(faceMesh, helmetDome, lightCone, beaconMesh);
      bodyGroup.add(leftLeg, rightLeg, torso, stripe, leftArm, rightArm, headGroup);

      // Expanding Helmet Wireless Signal Ring
      const pulseRingMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
      });
      const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.35, 28), pulseRingMat);
      pulseRing.position.set(0, 1.52, 0);
      pulseRing.rotation.x = Math.PI / 2;
      root.add(pulseRing);

      // Emergency Danger Aura Sphere
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.0,
        wireframe: true
      });
      const auraMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 16), auraMat);
      auraMesh.position.set(0, 0.9, 0);
      root.add(auraMesh);

      workerRigMap[wc.id] = {
        config: wc,
        root,
        bodyGroup,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        headGroup,
        beaconMat,
        pulseRing,
        pulseRingMat,
        auraMesh,
        auraMat,
        fallProgress: 0
      };
      workerLiveHelmetPos[wc.id] = new THREE.Vector3(
        wc.basePos[0],
        wc.basePos[1] + 2.0,
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
        const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), pMat);
        meshNetworkGroup.add(pMesh);
        return {
          mesh: pMesh,
          mat: pMat,
          offset,
          speed: link.type === 'trunk' ? 0.68 : 0.48
        };
      });

      return {
        ...link,
        line,
        geo,
        mat,
        packets
      };
    });

    let isDragging = false;
    let isPanning = false;
    let prevMouse = { x: 0, y: 0 };
    const currentTarget = new THREE.Vector3(...CAMERA_PRESETS.overview.target);

    // Camera Euler Look Angles (Yaw & Pitch) for Game-Style WASD Free-Fly
    const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const syncEulerFromCamera = () => {
      camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    };
    camera.lookAt(currentTarget);
    syncEulerFromCamera();

    // Track pressed flight keys (W, A, S, D, E/Space, Q/C, Shift)
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
        camera.position.addScaledVector(right, -dx * 0.03);
        camera.position.addScaledVector(up, dy * 0.03);
      } else {
        if (gyroActiveRef.current) {
          // In Gyro mode, horizontal swipe adjusts forward heading calibration offset
          gyroYawOffsetRef.current -= dx * 0.005;
        } else {
          // 360-Degree Panorama Free-Look (steer camera yaw and pitch directly)
          camEuler.y -= dx * 0.0045;
          camEuler.x = THREE.MathUtils.clamp(
            camEuler.x - dy * 0.0045,
            -Math.PI / 2.08,
            Math.PI / 2.08
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
      camera.position.addScaledVector(forward, -e.deltaY * 0.018);
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -45, 45);
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, -20, 36);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, 1.2, 62);
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
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -45, 45);
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, -20, 36);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, 1.2, 62);
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
            : typeof (window as any).orientation === 'number'
            ? (window as any).orientation * degToRad
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

      // Smooth Camera Preset Transitions
      if (cameraGoal.isTransitioning) {
        const step = Math.min(1, delta * 3.2);
        camera.position.lerp(cameraGoal.position, step);
        currentTarget.lerp(cameraGoal.target, step);
        camera.lookAt(currentTarget);
        syncEulerFromCamera();
        if (
          camera.position.distanceTo(cameraGoal.position) < 0.12 &&
          currentTarget.distanceTo(cameraGoal.target) < 0.12
        ) {
          cameraGoal.isTransitioning = false;
        }
      } else {
        // Game-style & Virtual Controller Free-Fly Movement Loop
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

        const vNav = virtualNavRef.current;
        const isSprint =
          keysPressed['ShiftLeft'] ||
          keysPressed['ShiftRight'] ||
          vNav.boost ||
          isBoostActiveRef.current;
        const flySpeed = (isSprint ? 26.0 : 12.5) * delta;

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

        // Keep within generous world bounds while allowing close flight into tunnels
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -45, 45);
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, -20, 36);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, 1.2, 62);
      }

      // Periodic Heading calculation for 360 Panorama indicator (~10fps)
      if (t - lastHeadingSync > 0.1) {
        lastHeadingSync = t;
        const deg = Math.round(((-camEuler.y * 180) / Math.PI) % 360 + 360) % 360;
        setHeadingDegrees(deg);
      }

      // Redraw 3D Surveillance Wall Screen Texture when state changes
      if (stateRef.current.needsScreenRedraw) {
        drawSurveillanceWallScreen(screenCtx, 1024, 420, curScenario, curAlertStage, curLayer);
        screenTexture.needsUpdate = true;
        stateRef.current.needsScreenRedraw = false;
      }

      // Gentle sunlight variation, clouds, headframe wheels, fans, and machinery
      dirLight.position.x = 22 + Math.sin(t * 0.18) * 2.5;
      dirLight.intensity = 1.5 + Math.sin(t * 0.25) * 0.08;

      cloudsGroup.children.forEach((c, idx) => {
        c.position.x += cloudDefs[idx].speed * delta;
        if (c.position.x > 34) c.position.x = -34;
      });
      wheelTop.rotation.z = t * 1.4;
      wheelMid.rotation.z = -t * 1.4;
      surfaceFanGroup.rotation.z += delta * 6.5;
      tunnelFans.forEach((tf) => {
        tf.rotation.z += delta * 7.5;
      });
      elevatorCage.position.y = -11.0 + Math.sin(t * 0.45) * 6.5;
      oreCartGroup.position.x = 1.5 + Math.sin(t * 0.55) * 4.5;
      drillHead.rotation.x += delta * 9.0;

      // Surveillance Room Operators & Alert Lighting
      op1.rotation.y = Math.sin(t * 1.1) * 0.18;
      op2.rotation.y = Math.cos(t * 0.9) * 0.22;
      op2.position.x = 1.1 + Math.sin(t * 0.6) * 0.15;
      survRoomLight.color.setHex(
        curScenario ? (curAlertStage >= 2 ? 0xef4444 : 0xf59e0b) : 0x38bdf8
      );
      survRoomLight.intensity = curScenario ? 1.6 + Math.sin(t * 9) * 0.8 : 1.1;
      deskScreenMats[1].color.setHex(curScenario && curAlertStage >= 2 ? 0xef4444 : 0x0ea5e9);

      // Gateway Beacon & Wave Ring
      const gwColor = curScenario ? curScenario.colorInt : 0x22d3ee;
      gwBeaconMat.color.setHex(gwColor);
      gwWaveMat.color.setHex(gwColor);
      const gwPhase = (t * (curScenario ? 2.2 : 1.1)) % 1;
      gwWaveRing.scale.setScalar(1 + gwPhase * 2.8);
      gwWaveMat.opacity = (1 - gwPhase) * Math.max(netAlpha * 0.7, curScenario ? 0.75 : 0.2);

      // Gas Haze & Tunnel Zone Emergency Lighting
      const targetGasOpacity =
        curScenario?.id === 'gas' ? 0.24 + Math.sin(t * 3.2) * 0.07 : 0.0;
      gasHazeMat.opacity = THREE.MathUtils.lerp(gasHazeMat.opacity, targetGasOpacity, delta * 4);

      [1, 2, 3].forEach((lvl) => {
        const isLvlAlert = curScenario?.level === lvl;
        tunnelPointLights[lvl].forEach((pl, idx) => {
          pl.color.setHex(isLvlAlert ? curScenario.colorInt : 0xfde68a);
          pl.intensity = isLvlAlert
            ? 2.1 + Math.sin(t * 6 + idx) * 0.45
            : 1.65 + Math.sin(t * 1.8 + idx) * 0.08;
        });
      });

      WORKER_CONFIGS.forEach((wc) => {
        const rig = workerRigMap[wc.id];
        const isAffected = curScenario?.targetWorkerId === wc.id;
        const scenId = isAffected ? curScenario.id : null;

        let x = wc.basePos[0];
        let y = wc.basePos[1];
        let z = wc.basePos[2];
        let facingY = 0;

        if (isAffected) {
          if (scenId === 'fall') {
            rig.fallProgress = Math.min(1, rig.fallProgress + delta * 2.1);
            rig.bodyGroup.rotation.z = THREE.MathUtils.lerp(
              0,
              -Math.PI / 2 + 0.15,
              rig.fallProgress
            );
            rig.bodyGroup.position.y = THREE.MathUtils.lerp(0, -0.48, rig.fallProgress);
            facingY = 0.2;
          } else if (scenId === 'biometric') {
            rig.bodyGroup.rotation.x = 0.38;
            rig.bodyGroup.position.y = -0.18;
            rig.rightArm.rotation.x = -0.9;
          } else if (scenId === 'temperature') {
            rig.bodyGroup.rotation.z = Math.sin(t * 3) * 0.08;
            rig.bodyGroup.position.y = -0.06;
          } else if (scenId === 'gas') {
            rig.bodyGroup.rotation.x = 0.28;
            rig.bodyGroup.position.y = -0.12;
          }
        } else {
          rig.fallProgress = 0;
          rig.bodyGroup.rotation.z = THREE.MathUtils.lerp(
            rig.bodyGroup.rotation.z,
            0,
            delta * 5
          );
          rig.bodyGroup.rotation.x = THREE.MathUtils.lerp(
            rig.bodyGroup.rotation.x,
            0,
            delta * 5
          );
          rig.bodyGroup.position.y = THREE.MathUtils.lerp(
            rig.bodyGroup.position.y,
            0,
            delta * 5
          );

          if (wc.activity === 'walk') {
            const walkCycle = t * 0.65;
            x = wc.basePos[0] + Math.sin(walkCycle) * 2.8;
            facingY = Math.cos(walkCycle) >= 0 ? Math.PI / 2 : -Math.PI / 2;
            const stride = Math.sin(t * 4.8) * 0.55;
            rig.leftLeg.rotation.x = stride;
            rig.rightLeg.rotation.x = -stride;
            rig.leftArm.rotation.x = -stride * 0.7;
            rig.rightArm.rotation.x = stride * 0.7;
          } else if (wc.activity === 'inspect_wall') {
            facingY = 0.35 + Math.sin(t * 0.9) * 0.25;
            rig.rightArm.rotation.x = -0.85 + Math.sin(t * 2.6) * 0.25;
            rig.headGroup.rotation.y = Math.sin(t * 1.4) * 0.25;
          } else if (wc.activity === 'comm_left') {
            facingY = Math.PI / 2 - 0.2;
            rig.rightArm.rotation.x = -0.5 + Math.sin(t * 3.1) * 0.3;
          } else if (wc.activity === 'comm_right') {
            facingY = -Math.PI / 2 + 0.2;
            rig.leftArm.rotation.x = -0.6 + Math.cos(t * 2.7) * 0.25;
          } else if (wc.activity === 'operate_drill') {
            facingY = Math.PI / 2;
            rig.leftArm.rotation.x = -0.7 + Math.sin(t * 6.0) * 0.15;
            rig.rightArm.rotation.x = -0.7 + Math.cos(t * 6.0) * 0.15;
          } else if (wc.activity === 'inspect_gas') {
            x = wc.basePos[0] + Math.sin(t * 0.5) * 1.4;
            facingY = Math.cos(t * 0.5) >= 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3;
            const step = Math.sin(t * 3.2) * 0.35;
            rig.leftLeg.rotation.x = step;
            rig.rightLeg.rotation.x = -step;
          }
        }

        rig.root.position.set(x, y, z);
        rig.bodyGroup.rotation.y = facingY;

        const helmetY = isAffected && scenId === 'fall' ? y + 0.6 : y + 2.0;
        workerLiveHelmetPos[wc.id].set(x, helmetY, z);

        // Helmet Beacon & Expanding Pulse Ring
        rig.beaconMat.color.setHex(
          isAffected ? curScenario.colorInt : curLayer === 2 ? 0x22d3ee : 0x10b981
        );
        const phase = (t * (isAffected ? 2.6 : 1.1) + wc.level * 0.3) % 1;
        rig.pulseRing.scale.setScalar(0.3 + phase * (isAffected ? 2.8 : 1.9));
        rig.pulseRingMat.color.setHex(isAffected ? curScenario.colorInt : 0x22d3ee);
        const ringVis = isAffected ? 0.85 : Math.max(0.14, netAlpha * 0.65);
        rig.pulseRingMat.opacity = (1 - phase) * ringVis;

        // Emergency Aura
        rig.auraMat.color.setHex(isAffected ? curScenario.colorInt : 0xef4444);
        rig.auraMat.opacity = isAffected ? 0.24 + Math.sin(t * 6) * 0.08 : 0.0;
        rig.auraMesh.scale.setScalar(1.0 + Math.sin(t * 5) * 0.18);
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
            ? curScenario?.colorInt ?? 0xef4444
            : lo.type === 'trunk' || lo.type === 'surface'
            ? 0x38bdf8
            : 0x22d3ee
        );
        const baseLinkAlpha = lo.type === 'cross' ? 0.35 : 0.72;
        lo.mat.opacity = isAlertPath ? 0.95 : netAlpha * baseLinkAlpha;

        lo.packets.forEach((pkt) => {
          const speedMult = isAlertPath ? 1.85 : 1.0;
          const prog = (t * pkt.speed * speedMult + pkt.offset) % 1;
          pkt.mesh.position.lerpVectors(start, end, prog);
          pkt.mat.color.setHex(isAlertPath ? curScenario?.colorInt ?? 0xef4444 : 0x67e8f9);
          pkt.mat.opacity = isAlertPath ? 1.0 : netAlpha * 0.92;
          pkt.mesh.scale.setScalar(isAlertPath ? 1.45 : 0.95);
        });
      });

      // Project 3D Worker Coordinates to 2D Screen Overlay Labels (~20fps)
      if (t - lastLabelSync > 0.045) {
        lastLabelSync = t;
        const cW = domElem.clientWidth;
        const cH = domElem.clientHeight;
        const projected: WorkerLabelItem[] = WORKER_CONFIGS.map((wc) => {
          const worldPos = workerLiveHelmetPos[wc.id].clone();
          worldPos.y += curScenario?.targetWorkerId === wc.id ? 0.75 : 0.45;
          worldPos.project(camera);
          const sx = (worldPos.x * 0.5 + 0.5) * cW;
          const sy = (-(worldPos.y * 0.5) + 0.5) * cH;
          const visible =
            worldPos.z < 1.0 && sx > 20 && sx < cW - 20 && sy > 20 && sy < cH - 20;
          return {
            worker: wc,
            x: sx,
            y: sy,
            visible
          };
        });
        setWorkerLabels(projected);
      }

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

      {/* FULL-SCREEN THREE.JS 3D CANVAS CONTAINER */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 3D PROJECTED FLOATING WORKER STATUS BADGES & EMERGENCY CALLOUTS */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {workerLabels.map(({ worker, x, y, visible }) => {
          if (!visible) return null;
          const isAffected = activeScenario?.targetWorkerId === worker.id;
          return (
            <div
              key={worker.id}
              style={{
                transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`
              }}
              onClick={() => handleFocusWorker(worker)}
              className={`pointer-events-auto absolute top-0 left-0 cursor-pointer transition-colors duration-200 ${
                isAffected
                  ? 'bg-red-950/95 border-2 border-red-500 text-white px-3 py-1.5 rounded-lg shadow-[0_0_25px_rgba(239,68,68,0.85)] min-w-[185px] z-30'
                  : 'bg-slate-950/80 hover:bg-slate-900 border border-white/15 text-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-md backdrop-blur-md'
              }`}
            >
              {isAffected ? (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black tracking-wider uppercase text-red-300 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      {worker.id} • {activeScenario.sensorCode}
                    </span>
                    <span className="text-[9px] font-mono bg-red-600/80 px-1.5 rounded text-white font-bold">
                      ALERT
                    </span>
                  </div>
                  <div className="text-[11px] font-extrabold text-white leading-tight">
                    {activeScenario.category}
                  </div>
                  <div className="text-[9px] text-amber-200/90 font-mono">
                    Mesh Uplink → Surface Control
                  </div>
                </div>
              ) : (
                <>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      layer === 2 ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-emerald-400'
                    }`}
                  />
                  <span className="text-[10px] font-mono font-bold tracking-tight">
                    {worker.id}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* PHONE VIEW (360-DEGREE PANORAMA / GYRO MODE & POPUP CONTROLLER) */}
      {/* ============================================================ */}
      {effectiveIsMobile ? (
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
                  {headingDegrees}° {headingDegrees < 45 || headingDegrees >= 315 ? 'N' : headingDegrees < 135 ? 'E' : headingDegrees < 225 ? 'S' : 'W'}
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
                onClick={() => setLayer((prev) => (prev === 1 ? 2 : 1))}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border backdrop-blur-md shadow-xl transition-all ${
                  layer === 1
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>L{layer}</span>
              </button>

              {/* Return to Desktop view toggle (for desktop testers) */}
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
                <span>360° Gyro Active: Rotate & tilt phone • Drag to adjust heading</span>
              </div>
            </div>
          )}

          {/* 2. FLOATING POPUP CONTROLLER BUTTON (Normally small icon, pops up on tap) */}
          {!isControllerOpen ? (
            <div className="fixed bottom-5 right-5 z-40">
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
            <div className="fixed bottom-4 right-4 z-40 w-[290px] sm:w-[315px] bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/40 rounded-2xl p-3.5 shadow-[0_12px_45px_rgba(0,0,0,0.92)] text-white select-none animate-in fade-in zoom-in-95 duration-150">
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
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 text-slate-200 font-semibold"
                >
                  Main
                </button>
                <button
                  onClick={() => handleSelectCameraPreset('surface')}
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 text-slate-200 font-semibold"
                >
                  Surface
                </button>
                <button
                  onClick={() => moveCameraTo([0, 4.5, 12], [0, 4.0, 0], 'l1')}
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 text-amber-400 font-semibold"
                >
                  L1
                </button>
                <button
                  onClick={() => moveCameraTo([0, -2.5, 12], [0, -3.0, 0], 'l2')}
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 text-amber-400 font-semibold"
                >
                  L2
                </button>
                <button
                  onClick={() => moveCameraTo([0, -9.5, 12], [0, -10.0, 0], 'l3')}
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 text-amber-400 font-semibold"
                >
                  L3
                </button>
              </div>
            </div>
          )}

          {/* 3. FLOATING EMERGENCY SIMULATOR TRIGGER FOR PHONE (Bottom-Left) */}
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
            /* POPPED-UP EMERGENCY MENU */
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
                  { key: 'fall', label: 'MPU6050 Motion / Fall', code: 'W-101', color: 'text-red-400' },
                  { key: 'biometric', label: 'MAX30102 Heart / SpO₂', code: 'W-105', color: 'text-rose-400' },
                  { key: 'temperature', label: 'DS18B20 Temperature', code: 'W-102', color: 'text-amber-400' },
                  { key: 'gas', label: 'MQ-135 Gas / Air-Quality', code: 'W-106', color: 'text-orange-400' }
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
        /* DESKTOP VIEW (FULL SCREEN CONTROL ROOM DASHBOARD)            */
        /* ============================================================ */
        <>
          {/* 1. TOP-LEFT: LIFELINK BRAND TITLE & PHONE MODE TEST TOGGLE */}
          <div className="pointer-events-none absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-xs">
            <div className="pointer-events-auto bg-slate-950/75 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 shadow-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-extrabold tracking-tight text-white">LifeLink</h1>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                      3D Sim
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Underground Mine Safety & Mesh Network
                  </p>
                </div>
              </div>

              {/* Phone View Mode Preview Button */}
              <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between">
                <button
                  onClick={() => setForceMobileMode(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 text-[10px] font-bold uppercase transition-colors"
                >
                  <Smartphone className="w-3 h-3" />
                  <span>Test Phone 360 / Gyro</span>
                </button>
                <span className="text-[9px] font-mono text-slate-400">or resize window</span>
              </div>
            </div>
          </div>

          {/* 2. TOP-CENTER: PROMINENT TWO-LAYER VISUALIZATION SWITCH */}
          <div className="pointer-events-none absolute top-4 inset-x-0 z-20 flex justify-center px-4">
            <div className="pointer-events-auto bg-slate-950/80 backdrop-blur-md border border-white/15 p-1 rounded-xl shadow-2xl flex items-center gap-1">
              <button
                onClick={() => setLayer(1)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  layer === 1
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Layer 1 — Mine View</span>
              </button>

              <button
                onClick={() => setLayer(2)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  layer === 2
                    ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/25 font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Layer 2 — Signal Network</span>
              </button>
            </div>
          </div>

          {/* 3. TOP-RIGHT: ACTIVE EMERGENCY BANNER & RESET CAMERA */}
          <div className="pointer-events-none absolute top-4 right-4 z-20 flex items-center gap-2">
            {activeScenario && (
              <div className="pointer-events-auto bg-red-950/85 backdrop-blur-md border border-red-500/60 rounded-xl px-3.5 py-2 shadow-2xl flex items-center gap-3 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold text-white leading-tight">
                    {activeScenario.sensorCode}: {activeScenario.category}
                  </div>
                  <div className="text-[10px] font-mono text-red-200">
                    Worker {activeScenario.targetWorkerId} →{' '}
                    {alertStage >= 2
                      ? 'Surveillance Room Alert Active'
                      : 'Mesh Uplinking to Surface...'}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => handleSelectCameraPreset('overview')}
              title="Reset Camera to Default Cross-Section"
              className="pointer-events-auto bg-slate-950/75 hover:bg-slate-900 backdrop-blur-md border border-white/15 text-slate-200 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-xl transition-colors"
            >
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Reset Camera</span>
            </button>
          </div>

          {/* 4. BOTTOM-LEFT: QUICK CAMERA VIEWS & COMPACT LEGEND */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-col gap-2 max-w-sm">
            <div className="pointer-events-auto bg-slate-950/75 backdrop-blur-md border border-white/10 rounded-xl p-1.5 flex items-center gap-1 shadow-xl">
              {[
                { key: 'overview', label: 'Cross-Section' },
                { key: 'surface', label: 'Surveillance Room' },
                { key: 'underground', label: 'Deep Tunnels' }
              ].map((v) => (
                <button
                  key={v.key}
                  onClick={() => handleSelectCameraPreset(v.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    activePresetName === v.key
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="pointer-events-auto bg-slate-950/75 backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2.5 shadow-xl">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                  <span>Smart Helmet Node</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block shadow-[0_0_6px_#22d3ee]" />
                  <span>Mesh Signal & Uplink</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-pulse" />
                  <span>Emergency Alert Flow</span>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-300">
                <span
                  className={`px-1.5 py-0.5 rounded font-mono font-bold border ${
                    isFlyingKeyActive
                      ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                      : 'bg-white/10 border-white/15 text-amber-300'
                  }`}
                >
                  WASD + Space/Q
                </span>
                <span>
                  Fly across environment • Hold <b>Shift</b> to boost • Drag mouse to steer
                </span>
              </div>
            </div>
          </div>

          {/* 5. BOTTOM-RIGHT: COMPACT "SIMULATE EMERGENCY" FOUR SENSOR SCENARIOS */}
          <div className="pointer-events-none absolute bottom-4 right-4 z-20 w-80 sm:w-96">
            <div className="pointer-events-auto bg-slate-950/80 backdrop-blur-md border border-white/15 rounded-xl p-3.5 shadow-2xl">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    Simulate Emergency
                  </span>
                </div>

                {activeScenario ? (
                  <button
                    onClick={handleResetSimulation}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-[11px] font-semibold transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset State</span>
                  </button>
                ) : (
                  <span className="text-[10px] font-mono text-slate-400">Select Sensor Condition</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleTriggerScenario('fall')}
                  className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all ${
                    activeScenarioKey === 'fall'
                      ? 'bg-red-950/90 border-red-500 text-white shadow-lg shadow-red-950/50'
                      : 'bg-slate-900/70 hover:bg-slate-800/80 border-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-red-400">MPU6050</span>
                    <span className="text-[9px] font-mono text-slate-400">W-101</span>
                  </div>
                  <span className="text-xs font-semibold mt-0.5">Motion / Fall</span>
                </button>

                <button
                  onClick={() => handleTriggerScenario('biometric')}
                  className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all ${
                    activeScenarioKey === 'biometric'
                      ? 'bg-red-950/90 border-red-500 text-white shadow-lg shadow-red-950/50'
                      : 'bg-slate-900/70 hover:bg-slate-800/80 border-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-rose-400">MAX30102</span>
                    <span className="text-[9px] font-mono text-slate-400">W-105</span>
                  </div>
                  <span className="text-xs font-semibold mt-0.5">Heart Rate / SpO₂</span>
                </button>

                <button
                  onClick={() => handleTriggerScenario('temperature')}
                  className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all ${
                    activeScenarioKey === 'temperature'
                      ? 'bg-amber-950/90 border-amber-500 text-white shadow-lg shadow-amber-950/50'
                      : 'bg-slate-900/70 hover:bg-slate-800/80 border-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-amber-400">DS18B20</span>
                    <span className="text-[9px] font-mono text-slate-400">W-102</span>
                  </div>
                  <span className="text-xs font-semibold mt-0.5">Temperature</span>
                </button>

                <button
                  onClick={() => handleTriggerScenario('gas')}
                  className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all ${
                    activeScenarioKey === 'gas'
                      ? 'bg-amber-950/90 border-amber-500 text-white shadow-lg shadow-amber-950/50'
                      : 'bg-slate-900/70 hover:bg-slate-800/80 border-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-orange-400">MQ-135</span>
                    <span className="text-[9px] font-mono text-slate-400">W-106</span>
                  </div>
                  <span className="text-xs font-semibold mt-0.5">Air-Quality / Gas</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
