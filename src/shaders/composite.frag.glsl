// Final pass: bloom add -> ACES tonemap -> radial chromatic aberration
// -> grain -> vignette. One fullscreen pass, everything else stays quarter-res.

precision highp float;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uRes;
uniform float uTime;
uniform float uBloomStrength;
uniform float uAberration;
uniform float uGrain;
uniform float uFade;        // 0 during the intro hold, 1 once the piece is live

varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);

  // Aberration scales with radius, so the centre stays clean and only the
  // corners split — the way a real wide lens behaves.
  float amt = uAberration * r2;
  vec3 col;
  col.r = texture2D(uScene, uv - c * amt).r;
  col.g = texture2D(uScene, uv).g;
  col.b = texture2D(uScene, uv + c * amt).b;

  col += texture2D(uBloom, uv).rgb * uBloomStrength;

  col = aces(col * 1.05);

  // Grain in gamma space, animated per frame so it reads as film not texture.
  float g = hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain;

  col *= 1.0 - smoothstep(0.16, 0.78, r2) * 0.55;   // vignette

  col *= uFade;

  gl_FragColor = vec4(col, 1.0);
}
