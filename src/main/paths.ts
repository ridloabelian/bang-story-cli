import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url)
const rootDir = resolve(dirname(currentFile), '..')

export function dataDir(): string {
  if (process.env.BANG_STORY_DATA_DIR) {
    mkdirSync(process.env.BANG_STORY_DATA_DIR, { recursive: true })
    return process.env.BANG_STORY_DATA_DIR
  }
  const base =
    process.platform === 'win32' && process.env.APPDATA
      ? join(process.env.APPDATA, 'Bang Story')
      : join(homedir(), '.bang-story')
  mkdirSync(base, { recursive: true })
  return base
}

export function dbPath(): string {
  return join(dataDir(), 'studio.db')
}

export function projectsRoot(): string {
  const dir = join(dataDir(), 'projects')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function projectDir(projectId: string): string {
  const dir = join(projectsRoot(), projectId)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Absolute path of an asset stored relative to its project folder. */
export function assetAbsPath(projectId: string, localPath: string): string {
  return join(projectsRoot(), projectId, localPath)
}

export function fontsDir(): string {
  if (process.env.BANG_STORY_FONTS_DIR) return process.env.BANG_STORY_FONTS_DIR
  const candidates = [
    join(process.cwd(), 'resources', 'fonts'),
    join(rootDir, 'resources', 'fonts'),
    join(rootDir, '..', 'resources', 'fonts')
  ]
  for (const c of candidates) {
    try {
      mkdirSync(c, { recursive: true })
      return c
    } catch {}
  }
  return join(rootDir, 'resources', 'fonts')
}

/** URL or path for a stored asset. */
export function assetUrl(projectId: string, localPath: string): string {
  return assetAbsPath(projectId, localPath)
}

/** ffmpeg-static binary path. */
export function binPath(p: string): string {
  return p
}
