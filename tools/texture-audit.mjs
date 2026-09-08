// SPDX-License-Identifier: GPL-3.0-or-later
// Test-only WebGL storage audit. Reports logical texture bytes, not driver/VRAM overhead.
// Passed to Playwright addInitScript before Three.js creates its context.
export function installTextureAudit() {
  const p = WebGL2RenderingContext.prototype;
  const states = new WeakMap();
  const audits = [];
  function state(gl) {
    let s = states.get(gl);
    if (!s) {
      s = {
        unit: gl.TEXTURE0,
        bindings: new Map(),
        textures: new Map(),
        unsupported: [],
      };
      states.set(gl, s);
      audits.push(s);
    }
    return s;
  }
  const canonical = (gl, target) =>
    target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X &&
    target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
      ? gl.TEXTURE_CUBE_MAP
      : target;
  function current(gl, target) {
    const s = state(gl),
      texture = s.bindings.get(`${s.unit}/${canonical(gl, target)}`);
    if (!texture) return null;
    if (!s.textures.has(texture)) s.textures.set(texture, new Map());
    return s.textures.get(texture);
  }
  function bytes(gl, format, type) {
    const sized = new Map([
      [gl.R8, 1],
      [gl.RG8, 2],
      [gl.RGB8, 3],
      [gl.RGBA8, 4],
      [gl.SRGB8_ALPHA8, 4],
      [gl.RGBA16F, 8],
      [gl.RGBA32F, 16],
      [gl.RG16F, 4],
      [gl.RG32F, 8],
      [gl.DEPTH_COMPONENT16, 2],
      [gl.DEPTH_COMPONENT24, 4],
      [gl.DEPTH_COMPONENT32F, 4],
      [gl.DEPTH24_STENCIL8, 4],
    ]);
    if (sized.has(format)) return sized.get(format);
    const channels = new Map([
      [gl.RED, 1],
      [gl.RG, 2],
      [gl.RGB, 3],
      [gl.RGBA, 4],
      [gl.DEPTH_COMPONENT, 1],
    ]).get(format);
    const scalar = new Map([
      [gl.UNSIGNED_BYTE, 1],
      [gl.UNSIGNED_SHORT, 2],
      [gl.HALF_FLOAT, 2],
      [gl.UNSIGNED_INT, 4],
      [gl.FLOAT, 4],
    ]).get(type);
    if (channels && scalar) return channels * scalar;
    state(gl).unsupported.push({ format, type });
    return 0;
  }
  function wrap(name, observe) {
    const original = p[name];
    p[name] = function (...args) {
      const result = original.apply(this, args);
      observe.call(this, ...args);
      return result;
    };
  }
  wrap("activeTexture", function (unit) {
    state(this).unit = unit;
  });
  wrap("bindTexture", function (target, texture) {
    const s = state(this);
    s.bindings.set(`${s.unit}/${target}`, texture);
  });
  wrap("deleteTexture", function (texture) {
    state(this).textures.delete(texture);
  });
  function storage(target, levels, format, width, height, depth = 1) {
    const records = current(this, target);
    if (!records) return;
    const pixel = bytes(this, format),
      faces = target === this.TEXTURE_CUBE_MAP ? 6 : 1;
    for (let level = 0; level < levels; level++) {
      records.set(`${target}/${level}`, {
        width,
        height,
        depth,
        format,
        bytes: width * height * depth * pixel * faces,
      });
      width = Math.max(1, width >> 1);
      height = Math.max(1, height >> 1);
      if (target !== this.TEXTURE_2D_ARRAY) depth = Math.max(1, depth >> 1);
    }
  }
  wrap("texStorage2D", storage);
  wrap("texStorage3D", storage);
  wrap("texImage2D", function (...args) {
    const [target, level, format] = args;
    let width, height, type;
    if (args.length >= 9) {
      width = args[3];
      height = args[4];
      type = args[7];
    } else {
      const source = args[5];
      width = source?.width ?? source?.videoWidth;
      height = source?.height ?? source?.videoHeight;
      type = args[4];
    }
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      state(this).unsupported.push({ method: "texImage2D", args: args.length });
      return;
    }
    current(this, target)?.set(`${target}/${level}`, {
      width,
      height,
      depth: 1,
      format,
      bytes: width * height * bytes(this, format, type),
    });
  });
  wrap("generateMipmap", function (target) {
    const records = current(this, target);
    if (!records) return;
    for (const [key, record] of [...records])
      if (key.endsWith("/0")) {
        const baseTarget = key.split("/")[0];
        let { width, height, depth } = record,
          level = 0;
        const pixel = record.bytes / (width * height * depth);
        while (width > 1 || height > 1) {
          width = Math.max(1, width >> 1);
          height = Math.max(1, height >> 1);
          level++;
          records.set(`${baseTarget}/${level}`, {
            ...record,
            width,
            height,
            bytes: width * height * depth * pixel,
          });
        }
      }
  });
  wrap(
    "texImage3D",
    function (
      target,
      level,
      format,
      width,
      height,
      depth,
      border,
      external,
      type,
    ) {
      current(this, target)?.set(`${target}/${level}`, {
        width,
        height,
        depth,
        format,
        bytes: width * height * depth * bytes(this, format, type),
      });
    },
  );
  for (const name of ["compressedTexImage2D", "compressedTexImage3D"])
    wrap(name, function () {
      state(this).unsupported.push({ method: name });
    });
  Object.defineProperty(window, "__textureAudit", {
    get() {
      return audits.map((s) => ({
        bytes: [...s.textures.values()].reduce(
          (sum, levels) =>
            sum + [...levels.values()].reduce((n, r) => n + r.bytes, 0),
          0,
        ),
        textures: [...s.textures.values()].map((levels) => [
          ...levels.values(),
        ]),
        unsupported: s.unsupported,
      }));
    },
  });
}
