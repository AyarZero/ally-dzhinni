// First-circle identity and initial priorities; membership is independent of temporary availability.
// OpenCode и Qoder выведены из круга: остались Codex, Claude Code и DeepSeek Harness.
export const EXECUTORS = ['codex', 'claude', 'deepseek', 'antigravity']
export const AUTO_ORDER = ['codex', 'claude', 'deepseek']
export const CLAUDE_RECHECK = Date.parse('2026-11-06T14:00:00+10:00')
export const EXECUTOR_LABELS = { codex: 'Codex напрямую', claude: 'Claude Code', deepseek: 'DeepSeek Harness', antigravity: 'Antigravity' }
