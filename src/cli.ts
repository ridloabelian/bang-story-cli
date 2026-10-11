#!/usr/bin/env node
import { Command } from 'commander'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import ora from 'ora'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import dotenv from 'dotenv'

import { runStoryPipeline } from './main/pipeline'
import { keyStatuses, setSecret, clearSecret, requireSecret, PROVIDER_NAMES, PROVIDER_ENV_VARS } from './main/secrets'
import { getSettings, setSettings } from './main/settings'
import { listProjects, getProject, getBundle } from './main/repo'
import { whisperStatus, downloadModel, removeModel, whisperReady, cliPath, modelPath } from './main/whisper'
import { VISUAL_STYLES } from './shared/styles'
import { LANGUAGES, LLM_PROVIDERS, GEMINI_LIBRARY_VOICES } from './shared/models'
import { HF_IMAGE_MODELS, HF_VIDEO_MODELS } from './shared/higgsfield'
import type { ApiProvider, AspectRatio, TtsProvider } from './shared/types'

// Load .env
dotenv.config()

const program = new Command()

program
  .name('bang-story')
  .description('CLI version of Bang Story — Ubah ide cerita jadi video YouTube dengan AI langsung dari terminal')
  .version('1.0.0')

// ---------- Command: create (Interactive Wizard) ----------
program
  .command('create')
  .description('Jalankan wizard interaktif untuk membuat video cerita dari awal sampai akhir')
  .action(async () => {
    p.intro(pc.bgMagenta(pc.black(' 🎬 BANG STORY CLI — Video Generator ')))

    // 1. Cek Kunci API wajib
    const statuses = keyStatuses()
    const hfStatus = statuses.find((s) => s.provider === 'higgsfield')
    const geminiStatus = statuses.find((s) => s.provider === 'gemini')

    if (!hfStatus?.configured || !geminiStatus?.configured) {
      p.log.warn(pc.yellow('⚠️ Kunci API penting belum lengkap:'))
      if (!hfStatus?.configured) p.log.error('- Higgsfield API key diperlukan untuk gambar/video.')
      if (!geminiStatus?.configured) p.log.error('- Gemini API key diperlukan untuk naskah & suara.')
      p.log.info(pc.cyan('Kamu bisa setel via file .env atau perintah: bang-story config set-key <provider> <key>\n'))
    }

    const synopsis = await p.text({
      message: 'Masukkan ide cerita atau sinopsis:',
      placeholder: 'Misal: Kisah misteri hilangnya kapal Mary Celeste di tengah samudra Atlantik...',
      validate: (value) => {
        if (!value.trim()) return 'Sinopsis tidak boleh kosong!'
      }
    })
    if (p.isCancel(synopsis)) {
      p.cancel('Dibatalkan.')
      process.exit(0)
    }

    const durationSec = await p.select({
      message: 'Target durasi video:',
      options: [
        { value: 30, label: '30 detik (~5-6 adegan, cocok untuk YouTube Shorts)' },
        { value: 60, label: '60 detik (~10-11 adegan, standar cerita pendek)' },
        { value: 90, label: '90 detik (~16 adegan, cerita lebih lengkap)' },
        { value: 120, label: '120 detik (~22 adegan, dokumenter mendalam)' }
      ],
      initialValue: 60
    })
    if (p.isCancel(durationSec)) {
      p.cancel('Dibatalkan.')
      process.exit(0)
    }

    const aspectRatio = (await p.select({
      message: 'Format rasio video:',
      options: [
        { value: '16:9', label: '16:9 Landscape (YouTube biasa, monitor)' },
        { value: '9:16', label: '9:16 Portrait (YouTube Shorts, TikTok, Reels)' }
      ],
      initialValue: '16:9'
    })) as AspectRatio
    if (p.isCancel(aspectRatio)) {
      p.cancel('Dibatalkan.')
      process.exit(0)
    }

    const styleId = await p.select({
      message: 'Pilih gaya visual:',
      options: VISUAL_STYLES.map((s) => ({
        value: s.id,
        label: `${s.name} (${s.niche})`
      })),
      initialValue: 'stickman'
    })
    if (p.isCancel(styleId)) {
      p.cancel('Dibatalkan.')
      process.exit(0)
    }

    const ttsProvider = (await p.select({
      message: 'Penyedia suara narator:',
      options: [
        { value: 'gemini', label: 'Google Gemini TTS (Cepat, banyak pilihan karakter suara)' },
        { value: 'elevenlabs', label: 'ElevenLabs (Presisi tinggi, butuh kunci ElevenLabs)' }
      ],
      initialValue: 'gemini'
    })) as TtsProvider
    if (p.isCancel(ttsProvider)) {
      p.cancel('Dibatalkan.')
      process.exit(0)
    }

    const generateVideo = await p.confirm({
      message: 'Animasikan klip jadi video AI (Higgsfield)? (Jika tidak, memakai gambar statis + pergerakan kamera halus)',
      initialValue: false
    })
    if (p.isCancel(generateVideo)) {
      p.cancel('Dibatalkan.')
      process.exit(0)
    }

    const outputFileName = await p.text({
      message: 'Nama file output (opsional, tekan enter untuk otomatis):',
      placeholder: 'cerita-saya.mp4'
    })
    if (p.isCancel(outputFileName)) {
      p.cancel('Dibatalkan.')
      process.exit(0)
    }

    p.log.info(pc.green('Memulai pipeline pembuatan video...\n'))

    const spinner = ora().start()

    try {
      const result = await runStoryPipeline({
        synopsis: synopsis as string,
        durationSec: Number(durationSec),
        aspectRatio: aspectRatio as AspectRatio,
        styleId: styleId as string,
        ttsProvider: ttsProvider as TtsProvider,
        generateVideo: Boolean(generateVideo),
        outputFileName: (outputFileName as string)?.trim() || undefined,
        onStep: (step, details) => {
          spinner.text = pc.cyan(`[${step}] `) + (details ?? '')
        },
        onProgress: (step, prog, msg) => {
          const pct = Math.round(prog * 100)
          spinner.text = pc.cyan(`[${step} ${pct}%] `) + (msg ?? '')
        }
      })

      spinner.succeed(pc.green('Video berhasil dibuat!'))
      p.note(
        `File Video : ${pc.bold(pc.white(result.videoPath))}\n` +
        `Subtitle   : ${pc.bold(pc.white(result.srtPath ?? '-'))}\n` +
        `ID Proyek  : ${result.project.id}`,
        'Hasil Ekspor'
      )
      p.outro(pc.green('Selesai! Tonton videomu sekarang. 🚀'))
    } catch (err) {
      spinner.fail(pc.red('Terjadi kesalahan!'))
      p.log.error((err as Error).message)
      p.outro(pc.red('Gagal menyelesaikan pipeline.'))
      process.exit(1)
    }
  })

// ---------- Command: run / generate (Non-Interactive) ----------
program
  .command('generate')
  .alias('run')
  .description('Generate video secara otomatis dari parameter baris perintah (cocok untuk scripting / automation)')
  .requiredOption('-i, --idea <synopsis>', 'Ide cerita atau sinopsis')
  .option('-d, --duration <seconds>', 'Target durasi video dalam detik', '60')
  .option('-s, --style <styleId>', 'Gaya visual (stickman, anime, documentary, dll)', 'stickman')
  .option('-a, --aspect <ratio>', 'Aspek rasio: 16:9 atau 9:16', '16:9')
  .option('-l, --lang <code>', 'Bahasa naskah (id, en, jv, su)', 'id')
  .option('--tts <provider>', 'Provider TTS: gemini atau elevenlabs', 'gemini')
  .option('--video', 'Generate video AI Higgsfield (bukan hanya gambar statis)', false)
  .option('--no-captions', 'Jangan lakukan sinkronisasi caption Whisper', false)
  .option('-o, --output <filename>', 'Nama file atau path video output')
  .option('--folder <folder>', 'Folder tempat menyimpan file hasil ekspor')
  .option('-r, --res <resolution>', 'Resolusi video: 720, 1080, 2160', '1080')
  .action(async (opts) => {
    console.log(pc.bold(pc.magenta('=== BANG STORY AUTOMATION RUNNER ===\n')))
    const spinner = ora('Menyiapkan proyek...').start()

    try {
      const result = await runStoryPipeline({
        synopsis: opts.idea,
        durationSec: parseInt(opts.duration, 10),
        aspectRatio: opts.aspect as AspectRatio,
        styleId: opts.style,
        language: opts.lang,
        ttsProvider: opts.tts as TtsProvider,
        generateVideo: Boolean(opts.video),
        syncCaptions: !opts.noCaptions,
        outputFileName: opts.output,
        outputFolder: opts.folder,
        resolution: parseInt(opts.res, 10) as 720 | 1080 | 2160,
        onStep: (step, details) => {
          spinner.text = pc.cyan(`[${step}] `) + (details ?? '')
        },
        onProgress: (step, prog, msg) => {
          const pct = Math.round(prog * 100)
          spinner.text = pc.cyan(`[${step} ${pct}%] `) + (msg ?? '')
        }
      })

      spinner.succeed(pc.green('Selesai!'))
      console.log('\n' + pc.bold(pc.green('✓ Video siap:')) + ' ' + result.videoPath)
      if (result.srtPath) console.log(pc.bold(pc.blue('✓ Subtitle:')) + ' ' + result.srtPath)
    } catch (err) {
      spinner.fail(pc.red('Gagal: ' + (err as Error).message))
      process.exit(1)
    }
  })

// ---------- Command: config ----------
const configCmd = program.command('config').description('Kelola kunci API dan pengaturan')

configCmd
  .command('list')
  .description('Tampilkan status semua kunci API')
  .action(() => {
    console.log(pc.bold('\nStatus Kunci API:\n'))
    const statuses = keyStatuses()
    for (const s of statuses) {
      const name = PROVIDER_NAMES[s.provider] || s.provider
      const envVars = (PROVIDER_ENV_VARS[s.provider] ?? []).join(', ')
      const statusIcon = s.configured ? pc.green('✓ Dikonfigurasi') : pc.red('✗ Belum ada')
      const preview = s.preview ? pc.gray(`(${s.preview})`) : ''
      console.log(`  ${pc.bold(name.padEnd(20))} ${statusIcon} ${preview}`)
      if (!s.configured) {
        console.log(pc.gray(`    Variabel env: ${envVars}`))
      }
    }
    console.log()
  })

configCmd
  .command('set-key <provider> <key>')
  .description('Simpan kunci API untuk provider tertentu (gemini, higgsfield, elevenlabs, openrouter, groq)')
  .action((provider, key) => {
    try {
      setSecret(provider as ApiProvider, key)
      console.log(pc.green(`✓ Kunci untuk ${PROVIDER_NAMES[provider as ApiProvider] || provider} berhasil disimpan di database lokal.`))
    } catch (err) {
      console.error(pc.red('Gagal menyimpan kunci: ' + (err as Error).message))
    }
  })

configCmd
  .command('clear-key <provider>')
  .description('Hapus kunci API untuk provider tertentu')
  .action((provider) => {
    clearSecret(provider as ApiProvider)
    console.log(pc.yellow(`✓ Kunci untuk ${provider} dihapus dari database lokal.`))
  })

// ---------- Command: whisper ----------
const whisperCmd = program.command('whisper').description('Kelola model Whisper lokal untuk caption presisi')

whisperCmd
  .command('status')
  .description('Cek status kesiapan Whisper')
  .action(() => {
    const s = whisperStatus()
    console.log(pc.bold('\nStatus Whisper Lokal:\n'))
    console.log(`  Binary CLI : ${cliPath()} (${existsSync(cliPath()) ? pc.green('Tersedia') : pc.yellow('Belum ada / cek PATH')})`)
    console.log(`  Model File : ${modelPath()}`)
    console.log(`  Status     : ${s.state === 'ready' ? pc.green('Siap digunakan') : pc.yellow(s.state)}`)
    console.log(`  Ukuran     : ${(s.received / 1024 / 1024).toFixed(1)} MB / ${(s.total / 1024 / 1024).toFixed(1)} MB`)
    if (whisperReady()) {
      console.log(pc.green('\n✓ Whisper siap digunakan untuk caption akurat.\n'))
    } else {
      console.log(pc.yellow('\nJalankan "bang-story whisper download" untuk mengunduh model Whisper Small (~488 MB).\n'))
    }
  })

whisperCmd
  .command('download')
  .description('Unduh model Whisper Small (~488 MB) dari HuggingFace')
  .action(async () => {
    const spinner = ora('Mengunduh model Whisper Small...').start()
    try {
      await downloadModel((rec, tot) => {
        const pct = Math.round((rec / tot) * 100)
        spinner.text = `Mengunduh model Whisper Small: ${pct}% (${(rec / 1024 / 1024).toFixed(1)} MB / ${(tot / 1024 / 1024).toFixed(1)} MB)`
      })
      spinner.succeed(pc.green('Model Whisper Small berhasil diunduh dan diverifikasi!'))
    } catch (err) {
      spinner.fail(pc.red('Gagal mengunduh: ' + (err as Error).message))
      process.exit(1)
    }
  })

whisperCmd
  .command('remove')
  .description('Hapus model Whisper dari disk')
  .action(() => {
    removeModel()
    console.log(pc.yellow('✓ Model Whisper dihapus dari disk.'))
  })

// ---------- Command: styles ----------
program
  .command('styles')
  .description('Tampilkan daftar 16 gaya visual yang tersedia')
  .action(() => {
    console.log(pc.bold('\nDaftar Gaya Visual Bang Story:\n'))
    for (const style of VISUAL_STYLES) {
      console.log(`  ${pc.bold(pc.cyan(style.id.padEnd(16)))} ${pc.white(style.name.padEnd(26))} [${style.category.toUpperCase()}]`)
      console.log(`    ${pc.gray(style.niche)}`)
    }
    console.log()
  })

// ---------- Command: models ----------
program
  .command('models')
  .description('Tampilkan model AI yang didukung (LLM, Higgsfield Gambar/Video, Suara Gemini)')
  .action(() => {
    console.log(pc.bold('\n1. Provider LLM (Penyusun Naskah):'))
    for (const p of LLM_PROVIDERS) {
      console.log(`  - ${pc.cyan(p.id.padEnd(14))} ${p.name}: ${pc.gray(p.note)}`)
    }

    console.log(pc.bold('\n2. Model Gambar Higgsfield (Cuplikan):'))
    for (const m of HF_IMAGE_MODELS.slice(0, 5)) {
      console.log(`  - ${pc.cyan(m.id.padEnd(36))} ${m.name}`)
    }
    console.log(pc.gray(`    ...dan ${HF_IMAGE_MODELS.length - 5} model lainnya`))

    console.log(pc.bold('\n3. Model Video Higgsfield (Cuplikan):'))
    for (const m of HF_VIDEO_MODELS.slice(0, 5)) {
      console.log(`  - ${pc.cyan(m.id.padEnd(36))} ${m.name}`)
    }
    console.log(pc.gray(`    ...dan ${HF_VIDEO_MODELS.length - 5} model lainnya`))

    console.log(pc.bold('\n4. Contoh Suara Gemini TTS:'))
    for (const v of GEMINI_LIBRARY_VOICES.slice(0, 6)) {
      console.log(`  - ${pc.cyan(v.id.padEnd(16))} ${v.name} (${v.tone})`)
    }
    console.log(pc.gray(`    ...dan ${GEMINI_LIBRARY_VOICES.length - 6} suara lainnya\n`))
  })

// ---------- Command: projects ----------
const projectsCmd = program.command('projects').description('Kelola proyek yang tersimpan')

projectsCmd
  .command('list')
  .description('Daftar semua proyek yang pernah dibuat')
  .action(() => {
    const list = listProjects()
    if (list.length === 0) {
      console.log(pc.yellow('\nBelum ada proyek. Jalankan "bang-story create" untuk membuat baru.\n'))
      return
    }
    console.log(pc.bold('\nDaftar Proyek:\n'))
    for (const p of list) {
      const date = new Date(p.updatedAt).toLocaleString('id-ID')
      console.log(`  ID: ${pc.cyan(p.id)}`)
      console.log(`  Judul  : ${pc.bold(p.title || '(Tanpa judul)')}`)
      console.log(`  Status : ${p.status} | Langkah: ${p.step} | Update: ${date}`)
      console.log()
    }
  })

projectsCmd
  .command('show <id>')
  .description('Tampilkan rincian naskah dan adegan proyek')
  .action((id) => {
    try {
      const bundle = getBundle(id)
      console.log(pc.bold(`\nProyek: ${bundle.project.title || '(Tanpa judul)'} [${bundle.project.id}]\n`))
      console.log(`Sinopsis : ${bundle.project.synopsis}`)
      console.log(`Durasi   : ${bundle.project.durationSec} detik | Gaya: ${bundle.project.styleId}\n`)

      console.log(pc.bold('Adegan:'))
      for (const [i, clip] of bundle.clips.entries()) {
        console.log(`  [Adegan ${i + 1}] ${clip.title}`)
        console.log(`  Narasi : "${clip.narration}"`)
        console.log(`  Visual : ${clip.visualPrompt || clip.story || '-'}`)
        console.log()
      }
    } catch (err) {
      console.error(pc.red('Gagal memuat proyek: ' + (err as Error).message))
    }
  })

program.parse(process.argv)
