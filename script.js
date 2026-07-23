'use strict';

/* ==========================================================================
   Header — скролл-эффект и мобильное меню
   ========================================================================== */

function initHeader() {
  const header = document.querySelector('[data-header]');
  const burger = document.querySelector('[data-burger]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  if (!header) return;

  // Класс is-scrolled при прокрутке ниже 40px
  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Бургер открывает/закрывает мобильное меню
  if (burger && mobileMenu) {
    const toggleMenu = (open) => {
      const isOpen = open ?? !mobileMenu.classList.contains('is-open');
      mobileMenu.classList.toggle('is-open', isOpen);
      burger.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    burger.addEventListener('click', () => toggleMenu());

    // Клик по ссылке в меню (в т.ч. по логотипу) — закрываем
    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => toggleMenu(false));
    });

    // Крестик — закрываем
    const closeBtn = mobileMenu.querySelector('[data-mobile-close]');
    if (closeBtn) closeBtn.addEventListener('click', () => toggleMenu(false));

    // Esc — закрываем
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
        toggleMenu(false);
      }
    });
  }
}

/* ==========================================================================
   Telegram lead sending — honeypot + rate-limit
   ==========================================================================
   ВНИМАНИЕ: сайт статический (GitHub Pages, без сервера), поэтому браузер
   обращается к Telegram Bot API напрямую. Токен виден в этом файле —
   подробности и план действий при злоупотреблении см. в README.md.
*/

const TELEGRAM_BOT_TOKEN = '8815584196:AAGTzYfqlgpf2ZsIBDqO8DioUXIqIU7ErAA';

// Все чаты, куда бот шлёт заявки одновременно.
// Чтобы добавить получателя — просто допиши его chat_id в массив.
// Чтобы узнать свой chat_id — напиши боту @userinfobot в Telegram.
const TELEGRAM_CHAT_IDS = [
  '5065897318',  // Владислав (владелец)
  '5042071687',  // дополнительный получатель
];

const WHATSAPP_NUMBER = '79954423347';
const TELEGRAM_PHONE = '+79954423347';
// Почты для дублирования заявок (FormSubmit — подтвердите активацию на каждом адресе)
const LEAD_EMAILS = [
  '7459715@mail.ru',
  'mihaiwladyslaw@yandex.ru',
];
function waHref(){ return 'https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent('Здравствуйте! Хочу рассчитать стоимость кровли.'); }
const RATE_LIMIT_KEY = 'lead_last_sent_at';
const RATE_LIMIT_MS = 30000;

function isRateLimited() {
  const last = localStorage.getItem(RATE_LIMIT_KEY);
  if (!last) return false;
  return Date.now() - Number(last) < RATE_LIMIT_MS;
}
function markSent() {
  localStorage.setItem(RATE_LIMIT_KEY, String(Date.now()));
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SOURCE_LABELS = {
  quiz: 'Квиз (расчёт сметы)',
  'hero-form': 'Быстрая форма (Hero)',
  'final-cta': 'Финальная форма',
  calc: 'Калькулятор',
  'mini-quiz': 'Мини-квиз',
};

/**
 * Отправляет лид в Telegram.
 * @param {{source:string,name:string,phone:string,honeypot?:string,details?:Object}} payload
 * @returns {Promise<void>}
 */
async function sendLead(payload) {
  if (payload.honeypot) return; // бот заполнил скрытое поле — молча игнорируем

  if (isRateLimited()) {
    throw new Error('Заявка уже отправлена недавно. Мы уже её получили — перезвоним в ближайшее время.');
  }

  const details = [];
  if (payload.details) {
    for (const [key, value] of Object.entries(payload.details)) {
      if (value) details.push(`${key}: ${value}`);
    }
  }

  const lines = [
    '🏠 <b>Новая заявка — Кровля.Эксперт</b>',
    `Источник: ${SOURCE_LABELS[payload.source] || payload.source}`,
    `Имя: ${escapeHtml(payload.name)}`,
    `Телефон: ${escapeHtml(payload.phone)}`,
    ...details.map((d) => escapeHtml(d)),
  ];

  // 1) Telegram — шлём одновременно во все chat_id из массива TELEGRAM_CHAT_IDS
  const tgPromise = Promise.all(
    TELEGRAM_CHAT_IDS.map((chatId) =>
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
      }).then((r) => r.ok).catch(() => false)
    )
  ).then((results) => results.some(Boolean)); // успех, если хоть одно сообщение ушло

  // 2) Email — дублирование заявки на почту
  // 2) Email через FormSubmit — дублирование на все адреса
  const mailBody = JSON.stringify({
    _subject: `Заявка с сайта — ${SOURCE_LABELS[payload.source] || payload.source}`,
    _template: 'table',
    _captcha: 'false',
    'Имя': payload.name,
    'Телефон': payload.phone,
    'Источник': SOURCE_LABELS[payload.source] || payload.source,
    'Детали': details.join(' · ') || '—',
    'Время': new Date().toLocaleString('ru-RU'),
  });
  const mailPromise = Promise.all(
    LEAD_EMAILS.map((email) =>
      fetch('https://formsubmit.co/ajax/' + email, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: mailBody,
      }).then((r) => r.ok).catch(() => false)
    )
  ).then((results) => results.some(Boolean));

  const [tgOk, mailOk] = await Promise.all([tgPromise, mailPromise]);

  // Успех, если заявка ушла хотя бы одним каналом
  if (!tgOk && !mailOk) throw new Error('Не удалось отправить заявку. Попробуйте написать в WhatsApp.');
  markSent();
}

/* ==========================================================================
   Калькулятор кровли — вилка «от X до Y ₽»
   ========================================================================== */

function initCalculator() {
  const root = document.querySelector('[data-calc]');
  if (!root) return;

  const areaInput = root.querySelector('[data-calc-area]');
  const areaValue = root.querySelector('[data-calc-area-value]');
  const materialBtns = root.querySelectorAll('[data-calc-material]');
  const complexityBtns = root.querySelectorAll('[data-calc-complexity]');
  const minEl = root.querySelector('[data-calc-result-min]');
  const maxEl = root.querySelector('[data-calc-result-max]');
  const resultValue = root.querySelector('.calc-result-value');

  let state = {
    area: Number(areaInput.value),
    materialMin: Number(root.querySelector('.calc-mat-btn.is-active').dataset.calcMin),
    materialMax: Number(root.querySelector('.calc-mat-btn.is-active').dataset.calcMax),
    multiplier: Number(root.querySelector('.calc-cx-btn.is-active').dataset.calcMultiplier),
  };

  function formatRub(n) {
    const rounded = Math.round(n / 1000) * 1000;
    return rounded.toLocaleString('ru-RU').replace(/,/g, ' ');
  }

  function recalculate() {
    const min = state.area * state.materialMin * state.multiplier;
    const max = state.area * state.materialMax * state.multiplier;

    resultValue.classList.add('is-updating');
    setTimeout(() => {
      minEl.textContent = formatRub(min);
      maxEl.textContent = formatRub(max);
      resultValue.classList.remove('is-updating');
    }, 120);
  }

  areaInput.addEventListener('input', () => {
    state.area = Number(areaInput.value);
    areaValue.textContent = state.area + ' м²';
    recalculate();
  });

  materialBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      materialBtns.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.materialMin = Number(btn.dataset.calcMin);
      state.materialMax = Number(btn.dataset.calcMax);
      recalculate();
    });
  });

  complexityBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      complexityBtns.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.multiplier = Number(btn.dataset.calcMultiplier);
      recalculate();
    });
  });

  recalculate();
}

/* ==========================================================================
   Mini-Quiz — быстрая оценка стоимости в блоке боли №2
   ========================================================================== */

function initMiniQuiz() {
  const root = document.querySelector('[data-mini-quiz]');
  if (!root) return;

  const steps = root.querySelectorAll('[data-mq-step]');
  const step1Opts = root.querySelectorAll('[data-mq-answer]');
  const step2Opts = root.querySelectorAll('[data-mq-work]');
  const backBtn = root.querySelector('[data-mq-back]');
  const restartBtn = root.querySelector('[data-mq-restart]');
  const minEl = root.querySelector('[data-mq-min]');
  const maxEl = root.querySelector('[data-mq-max]');
  const resultValue = root.querySelector('.mini-quiz-result-value');

  let state = { multiplier: 1, base: 0 };

  function formatRub(n) {
    const rounded = Math.round(n / 1000) * 1000;
    return rounded.toLocaleString('ru-RU').replace(/,/g, ' ');
  }

  function showStep(n) {
    steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.mqStep) === n));
  }

  function calculate() {
    const min = state.base * state.multiplier;
    const max = state.base * state.multiplier * 1.55;
    resultValue.classList.add('is-updating');
    setTimeout(() => {
      minEl.textContent = formatRub(min);
      maxEl.textContent = formatRub(max);
      resultValue.classList.remove('is-updating');
    }, 120);
  }

  // Шаг 1: выбор типа дома
  step1Opts.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.multiplier = Number(btn.dataset.mqMultiplier);
      showStep(2);
    });
  });

  // Шаг 2: выбор типа работ → результат
  step2Opts.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.base = Number(btn.dataset.mqBase);
      calculate();
      showStep(3);
    });
  });

  // Назад с шага 2 на шаг 1
  if (backBtn) backBtn.addEventListener('click', () => showStep(1));

  // Пересчитать заново
  if (restartBtn) restartBtn.addEventListener('click', () => {
    state = { multiplier: 1, base: 0 };
    showStep(1);
  });
}

/* ==========================================================================
   Phone mask +7 (___) ___-__-__
   ========================================================================== */

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').replace(/^7|^8/, '');
  const d = digits.slice(0, 10);
  let out = '+7';
  if (d.length > 0) out += ` (${d.slice(0, 3)}`;
  if (d.length >= 3) out += `) ${d.slice(3, 6)}`;
  if (d.length >= 6) out += `-${d.slice(6, 8)}`;
  if (d.length >= 8) out += `-${d.slice(8, 10)}`;
  return out;
}

function attachPhoneMask(input) {
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const before = input.value.length;
    input.value = formatPhone(input.value);
    const after = input.value.length;
    input.selectionStart = input.selectionEnd = Math.max(0, (pos || 0) + (after - before));
  });
  input.addEventListener('focus', () => { if (!input.value) input.value = '+7'; });
}

/* ==========================================================================
   Generic form handler (hero + final CTA)
   ========================================================================== */

function initSimpleForm(formEl, source) {
  if (!formEl) return;
  const phoneInput = formEl.querySelector('[data-field="phone"]');
  const nameInput = formEl.querySelector('[data-field="name"]');
  const honeypot = formEl.querySelector('[data-field="honeypot"]');
  const consent = formEl.querySelector('[data-consent]');
  const submitBtn = formEl.querySelector('[data-submit]');
  const errorEl = formEl.querySelector('[data-error]');

  if (phoneInput) attachPhoneMask(phoneInput);

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (name.length < 2) { errorEl.textContent = 'Введите имя'; return; }
    if (phone.replace(/\D/g, '').length < 11) { errorEl.textContent = 'Введите корректный номер'; return; }
    if (consent && !consent.checked) { errorEl.textContent = 'Нужно согласие на обработку персональных данных'; return; }

    submitBtn.disabled = true;
    submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner"></span>';

    try {
      await sendLead({ source, name, phone, honeypot: honeypot ? honeypot.value : '' });
      window.location.href = 'thanks.html';
    } catch (err) {
      errorEl.innerHTML = (err.message || 'Что-то пошло не так, попробуйте ещё раз.') + ' <a class="field-error-wa" href="' + waHref() + '" target="_blank" rel="noopener">Написать в WhatsApp →</a>';
      submitBtn.disabled = false;
      submitBtn.innerHTML = submitBtn.dataset.originalText;
    }
  });
}

/* ==========================================================================
   Roof scheme — интерактивная схема кровельного пирога
   ========================================================================== */

const roofLayers = [
  {
    id: 'rafters',
    title: 'Стропильная система',
    short: 'Несущий каркас из сухого бруса камерной сушки',
    detail: 'Сечение и шаг стропил рассчитываются под снеговую и ветровую нагрузку конкретного региона, а не берутся «по таблице из интернета». Мы используем брус камерной сушки — влажность 12-18%, что исключает усадку и появление щелей в кровельном пироге через 2-3 года эксплуатации.',
    mistake: 'Типичная ошибка бригад-подрядчиков: брус естественной влажности «с рынка» — он ведёт и скручивает при высыхании, нарушая геометрию всей кровли.',
  },
  {
    id: 'vapor-barrier',
    title: 'Пароизоляция',
    short: 'Защита утеплителя от влаги изнутри дома',
    detail: 'Пароизоляционная плёнка укладывается со стороны отапливаемого помещения внахлёст не менее 15 см, все стыки проклеиваются специальной лентой, а примыкания к стенам и трубам герметизируются. Это останавливает влажный воздух из дома, который иначе оседает конденсатом внутри утеплителя.',
    mistake: 'Экономия на проклейке швов — самая частая причина, по которой утеплитель намокает изнутри и теряет свойства уже за первую зиму.',
  },
  {
    id: 'insulation',
    title: 'Утеплитель',
    short: 'Минеральная вата нужной плотности в 2 слоя',
    detail: 'Толщина рассчитывается теплотехническим расчётом под климатическую зону, а не «на глаз». Мы укладываем в два слоя со смещением швов, чтобы исключить мостики холода на стыках — именно через них чаще всего уходит тепло и образуется наледь на кровле зимой.',
    mistake: 'Однослойная укладка «встык» — швы совпадают, и через них дом теряет тепло сильнее, чем через голую стену.',
  },
  {
    id: 'membrane',
    title: 'Гидроизоляционная мембрана',
    short: 'Супердиффузионная мембрана — выпускает пар, держит воду',
    detail: 'Мембрана пропускает водяной пар изнутри наружу, но не пропускает влагу снаружи внутрь — это и есть работающая вентиляция кровельного пирога. Между мембраной и покрытием оставляется вентиляционный зазор 40-50 мм для свободной циркуляции воздуха.',
    mistake: 'Использование обычной гидроизоляционной плёнки вместо супердиффузионной мембраны — конденсат запирается внутри пирога, утеплитель гниёт изнутри незаметно для хозяина.',
  },
  {
    id: 'cladding',
    title: 'Финишное покрытие',
    short: 'Кликфальц, гибкая черепица или композитная металлочерепица',
    detail: 'Финишный слой — это то, что видно, но не единственное, что определяет срок службы. Мы уделяем особое внимание проходным элементам — трубы, антенны, мансардные окна — именно в этих узлах чаще всего появляются протечки, если герметизация выполнена без соблюдения технологии производителя.',
    mistake: 'Универсальные «на глаз подогнанные» примыкания вместо заводских проходных элементов — 80% протечек случаются именно в узлах, а не на ровной плоскости ската.',
  },
];

function initRoofScheme() {
  const container = document.querySelector('[data-roof-layers]');
  const detailContainer = document.querySelector('[data-roof-detail]');
  if (!container || !detailContainer) return;

  let activeId = null;

  container.innerHTML = roofLayers.map((layer, i) => `
    <button class="roof-layer" data-layer-id="${layer.id}" style="--layer-bg: ${['#3A3F42','#4C4136','#6B5A3E','#8A7355','#A8683C'][i]}">
      <span class="roof-layer-left">
        <span class="roof-layer-num">0${i + 1}</span>
        <span>
          <span class="roof-layer-title" style="display:block">${layer.title}</span>
          <span class="roof-layer-short">${layer.short}</span>
        </span>
      </span>
      <svg class="roof-layer-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
    </button>
  `).join('');

  container.querySelectorAll('.roof-layer').forEach((btn) => {
    btn.style.backgroundColor = btn.style.getPropertyValue('--layer-bg');
  });

  function renderDetail() {
    const active = roofLayers.find((l) => l.id === activeId);
    if (!active) {
      detailContainer.innerHTML = `
        <div class="roof-detail-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 5v14M5 12h14"/></svg>
          <p style="font-size:14px">Выберите слой слева, чтобы увидеть детали монтажа</p>
        </div>`;
      return;
    }
    detailContainer.innerHTML = `
      <div class="roof-detail">
        <div class="roof-detail-head">
          <h3>${active.title}</h3>
          <button data-close-detail aria-label="Закрыть">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p class="body">${active.detail}</p>
        <div class="roof-detail-mistake">
          <span class="label">Почему у других течёт</span>
          <p>${active.mistake}</p>
        </div>
      </div>`;
    detailContainer.querySelector('[data-close-detail]').addEventListener('click', () => {
      activeId = null;
      updateActiveStates();
      renderDetail();
    });
  }

  function updateActiveStates() {
    container.querySelectorAll('.roof-layer').forEach((btn) => {
      const isActive = btn.dataset.layerId === activeId;
      btn.classList.toggle('is-active', isActive);
      btn.style.backgroundColor = isActive ? '' : btn.style.getPropertyValue('--layer-bg');
    });
  }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.roof-layer');
    if (!btn) return;
    activeId = activeId === btn.dataset.layerId ? null : btn.dataset.layerId;
    updateActiveStates();
    renderDetail();
  });

  renderDetail();
}

/* ==========================================================================
   Quiz — 4-шаговый расчёт сметы
   ========================================================================== */

const quizSteps = [
  { key: 'shape', title: 'Какая форма крыши у вашего дома?', options: [
    { value: 'gable', label: 'Двускатная' },
    { value: 'hip', label: 'Вальмовая' },
    { value: 'complex', label: 'Сложная многощипцовая' },
    { value: 'flat', label: 'Плоская / односкатная' },
  ]},
  { key: 'area', title: 'Примерная площадь кровли?', options: [
    { value: 'lt80', label: 'До 80 м²' },
    { value: '80-150', label: '80–150 м²' },
    { value: '150-250', label: '150–250 м²' },
    { value: 'gt250', label: 'Более 250 м²' },
  ]},
  { key: 'material', title: 'Какой материал рассматриваете?', options: [
    { value: 'klikfalz', label: 'Кликфальц' },
    { value: 'soft', label: 'Гибкая черепица' },
    { value: 'composite', label: 'Композитная металлочерепица' },
    { value: 'unsure', label: 'Ещё не решил(а) — нужна консультация' },
  ]},
  { key: 'timing', title: 'Когда планируете монтаж?', options: [
    { value: 'asap', label: 'Как можно скорее' },
    { value: '1-3m', label: 'В течение 1–3 месяцев' },
    { value: 'season', label: 'К следующему сезону' },
    { value: 'planning', label: 'Пока изучаю вопрос' },
  ]},
];

function initQuiz() {
  const root = document.querySelector('[data-quiz]');
  if (!root) return;

  const progressBar = root.querySelector('[data-quiz-progress]');
  const stepsContainer = root.querySelector('[data-quiz-steps]');
  const answers = {};
  let currentStep = 0; // 0-3 вопросы, 4 контакты, 5 успех
  const totalSteps = quizSteps.length + 1;

  function labelFor(stepIndex, value) {
    const opt = quizSteps[stepIndex].options.find((o) => o.value === value);
    return opt ? opt.label : undefined;
  }

  function updateProgress() {
    const pct = Math.min(((currentStep + 1) / totalSteps) * 100, 100);
    progressBar.style.width = pct + '%';
  }

  function render() {
    updateProgress();

    if (currentStep < quizSteps.length) {
      const step = quizSteps[currentStep];
      stepsContainer.innerHTML = `
        <div class="quiz-step is-active">
          <span class="quiz-step-label">Шаг ${currentStep + 1} из 4</span>
          <h3>${step.title}</h3>
          <div class="quiz-options">
            ${step.options.map((opt) => `<button class="quiz-option" data-value="${opt.value}">${opt.label}</button>`).join('')}
          </div>
          ${currentStep > 0 ? `<button class="quiz-back" data-quiz-back>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Назад
          </button>` : ''}
        </div>`;

      stepsContainer.querySelectorAll('.quiz-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          answers[step.key] = btn.dataset.value;
          currentStep += 1;
          render();
        });
      });
      const backBtn = stepsContainer.querySelector('[data-quiz-back]');
      if (backBtn) backBtn.addEventListener('click', () => { currentStep -= 1; render(); });

    } else if (currentStep === quizSteps.length) {
      stepsContainer.innerHTML = `
        <form class="quiz-step is-active" data-quiz-contact-form>
          <span class="quiz-step-label">Последний шаг</span>
          <h3>Куда прислать расчёт?</h3>
          <p class="quiz-contact-sub">Пришлём смету в 3 вариантах бюджета и согласуем время бесплатного выезда инженера</p>
          <input type="text" tabindex="-1" autocomplete="off" class="honeypot" data-quiz-honeypot aria-hidden="true" />
          <div class="quiz-contact-fields">
            <input required class="field field--light" placeholder="Ваше имя" data-quiz-name />
            <input required inputmode="tel" class="field field--light" placeholder="+7 (___) ___-__-__" data-quiz-phone value="+7" />
          </div>
          <label class="consent consent--light" style="color:rgba(26,22,19,.6)"><input type="checkbox" data-quiz-consent><span>Даю <a href="consent.html" target="_blank" rel="noopener">согласие на обработку персональных данных</a> и принимаю <a href="privacy.html" target="_blank" rel="noopener">политику</a></span></label>
          <p class="lead-guide-note lead-guide-note--light" style="text-align:left;margin:6px 0 0">📕 В подарок — PDF-гайд «12&nbsp;пунктов, по которым завышают смету»</p>
          <div class="quiz-contact-actions">
            <button type="submit" class="btn btn-primary" data-quiz-submit>Получить расчёт
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </button>
            <button type="button" class="quiz-back" data-quiz-back>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Назад
            </button>
          </div>
          <p class="field-error field-error--light" data-quiz-error style="margin-top:12px"></p>
        </form>`;

      const phoneField = stepsContainer.querySelector('[data-quiz-phone]');
      attachPhoneMask(phoneField);
      stepsContainer.querySelector('[data-quiz-back]').addEventListener('click', () => { currentStep -= 1; render(); });

      stepsContainer.querySelector('[data-quiz-contact-form]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameEl = stepsContainer.querySelector('[data-quiz-name]');
        const phoneEl = stepsContainer.querySelector('[data-quiz-phone]');
        const honeypotEl = stepsContainer.querySelector('[data-quiz-honeypot]');
        const errorEl = stepsContainer.querySelector('[data-quiz-error]');
        const submitBtn = stepsContainer.querySelector('[data-quiz-submit]');

        const name = nameEl.value.trim();
        const phone = phoneEl.value.trim();
        errorEl.textContent = '';
        const consentEl = stepsContainer.querySelector('[data-quiz-consent]');
        if (consentEl && !consentEl.checked) { errorEl.textContent = 'Нужно согласие на обработку персональных данных'; return; }

        if (name.length < 2) { errorEl.textContent = 'Введите имя'; return; }
        if (phone.replace(/\D/g, '').length < 11) { errorEl.textContent = 'Введите корректный номер'; return; }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>';

        try {
          await sendLead({
            source: 'quiz', name, phone, honeypot: honeypotEl.value,
            details: {
              'Форма крыши': labelFor(0, answers.shape),
              'Площадь': labelFor(1, answers.area),
              'Материал': labelFor(2, answers.material),
              'Сроки': labelFor(3, answers.timing),
            },
          });
          window.location.href = 'thanks.html';
        } catch (err) {
          errorEl.textContent = err.message || 'Не получилось отправить, попробуйте ещё раз.';
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Получить расчёт';
        }
      });

    } else {
      stepsContainer.innerHTML = `
        <div class="quiz-success">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          <h3>Заявка отправлена</h3>
          <p>В течение 30 минут с вами свяжется директор компании, чтобы согласовать удобное время бесплатного выезда замерщика.</p>
        </div>`;
    }
  }

  render();
}

/* ==========================================================================
   Cases carousel + before/after compare slider
   ========================================================================== */

const casesData = [
  {
    id: 'case-1', location: 'СНТ «Заря», Одинцовский р-н',
    title: 'Замена кровли на дачном доме после протечек',
    material: 'Металлочерепица Grand Line', area: '120 м²', duration: '8 рабочих дней', budget: '480 000 ₽',
    description: 'Хозяева обратились с протечками по чердаку — предыдущая бригада уложила металлочерепицу без гидроизоляции. Демонтировали старое покрытие, собрали правильный кровельный пирог с супердиффузионной мембраной, поставили новую металлочерепицу.',
    before: 'images/case-1-before.webp', after: 'images/case-1-after.webp',
  },
  {
    id: 'case-2', location: 'КП «Лесной», Чехов, МО',
    title: 'Реконструкция вальмовой кровли частного дома',
    material: 'Композитная металлочерепица Metrotile', area: '180 м²', duration: '12 рабочих дней', budget: '760 000 ₽',
    description: 'Промерзание углов и появление наледи из-за неправильно уложенного утеплителя и отсутствия вентзазора. Переделали кровельный пирог полностью, заменили узлы примыкания к трубе и мансардным окнам.',
    before: 'images/case-2-before.webp', after: 'images/case-2-after.webp',
  },
  {
    id: 'case-3', location: 'п. Ясногорск, Тульская обл.',
    title: 'Монтаж кровли под ключ на новом доме',
    material: 'Гибкая черепица Shinglas', area: '160 м²', duration: '10 рабочих дней', budget: '540 000 ₽',
    description: 'Новое строительство — двускатная крыша с одним слуховым окном. Полный цикл от стропильной системы до финишного покрытия. Заказчик присутствовал только на приёмке этапов, всё остальное время работой руководил директор компании.',
    after: 'images/case-3-full.webp',
  },
  {
    id: 'case-4', location: 'д. Марушкино, Новая Москва',
    title: 'Замена кровли на доме с сохранением фасада',
    material: 'Кликфальц Grand Line', area: '140 м²', duration: '9 рабочих дней', budget: '620 000 ₽',
    description: 'Заказчик хотел заменить старую металлочерепицу на кликфальц без ущерба для отделанного фасада. Использовали защитные плёнки по всему периметру, вывоз демонтированного материала — за наш счёт. Сдали за 9 дней при обещанных 12.',
    before: 'images/case-4-before.webp', after: 'images/case-4-after.webp',
  },
];

function initCases() {
  const track = document.querySelector('[data-cases-track]');
  const dotsContainer = document.querySelector('[data-cases-dots]');
  const prevBtn = document.querySelector('[data-cases-prev]');
  const nextBtn = document.querySelector('[data-cases-next]');
  if (!track) return;

  track.innerHTML = casesData.map((c) => `
    <div class="case-card">
      ${c.before ? `
        <div class="compare-slider" data-compare>
          <div class="compare-after" style="background-image:url('${c.after}')" role="img" aria-label="${c.title} — после"></div>
          <div class="compare-before" style="background-image:url('${c.before}')" role="img" aria-label="${c.title} — до"></div>
          <span class="compare-tag compare-tag--before">До</span>
          <span class="compare-tag compare-tag--after">После</span>
          <div class="compare-handle">
            <div class="compare-handle-knob">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 9 5 12l3 3M16 9l3 3-3 3M5 12h14"/></svg>
            </div>
          </div>
        </div>` : `
        <div class="case-image-single" style="background-image:url('${c.after}')" role="img" aria-label="${c.title}"></div>
      `}
      <div class="case-content">
        <div class="case-location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>
          ${c.location}
        </div>
        <h3 class="case-title">${c.title}</h3>
        <p class="case-desc">${c.description}</p>
        <div class="case-meta">
          <div><p class="case-meta-label">Площадь</p><p class="case-meta-value">${c.area}</p></div>
          <div><p class="case-meta-label">Срок</p><p class="case-meta-value">${c.duration}</p></div>
          <div><p class="case-meta-label">Бюджет</p><p class="case-meta-value">${c.budget}</p></div>
        </div>
      </div>
    </div>
  `).join('');

  dotsContainer.innerHTML = casesData.map((_, i) => `<button data-dot-index="${i}" aria-label="Кейс ${i + 1}"></button>`).join('');

  // Компараторы До/После
  track.querySelectorAll('[data-compare]').forEach((slider) => {
    const before = slider.querySelector('.compare-before');
    const handle = slider.querySelector('.compare-handle');
    let dragging = false;

    function updateFromClientX(clientX) {
      const rect = slider.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.min(100, Math.max(0, pct));
      before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      handle.style.left = pct + '%';
    }

    slider.addEventListener('mousedown', (e) => { dragging = true; updateFromClientX(e.clientX); });
    window.addEventListener('mousemove', (e) => { if (dragging) updateFromClientX(e.clientX); });
    window.addEventListener('mouseup', () => { dragging = false; });
    slider.addEventListener('touchstart', (e) => updateFromClientX(e.touches[0].clientX), { passive: true });
    slider.addEventListener('touchmove', (e) => updateFromClientX(e.touches[0].clientX), { passive: true });
  });

  // Карусель
  let index = 0;
  function cardsPerView() {
    if (window.innerWidth >= 1024) return 1 / 0.46 > 2 ? 2 : 2; // визуально ~2.2, скроллим по 1
    return 1;
  }
  function update() {
    const card = track.querySelector('.case-card');
    if (!card) return;
    const cardWidth = card.getBoundingClientRect().width + 24; // + gap
    track.style.transform = `translateX(-${index * cardWidth}px)`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index >= casesData.length - 1;
    dotsContainer.querySelectorAll('button').forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  }
  prevBtn.addEventListener('click', () => { index = Math.max(0, index - 1); update(); });
  nextBtn.addEventListener('click', () => { index = Math.min(casesData.length - 1, index + 1); update(); });
  dotsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    index = Number(btn.dataset.dotIndex);
    update();
  });
  window.addEventListener('resize', update);
  update();
}

/* ==========================================================================
   FAQ accordion
   ========================================================================== */

function initFaq() {
  const items = document.querySelectorAll('[data-faq-item]');
  items.forEach((item, i) => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      items.forEach((other) => {
        other.classList.remove('is-open');
        other.querySelector('.faq-answer').style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('is-open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
    if (i === 0) {
      item.classList.add('is-open');
      requestAnimationFrame(() => { answer.style.maxHeight = answer.scrollHeight + 'px'; });
    }
  });
}

/* ==========================================================================
   Sticky mobile CTA
   ========================================================================== */

function initStickyCta() {
  const el = document.querySelector('[data-sticky-cta]');
  if (!el) return;
  window.addEventListener('scroll', () => {
    el.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.8);
  }, { passive: true });
}

/* ==========================================================================
   Scroll-reveal via IntersectionObserver
   ========================================================================== */

function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '-40px' });
  items.forEach((el) => observer.observe(el));
}

/* ==========================================================================
   Init
   ========================================================================== */

/* ==========================================================================
   Кейсы с ценами (2-й блок) + лайтбокс объекта
   ========================================================================== */
const pcasesData = [
  {type:'Дача · металлочерепица',title:'Замена кровли после протечек',before:'images/case-1-before.webp',after:'images/case-1-after.webp',
   price:'480 000 ₽',did:'Демонтаж, гидроизоляция, новая металлочерепица',area:'120 м²',term:'8 дней',res:'Сухой чердак, правильный пирог'},
  {type:'Новый дом · гибкая черепица',title:'Монтаж кровли под ключ',after:'images/case-3-full.webp',
   price:'540 000 ₽',did:'Полный цикл от стропил до финиша',area:'160 м²',term:'10 дней',res:'Сдали под ключ, приёмка по этапам'},
  {type:'Дом · кликфальц',title:'Замена кровли без ущерба фасаду',after:'images/case-4-after.webp',
   price:'620 000 ₽',did:'Кликфальц, защита фасада плёнкой, вывоз мусора',area:'140 м²',term:'9 дней',res:'Сдали за 9 дней вместо 12'},
  {type:'Дом · композитная черепица',title:'Реконструкция вальмовой кровли',before:'images/case-2-before.webp',after:'images/case-2-after.webp',
   price:'760 000 ₽',did:'Новый пирог, узлы примыкания, утепление',area:'180 м²',term:'12 дней',res:'Ушли промерзание и наледь'},
];
function initPricedCases() {
  const el = document.querySelector('[data-pcases]'); if (!el) return;
  el.innerHTML = pcasesData.map(c => `
    <div class="pcase reveal">
      <div class="pcase-imgs ${c.before ? '' : 'single'}">
        ${c.before ? `<div class="pba" style="background-image:url('${c.before}')"><span class="pba-tag">Было</span></div>` : ''}
        <div class="pba" style="background-image:url('${c.after}')"><span class="pba-tag after">Стало</span></div>
      </div>
      <div class="pcase-body">
        <p class="pchip">${c.type}</p>
        <h3>${c.title}</h3>
        <div class="pcase-price"><span class="lbl">Стоимость под ключ</span><span class="val">${c.price}</span></div>
        <ul class="pcase-rows">
          <li><span class="k">Что сделали</span><span class="v">${c.did}</span></li>
          <li><span class="k">Площадь</span><span class="v">${c.area}</span></li>
          <li><span class="k">Срок</span><span class="v">${c.term}</span></li>
          <li><span class="k">Результат</span><span class="v res">${c.res}</span></li>
        </ul>
      </div>
    </div>`).join('');
}

const OGAL = Array.from({length:13}, (_,i) => 'images/object-'+String(i+1).padStart(2,'0')+'.webp');
function initObjectGallery() {
  const grid = document.querySelector('[data-gallery]'), lb = document.querySelector('[data-olb]');
  if (!grid || !lb) return;
  const img = lb.querySelector('[data-olb-img]'), cap = lb.querySelector('[data-olb-cap]'); let i = 0;
  const show = () => { img.src = OGAL[i]; cap.textContent = (i+1)+' / '+OGAL.length; };
  const open = n => { i = n; show(); lb.classList.add('open'); document.body.style.overflow = 'hidden'; };
  const close = () => { lb.classList.remove('open'); document.body.style.overflow = ''; };
  const next = () => { i = (i+1) % OGAL.length; show(); }, prev = () => { i = (i-1+OGAL.length) % OGAL.length; show(); };
  grid.querySelectorAll('[data-gi]').forEach(b => b.addEventListener('click', () => open(+b.dataset.gi)));
  lb.querySelector('[data-olb-x]').onclick = close;
  lb.querySelector('[data-olb-next]').onclick = next;
  lb.querySelector('[data-olb-prev]').onclick = prev;
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', e => { if (!lb.classList.contains('open')) return; if (e.key==='Escape') close(); if (e.key==='ArrowRight') next(); if (e.key==='ArrowLeft') prev(); });
  let sx = null;
  lb.addEventListener('touchstart', e => sx = e.touches[0].clientX, {passive:true});
  lb.addEventListener('touchend', e => { if (sx===null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx)>50) dx<0?next():prev(); sx=null; }, {passive:true});
}

/* ==========================================================================
   Срочность — месяц подставляется автоматически (обновляется каждый месяц)
   ========================================================================== */
const URG_MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
function initUrgency() {
  const m = URG_MONTHS[new Date().getMonth()];
  document.querySelectorAll('[data-urg-month]').forEach(e => { e.textContent = m; });
}

/* ==========================================================================
   Встроенные лид-формы калькулятора и мини-квиза → отправка → thanks.html
   ========================================================================== */
function initLeadInline() {
  document.querySelectorAll('[data-leadform]').forEach((formEl) => {
    const source = formEl.dataset.leadform;
    const nameInput = formEl.querySelector('[data-field="name"]');
    const phoneInput = formEl.querySelector('[data-field="phone"]');
    const consent = formEl.querySelector('[data-consent]');
    const honeypot = formEl.querySelector('[data-field="honeypot"]');
    const submitBtn = formEl.querySelector('[data-submit]');
    const errorEl = formEl.querySelector('[data-error]');
    if (phoneInput) attachPhoneMask(phoneInput);

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      const name = nameInput.value.trim();
      const phone = phoneInput.value.trim();
      if (name.length < 2) { errorEl.textContent = 'Введите имя'; return; }
      if (phone.replace(/\D/g, '').length < 11) { errorEl.textContent = 'Введите корректный номер'; return; }
      if (consent && !consent.checked) { errorEl.textContent = 'Нужно согласие на обработку персональных данных'; return; }

      const details = {};
      if (source === 'calc') {
        const mn = document.querySelector('[data-calc-result-min]'), mx = document.querySelector('[data-calc-result-max]');
        if (mn && mx) details['Расчёт на сайте'] = `от ${mn.textContent} до ${mx.textContent} ₽`;
      } else if (source === 'mini-quiz') {
        const mn = document.querySelector('[data-mq-min]'), mx = document.querySelector('[data-mq-max]');
        if (mn && mx) details['Оценка (мини-квиз)'] = `от ${mn.textContent} до ${mx.textContent} ₽`;
      }

      submitBtn.disabled = true;
      submitBtn.dataset.o = submitBtn.dataset.o || submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner"></span>';
      try {
        await sendLead({ source, name, phone, honeypot: honeypot ? honeypot.value : '', details });
        window.location.href = 'thanks.html';
      } catch (err) {
        errorEl.innerHTML = (err.message || 'Что-то пошло не так.') + ' <a class="field-error-wa" href="' + waHref() + '" target="_blank" rel="noopener">Написать в WhatsApp →</a>';
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitBtn.dataset.o;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initUrgency();
  initHeader();
  initSimpleForm(document.querySelector('[data-form="hero"]'), 'hero-form');
  initSimpleForm(document.querySelector('[data-form="final-cta"]'), 'final-cta');
  initRoofScheme();
  initQuiz();
  initMiniQuiz();
  initCalculator();
  initLeadInline();
  initCases();
  initPricedCases();
  initObjectGallery();
  initFaq();
  initStickyCta();
  initReveal();
});
