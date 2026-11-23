(() => {
  'use strict';
  const LS = 'ally-obuchenie-v1';
  const $ = id => document.getElementById(id);
  const library = $('library'), courseView = $('course');
  const lessonPane = $('lessonPane'), promptsPane = $('promptsPane'), tasksPane = $('tasksPane'), notesPane = $('notesPane');
  const state = { index: null, course: null, lesson: 1, tab: 'lesson', cache: {} };
  let progress = loadProgress();
  let selectedTag = '';
  const normalized = value => String(value ?? '').toLowerCase().replace(/ё/g, 'е');
  const courseTags = course => Array.isArray(course.tags) ? course.tags.filter(t => typeof t === 'string' && t.trim()) : [];
  function filterCourses() {
    const courses = state.index?.courses || [], terms = normalized($('courseFilter').value).trim().split(/\s+/).filter(Boolean);
    let shown = 0;
    $('courseCards').querySelectorAll('[data-course-index]').forEach(card => {
      const course = courses[Number(card.dataset.courseIndex)];
      const text = normalized([course.title, course.author, course.category, ...courseTags(course)].join(' '));
      card.hidden = !terms.every(t => text.includes(t)) || !!selectedTag && !courseTags(course).some(t => normalized(t) === selectedTag);
      if (!card.hidden) shown++;
      card.querySelectorAll('[data-topic]').forEach(b => b.setAttribute('aria-pressed', String(normalized(b.dataset.topic) === selectedTag)));
    });
    $('courseCount').textContent = 'Показано: ' + shown + ' из ' + courses.length;
    $('courseReset').disabled = !$('courseFilter').value && !selectedTag;
    $('courseEmpty').hidden = shown > 0;
  }
  $('courseFilter').oninput = filterCourses;
  $('courseReset').onclick = () => { $('courseFilter').value = ''; selectedTag = ''; filterCourses(); $('courseFilter').focus(); };

  function loadProgress() {
    try {
      const value = JSON.parse(localStorage.getItem(LS) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(LS, JSON.stringify(progress)); } catch {}
  }
  function courseProgress(id) {
    progress.courses = progress.courses || {};
    const value = progress.courses[id] = progress.courses[id] || {};
    value.done = value.done || {};
    value.steps = value.steps || {};
    return value;
  }
  function completedCount(id) {
    const value = progress.courses && progress.courses[id];
    return value && value.done ? Object.keys(value.done).filter(key => value.done[key]).length : 0;
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  async function getJSON(url) {
    const response = await fetch(url, { headers: { 'x-dzhinni': '1' }, cache: 'no-store' });
    if (!response.ok) throw new Error('Сервер вернул ' + response.status);
    return response.json();
  }
  function setCrumbs(text) { $('crumbs').textContent = text; }
  function showError(where, error) {
    where.innerHTML = '<p class="empty">Не удалось открыть: ' + esc(error.message || error) + '</p>';
  }

  async function boot() {
    if (new URLSearchParams(location.search).has('embed')) $('backAlly').hidden = true;
    try {
      state.index = await getJSON('/api/obuchenie');
      renderLibrary();
      route();
    } catch (error) {
      showError(library, error);
    }
  }

  function renderLibrary() {
    library.hidden = false;
    courseView.hidden = true;
    setCrumbs('Обучение');
    $('topProgress').textContent = '';
    const cards = $('courseCards');
    const courses = (state.index && state.index.courses) || [];
    cards.innerHTML = courses.map((course, index) => {
      const done = completedCount(course.id), total = course.lessons || 1, percent = Math.round(done / total * 100);
      return '<article class="course-card" data-course-index="' + index + '">' +
        '<h2>' + esc(course.title) + '</h2>' +
        '<div class="author">Автор: ' + esc(course.author || 'Не указан') + '</div>' +
        '<div class="author">' + esc(course.category || '') + '</div>' +
        '<div class="course-tags">' + courseTags(course).map(tag => '<button type="button" data-topic="' + esc(tag) + '" aria-pressed="false">' + esc(tag) + '</button>').join('') + '</div>' +
        '<div class="meta"><span>' + esc(course.modules) + ' модулей</span><span>' + esc(course.lessons) + ' уроков</span><span>' + esc(course.prompts) + ' промтов</span><span>' + esc(course.price) + '</span></div>' +
        '<div class="progress-line"><div class="bar"><i style="width:' + percent + '%"></i></div><span>' + done + ' из ' + total + '</span></div>' +
        '<button class="open" data-open="' + esc(course.id) + '">Открыть</button>' +
        '</article>';
    }).join('');
    cards.insertAdjacentHTML('beforeend', '<p id="courseEmpty" class="empty" hidden>' + (courses.length ? 'Ничего не найдено. Измени запрос или сбрось фильтры.' : 'Курсов пока нет.') + '</p>');
    cards.querySelectorAll('[data-topic]').forEach(button => { button.onclick = () => { const tag = normalized(button.dataset.topic); selectedTag = selectedTag === tag ? '' : tag; filterCourses(); }; });
    filterCourses();
    cards.querySelectorAll('[data-open]').forEach(button => {
      button.onclick = () => {
        const id = button.getAttribute('data-open');
        const saved = progress.courses && progress.courses[id] && progress.courses[id].last;
        location.hash = '#/course/' + id + '/' + (saved || 1) + '/lesson';
      };
    });
  }

  function courseById(id) { return ((state.index && state.index.courses) || []).find(item => item.id === id); }

  async function openCourse(id, number, tab) {
    library.hidden = true;
    courseView.hidden = false;
    const meta = courseById(id);
    if (!meta) { showError(lessonPane, new Error('курс не найден')); return; }
    try {
      if (!state.cache[id]) state.cache[id] = await getJSON('/api/obuchenie/' + id);
      state.course = state.cache[id];
    } catch (error) { showError(lessonPane, error); return; }
    const total = state.course.lessons.length;
    state.lesson = Math.min(Math.max(Number(number) || 1, 1), total);
    state.tab = ['lesson', 'prompts', 'tasks', 'notes'].includes(tab) ? tab : 'lesson';
    setCrumbs('Обучение / ' + state.course.title);
    $('sideTitle').textContent = state.course.title;
    renderSidebar();
    renderLesson();
  }

  function renderSidebar() {
    const list = $('lessonList');
    const course = state.course;
    const done = courseProgress(course.id).done;
    let html = '';
    for (const module of course.modules) {
      html += '<div class="module-title">' + esc(module.title) + '</div>';
      for (const number of module.lessons) {
        const lesson = course.lessons.find(item => item.num === number);
        if (!lesson) continue;
        html += '<button class="lesson-btn' + (number === state.lesson ? ' on' : '') + (done[number] ? ' done' : '') + '" data-lesson="' + number + '" data-title="' + esc(lesson.title.toLowerCase()) + '">' +
          '<span class="n">' + number + '</span><span class="t">' + esc(lesson.title) + '</span>' + (done[number] ? '<span class="tick">✓</span>' : '') + '</button>';
      }
    }
    list.innerHTML = html;
    list.querySelectorAll('[data-lesson]').forEach(button => {
      button.onclick = () => goLesson(Number(button.getAttribute('data-lesson')));
    });
    const count = completedCount(course.id), total = course.lessons.length;
    $('bar').style.width = Math.round(count / total * 100) + '%';
    $('progressText').textContent = count + ' из ' + total;
    $('topProgress').textContent = count + ' из ' + total + ' пройдено';
    $('lessonFilter').oninput = event => {
      const query = event.target.value.trim().toLowerCase();
      list.querySelectorAll('[data-lesson]').forEach(button => {
        button.hidden = !!query && !button.getAttribute('data-title').includes(query);
      });
    };
  }

  function goLesson(number) {
    location.hash = '#/course/' + state.course.id + '/' + number + '/' + state.tab;
  }

  function renderLesson() {
    const course = state.course, lesson = course.lessons.find(item => item.num === state.lesson);
    if (!lesson) return;
    const index = course.lessons.indexOf(lesson), total = course.lessons.length;
    courseProgress(course.id).last = lesson.num;
    saveProgress();
    $('lessonMeta').textContent = 'Урок ' + lesson.num + ' из ' + total + ' · Модуль ' + lesson.moduleNum + ' · ' + lesson.module;
    $('markDone').setAttribute('aria-pressed', isDone(lesson.num) ? 'true' : 'false');
    $('markDone').textContent = isDone(lesson.num) ? 'Пройден ✓' : 'Пройден';
    $('markDone').onclick = () => toggleDone(lesson.num);
    $('prevLesson').disabled = index <= 0;
    $('nextLesson').disabled = index >= total - 1;
    $('prevLesson').onclick = () => index > 0 && goLesson(course.lessons[index - 1].num);
    $('nextLesson').onclick = () => index < total - 1 && goLesson(course.lessons[index + 1].num);

    lessonPane.innerHTML = lesson.html || '';
    if (!lessonPane.querySelector('h1')) {
      const head = document.createElement('header');
      head.innerHTML = '<p>Модуль ' + esc(lesson.moduleNum) + ' · ' + esc(lesson.module) + '</p><h1>' + esc(lesson.title) + '</h1>';
      lessonPane.prepend(head);
    }
    lessonPane.querySelectorAll('strong').forEach(node => {
      const match = /^\[Промт\s+(\d+)\]$/.exec((node.textContent || '').trim());
      if (!match) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prompt-link';
      button.textContent = 'Промт ' + match[1];
      button.onclick = () => {
        setTab('prompts');
        setTimeout(() => {
          const card = document.getElementById('prompt-' + match[1]);
          if (card) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 40);
      };
      node.replaceWith(button);
    });
    lessonPane.querySelectorAll('img').forEach(image => {
      image.title = 'Нажми, чтобы увеличить';
      image.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        openLightbox(image.src, image.alt);
      };
    });
    lessonPane.querySelectorAll('a[href^="http"]').forEach(link => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
    renderPrompts(lesson);
    renderTasks(lesson);
    renderNotes(lesson);
    setTab(state.tab);
    $('nPrompts').textContent = lesson.prompts.length ? lesson.prompts.length : '';
    $('nTasks').textContent = (lesson.steps.length + (lesson.homework ? 1 : 0)) || '';
    $('nNotes').textContent = lesson.notes.length ? lesson.notes.length : '';
    document.querySelector('.reader').scrollTop = 0;
  }

  function isDone(number) { return !!courseProgress(state.course.id).done[number]; }
  function toggleDone(number) {
    const store = courseProgress(state.course.id);
    store.done[number] = !store.done[number];
    saveProgress();
    renderSidebar();
    renderLesson();
  }

  function renderPrompts(lesson) {
    if (!lesson.prompts.length) { promptsPane.innerHTML = '<p class="empty">В этом уроке нет готовых промтов.</p>'; return; }
    promptsPane.innerHTML = lesson.prompts.map(prompt => {
      const label = prompt.label || prompt.heading || 'Промт';
      return '<article class="prompt-card" id="prompt-' + prompt.index + '">' +
        '<div class="prompt-head"><span class="idx">№ ' + prompt.index + '</span><span class="label">' + esc(label) + '</span><button type="button" data-copy="' + prompt.index + '">Копировать</button></div>' +
        '<pre class="prompt-body"></pre></article>';
    }).join('');
    lesson.prompts.forEach(prompt => {
      const card = document.getElementById('prompt-' + prompt.index);
      const body = card && card.querySelector('.prompt-body');
      if (body) body.textContent = prompt.text;
    });
    promptsPane.querySelectorAll('[data-copy]').forEach(button => {
      button.onclick = () => {
        const prompt = lesson.prompts.find(item => String(item.index) === button.getAttribute('data-copy'));
        if (prompt) copyText(prompt.text, button);
      };
    });
  }

  function renderTasks(lesson) {
    const store = courseProgress(state.course.id);
    const steps = lesson.steps || [];
    let html = '';
    if (steps.length) {
      html += '<div class="task-block"><h3>Шаги урока</h3>';
      steps.forEach((step, index) => {
        const key = lesson.num + ':' + index;
        const checked = !!store.steps[key];
        html += '<label class="task-row' + (checked ? ' done' : '') + '"><input type="checkbox" data-step="' + index + '"' + (checked ? ' checked' : '') + '><span class="txt">' + esc(step) + '</span></label>';
      });
      html += '</div>';
    }
    if (lesson.summary) html += '<div class="task-block"><h3>Что должно получиться</h3><div class="summary">' + esc(lesson.summary) + '</div></div>';
    if (lesson.homework) html += '<div class="task-block"><h3>Домашнее задание</h3><div class="homework">' + esc(lesson.homework) + '</div></div>';
    tasksPane.innerHTML = html || '<p class="empty">В этом уроке нет отдельных заданий.</p>';
    tasksPane.querySelectorAll('[data-step]').forEach(input => {
      input.onchange = () => {
        const key = lesson.num + ':' + input.getAttribute('data-step');
        store.steps[key] = input.checked;
        saveProgress();
        input.closest('.task-row').classList.toggle('done', input.checked);
      };
    });
  }

  function renderNotes(lesson) {
    if (!lesson.notes || !lesson.notes.length) { notesPane.innerHTML = '<p class="empty">Пометок по автоматизации пока нет.</p>'; return; }
    notesPane.innerHTML = lesson.notes.map(note => {
      const text = typeof note === 'string' ? note : note.text;
      const button = typeof note === 'string' ? '' : note.knopka;
      return '<div class="note-card"><p>' + esc(text) + '</p>' + (button ? '<span class="knopka">→ ' + esc(button) + '</span>' : '') + '</div>';
    }).join('');
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tabs [data-tab]').forEach(button => {
      const on = button.getAttribute('data-tab') === tab;
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const map = { lesson: lessonPane, prompts: promptsPane, tasks: tasksPane, notes: notesPane };
    Object.entries(map).forEach(([name, pane]) => { pane.hidden = name !== tab; });
    if (state.course) history.replaceState(null, '', '#/course/' + state.course.id + '/' + state.lesson + '/' + tab);
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      try { document.execCommand('copy'); } catch {}
      area.remove();
    }
    const old = button.textContent;
    button.textContent = 'Скопировано';
    setTimeout(() => { button.textContent = old; }, 1200);
  }

  function openLightbox(src, alt) {
    const box = $('lightbox');
    box.querySelector('img').src = src;
    box.querySelector('img').alt = alt || 'Скриншот урока';
    box.hidden = false;
  }
  $('lightboxClose').onclick = () => { $('lightbox').hidden = true; };
  $('lightbox').onclick = event => { if (event.target.id === 'lightbox') $('lightbox').hidden = true; };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') $('lightbox').hidden = true;
    if (event.target.matches('input,textarea')) return;
    if (event.key === 'ArrowLeft' && !$('prevLesson').disabled) $('prevLesson').click();
    if (event.key === 'ArrowRight' && !$('nextLesson').disabled) $('nextLesson').click();
  });
  $('backLib').onclick = () => { location.hash = '#/'; };
  document.querySelectorAll('.tabs [data-tab]').forEach(button => {
    button.onclick = () => setTab(button.getAttribute('data-tab'));
  });

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'course' && parts[1]) openCourse(parts[1], Number(parts[2]) || 1, parts[3] || 'lesson');
    else renderLibrary();
  }
  window.addEventListener('hashchange', route);
  boot();
})();
