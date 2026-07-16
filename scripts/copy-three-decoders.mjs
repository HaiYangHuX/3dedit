import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// three 只声明在 three-engine 中，从该 package 建立 require 才能兼容 pnpm 严格隔离。
const requireFromEngine = createRequire(
  resolve(root, 'packages/three-engine/package.json'),
);
const threeRoot = resolve(dirname(requireFromEngine.resolve('three')), '..');

const decoderGroups = [
  {
    source: resolve(threeRoot, 'examples/jsm/libs/draco/gltf'),
    target: 'draco',
    files: ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm'],
  },
  {
    source: resolve(threeRoot, 'examples/jsm/libs/basis'),
    target: 'basis',
    files: ['basis_transcoder.js', 'basis_transcoder.wasm'],
  },
];

const appPublicRoots = [
  resolve(root, 'apps/editor-web/public/decoders'),
  resolve(root, 'apps/runtime-web/public/decoders'),
];

for (const publicRoot of appPublicRoots) {
  for (const group of decoderGroups) {
    const destination = resolve(publicRoot, group.target);
    await mkdir(destination, { recursive: true });
    for (const file of group.files) {
      // copyFile 会在 r183 包缺少白名单文件时直接失败，让构建期暴露 decoder 漂移。
      await copyFile(resolve(group.source, file), resolve(destination, file));
    }
  }
}
