(function () {
  'use strict';

  const CONFIG = {
    SECONDS_PER_QUESTION: 30,
  };

  const SUBJECTS = [
    {
      id: 'Web',
      title: 'Web',
      label: '',
      meta: 'Веб-разработка · 9 вариантов · 360 вопросов',
    },
    {
      id: 'Java',
      title: 'Java',
      label: '',
      meta: 'Программирование · 9 вариантов · 360 вопросов',
    },
  ];

  const state = {
    subjectId: null,
    variantNum: null,
    isRandom: false,
    randomCount: 0,
    questions: [],
    currentIndex: 0,
    selectedLetter: null,
    answered: false,
    answers: [],
    secondsLeft: CONFIG.SECONDS_PER_QUESTION,
    timerId: null,
    isTimerEnabled: true,
  };

  const root = document.getElementById('app');

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'min') node.min = v;
      else if (k === 'max') node.max = v;
      else if (k === 'placeholder') node.placeholder = v;
      else if (k === 'type') node.type = v;
      else if (k === 'id') node.id = v;
      else if (k === 'for') node.setAttribute('for', v);
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== false && v !== null && v !== undefined) {
        node.setAttribute(k, v);
      }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  function clearTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function render(node) {
    root.innerHTML = '';
    node.classList.add('screen-enter');
    root.appendChild(node);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function getSubjectProgress(subjectId) {
    const progressData = JSON.parse(localStorage.getItem('aspan-progress')) || {};
    const subjectProgress = progressData[subjectId] || {};
    const correctCount = Object.keys(subjectProgress).length;
    
    let totalQuestions = 360; 
    if (window.QUIZ_DATA && window.QUIZ_DATA[subjectId]) {
      totalQuestions = window.QUIZ_DATA[subjectId].variants.reduce((s, v) => s + v.questions.length, 0);
    }
    
    const percent = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);
    return { correctCount, totalQuestions, percent };
  }

  function getStats() {
    const stats = JSON.parse(localStorage.getItem('aspan-stats')) || {
      attempts: 0,
      totalCorrect: 0,
      totalQuestions: 0,
      best: {},
      lastPlayed: null,
      maxStreak: 0,
      perfectCount: 0,
      completedVariants: {}, // { Web: [1,2], Java: [3] }
      firstVisit: null,
      lastVisit: null,
      returnedAfterWeek: false,
    };
    // Migration safety
    if (stats.maxStreak == null) stats.maxStreak = 0;
    if (stats.perfectCount == null) stats.perfectCount = 0;
    if (!stats.completedVariants) stats.completedVariants = {};
    return stats;
  }

  function saveStats(stats) {
    localStorage.setItem('aspan-stats', JSON.stringify(stats));
  }

  function computeMaxStreak(answers) {
    let max = 0, cur = 0;
    for (const a of answers) {
      if (a.isCorrect) { cur++; if (cur > max) max = cur; }
      else cur = 0;
    }
    return max;
  }

  function recordAttempt({ subjectId, variantNum, isRandom, total, correct, percent, answers }) {
    const stats = getStats();
    stats.attempts += 1;
    stats.totalCorrect += correct;
    stats.totalQuestions += total;
    stats.lastPlayed = new Date().toISOString();

    const streak = computeMaxStreak(answers || []);
    if (streak > stats.maxStreak) stats.maxStreak = streak;
    if (percent === 100) stats.perfectCount += 1;

    if (!isRandom && variantNum != null) {
      if (!stats.completedVariants[subjectId]) stats.completedVariants[subjectId] = [];
      if (!stats.completedVariants[subjectId].includes(variantNum)) {
        stats.completedVariants[subjectId].push(variantNum);
      }
    }

    const key = subjectId + '__' + (isRandom ? 'random' : 'v' + variantNum);
    const prev = stats.best[key];
    const isNewBest = !prev || percent > prev.percent;
    if (isNewBest) {
      stats.best[key] = { percent, correct, total, date: stats.lastPlayed, isRandom, variantNum, subjectId };
    }
    saveStats(stats);
    return { isNewBest, previousBest: prev };
  }

  function getBestOverall() {
    const stats = getStats();
    let best = null;
    for (const key of Object.keys(stats.best)) {
      const b = stats.best[key];
      if (!best || b.percent > best.percent) best = { ...b, key };
    }
    return best;
  }

  function animateCount(node, target, duration = 900) {
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = Math.round(from + (target - from) * eased).toString();
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderHome() {
    clearTimer();

    const card = el('section', { class: 'card' },
      el('h1', { class: 'title' }, 'Промежуточная ', el('em', {}, 'аттестация')),
      el('p', { class: 'subtitle' }, 'Выбери предмет, затем вариант. После ответа сразу видно, верно ли ты ответил, и какой ответ правильный.'),
      el('div', { class: 'choice-grid choice-grid--2' },
        ...SUBJECTS.map((s) => buildSubjectChoice(s))
      )
    );

    render(card);
  }

  // ============ STATS / PROFILE PAGE ============

  function getSubjectQuestionCount(subjectId) {
    if (window.QUIZ_DATA && window.QUIZ_DATA[subjectId]) {
      return window.QUIZ_DATA[subjectId].variants.reduce((s, v) => s + v.questions.length, 0);
    }
    return 360;
  }

  function getSubjectVariantCount(subjectId) {
    if (window.QUIZ_DATA && window.QUIZ_DATA[subjectId]) {
      return window.QUIZ_DATA[subjectId].variants.length;
    }
    return 9;
  }

  function computeAchievements(stats) {
    const totalStudiedAll = SUBJECTS.reduce((s, subj) => s + getSubjectProgress(subj.id).correctCount, 0);
    const webProg = getSubjectProgress('Web');
    const javaProg = getSubjectProgress('Java');
    const allSubjectsCovered = SUBJECTS.every(subj => {
      const list = stats.completedVariants[subj.id] || [];
      return list.length >= 1;
    });

    const allQuestionsAll = SUBJECTS.every(subj => {
      const prog = getSubjectProgress(subj.id);
      return prog.totalQuestions > 0 && prog.correctCount >= prog.totalQuestions;
    });

    return [
      { group: '🌱 Начало', items: [
        { icon: '👣', title: 'Первый шаг', desc: 'Ответить на первый вопрос', done: stats.totalQuestions >= 1 },
        { icon: '📝', title: 'Первый тест', desc: 'Завершить первый вариант', done: stats.attempts >= 1 },
        { icon: '🤝', title: 'Есть контакт', desc: 'Пройти 5 тестов', done: stats.attempts >= 5, progress: Math.min(stats.attempts, 5) + '/5' },
        { icon: '🎓', title: 'Опытный', desc: 'Пройти 25 тестов', done: stats.attempts >= 25, progress: Math.min(stats.attempts, 25) + '/25' },
      ]},
      { group: '📚 Изучение вопросов', items: [
        { icon: '🔍', title: 'Любопытный', desc: 'Изучить 50 вопросов', done: totalStudiedAll >= 50, progress: Math.min(totalStudiedAll, 50) + '/50' },
        { icon: '📖', title: 'Усердный ученик', desc: 'Изучить 100 вопросов', done: totalStudiedAll >= 100, progress: Math.min(totalStudiedAll, 100) + '/100' },
        { icon: '🧠', title: 'Эксперт', desc: 'Изучить 250 вопросов', done: totalStudiedAll >= 250, progress: Math.min(totalStudiedAll, 250) + '/250' },
        { icon: '📚', title: 'Энциклопедия', desc: 'Изучить все вопросы по всем предметам', done: allQuestionsAll },
      ]},
      { group: '🎯 Результаты', items: [
        { icon: '🎯', title: 'Хороший результат', desc: 'Получить 70% за тест', done: anyBestAtLeast(stats, 70) },
        { icon: '🏅', title: 'Отличник', desc: 'Получить 85% за тест', done: anyBestAtLeast(stats, 85) },
        { icon: '💎', title: 'Идеально', desc: 'Получить 100% за тест', done: stats.perfectCount >= 1 },
        { icon: '👑', title: 'Перфекционист', desc: 'Получить 100% три раза', done: stats.perfectCount >= 3, progress: Math.min(stats.perfectCount, 3) + '/3' },
      ]},
      { group: '🔥 Серии', items: [
        { icon: '⚡', title: 'В ударе', desc: '10 правильных ответов подряд', done: stats.maxStreak >= 10, progress: Math.min(stats.maxStreak, 10) + '/10' },
        { icon: '🔥', title: 'Невозможно остановить', desc: '25 правильных подряд', done: stats.maxStreak >= 25, progress: Math.min(stats.maxStreak, 25) + '/25' },
        { icon: '🌟', title: 'Легенда', desc: '50 правильных подряд', done: stats.maxStreak >= 50, progress: Math.min(stats.maxStreak, 50) + '/50' },
      ]},
      { group: '🌐 Предметы', items: [
        { icon: '💻', title: 'Web Мастер', desc: 'Изучить все вопросы по Web', done: webProg.totalQuestions > 0 && webProg.correctCount >= webProg.totalQuestions, progress: webProg.correctCount + '/' + webProg.totalQuestions },
        { icon: '☕', title: 'Java Гуру', desc: 'Изучить все вопросы по Java', done: javaProg.totalQuestions > 0 && javaProg.correctCount >= javaProg.totalQuestions, progress: javaProg.correctCount + '/' + javaProg.totalQuestions },
      ]},
      { group: '⭐ Секретные', items: [
        { icon: '🗝️', title: 'Возвращение', desc: 'Вернуться на сайт после 7 дней отсутствия', done: !!stats.returnedAfterWeek, secret: true },
        { icon: '🏆', title: 'Полная аттестация', desc: 'Пройти хотя бы по одному варианту каждого предмета', done: allSubjectsCovered, secret: true },
      ]},
    ];
  }

  function anyBestAtLeast(stats, threshold) {
    return Object.values(stats.best || {}).some(b => b.percent >= threshold);
  }

  function renderStats() {
    clearTimer();
    const stats = getStats();
    const best = getBestOverall();
    const avg = stats.totalQuestions > 0
      ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
      : 0;

    const achievementGroups = computeAchievements(stats);
    const unlocked = achievementGroups.reduce((s, g) => s + g.items.filter(i => i.done).length, 0);
    const total = achievementGroups.reduce((s, g) => s + g.items.length, 0);

    const hasActivity = stats.attempts > 0 || stats.totalQuestions > 0;

    const statsPanel = el('div', { class: 'stats-panel' },
      el('div', { class: 'stats-panel-header' },
        el('div', { class: 'eyebrow' }, 'Твоя статистика')
      ),
      el('div', { class: 'stats-grid' },
        el('div', { class: 'stat-card stat-card--accent' },
          el('div', { class: 'stat-card-label' }, 'Попыток'),
          el('div', { class: 'stat-card-value', 'data-count': stats.attempts }, '0')
        ),
        el('div', { class: 'stat-card' },
          el('div', { class: 'stat-card-label' }, 'Средний балл'),
          el('div', { class: 'stat-card-value' },
            el('span', { 'data-count': avg }, '0'),
            el('span', { class: 'stat-card-unit' }, '%')
          )
        ),
        el('div', { class: 'stat-card' },
          el('div', { class: 'stat-card-label' }, 'Отвечено вопросов'),
          el('div', { class: 'stat-card-value', 'data-count': stats.totalQuestions }, '0')
        ),
        el('div', { class: 'stat-card', title: best ? (best.subjectId + ' · ' + (best.isRandom ? 'Микс' : 'Вариант №' + best.variantNum) + ' — ' + best.correct + ' из ' + best.total) : '' },
          el('div', { class: 'stat-card-label' }, 'Лучший результат'),
          el('div', { class: 'stat-card-value' },
            el('span', { 'data-count': best ? best.percent : 0 }, '0'),
            el('span', { class: 'stat-card-unit' }, '%')
          )
        )
      )
    );

    const achievementsPanel = hasActivity ? el('div', { class: 'stats-panel' },
      el('div', { class: 'stats-panel-header' },
        el('div', { class: 'eyebrow' }, 'Достижения'),
        el('div', { class: 'achievements-count' }, unlocked + ' / ' + total)
      ),
      ...achievementGroups.map(g => el('div', { class: 'achievement-group' },
        el('div', { class: 'achievement-group-title' }, g.group),
        el('div', { class: 'achievement-grid' },
          ...g.items.map(it => {
            const hidden = it.secret && !it.done;
            return el('div', { class: 'achievement' + (it.done ? ' is-done' : '') + (hidden ? ' is-secret' : '') },
              el('div', { class: 'achievement-icon' }, hidden ? '🔒' : it.icon),
              el('div', { class: 'achievement-body' },
                el('div', { class: 'achievement-title' }, hidden ? 'Секретное достижение' : it.title),
                el('div', { class: 'achievement-desc' }, hidden ? 'Открой, чтобы узнать условие' : it.desc),
                it.progress && !it.done ? el('div', { class: 'achievement-progress' }, it.progress) : null,
                it.done ? el('div', { class: 'achievement-done' }, '✓ Получено') : null
              )
            );
          })
        )
      ))
    ) : null;

    const card = el('section', { class: 'card' },
      el('a', { class: 'back-link', href: '#', onclick: (e) => { e.preventDefault(); renderHome(); } }, '← На главную'),
      el('h1', { class: 'title' }, 'Профиль и ', el('em', {}, 'статистика')),
      el('p', { class: 'subtitle' }, hasActivity ? 'Подробная статистика и достижения, которые ты открыл.' : 'Пройди свой первый тест, чтобы здесь появилась статистика и достижения.'),
      statsPanel,
      achievementsPanel
    );

    render(card);

    requestAnimationFrame(() => {
      card.querySelectorAll('[data-count]').forEach((n) => {
        const target = parseInt(n.getAttribute('data-count'), 10) || 0;
        animateCount(n, target);
      });
    });
  }

  function buildSubjectChoice(s) {
    const prog = getSubjectProgress(s.id);

    return el('button',
      { class: 'choice', type: 'button', onclick: () => selectSubject(s.id) },
      el('div', { style: 'display: flex; justify-content: space-between; width: 100%; align-items: center;' },
        s.label ? el('span', { class: 'choice-label' }, s.label) : el('span'),
        prog.percent > 0 ? el('span', { style: 'font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--success);' }, `${prog.percent}%`) : null
      ),
      el('span', { class: 'choice-title' }, s.title),
      el('span', { class: 'choice-meta' }, s.meta),
      el('div', { style: 'margin-top: 14px; width: 100%; height: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; overflow: hidden;' },
        el('div', { style: `height: 100%; width: ${prog.percent}%; background: var(--success); border-radius: 999px; transition: width 0.8s ease;` })
      ),
      el('span', { style: 'font-size: 11px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em;' }, `Изучено: ${prog.correctCount} из ${prog.totalQuestions} вопр.`)
    );
  }

  function selectSubject(id) {
    state.subjectId = id;
    renderVariantSelect();
  }

  function renderVariantSelect() {
    clearTimer();

    const subjectData = window.QUIZ_DATA[state.subjectId];
    if (!subjectData) {
      render(el('section', { class: 'card' },
        el('h1', { class: 'title' }, 'Не нашёл данные'),
        el('p', { class: 'subtitle' }, 'Файл data.js не загрузился. Открой консоль (F12), посмотри ошибку.')
      ));
      return;
    }

    const totalQuestions = subjectData.variants.reduce((s, v) => s + v.questions.length, 0);

    const card = el('section', { class: 'card' },
      el('div', { class: 'card-badge' }, state.subjectId.toUpperCase()),
      el('a', { class: 'back-link', href: '#', onclick: (e) => { e.preventDefault(); renderHome(); } }, '← Назад к предметам'),
      el('h2', { class: 'title' }, 'Выбери ', el('em', {}, 'вариант')),
      el('p', { class: 'subtitle' }, `Всего ${subjectData.variants.length} вариантов по 40 вопросов. Включи таймер, чтобы усложнить задачу.`),

      el('div', { style: 'margin: 16px 0 28px 0; display: flex; align-items: center; gap: 10px; background: var(--surface-2); padding: 12px 16px; border-radius: var(--r-sm); border: 1px solid var(--border);' },
        el('input', {
          type: 'checkbox',
          id: 'timer-toggle',
          checked: state.isTimerEnabled,
          style: 'width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent);',
          onchange: (e) => { state.isTimerEnabled = e.target.checked; }
        }),
        el('label', { for: 'timer-toggle', style: 'font-size: 14px; font-weight: 600; color: var(--text); cursor: pointer; user-select: none;' }, 'Включить таймер (30 секунд на вопрос)')
      ),

      el('div', { class: 'stats-panel mix-panel' },
        el('div', { class: 'stats-panel-header' },
          el('div', { class: 'eyebrow' }, 'Микс вопросов')
        ),
        el('div', { class: 'random-row' },
          el('div', { class: 'random-tile' },
            el('div', { class: 'random-tile-icon' }, '🎲'),
            el('div', { class: 'random-tile-body' },
              el('div', { class: 'random-tile-title' }, 'Случайная подборка'),
              el('div', { class: 'random-tile-meta' }, `Доступно вопросов: ${totalQuestions}`)
            )
          ),
          el('div', { class: 'mix-count-label' }, 'Количество вопросов'),
          el('div', { class: 'mix-count-grid' },
            el('button', { class: 'mix-count-tile', type: 'button', onclick: () => startRandomQuiz(20) },
              el('span', { class: 'mix-count-num' }, '20'),
              el('span', { class: 'mix-count-cap' }, 'вопросов')
            ),
            el('button', { class: 'mix-count-tile', type: 'button', onclick: () => startRandomQuiz(40) },
              el('span', { class: 'mix-count-num' }, '40'),
              el('span', { class: 'mix-count-cap' }, 'вопросов')
            ),
            el('button', { class: 'mix-count-tile', type: 'button', onclick: () => startRandomQuiz(60) },
              el('span', { class: 'mix-count-num' }, '60'),
              el('span', { class: 'mix-count-cap' }, 'вопросов')
            ),
            el('button', { class: 'mix-count-tile', type: 'button', onclick: () => startRandomQuiz(totalQuestions) },
              el('span', { class: 'mix-count-num' }, 'Все'),
              el('span', { class: 'mix-count-cap' }, totalQuestions + ' вопр.')
            ),
            el('div', { class: 'mix-count-tile mix-count-tile--custom' },
              el('input', { class: 'mix-count-input', type: 'number', id: 'custom-mix-val', min: '1', max: totalQuestions, placeholder: 'Своё' }),
              el('button', { class: 'mix-count-go', type: 'button', onclick: () => {
                const val = parseInt(document.getElementById('custom-mix-val').value, 10);
                if (val > 0 && val <= totalQuestions) startRandomQuiz(val);
                else alert('Введите число от 1 до ' + totalQuestions);
              } }, 'Старт')
            )
          )
        )
      ),

      el('div', { class: 'section-divider' },
        el('span', { class: 'divider-label' }, 'или конкретный вариант')
      ),

      el('div', { class: 'variant-grid' },
        ...subjectData.variants.map((v) =>
          el('button', { class: 'variant-tile', type: 'button', onclick: () => startQuiz(v.variant) },
            el('span', { class: 'variant-tile-label' }, 'Вариант'),
            el('span', { class: 'variant-tile-num' }, '№' + v.variant),
            el('span', { class: 'variant-tile-label' }, v.questions.length + ' вопр.')
          )
        )
      )
    );

    render(card);
  }

  function startQuiz(variantNum) {
    const subjectData = window.QUIZ_DATA[state.subjectId];
    const variant = subjectData.variants.find((v) => v.variant === variantNum);
    if (!variant) return;

    state.variantNum = variantNum;
    state.isRandom = false;
    state.randomCount = 0;
    state.questions = variant.questions.map((q) => ({ ...q, _fromVariant: variantNum }));
    state.currentIndex = 0;
    state.answers = [];
    renderQuestion();
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function startRandomQuiz(count) {
    const subjectData = window.QUIZ_DATA[state.subjectId];
    if (!subjectData) return;

    const pool = [];
    for (const v of subjectData.variants) {
      for (const q of v.questions) {
        pool.push({ ...q, _fromVariant: v.variant });
      }
    }

    shuffle(pool);
    const slice = pool.slice(0, Math.min(count, pool.length));

    state.variantNum = null;
    state.isRandom = true;
    state.randomCount = slice.length;
    state.questions = slice;
    state.currentIndex = 0;
    state.answers = [];
    renderQuestion();
  }

  function renderQuestion() {
    clearTimer();
    state.selectedLetter = null;
    state.answered = false;
    state.secondsLeft = CONFIG.SECONDS_PER_QUESTION;

    const q = state.questions[state.currentIndex];
    if (!q) {
      renderResults();
      return;
    }

    const total = state.questions.length;
    const num = state.currentIndex + 1;
    const progressPct = (num / total) * 100;

    const optionsBox = el('div', { class: 'options', id: 'options-box' });
    for (const opt of q.options) {
      optionsBox.appendChild(
        el('button', {
          class: 'option',
          type: 'button',
          'data-letter': opt.letter,
          onclick: () => answerSelected(opt.letter),
        },
          el('span', { class: 'option-letter' }, opt.letter),
          el('span', { class: 'option-text' }, opt.text)
        )
      );
    }

    const shell = el('div', { class: 'quiz-shell' },
      el('div', { class: 'quiz-header' },
        el('div', { class: 'quiz-meta' },
          el('strong', {}, state.subjectId),
          el('span', { class: 'quiz-meta-divider' }),
          state.isRandom ? el('strong', { class: 'random-badge' }, '🎲 Микс') : 'Вариант ' + state.variantNum,
          el('span', { class: 'quiz-meta-divider' }),
          'Вопрос ' + num + ' / ' + total
        ),
        el('div', { 
          class: 'timer', 
          id: 'timer',
          style: 'cursor: default;'
        },
          el('span', { class: 'timer-dot' }),
          el('span', { id: 'timer-text' }, '00:' + pad(state.secondsLeft))
        )
      ),
      el('div', { class: 'progress' },
        el('div', { class: 'progress-bar', style: 'width: ' + progressPct + '%' })
      ),
      el('div', { class: 'question-card' },
        el('div', { class: 'question-number' }, 'Вопрос №' + num),
        el('div', { class: 'question-text' }, q.question),
        optionsBox,
        el('div', { id: 'feedback-slot' }),
        el('div', { class: 'next-row', id: 'next-slot' })
      )
    );

    render(shell);
    startTimer();
  }

  function startTimer() {
    updateTimerDisplay();
    if (!state.isTimerEnabled) return; 

    state.timerId = setInterval(() => {
      state.secondsLeft -= 1;
      updateTimerDisplay();
      if (state.secondsLeft <= 0) {
        clearTimer();
        if (!state.answered) handleTimeout();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const timer = document.getElementById('timer');
    const text = document.getElementById('timer-text');
    if (!timer || !text) return;

    timer.classList.remove('is-warning', 'is-danger', 'is-disabled');

    if (!state.isTimerEnabled) {
      text.textContent = 'Без времени (∞)';
      timer.classList.add('is-disabled');
      return;
    }

    text.textContent = '00:' + pad(Math.max(0, state.secondsLeft));
    if (state.secondsLeft <= 5) timer.classList.add('is-danger');
    else if (state.secondsLeft <= 10) timer.classList.add('is-warning');
  }

  function toggleTimer() {
    if (state.answered) return;
    state.isTimerEnabled = !state.isTimerEnabled;
    if (state.isTimerEnabled) {
      startTimer();
    } else {
      clearTimer();
      updateTimerDisplay();
    }
  }

  function answerSelected(letter) {
    if (state.answered) return;
    state.answered = true;
    state.selectedLetter = letter;
    clearTimer();

    const q = state.questions[state.currentIndex];
    const isCorrect = letter === q.correct;

    state.answers.push({
      questionIndex: state.currentIndex,
      selectedLetter: letter,
      correctLetter: q.correct,
      isCorrect,
      timedOut: false,
    });

    revealAnswer({ isCorrect, timedOut: false });
  }

  function handleTimeout() {
    state.answered = true;
    const q = state.questions[state.currentIndex];

    state.answers.push({
      questionIndex: state.currentIndex,
      selectedLetter: null,
      correctLetter: q.correct,
      isCorrect: false,
      timedOut: true,
    });

    revealAnswer({ isCorrect: false, timedOut: true });
  }

  function revealAnswer({ isCorrect, timedOut }) {
    const q = state.questions[state.currentIndex];

    const optionEls = document.querySelectorAll('#options-box .option');
    optionEls.forEach((btn) => {
      btn.disabled = true;
      const letter = btn.getAttribute('data-letter');
      if (letter === q.correct) {
        btn.classList.add('is-correct');
      } else if (letter === state.selectedLetter && !isCorrect) {
        btn.classList.add('is-incorrect');
      } else {
        btn.classList.add('is-dim');
      }
    });

    const feedbackSlot = document.getElementById('feedback-slot');
    feedbackSlot.innerHTML = '';
    const correctOption = q.options.find((o) => o.letter === q.correct);
    const correctText = correctOption ? `${q.correct}) ${correctOption.text}` : q.correct;

    let title;
    if (timedOut) title = 'Время вышло';
    else if (isCorrect) title = 'Верно!';
    else title = 'Неправильно';

    const fb = el('div',
      { class: 'feedback ' + (isCorrect ? 'feedback--correct' : 'feedback--incorrect') },
      el('div', { class: 'feedback-title' }, title),
      el('div', { class: 'feedback-body' }, 'Правильный ответ: ', el('strong', {}, correctText))
    );
    feedbackSlot.appendChild(fb);

    const explText = q.explanation ? q.explanation : 'Объяснение отсутствует в базе данных.';
    feedbackSlot.appendChild(
      el('div', { class: 'explanation-box' },
        el('strong', {}, 'Объяснение: '), explText
      )
    );

    const nextSlot = document.getElementById('next-slot');
    nextSlot.innerHTML = '';
    const isLast = state.currentIndex === state.questions.length - 1;
    nextSlot.appendChild(
      el('button',
        { class: 'btn-primary', type: 'button', onclick: nextQuestion },
        isLast ? 'Показать результаты →' : 'Следующий вопрос →'
      )
    );
  }

  function nextQuestion() {
    state.currentIndex += 1;
    if (state.currentIndex >= state.questions.length) {
      renderResults();
    } else {
      renderQuestion();
    }
  }

  function renderResults() {
    clearTimer();

    const total = state.questions.length;
    const correct = state.answers.filter((a) => a.isCorrect).length;
    const wrong = state.answers.filter((a) => !a.isCorrect && !a.timedOut).length;
    const skipped = state.answers.filter((a) => a.timedOut).length;
    const percent = total === 0 ? 0 : Math.round((correct / total) * 100);

    // Сохранение прогресса
    let progressData = JSON.parse(localStorage.getItem('aspan-progress')) || {};
    if (!progressData[state.subjectId]) progressData[state.subjectId] = {};
    
    state.answers.forEach(a => {
      if (a.isCorrect) {
        const q = state.questions[a.questionIndex];
        const uniqueKey = q._fromVariant + '_' + q.question;
        progressData[state.subjectId][uniqueKey] = true;
      }
    });
    localStorage.setItem('aspan-progress', JSON.stringify(progressData));

    const { isNewBest, previousBest } = recordAttempt({
      subjectId: state.subjectId,
      variantNum: state.variantNum,
      isRandom: state.isRandom,
      total, correct, percent, answers: state.answers,
    });

    const grade = computeGrade(percent);

    const ringRadius = 50;
    const circumference = 2 * Math.PI * ringRadius;
    const dashOffset = circumference - (percent / 100) * circumference;

    let reviewVisible = false;
    const reviewListNode = el('div', { class: 'review-list', id: 'review-list', style: 'display: none;' },
      ...buildReviewItems()
    );

    const eyebrowText = state.isRandom
      ? `${state.subjectId} · Микс ${total} вопросов · Итог`
      : `${state.subjectId} · Вариант ${state.variantNum} · Итог`;

    const card = el('section', { class: 'card' },
      el('div', { class: 'eyebrow' }, eyebrowText),
      isNewBest ? el('div', { class: 'new-best-badge' }, '★ Новый рекорд!' + (previousBest ? ` (было ${previousBest.percent}%)` : '')) : null,
      el('h1', { class: 'result-grade ' + grade.class }, grade.label),
      el('p', { class: 'subtitle' }, grade.message),

      el('div', { class: 'score-container' },
        el('div', { class: 'score-ring' },
          buildScoreRing(percent, dashOffset, circumference, grade.class),
          el('div', { class: 'score-center', style: 'position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;' },
            el('div', { class: 'stat-label' }, 'Результат'),
            el('div', { class: 'stat-value' }, percent + '%')
          )
        ),
        el('div', { class: 'stats' },
          buildStat('Правильно', correct, 'is-correct'),
          buildStat('Неверно', wrong, 'is-incorrect'),
          buildStat('Пропущено', skipped, 'is-skipped')
        )
      ),

      el('div', { class: 'btn-row' },
        state.isRandom
          ? el('button', { class: 'btn-primary', type: 'button', onclick: () => startRandomQuiz(state.randomCount) }, '🎲 Новый микс')
          : el('button', { class: 'btn-primary', type: 'button', onclick: () => startQuiz(state.variantNum) }, '↻ Пройти этот вариант снова'),
        el('button', { class: 'btn-ghost', type: 'button', onclick: renderVariantSelect }, state.isRandom ? 'К вариантам' : 'Другой вариант'),
        el('button', { class: 'btn-ghost', type: 'button', onclick: renderHome }, 'На главную'),
        el('button', {
          class: 'review-toggle',
          type: 'button',
          id: 'review-toggle',
          onclick: () => {
            reviewVisible = !reviewVisible;
            reviewListNode.style.display = reviewVisible ? 'flex' : 'none';
            document.getElementById('review-toggle').textContent = (reviewVisible ? '▾ ' : '▸ ') + 'Посмотреть ошибки и разбор';
          }
        }, '▸ Посмотреть ошибки и разбор')
      ),

      reviewListNode
    );

    render(card);
  }

  function buildScoreRing(percent, dashOffset, circumference, gradeClass) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ring-svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    
    const circleTrack = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleTrack.setAttribute('class', 'ring-track');
    circleTrack.setAttribute('cx', '60'); circleTrack.setAttribute('cy', '60'); circleTrack.setAttribute('r', '50');
    
    const circleFill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleFill.setAttribute('class', 'ring-fill ' + gradeClass);
    circleFill.setAttribute('cx', '60'); circleFill.setAttribute('cy', '60'); circleFill.setAttribute('r', '50');
    circleFill.setAttribute('stroke-dasharray', circumference);
    circleFill.setAttribute('stroke-dashoffset', circumference);
    
    svg.appendChild(circleTrack);
    svg.appendChild(circleFill);

    setTimeout(() => { circleFill.style.strokeDashoffset = dashOffset; }, 100);
    return svg;
  }

  function buildStat(label, value, klass) {
    return el('div', { class: 'stat' },
      el('div', { class: 'stat-value ' + (klass || '') }, value),
      el('div', { class: 'stat-label' }, label)
    );
  }

  function buildReviewItems() {
    return state.answers.map((a) => {
      const q = state.questions[a.questionIndex];
      const correctOpt = q.options.find((o) => o.letter === a.correctLetter);
      const selectedOpt = a.selectedLetter ? q.options.find((o) => o.letter === a.selectedLetter) : null;
      const explText = q.explanation ? q.explanation : 'Объяснение отсутствует в базе данных.';

      let cls = 'review-item ';
      if (a.timedOut) cls += 'is-skipped';
      else if (a.isCorrect) cls += 'is-correct';
      else cls += 'is-incorrect';

      const yourAnswer = a.timedOut
        ? el('span', { class: 'skip' }, '— (время вышло)')
        : el('span', { class: a.isCorrect ? 'ok' : 'bad' }, a.selectedLetter + ') ' + (selectedOpt ? selectedOpt.text : ''));

      return el('div', { class: cls },
        el('div', { class: 'review-q' },
          el('span', { class: 'review-num' }, '№' + (a.questionIndex + 1).toString().padStart(2, '0')),
          el('span', { class: 'review-text' }, q.question),
        ),
        state.isRandom && q._fromVariant ? el('div', { class: 'review-source' }, 'из варианта №' + q._fromVariant) : null,
        el('div', { class: 'review-answers' },
          el('div', {}, el('strong', {}, 'Твой ответ: '), yourAnswer),
          el('div', {}, el('strong', {}, 'Правильный: '), el('span', { class: 'ok' }, a.correctLetter + ') ' + (correctOpt ? correctOpt.text : ''))),
          el('div', { style: 'margin-top: 8px;' }, el('strong', {}, 'Объяснение: '), explText)
        )
      );
    });
  }

  function computeGrade(p) {
    if (p >= 90) return { label: 'Отлично', class: 'is-excellent', message: 'Сильный результат — материал освоен на отлично. Так держать!' };
    if (p >= 75) return { label: 'Хорошо', class: 'is-good', message: 'Хороший результат. Несколько мест можно подтянуть — посмотри разбор ответов.' };
    if (p >= 50) return { label: 'Удовлетворительно', class: 'is-ok', message: 'Базу знаешь, но ошибок многовато. Открой разбор и пройдись по слабым местам.' };
    return { label: 'Плохо', class: 'is-bad', message: 'Маловато правильных. Без паники: разбери все вопросы и пройди вариант ещё раз.' };
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('aspan-theme', newTheme);
  });

  const profileBtn = document.getElementById('profile-btn');
  if (profileBtn) profileBtn.addEventListener('click', renderStats);

  const savedTheme = localStorage.getItem('aspan-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Track visits for the "Возвращение" achievement
  (function trackVisit() {
    const stats = getStats();
    const now = new Date();
    const nowISO = now.toISOString();
    if (!stats.firstVisit) stats.firstVisit = nowISO;
    if (stats.lastVisit) {
      const diffDays = (now - new Date(stats.lastVisit)) / 86400000;
      if (diffDays >= 7) stats.returnedAfterWeek = true;
    }
    stats.lastVisit = nowISO;
    saveStats(stats);
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHome);
  } else {
    renderHome();
  }
})();
