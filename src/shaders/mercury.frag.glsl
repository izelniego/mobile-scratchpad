// MERCURY — raymarched metaball liquid.
// Quality tier is compiled in via MAX_STEPS / INSIDE_STEPS / DISPERSION defines,
// so every loop bound is a compile-time constant (GLSL ES 1.00 safe, and the
// driver gets to unroll).

precision highp float;

#define BALLS 16

uniform vec2  uRes;
uniform float uTime;
uniform vec4  uBalls[BALLS];   // xyz = centre, w = radius. Unused slots parked far away.
uniform float uK;              // smooth-min blend factor — surface tension
uniform float uMat;            // 0 chrome .. 1 glass .. 2 obsidian (continuous)
uniform vec3  uBoundC;         // bounding sphere of the whole mass
uniform float uBoundR;
uniform float uEnergy;         // 0..1 agitation, drives emissive rim
uniform vec3  uCamPos;
uniform float uFocal;
uniform float uHue;            // 0..1 around the wheel
uniform float uTint;           // 0 = the neutral studio, 1 = fully coloured

varying vec2 vUv;

// ---------------------------------------------------------------- distance field

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < BALLS; i++) {
    vec4 b = uBalls[i];
    d = smin(d, length(p - b.xyz) - b.w, uK);
  }
  return d;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0016;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
                   e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// Ray/sphere used as a bounding-volume early out. Most pixels never enter the
// march at all, which is what makes this affordable on a phone.
vec2 sphIntersect(vec3 ro, vec3 rd, vec3 ce, float ra) {
  vec3 oc = ro - ce;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - ra * ra;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

// ---------------------------------------------------------------- environment

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Pushes a light's colour toward the chosen hue while holding on to its
// original brightness, so tinting the studio never silently dims it.
vec3 tinted(vec3 base, vec3 hue, float amount) {
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  return mix(base, hue * lum * 1.35, amount);
}

// Analytic studio. There is no HDRI here — the ceiling, key, rim and kicker are
// all closed-form, which is why the whole app ships with zero assets.
//
// The large bright upper hemisphere is the important part: chrome only reads as
// chrome when it has a broad area to reflect, not a lone specular dot. The room
// itself stays black (see background) so the lights read as off-frame studio
// heads and the specimen is the only lit thing on screen.
vec3 env(vec3 d) {
  float up = d.y * 0.5 + 0.5;
  vec3 hue = hsv2rgb(vec3(uHue, 0.85, 1.0));

  // Ambient gradient, kept dim. A mirror needs contrast, not overall
  // brightness — a uniformly lit room renders chrome as flat grey fog.
  vec3 c = mix(tinted(vec3(0.020, 0.024, 0.034), hue, uTint),
               tinted(vec3(0.30, 0.34, 0.42), hue, uTint), pow(up, 2.1));

  // Two hard-edged strip lights. These are what actually sell polished metal:
  // the surface picks them up as crisp bright bands that shear and wrap as the
  // mass moves, which is how a real chrome render is lit. They stay near-neutral
  // at every hue — colour the strips and the material stops reading as metal.
  float strip1 = smoothstep(0.30, 0.40, d.y) * (1.0 - smoothstep(0.58, 0.70, d.y));
  c += tinted(vec3(1.00, 0.98, 0.94), hue, uTint * 0.15) * strip1 * 2.60;

  float strip2 = smoothstep(-0.28, -0.20, d.y) * (1.0 - smoothstep(-0.06, 0.02, d.y));
  c += tinted(vec3(0.42, 0.58, 0.92), hue, uTint * 0.75) * strip2 * 0.85;

  // Key, with a hot core inside a broad falloff. Also held near-neutral.
  vec3 keyDir = normalize(vec3(-0.38, 0.78, 0.50));
  float kd = max(dot(d, keyDir), 0.0);
  c += tinted(vec3(1.00, 0.96, 0.90), hue, uTint * 0.15) *
       (pow(kd, 64.0) * 26.0 + pow(kd, 6.0) * 1.10);

  // Rim and kicker carry most of the colour — they are the two lights whose
  // whole job is to say something about the room the specimen sits in.
  vec3 rimDir = normalize(vec3(0.90, -0.10, -0.42));
  c += tinted(vec3(0.24, 0.48, 1.00), hue, uTint) *
       pow(max(dot(d, rimDir), 0.0), 7.0) * 2.30;

  vec3 kickDir = normalize(vec3(-0.74, -0.44, 0.30));
  // Offset so the kicker sits opposite the rim on the wheel and the two never
  // collapse into one flat colour.
  vec3 kickHue = hsv2rgb(vec3(fract(uHue + 0.12), 0.85, 1.0));
  c += tinted(vec3(1.00, 0.60, 0.32), kickHue, uTint) *
       pow(max(dot(d, kickDir), 0.0), 9.0) * 1.05;

  // Horizon seam and floor falloff.
  c += tinted(vec3(0.20, 0.24, 0.33), hue, uTint) * pow(1.0 - abs(d.y), 26.0) * 0.85;
  c = mix(c, tinted(vec3(0.013, 0.014, 0.020), hue, uTint),
          smoothstep(0.0, -0.55, d.y) * 0.78);
  return c;
}

// ---------------------------------------------------------------- lighting terms

float softShadow(vec3 ro, vec3 rd, float w) {
  float res = 1.0, t = 0.05;
  for (int i = 0; i < 22; i++) {
    float h = map(ro + rd * t);
    res = min(res, h / (w * t));
    t += clamp(h, 0.03, 0.28);
    if (res < -1.0 || t > 5.0) break;
  }
  res = max(res, -1.0);
  return 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.02 + 0.15 * float(i) / 4.0;
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.80;
  }
  return clamp(1.0 - 1.7 * occ, 0.0, 1.0);
}

float ggx(vec3 n, vec3 v, vec3 l, float rough) {
  vec3 h = normalize(v + l);
  float a = rough * rough;
  float a2 = a * a;
  float ndh = max(dot(n, h), 0.0);
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * d * d, 1e-4);
}

// ---------------------------------------------------------------- transmission

// March the interior. Inside the field map() is negative, so -map() is the
// distance to the wall from within.
vec3 marchInside(vec3 ro, vec3 rd, out float dist, out bool converged) {
  float t = 0.0;
  converged = false;
  for (int i = 0; i < INSIDE_STEPS; i++) {
    float d = -map(ro + rd * t);
    if (d < 0.0015) { converged = true; break; }
    t += max(d, 0.008);
    if (t > 7.0) { converged = true; break; }
  }
  dist = t;
  return ro + rd * t;
}

// One full refraction path: in through the surface, across the interior, out.
vec3 transmit(vec3 p, vec3 n, vec3 rd, float ior, out float thickness) {
  vec3 rdIn = refract(rd, n, 1.0 / ior);
  thickness = 0.0;
  if (dot(rdIn, rdIn) < 1e-4) return env(reflect(rd, n));

  bool converged;
  vec3 pExit = marchInside(p - n * 0.012, rdIn, thickness, converged);

  // An unconverged exit point yields a garbage normal, and a garbage normal
  // yields a garbage refraction direction — which is exactly the salt-and-pepper
  // speckle it produces across the body of the mass. Fall back instead.
  if (!converged) return env(reflect(rd, n));

  vec3 nExit = -calcNormal(pExit);
  vec3 rdOut = refract(rdIn, nExit, ior);
  if (dot(rdOut, rdOut) < 1e-4) rdOut = reflect(rdIn, nExit);

  // Beer–Lambert: deep paths go warm and dense, thin edges stay clear. Kept
  // gentle so the body of the mass still transmits instead of reading as a void.
  vec3 absorb = exp(-thickness * vec3(0.34, 0.21, 0.14) * 0.95);
  return env(rdOut) * absorb;
}

// Thin-film interference. Cheap two-term approximation — the phase shift with
// view angle is what sells the oil-slick edge.
//
// The clamp and the frequencies both matter: as cosTheta approaches grazing the
// phase sweeps through whole cycles between adjacent pixels, which aliases into
// RGB confetti along the silhouette rather than a fringe. A higher floor and
// gentler frequencies keep it a band.
vec3 iridescence(float cosTheta, float t) {
  float d = t / max(cosTheta, 0.22);
  return 0.5 + 0.5 * cos(vec3(d * 15.0, d * 18.0, d * 21.0) + vec3(0.0, 2.1, 4.2));
}

// ---------------------------------------------------------------- background

vec3 background(vec2 uv) {
  float r = length(uv);
  vec3 hue = hsv2rgb(vec3(uHue, 0.85, 1.0));
  // The backdrop takes a stronger dose than the lights: it is a wall, not a
  // source, so saturating it costs the material nothing.
  vec3 near = tinted(vec3(0.036, 0.041, 0.053), hue, uTint * 1.6);
  vec3 far  = tinted(vec3(0.0055, 0.0065, 0.0105), hue, uTint * 1.6);
  return mix(near, far, smoothstep(0.0, 1.25, r));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  vec3 ro = uCamPos;
  vec3 rd = normalize(vec3(uv, -uFocal));

  vec3 col = background(uv);

  vec2 bounds = sphIntersect(ro, rd, uBoundC, uBoundR);
  if (bounds.x > -0.5) {
    float t = max(bounds.x, 0.01);
    float tMax = bounds.y;
    bool hit = false;

    for (int i = 0; i < MAX_STEPS; i++) {
      vec3 p = ro + rd * t;
      float d = map(p);
      if (d < 0.0012 * t + 0.0006) { hit = true; break; }
      t += d;
      if (t > tMax) break;
    }

    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = calcNormal(p);
      vec3 v = -rd;
      float ndv = max(dot(n, v), 0.0);

      float ao = calcAO(p, n);
      vec3 lightDir = normalize(vec3(-0.42, 0.74, 0.52));
      float sh = softShadow(p + n * 0.02, lightDir, 0.10);

      float fres = pow(1.0 - ndv, 5.0);
      vec3 refl = env(reflect(rd, n));
      float spec = ggx(n, v, lightDir, 0.085) * sh;

      // Continuous three-way material blend; the weights always sum to 1.
      float mChrome = clamp(1.0 - uMat, 0.0, 1.0);
      float mGlass  = clamp(1.0 - abs(uMat - 1.0), 0.0, 1.0);
      float mObs    = clamp(uMat - 1.0, 0.0, 1.0);

      vec3 surf = vec3(0.0);

      // --- liquid chrome: reflection-dominated, faintly blue-cool at grazing angles
      vec3 tintChrome = mix(vec3(0.80, 0.845, 0.92), vec3(1.0), fres);
      surf += mChrome * (refl * tintChrome * mix(0.55, 1.0, ao) +
                         vec3(1.0, 0.97, 0.93) * spec * 2.6);

      // --- dispersive glass and obsidian both need the interior walk, so it is
      // computed once and shared rather than marched twice.
      if (mGlass + mObs > 0.004) {
        float th;
        vec3 tr;
        #ifdef DISPERSION
          // Three interior traversals at slightly different IORs. This is the
          // single most expensive thing in the shader and the first casualty
          // when the quality ladder drops a rung.
          float t0, t1, t2;
          vec3 cr = transmit(p, n, rd, 1.430, t0);
          vec3 cg = transmit(p, n, rd, 1.470, t1);
          vec3 cb = transmit(p, n, rd, 1.512, t2);
          tr = vec3(cr.r, cg.g, cb.b);
          th = t1;
        #else
          tr = transmit(p, n, rd, 1.470, th);
        #endif

        vec3 film = iridescence(ndv, 0.62 + 0.35 * sin(uTime * 0.20));
        vec3 glass = mix(tr, refl, clamp(0.05 + 0.95 * fres, 0.0, 1.0));
        // Faded out at the extreme rim, where the film term aliases fastest.
        glass += film * fres * 0.90 * mix(0.6, 1.0, ao) * smoothstep(0.0, 0.17, ndv);
        glass += vec3(1.0, 0.97, 0.93) * spec * 1.9;
        surf += mGlass * glass;

        // Obsidian reads as near-black stone that only lets light through where
        // the mass is thin — the tendrils glow, the body does not.
        float thin = exp(-th * 2.6);
        vec3 obs = refl * 0.13 * ao +
                   vec3(0.42, 0.20, 0.52) * thin * 0.85 +
                   vec3(1.0, 0.97, 0.93) * spec * 0.9 +
                   vec3(0.30, 0.34, 0.46) * fres * 0.55;
        surf += mObs * obs;
      }

      // Agitation rim: the mass flares along its silhouette when it is moving
      // fast or has just been shattered.
      surf += vec3(0.55, 0.72, 1.0) * pow(1.0 - ndv, 3.0) * uEnergy * 1.5;

      col = surf;

      // Fade the very edge of the silhouette into the ground so the cutout
      // never reads as a hard sticker.
      col = mix(background(uv), col, smoothstep(0.0, 0.035, ndv) * 0.92 + 0.08);
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
