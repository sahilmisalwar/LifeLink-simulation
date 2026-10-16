// ============================================================
// LIFElink — Mesh Network: Communication Lines & Data Packets
// ============================================================

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS, WORKERS, SURVEILLANCE_ROOM } from '../utils/constants';
import { useSimulationStore } from '../stores/simulationStore';

// ---- Network topology: define connections ----
const NETWORK_LINKS: [number, number][] = [
  [0, 5], // W-01 → W-06 (main shaft)
  [1, 5], // W-02 → W-06
  [2, 0], // W-03 → W-01
  [3, 1], // W-04 → W-02
  [4, 2], // W-05 → W-03
  [0, 2], // W-01 → W-03
];

// Gateway position (antenna at surface)
const GATEWAY_POS = new THREE.Vector3(4, 3, -2);
const SURVEILLANCE_POS = new THREE.Vector3(
  SURVEILLANCE_ROOM.position.x,
  SURVEILLANCE_ROOM.position.y + 2,
  SURVEILLANCE_ROOM.position.z
);

// W-06 connects to gateway
const GATEWAY_WORKER_INDEX = 5;

// ---- Single Communication Line ----
function CommLine({
  startPos,
  endPos,
  isActive,
  opacity,
}: {
  startPos: [number, number, number];
  endPos: [number, number, number];
  isActive: boolean;
  opacity: number;
}) {
  const lineRef = useRef<THREE.Mesh>(null!);
  const packetRef = useRef<THREE.Mesh>(null!);

  const curve = useMemo(() => {
    const s = new THREE.Vector3(...startPos);
    const e = new THREE.Vector3(...endPos);
    const mid = new THREE.Vector3().lerpVectors(s, e, 0.5);
    mid.y += 0.5; // slight arc
    return new THREE.QuadraticBezierCurve3(s, mid, e);
  }, [startPos, endPos]);

  const tubeGeo = useMemo(() => {
    return new THREE.TubeGeometry(curve, 24, 0.07, 6, false);
  }, [curve]);

  useFrame((state) => {
    if (packetRef.current && isActive) {
      const t = (state.clock.elapsedTime * 0.4) % 1;
      const point = curve.getPoint(t);
      packetRef.current.position.copy(point);
      packetRef.current.visible = true;
    } else if (packetRef.current) {
      packetRef.current.visible = false;
    }
  });

  return (
    <group>
      {/* Line */}
      <mesh ref={lineRef} geometry={tubeGeo}>
        <meshStandardMaterial
          color={isActive ? COLORS.signalCyan : COLORS.signalBlue}
          emissive={isActive ? COLORS.signalCyan : COLORS.signalBlue}
          emissiveIntensity={isActive ? 3 : 0.6}
          transparent
          opacity={opacity * (isActive ? 0.8 : 0.35)}
        />
      </mesh>

      {/* Data packet */}
      <mesh ref={packetRef} visible={false}>
        <sphereGeometry args={[0.15, 8, 6]} />
        <meshStandardMaterial
          color={COLORS.signalCyan}
          emissive={COLORS.signalCyan}
          emissiveIntensity={5}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  );
}

// ---- Helmet Signal Indicator (cyan ring) ----
function HelmetSignal({
  position,
  opacity,
  isAlert,
}: {
  position: [number, number, number];
  opacity: number;
  isAlert: boolean;
}) {
  const ringRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (ringRef.current) {
      const t = state.clock.elapsedTime;
      ringRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
      const mat = ringRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = opacity * (0.5 + Math.sin(t * 2) * 0.2);
    }
  });

  return (
    <mesh
      ref={ringRef}
      position={[position[0], position[1] + 2.2, position[2]]}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <torusGeometry args={[0.2, 0.03, 8, 16]} />
      <meshStandardMaterial
        color={isAlert ? COLORS.statusDanger : COLORS.signalCyan}
        emissive={isAlert ? COLORS.statusDanger : COLORS.signalCyan}
        emissiveIntensity={2}
        transparent
        opacity={opacity * 0.6}
      />
    </mesh>
  );
}

// ---- Main MeshNetwork Component ----
export default function MeshNetwork() {
  const layerTransition = useSimulationStore((s) => s.layerTransition);
  const activeEmergency = useSimulationStore((s) => s.activeEmergency);
  const affectedId = useSimulationStore((s) => s.affectedWorkerId);
  const emergencyPhase = useSimulationStore((s) => s.emergencyPhase);

  const opacity = layerTransition;

  if (opacity < 0.01) return null;

  const isAlertActive = activeEmergency !== null && emergencyPhase !== 'idle';

  return (
    <group>
      {/* Helmet signal indicators */}
      {WORKERS.map((w) => (
        <HelmetSignal
          key={w.id}
          position={w.position}
          opacity={opacity}
          isAlert={isAlertActive && w.id === affectedId}
        />
      ))}

      {/* Worker-to-worker mesh links */}
      {NETWORK_LINKS.map(([a, b], i) => {
        const wa = WORKERS[a];
        const wb = WORKERS[b];
        const isOnAlertPath =
          isAlertActive &&
          (wa.id === affectedId || wb.id === affectedId);

        return (
          <CommLine
            key={i}
            startPos={[wa.position[0], wa.position[1] + 2, wa.position[2]]}
            endPos={[wb.position[0], wb.position[1] + 2, wb.position[2]]}
            isActive={isOnAlertPath || i % 2 === 0}
            opacity={opacity}
          />
        );
      })}

      {/* Gateway link (W-06 → antenna) */}
      <CommLine
        startPos={[
          WORKERS[GATEWAY_WORKER_INDEX].position[0],
          WORKERS[GATEWAY_WORKER_INDEX].position[1] + 2,
          WORKERS[GATEWAY_WORKER_INDEX].position[2],
        ]}
        endPos={[GATEWAY_POS.x, GATEWAY_POS.y, GATEWAY_POS.z]}
        isActive={true}
        opacity={opacity}
      />

      {/* Gateway → Surveillance Room link */}
      <CommLine
        startPos={[GATEWAY_POS.x, GATEWAY_POS.y, GATEWAY_POS.z]}
        endPos={[SURVEILLANCE_POS.x, SURVEILLANCE_POS.y, SURVEILLANCE_POS.z]}
        isActive={true}
        opacity={opacity}
      />

      {/* Gateway glow */}
      <mesh position={[GATEWAY_POS.x, GATEWAY_POS.y + 0.5, GATEWAY_POS.z]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshStandardMaterial
          color={COLORS.signalCyan}
          emissive={COLORS.signalCyan}
          emissiveIntensity={3}
          transparent
          opacity={opacity * 0.7}
        />
      </mesh>
    </group>
  );
}
