// ORA — post chain: bloom + film grain + vignette, all TSL (WGSL + GLSL).
import * as THREE from 'three/webgpu';
import { pass, screenUV, hash, smoothstep, mix, float } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export function createPost(renderer, scene, camera, U) {
  const post = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');

  const bloomNode = bloom(color, 0.85, 0.6, 0.08);

  // nested hash: inner pass whitens each row so no correlated streaks survive
  const rowSeed = hash(screenUV.y.mul(8191.7).add(U.time.mul(0.913).fract().mul(37.0)));
  const grain = hash(screenUV.x.mul(4099.1).add(rowSeed.mul(1013.9)))
    .sub(0.5).mul(0.014);

  const vig = mix(
    float(0.72), float(1.0),
    smoothstep(1.35, 0.35, screenUV.sub(0.5).length().mul(2.0)),
  );

  const withBloom = color.add(bloomNode).mul(vig).add(grain);
  const noBloom = color.mul(vig).add(grain);

  post.outputNode = withBloom;

  return {
    post,
    bloomNode,
    setBloom(on) {
      post.outputNode = on ? withBloom : noBloom;
      post.needsUpdate = true;
    },
  };
}
