// Tiny geometry merger: combines several simple geometries, each tinted a
// flat colour, into ONE BufferGeometry with vertex colours. Paired with a
// single MeshLambertMaterial({ vertexColors: true }) it turns a many-part
// model (a car body, a person) into a single draw call without textures.
import * as THREE from 'three';

const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);
const _color = new THREE.Color();

// parts: [{ geo, color, x, y, z, rx, ry, rz, sx, sy, sz }]
// Geometries are converted to non-indexed form, transformed, tinted and
// concatenated. The source geometries are not modified.
export function mergeColored(parts) {
  let total = 0;
  const prepared = parts.map((part) => {
    const geo = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    _euler.set(part.rx || 0, part.ry || 0, part.rz || 0);
    _quat.setFromEuler(_euler);
    _pos.set(part.x || 0, part.y || 0, part.z || 0);
    _scale.set(part.sx ?? 1, part.sy ?? 1, part.sz ?? 1);
    _mat.compose(_pos, _quat, _scale);
    geo.applyMatrix4(_mat);
    total += geo.attributes.position.count;
    return { geo, color: part.color };
  });

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  let offset = 0;
  for (const { geo, color } of prepared) {
    const n = geo.attributes.position.count;
    positions.set(geo.attributes.position.array, offset * 3);
    normals.set(geo.attributes.normal.array, offset * 3);
    _color.setHex(color);
    for (let i = 0; i < n; i += 1) {
      colors[(offset + i) * 3] = _color.r;
      colors[(offset + i) * 3 + 1] = _color.g;
      colors[(offset + i) * 3 + 2] = _color.b;
    }
    offset += n;
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return out;
}

export const coloredMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true });
