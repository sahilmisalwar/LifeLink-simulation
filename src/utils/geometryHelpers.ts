// ============================================================
// LIFElink — Geometry Helper Utilities
// ============================================================

import * as THREE from 'three';

/**
 * Create a rounded-rectangle tunnel cross-section shape.
 */
export function createTunnelShape(width: number, height: number, radius: number): THREE.Shape {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);

  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);

  return shape;
}

/**
 * Create a path between two 3D points for tunnel extrusion.
 */
export function createTunnelPath(start: THREE.Vector3, end: THREE.Vector3): THREE.CatmullRomCurve3 {
  const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
  // Add slight curve for natural look
  mid.y += (Math.random() - 0.5) * 0.3;

  return new THREE.CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
}

/**
 * Create a rock-like displacement for terrain surfaces.
 */
export function displaceVertex(vertex: THREE.Vector3, amplitude: number, frequency: number): void {
  const noise =
    Math.sin(vertex.x * frequency) * Math.cos(vertex.z * frequency * 0.7) * amplitude +
    Math.sin(vertex.x * frequency * 2.3 + 1.7) * Math.cos(vertex.z * frequency * 1.3 + 0.5) * amplitude * 0.4;
  vertex.y += noise;
}

/**
 * Check if a point is within the cutaway region.
 */
export function isInCutaway(
  x: number,
  z: number,
  cutawayWidth: number,
  cutawayDepth: number,
  offset: [number, number] = [0, 5]
): boolean {
  const cx = x - offset[0];
  const cz = z - offset[1];
  return cx > -cutawayWidth / 2 && cx < cutawayWidth / 2 && cz > -cutawayDepth / 2 && cz < cutawayDepth / 2;
}

/**
 * Generate rail positions along a tunnel path.
 */
export function generateRailPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  count: number
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = new THREE.Vector3().lerpVectors(start, end, t);
    points.push(p);
  }
  return points;
}

/**
 * Create support beam positions along a tunnel.
 */
export function generateSupportBeamPositions(
  start: THREE.Vector3,
  end: THREE.Vector3,
  spacing: number
): THREE.Vector3[] {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  const count = Math.floor(length / spacing);
  const positions: THREE.Vector3[] = [];

  for (let i = 1; i < count; i++) {
    const t = i / count;
    const p = new THREE.Vector3().lerpVectors(start, end, t);
    positions.push(p);
  }
  return positions;
}
