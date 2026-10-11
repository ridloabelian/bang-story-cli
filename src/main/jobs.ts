import type { Job } from '@shared/types'
import { emit, eventBus } from './events'
import { getJob, getJobRaw, updateJob } from './repo'
import { cancelRequest } from './services/higgsfield'

export type QueueName = 'higgsfield' | 'tts' | 'whisper' | 'export'

export interface TaskCtx {
  jobId: string
  signal: AbortSignal
  progress(p: number, message?: string): void
  setRemote(id: string): void
}

/** A task returns the id of the asset it produced, or a message to keep on the finished job (e.g. an output path). */
export type Task = (ctx: TaskCtx) => Promise<string | void | { message: string }>

// Whisper uses most CPU cores by itself, so it runs one file at a time.
const LIMITS: Record<QueueName, number> = { higgsfield: 3, tts: 2, whisper: 1, export: 1 }
const running: Record<QueueName, number> = { higgsfield: 0, tts: 0, whisper: 0, export: 0 }
const waiting: Record<QueueName, (() => void)[]> = { higgsfield: [], tts: [], whisper: [], export: [] }
const controllers = new Map<string, AbortController>()

function acquire(q: QueueName): Promise<void> {
  if (running[q] < LIMITS[q]) {
    running[q]++
    return Promise.resolve()
  }
  return new Promise((resolve) =>
    waiting[q].push(() => {
      running[q]++
      resolve()
    })
  )
}

function release(q: QueueName): void {
  running[q]--
  waiting[q].shift()?.()
}

export function runJob(job: Job, queue: QueueName, task: Task): Job {
  const ctrl = new AbortController()
  controllers.set(job.id, ctrl)
  let lastEmit = 0
  const ctx: TaskCtx = {
    jobId: job.id,
    signal: ctrl.signal,
    progress: (p, message) => {
      const now = Date.now()
      const j = updateJob(job.id, { progress: Math.min(0.99, Math.max(0, p)), ...(message !== undefined ? { message } : {}) })
      if (now - lastEmit > 250 || p >= 0.99) {
        lastEmit = now
        emit.job(j)
      }
    },
    setRemote: (id) => {
      updateJob(job.id, { remoteId: id })
    }
  }
  void (async () => {
    await acquire(queue)
    if (ctrl.signal.aborted) {
      release(queue)
      controllers.delete(job.id)
      emit.job(updateJob(job.id, { status: 'canceled', message: null }))
      return
    }
    try {
      emit.job(updateJob(job.id, { status: 'running', progress: 0.02 }))
      const result = await task(ctx)
      const extra =
        typeof result === 'string' ? { resultAssetId: result, message: null } : { message: result?.message ?? null }
      emit.job(updateJob(job.id, { status: 'done', progress: 1, ...extra }))
    } catch (e) {
      const canceled = ctrl.signal.aborted
      emit.job(
        updateJob(job.id, {
          status: canceled ? 'canceled' : 'failed',
          error: canceled ? null : ((e as Error)?.message ?? String(e)),
          message: null
        })
      )
      if (!canceled) console.error(`[job ${job.kind}]`, e)
    } finally {
      release(queue)
      controllers.delete(job.id)
    }
  })()
  return job
}

export async function cancelJob(id: string): Promise<void> {
  const raw = getJobRaw(id)
  if (!raw) return
  if (raw.remote_id && raw.provider === 'higgsfield') await cancelRequest(raw.remote_id)
  const ctrl = controllers.get(id)
  if (ctrl) ctrl.abort()
  else if (raw.status === 'queued' || raw.status === 'running') emit.job(updateJob(id, { status: 'canceled', message: null }))
}

export function isActive(id: string): boolean {
  return controllers.has(id)
}

/** Waits for a single job to reach 'done', 'failed', or 'canceled'. */
export function awaitJob(
  jobId: string,
  onProgress?: (progress: number, message?: string) => void,
  signal?: AbortSignal
): Promise<Job> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const raw = getJobRaw(jobId)
      if (!raw) {
        eventBus.off('job', onJob)
        reject(new Error(`Job ${jobId} tidak ditemukan`))
        return true
      }
      if (raw.status === 'done') {
        eventBus.off('job', onJob)
        const j = getJob(jobId)
        if (j) resolve(j)
        else reject(new Error(`Job ${jobId} tidak ditemukan setelah selesai`))
        return true
      }
      if (raw.status === 'failed') {
        eventBus.off('job', onJob)
        reject(new Error(raw.error || `Job ${raw.kind} gagal`))
        return true
      }
      if (raw.status === 'canceled') {
        eventBus.off('job', onJob)
        reject(new Error(`Job ${raw.kind} dibatalkan`))
        return true
      }
      return false
    }

    if (check()) return

    const onJob = (j: Job) => {
      if (j.id === jobId) {
        if (onProgress) onProgress(j.progress, j.message ?? undefined)
        check()
      }
    }

    eventBus.on('job', onJob)

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          eventBus.off('job', onJob)
          void cancelJob(jobId)
          reject(new Error('Dibatalkan'))
        },
        { once: true }
      )
    }
  })
}

/** Waits for an array of jobs to finish. */
export async function awaitJobs(
  jobs: Job[],
  onProgress?: (doneCount: number, total: number, lastJob: Job) => void,
  signal?: AbortSignal
): Promise<Job[]> {
  let done = 0
  const total = jobs.length
  return Promise.all(
    jobs.map(async (j) => {
      const finished = await awaitJob(j.id, undefined, signal)
      done++
      onProgress?.(done, total, finished)
      return finished
    })
  )
}
