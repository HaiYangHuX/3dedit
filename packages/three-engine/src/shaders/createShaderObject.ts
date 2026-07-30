import type { ShaderMethod } from '@digital-twin/scene-schema';
import {
  AdditiveBlending as ve,
  BufferAttribute as _,
  BufferGeometry as Ge,
  Color as H,
  CylinderGeometry as So,
  DoubleSide as J,
  Mesh as G,
  PlaneGeometry as pe,
  ShaderMaterial as he,
  Shape as La,
  Vector2 as Te,
  Vector3 as F,
  type Mesh,
} from 'three';

/**
 * 以下工厂逐项还原自原站 r183 生产包。Three 类型使用原压缩符号别名，
 * 目的是让 GLSL、uniform 和几何构造参数能与取证源码逐行比对，避免二次改写漂移。
 */
function createWarningShader() {
  const l = new pe(2, 2),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new H(1, 0, 0) },
        uIntensity: { value: 1 },
        uSpeed: { value: 1 },
        uRadius: { value: 0.5 },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uSpeed;
      uniform float uRadius;

      void main() {
        vec2 center = vec2(0.5, 0.5);
        float dis = length(vUv - center);

        if (dis > uRadius) {
          discard;
        }

        float p = 6.0;
        float phase = dis * p - uTime * uSpeed;
        float f = fract(phase);
        float r = f / 3.0 + step(0.99, f);

        gl_FragColor = vec4(uColor, r * uIntensity);
      }
    `,
    }),
    o = new G(l, t);
  return ((o.rotation.x = Math.PI / 2), (o.renderOrder = -1e3), o);
}
function createCompassShader() {
  const l = new pe(4, 4),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: { iTime: { value: 0 }, iResolution: { value: new Te(4, 4) } },
      vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }

    `,
      fragmentShader: `
            precision mediump float;
            float PI = 3.1415926;
            uniform float iTime;
            varying vec2 vUv;

            vec2 rotate(vec2 p, float rad) {
                float s = sin(rad);
                float c = cos(rad);
                return mat2(c, s, -s, c) * p;
            }

            float circle(float pre, vec2 p, float r1, float r2, float power) {
                float leng = length(p);
                float d = min(abs(leng-r1), abs(leng-r2));
                if (r1<leng && leng<r2) pre /= exp(d)/r2;
                return clamp(pre + power / d, 0.0, 1.0);
            }

            float rectangle(float pre, vec2 p, vec2 half1, vec2 half2, float power) {
                p = abs(p);
                if ((half1.x<p.x || half1.y<p.y) && (p.x<half2.x && p.y<half2.y)) {
                    pre = max(0.01, pre);
                }
                float dx1 = (p.y < half1.y) ? abs(half1.x-p.x) : length(p-half1);
                float dx2 = (p.y < half2.y) ? abs(half2.x-p.x) : length(p-half2);
                float dy1 = (p.x < half1.x) ? abs(half1.y-p.y) : length(p-half1);
                float dy2 = (p.x < half2.x) ? abs(half2.y-p.y) : length(p-half2);
                float d = min(min(dx1, dx2), min(dy1, dy2));
                return clamp(pre + power / d, 0.0, 1.0);
            }

            float radiation(float pre, vec2 p, float r1, float r2, int num, float power) {
                float angle = 2.0*PI/float(num);
                float d = 1e10;
                for(int i=0; i<36; i++) {
                    if (i>=num) break;
                    float _d = (r1<p.y && p.y<r2) ?
                        abs(p.x) :
                        min(length(p-vec2(0.0, r1)), length(p-vec2(0.0, r2)));
                    d = min(d, _d);
                    p = rotate(p, angle);
                }
                return clamp(pre + power / d, 0.0, 1.0);
            }

            vec3 calc(vec2 p) {
                float dst = 0.0;
                float timeFactor = iTime * PI / 6.0;
                p *= (sin(PI*iTime)*0.02+1.1);

                // Outer rings and radiation
                {
                    vec2 q = rotate(p, timeFactor);
                    dst = circle(dst, q, 0.85, 0.9, 0.006);
                    dst = radiation(dst, q, 0.87, 0.88, 36, 0.0008);
                }

                // Hexagon-like rectangles
                {
                    vec2 q = rotate(p, timeFactor);
                    const int n = 6;
                    float angle = PI / float(n);
                    q = rotate(q, floor(atan(q.x, q.y)/angle + 0.5) * angle);
                    float rectVal = 0.85/sqrt(2.0);
                    vec2 hSize = vec2(rectVal);
                    for(int i=0; i<n; i++) {
                        dst = rectangle(dst, q, hSize, hSize, 0.0015);
                        q = rotate(q, angle);
                    }
                }

                // Inner rings and dots
                {
                    vec2 q = rotate(p, timeFactor);
                    const int n = 12;
                    float angle = 2.0*PI / float(n);
                    q = rotate(q, angle * 0.5);
                    for(int i=0; i<n; i++) {
                        vec2 dotP = q - vec2(0.0, 0.875);
                        dst = circle(dst, dotP, 0.001, 0.05, 0.004);
                        dst = circle(dst, dotP, 0.001, 0.001, 0.008);
                        q = rotate(q, angle);
                    }
                }

                dst = circle(dst, p, 0.5, 0.55, 0.002);

                // Inner small decorations
                {
                    vec2 q = rotate(p, -timeFactor);
                    const int n = 3;
                    float angle = PI / float(n);
                    q = rotate(q, floor(atan(q.x, q.y)/angle + 0.5) * angle);
                    vec2 hSize = vec2(0.36);
                    for(int i=0; i<n; i++) {
                        dst = rectangle(dst, q, hSize, hSize, 0.0015);
                        q = rotate(q, angle);
                    }
                }

                {
                    vec2 q = rotate(p, -timeFactor);
                    const int n = 12;
                    float angle = 2.0*PI / float(n);
                    q = rotate(q, angle * 0.5);
                    for(int i=0; i<n; i++) {
                        vec2 dotP = q - vec2(0.0, 0.53);
                        dst = circle(dst, dotP, 0.001, 0.035, 0.004);
                        dst = circle(dst, dotP, 0.001, 0.001, 0.001);
                        q = rotate(q, angle);
                    }
                }

                {
                    vec2 q = rotate(p, timeFactor);
                    dst = radiation(dst, q, 0.25, 0.3, 12, 0.005);
                }

                {
                    vec2 q = p * (sin(PI*iTime)*0.04+1.1);
                    q = rotate(q, -timeFactor);
                    for(float i=0.0; i<6.0; i++) {
                        float r = 0.13-i*0.01;
                        q.x -= 0.1;
                        dst = circle(dst, q, r, r, 0.002);
                        q.x += 0.1;
                        q = rotate(q, -timeFactor * 2.0);
                    }
                    dst = circle(dst, q, 0.04, 0.04, 0.004);
                }

                return pow(dst, 2.5) * vec3(1.0, 0.95, 0.8);
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                vec3 color = calc(uv);
                float intensity = length(color);
                if (intensity < 0.01) discard;
                gl_FragColor = vec4(color, intensity);
            }
  `,
    }),
    o = new G(l, t);
  return ((o.rotation.x = Math.PI / 2), (o.renderOrder = -1e3), o);
}
function createRadarShader() {
  const l = new pe(3, 3),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Te(700, 700) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
      fragmentShader: `
    precision mediump float;
    #define SMOOTH(r,R) (1.0-smoothstep(R-1.0,R+1.0, r))
    #define RS(a,b,x) ( smoothstep(a-1.0,a+1.0,x)*(1.0-smoothstep(b-1.0,b+1.0,x)) )
    #define M_PI 3.141592653589793238

    #define blue1 vec3(0.74,0.95,1.00)
    #define blue2 vec3(0.87,0.98,1.00)
    #define blue3 vec3(0.35,0.76,0.83)

    uniform float iTime;
    uniform vec2 iResolution;
    varying vec2 vUv;

    float movingLine(vec2 uv, vec2 center, float radius)
    {
        float theta0 = 90.0 * iTime;
        vec2 d = uv - center;
        float r = length(d);

        if(r < radius)
        {
            float rad0 = theta0 * M_PI / 180.0;
            vec2 p = radius * vec2(cos(rad0), -sin(rad0));
            float l = length( d - p * clamp(dot(d, p) / dot(p, p), 0.0, 1.0));
            d /= r;

            float theta = mod(180.0 * atan(d.y, d.x) / M_PI + theta0, 360.0);
            float gradient = clamp(1.0 - theta / 90.0, 0.0, 1.0);

            float scanIntensity = SMOOTH(l, 2.0) + 0.8 * gradient;
            float trail = 1.0 - smoothstep(0.0, 60.0, theta);
            return scanIntensity + trail * 0.3;
        }
        return 0.0;
    }

    float circle(vec2 uv, vec2 center, float radius, float width)
    {
        float r = length(uv - center);
        return SMOOTH(r - width * 0.5, radius) - SMOOTH(r + width * 0.5, radius);
    }

    float circle2(vec2 uv, vec2 center, float radius, float width, float opening)
    {
        vec2 d = uv - center;
        float r = length(d);
        if(abs(d.y / r) > opening)
            return SMOOTH(r - width * 0.5, radius) - SMOOTH(r + width * 0.5, radius);
        return 0.0;
    }

    float triangles(vec2 uv, vec2 center, float radius)
    {
        vec2 d = uv - center;
        return RS(-8.0, 0.0, d.x-radius) * (1.0-smoothstep( 7.0+d.x-radius,9.0+d.x-radius, abs(d.y)))
            + RS( 0.0, 8.0, d.x+radius) * (1.0-smoothstep( 7.0-d.x-radius,9.0-d.x-radius, abs(d.y)))
            + RS(-8.0, 0.0, d.y-radius) * (1.0-smoothstep( 7.0+d.y-radius,9.0+d.y-radius, abs(d.x)))
            + RS( 0.0, 8.0, d.y+radius) * (1.0-smoothstep( 7.0-d.x-radius,9.0-d.x-radius, abs(d.x)));
    }

    float _cross(vec2 uv, vec2 center, float radius)
    {
        vec2 d = uv - center;
        float r = length(d);
        if(r < radius && abs(abs(d.x) - abs(d.y)) < 1.0)
            return 1.0;
        return 0.0;
    }

    void main() {
        vec2 uv = vUv * iResolution;
        vec2 c = iResolution * 0.5;

        vec3 finalColor = 0.3 * _cross(uv, c, 240.0) * vec3(1.0);
        finalColor += (circle(uv, c, 100.0, 1.0) + circle(uv, c, 165.0, 1.0)) * blue1;
        finalColor += circle(uv, c, 240.0, 2.0) * vec3(1.0);
        finalColor += triangles(uv, c, 315.0 + 30.0 * sin(iTime)) * blue2;
        finalColor += circle(uv, c, 10.0, 1.0) * blue3;
        finalColor += movingLine(uv, c, 240.0) * blue3;
        finalColor += 0.7 * circle2(uv, c, 262.0, 1.0, 0.5 + 0.2 * cos(iTime)) * blue3;

        float intensity = length(finalColor);
        if (intensity < 0.01) discard;
        gl_FragColor = vec4(finalColor, intensity);
    }
    `,
    }),
    o = new G(l, t);
  return ((o.rotation.x = Math.PI / 2), (o.renderOrder = -1e3), o);
}
function createApertureShader() {
  const l = new pe(3, 3),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uTime: { value: 0 },
        uOuterColor: { value: new H('#2b90e0') },
        uOuterGlowColor: { value: new H('#00bfff') },
        uInnerColor: { value: new H(8900331) },
        uInnerGlowColor: { value: new H(8900331) },
        uIntensity: { value: 0.8 },
        uSpeed: { value: 2.5 },
        uOuterRadius: { value: 0.9 },
        uInnerRadius: { value: 0.4 },
        uRingDistance: { value: 0.18 },
        uHexDensity: { value: 2 },
        uGlowIntensity: { value: 2 },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uOuterColor;
      uniform vec3 uOuterGlowColor;
      uniform vec3 uInnerColor;
      uniform vec3 uInnerGlowColor;
      uniform float uIntensity;
      uniform float uSpeed;
      uniform float uInnerRadius;
      uniform float uRingDistance;
      uniform float uHexDensity;
      uniform float uGlowIntensity;

      float hexDist(vec2 p) {
        p = abs(p);
        return max(p.x * 0.866025 + p.y * 0.5, p.y);
      }

      float hexGrid(vec2 p) {
        vec2 h = vec2(0.866025, 0.5);
        vec2 g1 = vec2(h.x, -h.y);
        vec2 g2 = vec2(0.0, 1.0);

        vec2 id1 = floor(vec2(dot(p, g1), dot(p, g2)));
        vec2 id2 = floor(vec2(dot(p, g1), dot(p, g2)) + 0.5);

        vec2 p1 = p - id1.x * g1 - id1.y * g2;
        vec2 p2 = p - id2.x * g1 - id2.y * g2;

        float d1 = hexDist(p1);
        float d2 = hexDist(p2);

        return d1 < d2 ? d1 : d2;
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float smoothNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0;
        float dist = length(uv);

        if (dist > 1.3) {
          discard;
        }

        float time = uTime * uSpeed;
        float shrinkFactor = 0.3 + 0.7 * (0.5 + 0.5 * sin(time));

        float currentInnerRadius = uInnerRadius * shrinkFactor;
        float currentOuterRadius = max(currentInnerRadius + uRingDistance, currentInnerRadius + 0.05);

        float outerRing = smoothstep(currentOuterRadius - 0.08, currentOuterRadius, dist) *
                         (1.0 - smoothstep(currentOuterRadius, currentOuterRadius + 0.15, dist));

        float innerRing = 1.0 - smoothstep(currentInnerRadius - 0.03, currentInnerRadius, dist);

        float ringMask = smoothstep(currentOuterRadius - 0.1, currentOuterRadius, dist) *
                        (1.0 - smoothstep(currentOuterRadius, currentOuterRadius + 0.1, dist));

        vec2 hexUV = uv * uHexDensity;
        float hDist = hexGrid(hexUV);
        float hexBase = 1.0 - smoothstep(0.2, 0.3, hDist);

        float noiseValue = smoothNoise(hexUV * 1.5 + time * 0.3);
        float hexPattern = hexBase * ringMask * (0.6 + 0.4 * noiseValue);

        float distToOuter = abs(dist - currentOuterRadius);
        float distToInner = abs(dist - currentInnerRadius);

        float outerGlow = exp(-distToOuter * uGlowIntensity * 0.8) * outerRing;
        float outerGlow2 = exp(-distToOuter * uGlowIntensity * 0.4) * outerRing * 0.6;
        float innerGlow = exp(-distToInner * uGlowIntensity * 1.5) * innerRing;

        vec3 finalColor = uOuterColor * outerRing;
        finalColor += uOuterGlowColor * (outerGlow + outerGlow2) * 2.5;
        finalColor += uInnerColor * innerRing;
        finalColor += uInnerGlowColor * innerGlow * 0.3;
        finalColor += uOuterColor * hexPattern * 0.6;

        float centerMask = step(dist, currentInnerRadius);
        float centerGradient = (1.0 - smoothstep(0.0, currentInnerRadius * 0.7, dist)) * centerMask;
        finalColor += uInnerGlowColor * centerGradient * 0.2;

        float alpha = (outerRing + innerRing + hexPattern + outerGlow + outerGlow2 + innerGlow) * uIntensity;
        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
    }),
    o = new G(l, t);
  return ((o.rotation.x = Math.PI / 2), (o.renderOrder = -1e3), o);
}
function createWallShader() {
  const l = new pe(3, 1),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
                varying vec2 vUv;
                void main(){
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
                }
                `,
      fragmentShader: `
                precision mediump float;
                uniform float uTime;
                varying vec2 vUv;
                #define PI 3.14159265

                void main(){
                    vec4 baseColor = vec4(0.0, 1.0, 0.5, 1.0);
                    float x = vUv.x;
                    float frequency = 10.0;
                    float t = -uTime * 1.3;

                    float y = sin(x * frequency);
                    y += sin(x * frequency * 2.1 + t) * 4.5;
                    y += sin(x * frequency * 1.72 + t * 1.121) * 4.0;
                    y += sin(x * frequency * 2.221 + t * 0.437) * 5.0;
                    y += sin(x * frequency * 3.1122 + t * 4.269) * 2.5;
                    y = y * 0.02 + 0.55;

                    baseColor.a = step(vUv.y, y) * (y - vUv.y) / max(y, 0.001);
                    gl_FragColor = baseColor;
                }
                `,
    }),
    o = new G(l, t);
  return ((o.renderOrder = -1e3), o);
}
function createFlickerWarning() {
  const t = new pe(1.2, 1.2),
    o = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new H('#ff8c00') },
        uSpeed: { value: 12 },
        uIntensity: { value: 1 },
        uPulse: { value: 0.5 },
      },
      vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
      fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uPulse;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
     }
    float noise2(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
   }

      void main(){
        float d = length(vUv - 0.5);
        float flick = smoothstep(0.25, 0.0, fract(sin(uTime * uSpeed) * 0.5 + 0.5));
        float noise = noise2(vUv * 30.0 + uTime) * 0.2;
        float core = smoothstep(0.45, 0.0, d);
        float halo = smoothstep(0.9, 0.5, d) * (0.8 + flick * uPulse);
        float alpha = (core + halo * 0.8) * uIntensity + noise;
        vec3 col = uColor * (0.7 + 0.6 * flick);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
    }),
    a = new G(t, o);
  return ((a.rotation.x = -Math.PI / 2), a);
}
function createWarningApertureShader() {
  const l = new So(0.7, 0.7, 1.5, 32, 1, !0);
  l.translate(0, 0.75, 0);
  l.computeBoundingBox();
  const { max: t, min: o } = l.boundingBox || {
      max: new F(0, 1.5, 0),
      min: new F(0, 0, 0),
    },
    a = new he({
      transparent: !0,
      side: J,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uMax: { value: t },
        uMin: { value: o },
        uColor: { value: new H(1, 0, 0) },
      },
      vertexShader: `
        varying float vHeight;
        uniform vec3 uMax;
        uniform vec3 uMin;
        void main() {
          // 在顶点着色器中计算归一化高度，避免片段着色器中的矩阵运算
          vHeight = (position.y - uMin.y) / (uMax.y - uMin.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform vec3 uColor;
        varying float vHeight;
        void main() {
          // 从底部到顶部的渐变透明度
          float opacity = (1.0 - vHeight) * 0.6;
          gl_FragColor = vec4(uColor, opacity);
        }
      `,
    });
  return new G(l, a);
}
function createRoundedFenceGeometry(
  l: number,
  t: number,
  o: number,
  a: number,
  n = 64,
) {
  const e = new La(),
    c = -l / 2,
    s = -t / 2;
  e.moveTo(c + o, s);
  e.lineTo(c + l - o, s);
  e.absarc(c + l - o, s + o, o, -Math.PI / 2, 0, !1);
  e.lineTo(c + l, s + t - o);
  e.absarc(c + l - o, s + t - o, o, 0, Math.PI / 2, !1);
  e.lineTo(c + o, s + t);
  e.absarc(c + o, s + t - o, o, Math.PI / 2, Math.PI, !1);
  e.lineTo(c, s + o);
  e.absarc(c + o, s + o, o, Math.PI, Math.PI * 1.5, !1);
  e.closePath();
  const r = e.getPoints(n),
    i = r.length * 2,
    d = new Float32Array(i * 3),
    u = new Float32Array(i * 2),
    h = [],
    p = [0];
  let m = 0;
  for (let g = 1; g < r.length; g++) {
    const w = r[g]!.distanceTo(r[g - 1]!);
    m += w;
    p.push(m);
  }
  for (let g = 0; g < r.length; g++) {
    const w = r[g]!,
      y = m > 0 ? p[g]! / m : g / (r.length - 1);
    if (
      ((d[g * 6] = w.x),
      (d[g * 6 + 1] = 0),
      (d[g * 6 + 2] = w.y),
      (u[g * 4] = y),
      (u[g * 4 + 1] = 0),
      (d[g * 6 + 3] = w.x),
      (d[g * 6 + 4] = a),
      (d[g * 6 + 5] = w.y),
      (u[g * 4 + 2] = y),
      (u[g * 4 + 3] = 1),
      g < r.length - 1)
    ) {
      const b = g * 2,
        S = g * 2 + 1,
        T = (g + 1) * 2,
        P = (g + 1) * 2 + 1;
      h.push(b, T, P);
      h.push(b, P, S);
    }
  }
  const f = new Ge();
  return (
    f.setAttribute('position', new _(d, 3)),
    f.setAttribute('uv', new _(u, 2)),
    f.setIndex(h),
    f.computeVertexNormals(),
    f
  );
}
function createElectronicFence() {
  const l = createRoundedFenceGeometry(1.5, 1.5, 0.35, 1.5, 64),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new H('#00f3ff') },
        uSpeed: { value: 1.5 },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;

      void main() {
        float time = uTime * uSpeed;
        vec3 baseColor = uColor;

        // 1. 从下往上运动的波动效果
        float wavePhase = vUv.y * 2.5 - time * 1.0;
        float wave = fract(wavePhase);
        float waveSignal = smoothstep(0.72, 1.0, wave) * (1.0 - smoothstep(1.0, 1.03, wave));

        // 2. 底部颜色深，越往上越浅/透
        float heightFade = pow(1.0 - vUv.y, 1.5);

        // 3. 底部霓虹边框
        float distToBottom = abs(vUv.y - 0.01);
        float bottomGlow = exp(-distToBottom * 18.0) * 1.5;
        float bottomCore = exp(-distToBottom * 100.0) * 2.0;

        // 4. 顶部边框微亮
        float distToTop = abs(vUv.y - 0.99);
        float topGlow = exp(-distToTop * 25.0) * 0.4;

        // 5. 能量流淌底纹
        float backgroundFlow = sin(vUv.x * 12.0 - time * 0.5) * 0.15 + 0.85;

        // 6. 颜色合成
        vec3 finalColor = mix(baseColor, vec3(1.0, 1.0, 1.0), (bottomCore * 0.6 + waveSignal * 0.35) * heightFade);
        finalColor += baseColor * (bottomGlow * 1.5 + waveSignal * 0.5 + topGlow) * heightFade;

        // 7. 透明度合成
        float baseOpacity = 0.35 * heightFade * backgroundFlow;
        float waveOpacity = waveSignal * 0.75 * heightFade;
        float bottomOpacity = bottomGlow * 0.8 + bottomCore * 0.2;

        float alpha = baseOpacity + waveOpacity + bottomOpacity;

        // 8. 边缘渐隐，消除硬切锯齿
        float edgeFade = smoothstep(0.0, 0.02, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
        alpha *= edgeFade;

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
    });
  return new G(l, t);
}
function createWarningGuardrail() {
  const l = createRoundedFenceGeometry(1.5, 1.5, 0.35, 1.5, 64),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new H('#ffcc00') },
        uSpeed: { value: 1.5 },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;

      void main() {
        float time = uTime * uSpeed;
        float normY = vUv.y;

        // 动态根据基础警示颜色 uColor 派生出极具科技感、层次分明的系列警示色彩
        vec3 yellow = uColor;
        vec3 brightYellow = mix(uColor, vec3(1.0, 1.0, 1.0), 0.5); // 极亮高光/发光
        vec3 darkAmber = uColor * 0.06; // 暗色条纹（深色琥珀黑，避免死黑导致立体感缺失）
        vec3 neonOrange = mix(uColor, vec3(1.0, 0.2, 0.0), 0.35); // 霓虹橙色（用于边框和扫光过渡，增强色彩张力）

        // --- 图层 1: 动态滚动的黄黑相间斜斑马线（经典警告标识） ---
        float stripeVal = fract((vUv.x * 24.0 - normY * 6.0) + time * 0.15);
        // 使用平滑插值消除边缘锯齿，保证在任何缩放比例下都极度清晰
        float stripe = smoothstep(0.42, 0.46, stripeVal) * (1.0 - smoothstep(0.92, 0.96, stripeVal));
        vec3 stripeColor = mix(darkAmber, yellow, stripe);
        float stripeAlpha = mix(0.12, 0.55, stripe);

        // --- 图层 2: 轨道流动箭头指示器 (>>> 能量导向箭头) ---
        // 限制箭头在垂直方向的中下段（y 坐标约在 0.11 到 0.30 之间）
        float centerMask = smoothstep(0.11, 0.14, normY) * smoothstep(0.30, 0.27, normY);

        float arrowTime = time * 2.2;
        float arrowUvX = vUv.x * 36.0 - arrowTime;
        float arrowVal = fract(arrowUvX) - 0.5;
        // 极高阶算式计算斜角 V 字箭头
        float arrowShape = abs(arrowVal + abs(normY - 0.205) * 3.8 - 0.12);
        float arrowGlow = smoothstep(0.08, 0.0, arrowShape) * 2.5;

        // --- 图层 3: 能量网格微光（极具未来感） ---
        float gridX = abs(sin(vUv.x * 120.0));
        float gridY = abs(sin(normY * 60.0));
        float grid = (smoothstep(0.96, 1.0, gridX) + smoothstep(0.94, 1.0, gridY)) * 0.25;

        // --- 图层 4: 底部与顶部霓虹高亮边界线 ---
        float bottomGlow = exp(-abs(normY - 0.015) * 35.0) * 1.8;
        float topGlow = exp(-abs(normY - 0.395) * 35.0) * 1.8;

        // --- 图层 5: 垂直方向能量扫描红外光束（往复循环） ---
        float scanPos = sin(time * 1.8) * 0.18 + 0.21;
        float scanline = exp(-pow(normY - scanPos, 2.0) * 2200.0) * 3.0;

        // --- 呼吸、警报闪烁动态调制器 ---
        float alarm = 1.0 + 0.35 * sin(time * 4.5); // 快速紧急闪烁脉冲
        float slowBreath = 0.85 + 0.15 * sin(time * 1.0); // 慢速柔和呼吸

        // --- 颜色合成与光效叠加 ---
        // 1. 以经典警示斜纹和科技网格为背景
        vec3 finalColor = stripeColor + vec3(grid * 0.3);

        // 2. 混合向右无限流动的警示箭头
        vec3 arrowColor = mix(yellow, brightYellow, arrowGlow * 0.3);
        finalColor = mix(finalColor, arrowColor * alarm, arrowGlow * centerMask);

        // 3. 注入顶部、底部以及动态扫描线的霓虹极光（使用橙黄渐变，层次更华丽）
        finalColor += neonOrange * bottomGlow * alarm;
        finalColor += neonOrange * topGlow * alarm;
        finalColor += brightYellow * scanline * alarm;

        // --- 透明度合成 ---
        float alpha = stripeAlpha * (1.0 + grid);
        alpha += arrowGlow * 0.8 * centerMask;
        alpha += bottomGlow * 0.9;
        alpha += topGlow * 0.9;
        alpha += scanline * 1.0;

        // 注入柔和的系统级别呼吸律动
        alpha *= slowBreath;

        // --- 空间和边缘裁切（实现完美融合） ---
        // 1. 高度裁剪：使护栏保持在黄金比例高度（y <= 0.42），顶部平滑虚化过渡
        float heightFade = smoothstep(0.42, 0.40, normY);
        alpha *= heightFade;

        // 2. 边缘羽化：消除底层贴地硬边缘
        float edgeFade = smoothstep(0.0, 0.02, normY);
        alpha *= edgeFade;

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
    });
  return new G(l, t);
}
function createWarningGuardrailBreath() {
  const l = createRoundedFenceGeometry(1.5, 1.5, 0.35, 1.5, 64),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new H('#ff4d4d') },
        uSpeed: { value: 1.5 },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;

      void main() {
        float time = uTime * uSpeed;

        float normY = vUv.y;

        // 整体红色变淡一点（混合 20% 的白色，使其变成更柔和、更淡的浅红警告色）
        vec3 baseColor = mix(uColor, vec3(1.0, 1.0, 1.0), 0.2);

        // 1. 垂直方向的渐变与发光
        // 底部发光
        float distToBottom = abs(normY - 0.0);
        float bottomGlow = exp(-distToBottom * 10.0) * 2.0;

        // 基础填充
        float baseFill = 0.5;

        // 2. 颜色合成：由强变弱时，在底部产生白色渐变
        // 呼吸动画的导数方向由 cos(time * 2.0) 决定，小于0表示正在由强变弱
        float changeDir = cos(time * 2.0);
        float transitionToWeak = max(0.0, -changeDir); // 范围在 [0.0, 1.0]

        // 垂直方向的白色渐变发光（底部最强，向上指数衰减）
        float whiteGlow = exp(-normY * 8.0);
        float whiteMix = transitionToWeak * whiteGlow * 0.6; // 0.6 为白色混合的最大强度

        vec3 finalColor = mix(baseColor, vec3(1.0, 1.0, 1.0), whiteMix);

        // 3. 透明度合成
        float alpha = baseFill + bottomGlow;

        // 4. 只保留底部 1/3，并进行平滑渐隐（从 0.33 处完全透明）
        float heightFade = smoothstep(0.33, 0.0, normY);
        alpha *= heightFade;

        // 5. 边缘渐隐，消除硬切锯齿
        float edgeFade = smoothstep(0.0, 0.01, normY);
        alpha *= edgeFade;

        // 6. 呼吸透明度动画：透明度在 0.15 到 0.9 之间周期性变化
        float breath = 0.15 + 0.75 * (0.5 + 0.5 * sin(time * 2.0));
        alpha *= breath;

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
    });
  return new G(l, t);
}
function createLogisticsConveyor() {
  const l = new pe(1.2, 12),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new H('#00aaff') },
        uSpeed: { value: 1.5 },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;

      void main() {
        float time = uTime * uSpeed;

        // 动态派生出极具科技感、层次分明的色彩
        vec3 baseColor = uColor;
        vec3 brightGlow = mix(uColor, vec3(1.0, 1.0, 1.0), 0.75); // 极亮核心发光
        vec3 darkBg = uColor * 0.02; // 极暗背景，避免死黑
        vec3 neonCyan = mix(uColor, vec3(0.0, 1.0, 0.95), 0.4); // 霓虹青色

        // --- 图层 1: 传送带物理履带条纹与纵向拉丝纹理（精细化背景） ---
        // 1.1 纵向金属拉丝纹理
        float microGrooves = abs(sin(vUv.x * 120.0));
        float groovePattern = smoothstep(0.3, 0.7, microGrooves) * 0.15;

        // 1.2 传送带物理履带分段线（随时间滚动，vUv.y 决定运动方向）
        float beltScroll = vUv.y * 25.0 - time * 1.5;
        float stripeVal = fract(beltScroll);
        float stripe = smoothstep(0.0, 0.04, stripeVal) * smoothstep(0.08, 0.04, stripeVal);

        // 1.3 混合背景纹理
        vec3 bgTexture = mix(darkBg, baseColor * 0.08, groovePattern) + baseColor * 0.1 * stripe;

        // --- 图层 2: 侧边发光边界（高精细度双层导轨效果） ---
        // 2.1 极细的高亮导轨核心线
        float railLeft = smoothstep(0.015, 0.0, abs(vUv.x - 0.01));
        float railRight = smoothstep(0.015, 0.0, abs(vUv.x - 0.99));
        float rails = railLeft + railRight;

        // 2.2 柔和的侧边外溢霓虹光晕
        float glowLeft = exp(-vUv.x * 15.0);
        float glowRight = exp(-(1.0 - vUv.x) * 15.0);
        float railGlow = glowLeft + glowRight;

        vec3 borderGlowColor = neonCyan * rails * 1.8 + baseColor * railGlow * 0.8;

        // --- 图层 3: 运动箭头效果 (>>> 传送带方向指示，带渐变羽化与运动拖尾) ---
        // 3.1 箭头区域遮罩：限制在中间宽度，首尾不做渐隐
        float horizontalMask = smoothstep(0.15, 0.25, vUv.x) * smoothstep(0.85, 0.75, vUv.x);
        float arrowMask = horizontalMask;

        // 3.2 箭头沿 Y 方向流动（间距设为 10.0，vUv.y 决定运动方向与箭头朝向）
        float arrowTime = time * 2.5;
        float arrowUvY = vUv.y * 10.0 - arrowTime;
        float arrowVal = fract(arrowUvY);

        // 3.3 计算 V 字形箭头：x 对称，y 偏移
        float vShape = abs(vUv.x - 0.5) * 1.5;
        float distToArrow = arrowVal + vShape - 0.85;

        // 3.4 极亮的核心线
        float arrowCore = smoothstep(0.04, 0.0, abs(distToArrow));
        // 3.5 柔和的霓虹晕染
        float arrowGlow = exp(-abs(distToArrow) * 18.0) * 1.5;
        // 3.6 运动拖尾效果（尾部渐隐，branchless 优化）
        float arrowTail = step(distToArrow, 0.0) * exp(distToArrow * 6.0) * 0.6;

        // 3.7 整体箭头强度合成
        float arrowIntensity = (arrowCore * 1.2 + arrowGlow + arrowTail) * arrowMask;

        // --- 图层 4: 传送带微弱网格背景（网格随传送带一起移动，vUv.y 决定运动方向）
        float gridX = abs(sin(vUv.x * 80.0));
        float gridY = abs(sin(vUv.y * 80.0 - time * 1.5));
        float grid = (smoothstep(0.97, 1.0, gridX) + smoothstep(0.97, 1.0, gridY)) * 0.12;

        // --- 5. 呼吸感与暗角效果（Vignette） ---
        // 5.1 慢速柔和呼吸律动
        float pulse = 0.9 + 0.1 * sin(time * 0.8);
        arrowIntensity *= pulse;

        // 5.2 暗角效果，使传送带中间区域具有深邃的立体感，边缘更亮
        float vignette = smoothstep(0.0, 0.5, vUv.x * (1.0 - vUv.x));
        vignette = 0.5 + 0.5 * vignette;

        // --- 颜色合成 ---
        // 1. 基础背景：履带条纹 + 纵向拉丝 + 科技网格
        vec3 finalColor = bgTexture + vec3(grid * 0.15);

        // 2. 叠加流动箭头
        vec3 arrowColor = mix(baseColor, brightGlow, arrowIntensity * 0.5);
        finalColor = mix(finalColor, arrowColor, arrowIntensity);

        // 3. 叠加侧边发光边界
        finalColor += borderGlowColor;

        // --- 透明度合成 ---
        float alpha = 0.85 * vignette; // 基础不透明度，保证传送带的实体感与暗角

        // 边缘和箭头处透明度更强，产生发光叠加
        alpha += (rails * 0.5 + railGlow * 0.3);
        alpha += arrowIntensity * 0.6;

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
    }),
    o = new G(l, t);
  return ((o.rotation.x = -Math.PI / 2), o);
}
function createHologramBeam() {
  const t = new So(0.55, 0.72, 3.2, 64, 1, !0);
  t.translate(0, 3.2 / 2, 0);
  const o = new he({
    side: J,
    transparent: !0,
    depthWrite: !1,
    depthTest: !0,
    blending: ve,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new H('#00e5ff') },
      uSpeed: { value: 1.2 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;

      // 伪随机：用于数据粒子闪烁位置
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        float time = uTime * uSpeed;
        float h = vUv.y;
        float a = vUv.x;

        vec3 baseColor = uColor;
        vec3 brightCore = mix(uColor, vec3(1.0), 0.7);
        vec3 neonCyan = mix(uColor, vec3(0.2, 1.0, 0.9), 0.45);
        vec3 softViolet = mix(uColor, vec3(0.55, 0.35, 1.0), 0.35);

        // --- 1. 高度衰减：底部实、顶部虚（全息投射感） ---
        float heightFade = pow(1.0 - h, 1.15);
        float topSoft = smoothstep(1.0, 0.72, h);

        // --- 2. 菲涅尔边缘光：视角边缘更亮 ---
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.4);

        // --- 3. 上升扫描能量带 ---
        float scanPhase = fract(h * 1.8 - time * 0.55);
        float scanBand = smoothstep(0.78, 1.0, scanPhase) * (1.0 - smoothstep(1.0, 1.05, scanPhase));
        float scanSoft = exp(-pow(scanPhase - 0.92, 2.0) * 180.0) * 1.6;

        // --- 4. 横向全息条纹（CRT / 扫描线） ---
        float hologramLines = abs(sin(h * 95.0 - time * 2.2));
        float linePattern = smoothstep(0.55, 1.0, hologramLines) * 0.35;

        // --- 5. 螺旋数据流（沿柱面螺旋上升） ---
        float spiral = fract(a * 6.0 + h * 3.5 - time * 0.9);
        float spiralSignal = smoothstep(0.82, 1.0, spiral) * (1.0 - smoothstep(1.0, 1.04, spiral));

        // --- 6. 数据粒子点阵（闪烁码流） ---
        vec2 cell = floor(vec2(a * 48.0, h * 36.0 + time * 4.0));
        float rnd = hash21(cell);
        float particle = step(0.92, rnd) * step(0.35, fract(a * 48.0)) * step(0.4, fract(h * 36.0 + time * 4.0));
        particle *= (0.55 + 0.45 * sin(time * 12.0 + rnd * 40.0));

        // --- 7. 底部霓虹环 + 顶部微光 ---
        float bottomGlow = exp(-h * 14.0) * 2.2;
        float topGlow = exp(-(1.0 - h) * 22.0) * 0.55;

        // --- 8. 慢呼吸 + 轻微信号抖动 ---
        float breath = 0.82 + 0.18 * sin(time * 1.4);
        float glitch = 1.0 + 0.08 * step(0.97, fract(sin(time * 17.0) * 43758.5453));

        // --- 颜色合成 ---
        vec3 finalColor = baseColor * (0.18 + fresnel * 0.55);
        finalColor += neonCyan * (scanBand * 1.1 + scanSoft * 0.8) * heightFade;
        finalColor += brightCore * spiralSignal * 0.9 * heightFade;
        finalColor += softViolet * linePattern * heightFade;
        finalColor += brightCore * particle * 1.4;
        finalColor += neonCyan * bottomGlow;
        finalColor += baseColor * topGlow;
        finalColor *= breath * glitch;

        // --- 透明度合成 ---
        float alpha = 0.12 * heightFade + fresnel * 0.45;
        alpha += (scanBand * 0.55 + scanSoft * 0.35) * heightFade;
        alpha += spiralSignal * 0.4 * heightFade;
        alpha += linePattern * 0.25 * heightFade;
        alpha += particle * 0.7;
        alpha += bottomGlow * 0.55 + topGlow * 0.25;
        alpha *= topSoft * breath;

        // 上下边缘羽化，避免硬切
        alpha *= smoothstep(0.0, 0.03, h) * smoothstep(1.0, 0.96, h);

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
  return new G(t, o);
}
function createHexTechPlatform() {
  const l = new pe(3.2, 3.2),
    t = new he({
      side: J,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new H('#1de9b6') },
        uSpeed: { value: 1 },
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;

      // 六边形距离场（中心为 0，边缘约为 1）
      float hexDist(vec2 p) {
        p = abs(p);
        float c = dot(p, normalize(vec2(1.0, 1.7320508)));
        return max(c, p.x);
      }

      // 六边形网格线：返回边缘强度
      float hexGrid(vec2 uv, float scale, float lineWidth) {
        vec2 r = vec2(1.0, 1.7320508);
        vec2 h = r * 0.5;
        vec2 a = mod(uv * scale, r) - h;
        vec2 b = mod(uv * scale - h, r) - h;
        vec2 gv = length(a) < length(b) ? a : b;
        float d = hexDist(gv);
        return smoothstep(lineWidth, 0.0, abs(d - 0.48));
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.21));
        p += dot(p, p + 34.12);
        return fract(p.x * p.y);
      }

      void main() {
        float time = uTime * uSpeed;
        vec2 uv = vUv * 2.0 - 1.0; // [-1, 1]
        float dist = length(uv);

        vec3 baseColor = uColor;
        vec3 brightGlow = mix(uColor, vec3(1.0), 0.75);
        vec3 neonCyan = mix(uColor, vec3(0.0, 0.95, 1.0), 0.4);
        vec3 darkBg = uColor * 0.04;

        // --- 1. 外轮廓六边形裁剪（科技平台外形） ---
        float outerHex = hexDist(uv * vec2(1.0, 1.0));
        float platformMask = 1.0 - smoothstep(0.88, 0.94, outerHex);
        float rim = smoothstep(0.94, 0.86, outerHex) * smoothstep(0.78, 0.88, outerHex);

        // --- 2. 内部六边形网格 ---
        float grid = hexGrid(uv, 4.2, 0.035);
        float fineGrid = hexGrid(uv, 8.4, 0.02) * 0.45;

        // --- 3. 中心脉冲扩散环（多层） ---
        float pulse1 = fract(time * 0.35);
        float pulse2 = fract(time * 0.35 + 0.45);
        float ring1 = exp(-pow(dist - pulse1 * 0.95, 2.0) * 90.0) * (1.0 - pulse1);
        float ring2 = exp(-pow(dist - pulse2 * 0.95, 2.0) * 90.0) * (1.0 - pulse2);
        float rings = ring1 + ring2 * 0.75;

        // --- 4. 中心能量核 ---
        float core = exp(-dist * dist * 18.0) * (0.85 + 0.15 * sin(time * 3.0));
        float coreRing = smoothstep(0.18, 0.12, dist) * smoothstep(0.05, 0.12, dist);

        // --- 5. 六向能量射线（从中心向外） ---
        float angle = atan(uv.y, uv.x);
        float rays = 0.0;
        for (int i = 0; i < 6; i++) {
          float target = float(i) * 1.04719755; // 60°
          float da = abs(mod(angle - target + 3.14159265, 6.2831853) - 3.14159265);
          rays += exp(-da * da * 80.0) * smoothstep(0.85, 0.15, dist) * 0.55;
        }
        // 射线沿径向流动高光
        float rayFlow = fract(dist * 5.0 - time * 1.2);
        rays *= smoothstep(0.7, 1.0, rayFlow) * 1.4 + 0.35;

        // --- 6. 六边形顶点能量节点（闪烁） ---
        float nodes = 0.0;
        for (int i = 0; i < 6; i++) {
          float ang = float(i) * 1.04719755 + 0.52359877;
          vec2 np = vec2(cos(ang), sin(ang)) * 0.78;
          float nd = length(uv - np);
          float twinkle = 0.6 + 0.4 * sin(time * 5.0 + float(i) * 1.7);
          nodes += exp(-nd * nd * 220.0) * 2.2 * twinkle;
        }

        // --- 7. 数据点微粒（网格交点闪烁） ---
        vec2 cell = floor((uv + 1.0) * 12.0);
        float rnd = hash21(cell);
        float speck = step(0.88, rnd) * step(dist, 0.82);
        speck *= 0.5 + 0.5 * sin(time * 8.0 + rnd * 30.0);

        // --- 8. 呼吸与暗角 ---
        float breath = 0.88 + 0.12 * sin(time * 1.1);
        float vignette = smoothstep(1.05, 0.35, outerHex);

        // --- 颜色合成 ---
        vec3 finalColor = darkBg * vignette;
        finalColor += baseColor * (grid * 0.55 + fineGrid * 0.35);
        finalColor += neonCyan * rim * 1.6;
        finalColor += brightGlow * rings * 1.1;
        finalColor += neonCyan * rays * 0.85;
        finalColor += brightGlow * (core * 0.9 + coreRing * 1.3);
        finalColor += brightGlow * nodes;
        finalColor += baseColor * speck * 0.8;
        finalColor *= breath;

        // --- 透明度合成 ---
        float alpha = 0.18 * vignette;
        alpha += (grid * 0.45 + fineGrid * 0.25);
        alpha += rim * 0.9;
        alpha += rings * 0.75;
        alpha += rays * 0.4;
        alpha += core * 0.55 + coreRing * 0.7;
        alpha += nodes * 0.85;
        alpha += speck * 0.35;
        alpha *= platformMask * breath;

        // 外缘羽化
        alpha *= smoothstep(0.96, 0.88, outerHex);

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
    }),
    o = new G(l, t);
  return ((o.rotation.x = -Math.PI / 2), o);
}

const shaderFactories: Record<ShaderMethod, () => Mesh> = {
  CreateWarningShader: createWarningShader,
  CreateCompassShader: createCompassShader,
  CreateRadarShader: createRadarShader,
  CreateWallShader: createWallShader,
  CreateApertureShader: createApertureShader,
  CreateFlickerWarning: createFlickerWarning,
  CreateWarningApertureShader: createWarningApertureShader,
  CreateElectronicFence: createElectronicFence,
  CreateWarningGuardrail: createWarningGuardrail,
  CreateWarningGuardrailBreath: createWarningGuardrailBreath,
  CreateLogisticsConveyor: createLogisticsConveyor,
  CreateHologramBeam: createHologramBeam,
  CreateHexTechPlatform: createHexTechPlatform,
};

/** 每次调用都创建独占 GPU 资源，由 SceneDocumentSystem 统一释放。 */
export function createShaderObject(shaderMethod: ShaderMethod): Mesh {
  const mesh = shaderFactories[shaderMethod]();
  mesh.userData.shaderMethod = shaderMethod;
  return mesh;
}
