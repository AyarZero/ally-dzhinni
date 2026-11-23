// Общие правила и лимиты вложений для формы обратной связи AllY.
import { basename, extname } from 'node:path'

export const OTZYVY_LIMITS = {
  maxFiles: 3,
  maxTotalBytes: 30 * 1024 * 1024,
  textBytes: 2 * 1024 * 1024,
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 25 * 1024 * 1024
}

const RULES = {
  '.txt': { kind: 'text', limitBytes: OTZYVY_LIMITS.textBytes, label: 'текстового файла', mb: 2 },
  '.md': { kind: 'text', limitBytes: OTZYVY_LIMITS.textBytes, label: 'Markdown-файла', mb: 2 },
  '.png': { kind: 'image', limitBytes: OTZYVY_LIMITS.imageBytes, label: 'картинки', mb: 10 },
  '.jpg': { kind: 'image', limitBytes: OTZYVY_LIMITS.imageBytes, label: 'картинки', mb: 10 },
  '.jpeg': { kind: 'image', limitBytes: OTZYVY_LIMITS.imageBytes, label: 'картинки', mb: 10 },
  '.webp': { kind: 'image', limitBytes: OTZYVY_LIMITS.imageBytes, label: 'картинки', mb: 10 },
  '.gif': { kind: 'image', limitBytes: OTZYVY_LIMITS.imageBytes, label: 'картинки', mb: 10 },
  '.mp4': { kind: 'video', limitBytes: OTZYVY_LIMITS.videoBytes, label: 'видео', mb: 25 },
  '.webm': { kind: 'video', limitBytes: OTZYVY_LIMITS.videoBytes, label: 'видео', mb: 25 },
  '.mov': { kind: 'video', limitBytes: OTZYVY_LIMITS.videoBytes, label: 'видео', mb: 25 }
}

export function safeFeedbackName(name, limit = 120) {
  return basename(String(name || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(-limit)
}

export function validateFeedbackFile({ name, size } = {}) {
  const cleanName = safeFeedbackName(name)
  const ext = extname(cleanName).toLowerCase()
  const rule = RULES[ext]
  if (!cleanName || !rule) {
    return {
      ok: false,
      status: 400,
      error: 'Разрешены только .txt, .md, картинки (.png, .jpg, .webp, .gif) и видео (.mp4, .webm, .mov)'
    }
  }
  const bytes = Number(size)
  if (Number.isFinite(bytes) && bytes === 0) {
    return { ok: false, status: 400, error: `Файл «${cleanName}» пустой` }
  }
  if (Number.isFinite(bytes) && bytes > rule.limitBytes) {
    return { ok: false, status: 413, error: `Файл «${cleanName}» больше лимита ${rule.mb} МБ для ${rule.label}` }
  }
  return { ok: true, safeName: cleanName, ext, ...rule }
}

export function validateFeedbackFiles(files = []) {
  if (!Array.isArray(files)) return { ok: false, status: 400, error: 'Неверный список вложений' }
  if (files.length > OTZYVY_LIMITS.maxFiles) {
    return { ok: false, status: 400, error: `Можно прикрепить не более ${OTZYVY_LIMITS.maxFiles} файлов` }
  }
  let totalBytes = 0
  for (const item of files) {
    const check = validateFeedbackFile(item)
    if (!check.ok) return check
    const bytes = Number(item?.size)
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return { ok: false, status: 400, error: `Некорректный размер файла «${check.safeName}»` }
    }
    totalBytes += bytes
  }
  if (totalBytes > OTZYVY_LIMITS.maxTotalBytes) {
    return { ok: false, status: 413, error: 'Суммарный размер вложений больше 30 МБ' }
  }
  return { ok: true, totalBytes }
}
