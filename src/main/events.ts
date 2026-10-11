import { EventEmitter } from 'node:events'
import type { Asset, CharacterPatchEvent, ClipPatchEvent, Job, WhisperStatus } from '@shared/types'

export const eventBus = new EventEmitter()

export const emit = {
  job: (job: Job): void => {
    eventBus.emit('job', job)
  },
  clip: (e: ClipPatchEvent): void => {
    eventBus.emit('clip', e)
  },
  character: (e: CharacterPatchEvent): void => {
    eventBus.emit('character', e)
  },
  asset: (asset: Asset): void => {
    eventBus.emit('asset', asset)
  },
  whisper: (status: WhisperStatus): void => {
    eventBus.emit('whisper', status)
  }
}
