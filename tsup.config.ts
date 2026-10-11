import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/server.ts'], outDir: 'dist', sourcemap: true, clean: true, target: 'node22', format: ['cjs'] });
