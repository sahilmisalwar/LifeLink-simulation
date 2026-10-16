// ============================================================
// LIFElink — Terrain: Sky, Ground, Rock Strata Cross-Section
// ============================================================

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { COLORS, MINE } from '../utils/constants';

// ---- Clouds ----
function Clouds() {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.position.x += delta * 0.3;
      if (groupRef.current.position.x > 40) {
        groupRef.current.position.x = -40;
      }
    }
  });

  const clouds = useMemo(() => {
    const items: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
    for (let i = 0; i < 12; i++) {
      items.push({
        pos: [
          (Math.random() - 0.5) * 70,
          25 + Math.random() * 10,
          (Math.random() - 0.5) * 50,
        ],
        scale: [
          4 + Math.random() * 6,
          1.5 + Math.random() * 1.5,
          3 + Math.random() * 4,
        ],
      });
    }
    return items;
  }, []);

  return (
    <group ref={groupRef}>
      {clouds.map((c, i) => (
        <mesh key={i} position={c.pos} scale={c.scale}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial
            color="#ffffff"
            transparent
            opacity={0.6}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  );
}

// ---- Surface Grass / Ground ----
function SurfaceGround() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(MINE.terrainWidth, MINE.terrainDepth, 80, 60);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Cut away — push cutaway region vertices way down so they disappear
      const inCutaway =
        x > -MINE.cutawayWidth / 2 + 2 &&
        x < MINE.cutawayWidth / 2 - 5 &&
        z > -MINE.cutawayDepth / 2 + 5;

      if (inCutaway) {
        pos.setY(i, -50); // Far below — invisible
      } else {
        const noise =
          Math.sin(x * 0.08) * Math.cos(z * 0.06) * 1.2 +
          Math.sin(x * 0.15 + 2) * Math.cos(z * 0.12 + 1) * 0.5;
        pos.setY(i, noise + 0.3);
      }
    }

    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial
        color={COLORS.grass}
        roughness={0.9}
        metalness={0.05}
      />
    </mesh>
  );
}

// ---- Rock Wall Face (single vertical slab representing a stratum layer) ----
function RockWallFace({
  y,
  height,
  color,
  side,
  roughness = 0.88,
}: {
  y: number;
  height: number;
  color: string;
  side: 'back' | 'left' | 'right' | 'bottom';
  roughness?: number;
}) {
  const w = MINE.cutawayWidth - 4;
  const d = MINE.cutawayDepth - 6;

  let position: [number, number, number];
  let size: [number, number, number];

  switch (side) {
    case 'back':
      // Back wall of the cutaway (far Z side)
      position = [0, y, -d / 2 + 5];
      size = [w, height, 0.8];
      break;
    case 'left':
      // Left wall
      position = [-w / 2, y, 5];
      size = [0.8, height, d];
      break;
    case 'right':
      // Right wall
      position = [w / 2 - 3, y, 5];
      size = [0.8, height, d];
      break;
    case 'bottom':
      // Floor
      position = [0, y - height / 2, 5];
      size = [w, 0.8, d];
      break;
  }

  return (
    <mesh position={position!} receiveShadow castShadow>
      <boxGeometry args={size!} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={0.08} />
    </mesh>
  );
}

// ---- Complete Rock Cross-Section (back wall + left wall + bottom) ----
function RockCrossSection() {
  // Build layered strata — each layer is a thin slab on the back wall and left wall
  const layers = useMemo(() => {
    let y = -0.5;
    const result: { y: number; height: number; color: string }[] = [];

    result.push({ y: y - MINE.topsoilHeight / 2, height: MINE.topsoilHeight, color: COLORS.topsoil });
    y -= MINE.topsoilHeight;

    result.push({ y: y - MINE.sandstoneHeight / 2, height: MINE.sandstoneHeight, color: COLORS.sandstone });
    y -= MINE.sandstoneHeight;

    result.push({ y: y - MINE.limestoneHeight / 2, height: MINE.limestoneHeight, color: COLORS.limestone });
    y -= MINE.limestoneHeight;

    result.push({ y: y - MINE.darkRockHeight / 2, height: MINE.darkRockHeight, color: COLORS.darkRock });
    y -= MINE.darkRockHeight;

    result.push({ y: y - MINE.deepRockHeight / 2, height: MINE.deepRockHeight, color: COLORS.deepRock });

    return result;
  }, []);

  return (
    <group>
      {/* Back wall layers (visible rock face) */}
      {layers.map((layer, i) => (
        <RockWallFace key={`back-${i}`} y={layer.y} height={layer.height} color={layer.color} side="back" />
      ))}

      {/* Left wall layers */}
      {layers.map((layer, i) => (
        <RockWallFace key={`left-${i}`} y={layer.y} height={layer.height} color={layer.color} side="left" />
      ))}

      {/* Right wall (single dark rock) */}
      <mesh position={[MINE.cutawayWidth / 2 - 5, -MINE.totalDepth / 2, 5]} receiveShadow>
        <boxGeometry args={[0.8, MINE.totalDepth, MINE.cutawayDepth - 6]} />
        <meshStandardMaterial color={COLORS.darkRock} roughness={0.92} />
      </mesh>

      {/* Bottom floor */}
      <mesh position={[0, -MINE.totalDepth - 0.5, 5]} receiveShadow>
        <boxGeometry args={[MINE.cutawayWidth - 4, 0.8, MINE.cutawayDepth - 6]} />
        <meshStandardMaterial color={COLORS.deepRock} roughness={0.95} />
      </mesh>

      {/* Grass / topsoil edge at the surface boundary */}
      <GrassCutawayEdge />
    </group>
  );
}

// ---- Grass edge strip along the cutaway boundary ----
function GrassCutawayEdge() {
  const w = MINE.cutawayWidth - 4;
  const d = MINE.cutawayDepth - 6;
  const thickness = 1.2;

  return (
    <group>
      {/* Front edge (facing viewer) */}
      <mesh position={[0, -0.3, d / 2 + 5]} receiveShadow>
        <boxGeometry args={[w + 2, 1.0, thickness]} />
        <meshStandardMaterial color={COLORS.topsoil} roughness={0.9} />
      </mesh>
      {/* Right edge */}
      <mesh position={[w / 2 - 2, -0.3, 5]} receiveShadow>
        <boxGeometry args={[thickness, 1.0, d + 2]} />
        <meshStandardMaterial color={COLORS.topsoil} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ---- Main Terrain Component ----
export default function Terrain() {
  return (
    <group>
      <Sky
        distance={450000}
        sunPosition={[50, 40, -30]}
        inclination={0.52}
        azimuth={0.25}
        rayleigh={1.5}
        turbidity={3}
      />

      <Clouds />
      <SurfaceGround />
      <RockCrossSection />
    </group>
  );
}
