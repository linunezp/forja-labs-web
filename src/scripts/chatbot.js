/**
 * Forja Labs — Claudia Grant Chatbot
 * Flujo conversacional de contacto con derivación a WhatsApp
 */

(function () {
  'use strict';

  const WHATSAPP_NUMBER = '56979775565';
  const STORAGE_KEY = 'forja_chat_contacted';
  const STORAGE_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    step: 'welcome', // welcome | collect_name | collect_email | collect_phone | collect_query | summary
    topic: '',
    name: '',
    email: '',
    phone: '',
    query: '',
    isOpen: false,
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────
  let widget, messagesEl, inputArea, fab;

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    fab = document.getElementById('chatbot-fab');
    widget = document.getElementById('chatbot-widget');
    messagesEl = document.getElementById('chatbot-messages');
    inputArea = document.getElementById('chatbot-input-area');

    if (!fab || !widget) return;

    fab.addEventListener('click', toggleChat);
    document.getElementById('chatbot-close')?.addEventListener('click', closeChat);

    // Restore badge if never contacted
    const contacted = getContactedState();
    if (contacted) {
      // Already contacted within 24h — show subtle indicator
      fab.classList.add('already-contacted');
    }
  }

  // ── Storage helpers ───────────────────────────────────────────────────────
  function getContactedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const { ts } = JSON.parse(raw);
      return Date.now() - ts < STORAGE_DURATION_MS;
    } catch {
      return false;
    }
  }

  function markContacted() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
    } catch {}
  }

  // ── Chat open/close ───────────────────────────────────────────────────────
  function toggleChat() {
    state.isOpen ? closeChat() : openChat();
  }

  function openChat() {
    state.isOpen = true;
    widget.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');

    // Analytics log
    console.log('[ForjaLabs Chatbot] Chat iniciado', new Date().toISOString());

    // Start flow if fresh
    if (state.step === 'welcome' && messagesEl.children.length === 0) {
      startWelcome();
    }
  }

  function closeChat() {
    state.isOpen = false;
    widget.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
  }

  // ── Message rendering ─────────────────────────────────────────────────────
  function appendBotMessage(html, delay = 0) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const div = document.createElement('div');
        div.className = 'chat-msg bot';
        div.innerHTML = `<div class="msg-bubble">${html}</div>`;
        messagesEl.appendChild(div);
        scrollBottom();
        resolve();
      }, delay);
    });
  }

  function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
    messagesEl.appendChild(div);
    scrollBottom();
  }

  function appendTyping() {
    const div = document.createElement('div');
    div.className = 'chat-msg bot typing-indicator';
    div.id = 'chat-typing';
    div.innerHTML = `<div class="msg-bubble"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(div);
    scrollBottom();
    return div;
  }

  function removeTyping() {
    document.getElementById('chat-typing')?.remove();
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function clearInput() {
    inputArea.innerHTML = '';
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Steps ─────────────────────────────────────────────────────────────────

  async function startWelcome() {
    state.step = 'welcome';
    const typing = appendTyping();
    await delay(700);
    removeTyping();

    await appendBotMessage(
      `Hola 👋 Soy Claudia, Client Manager de Forja Labs.<br>¿En qué puedo ayudarte hoy?`
    );

    renderTopicButtons();
  }

  function renderTopicButtons() {
    clearInput();
    const btns = [
      { label: 'Software a Medida', value: 'Software a Medida' },
      { label: 'AIGEN', value: 'AIGEN' },
      { label: 'Otra consulta', value: 'Otra consulta' },
    ];
    const wrap = document.createElement('div');
    wrap.className = 'chat-btn-group';
    btns.forEach(({ label, value }) => {
      const btn = document.createElement('button');
      btn.className = 'chat-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => selectTopic(value));
      wrap.appendChild(btn);
    });
    inputArea.appendChild(wrap);
  }

  async function selectTopic(topic) {
    state.topic = topic;
    appendUserMessage(topic);
    clearInput();

    const typing = appendTyping();
    await delay(600);
    removeTyping();

    await appendBotMessage(`Perfecto, te ayudo con <strong>${escapeHtml(topic)}</strong>. 😊<br><br>Para conectarte con nuestro equipo necesito algunos datos. ¿Cuál es tu nombre?`);
    state.step = 'collect_name';
    renderTextInput('Tu nombre', 'Enviar', submitName, 'text');
  }

  async function submitName() {
    const val = getInputValue();
    if (val.length < 3) {
      showInputError('El nombre debe tener al menos 3 caracteres.');
      return;
    }
    state.name = val;
    appendUserMessage(val);
    clearInput();

    const typing = appendTyping();
    await delay(500);
    removeTyping();

    await appendBotMessage(`Mucho gusto, <strong>${escapeHtml(state.name)}</strong>! 🙌<br>¿Cuál es tu correo electrónico?`);
    state.step = 'collect_email';
    renderTextInput('tu@email.com', 'Enviar', submitEmail, 'email');
  }

  async function submitEmail() {
    const val = getInputValue();
    if (!isValidEmail(val)) {
      showInputError('Ingresa un email con formato válido (ej: nombre@dominio.com)');
      return;
    }
    state.email = val;
    appendUserMessage(val);
    clearInput();

    const typing = appendTyping();
    await delay(500);
    removeTyping();

    await appendBotMessage(`Anotado 📧<br>¿Tu número de teléfono? <span style="opacity:0.6;font-size:0.85em">(opcional — puedes saltarlo)</span>`);
    state.step = 'collect_phone';
    renderTextInput('+56 9 XXXX XXXX', 'Enviar', submitPhone, 'tel', true);
  }

  async function submitPhone(skip = false) {
    const val = skip ? '' : getInputValue();
    state.phone = val;
    if (!skip) appendUserMessage(val || '(sin teléfono)');
    clearInput();

    const typing = appendTyping();
    await delay(500);
    removeTyping();

    await appendBotMessage(`Casi listo ✍️<br>Cuéntame brevemente <strong>¿en qué te podemos ayudar?</strong>`);
    state.step = 'collect_query';
    renderTextareaInput('Describe tu consulta...', 'Enviar', submitQuery);
  }

  async function submitQuery() {
    const val = getInputValue();
    if (val.length < 10) {
      showInputError('La consulta debe tener al menos 10 caracteres.');
      return;
    }
    state.query = val;
    appendUserMessage(val);
    clearInput();

    markContacted();

    const typing = appendTyping();
    await delay(800);
    removeTyping();

    await appendBotMessage(
      `Gracias, <strong>${escapeHtml(state.name)}</strong>. 🎉<br><br>
      Tu solicitud sobre <strong>${escapeHtml(state.topic)}</strong> está lista para ser derivada a nuestro equipo vía WhatsApp.<br><br>
      Aquí puedes compartirla ahora:`
    );

    state.step = 'summary';
    renderWhatsAppButton();
  }

  function renderWhatsAppButton() {
    clearInput();

    const msg = encodeURIComponent(
      `Hola, soy ${state.name}. Quiero consultar sobre ${state.query}`
    );
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;

    const wrap = document.createElement('div');
    wrap.className = 'chat-btn-group column';

    const waBtn = document.createElement('a');
    waBtn.href = url;
    waBtn.target = '_blank';
    waBtn.rel = 'noopener noreferrer';
    waBtn.className = 'chat-btn whatsapp-btn';
    waBtn.innerHTML = `<span class="material-icons" style="font-size:1.1rem;vertical-align:middle;margin-right:6px">chat</span>Enviar por WhatsApp`;

    const restartBtn = document.createElement('button');
    restartBtn.className = 'chat-btn secondary-btn';
    restartBtn.textContent = 'Nueva consulta';
    restartBtn.addEventListener('click', restartChat);

    wrap.appendChild(waBtn);
    wrap.appendChild(restartBtn);
    inputArea.appendChild(wrap);
  }

  function restartChat() {
    // Reset state
    state.step = 'welcome';
    state.topic = '';
    state.name = '';
    state.email = '';
    state.phone = '';
    state.query = '';

    messagesEl.innerHTML = '';
    clearInput();
    startWelcome();
  }

  // ── Input helpers ──────────────────────────────────────────────────────────

  function renderTextInput(placeholder, btnLabel, onSubmit, type = 'text', withSkip = false) {
    clearInput();
    const wrap = document.createElement('div');
    wrap.className = 'chat-input-wrap';

    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.className = 'chat-text-input';
    input.id = 'chat-main-input';

    const btn = document.createElement('button');
    btn.className = 'chat-send-btn';
    btn.innerHTML = `<span class="material-icons">send</span>`;
    btn.addEventListener('click', onSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onSubmit();
    });

    wrap.appendChild(input);
    wrap.appendChild(btn);
    inputArea.appendChild(wrap);

    if (withSkip) {
      const skipBtn = document.createElement('button');
      skipBtn.className = 'chat-skip-btn';
      skipBtn.textContent = 'Saltar este paso →';
      skipBtn.addEventListener('click', () => submitPhone(true));
      inputArea.appendChild(skipBtn);
    }

    input.focus();
  }

  function renderTextareaInput(placeholder, btnLabel, onSubmit) {
    clearInput();
    const wrap = document.createElement('div');
    wrap.className = 'chat-textarea-wrap';

    const ta = document.createElement('textarea');
    ta.placeholder = placeholder;
    ta.className = 'chat-text-input textarea';
    ta.id = 'chat-main-input';
    ta.rows = 3;

    const btn = document.createElement('button');
    btn.className = 'chat-send-btn full';
    btn.innerHTML = `<span class="material-icons" style="font-size:1rem;margin-right:4px">send</span>Enviar`;
    btn.addEventListener('click', onSubmit);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    });

    wrap.appendChild(ta);
    wrap.appendChild(btn);
    inputArea.appendChild(wrap);
    ta.focus();
  }

  function getInputValue() {
    const el = document.getElementById('chat-main-input');
    return el ? el.value.trim() : '';
  }

  function showInputError(msg) {
    let err = inputArea.querySelector('.chat-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'chat-error';
      inputArea.appendChild(err);
    }
    err.textContent = msg;
    const input = document.getElementById('chat-main-input');
    if (input) {
      input.classList.add('error');
      input.addEventListener('input', () => {
        input.classList.remove('error');
        err.textContent = '';
      }, { once: true });
    }
  }

  // ── Utils ──────────────────────────────────────────────────────────────────

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
