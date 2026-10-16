// ============================================================
// LIFElink — Particles: Dust, Atmosphere Effects
// ============================================================

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ---- Dust Particles in Tunnels ----
function DustParticles({
  position,
  count = 60,
  spread = [8, 3, 4] as [number, number, number],
}: {
  position: [number, number, number];
  count?: number;
  spread?: [number, number, number];
}) {
  const pointsRef = useRef<THREE.Points>(null!);

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread[0];
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2];

      vel[i * 3] = (Math.random() - 0.5) * 0.003;
      vel[i * 3 + 1] = Math.random() * 0.002 + 0.001;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.003;
    }

    return [pos, vel];
  }, [count, spread]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      arr[i * 3] += velocities[i * 3];
      arr[i * 3 + 1] += velocities[i * 3 + 1];
      arr[i * 3 + 2] += velocities[i * 3 + 2];

      // Reset if too high
      if (arr[i * 3 + 1] > spread[1] / 2) {
        arr[i * 3 + 1] = -spread[1] / 2;
        arr[i * 3] = (Math.random() - 0.5) * spread[0];
        arr[i * 3 + 2] = (Math.random() - 0.5) * spread[2];
      }
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#C0B090"
        size={0.04}
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ---- Main Particles Component ----
export default function Particles() {
  return (
    <group>
      {/* Dust in tunnel areas */}
      <DustParticles position={[-8, -6, 1.5]} spread={[12, 2.5, 4]} count={80} />
      <DustParticles position={[4, -7, -1]} spread={[10, 2.5, 3]} count={50} />
      <DustParticles position={[-12, -12, 0.5]} spread={[14, 2.5, 4]} count={70} />
      <DustParticles position={[3, -13, -1.5]} spread={[10, 2.5, 3]} count={40} />
      <DustParticles position={[-6, -16, 2]} spread={[8, 2, 3]} count={30} />
    </group>
  );
}
