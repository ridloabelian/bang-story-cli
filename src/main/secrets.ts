import dotenv from 'dotenv'
import type { ApiProvider, KeyStatus } from '@shared/types'
import { getDb } from './db'
import { getSettings } from './settings'

// Load .env automatically
dotenv.config()

const PROVIDERS: ApiProvider[] = ['higgsfield', 'gemini', 'elevenlabs', 'openrouter', 'groq', 'custom']

export const PROVIDER_NAMES: Record<ApiProvider, string> = {
  higgsfield: 'Higgsfield',
  gemini: 'Google Gemini',
  elevenlabs: 'ElevenLabs',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  custom: 'endpoint custom'
}

export const PROVIDER_ENV_VARS: Record<ApiProvider, string[]> = {
  higgsfield: ['HIGGSFIELD_API_KEY', 'HF_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY', 'ELEVEN_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  groq: ['GROQ_API_KEY'],
  custom: ['CUSTOM_API_KEY', 'OPENAI_API_KEY']
}

interface SecretRow {
  provider: ApiProvider
  value: Buffer | string
  last_ok: number | null
  last_message: string | null
  checked_at: number | null
}

export function warmUpEncryption(): void {
  // No-op for CLI
}

function mask(key: string): string {
  if (key.length <= 10) return '•'.repeat(Math.max(4, key.length))
  return `${key.slice(0, Math.min(8, Math.floor(key.length / 3)))}${'•'.repeat(10)}${key.slice(-4)}`
}

function row(provider: ApiProvider): SecretRow | undefined {
  return getDb().prepare('SELECT * FROM secrets WHERE provider = ?').get(provider) as SecretRow | undefined
}

export function setSecret(provider: ApiProvider, value: string): void {
  const buf = Buffer.from(value.trim(), 'utf8')
  getDb()
    .prepare(
      `INSERT INTO secrets (provider, value) VALUES (?, ?)
       ON CONFLICT(provider) DO UPDATE SET value = excluded.value, last_ok = NULL, last_message = NULL, checked_at = NULL`
    )
    .run(provider, buf)
}

export function getSecret(provider: ApiProvider): string | null {
  // 1. Check environment variables first
  for (const envVar of PROVIDER_ENV_VARS[provider] ?? []) {
    if (process.env[envVar]?.trim()) {
      return process.env[envVar]!.trim()
    }
  }

  // 2. Check SQLite database
  const r = row(provider)
  if (!r || !r.value || r.value.length === 0) return null
  if (Buffer.isBuffer(r.value)) {
    return r.value.toString('utf8')
  }
  return String(r.value)
}

export function requireSecret(provider: ApiProvider): string {
  const key = getSecret(provider)
  if (!key) {
    const envVars = (PROVIDER_ENV_VARS[provider] ?? []).join(' / ')
    throw new Error(
      `Kunci API ${PROVIDER_NAMES[provider]} belum diatur. Setel di file .env (${envVars}) atau jalankan 'bang-story config set-key ${provider} <kunci>'.`
    )
  }
  return key
}

/** Full key for display; null when missing. */
export function revealSecret(provider: ApiProvider): string | null {
  return getSecret(provider)
}

export function clearSecret(provider: ApiProvider): void {
  getDb().prepare('DELETE FROM secrets WHERE provider = ?').run(provider)
}

export function recordCheck(provider: ApiProvider, ok: boolean, message: string): void {
  const now = Date.now()
  const res = getDb()
    .prepare('UPDATE secrets SET last_ok = ?, last_message = ?, checked_at = ? WHERE provider = ?')
    .run(ok ? 1 : 0, message, now, provider)
  if (res.changes === 0 && provider === 'custom') {
    getDb()
      .prepare('INSERT INTO secrets (provider, value, last_ok, last_message, checked_at) VALUES (?, ?, ?, ?, ?)')
      .run(provider, Buffer.alloc(0), ok ? 1 : 0, message, now)
  }
}

export function keyStatuses(): KeyStatus[] {
  const rows = getDb().prepare('SELECT * FROM secrets').all() as SecretRow[]
  const customUrl = getSettings().customBaseUrl.trim()
  return PROVIDERS.map((provider) => {
    const r = rows.find((x) => x.provider === provider)
    const key = getSecret(provider)
    const hasKey = !!key
    return {
      provider,
      configured: provider === 'custom' ? !!customUrl || hasKey : hasKey,
      lastOk: r?.last_ok == null ? (hasKey ? true : null) : r.last_ok === 1,
      lastMessage: r?.last_message ?? (hasKey ? 'Tersedia' : 'Belum diatur'),
      checkedAt: r?.checked_at ?? null,
      preview: key ? mask(key) : null,
      unreadable: false
    }
  })
}
