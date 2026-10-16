// ============================================================
// LIFElink — Tunnel Network: Tunnels, Rails, Support Beams, Lighting
// ============================================================

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS, TUNNEL_LAYOUT } from '../utils/constants';
import { generateSupportBeamPositions } from '../utils/geometryHelpers';

// ---- Single Tunnel Segment ----
function TunnelSegment({
  start,
  end,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  depth: number;
}) {
  const dir = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
  const length = useMemo(() => dir.length(), [dir]);
  const midpoint = useMemo(() => new THREE.Vector3().lerpVectors(start, end, 0.5), [start, end]);
  const angle = useMemo(() => Math.atan2(dir.x, dir.z), [dir]);
  const pitch = useMemo(() => Math.atan2(dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z)), [dir]);

  const supportPositions = useMemo(
    () => generateSupportBeamPositions(start, end, 3.5),
    [start, end]
  );

  return (
    <group>
      {/* Tunnel ceiling */}
      <mesh
        position={[midpoint.x, midpoint.y + 1.3, midpoint.z]}
        rotation={[pitch, angle, 0]}
        receiveShadow
      >
        <boxGeometry args={[3.8, 0.2, length]} />
        <meshStandardMaterial color={COLORS.tunnelWall} roughness={0.92} metalness={0.05} />
      </mesh>

      {/* Tunnel left wall */}
      <mesh
        position={[
          midpoint.x - Math.cos(angle) * 1.8,
          midpoint.y,
          midpoint.z + Math.sin(angle) * 1.8
        ]}
        rotation={[pitch, angle, 0]}
        receiveShadow
      >
        <boxGeometry args={[0.2, 2.8, length]} />
        <meshStandardMaterial color={COLORS.tunnelWall} roughness={0.92} metalness={0.05} />
      </mesh>

      {/* Tunnel right wall */}
      <mesh
        position={[
          midpoint.x + Math.cos(angle) * 1.8,
          midpoint.y,
          midpoint.z - Math.sin(angle) * 1.8
        ]}
        rotation={[pitch, angle, 0]}
        receiveShadow
      >
        <boxGeometry args={[0.2, 2.8, length]} />
        <meshStandardMaterial color={COLORS.tunnelWall} roughness={0.92} metalness={0.05} />
      </mesh>

      {/* Tunnel floor */}
      <mesh
        position={[midpoint.x, midpoint.y - 1.4, midpoint.z]}
        rotation={[pitch, angle, 0]}
        receiveShadow
      >
        <boxGeometry args={[3.8, 0.15, length]} />
        <meshStandardMaterial color={COLORS.tunnelFloor} roughness={0.95} />
      </mesh>

      {/* Rail tracks */}
      <RailTrack start={start} end={end} offset={-0.6} />
      <RailTrack start={start} end={end} offset={0.6} />
      <RailTies start={start} end={end} />

      {/* Support beams */}
      {supportPositions.map((pos, i) => (
        <SupportBeam key={i} position={[pos.x, pos.y, pos.z]} rotation={angle} />
      ))}

      {/* Tunnel lights */}
      <TunnelLights start={start} end={end} />
    </group>
  );
}

// ---- Rail Track ----
function RailTrack({
  start,
  end,
  offset,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  offset: number;
}) {
  const dir = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
  const length = useMemo(() => dir.length(), [dir]);
  const midpoint = useMemo(() => new THREE.Vector3().lerpVectors(start, end, 0.5), [start, end]);
  const angle = useMemo(() => Math.atan2(dir.x, dir.z), [dir]);
  const pitch = useMemo(() => Math.atan2(dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z)), [dir]);

  const perpX = Math.cos(angle) * offset;
  const perpZ = -Math.sin(angle) * offset;

  return (
    <mesh
      position={[midpoint.x + perpX, midpoint.y - 1.25, midpoint.z + perpZ]}
      rotation={[pitch, angle, 0]}
      castShadow
    >
      <boxGeometry args={[0.06, 0.08, length]} />
      <meshStandardMaterial color={COLORS.rail} roughness={0.3} metalness={0.7} />
    </mesh>
  );
}

// ---- Rail Ties ----
function RailTies({ start, end }: { start: THREE.Vector3; end: THREE.Vector3 }) {
  const ties = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    const count = Math.floor(length / 1.2);
    const angle = Math.atan2(dir.x, dir.z);
    const items: { pos: [number, number, number]; angle: number }[] = [];

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      items.push({ pos: [p.x, p.y - 1.3, p.z], angle });
    }
    return items;
  }, [start, end]);

  return (
    <>
      {ties.map((tie, i) => (
        <mesh key={i} position={tie.pos} rotation={[0, tie.angle, 0]} castShadow>
          <boxGeometry args={[1.6, 0.06, 0.12]} />
          <meshStandardMaterial color={COLORS.railTie} roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

// ---- Support Beam ----
function SupportBeam({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Left vertical */}
      <mesh position={[-1.6, 0, 0]} castShadow>
        <boxGeometry args={[0.18, 2.8, 0.18]} />
        <meshStandardMaterial color={COLORS.supportBeam} roughness={0.8} />
      </mesh>
      {/* Right vertical */}
      <mesh position={[1.6, 0, 0]} castShadow>
        <boxGeometry args={[0.18, 2.8, 0.18]} />
        <meshStandardMaterial color={COLORS.supportBeam} roughness={0.8} />
      </mesh>
      {/* Top horizontal */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[3.4, 0.18, 0.18]} />
        <meshStandardMaterial color={COLORS.supportBeam} roughness={0.8} />
      </mesh>
      {/* Diagonal braces */}
      <mesh position={[-1.2, 0.8, 0]} rotation={[0, 0, 0.4]} castShadow>
        <boxGeometry args={[0.08, 1.2, 0.08]} />
        <meshStandardMaterial color={COLORS.supportBeam} roughness={0.85} />
      </mesh>
      <mesh position={[1.2, 0.8, 0]} rotation={[0, 0, -0.4]} castShadow>
        <boxGeometry args={[0.08, 1.2, 0.08]} />
        <meshStandardMaterial color={COLORS.supportBeam} roughness={0.85} />
      </mesh>
    </group>
  );
}

// ---- Tunnel Lights ----
function TunnelLights({ start, end }: { start: THREE.Vector3; end: THREE.Vector3 }) {
  const lightsData = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    const count = Math.max(1, Math.floor(length / 4));
    const items: [number, number, number][] = [];

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      items.push([p.x, p.y + 1.1, p.z]);
    }
    return items;
  }, [start, end]);

  return (
    <>
      {lightsData.map((pos, i) => (
        <group key={i}>
          <pointLight
            position={pos}
            color={COLORS.tunnelLight}
            intensity={3}
            distance={7}
            decay={2}
          />
          {/* Light fixture mesh */}
          <mesh position={pos}>
            <boxGeometry args={[0.35, 0.08, 0.18]} />
            <meshStandardMaterial
              color={COLORS.tunnelLight}
              emissive={COLORS.tunnelLight}
              emissiveIntensity={3}
            />
          </mesh>
          {/* Light cable */}
          <mesh position={[pos[0], pos[1] + 0.15, pos[2]]}>
            <cylinderGeometry args={[0.01, 0.01, 0.2, 4]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ---- Ventilation Duct ----
function VentilationDuct({
  start,
  end,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
}) {
  const dir = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
  const length = useMemo(() => dir.length(), [dir]);
  const midpoint = useMemo(() => new THREE.Vector3().lerpVectors(start, end, 0.5), [start, end]);
  const angle = useMemo(() => Math.atan2(dir.x, dir.z), [dir]);

  return (
    <group>
      {/* Duct pipe along ceiling edge */}
      <mesh
        position={[midpoint.x + 1.0, midpoint.y + 1.0, midpoint.z]}
        rotation={[Math.PI / 2, 0, angle]}
      >
        <cylinderGeometry args={[0.2, 0.2, length, 8]} />
        <meshStandardMaterial color={COLORS.ventDuct} roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  );
}

// ---- Ventilation Fan ----
function VentFan({ position }: { position: [number, number, number] }) {
  const fanRef = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    if (fanRef.current) {
      fanRef.current.rotation.z += delta * 5;
    }
  });

  return (
    <group position={position}>
      {/* Fan housing */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.35, 0.05, 8, 16]} />
        <meshStandardMaterial color={COLORS.ventDuct} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Fan blades */}
      <group ref={fanRef}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (Math.PI / 2) * i]} position={[0, 0, 0]}>
            <boxGeometry args={[0.5, 0.08, 0.02]} />
            <meshStandardMaterial color={COLORS.fanBlade} metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---- Pipe / Cable run along tunnel ----
function CableRun({ start, end }: { start: THREE.Vector3; end: THREE.Vector3 }) {
  const dir = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
  const length = useMemo(() => dir.length(), [dir]);
  const midpoint = useMemo(() => new THREE.Vector3().lerpVectors(start, end, 0.5), [start, end]);
  const angle = useMemo(() => Math.atan2(dir.x, dir.z), [dir]);

  return (
    <group>
      {/* Cable 1 */}
      <mesh
        position={[midpoint.x - 1.5, midpoint.y + 0.8, midpoint.z]}
        rotation={[Math.PI / 2, 0, angle]}
      >
        <cylinderGeometry args={[0.03, 0.03, length, 4]} />
        <meshStandardMaterial color="#CC4400" roughness={0.7} />
      </mesh>
      {/* Cable 2 */}
      <mesh
        position={[midpoint.x - 1.5, midpoint.y + 0.6, midpoint.z]}
        rotation={[Math.PI / 2, 0, angle]}
      >
        <cylinderGeometry args={[0.03, 0.03, length, 4]} />
        <meshStandardMaterial color="#2255AA" roughness={0.7} />
      </mesh>
    </group>
  );
}

// ---- Main TunnelNetwork Component ----
export default function TunnelNetwork() {
  return (
    <group>
      {TUNNEL_LAYOUT.map((segment, i) => (
        <TunnelSegment
          key={i}
          start={segment.start}
          end={segment.end}
          depth={segment.depth}
        />
      ))}

      {/* Ventilation ducts along some tunnels */}
      <VentilationDuct start={TUNNEL_LAYOUT[2].start} end={TUNNEL_LAYOUT[2].end} />
      <VentilationDuct start={TUNNEL_LAYOUT[4].start} end={TUNNEL_LAYOUT[4].end} />

      {/* Vent fans at tunnel ends */}
      <VentFan position={[-15, -5.5, 2]} />
      <VentFan position={[-18, -11.5, 1]} />

      {/* Cable runs */}
      <CableRun start={TUNNEL_LAYOUT[2].start} end={TUNNEL_LAYOUT[2].end} />
      <CableRun start={TUNNEL_LAYOUT[3].start} end={TUNNEL_LAYOUT[3].end} />
      <CableRun start={TUNNEL_LAYOUT[5].start} end={TUNNEL_LAYOUT[5].end} />
    </group>
  );
}
