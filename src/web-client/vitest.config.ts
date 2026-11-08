import { defineConfig } from 'vitest/config';
export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { environment: 'node', setupFiles: ['./tests/setup.ts'], fileParallelism: false } });
