// Отдельный overlay на ход: выбор в окне не меняет общий профиль Harness.
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

export const DSH_MODELS = ['deepseek-flash', 'deepseek-v4-pro']
export function profileModel(env = process.env) {
  if (env.DZHINNI_DSH_MODEL) return env.DZHINNI_DSH_MODEL
  const home = env.DSH_HOME || join(env.USERPROFILE || homedir(), '.dsh')
  const profile = env.DZHINNI_DSH_PROFILE || 'ally'
  try {
    const text = readFileSync(join(home, 'profiles', profile, 'cordis.patch.yml'), 'utf8')
    const block = text.split(/^- id:/m).find(row => /^\s*agent-default-model\s*$/m.test(row))
    const model = block?.match(/^\s+model:\s*['"]?([\w.-]+)['"]?\s*$/m)?.[1]
    if (model) return model
  } catch {}
  return null
}
export function modelOverlay(model, env = process.env) {
  const selected = model || profileModel(env)
  if (!DSH_MODELS.includes(selected)) throw new Error('DeepSeek: модель профиля не определена или не поддерживается: ' + selected)
  const directory = mkdtempSync(join(tmpdir(), 'dzhinni-dsh-model-'))
  const file = join(directory, 'model.json')
  writeFileSync(file, JSON.stringify([{ id: 'agent-default-model', config: {
    provider: 'deepseek-account', model: selected } }]))
  return { file, model: { providerID: 'deepseek-account', id: selected },
    dispose: () => rmSync(directory, { recursive: true, force: true }) }
}
