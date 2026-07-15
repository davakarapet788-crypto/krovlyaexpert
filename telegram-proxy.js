/* ============================================================================
   telegram-proxy.js — серверлесс-прокси для заявок (Cloudflare Workers)
   ============================================================================

   ЗАЧЕМ. Сайт статический, и если слать заявки напрямую в Telegram, токен бота
   виден в script.js любому посетителю. Этот воркер принимает заявку с сайта и
   сам пересылает её в Telegram — токен хранится в секретах воркера и НИКОГДА
   не попадает в браузер.

   РАЗВЁРТЫВАНИЕ (бесплатно, ~10 минут):
   1. Зарегистрируйтесь на dash.cloudflare.com → раздел Workers & Pages → Create → Worker.
   2. Вставьте этот код, задеплойте. Получите адрес вида
      https://krovlya-lead.ВАШ-АккАунт.workers.dev
   3. В настройках воркера → Settings → Variables and Secrets добавьте СЕКРЕТЫ:
        TELEGRAM_BOT_TOKEN  — НОВЫЙ токен от @BotFather (старый перевыпустите!)
        TELEGRAM_CHAT_ID    — ваш chat_id (узнать: напишите боту @userinfobot)
        ALLOWED_ORIGIN      — адрес сайта, напр. https://username.github.io
                              (можно указать несколько через запятую)
   4. В script.js впишите адрес воркера в CONFIG.leadProxyUrl и оставьте
      CONFIG.telegramBotToken / telegramChatId пустыми.

   Готово: токен на сервере, в браузере его нет.
   ========================================================================== */

const SOURCE_LABELS = {
  quiz: 'Квиз (расчёт сметы)',
  'hero-form': 'Быстрая форма (Hero)',
  'final-cta': 'Финальная форма',
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function corsHeaders(origin, allowed) {
  const list = (allowed || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = list.includes(origin) ? origin : (list[0] || '');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    let data;
    try {
      data = await request.json();
    } catch (_) {
      return json({ ok: false, error: 'bad json' }, 400, cors);
    }

    // Honeypot: скрытое поле заполнено — это бот. Отвечаем «успех», ничего не шлём.
    if (data.honeypot) return json({ ok: true }, 200, cors);

    const name = String(data.name || '').trim().slice(0, 100);
    const phone = String(data.phone || '').trim().slice(0, 30);
    if (name.length < 2 || phone.replace(/\D/g, '').length < 11) {
      return json({ ok: false, error: 'invalid fields' }, 400, cors);
    }

    const lines = [
      '🏠 <b>Новая заявка — Кровля.Эксперт</b>',
      `Источник: ${SOURCE_LABELS[data.source] || escapeHtml(data.source || '—')}`,
      `Имя: ${escapeHtml(name)}`,
      `Телефон: ${escapeHtml(phone)}`,
    ];
    if (data.details && typeof data.details === 'object') {
      for (const [key, value] of Object.entries(data.details)) {
        if (value) lines.push(`${escapeHtml(key)}: ${escapeHtml(value)}`);
      }
    }

    const tgRes = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: lines.join('\n'),
          parse_mode: 'HTML',
        }),
      }
    );

    if (!tgRes.ok) {
      return json({ ok: false, error: 'telegram error' }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
