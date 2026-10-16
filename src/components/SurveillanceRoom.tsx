// ============================================================
// LIFElink — Surveillance Room: Control Room, Screens, Operators
// ============================================================

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { COLORS, SURVEILLANCE_ROOM, MINE } from '../utils/constants';
import { useSimulationStore } from '../stores/simulationStore';

// ---- Monitor Screen ----
function MonitorScreen({
  position,
  width = 1.2,
  height = 0.8,
  rotation = [0, 0, 0] as [number, number, number],
  isMainScreen = false,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
  rotation?: [number, number, number];
  isMainScreen?: boolean;
}) {
  const glowRef = useRef<THREE.MeshStandardMaterial>(null!);
  const emergency = useSimulationStore((s) => s.activeEmergency);
  const phase = useSimulationStore((s) => s.emergencyPhase);

  useFrame((state) => {
    if (glowRef.current) {
      const t = state.clock.elapsedTime;
      const hasAlert = emergency && phase === 'received';
      if (hasAlert && isMainScreen) {
        glowRef.current.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.3;
        glowRef.current.emissive.set(COLORS.statusDanger);
      } else {
        glowRef.current.emissiveIntensity = 0.3 + Math.sin(t * 0.5) * 0.05;
        glowRef.current.emissive.set(COLORS.screenGlow);
      }
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Screen bezel */}
      <mesh castShadow>
        <boxGeometry args={[width + 0.1, height + 0.1, 0.06]} />
        <meshStandardMaterial color="#1A1A20" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Screen display */}
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          ref={glowRef}
          color={COLORS.screenBg}
          emissive={COLORS.screenGlow}
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

// ---- Desk ----
function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Desktop surface */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[2.5, 0.08, 1.0]} />
        <meshStandardMaterial color="#3A3A42" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* Legs */}
      {[[-1.1, -0.4, -0.4], [1.1, -0.4, -0.4], [-1.1, -0.4, 0.4], [1.1, -0.4, 0.4]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <boxGeometry args={[0.06, 0.8, 0.06]} />
          <meshStandardMaterial color="#2A2A30" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// ---- Surveillance Operator (simple figure) ----
function Operator({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Body/torso */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.3]} />
        <meshStandardMaterial color="#2B3D5F" roughness={0.8} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <sphereGeometry args={[0.15, 8, 6]} />
        <meshStandardMaterial color={COLORS.workerSkin} roughness={0.9} />
      </mesh>
      {/* Chair */}
      <mesh position={[0, -0.15, 0]} castShadow>
        <boxGeometry args={[0.4, 0.1, 0.4]} />
        <meshStandardMaterial color="#1A1A22" roughness={0.7} />
      </mesh>
      {/* Chair back */}
      <mesh position={[0, 0.2, -0.2]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.06]} />
        <meshStandardMaterial color="#1A1A22" roughness={0.7} />
      </mesh>
    </group>
  );
}

// ---- Main Surveillance Room Component ----
export default function SurveillanceRoom() {
  const { position, rotation } = SURVEILLANCE_ROOM;

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, rotation, 0]}>
      {/* Room structure — walls */}
      {/* Back wall */}
      <mesh position={[0, 0, -MINE.roomDepth / 2]} castShadow>
        <boxGeometry args={[MINE.roomWidth, MINE.roomHeight, 0.15]} />
        <meshStandardMaterial color={COLORS.roomWall} roughness={0.7} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-MINE.roomWidth / 2, 0, 0]} castShadow>
        <boxGeometry args={[0.15, MINE.roomHeight, MINE.roomDepth]} />
        <meshStandardMaterial color={COLORS.roomWall} roughness={0.7} />
      </mesh>
      {/* Right wall - partial with glass */}
      <mesh position={[MINE.roomWidth / 2, 0.8, 0]} castShadow>
        <boxGeometry args={[0.15, 1.5, MINE.roomDepth]} />
        <meshStandardMaterial color={COLORS.roomWall} roughness={0.7} />
      </mesh>
      {/* Glass panel (right wall upper) */}
      <mesh position={[MINE.roomWidth / 2, -0.8, 0]}>
        <boxGeometry args={[0.08, 2, MINE.roomDepth - 0.5]} />
        <meshStandardMaterial
          color={COLORS.roomGlass}
          transparent
          opacity={0.25}
          roughness={0.1}
          metalness={0.2}
        />
      </mesh>

      {/* Floor */}
      <mesh position={[0, -MINE.roomHeight / 2, 0]} receiveShadow>
        <boxGeometry args={[MINE.roomWidth, 0.15, MINE.roomDepth]} />
        <meshStandardMaterial color={COLORS.roomFloor} roughness={0.8} />
      </mesh>

      {/* Roof */}
      <mesh position={[0, MINE.roomHeight / 2, 0]} castShadow>
        <boxGeometry args={[MINE.roomWidth + 0.3, 0.12, MINE.roomDepth + 0.3]} />
        <meshStandardMaterial color="#5A6A6A" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* ---- Interior ---- */}
      {/* Main large screen on back wall */}
      <MonitorScreen
        position={[0, 0.5, -MINE.roomDepth / 2 + 0.15]}
        width={3.0}
        height={1.5}
        isMainScreen
      />

      {/* Side screens */}
      <MonitorScreen position={[-2.5, 0.5, -MINE.roomDepth / 2 + 0.15]} width={1.5} height={1.0} />
      <MonitorScreen position={[2.5, 0.5, -MINE.roomDepth / 2 + 0.15]} width={1.5} height={1.0} />

      {/* Desk screens (on desks, tilted) */}
      <MonitorScreen position={[-1.2, -0.5, 0]} width={0.6} height={0.4} rotation={[-0.3, 0, 0]} />
      <MonitorScreen position={[1.2, -0.5, 0]} width={0.6} height={0.4} rotation={[-0.3, 0, 0]} />

      {/* Desks */}
      <Desk position={[-1.2, -1.0, 0.3]} />
      <Desk position={[1.2, -1.0, 0.3]} />

      {/* Operators */}
      <Operator position={[-1.2, -0.5, 0.8]} rotation={Math.PI} />
      <Operator position={[1.2, -0.5, 0.8]} rotation={Math.PI} />

      {/* Room interior light */}
      <pointLight
        position={[0, 1.5, 0]}
        color="#E0E8F0"
        intensity={3}
        distance={10}
        decay={2}
      />

      {/* SURVEILLANCE ROOM label */}
      <Text
        position={[0, MINE.roomHeight / 2 + 0.3, MINE.roomDepth / 2]}
        fontSize={0.35}
        color="#FFFFFF"
        anchorX="center"
        anchorY="bottom"
        font="https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
      >
        SURVEILLANCE ROOM
      </Text>
    </group>
  );
}
