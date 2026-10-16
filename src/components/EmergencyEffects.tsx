// ============================================================
// LIFElink — Emergency Effects: Per-Scenario Visual FX
// ============================================================

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS, WORKERS } from '../utils/constants';
import { useSimulationStore } from '../stores/simulationStore';

// ---- Warning Haze (for gas scenario) ----
function WarningHaze({ position, opacity }: { position: [number, number, number]; opacity: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      meshRef.current.scale.x = 1 + Math.sin(t * 0.5) * 0.1;
      meshRef.current.scale.z = 1 + Math.cos(t * 0.3) * 0.1;
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = opacity * (0.15 + Math.sin(t * 0.7) * 0.05);
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[4, 12, 8]} />
      <meshStandardMaterial
        color={COLORS.statusWarning}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ---- Health Warning Aura (for heartrate scenario) ----
function HealthAura({ position, opacity }: { position: [number, number, number]; opacity: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      // Heartbeat-like pulse
      const beat = Math.pow(Math.sin(t * 4), 2) * 0.3 + 0.7;
      meshRef.current.scale.setScalar(beat);
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = opacity * beat * 0.3;
    }
  });

  return (
    <mesh ref={meshRef} position={[position[0], position[1] + 1.2, position[2]]}>
      <sphereGeometry args={[0.8, 12, 8]} />
      <meshStandardMaterial
        color={COLORS.statusDanger}
        emissive={COLORS.statusDanger}
        emissiveIntensity={0.5}
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ---- Temperature Heat Shimmer ----
function HeatShimmer({ position, opacity }: { position: [number, number, number]; opacity: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      meshRef.current.position.y = position[1] + 1.5 + Math.sin(t * 2) * 0.2;
      meshRef.current.scale.y = 1 + Math.sin(t * 3) * 0.2;
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = opacity * (0.12 + Math.sin(t) * 0.04);
    }
  });

  return (
    <mesh ref={meshRef} position={[position[0], position[1] + 1.5, position[2]]}>
      <cylinderGeometry args={[0.5, 0.3, 2, 8, 4, true]} />
      <meshStandardMaterial
        color="#FF6600"
        emissive="#FF4400"
        emissiveIntensity={0.3}
        transparent
        opacity={0.12}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ---- Alert Signal Pulse (travels from worker to gateway) ----
function AlertPulse({ startPos, opacity }: { startPos: [number, number, number]; opacity: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (meshRef.current) {
      const t = (state.clock.elapsedTime * 0.3) % 1;
      // Travel upward from worker toward surface
      meshRef.current.position.set(
        startPos[0] + (4 - startPos[0]) * t,
        startPos[1] + (4 - startPos[1]) * t,
        startPos[2] + (-2 - startPos[2]) * t
      );
      const scale = 0.1 + t * 0.1;
      meshRef.current.scale.setScalar(scale);
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = opacity * (1 - t) * 0.8;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial
        color={COLORS.statusDanger}
        emissive={COLORS.statusDanger}
        emissiveIntensity={3}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </mesh>
  );
}

// ---- Main EmergencyEffects Component ----
export default function EmergencyEffects() {
  const activeEmergency = useSimulationStore((s) => s.activeEmergency);
  const affectedId = useSimulationStore((s) => s.affectedWorkerId);
  const emergencyPhase = useSimulationStore((s) => s.emergencyPhase);

  if (!activeEmergency || emergencyPhase === 'idle' || !affectedId) return null;

  const worker = WORKERS.find((w) => w.id === affectedId);
  if (!worker) return null;

  const pos = worker.position;

  return (
    <group>
      {/* Scenario-specific effects */}
      {activeEmergency === 'gas' && (
        <WarningHaze position={pos} opacity={1} />
      )}

      {activeEmergency === 'heartrate' && (
        <HealthAura position={pos} opacity={1} />
      )}

      {activeEmergency === 'temperature' && (
        <HeatShimmer position={pos} opacity={1} />
      )}

      {activeEmergency === 'fall' && (
        // Impact ring at worker position
        <mesh position={[pos[0], pos[1] + 0.2, pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.8, 16]} />
          <meshStandardMaterial
            color={COLORS.statusDanger}
            emissive={COLORS.statusDanger}
            emissiveIntensity={1}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Alert pulse traveling upward */}
      {(emergencyPhase === 'alerting' || emergencyPhase === 'received') && (
        <AlertPulse startPos={pos} opacity={1} />
      )}

      {/* Warning light at affected zone */}
      <pointLight
        position={[pos[0], pos[1] + 2, pos[2]]}
        color={COLORS.statusDanger}
        intensity={emergencyPhase === 'received' ? 4 : 2}
        distance={6}
        decay={2}
      />
    </group>
  );
}
