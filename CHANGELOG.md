# История изменений AllY · Джинни (Changelog)

Все заметные изменения релизов фиксируются в этом файле и синхронизируются с `docs/versions.json` и GitHub Releases.
Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), нумерация версий — [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased] — план на v0.1.2
### В фокусе
- Мгновенная остановка локального моста при закрытии окна приложения.
- Улучшение приёма и отображения вложений в чате.
- Исправления по первым отзывам пользователей из GitHub Discussions / Issues и встроенной обратной связи.

## [0.1.1] — 2026-11-24
### Изменено
- Звук стартовой видеозаставки (`app/ally-intro-flow-enhanced-full.webm`): громкая звуковая дорожка (пик `−0,7 дБ`) заменена на мягкий удар медитационного колокольчика в момент схождения кругов (`0,78 с`) с плавным 8-секундным рассеиванием и комфортной громкостью (пик `−15,0 дБ`, средняя `−31,1 дБ`).
- Сборка `Dzhinni.exe` (`app/sobrat.mjs`) теперь считывает версию напрямую из `app/package.json` вместо зашитой строки.

### Добавлено
- Единая фиксация версий по SemVer между `app/package.json`, `most/package.json`, `.ally-client.json`, лаунчерами `AllY.exe` / `AllY-Guide.exe`, `CHANGELOG.md`, `docs/versions.json` и GitHub Releases.

## [0.1.0] — 2026-11-23
### Добавлено
- Первый публичный релиз **AllY · Джинни v0.1** (лицензия MIT) для Windows 10/11.
- Единое локальное окно (`AllY.exe` + Electron `Dzhinni.exe`) с общей историей переписки и локальной Markdown-памятью (`pamyat/`).
- Поддержка подключений и режима «Авто»: Claude Code CLI, Codex CLI (включая `live-steer`), Antigravity CLI, DeepSeek Harness, Anthropic-совместимые шлюзы (OpenRouter) и обнаружение Qoder CLI.
- Стартовый 3-шаговый мастер подключений с «Режимом чтения» и 5 тем оформления (`Графит` по умолчанию, Бирюзовая, Полночь, Тёмная, Светлая).
- Виджеты «Ресурсы» / «Помощники» (порог контекста `350k`, 5-часовые и недельные квоты без платных фоновых опросов) и «Ноутбук» (CPU, RAM, GPU).
- Документация и интерактивный гид на 16 языках (`docs/index.html`, `AllY-Guide.exe`, `docs/readme/*`, включая RTL для `ar`/`he`, и PDF `docs/README_AllY_v0.1.pdf`).
- Изоляция локального моста (`127.0.0.1`, проверка `Host` и `x-dzhinni: 1`, `contextIsolation: true`, `sandbox: true`).

[Unreleased]: https://github.com/AyarZero/ally-dzhinni/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/AyarZero/ally-dzhinni/compare/v0.1...v0.1.1
[0.1.0]: https://github.com/AyarZero/ally-dzhinni/releases/tag/v0.1
