import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const BodycamShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDistortion: { value: 0.14 },
    uChromatic: { value: 0.0018 },
    uGrain: { value: 0.014 },
    uShock: { value: 0.0 },
    uExposureBoost: { value: 1.0 },
    uAspect: { value: 1.777 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDistortion;
    uniform float uChromatic;
    uniform float uGrain;
    uniform float uShock;
    uniform float uExposureBoost;
    uniform float uAspect;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec2 barrelDistort(vec2 uv, float k) {
      vec2 centered = (uv - 0.5) * 0.91;
      centered.x *= uAspect;
      float r2 = dot(centered, centered);
      float factor = 1.0 + k * r2 + (k * 0.45) * r2 * r2;
      vec2 distorted = centered * factor;
      distorted.x /= uAspect;
      return distorted + 0.5;
    }

    void main() {
      vec2 dUv = barrelDistort(vUv, uDistortion);

      // Subtle wide-angle bodycam rounded bezel corners
      if (dUv.x < 0.0 || dUv.x > 1.0 || dUv.y < 0.0 || dUv.y > 1.0) {
        gl_FragColor = vec4(0.01, 0.01, 0.012, 1.0);
        return;
      }

      vec2 dir = dUv - 0.5;
      float dist = length(dir);
      float caAmt = uChromatic * (0.4 + dist * 1.9) + uShock * 0.012;

      // Subtle camera sensor horizontal glitch line during severe shock
      float tear = 0.0;
      if (uShock > 0.15) {
        float rowNoise = rand(vec2(floor(dUv.y * 90.0), floor(uTime * 28.0)));
        if (rowNoise > 0.92) {
          tear = (rowNoise - 0.92) * 0.38 * uShock;
        }
      }

      vec2 sampleUv = dUv + vec2(tear, 0.0);
      float r = texture2D(tDiffuse, clamp(sampleUv + dir * caAmt, 0.001, 0.999)).r;
      float g = texture2D(tDiffuse, clamp(sampleUv, 0.001, 0.999)).g;
      float b = texture2D(tDiffuse, clamp(sampleUv - dir * caAmt, 0.001, 0.999)).b;

      vec3 col = vec3(r, g, b) * uExposureBoost;

      // Subtle radial shock blur when suppressed or damaged
      if (uShock > 0.02) {
        vec3 blurCol = (
          texture2D(tDiffuse, clamp(sampleUv + dir * 0.009 * uShock, 0.001, 0.999)).rgb +
          texture2D(tDiffuse, clamp(sampleUv - dir * 0.009 * uShock, 0.001, 0.999)).rgb
        ) * 0.5;
        col = mix(col, blurCol * uExposureBoost, min(0.55, uShock * 0.65));
      }

      // Fine filmic CMOS sensor grain (gentle low-light texture without speckling)
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      float noise = (rand(dUv * 1400.0 + fract(uTime * 37.0)) - 0.5);
      float shadowBoost = mix(1.25, 0.45, clamp(luma * 1.5, 0.0, 1.0));
      col += noise * uGrain * shadowBoost;

      // Micro-scanline CMOS texture
      float scan = sin(dUv.y * 960.0) * 0.004;
      col *= (1.0 - scan);

      // Optical lens edge falloff
      float vig = smoothstep(0.95, 0.36, dist * (1.0 + uDistortion * 0.4));
      col *= mix(0.66, 1.0, vig);

      // Crisp tactical bodycam color grade
      col = pow(max(col, vec3(0.0)), vec3(0.96));
      col = mix(col, col * vec3(0.96, 0.99, 1.04), 0.22);

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

export class BodycamPostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    const w = window.innerWidth;
    const h = window.innerHeight;

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.42, 0.84);
    this.composer.addPass(this.bloomPass);

    this.bodycamPass = new ShaderPass(BodycamShader);
    this.bodycamPass.uniforms.uAspect.value = w / Math.max(1, h);
    this.composer.addPass(this.bodycamPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.baseDistortion = 0.095;
    this.baseChromatic = 0.0018;
    this.shock = 0;
    this.enabled = true;
    this.setProfile('realistic');
  }

  setProfile(profile) {
    if (profile === 'extreme') {
      this.baseDistortion = 0.16;
      this.baseChromatic = 0.003;
      this.bodycamPass.uniforms.uGrain.value = 0.022;
    } else if (profile === 'tactical') {
      this.baseDistortion = 0.05;
      this.baseChromatic = 0.0011;
      this.bodycamPass.uniforms.uGrain.value = 0.009;
    } else {
      this.baseDistortion = 0.095;
      this.baseChromatic = 0.0018;
      this.bodycamPass.uniforms.uGrain.value = 0.015;
    }
    this.bodycamPass.uniforms.uDistortion.value = this.baseDistortion;
    this.bodycamPass.uniforms.uChromatic.value = this.baseChromatic;
  }

  setQuality(quality) {
    if (quality === 'perf') {
      this.bloomPass.enabled = false;
      this.enabled = false;
    } else if (quality === 'high') {
      this.bloomPass.enabled = true;
      this.bloomPass.strength = 0.26;
      this.enabled = true;
    } else {
      this.bloomPass.enabled = true;
      this.bloomPass.strength = 0.38;
      this.enabled = true;
    }
  }

  triggerShock(amount) {
    this.shock = Math.min(1.0, Math.max(this.shock, amount));
  }

  resize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    this.bodycamPass.uniforms.uAspect.value = width / Math.max(1, height);
  }

  update(dt, timeSec, recoilKick = 0, exposureBoost = 1.0) {
    this.shock = Math.max(0, this.shock - dt * 2.1);
    const u = this.bodycamPass.uniforms;
    u.uTime.value = timeSec;
    u.uShock.value = this.shock;
    u.uDistortion.value = this.baseDistortion + recoilKick * 0.08 + this.shock * 0.06;
    u.uChromatic.value = this.baseChromatic + recoilKick * 0.005;
    u.uExposureBoost.value += (exposureBoost - u.uExposureBoost.value) * Math.min(1, dt * 3.5);
  }

  render() {
    if (this.enabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
