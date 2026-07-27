// Quarter-res bright-pass and separable blur, sharing one program.
// uMode 0 = threshold + downsample, uMode 1 = 9-tap gaussian along uDir.

precision mediump float;

uniform sampler2D uTex;
uniform vec2  uTexel;
uniform vec2  uDir;
uniform float uMode;
uniform float uThreshold;

varying vec2 vUv;

void main() {
  if (uMode < 0.5) {
    vec3 c = texture2D(uTex, vUv).rgb;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float k = max(lum - uThreshold, 0.0) / max(lum, 1e-4);
    gl_FragColor = vec4(c * k, 1.0);
  } else {
    // Linear-sampling gaussian: 5 taps buy a 9-tap kernel.
    vec2 o1 = uDir * uTexel * 1.3846153846;
    vec2 o2 = uDir * uTexel * 3.2307692308;
    vec3 c = texture2D(uTex, vUv).rgb * 0.2270270270;
    c += texture2D(uTex, vUv + o1).rgb * 0.3162162162;
    c += texture2D(uTex, vUv - o1).rgb * 0.3162162162;
    c += texture2D(uTex, vUv + o2).rgb * 0.0702702703;
    c += texture2D(uTex, vUv - o2).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }
}
