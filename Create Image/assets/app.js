/*
 * Мастерская карт Hearthstone Battlegrounds — клиентская логика.
 * Данные: { version: 1, minions: [...], spells: [...] } (общий контракт).
 * Картинки: window.IMAGE_CATALOG = { 'Папка': ['1/...jpg', ...] } из assets/catalog.js.
 * Рабочая коллекция хранится в localStorage, перенос между устройствами — через JSON.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'hsbg-cards-v1';
  var MODE_KEY = 'hsbg-view-mode';
  var ALL_FOLDERS = '__all';

  var ARCHETYPES = [
    ['Beast', 'Звери'], ['Demon', 'Демоны'], ['Dragon', 'Драконы'],
    ['Elemental', 'Элементали'], ['Mech', 'Механизмы'], ['Murloc', 'Мурлоки'],
    ['Naga', 'Наги'], ['Pirate', 'Пираты'], ['Quilboar', 'Свинобразы'],
    ['Undead', 'Нежить'], ['All', 'Все типы'], ['Neutral', 'Нейтральные']
  ];
  var ARCH_IDS = ARCHETYPES.map(function (a) { return a[0]; });

  // [ключ в JSON, подпись, CSS-класс эффекта]
  var KEYWORDS = [
    ['taunt', 'Провокация', 'has-taunt'],
    ['divineShield', 'Божественный щит', 'has-divine-shield'],
    ['poison', 'Яд', 'has-poison'],
    ['reborn', 'Перерождение', 'has-reborn'],
    ['windfury', 'Неистовство ветра', 'has-windfury'],
    ['stealth', 'Маскировка', 'has-stealth']
  ];
  var TIERS = [1, 2, 3, 4, 5, 6, 7, 8];

  var state = {
    minions: [],
    spells: [],
    view: 'gallery',
    filters: { search: '', type: 'all', archetype: 'all', status: 'all', tier: 0 },
    drafts: { minion: null, spell: null },
    dirty: { minion: false, spell: false },
    picker: { kind: null, folder: ALL_FOLDERS, query: '', selected: '', opener: null },
    discoveredImages: Object.create(null),
    modePref: 'auto'
  };

  /* ---------------------------- утилиты ---------------------------- */

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function str(value) { return typeof value === 'string' ? value : (value == null ? '' : String(value)); }

  function clampInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function storeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function storeSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  function archLabel(id) {
    for (var i = 0; i < ARCHETYPES.length; i++) if (ARCHETYPES[i][0] === id) return ARCHETYPES[i][1];
    return id;
  }

  function baseName(path) {
    var parts = str(path).split('/');
    return parts[parts.length - 1] || path;
  }

  /** Относительный путь из каталога → безопасный URL (пробелы и скобки в именах папок). */
  function imgSrc(path) {
    if (!path) return '';
    if (/^(data:|blob:|https?:)/i.test(path)) return path;
    if (state.discoveredImages && state.discoveredImages[path]) return state.discoveredImages[path];
    var decoded = path;
    try { decoded = decodeURI(path); } catch (e) { /* путь уже «сырой» */ }
    return encodeURI(decoded);
  }

  /** Описание: экранирование, **жирный**, переносы строк. */
  function descHTML(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  /* -------------------------- нормализация -------------------------- */

  function normKeywords(k) {
    var out = {};
    KEYWORDS.forEach(function (d) { out[d[0]] = !!(k && k[d[0]]); });
    return out;
  }

  function normMinion(m) {
    m = m || {};
    return {
      id: str(m.id) || uid('m'),
      name: str(m.name),
      archetype: ARCH_IDS.indexOf(m.archetype) >= 0 ? m.archetype : 'Neutral',
      tier: clampInt(m.tier, 1, 8, 1),
      attack: clampInt(m.attack, 0, 999, 1),
      health: clampInt(m.health, 0, 999, 1),
      description: str(m.description),
      keywords: normKeywords(m.keywords),
      isActive: m.isActive !== false,
      isToken: !!m.isToken,
      image: str(m.image)
    };
  }

  function normSpell(s) {
    s = s || {};
    return {
      id: str(s.id) || uid('s'),
      name: str(s.name),
      tier: clampInt(s.tier, 1, 8, 1),
      cost: clampInt(s.cost, 0, 99, 1),
      description: str(s.description),
      isActive: s.isActive !== false,
      isToken: !!s.isToken,
      image: str(s.image)
    };
  }

  /** Проверяет и приводит произвольный JSON к контракту. Бросает Error с понятным текстом. */
  function normalizeData(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('В файле нет объекта с картами');
    }
    var hasMinions = Array.isArray(raw.minions);
    var hasSpells = Array.isArray(raw.spells);
    if (!hasMinions && !hasSpells) {
      throw new Error('Файл не похож на коллекцию карт: нет разделов minions и spells');
    }
    var seen = {};
    function uniq(card, prefix) {
      if (seen[card.id]) card.id = uid(prefix);
      seen[card.id] = true;
      return card;
    }
    return {
      minions: (hasMinions ? raw.minions : []).filter(Boolean).map(function (m) { return uniq(normMinion(m), 'm'); }),
      spells: (hasSpells ? raw.spells : []).filter(Boolean).map(function (s) { return uniq(normSpell(s), 's'); })
    };
  }

  function exportPayload() {
    return { version: 1, minions: clone(state.minions), spells: clone(state.spells) };
  }

  function persist() {
    if (!storeSet(STORAGE_KEY, JSON.stringify(exportPayload()))) {
      toast('Браузер не дал сохранить карты локально. Скачайте JSON, чтобы не потерять работу.', true);
    }
  }

  function listOf(kind) { return kind === 'minion' ? state.minions : state.spells; }

  function indexOf(kind, id) {
    var list = listOf(kind);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  /* ---------------------------- разметка карты ---------------------------- */

  function keywordText(card) {
    var names = [];
    KEYWORDS.forEach(function (d) { if (card.keywords && card.keywords[d[0]]) names.push(d[1]); });
    return names.length ? '<b class="hs-card__keywords">' + esc(names.join('. ')) + '.</b> ' : '';
  }

  function cardLabel(card, kind) {
    var base = (card.name || 'Без названия') + ', таверна ' + card.tier;
    if (kind === 'minion') return base + ', ' + card.attack + '/' + card.health + ', ' + archLabel(card.archetype);
    return base + ', заклинание, стоимость ' + card.cost;
  }

  /** Карта по контракту классов: .hs-card.hs-card--minion|--spell[data-tier] и бейджи. */
  function cardHTML(card, kind) {
    var cls = ['hs-card', 'hs-card--' + kind];
    if (!card.isActive) cls.push('hs-card--disabled');
    if (card.isToken) cls.push('hs-card--token');
    if (kind === 'minion') {
      KEYWORDS.forEach(function (d) { if (card.keywords[d[0]]) cls.push(d[2]); });
    }

    var art = card.image
      ? '<img src="' + esc(imgSrc(card.image)) + '" alt="" loading="lazy" decoding="async">'
      : '<span class="hs-card__art-empty" aria-hidden="true">Нет арта</span>';

    var flags = '';
    if (card.isToken) flags += '<span class="hs-card__flag hs-card__flag--token">Токен</span>';
    if (!card.isActive) flags += '<span class="hs-card__flag hs-card__flag--off">Выключена</span>';

    var h = '<article class="' + cls.join(' ') + '" data-tier="' + card.tier + '" data-kind="' + kind +
      '" aria-label="' + esc(cardLabel(card, kind)) + '">';
    h += '<div class="hs-card__art">' + art + '</div>';
    h += '<span class="hs-card__tier" title="Таверна ' + card.tier + '">' + card.tier + '</span>';
    if (kind === 'spell') h += '<span class="hs-card__cost" title="Стоимость">' + card.cost + '</span>';
    h += '<div class="hs-card__name">' + esc(card.name || 'Без названия') + '</div>';
    h += '<div class="hs-card__desc">' + (kind === 'minion' ? keywordText(card) : '') + descHTML(card.description) + '</div>';
    if (kind === 'minion') {
      if (card.archetype !== 'Neutral') {
        h += '<span class="hs-card__archetype">' + esc(archLabel(card.archetype)) + '</span>';
      }
      h += '<span class="hs-card__attack" title="Атака">' + card.attack + '</span>';
      h += '<span class="hs-card__health" title="Здоровье">' + card.health + '</span>';
    }
    if (flags) h += '<div class="hs-card__flags">' + flags + '</div>';
    h += '</article>';
    return h;
  }

  /* ---------------------------- режим ПК / мобильный ---------------------------- */

  function detectMobile() {
    var nav = window.navigator || {};
    var ua = nav.userAgent || '';
    if (nav.userAgentData && nav.userAgentData.mobile === true) return true;
    if (/Android|iPhone|iPod|IEMobile|Opera Mini|BlackBerry|webOS|Mobile/i.test(ua)) return true;
    if (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) return true; // iPadOS выдаёт себя за Mac
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var screenMin = Math.min(window.screen.width || 0, window.screen.height || 0);
    return !!(coarse && screenMin > 0 && screenMin < 820);
  }

  function applyMode() {
    var pref = state.modePref;
    var resolved = pref === 'auto' ? (detectMobile() ? 'mobile' : 'desktop') : pref;
    document.body.classList.toggle('mobile-mode', resolved === 'mobile');
    document.body.classList.toggle('desktop-mode', resolved === 'desktop');
    document.documentElement.setAttribute('data-mode', resolved);

    var radios = document.querySelectorAll('input[name="viewMode"]');
    Array.prototype.forEach.call(radios, function (r) {
      r.checked = r.value === pref;
      r.parentNode.classList.toggle('is-active', r.checked);
    });
    var label = resolved === 'mobile' ? 'мобильный вид' : 'вид для ПК';
    $('mode-status').textContent = pref === 'auto' ? 'Определено: ' + label : 'Вручную: ' + label;
  }

  function initMode() {
    var saved = storeGet(MODE_KEY);
    state.modePref = saved === 'desktop' || saved === 'mobile' ? saved : 'auto';
    applyMode();
    Array.prototype.forEach.call(document.querySelectorAll('input[name="viewMode"]'), function (r) {
      function selectMode() {
        if (!r.checked) return;
        state.modePref = r.value;
        storeSet(MODE_KEY, r.value);
        applyMode();
      }
      r.addEventListener('change', selectMode);
      r.addEventListener('click', selectMode);
    });
    var timer = null;
    window.addEventListener('resize', function () {
      if (state.modePref !== 'auto') return;
      clearTimeout(timer);
      timer = setTimeout(applyMode, 200);
    });
  }

  /* ---------------------------- уведомления ---------------------------- */

  var toastTimer = null;
  function toast(message, isError) {
    var el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('toast--error', !!isError);
    el.hidden = false;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
      el.hidden = true;
    }, isError ? 6000 : 3000);
  }

  /* ---------------------------- галерея ---------------------------- */

  function allCards() {
    var out = [];
    state.minions.forEach(function (c) { out.push({ kind: 'minion', card: c }); });
    state.spells.forEach(function (c) { out.push({ kind: 'spell', card: c }); });
    return out;
  }

  function matches(item) {
    var f = state.filters, c = item.card;
    if (f.type !== 'all' && item.kind !== f.type) return false;
    if (f.archetype !== 'all') {
      // Заклинания не имеют архетипа; существа «Все типы» подходят под любой архетип, как в BG.
      if (item.kind !== 'minion') return false;
      if (c.archetype !== f.archetype && !(c.archetype === 'All' && f.archetype !== 'Neutral')) return false;
    }
    if (f.status === 'active' && !c.isActive) return false;
    if (f.status === 'disabled' && c.isActive) return false;
    if (f.status === 'token' && !c.isToken) return false;
    if (f.status === 'nontoken' && c.isToken) return false;
    if (f.tier && c.tier !== f.tier) return false;
    if (f.search) {
      var hay = (c.name + ' ' + c.description).toLowerCase();
      if (hay.indexOf(f.search) < 0) return false;
    }
    return true;
  }

  function galleryItemHTML(item) {
    var c = item.card;
    var h = '<div class="gallery-item" data-kind="' + item.kind + '" data-id="' + esc(c.id) + '">';
    h += '<div class="gallery-item__open" role="button" tabindex="0" data-action="edit" aria-label="Редактировать: ' +
      esc(c.name || 'Без названия') + '">' + cardHTML(c, item.kind) + '</div>';
    h += '<div class="gallery-item__actions">';
    h += '<button type="button" class="btn btn--small" data-action="edit">Изменить</button>';
    h += '<button type="button" class="btn btn--small" data-action="toggle" aria-pressed="' + (c.isActive ? 'true' : 'false') + '">' +
      (c.isActive ? 'Выключить' : 'Включить') + '</button>';
    h += '<button type="button" class="btn btn--small" data-action="duplicate">Копия</button>';
    h += '<button type="button" class="btn btn--small btn--danger" data-action="delete">Удалить</button>';
    h += '</div></div>';
    return h;
  }

  function renderGallery() {
    var all = allCards();
    var shown = all.filter(matches).sort(function (a, b) {
      if (a.card.tier !== b.card.tier) return a.card.tier - b.card.tier;
      if (a.kind !== b.kind) return a.kind === 'minion' ? -1 : 1;
      return (a.card.name || '').localeCompare(b.card.name || '', 'ru');
    });

    $('gallery-grid').innerHTML = shown.map(galleryItemHTML).join('');
    $('nav-count-all').textContent = String(all.length);

    var empty = $('gallery-empty');
    if (!all.length) {
      empty.hidden = false;
      $('gallery-empty-title').textContent = 'Карт пока нет';
      $('gallery-empty-text').textContent = 'Создайте первое существо или заклинание, либо загрузите сохранённый JSON-файл.';
      $('gallery-empty-actions').hidden = false;
      $('gallery-counter').textContent = '';
    } else if (!shown.length) {
      empty.hidden = false;
      $('gallery-empty-title').textContent = 'Ничего не найдено';
      $('gallery-empty-text').textContent = 'Под эти фильтры не подходит ни одна карта. Измените условия или сбросьте фильтры.';
      $('gallery-empty-actions').hidden = true;
      $('gallery-counter').textContent = 'Показано 0 из ' + all.length;
    } else {
      empty.hidden = true;
      $('gallery-counter').textContent = 'Показано ' + shown.length + ' из ' + all.length +
        ' · существ: ' + state.minions.length + ', заклинаний: ' + state.spells.length;
    }

    // Архетип относится только к существам.
    $('filter-archetype').disabled = state.filters.type === 'spell';
  }

  function renderTierChips() {
    var f = state.filters;
    var h = '<button type="button" class="chip' + (f.tier === 0 ? ' is-active' : '') + '" data-tier="0" aria-pressed="' +
      (f.tier === 0) + '">Все</button>';
    TIERS.forEach(function (t) {
      h += '<button type="button" class="chip chip--tier' + (f.tier === t ? ' is-active' : '') + '" data-tier="' + t +
        '" aria-pressed="' + (f.tier === t) + '" aria-label="Таверна ' + t + '">' + t + '</button>';
    });
    $('filter-tiers').innerHTML = h;
  }

  function initFilters() {
    var sel = $('filter-archetype');
    ARCHETYPES.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a[0];
      o.textContent = a[1];
      sel.appendChild(o);
    });
    renderTierChips();

    $('filter-search').addEventListener('input', function (e) {
      state.filters.search = e.target.value.trim().toLowerCase();
      renderGallery();
    });
    ['type', 'archetype', 'status'].forEach(function (key) {
      $('filter-' + key).addEventListener('change', function (e) {
        state.filters[key] = e.target.value;
        if (key === 'type' && e.target.value === 'spell') {
          state.filters.archetype = 'all';
          $('filter-archetype').value = 'all';
        }
        renderGallery();
      });
    });
    $('filter-tiers').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tier]');
      if (!b) return;
      state.filters.tier = parseInt(b.getAttribute('data-tier'), 10) || 0;
      renderTierChips();
      renderGallery();
    });
    $('filter-reset').addEventListener('click', function () {
      state.filters = { search: '', type: 'all', archetype: 'all', status: 'all', tier: 0 };
      $('filter-search').value = '';
      $('filter-type').value = 'all';
      $('filter-archetype').value = 'all';
      $('filter-status').value = 'all';
      renderTierChips();
      renderGallery();
    });
  }

  function initGalleryActions() {
    var grid = $('gallery-grid');
    function handle(target) {
      var btn = target.closest('[data-action]');
      var item = target.closest('.gallery-item');
      if (!btn || !item) return;
      var kind = item.getAttribute('data-kind');
      var id = item.getAttribute('data-id');
      var idx = indexOf(kind, id);
      if (idx < 0) return;
      var list = listOf(kind);
      var card = list[idx];
      var action = btn.getAttribute('data-action');

      if (action === 'edit') {
        editCard(kind, id);
      } else if (action === 'toggle') {
        card.isActive = !card.isActive;
        syncDraftIfClean(kind, card);
        persist();
        renderGallery();
        toast('«' + (card.name || 'Без названия') + '» ' + (card.isActive ? 'включена' : 'выключена'));
      } else if (action === 'duplicate') {
        var copy = clone(card);
        copy.id = uid(kind === 'minion' ? 'm' : 's');
        copy.name = (card.name || 'Без названия') + ' (копия)';
        list.splice(idx + 1, 0, copy);
        persist();
        renderGallery();
        toast('Создана копия «' + (card.name || 'Без названия') + '»');
      } else if (action === 'delete') {
        if (!window.confirm('Удалить карту «' + (card.name || 'Без названия') + '»? Это действие нельзя отменить.')) return;
        list.splice(idx, 1);
        if (state.drafts[kind] && state.drafts[kind].id === id && !state.dirty[kind]) {
          state.drafts[kind] = blankCard(kind);
          fillEditor(kind);
        }
        persist();
        renderGallery();
        toast('Карта удалена');
      }
    }
    grid.addEventListener('click', function (e) { handle(e.target); });
    grid.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('gallery-item__open')) {
        e.preventDefault();
        handle(e.target);
      }
    });
  }

  /* ---------------------------- разделы ---------------------------- */

  function setView(view) {
    state.view = view;
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (b) {
      var on = b.getAttribute('data-view') === view;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-view-panel]'), function (p) {
      var on = p.getAttribute('data-view-panel') === view;
      p.hidden = !on;
      p.classList.toggle('is-active', on);
    });
    if ((view === 'minion' || view === 'spell') && !state.drafts[view]) {
      state.drafts[view] = blankCard(view);
      fillEditor(view);
    }
    if (view === 'gallery') renderGallery();
    window.scrollTo(0, 0);
  }

  function initNav() {
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-view]');
      if (tab && tab.tagName === 'BUTTON') { setView(tab.getAttribute('data-view')); return; }
      var go = e.target.closest('[data-go]');
      if (go) {
        var kind = go.getAttribute('data-go');
        if (!confirmDiscard(kind)) return;
        state.drafts[kind] = blankCard(kind);
        state.dirty[kind] = false;
        fillEditor(kind);
        setView(kind);
      }
    });
  }

  /* ---------------------------- редакторы ---------------------------- */

  function blankCard(kind) {
    if (kind === 'minion') {
      return normMinion({ id: uid('m'), name: '', archetype: 'Neutral', tier: 1, attack: 1, health: 1, isActive: true });
    }
    return normSpell({ id: uid('s'), name: '', tier: 1, cost: 1, isActive: true });
  }

  function renderPreview(kind) {
    $(kind + '-preview').innerHTML = cardHTML(state.drafts[kind], kind);
  }

  function renderImageField(kind) {
    var d = state.drafts[kind];
    $(kind + '-image-thumb').innerHTML = d.image
      ? '<img src="' + esc(imgSrc(d.image)) + '" alt="">'
      : '<span class="image-field__none">Нет</span>';
    $(kind + '-image-path').textContent = d.image || 'Не выбрано';
  }

  function setDirty(kind, value) {
    state.dirty[kind] = value;
    $(kind + '-dirty').hidden = !value;
  }

  function renderEditorTitle(kind) {
    var d = state.drafts[kind];
    var saved = indexOf(kind, d.id) >= 0;
    var noun = kind === 'minion' ? 'существо' : 'заклинание';
    $(kind + '-title').textContent = saved
      ? 'Редактирование: ' + (d.name || 'Без названия')
      : (kind === 'minion' ? 'Новое ' : 'Новое ') + noun;
    var del = document.querySelector('[data-editor-delete="' + kind + '"]');
    if (del) del.textContent = saved ? 'Удалить' : 'Очистить';
  }

  /** Заполняет форму из черновика. */
  function fillEditor(kind) {
    var d = state.drafts[kind];
    if (!d) return;
    $(kind + '-name').value = d.name;
    $(kind + '-description').value = d.description;
    $(kind + '-active').checked = d.isActive;
    $(kind + '-token').checked = d.isToken;
    if (kind === 'minion') {
      $('minion-archetype').value = d.archetype;
      $('minion-attack').value = d.attack;
      $('minion-health').value = d.health;
      KEYWORDS.forEach(function (k) {
        var cb = document.querySelector('#minion-keywords input[data-kw="' + k[0] + '"]');
        if (cb) cb.checked = d.keywords[k[0]];
      });
    } else {
      $('spell-cost').value = d.cost;
    }
    var radios = document.querySelectorAll('[data-tier-picker="' + kind + '"] input');
    Array.prototype.forEach.call(radios, function (r) {
      r.checked = parseInt(r.value, 10) === d.tier;
      r.parentNode.classList.toggle('is-active', r.checked);
    });
    $(kind + '-name-error').hidden = true;
    $(kind + '-name').removeAttribute('aria-invalid');
    setDirty(kind, state.dirty[kind]);
    renderEditorTitle(kind);
    renderImageField(kind);
    renderPreview(kind);
  }

  /** Читает форму в черновик (картинка меняется только через выбор изображения). */
  function readEditor(kind) {
    var d = state.drafts[kind];
    d.name = $(kind + '-name').value;
    d.description = $(kind + '-description').value;
    d.isActive = $(kind + '-active').checked;
    d.isToken = $(kind + '-token').checked;
    var checked = document.querySelector('[data-tier-picker="' + kind + '"] input:checked');
    d.tier = checked ? clampInt(checked.value, 1, 8, 1) : d.tier;
    if (kind === 'minion') {
      d.archetype = $('minion-archetype').value;
      d.attack = clampInt($('minion-attack').value, 0, 999, 0);
      d.health = clampInt($('minion-health').value, 0, 999, 0);
      KEYWORDS.forEach(function (k) {
        var cb = document.querySelector('#minion-keywords input[data-kw="' + k[0] + '"]');
        d.keywords[k[0]] = !!(cb && cb.checked);
      });
    } else {
      d.cost = clampInt($('spell-cost').value, 0, 99, 0);
    }
  }

  /** Если карта открыта в редакторе без правок — подтягиваем изменения из галереи. */
  function syncDraftIfClean(kind, card) {
    var d = state.drafts[kind];
    if (d && d.id === card.id && !state.dirty[kind]) {
      state.drafts[kind] = clone(card);
      fillEditor(kind);
    }
  }

  function confirmDiscard(kind) {
    return !state.dirty[kind] || window.confirm('В редакторе есть несохранённые изменения. Отменить их?');
  }

  function editCard(kind, id) {
    var idx = indexOf(kind, id);
    if (idx < 0) return;
    var d = state.drafts[kind];
    if (!(d && d.id === id) && !confirmDiscard(kind)) return;
    if (!(d && d.id === id && state.dirty[kind])) {
      state.drafts[kind] = clone(listOf(kind)[idx]);
      setDirty(kind, false);
    }
    fillEditor(kind);
    setView(kind);
  }

  function saveDraft(kind) {
    readEditor(kind);
    var d = state.drafts[kind];
    d.name = d.name.trim();
    if (!d.name) {
      $(kind + '-name-error').hidden = false;
      $(kind + '-name').setAttribute('aria-invalid', 'true');
      $(kind + '-name').focus();
      return;
    }
    var card = kind === 'minion' ? normMinion(clone(d)) : normSpell(clone(d));
    var list = listOf(kind);
    var idx = indexOf(kind, card.id);
    var isNew = idx < 0;
    if (isNew) list.push(card); else list[idx] = card;
    state.drafts[kind] = clone(card);
    setDirty(kind, false);
    persist();
    fillEditor(kind);
    renderGallery();
    toast(isNew ? 'Карта «' + card.name + '» добавлена' : 'Изменения в «' + card.name + '» сохранены');
  }

  function buildEditorControls() {
    var sel = $('minion-archetype');
    ARCHETYPES.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a[0];
      o.textContent = a[1];
      sel.appendChild(o);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-tier-picker]'), function (box) {
      var kind = box.getAttribute('data-tier-picker');
      box.innerHTML = TIERS.map(function (t) {
        return '<label class="chip chip--tier tier-picker__option">' +
          '<input type="radio" class="visually-hidden" name="' + kind + '-tier" value="' + t + '">' +
          '<span aria-hidden="true">' + t + '</span><span class="visually-hidden">Таверна ' + t + '</span></label>';
      }).join('');
    });

    $('minion-keywords').innerHTML = KEYWORDS.map(function (k) {
      return '<label class="keyword-toggle keyword-toggle--' + k[0] + '">' +
        '<input type="checkbox" data-kw="' + k[0] + '"><span>' + esc(k[1]) + '</span></label>';
    }).join('');
  }

  function initEditors() {
    buildEditorControls();
    ['minion', 'spell'].forEach(function (kind) {
      var form = $(kind + '-form');
      function onEdit() {
        readEditor(kind);
        setDirty(kind, true);
        if ($(kind + '-name').value.trim()) {
          $(kind + '-name-error').hidden = true;
          $(kind + '-name').removeAttribute('aria-invalid');
        }
        Array.prototype.forEach.call(form.querySelectorAll('[data-tier-picker] input'), function (r) {
          r.parentNode.classList.toggle('is-active', r.checked);
        });
        renderPreview(kind);
      }
      form.addEventListener('input', onEdit);
      form.addEventListener('change', onEdit);
      form.addEventListener('click', function (e) {
        if (e.target.matches('input[type="checkbox"], input[type="radio"]')) onEdit();
      });
      form.addEventListener('submit', function (e) { e.preventDefault(); saveDraft(kind); });

      document.querySelector('[data-editor-new="' + kind + '"]').addEventListener('click', function () {
        if (!confirmDiscard(kind)) return;
        state.drafts[kind] = blankCard(kind);
        setDirty(kind, false);
        fillEditor(kind);
        $(kind + '-name').focus();
      });

      document.querySelector('[data-editor-duplicate="' + kind + '"]').addEventListener('click', function () {
        readEditor(kind);
        var copy = clone(state.drafts[kind]);
        copy.id = uid(kind === 'minion' ? 'm' : 's');
        copy.name = (copy.name || 'Без названия') + ' (копия)';
        state.drafts[kind] = copy;
        setDirty(kind, true);
        fillEditor(kind);
        toast('Копия открыта в редакторе. Нажмите «Сохранить», чтобы добавить её.');
      });

      document.querySelector('[data-editor-delete="' + kind + '"]').addEventListener('click', function () {
        var d = state.drafts[kind];
        var idx = indexOf(kind, d.id);
        if (idx >= 0) {
          if (!window.confirm('Удалить карту «' + (listOf(kind)[idx].name || 'Без названия') + '»? Это действие нельзя отменить.')) return;
          listOf(kind).splice(idx, 1);
          persist();
          renderGallery();
          toast('Карта удалена');
        } else if (!confirmDiscard(kind)) {
          return;
        }
        state.drafts[kind] = blankCard(kind);
        setDirty(kind, false);
        fillEditor(kind);
      });

      document.querySelector('[data-pick-image="' + kind + '"]').addEventListener('click', function (e) {
        openPicker(kind, e.currentTarget);
      });
      document.querySelector('[data-clear-image="' + kind + '"]').addEventListener('click', function () {
        setDraftImage(kind, '');
      });
    });
  }

  function setDraftImage(kind, path) {
    readEditor(kind);
    state.drafts[kind].image = path;
    setDirty(kind, true);
    renderImageField(kind);
    renderPreview(kind);
  }

  /* ---------------------------- выбор изображения ---------------------------- */

  function catalog() {
    var c = window.IMAGE_CATALOG;
    return c && typeof c === 'object' ? c : {};
  }

  function folderNames() {
    return Object.keys(catalog()).filter(function (k) { return Array.isArray(catalog()[k]); });
  }

  function folderImages(folder) {
    if (folder !== ALL_FOLDERS) return (catalog()[folder] || []).slice();
    var out = [];
    folderNames().forEach(function (f) { out = out.concat(catalog()[f]); });
    return out;
  }

  function folderOf(path) {
    var names = folderNames();
    for (var i = 0; i < names.length; i++) if (catalog()[names[i]].indexOf(path) >= 0) return names[i];
    return ALL_FOLDERS;
  }

  function renderPickerFolders() {
    var p = state.picker;
    var names = folderNames();
    var total = folderImages(ALL_FOLDERS).length;
    var h = '<button type="button" class="chip folder-chip' + (p.folder === ALL_FOLDERS ? ' is-active' : '') +
      '" data-folder="' + ALL_FOLDERS + '" aria-pressed="' + (p.folder === ALL_FOLDERS) + '">Все папки <span class="chip__count">' +
      total + '</span></button>';
    names.forEach(function (n) {
      var on = p.folder === n;
      h += '<button type="button" class="chip folder-chip' + (on ? ' is-active' : '') + '" data-folder="' + esc(n) +
        '" aria-pressed="' + on + '">' + esc(n) + ' <span class="chip__count">' + catalog()[n].length + '</span></button>';
    });
    $('picker-folders').innerHTML = h;
  }

  function renderPickerGrid() {
    var p = state.picker;
    var q = p.query;
    var list = folderImages(p.folder).filter(function (path) {
      return !q || path.toLowerCase().indexOf(q) >= 0;
    });
    $('picker-grid').innerHTML = list.map(function (path) {
      var on = path === p.selected;
      return '<button type="button" class="image-grid__item' + (on ? ' is-selected' : '') + '" role="option" aria-selected="' + on +
        '" data-path="' + esc(path) + '" title="' + esc(path) + '">' +
        '<img src="' + esc(imgSrc(path)) + '" alt="" loading="lazy" decoding="async">' +
        '<span class="image-grid__name">' + esc(baseName(path)) + '</span></button>';
    }).join('');

    var empty = $('picker-empty');
    if (!folderNames().length) {
      empty.textContent = 'Каталог изображений не найден. Проверьте, что файл assets/catalog.js подключён и заполнен.';
      empty.hidden = false;
    } else {
      empty.textContent = q ? 'По запросу «' + q + '» ничего не найдено.' : 'В этой папке нет изображений.';
      empty.hidden = list.length > 0;
    }
    $('picker-count').textContent = list.length ? 'Изображений: ' + list.length : '';
  }

  /** Живое превью: карта из черновика с выбранным, но ещё не применённым артом. */
  function renderPickerPreview() {
    var p = state.picker;
    var card = clone(state.drafts[p.kind]);
    card.image = p.selected;
    $('picker-preview').innerHTML = cardHTML(card, p.kind);
    $('picker-path').textContent = p.selected || 'Изображение не выбрано';
  }

  function selectInPicker(path) {
    state.picker.selected = path;
    Array.prototype.forEach.call($('picker-grid').querySelectorAll('.image-grid__item'), function (b) {
      var on = b.getAttribute('data-path') === path;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-selected', String(on));
    });
    renderPickerPreview();
  }

  function openPicker(kind, opener) {
    readEditor(kind);
    var current = state.drafts[kind].image;
    state.picker = {
      kind: kind,
      folder: current ? folderOf(current) : (state.picker.folder || ALL_FOLDERS),
      query: '',
      selected: current,
      opener: opener || null
    };
    if (state.picker.folder !== ALL_FOLDERS && folderNames().indexOf(state.picker.folder) < 0) state.picker.folder = ALL_FOLDERS;
    $('picker-search').value = '';
    renderPickerFolders();
    renderPickerGrid();
    renderPickerPreview();
    var modal = $('image-picker');
    modal.hidden = false;
    modal.classList.add('is-open');
    document.body.classList.add('has-modal');
    var sel = $('picker-grid').querySelector('.is-selected');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
    $('picker-search').focus();
  }

  function closePicker() {
    var modal = $('image-picker');
    if (modal.hidden) return;
    modal.hidden = true;
    modal.classList.remove('is-open');
    document.body.classList.remove('has-modal');
    if (state.picker.opener) state.picker.opener.focus();
  }

  function applyPicker(path) {
    setDraftImage(state.picker.kind, path);
    closePicker();
  }

  function initPicker() {
    var modal = $('image-picker');
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-picker-close]')) closePicker();
    });
    $('picker-folders').addEventListener('click', function (e) {
      var b = e.target.closest('[data-folder]');
      if (!b) return;
      state.picker.folder = b.getAttribute('data-folder');
      renderPickerFolders();
      renderPickerGrid();
    });
    $('picker-search').addEventListener('input', function (e) {
      state.picker.query = e.target.value.trim().toLowerCase();
      renderPickerGrid();
    });
    $('picker-grid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-path]');
      if (b) selectInPicker(b.getAttribute('data-path'));
    });
    $('picker-grid').addEventListener('dblclick', function (e) {
      var b = e.target.closest('[data-path]');
      if (b) applyPicker(b.getAttribute('data-path'));
    });
    $('picker-apply').addEventListener('click', function () { applyPicker(state.picker.selected); });
    $('picker-none').addEventListener('click', function () { applyPicker(''); });

    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closePicker(); return; }
      if (e.key !== 'Tab') return;
      // Фокус не уходит за пределы диалога.
      var nodes = modal.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!nodes.length) return;
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------------------------- импорт / экспорт ---------------------------- */

  function exportJSON() {
    var payload = exportPayload();
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'hsbg-cards-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    var dirty = state.dirty.minion || state.dirty.spell;
    toast('Скачан JSON: существ ' + payload.minions.length + ', заклинаний ' + payload.spells.length +
      (dirty ? '. Несохранённые правки из редактора в файл не попали.' : ''));
  }

  function importData(data) {
    var hasCards = state.minions.length || state.spells.length;
    var replace = true;
    if (hasCards) {
      replace = window.confirm('Заменить текущие карты содержимым файла?\n\nОК — заменить, Отмена — добавить к текущим.');
    }
    if (replace) {
      state.minions = data.minions;
      state.spells = data.spells;
    } else {
      ['minion', 'spell'].forEach(function (kind) {
        var list = listOf(kind);
        var incoming = kind === 'minion' ? data.minions : data.spells;
        incoming.forEach(function (c) {
          if (indexOf(kind, c.id) >= 0) c.id = uid(kind === 'minion' ? 'm' : 's');
          list.push(c);
        });
      });
    }
    ['minion', 'spell'].forEach(function (kind) {
      state.drafts[kind] = blankCard(kind);
      setDirty(kind, false);
      fillEditor(kind);
    });
    persist();
    setView('gallery');
    toast((replace ? 'Загружено' : 'Добавлено') + ': существ ' + data.minions.length + ', заклинаний ' + data.spells.length);
  }

  /* ----------------------- обнаружение новых изображений -------------------- */

  function discoveredPath(file) {
    var raw = str(file.webkitRelativePath || file.name).replace(/\\/g, '/');
    var parts = raw.split('/').filter(Boolean);
    var one = parts.indexOf('1');
    if (one >= 0) return parts.slice(one).join('/');
    return parts.join('/');
  }

  function addDiscoveredImages(files) {
    var added = 0;
    var groups = {};
    Array.prototype.forEach.call(files || [], function (file) {
      if (!file || !/^image\/(?:jpeg|png|gif|webp|bmp|avif)$/i.test(file.type || '') && !/\.(?:jpe?g|png|gif|webp|bmp|avif)$/i.test(file.name)) return;
      var path = discoveredPath(file);
      var url = URL.createObjectURL(file);
      if (state.discoveredImages[path]) URL.revokeObjectURL(state.discoveredImages[path]);
      state.discoveredImages[path] = url;
      var parts = path.split('/');
      var folder = parts.length > 2 && parts[0] === '1' ? parts[1] : 'Выбранная папка';
      var label = folder.indexOf('image') === 0 ? 'Коллекция ' + folder : folder;
      if (!window.IMAGE_CATALOG[label]) window.IMAGE_CATALOG[label] = [];
      if (window.IMAGE_CATALOG[label].indexOf(path) < 0) window.IMAGE_CATALOG[label].push(path);
      added++;
    });
    Object.keys(window.IMAGE_CATALOG).forEach(function (key) {
      if (Array.isArray(window.IMAGE_CATALOG[key])) window.IMAGE_CATALOG[key].sort();
    });
    renderPickerFolders();
    renderPickerGrid();
    var status = $('catalog-status');
    if (status) status.textContent = added ? 'Найдено новых: ' + added : 'Новых изображений не найдено';
    toast(added ? 'Каталог обновлён: добавлено ' + added + ' изображений' : 'Новых изображений не найдено');
  }

  function initImageDiscovery() {
    var button = $('scan-images-btn');
    var input = $('scan-images-input');
    if (!button || !input) return;
    button.addEventListener('click', function () {
      input.value = '';
      input.click();
    });
    input.addEventListener('change', function (e) {
      addDiscoveredImages(e.target.files);
      input.value = '';
    });
  }

  function initImportExport() {
    $('export-btn').addEventListener('click', exportJSON);
    $('import-input').addEventListener('change', function (e) {
      var input = e.target;
      var file = input.files && input.files[0];
      if (!file) return;
      if (state.dirty.minion || state.dirty.spell) {
        if (!window.confirm('Несохранённые изменения в редакторе будут потеряны. Продолжить загрузку?')) { input.value = ''; return; }
      }
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try {
          data = normalizeData(JSON.parse(String(reader.result).replace(/^\uFEFF/, '')));
        } catch (err) {
          toast('Не удалось загрузить «' + file.name + '»: ' +
            (err instanceof SyntaxError ? 'файл не является корректным JSON' : err.message), true);
          input.value = '';
          return;
        }
        importData(data);
        input.value = '';
      };
      reader.onerror = function () {
        toast('Не удалось прочитать файл «' + file.name + '»', true);
        input.value = '';
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  /* ---------------------------- запуск ---------------------------- */

  function loadInitial() {
    var raw = storeGet(STORAGE_KEY);
    if (raw) {
      try {
        var data = normalizeData(JSON.parse(raw));
        state.minions = data.minions;
        state.spells = data.spells;
        return;
      } catch (e) {
        toast('Локальные данные повреждены, загружен пустой набор. Загрузите JSON из резервной копии.', true);
      }
    }
    // Пример из assets/data.json доступен только при открытии через http(s); при file:// fetch блокируется.
    if (location.protocol === 'file:' || !window.fetch) return;
    fetch('assets/data.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (json) {
        if (state.minions.length || state.spells.length) return;
        var data = normalizeData(json);
        state.minions = data.minions;
        state.spells = data.spells;
        renderGallery();
      })
      .catch(function () { /* примера нет — остаётся пустая галерея с подсказкой */ });
  }

  function init() {
    initMode();
    initFilters();
    initEditors();
    initPicker();
    initImportExport();
    initImageDiscovery();
    initGalleryActions();
    initNav();
    loadInitial();
    state.drafts.minion = blankCard('minion');
    state.drafts.spell = blankCard('spell');
    fillEditor('minion');
    fillEditor('spell');
    setView('gallery');

    window.addEventListener('beforeunload', function (e) {
      if (state.dirty.minion || state.dirty.spell) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
