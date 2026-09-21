// SPDX-License-Identifier: GPL-3.0-or-later
// Integer lattice hashing keeps CPU planting and GPU turf pigment aligned.
// A sin/fract hash diverges after float rounding in the shader.
function lattice(x: number, y: number) {
  let n = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841);
  n = Math.imul(n ^ (n >>> 13), 0x85ebca6b);
  return ((n ^ (n >>> 16)) & 0xffff) / 65535;
}
function cover(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy) * (1 - fx) + lattice(ix + 1, iy) * fx;
  const b = lattice(ix, iy + 1) * (1 - fx) + lattice(ix + 1, iy + 1) * fx;
  return a * (1 - fy) + b * fy;
}
export function groundCover(x: number, y: number) {
  return .72 * cover(x * .18, y * .18) + .28 * cover(x * .43 + 3, y * .43 + 7);
}
export const groundCoverGLSL = `
  float turfHash(ivec2 p) {
    uint n = uint(p.x) * 0x8da6b343u ^ uint(p.y) * 0xd8163841u;
    n = (n ^ (n >> 13u)) * 0x85ebca6bu;
    return float((n ^ (n >> 16u)) & 65535u) / 65535.;
  }
  float turfCover(vec2 p) {
    ivec2 i = ivec2(floor(p)); vec2 f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(turfHash(i),turfHash(i+ivec2(1,0)),f.x),
      mix(turfHash(i+ivec2(0,1)),turfHash(i+ivec2(1,1)),f.x),f.y);
  }
  float groundCover(vec2 p) {
    return .72*turfCover(p*.18) + .28*turfCover(p*.43+vec2(3.,7.));
  }
`;
