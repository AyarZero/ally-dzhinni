// Static onboarding guide data: interface widget cards and detailed setup instructions for all supported AI networks.
(() => {
  if (typeof window === 'undefined') return;

  const WIDGETS = [
    {
      icon: '◎',
      title: 'Переписка и сфера шагов',
      text: 'Слева — сфера состояния, таймер и живая лента шагов; справа — переписка и очередь. Уточнения можно отправлять прямо внутрь идущего хода.'
    },
    {
      icon: '▤',
      title: 'Ресурсы и контроль лимитов',
      text: 'Жёсткий контроль контекстного окна (350k), реальные 5-часовые и недельные квоты подписок без платных опросов, а также отдельная вкладка помощников.'
    },
    {
      icon: '⊞',
      title: 'Рабочее пространство',
      text: 'Кисть в верхней панели позволяет перетаскивать виджеты, менять порядок вкладок и быстрых кнопок. Кнопка «Сбросить» возвращает исходную раскладку.'
    },
    {
      icon: '✉',
      title: 'Добровольная обратная связь',
      text: 'Кнопка «Отзывы» в шапке позволяет написать разработчикам пожелание, сообщить об ошибке или предложить доработку. Уходит только твой текст по нажатию кнопки отправки.'
    }
  ];

  const NETWORKS = [
    {
      id: 'claude',
      short: 'Claude Code',
      sub: 'Anthropic Pro / Max',
      canLogin: true,
      loginLabel: 'Войти в Claude из окна',
      title: 'Claude Code · подписка Anthropic (Pro / Max)',
      summary: 'Прямая работа через официальный CLI Claude Code по подписке без оплаты за токены API, с авто-сжатием контекста.',
      costNote: 'Работает по подписке Claude Pro / Max (без списания API-баланса).',
      link: { label: 'Открыть claude.ai', url: 'https://claude.ai' },
      guide: [
        'Убедись, что на компьютере установлен Node.js 24+ (идёт в комплекте требований установщика) и у тебя активна подписка на claude.ai.',
        'Открой командную строку Windows (нажми Win + R, введи cmd и нажми Enter) и установи официальный CLI первой командой ниже.',
        'Нажми кнопку «Войти в Claude из окна» ниже (или выполни вторую команду в терминале) и подтверди доступ в открывшемся окне браузера.',
        'Нажми «Проверить подключение» — статус сменится на «Подключено ✓», а после первого ответа в «Ресурсах» появятся квоты и контекст.'
      ],
      steps: [
        { label: '1. Установить официальный CLI Claude Code:', cmd: 'npm install -g @anthropic-ai/claude-code' },
        { label: '2. Войти через браузер (если не входишь кнопкой ниже):', cmd: 'claude auth login' },
        { label: '3. Проверить статус авторизации в терминале:', cmd: 'claude auth status' }
      ],
      tip: 'После входа в браузере можно не трогать терминал — кнопка «Проверить подключение» сразу обновит статус в окне.'
    },
    {
      id: 'codex',
      short: 'Codex',
      sub: 'ChatGPT Plus / Pro',
      canLogin: true,
      loginLabel: 'Войти в ChatGPT из окна',
      title: 'Codex · подписка ChatGPT (Plus / Pro)',
      summary: 'Работа через официальный Codex CLI на твоём аккаунте ChatGPT без отдельного API-ключа, с живым управлением ходом и квотами 5ч / 7д.',
      costNote: 'Работает по подписке ChatGPT Plus / Pro (отдельный API-ключ не требуется).',
      link: { label: 'Открыть chatgpt.com', url: 'https://chatgpt.com' },
      guide: [
        'Проверь, что у тебя активна подписка ChatGPT Plus или Pro в аккаунте OpenAI.',
        'Открой командную строку Windows (Win + R → cmd) и установи Codex CLI первой командой ниже.',
        'Нажми «Войти в ChatGPT из окна» ниже (или запусти codex login в терминале) — откроется страница авторизации OpenAI в браузере.',
        'После входа нажми «Проверить подключение» — в «Ресурсах» появятся твои 5-часовой и недельный лимиты.'
      ],
      steps: [
        { label: '1. Установить официальный Codex CLI:', cmd: 'npm install -g @openai/codex' },
        { label: '2. Выполнить вход через браузер:', cmd: 'codex login' }
      ],
      tip: 'Если браузер открылся по кнопке «Войти в ChatGPT из окна», просто заверши вход на странице OpenAI — AllY подхватит его автоматически.'
    },
    {
      id: 'antigravity',
      short: 'Antigravity',
      sub: 'Google AI · Gemini 4',
      canLogin: true,
      loginLabel: 'Войти в Google из окна',
      title: 'Antigravity · Google AI (Gemini 4 Neon / Hydrogen / Flash)',
      summary: 'Быстрые и глубокие модели Gemini 4 с контролем окна 350k, реальными квотами 5ч/7д и отправкой сообщений прямо внутрь идущего хода.',
      costNote: 'Использует квоты аккаунта Google AI / Antigravity.',
      link: { label: 'Открыть antigravity.google', url: 'https://antigravity.google' },
      guide: [
        'Установи официальный клиент/CLI Antigravity (команда agy.exe должна быть доступна в системе или в %LOCALAPPDATA%\\agy\\bin).',
        'Нажми «Войти в Google из окна» (или выполни agy auth login в терминале) и выбери свой Google-аккаунт.',
        'Проверь список моделей командой agy models — если CLI отвечает списком моделей без ошибок, всё готово.',
        'Нажми «Проверить подключение» — в «Ресурсах» отобразятся корзины квот Gemini Models и Gemini 4 Argon.'
      ],
      steps: [
        { label: '1. Проверить наличие CLI и список моделей:', cmd: 'agy models' },
        { label: '2. Войти в аккаунт Google:', cmd: 'agy auth login' }
      ],
      tip: 'При региональном ограничении Google AI проверь локальный HTTP-прокси в настройках окружения или файле antigravity-network.json в папке данных.'
    },
    {
      id: 'deepseek',
      short: 'DeepSeek',
      sub: 'DeepSeek Harness',
      canLogin: false,
      title: 'DeepSeek Harness (DSH)',
      summary: 'Подключение локального профиля DeepSeek Harness (быстрые задачи, разбор кода и резервное выполнение).',
      costNote: 'Расходует отдельный оплачиваемый API-баланс DeepSeek (не подписку).',
      link: { label: 'Кабинет platform.deepseek.com', url: 'https://platform.deepseek.com' },
      guide: [
        'Пополни API-баланс в личном кабинете DeepSeek и создай API-ключ.',
        'Установи DeepSeek Harness (dsh) и убедись, что профиль конфигурации сохранён в папке ~/.config/dsh на этом компьютере.',
        'Открой командную строку (Win + R → cmd) и выполни команду проверки ниже, чтобы убедиться, что CLI запускается.',
        'Нажми «Проверить подключение» — актуальный остаток баланса в CNY/USD можно всегда смотреть во вкладке «Помощники» виджета «Ресурсы».'
      ],
      steps: [
        { label: '1. Проверить установку CLI DeepSeek Harness:', cmd: 'dsh --version' },
        { label: '2. Проверить содержимое профиля (~/.config/dsh):', cmd: 'dir %USERPROFILE%\\.config\\dsh' }
      ],
      tip: 'Точный баланс DeepSeek обновляется во вкладке «Помощники» без запуска моделей.'
    },
    {
      id: 'qoder',
      short: 'Qoder',
      sub: 'помощник · чтение',
      canLogin: true,
      loginLabel: 'Войти в Qoder из окна',
      title: 'Qoder · помощник (только чтение и анализ)',
      summary: 'Дополнительный исполнитель для чтения, поиска и проверки кода без права изменения файлов.',
      costNote: 'Использует квоту и авторизацию вашего аккаунта Qoder.',
      link: { label: 'Открыть qoder.com', url: 'https://qoder.com' },
      guide: [
        'Установи Qoder CLI в командной строке Windows (Win + R → cmd) первой командой ниже.',
        'Нажми «Войти в Qoder из окна» (или выполни qodercli login) и заверши вход в открывшейся странице.',
        'Нажми «Проверить подключение» — статус обновится, как только CLI появится в системе.'
      ],
      steps: [
        { label: '1. Установить Qoder CLI:', cmd: 'npm install -g @qoder-ai/qodercli' },
        { label: '2. Войти в аккаунт Qoder:', cmd: 'qodercli login' }
      ],
      tip: 'Qoder работает в AllY строго как помощник для чтения и анализа — основную запись и приёмку всегда ведёт выбранная ведущая нейросеть.'
    },
    {
      id: 'aggregator',
      short: 'Агрегатор API',
      sub: 'OpenRouter и др.',
      canLogin: false,
      isAggregator: true,
      title: 'Универсальный агрегатор моделей (OpenRouter и совместимый API)',
      summary: 'Подключи OpenRouter или любой Anthropic-совместимый шлюз: сотни моделей (Claude, GPT, Gemini, DeepSeek, Qwen, GLM) по одному локальному API-ключу.',
      costNote: 'Оплата идёт по тарифу и балансу выбранного тобой API-шлюза (например, OpenRouter).',
      link: { label: 'Ключи OpenRouter (openrouter.ai/keys)', url: 'https://openrouter.ai/keys' },
      guide: [
        'Открой сайт агрегатора (для OpenRouter — ссылку выше), зарегистрируйся и создай новый API-ключ (начинается с sk-or-v1-...).',
        'Ниже нажми пресет «OpenRouter» или выбери «Свой шлюз» и впиши Base URL своего провайдера.',
        'Вставь скопированный API-ключ (он хранится только локально в .ally-data и никогда не покидает твой компьютер) и при желании укажи модель по умолчанию.',
        'Нажми «Сохранить», а затем «Проверить связь (бесплатно)» — AllY запросит список моделей через GET /models без платного вызова.'
      ],
      tip: 'Для работы через агрегатор в AllY также должен быть установлен Claude Code CLI (без подписки Anthropic — ключ подставляется локально только в процесс CLI).'
    }
  ];

  window.ALLY_ONBOARDING_DATA = { WIDGETS, NETWORKS };
})();
