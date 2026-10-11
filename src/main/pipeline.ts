import { charactersOf, clipsOf, createProject, getBundle, getProject } from './repo'
import { generateScript, generateVisuals, generateMusicPrompt } from './story'
import {
  generateCharacterSheet,
  generateMissingImages,
  generateMissingVideos
} from './generation'
import { generateNarration, syncCaptions } from './narration'
import { startExport } from './exporter'
import { awaitJob, awaitJobs } from './jobs'
import { whisperReady } from './whisper'
import type { AspectRatio, ExportOptions, Job, NewProjectInput, Project, TtsProvider } from '@shared/types'

export interface PipelineOptions {
  synopsis: string
  durationSec?: number
  language?: string
  aspectRatio?: AspectRatio
  styleId?: string
  ttsProvider?: TtsProvider
  ttsVoice?: string
  imageModel?: string
  videoModel?: string
  generateVideo?: boolean
  syncCaptions?: boolean
  resolution?: 720 | 1080 | 2160
  fps?: 30 | 60
  outputFolder?: string
  outputFileName?: string
  onStep?: (step: string, details?: string) => void
  onProgress?: (step: string, progress: number, message?: string) => void
}

export interface PipelineResult {
  project: Project
  videoPath: string
  srtPath?: string
}

export async function runStoryPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { onStep, onProgress } = options

  // 1. Inisialisasi Proyek
  onStep?.('init', 'Membuat proyek cerita baru...')
  const project = createProject({
    synopsis: options.synopsis,
    durationSec: options.durationSec ?? 60,
    language: options.language ?? 'id',
    aspectRatio: options.aspectRatio ?? '16:9',
    styleId: options.styleId ?? 'stickman',
    ttsProvider: options.ttsProvider ?? 'gemini'
  })

  // 2. Generate Naskah
  onStep?.('script', 'Menyusun naskah dan alur adegan dengan LLM...')
  const scriptBundle = await generateScript(project.id)

  // 3. Generate Rencana Visual & Karakter
  onStep?.('visuals', 'Merancang rencana visual dan lembar karakter...')
  await generateVisuals(project.id, 'all')

  // 4. Lembar Karakter (Character Sheet)
  const chars = charactersOf(project.id)
  if (chars.length > 0) {
    onStep?.('character-sheet', `Membuat lembar karakter (${chars.length} tokoh)...`)
    for (const char of chars) {
      try {
        const sheetJob = generateCharacterSheet(char.id)
        await awaitJob(sheetJob.id, (p, msg) => {
          onProgress?.('character-sheet', p, msg)
        })
      } catch (err) {
        console.warn(`[Peringatan] Gagal membuat lembar karakter untuk ${char.name}:`, (err as Error).message)
      }
    }
  }

  // 5. Generate Gambar Klip
  const clips = clipsOf(project.id)
  onStep?.('images', `Membuat gambar untuk ${clips.length} adegan...`)
  const imgJobs = generateMissingImages(project.id)
  if (imgJobs.length > 0) {
    await awaitJobs(imgJobs, (done, total, lastJob) => {
      onProgress?.('images', done / total, `Gambar klip ${done}/${total} selesai (${lastJob.kind})`)
    })
  }

  // 6. Generate Video AI (Opsional)
  if (options.generateVideo) {
    onStep?.('videos', `Menganimasikan ${clips.length} adegan menjadi video AI...`)
    const vidJobs = generateMissingVideos(project.id)
    if (vidJobs.length > 0) {
      await awaitJobs(vidJobs, (done, total, lastJob) => {
        onProgress?.('videos', done / total, `Video klip ${done}/${total} selesai (${lastJob.kind})`)
      })
    }
  }

  // 7. Narasi Suara (TTS)
  onStep?.('narration', 'Merekam suara narasi (continuous take) dan memotong per adegan...')
  const narrationJob = generateNarration(project.id, 'all')
  await awaitJob(narrationJob.id, (p, msg) => {
    onProgress?.('narration', p, msg)
  })

  // 8. Sinkronisasi Caption dengan Whisper (Opsional)
  if (options.syncCaptions !== false && whisperReady()) {
    onStep?.('captions', 'Menyelaraskan caption kata per kata dengan Whisper DTW...')
    try {
      const syncJob = syncCaptions(project.id, 'all')
      await awaitJob(syncJob.id, (p, msg) => {
        onProgress?.('captions', p, msg)
      })
    } catch (err) {
      console.warn('[Peringatan] Sinkronisasi Whisper dilewati:', (err as Error).message)
    }
  }

  // 9. Ekspor Video MP4 via FFmpeg
  onStep?.('export', 'Merender video final MP4 dengan FFmpeg (camera motion, transisi, caption ASS)...')
  const finalTitle = scriptBundle.project.title || 'bang-story'
  const safeName = finalTitle.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 50)
  const exportOpts: ExportOptions = {
    fileName: options.outputFileName ? (options.outputFileName.endsWith('.mp4') ? options.outputFileName : `${options.outputFileName}.mp4`) : `${safeName}.mp4`,
    resolution: options.resolution ?? 1080,
    fps: options.fps ?? 30,
    burnCaptions: true,
    writeSrt: true,
    normalizeAudio: true,
    duckMusic: true,
    folder: options.outputFolder ?? process.cwd()
  }

  const exportJob = startExport(project.id, exportOpts)
  const finishedExport = await awaitJob(exportJob.id, (p, msg) => {
    onProgress?.('export', p, msg)
  })

  const videoPath = finishedExport.message || exportOpts.fileName
  const srtPath = videoPath.replace(/\.mp4$/i, '.srt')

  return {
    project: getProject(project.id),
    videoPath,
    srtPath
  }
}
