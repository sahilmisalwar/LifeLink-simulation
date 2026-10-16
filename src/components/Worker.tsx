// ============================================================
// LIFElink — Worker Model: Procedural Miner with Helmet
// ============================================================

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS, type WorkerConfig } from '../utils/constants';
import { useSimulationStore } from '../stores/simulationStore';

interface WorkerProps {
  config: WorkerConfig;
}

export default function Worker({ config }: WorkerProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const bodyRef = useRef<THREE.Group>(null!);
  const leftArmRef = useRef<THREE.Mesh>(null!);
  const rightArmRef = useRef<THREE.Mesh>(null!);
  const leftLegRef = useRef<THREE.Mesh>(null!);
  const rightLegRef = useRef<THREE.Mesh>(null!);
  const statusRef = useRef<THREE.Mesh>(null!);
  const helmetLightRef = useRef<THREE.PointLight>(null!);

  const activeEmergency = useSimulationStore((s) => s.activeEmergency);
  const affectedId = useSimulationStore((s) => s.affectedWorkerId);
  const emergencyPhase = useSimulationStore((s) => s.emergencyPhase);

  const isAffected = config.id === affectedId && activeEmergency !== null;

  // Animation parameters based on activity
  const animParams = useMemo(() => {
    switch (config.activity) {
      case 'walking':
        return { speed: 1.8, limbSwing: 0.4, bodyBob: 0.05, moveDistance: 3 };
      case 'inspecting':
        return { speed: 0.5, limbSwing: 0.1, bodyBob: 0.02, moveDistance: 0 };
      case 'operating':
        return { speed: 1.2, limbSwing: 0.25, bodyBob: 0.01, moveDistance: 0 };
      case 'carrying':
        return { speed: 1.4, limbSwing: 0.3, bodyBob: 0.04, moveDistance: 2 };
      case 'communicating':
        return { speed: 0.3, limbSwing: 0.05, bodyBob: 0.01, moveDistance: 0 };
      case 'maintaining':
        return { speed: 0.8, limbSwing: 0.2, bodyBob: 0.02, moveDistance: 0 };
      default:
        return { speed: 1, limbSwing: 0.2, bodyBob: 0.02, moveDistance: 0 };
    }
  }, [config.activity]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const p = animParams;
    const phase = t * p.speed;

    // Limb animations
    if (leftArmRef.current && rightArmRef.current) {
      leftArmRef.current.rotation.x = Math.sin(phase) * p.limbSwing;
      rightArmRef.current.rotation.x = -Math.sin(phase) * p.limbSwing;

      // Operating: raise one arm
      if (config.activity === 'operating') {
        rightArmRef.current.rotation.x = -0.8 + Math.sin(t * 2) * 0.15;
      }
      // Inspecting: arm forward
      if (config.activity === 'inspecting') {
        rightArmRef.current.rotation.x = -0.6 + Math.sin(t * 0.8) * 0.1;
        rightArmRef.current.rotation.z = -0.2;
      }
    }

    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = -Math.sin(phase) * p.limbSwing * 0.6;
      rightLegRef.current.rotation.x = Math.sin(phase) * p.limbSwing * 0.6;
    }

    // Body bob
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.abs(Math.sin(phase * 2)) * p.bodyBob;
    }

    // Walking: move back and forth
    if (groupRef.current && p.moveDistance > 0) {
      const walkOffset = Math.sin(t * 0.3) * p.moveDistance;
      groupRef.current.position.x = config.position[0] + walkOffset * Math.cos(config.rotation);
      groupRef.current.position.z = config.position[2] + walkOffset * Math.sin(config.rotation);
    }

    // Fall animation for affected worker
    if (isAffected && activeEmergency === 'fall' && bodyRef.current) {
      if (emergencyPhase === 'detecting') {
        bodyRef.current.rotation.x = Math.min(bodyRef.current.rotation.x + 0.02, 1.2);
        bodyRef.current.position.y = Math.max(bodyRef.current.position.y - 0.01, -0.3);
      }
    }

    // Status indicator glow
    if (statusRef.current) {
      const mat = statusRef.current.material as THREE.MeshStandardMaterial;
      if (isAffected && emergencyPhase !== 'idle') {
        mat.emissive.set(COLORS.statusDanger);
        mat.emissiveIntensity = 1.5 + Math.sin(t * 5) * 0.5;
      } else {
        mat.emissive.set(COLORS.statusOk);
        mat.emissiveIntensity = 0.5 + Math.sin(t * 1.5) * 0.15;
      }
    }

    // Helmet light flicker
    if (helmetLightRef.current) {
      helmetLightRef.current.intensity = 1.5 + Math.sin(t * 3 + config.position[0]) * 0.3;
    }
  });

  const statusColor = isAffected && emergencyPhase !== 'idle' ? COLORS.statusDanger : COLORS.statusOk;

  return (
    <group
      ref={groupRef}
      position={config.position}
      rotation={[0, config.rotation, 0]}
      scale={[1.3, 1.3, 1.3]}
    >
      <group ref={bodyRef}>
        {/* ---- Head ---- */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <sphereGeometry args={[0.18, 8, 6]} />
          <meshStandardMaterial color={COLORS.workerSkin} roughness={0.9} />
        </mesh>

        {/* ---- Helmet ---- */}
        <mesh position={[0, 1.68, 0]} castShadow>
          <sphereGeometry args={[0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          <meshStandardMaterial
            color={isAffected ? COLORS.statusDanger : COLORS.workerHelmet}
            roughness={0.4}
            metalness={0.3}
          />
        </mesh>

        {/* Helmet brim */}
        <mesh position={[0, 1.63, 0.1]} castShadow>
          <boxGeometry args={[0.35, 0.03, 0.12]} />
          <meshStandardMaterial
            color={isAffected ? COLORS.statusDanger : COLORS.workerHelmet}
            roughness={0.4}
          />
        </mesh>

        {/* Helmet sensor module */}
        <mesh position={[0.15, 1.72, -0.1]} castShadow>
          <boxGeometry args={[0.08, 0.05, 0.06]} />
          <meshStandardMaterial color="#333340" roughness={0.3} metalness={0.6} />
        </mesh>

        {/* Helmet light */}
        <mesh position={[0, 1.65, 0.2]}>
          <boxGeometry args={[0.08, 0.05, 0.04]} />
          <meshStandardMaterial
            color="#FFEE88"
            emissive="#FFEE88"
            emissiveIntensity={1.5}
          />
        </mesh>
        <pointLight
          ref={helmetLightRef}
          position={[0, 1.65, 0.4]}
          color="#FFE4B5"
          intensity={1.5}
          distance={4}
          decay={2}
        />

        {/* ---- Torso ---- */}
        <mesh position={[0, 1.15, 0]} castShadow>
          <boxGeometry args={[0.45, 0.55, 0.25]} />
          <meshStandardMaterial color={COLORS.workerBody} roughness={0.85} />
        </mesh>

        {/* High-vis vest stripes */}
        <mesh position={[0, 1.2, 0.13]}>
          <boxGeometry args={[0.46, 0.06, 0.01]} />
          <meshStandardMaterial
            color="#FFCC00"
            emissive="#FFCC00"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, 1.05, 0.13]}>
          <boxGeometry args={[0.46, 0.06, 0.01]} />
          <meshStandardMaterial
            color="#FFCC00"
            emissive="#FFCC00"
            emissiveIntensity={0.3}
          />
        </mesh>

        {/* ---- Arms ---- */}
        <mesh ref={leftArmRef} position={[-0.32, 1.1, 0]} castShadow>
          <boxGeometry args={[0.12, 0.5, 0.12]} />
          <meshStandardMaterial color={COLORS.workerBody} roughness={0.85} />
        </mesh>
        <mesh ref={rightArmRef} position={[0.32, 1.1, 0]} castShadow>
          <boxGeometry args={[0.12, 0.5, 0.12]} />
          <meshStandardMaterial color={COLORS.workerBody} roughness={0.85} />
        </mesh>

        {/* ---- Hips ---- */}
        <mesh position={[0, 0.8, 0]} castShadow>
          <boxGeometry args={[0.4, 0.15, 0.22]} />
          <meshStandardMaterial color={COLORS.workerPants} roughness={0.9} />
        </mesh>

        {/* ---- Legs ---- */}
        <mesh ref={leftLegRef} position={[-0.12, 0.45, 0]} castShadow>
          <boxGeometry args={[0.14, 0.55, 0.14]} />
          <meshStandardMaterial color={COLORS.workerPants} roughness={0.9} />
        </mesh>
        <mesh ref={rightLegRef} position={[0.12, 0.45, 0]} castShadow>
          <boxGeometry args={[0.14, 0.55, 0.14]} />
          <meshStandardMaterial color={COLORS.workerPants} roughness={0.9} />
        </mesh>

        {/* ---- Boots ---- */}
        <mesh position={[-0.12, 0.1, 0.03]} castShadow>
          <boxGeometry args={[0.16, 0.18, 0.2]} />
          <meshStandardMaterial color={COLORS.workerBoots} roughness={0.95} />
        </mesh>
        <mesh position={[0.12, 0.1, 0.03]} castShadow>
          <boxGeometry args={[0.16, 0.18, 0.2]} />
          <meshStandardMaterial color={COLORS.workerBoots} roughness={0.95} />
        </mesh>

        {/* ---- Status Indicator ---- */}
        <mesh ref={statusRef} position={[0, 2.0, 0]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={0.5}
            transparent
            opacity={0.9}
          />
        </mesh>
      </group>
    </group>
  );
}
