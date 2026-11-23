// Data contract only. No model, runtime, filesystem, or credentials access.
export class TaskError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
export function requireThat(condition, code, message) {
  if (!condition) throw new TaskError(code, message)
}
export function text(value, name, max = 4000) {
  requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    'INVALID_INPUT', `Неверное поле ${name}`)
  return value
}
export function strings(value, name) {
  requireThat(Array.isArray(value) && value.length <= 200, 'INVALID_INPUT', `Нужен список ${name}`)
  return value.map(item => text(item, name, 4000))
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  requireThat(value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)), 'INVALID_INPUT', 'Нужны JSON-данные')
  return JSON.stringify(value)
}
export function requestData(input) {
  const value = {
    taskRef: input.taskRef == null ? null : text(input.taskRef, 'taskRef'),
    userRequest: text(input.userRequest, 'userRequest', 32000), goal: text(input.goal, 'goal'),
    acceptance: strings(input.acceptance, 'acceptance'), sources: strings(input.sources ?? [], 'sources'),
    rules: strings(input.rules ?? [], 'rules'), constraints: input.constraints ?? {},
  }
  requireThat(value.constraints && !Array.isArray(value.constraints) && typeof value.constraints === 'object',
    'INVALID_INPUT', 'constraints должен быть объектом')
  requireThat(canonical(value.constraints).length <= 16000, 'INVALID_INPUT', 'Слишком большие constraints')
  return value
}
export function checkpointData(value, previous) {
  requireThat(value && typeof value === 'object', 'INVALID_INPUT', 'Нужна точка продолжения')
  requireThat(Array.isArray(value.completed ?? []), 'INVALID_INPUT', 'completed должен быть списком')
  const result = {
    completed: (value.completed ?? []).map(step => ({ stepId: text(step.stepId, 'stepId', 200),
      summary: text(step.summary, 'summary'), evidence: strings(step.evidence, 'evidence') })),
    files: strings(value.files ?? [], 'files'), checks: strings(value.checks ?? [], 'checks'),
    pending: strings(value.pending ?? [], 'pending'), unknownOutcomes: strings(value.unknownOutcomes ?? [], 'unknownOutcomes'),
    nextStep: value.nextStep == null ? null : text(value.nextStep, 'nextStep'),
  }
  const byId = new Map(result.completed.map(step => [step.stepId, step]))
  requireThat(byId.size === result.completed.length && result.completed.every(step => step.evidence.length),
    'INVALID_INPUT', 'Шагам нужны уникальные ID и подтверждения')
  for (const old of previous?.completed ?? []) requireThat(canonical(byId.get(old.stepId) ?? null) === canonical(old),
    'CHECKPOINT_CONFLICT', 'Подтверждённый шаг нельзя потерять или переписать')
  // The checkpoint travels inside a 96000-byte task context (most/task-context.mjs).
  // 64000 leaves the rest of the task and the prompt room; UTF-8 bytes, not chars.
  requireThat(new TextEncoder().encode(canonical(result)).length <= 64000,
    'INVALID_INPUT', 'Слишком большая точка продолжения')
  return result
}
export const emptyCheckpoint = () => checkpointData({})
