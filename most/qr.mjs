/** Pairing QR as PNG bytes. The link travels over stdin: it contains a one-time secret, not argv. */
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PYTHON = process.env.DZHINNI_PYTHON || 'python'
const cache = new Map()

export function qrPng(text) {
  if (typeof text !== 'string' || !text || text.length > 512) return Promise.reject(new Error('qr_text'))
  if (cache.has(text)) return cache.get(text)
  const value = new Promise((resolve, reject) => {
    const child = execFile(PYTHON, [join(HERE, 'qr-png.py')],
      { encoding: 'buffer', windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error || !stdout?.length) return reject(new Error('QR-код недоступен: на ноутбуке нужен Python с OpenCV'))
        resolve(Buffer.from(stdout))
      })
    child.on('error', () => reject(new Error('QR-код недоступен: на ноутбуке нужен Python с OpenCV')))
    child.stdin.end(text, 'utf8')
  }).catch(error => { cache.delete(text); throw error })
  cache.set(text, value)
  if (cache.size > 16) cache.delete(cache.keys().next().value)
  return value
}
