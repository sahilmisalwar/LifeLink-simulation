// ============================================================
// LIFElink — Constants & Configuration
// ============================================================

import * as THREE from 'three';

// --- Colors ---
export const COLORS = {
  // Sky & atmosphere
  skyTop: '#87CEEB',
  skyBottom: '#E0F0FF',
  sunLight: '#FFF8E7',
  ambientLight: '#94A3B8',

  // Terrain layers
  grass: '#4A7C3F',
  topsoil: '#8B6914',
  sandstone: '#C4A35A',
  limestone: '#A89078',
  darkRock: '#4A4A50',
  deepRock: '#2D2D33',

  // Tunnel
  tunnelWall: '#6E6E78',
  tunnelFloor: '#4A4A52',
  supportBeam: '#9B8365',
  rail: '#808088',
  railTie: '#6C5A4A',

  // Lighting
  tunnelLight: '#FFB347',
  tunnelLightDim: '#CC8030',

  // Mine entrance
  entranceFrame: '#6B5B4F',
  entranceConcrete: '#808080',

  // Surveillance room
  roomWall: '#B0B0B8',
  roomFloor: '#606068',
  roomGlass: '#A0D0E0',
  screenGlow: '#00C8FF',
  screenBg: '#0A1628',

  // Workers
  workerBody: '#2B5797',
  workerPants: '#3A3A44',
  workerHelmet: '#FFD700',
  workerSkin: '#D4A574',
  workerBoots: '#3D2B1F',

  // Status
  statusOk: '#22C55E',
  statusWarning: '#F59E0B',
  statusDanger: '#EF4444',

  // Communication
  signalCyan: '#00E5FF',
  signalBlue: '#1E90FF',
  signalPulse: '#00B8D4',

  // Equipment
  cartMetal: '#787880',
  drillMetal: '#606068',
  ventDuct: '#909098',
  fanBlade: '#70707A',
};

// --- Dimensions ---
export const MINE = {
  // Overall scene
  sceneWidth: 60,
  sceneDepth: 40,

  // Terrain
  terrainWidth: 80,
  terrainDepth: 60,
  terrainHeight: 2,
  cutawayWidth: 50,
  cutawayDepth: 35,

  // Rock strata thicknesses
  topsoilHeight: 1.5,
  sandstoneHeight: 3,
  limestoneHeight: 3,
  darkRockHeight: 6,
  deepRockHeight: 8,

  // Total underground depth
  totalDepth: 22,

  // Tunnel dimensions
  tunnelRadius: 2.2,
  tunnelWidth: 3.5,
  tunnelHeight: 3.0,

  // Surveillance room
  roomWidth: 8,
  roomHeight: 4,
  roomDepth: 5,
  roomElevation: 0.5,
};

// --- Tunnel Layout ---
export interface TunnelSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  depth: number;
  label?: string;
}

export const TUNNEL_LAYOUT: TunnelSegment[] = [
  // Main shaft (vertical-ish descent)
  {
    start: new THREE.Vector3(0, 0, 0),
    end: new THREE.Vector3(-3, -6, 0),
    depth: 1,
    label: 'Main Shaft Upper',
  },
  {
    start: new THREE.Vector3(-3, -6, 0),
    end: new THREE.Vector3(-4, -12, 0),
    depth: 2,
    label: 'Main Shaft Lower',
  },

  // Level 1 tunnels (depth ~6)
  {
    start: new THREE.Vector3(-3, -6, 0),
    end: new THREE.Vector3(-15, -6, 2),
    depth: 1,
    label: 'Level 1 West',
  },
  {
    start: new THREE.Vector3(-3, -6, 0),
    end: new THREE.Vector3(10, -7, -1),
    depth: 1,
    label: 'Level 1 East',
  },

  // Level 2 tunnels (depth ~12)
  {
    start: new THREE.Vector3(-4, -12, 0),
    end: new THREE.Vector3(-18, -12, 1),
    depth: 2,
    label: 'Level 2 West',
  },
  {
    start: new THREE.Vector3(-4, -12, 0),
    end: new THREE.Vector3(8, -13, -2),
    depth: 2,
    label: 'Level 2 East',
  },
  {
    start: new THREE.Vector3(-4, -12, 0),
    end: new THREE.Vector3(-8, -17, 3),
    depth: 3,
    label: 'Level 2 Deep Branch',
  },
];

// --- Worker Positions ---
export interface WorkerConfig {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  activity: 'walking' | 'inspecting' | 'operating' | 'carrying' | 'communicating' | 'maintaining';
  tunnelIndex: number;
  zone: string;
}

export const WORKERS: WorkerConfig[] = [
  {
    id: 'W-01',
    name: 'Rajesh K.',
    position: [-8, -6, 1.5],
    rotation: Math.PI * 0.2,
    activity: 'inspecting',
    tunnelIndex: 2,
    zone: 'Level 1 West',
  },
  {
    id: 'W-02',
    name: 'Sunil M.',
    position: [5, -7, -0.5],
    rotation: -Math.PI * 0.3,
    activity: 'operating',
    tunnelIndex: 3,
    zone: 'Level 1 East',
  },
  {
    id: 'W-03',
    name: 'Deepak R.',
    position: [-12, -12, 0.5],
    rotation: Math.PI * 0.5,
    activity: 'walking',
    tunnelIndex: 4,
    zone: 'Level 2 West',
  },
  {
    id: 'W-04',
    name: 'Anil P.',
    position: [3, -13, -1],
    rotation: -Math.PI * 0.1,
    activity: 'carrying',
    tunnelIndex: 5,
    zone: 'Level 2 East',
  },
  {
    id: 'W-05',
    name: 'Vijay S.',
    position: [-6, -15, 2],
    rotation: Math.PI * 0.8,
    activity: 'maintaining',
    tunnelIndex: 6,
    zone: 'Level 2 Deep',
  },
  {
    id: 'W-06',
    name: 'Prakash T.',
    position: [-2, -4, 0],
    rotation: 0,
    activity: 'communicating',
    tunnelIndex: 0,
    zone: 'Main Shaft',
  },
];

// --- Surveillance Room Position ---
export const SURVEILLANCE_ROOM = {
  position: new THREE.Vector3(14, MINE.roomElevation + MINE.roomHeight / 2, -4),
  rotation: -Math.PI * 0.15,
};

// --- Mine Entrance ---
export const MINE_ENTRANCE = {
  position: new THREE.Vector3(0, 0, 0),
};

// --- Camera Defaults ---
export const CAMERA = {
  defaultPosition: [35, 20, 40] as [number, number, number],
  defaultTarget: [-2, -7, 0] as [number, number, number],
  fov: 50,
  near: 0.1,
  far: 250,
  minDistance: 15,
  maxDistance: 100,
  minPolarAngle: Math.PI * 0.05,
  maxPolarAngle: Math.PI * 0.55,
};
