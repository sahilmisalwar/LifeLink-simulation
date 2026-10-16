// ============================================================
// LIFElink — Equipment: Mining Carts, Drills, Props
// ============================================================

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS } from '../utils/constants';

// ---- Mining Cart ----
function MiningCart({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Cart body */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.8, 0.4, 0.5]} />
        <meshStandardMaterial color={COLORS.cartMetal} roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Wheels */}
      {[[-0.3, 0.08, 0.3], [0.3, 0.08, 0.3], [-0.3, 0.08, -0.3], [0.3, 0.08, -0.3]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.04, 8]} />
          <meshStandardMaterial color="#2A2A2A" roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
      {/* Ore / rubble inside */}
      <mesh position={[0, 0.42, 0]}>
        <sphereGeometry args={[0.25, 5, 4]} />
        <meshStandardMaterial color="#6B5B4F" roughness={0.95} />
      </mesh>
    </group>
  );
}

// ---- Drill Rig ----
function DrillRig({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const drillRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (drillRef.current) {
      const t = state.clock.elapsedTime;
      drillRef.current.rotation.z = Math.sin(t * 6) * 0.02;
      drillRef.current.position.x = Math.sin(t * 3) * 0.02;
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Base */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.8, 0.3, 0.6]} />
        <meshStandardMaterial color={COLORS.drillMetal} roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Arm */}
      <mesh position={[0.2, 0.8, 0]} castShadow>
        <boxGeometry args={[0.12, 1.0, 0.12]} />
        <meshStandardMaterial color="#FF6600" roughness={0.6} />
      </mesh>
      {/* Drill bit */}
      <mesh ref={drillRef} position={[0.2, 1.4, 0]} castShadow>
        <coneGeometry args={[0.06, 0.4, 6]} />
        <meshStandardMaterial color="#808890" roughness={0.2} metalness={0.8} />
      </mesh>
    </group>
  );
}

// ---- Rock Pile ----
function RockPile({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[
        { p: [0, 0.12, 0] as [number, number, number], s: 0.2 },
        { p: [0.15, 0.08, 0.1] as [number, number, number], s: 0.13 },
        { p: [-0.1, 0.1, -0.08] as [number, number, number], s: 0.16 },
        { p: [0.05, 0.06, 0.15] as [number, number, number], s: 0.1 },
      ].map((rock, i) => (
        <mesh key={i} position={rock.p} castShadow>
          <dodecahedronGeometry args={[rock.s, 0]} />
          <meshStandardMaterial color="#5A5048" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ---- Main Equipment Component ----
export default function Equipment() {
  return (
    <group>
      {/* Mining carts */}
      <MiningCart position={[-10, -6, 1.2]} rotation={Math.PI * 0.2} />
      <MiningCart position={[6, -7.2, -0.8]} rotation={-Math.PI * 0.3} />
      <MiningCart position={[-14, -12, 0.8]} rotation={Math.PI * 0.5} />

      {/* Drill rigs */}
      <DrillRig position={[8, -7, -1.2]} rotation={Math.PI * 0.6} />
      <DrillRig position={[-16, -12, 1.2]} rotation={-Math.PI * 0.2} />

      {/* Rock piles */}
      <RockPile position={[-12, -6.5, 1.8]} />
      <RockPile position={[4, -13.5, -1.5]} />
      <RockPile position={[-7, -15.5, 2.5]} />
      <RockPile position={[-5, -6.5, 0.5]} />
    </group>
  );
}
