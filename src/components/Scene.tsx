// ============================================================
// LIFElink — Scene: R3F Canvas, Lighting, Camera
// ============================================================

import { useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import Terrain from './Terrain';
import TunnelNetwork from './TunnelNetwork';
import MineEntrance from './MineEntrance';
import SurveillanceRoom from './SurveillanceRoom';
import Workers from './Workers';
import Equipment from './Equipment';
import Particles from './Particles';
import MeshNetwork from './MeshNetwork';
import EmergencyEffects from './EmergencyEffects';

import { CAMERA } from '../utils/constants';
import { useSimulationStore } from '../stores/simulationStore';

// ---- Camera Controller ----
function CameraController() {
  const controlsRef = useRef<any>(null);
  const shouldReset = useSimulationStore((s) => s.shouldResetCamera);
  const clearReset = useSimulationStore((s) => s.clearCameraReset);
  const setLoaded = useSimulationStore((s) => s.setLoaded);
  const { camera } = useThree();

  useEffect(() => {
    // Signal loaded after first frame
    const timeout = setTimeout(() => setLoaded(true), 1500);
    return () => clearTimeout(timeout);
  }, [setLoaded]);

  useEffect(() => {
    if (shouldReset && controlsRef.current) {
      const controls = controlsRef.current;
      camera.position.set(...CAMERA.defaultPosition);
      controls.target.set(...CAMERA.defaultTarget);
      controls.update();
      clearReset();
    }
  }, [shouldReset, camera, clearReset]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={CAMERA.defaultTarget}
      enableDamping
      dampingFactor={0.08}
      minDistance={CAMERA.minDistance}
      maxDistance={CAMERA.maxDistance}
      minPolarAngle={CAMERA.minPolarAngle}
      maxPolarAngle={CAMERA.maxPolarAngle}
      enablePan
      panSpeed={0.5}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
    />
  );
}

// ---- Scene Lighting ----
function SceneLighting() {
  return (
    <>
      {/* Main sunlight */}
      <directionalLight
        position={[30, 40, -20]}
        intensity={2}
        color="#FFF8E7"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={100}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.001}
      />

      {/* Ambient fill — high for underground visibility */}
      <ambientLight intensity={0.7} color="#B0B8C8" />

      {/* Hemisphere light for natural outdoor feel */}
      <hemisphereLight
        args={['#87CEEB', '#B0A090', 0.8]}
      />

      {/* Underground fill lights — strong, wide coverage */}
      <pointLight position={[-5, -5, 1]} intensity={8} color="#FFD090" distance={35} decay={1.5} />
      <pointLight position={[5, -6, -1]} intensity={8} color="#FFD090" distance={35} decay={1.5} />
      <pointLight position={[-10, -11, 1]} intensity={8} color="#FFC880" distance={35} decay={1.5} />
      <pointLight position={[4, -12, -1]} intensity={8} color="#FFC880" distance={35} decay={1.5} />
      <pointLight position={[-6, -15, 2]} intensity={6} color="#FFC070" distance={30} decay={1.5} />
      <pointLight position={[0, -3, 0]} intensity={5} color="#FFD8A0" distance={25} decay={1.5} />
    </>
  );
}

// ---- Main Scene Component ----
export default function Scene() {
  return (
    <Canvas
      camera={{
        position: CAMERA.defaultPosition,
        fov: CAMERA.fov,
        near: CAMERA.near,
        far: CAMERA.far,
      }}
      shadows
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <SceneLighting />
      <CameraController />

      {/* Fog for depth */}
      <fog attach="fog" args={['#1a1a2e', 70, 160]} />

      {/* Scene elements */}
      <Terrain />
      <TunnelNetwork />
      <MineEntrance />
      <SurveillanceRoom />
      <Workers />
      <Equipment />
      <Particles />
      <MeshNetwork />
      <EmergencyEffects />
    </Canvas>
  );
}
