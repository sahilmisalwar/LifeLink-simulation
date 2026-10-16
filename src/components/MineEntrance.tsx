// ============================================================
// LIFElink — Mine Entrance & Surface Infrastructure
// ============================================================

import { useMemo } from 'react';
import * as THREE from 'three';
import { COLORS } from '../utils/constants';

// ---- Main Entrance Portal ----
function EntrancePortal() {
  return (
    <group position={[0, 0.5, 0]}>
      {/* Concrete frame */}
      {/* Left pillar */}
      <mesh position={[-2.2, 0.8, 0]} castShadow>
        <boxGeometry args={[0.6, 2.5, 0.8]} />
        <meshStandardMaterial color={COLORS.entranceConcrete} roughness={0.85} />
      </mesh>
      {/* Right pillar */}
      <mesh position={[2.2, 0.8, 0]} castShadow>
        <boxGeometry args={[0.6, 2.5, 0.8]} />
        <meshStandardMaterial color={COLORS.entranceConcrete} roughness={0.85} />
      </mesh>
      {/* Top beam */}
      <mesh position={[0, 2.2, 0]} castShadow>
        <boxGeometry args={[5.0, 0.5, 0.8]} />
        <meshStandardMaterial color={COLORS.entranceConcrete} roughness={0.85} />
      </mesh>

      {/* Wooden entrance frame */}
      <mesh position={[-1.8, 0.6, -0.3]} castShadow>
        <boxGeometry args={[0.2, 2.0, 0.2]} />
        <meshStandardMaterial color={COLORS.entranceFrame} roughness={0.9} />
      </mesh>
      <mesh position={[1.8, 0.6, -0.3]} castShadow>
        <boxGeometry args={[0.2, 2.0, 0.2]} />
        <meshStandardMaterial color={COLORS.entranceFrame} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.7, -0.3]} castShadow>
        <boxGeometry args={[3.8, 0.15, 0.2]} />
        <meshStandardMaterial color={COLORS.entranceFrame} roughness={0.9} />
      </mesh>

      {/* Dark entrance opening */}
      <mesh position={[0, 0.5, -0.5]}>
        <boxGeometry args={[3.4, 2.2, 0.3]} />
        <meshStandardMaterial color="#1a1a1a" roughness={1} />
      </mesh>

      {/* Warning sign */}
      <mesh position={[0, 2.8, 0.1]} castShadow>
        <boxGeometry args={[2.0, 0.5, 0.05]} />
        <meshStandardMaterial color="#FFD700" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ---- Equipment Shed ----
function EquipmentShed() {
  return (
    <group position={[8, 0.5, 3]}>
      {/* Walls */}
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[4, 2.5, 3]} />
        <meshStandardMaterial color="#7A8A7A" roughness={0.8} />
      </mesh>
      {/* Roof */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <boxGeometry args={[4.5, 0.15, 3.5]} />
        <meshStandardMaterial color="#5A6A6A" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.6, 1.51]}>
        <boxGeometry args={[1.2, 1.8, 0.05]} />
        <meshStandardMaterial color="#4A3A2A" roughness={0.9} />
      </mesh>
    </group>
  );
}

// ---- Power Line Poles ----
function PowerLines() {
  const poles = useMemo(
    () => [
      [12, 0, 10] as [number, number, number],
      [20, 0, 10] as [number, number, number],
      [28, 0, 10] as [number, number, number],
    ],
    []
  );

  return (
    <group>
      {poles.map((pos, i) => (
        <group key={i} position={pos}>
          {/* Pole */}
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, 6, 6]} />
            <meshStandardMaterial color="#5C4A3A" roughness={0.9} />
          </mesh>
          {/* Crossbar */}
          <mesh position={[0, 5.5, 0]} castShadow>
            <boxGeometry args={[2.5, 0.08, 0.08]} />
            <meshStandardMaterial color="#5C4A3A" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Wires between poles */}
      {poles.slice(0, -1).map((pos, i) => {
        const next = poles[i + 1];
        return (
          <group key={`wire-${i}`}>
            <WireCatenary start={[pos[0] - 1, 5.5, pos[2]]} end={[next[0] - 1, 5.5, next[2]]} sag={0.6} />
            <WireCatenary start={[pos[0] + 1, 5.5, pos[2]]} end={[next[0] + 1, 5.5, next[2]]} sag={0.6} />
          </group>
        );
      })}
    </group>
  );
}

function WireCatenary({
  start,
  end,
  sag,
}: {
  start: [number, number, number];
  end: [number, number, number];
  sag: number;
}) {
  const curve = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = start[0] + (end[0] - start[0]) * t;
      const z = start[2] + (end[2] - start[2]) * t;
      const sagAmount = -sag * Math.sin(Math.PI * t);
      const y = start[1] + (end[1] - start[1]) * t + sagAmount;
      pts.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(pts);
  }, [start, end, sag]);

  const geo = useMemo(() => {
    return new THREE.TubeGeometry(curve, 20, 0.015, 4, false);
  }, [curve]);

  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#2A2A2A" roughness={0.4} metalness={0.6} />
    </mesh>
  );
}

// ---- Safety Barriers ----
function SafetyBarriers() {
  return (
    <group>
      {/* Barriers around mine entrance */}
      {[[-3.5, 0.4, 1.5], [3.5, 0.4, 1.5], [-3.5, 0.4, -1], [3.5, 0.4, -1]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.8, 6]} />
          <meshStandardMaterial color="#FF6600" roughness={0.5} />
        </mesh>
      ))}
      {/* Horizontal rails */}
      <mesh position={[3.5, 0.6, 0.25]}>
        <boxGeometry args={[0.05, 0.05, 2.5]} />
        <meshStandardMaterial color="#FF6600" roughness={0.5} />
      </mesh>
      <mesh position={[-3.5, 0.6, 0.25]}>
        <boxGeometry args={[0.05, 0.05, 2.5]} />
        <meshStandardMaterial color="#FF6600" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ---- Surface Gateway Antenna (for signal layer) ----
function GatewayAntenna() {
  return (
    <group position={[4, 0.2, -2]}>
      {/* Base */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color="#606060" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 4, 6]} />
        <meshStandardMaterial color="#808080" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Antenna arrays */}
      <mesh position={[0, 4.0, 0]} castShadow>
        <boxGeometry args={[0.8, 0.15, 0.15]} />
        <meshStandardMaterial color="#909090" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 3.5, 0]} castShadow>
        <boxGeometry args={[0.6, 0.12, 0.12]} />
        <meshStandardMaterial color="#909090" roughness={0.4} metalness={0.5} />
      </mesh>
    </group>
  );
}

// ---- Main MineEntrance Component ----
export default function MineEntrance() {
  return (
    <group>
      <EntrancePortal />
      <EquipmentShed />
      <PowerLines />
      <SafetyBarriers />
      <GatewayAntenna />
    </group>
  );
}
