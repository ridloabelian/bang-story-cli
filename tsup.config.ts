import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  external: ['better-sqlite3', 'ffmpeg-static'],
  noExternal: ['@shared/*']
})
