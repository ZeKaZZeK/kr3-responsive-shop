// ==========================================================
// PlayRent — общий скрипт для всех страниц.
// Каждый модуль проверяет, есть ли нужные элементы на странице.
// ==========================================================

(function () {
  'use strict';

  // ---------- Вспомогательные функции ----------

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* хранилище недоступно — сайт продолжает работать */
    }
  }

  const pad = (n) => String(n).padStart(2, '0');

  /** Date -> «YYYY-MM-DD» в локальном времени */
  function toISO(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  /** «YYYY-MM-DD» -> Date (локальная полночь) */
  function fromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Количество суток аренды (оба дня включительно) */
  function daysBetween(from, to) {
    return Math.round((to - from) / DAY_MS) + 1;
  }

  function formatMoney(n) {
    return n.toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';
  }

  function formatDate(date) {
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function pluralDays(n) {
    const a = n % 10;
    const b = n % 100;
    if (a === 1 && b !== 11) return n + ' сутки';
    return n + ' суток';
  }

  /** Стоимость: недельный тариф за каждые полные 7 суток, остаток — не дороже недели */
  function rentalPrice(day, week, days) {
    const weeks = Math.floor(days / 7);
    const rest = days % 7;
    return weeks * week + Math.min(rest * day, week);
  }

  /** Условные занятые даты (для демонстрации календаря): блоки по 3 дня */
  function isBusy(productId, offset) {
    return (Math.floor(offset / 3) * 7 + productId * 5) % 6 === 0;
  }

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ==========================================================
  // 1. Тема и мобильное меню
  // ==========================================================
  function initTheme() {
    const button = $('.theme-toggle');
    if (!button) return;

    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      storageSet('rent-theme', next);
    });
  }

  function initMenu() {
    const burger = $('.site-header__burger');
    const nav = $('#site-nav');
    if (!burger || !nav) return;

    const setOpen = (open) => {
      nav.classList.toggle('site-nav--open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    };

    burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  // ==========================================================
  // 2. Карусель на главной
  // ==========================================================
  function initCarousel() {
    const root = $('.carousel');
    if (!root) return;

    const track = $('.carousel__track', root);
    const slides = $$('.carousel__slide', root);
    const dots = $$('.carousel__dot', root);
    let index = 0;
    let timer = null;

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = 'translateX(' + -index * 100 + '%)';
      slides.forEach((slide, n) => {
        // неактивные слайды недоступны для фокуса и скринридера
        slide.inert = n !== index;
        slide.setAttribute('aria-hidden', String(n !== index));
      });
      dots.forEach((dot, n) => {
        dot.classList.toggle('carousel__dot--active', n === index);
        if (n === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    function start() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      stop();
      timer = setInterval(() => goTo(index + 1), 6000);
    }

    function stop() {
      clearInterval(timer);
      timer = null;
    }

    $('.carousel__arrow--prev', root).addEventListener('click', () => { goTo(index - 1); start(); });
    $('.carousel__arrow--next', root).addEventListener('click', () => { goTo(index + 1); start(); });
    dots.forEach((dot, n) => dot.addEventListener('click', () => { goTo(n); start(); }));

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);

    // Свайп на сенсорных экранах
    let startX = null;
    root.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) goTo(index + (dx < 0 ? 1 : -1));
      startX = null;
    });

    goTo(0);
    start();
  }

  // ==========================================================
  // 3. Валидация форм
  // ==========================================================
  function errorMessage(el) {
    const v = el.validity;
    if (v.customError) return el.validationMessage;
    if (v.valueMissing) {
      if (el.type === 'checkbox') return 'Необходимо ваше согласие';
      if (el.tagName === 'SELECT') return 'Выберите значение из списка';
      return 'Заполните это поле';
    }
    if (v.typeMismatch) return 'Введите корректный e-mail, например example@mail.ru';
    if (v.patternMismatch) return el.title || 'Проверьте формат значения';
    if (v.tooShort) return 'Минимум символов: ' + el.minLength;
    if (v.rangeUnderflow) return 'Дата не может быть в прошлом';
    return el.validationMessage || 'Проверьте значение';
  }

  function setFieldError(el, message) {
    const error = el.id ? document.getElementById(el.id + '-error') : null;
    if (message) {
      el.setAttribute('aria-invalid', 'true');
      if (error) {
        error.textContent = message;
        error.hidden = false;
        el.setAttribute('aria-describedby', error.id);
      }
    } else {
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
      if (error) {
        error.textContent = '';
        error.hidden = true;
      }
    }
  }

  function validateField(el) {
    if (!el.willValidate) {
      setFieldError(el, '');
      return true;
    }
    const ok = el.checkValidity();
    setFieldError(el, ok ? '' : errorMessage(el));
    return ok;
  }

  /** Проверяет набор полей, фокусируется на первом неверном. */
  function validateFields(elements) {
    let first = null;
    elements.forEach((el) => {
      if (!validateField(el) && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  function updateCounter(textarea) {
    const counter = document.getElementById(textarea.dataset.counter);
    if (counter) counter.textContent = textarea.value.length + ' / ' + textarea.maxLength;
  }

  function formatPhone(raw) {
    let digits = raw.replace(/\D/g, '');
    if (digits[0] === '7' || digits[0] === '8') digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (!digits) return '';
    let out = '+7 (' + digits.slice(0, 3);
    if (digits.length > 3) out += ') ' + digits.slice(3, 6);
    if (digits.length > 6) out += '-' + digits.slice(6, 8);
    if (digits.length > 8) out += '-' + digits.slice(8, 10);
    return out;
  }

  function formatCard(raw) {
    return raw.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  function formatExp(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
  }

  /** Общие подсказки для полей формы: маски, счётчик, мин. дата, живая проверка */
  function enhanceForm(form) {
    $$('[data-phone-mask]', form).forEach((i) => i.addEventListener('input', () => { i.value = formatPhone(i.value); }));
    $$('[data-card-mask]', form).forEach((i) => i.addEventListener('input', () => { i.value = formatCard(i.value); }));
    $$('[data-exp-mask]', form).forEach((i) => i.addEventListener('input', () => { i.value = formatExp(i.value); }));
    $$('input[inputmode="numeric"][maxlength]', form).forEach((i) => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, ''); }));
    $$('[data-counter]', form).forEach((t) => t.addEventListener('input', () => updateCounter(t)));
    $$('[data-min-today]', form).forEach((i) => { i.min = toISO(today()); });

    form.addEventListener('focusout', (e) => {
      const el = e.target;
      if (el.willValidate && (el.value !== '' || el.hasAttribute('aria-invalid'))) validateField(el);
    });
    ['input', 'change'].forEach((type) => {
      form.addEventListener(type, (e) => {
        const el = e.target;
        if (el.hasAttribute && el.hasAttribute('aria-invalid')) validateField(el);
      });
    });
  }

  function initFeedbackForm() {
    const form = $('#feedback-form');
    if (!form) return;
    enhanceForm(form);

    const wrap = form.parentElement;
    const success = $('[data-form-success]', wrap);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!validateFields(Array.from(form.elements))) return;
      form.reset();
      $$('[data-counter]', form).forEach(updateCounter);
      form.hidden = true;
      success.hidden = false;
      success.focus();
    });

    $('[data-form-reset]', wrap).addEventListener('click', () => {
      success.hidden = true;
      form.hidden = false;
      $('input', form).focus();
    });
  }

  // ==========================================================
  // 4. Каталог: фильтры, сортировка, пагинация
  // ==========================================================
  function initCatalog() {
    const grid = $('#catalog-grid');
    const form = $('#filters-form');
    if (!grid || !form) return;

    const PAGE_SIZE = 6;
    const sortSelect = $('#catalog-sort');
    const count = $('#catalog-count');
    const empty = $('#catalog-empty');
    const pagination = $('#pagination');
    const cards = $$('.product-card', grid);
    let page = 1;

    cards.forEach((card, i) => { card.dataset.order = i; });

    function filtered() {
      const platforms = $$('input[name="platform"]:checked', form).map((i) => i.value);
      const players = parseInt($('#filter-players').value, 10);
      const from = parseFloat($('#price-from').value);
      const to = parseFloat($('#price-to').value);

      return cards.filter((card) => {
        const price = Number(card.dataset.price);
        return (
          (platforms.length === 0 || platforms.includes(card.dataset.platform)) &&
          (isNaN(players) || (Number(card.dataset.pmin) <= players && players <= Number(card.dataset.pmax))) &&
          (isNaN(from) || price >= from) &&
          (isNaN(to) || price <= to)
        );
      });
    }

    function sorted(list) {
      const mode = sortSelect.value;
      return list.slice().sort((a, b) => {
        if (mode === 'price-asc') return a.dataset.price - b.dataset.price;
        if (mode === 'price-desc') return b.dataset.price - a.dataset.price;
        if (mode === 'name') return a.dataset.name.localeCompare(b.dataset.name, 'ru');
        return a.dataset.order - b.dataset.order;
      });
    }

    function renderPagination(pages) {
      pagination.replaceChildren();
      pagination.hidden = pages <= 1;
      if (pages <= 1) return;

      const makeButton = (label, target, options) => {
        const button = createEl('button', 'pagination__button', label);
        button.type = 'button';
        if (options && options.label) button.setAttribute('aria-label', options.label);
        if (options && options.disabled) button.disabled = true;
        if (options && options.active) {
          button.classList.add('pagination__button--active');
          button.setAttribute('aria-current', 'page');
        }
        button.addEventListener('click', () => {
          page = target;
          apply(true);
        });
        pagination.appendChild(button);
      };

      makeButton('‹', page - 1, { label: 'Предыдущая страница', disabled: page === 1 });
      for (let n = 1; n <= pages; n += 1) {
        makeButton(String(n), n, { label: 'Страница ' + n, active: n === page });
      }
      makeButton('›', page + 1, { label: 'Следующая страница', disabled: page === pages });
    }

    function apply(scroll) {
      const list = sorted(filtered());
      const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (page > pages) page = pages;

      const visible = new Set(list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      const hiddenCards = cards.filter((c) => !list.includes(c));
      list.forEach((card) => grid.appendChild(card));
      hiddenCards.forEach((card) => grid.appendChild(card));
      cards.forEach((card) => { card.hidden = !visible.has(card); });

      count.textContent = 'Найдено: ' + list.length;
      empty.hidden = list.length !== 0;
      renderPagination(pages);

      if (scroll) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Любое изменение фильтров возвращает на первую страницу
    const onFilter = () => { page = 1; apply(false); };
    form.addEventListener('input', onFilter);
    form.addEventListener('change', onFilter);
    form.addEventListener('submit', (e) => { e.preventDefault(); onFilter(); });
    form.addEventListener('reset', () => {
      sortSelect.value = 'default';
      setTimeout(onFilter, 0);
    });
    sortSelect.addEventListener('change', onFilter);

    // catalog.html?platform=ps
    const preset = new URLSearchParams(location.search).get('platform');
    const box = preset && $('input[name="platform"][value="' + preset + '"]', form);
    if (box) box.checked = true;

    apply(false);
  }

  // ==========================================================
  // 5. Страница позиции
  // ==========================================================
  function cardNode(p) {
    const article = createEl('article', 'product-card');
    const media = createEl('a', 'product-card__media');
    media.href = 'product.html?id=' + p.id;
    media.tabIndex = -1;
    media.setAttribute('aria-hidden', 'true');
    const img = createEl('img', 'product-card__image');
    img.src = 'images/product-' + p.id + '-1.svg';
    img.alt = '';
    img.width = 400;
    img.height = 300;
    img.loading = 'lazy';
    media.appendChild(img);
    article.appendChild(media);

    const meta = createEl('div', 'product-card__meta');
    meta.appendChild(createEl('span', 'chip chip--' + p.platform, p.platformName));
    meta.appendChild(createEl('span', 'product-card__players', 'Игроков: ' + p.players));
    article.appendChild(meta);

    const title = createEl('h3', 'product-card__title');
    const link = createEl('a', 'product-card__link', p.name);
    link.href = 'product.html?id=' + p.id;
    title.appendChild(link);
    article.appendChild(title);
    article.appendChild(createEl('p', 'product-card__description', p.short));

    const price = createEl('p', 'product-card__price');
    price.appendChild(createEl('span', 'product-card__price-current', p.dayText));
    price.appendChild(createEl('span', 'product-card__price-unit', '/ сутки'));
    article.appendChild(price);

    const actions = createEl('div', 'product-card__actions');
    const more = createEl('a', 'button button--secondary', 'Подробнее');
    more.href = 'product.html?id=' + p.id;
    const book = createEl('a', 'button button--primary', 'Забронировать');
    book.href = 'booking.html?id=' + p.id;
    actions.appendChild(more);
    actions.appendChild(book);
    article.appendChild(actions);
    return article;
  }

  function initCalendar(product) {
    const root = $('#calendar-widget');
    if (!root) return;

    const text = $('#calendar-text');
    const bookLink = $('#calendar-book');
    const base = today();
    let monthShift = 0;
    let start = null;
    let end = null;

    const monthStart = (shift) => new Date(base.getFullYear(), base.getMonth() + shift, 1);

    function offsetOf(date) {
      return Math.round((date - base) / DAY_MS);
    }

    function rangeHasBusy(a, b) {
      for (let d = new Date(a); d <= b; d = addDays(d, 1)) {
        if (isBusy(product.id, offsetOf(d))) return true;
      }
      return false;
    }

    function renderMonth(shift) {
      const first = monthStart(shift);
      const wrap = createEl('div', 'calendar__month');
      const head = createEl('div', 'calendar__month-head');

      const prev = createEl('button', 'calendar__nav', '‹');
      prev.type = 'button';
      prev.setAttribute('aria-label', 'Предыдущий месяц');
      prev.disabled = monthShift === 0;
      prev.style.visibility = shift === monthShift ? 'visible' : 'hidden';
      prev.addEventListener('click', () => { monthShift -= 1; render(); });

      const next = createEl('button', 'calendar__nav', '›');
      next.type = 'button';
      next.setAttribute('aria-label', 'Следующий месяц');
      next.disabled = monthShift >= 4;
      next.style.visibility = shift === monthShift + 1 ? 'visible' : 'hidden';
      next.addEventListener('click', () => { monthShift += 1; render(); });

      head.appendChild(prev);
      head.appendChild(createEl('h3', 'calendar__title', first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })));
      head.appendChild(next);
      wrap.appendChild(head);

      const grid = createEl('div', 'calendar__grid');
      ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach((d) => grid.appendChild(createEl('span', 'calendar__weekday', d)));

      const lead = (first.getDay() + 6) % 7; // неделя начинается с понедельника
      for (let i = 0; i < lead; i += 1) grid.appendChild(createEl('span', 'calendar__day calendar__day--empty'));

      const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      for (let n = 1; n <= daysInMonth; n += 1) {
        const date = new Date(first.getFullYear(), first.getMonth(), n);
        const button = createEl('button', 'calendar__day', String(n));
        button.type = 'button';
        button.setAttribute('aria-label', formatDate(date));

        const past = date < base;
        const busy = !past && isBusy(product.id, offsetOf(date));
        if (past) {
          button.classList.add('calendar__day--past');
          button.disabled = true;
        } else if (busy) {
          button.classList.add('calendar__day--busy');
          button.disabled = true;
          button.setAttribute('aria-label', formatDate(date) + ', занято');
        } else {
          const isStart = start && date.getTime() === start.getTime();
          const isEnd = end && date.getTime() === end.getTime();
          if (isStart || isEnd) button.classList.add('calendar__day--selected');
          else if (start && end && date > start && date < end) button.classList.add('calendar__day--range');
          button.setAttribute('aria-pressed', String(Boolean(isStart || isEnd)));
          button.addEventListener('click', () => pick(date));
        }
        grid.appendChild(button);
      }
      wrap.appendChild(grid);
      return wrap;
    }

    function pick(date) {
      if (!start || (start && end)) {
        start = date;
        end = null;
      } else if (date < start) {
        start = date;
      } else if (rangeHasBusy(start, date)) {
        // в выбранном периоде есть занятые даты — начинаем выбор заново
        start = date;
        end = null;
        text.textContent = 'В этом периоде есть занятые даты. Начните выбор с новой даты.';
        render(true);
        return;
      } else {
        end = date;
      }
      render();
    }

    function updateSummary() {
      if (start && end) {
        const days = daysBetween(start, end);
        const total = rentalPrice(product.day, product.week, days);
        text.textContent = formatDate(start) + ' — ' + formatDate(end) + ' · ' + pluralDays(days) + ' · ' + formatMoney(total);
        bookLink.href = 'booking.html?id=' + product.id + '&from=' + toISO(start) + '&to=' + toISO(end);
      } else if (start) {
        text.textContent = 'Начало: ' + formatDate(start) + '. Выберите дату окончания.';
        bookLink.href = 'booking.html?id=' + product.id + '&from=' + toISO(start);
      } else {
        text.textContent = 'Выберите даты в календаре.';
        bookLink.href = 'booking.html?id=' + product.id;
      }
    }

    function render(keepText) {
      root.replaceChildren(renderMonth(monthShift), renderMonth(monthShift + 1));
      const legend = createEl('ul', 'calendar__legend');
      [['calendar__legend-free', 'свободно'], ['calendar__legend-busy', 'занято'], ['calendar__legend-selected', 'выбрано']].forEach(([cls, label]) => {
        legend.appendChild(createEl('li', cls, label));
      });
      root.appendChild(legend);
      if (!keepText) updateSummary();
    }

    render();
  }

  function initProductPage() {
    const root = $('#product');
    const products = window.RENT_PRODUCTS;
    if (!root || !products) return;

    const requested = Number(new URLSearchParams(location.search).get('id'));
    const p = products.find((x) => x.id === requested) || products.find((x) => x.id === Number(root.dataset.productId));
    const bind = (name) => $('[data-bind="' + name + '"]');

    document.title = p.name + ' — PlayRent';
    bind('breadcrumb').textContent = p.name;
    bind('name').textContent = p.name;
    bind('short').textContent = p.short;
    bind('long').textContent = p.long;
    bind('day').textContent = p.dayText;
    bind('week').textContent = p.weekText;
    bind('players').textContent = 'Игроков: ' + p.players;
    bind('chip').replaceChildren(createEl('span', 'chip chip--' + p.platform, p.platformName));
    bind('games-title').textContent = p.gamesTitle;
    bind('save').textContent = 'выгода ' + Math.round((1 - p.week / (p.day * 7)) * 100) + '%';
    bind('games').replaceChildren(...p.games.map((g) => createEl('li', 'tag-list__item', g)));
    bind('kit').replaceChildren(...p.kit.map((k) => createEl('li', 'check-list__item', k)));

    $('#product-book').href = 'booking.html?id=' + p.id;
    $('#calendar-book').href = 'booking.html?id=' + p.id;

    // --- Галерея ---
    const main = $('#gallery-main');
    const thumbs = $$('[data-gallery-thumb]');
    thumbs.forEach((thumb, i) => {
      const src = 'images/product-' + p.id + '-' + (i + 1) + '.svg';
      thumb.dataset.src = src;
      $('img', thumb).src = src;
      thumb.addEventListener('click', () => {
        main.src = src;
        main.alt = p.name + ', фото ' + (i + 1);
        thumbs.forEach((t) => {
          const active = t === thumb;
          t.classList.toggle('gallery__thumb--active', active);
          t.setAttribute('aria-pressed', String(active));
        });
      });
    });
    main.src = 'images/product-' + p.id + '-1.svg';
    main.alt = p.name;

    // --- Похожие позиции: сначала та же платформа ---
    const same = products.filter((x) => x.id !== p.id && x.platform === p.platform);
    const others = products.filter((x) => x.id !== p.id && x.platform !== p.platform);
    $('#similar-grid').replaceChildren(...same.concat(others).slice(0, 3).map(cardNode));

    initCalendar(p);
  }

  // ==========================================================
  // 6. Бронирование: пошаговая форма
  // ==========================================================
  function initBooking() {
    const form = $('#booking-form');
    if (!form) return;
    enhanceForm(form);

    const steps = $$('.booking-form__step', form);
    const markers = $$('[data-step-marker]');
    const back = $('#step-back');
    const next = $('#step-next');
    const submit = $('#step-submit');
    const itemSelect = $('#bk-item');
    const fromInput = $('#bk-from');
    const toInput = $('#bk-to');
    const addressBlock = $('#address-block');
    const remind = $('#bk-remind');
    const contact = $('#bk-contact');
    const reminderBody = $('#reminder-body');
    let current = 1;

    // --- Расчёт стоимости ---
    function calc() {
      const option = itemSelect.selectedOptions[0];
      const chosen = Boolean(itemSelect.value);
      const from = fromInput.value ? fromISO(fromInput.value) : null;
      const to = toInput.value ? fromISO(toInput.value) : null;
      const valid = chosen && from && to && to >= from;
      const delivery = form.elements.delivery.value;
      const pct = Number(form.elements.prepay.value);

      const image = $('#summary-image');
      image.hidden = !chosen;
      if (chosen) image.src = option.dataset.image;

      $('#sum-item').textContent = chosen ? option.textContent.split(' — ')[0] : 'не выбрана';
      $('#sum-period').textContent = from && to ? formatDate(from) + ' — ' + formatDate(to) : '—';

      if (!valid) {
        $('#sum-days').textContent = '—';
        $('#sum-total').textContent = '—';
        $('#sum-prepay').textContent = '—';
        $('#sum-delivery').textContent = delivery === 'pickup' ? 'самовывоз' : 'уточним';
        return null;
      }

      const days = daysBetween(from, to);
      const rent = rentalPrice(Number(option.dataset.day), Number(option.dataset.week), days);
      const fee = delivery === 'pickup' || rent >= 1500 ? 0 : 300;
      const total = rent + fee;
      const prepay = Math.round((total * pct) / 100);

      $('#sum-days').textContent = pluralDays(days);
      $('#sum-delivery').textContent = delivery === 'pickup' ? 'самовывоз' : fee === 0 ? 'бесплатно' : formatMoney(fee);
      $('#sum-total').textContent = formatMoney(total);
      $('#sum-prepay').textContent = formatMoney(prepay);
      return { days, total, prepay, rest: total - prepay };
    }

    function syncDates() {
      if (fromInput.value) toInput.min = fromInput.value;
      toInput.setCustomValidity(
        fromInput.value && toInput.value && toInput.value < fromInput.value ? 'Дата окончания раньше даты начала' : ''
      );
    }

    // --- Видимость блоков ---
    function syncDelivery() {
      const pickup = form.elements.delivery.value === 'pickup';
      addressBlock.hidden = pickup;
      $$('input, textarea', addressBlock).forEach((el) => {
        el.disabled = pickup;
        if (pickup) setFieldError(el, '');
      });
    }

    function syncRemind() {
      reminderBody.hidden = !remind.checked;
      contact.disabled = !remind.checked;
      if (!remind.checked) setFieldError(contact, '');
    }

    function showStep(n, scroll) {
      current = n;
      steps.forEach((s, i) => { s.hidden = i + 1 !== n; });
      markers.forEach((m, i) => {
        m.classList.toggle('steps__item--active', i + 1 === n);
        m.classList.toggle('steps__item--done', i + 1 < n);
        if (i + 1 === n) m.setAttribute('aria-current', 'step');
        else m.removeAttribute('aria-current');
      });
      back.hidden = n === 1;
      next.hidden = n === steps.length;
      submit.hidden = n !== steps.length;
      const legend = $('.booking-form__legend', steps[n - 1]);
      if (scroll !== false) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstField = $('input:not([disabled]):not([type="radio"]), select, textarea', steps[n - 1]);
      if (firstField && n > 1) firstField.focus({ preventScroll: true });
      return legend;
    }

    function stepFields(n) {
      return $$('input, select, textarea', steps[n - 1]).filter((el) => el.willValidate);
    }

    next.addEventListener('click', () => {
      syncDates();
      if (validateFields(stepFields(current))) showStep(current + 1);
    });
    back.addEventListener('click', () => showStep(current - 1));

    // --- Подписка на изменения ---
    form.addEventListener('input', () => { syncDates(); calc(); });
    form.addEventListener('change', () => { syncDates(); syncDelivery(); syncRemind(); calc(); });

    // --- Отправка ---
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      syncDates();
      // Проверяем все шаги, при ошибке возвращаемся на нужный
      for (let n = 1; n <= steps.length; n += 1) {
        steps[n - 1].hidden = false;
        const ok = validateFields(stepFields(n));
        steps[n - 1].hidden = n !== current;
        if (!ok) {
          showStep(n);
          validateFields(stepFields(n));
          return;
        }
      }
      finish();
    });

    function finish() {
      const sum = calc();
      const option = itemSelect.selectedOptions[0];
      const pickup = form.elements.delivery.value === 'pickup';
      const number = 'PR-' + String(Date.now()).slice(-6);
      const address = pickup
        ? 'Самовывоз: Москва, ул. Игровая, 1'
        : 'Доставка: ' + form.elements.street.value + ', д. ' + form.elements.house.value +
          (form.elements.flat.value ? ', кв. ' + form.elements.flat.value : '');

      $('#done-number').textContent = number;
      const list = $('#done-list');
      list.replaceChildren(
        ...[
          option.textContent.split(' — ')[0],
          formatDate(fromISO(fromInput.value)) + ' — ' + formatDate(fromISO(toInput.value)) + ' (' + pluralDays(sum.days) + ')',
          address,
          'Время: ' + form.elements.time.value,
          'Предоплата: ' + formatMoney(sum.prepay) + ', остаток: ' + formatMoney(sum.rest),
        ].map((t) => createEl('li', '', t))
      );
      $('#done-remind').textContent = remind.checked
        ? 'Напомним в ' + form.elements.messenger.value + ' (' + contact.value + ') за 2 часа до доставки.'
        : 'Мы пришлём подтверждение на ' + form.elements.email.value + '.';

      markers.forEach((m) => {
        m.classList.remove('steps__item--active');
        m.classList.add('steps__item--done');
      });
      form.hidden = true;
      const done = $('#booking-done');
      done.hidden = false;
      done.focus();
      done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // --- Предзаполнение из адреса: booking.html?id=3&from=...&to=... ---
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id && $('option[value="' + id + '"]', itemSelect)) itemSelect.value = id;
    const minDate = toISO(today());
    const from = params.get('from');
    const to = params.get('to');
    if (from && from >= minDate) fromInput.value = from;
    if (to && to >= minDate) toInput.value = to;

    syncDates();
    syncDelivery();
    syncRemind();
    showStep(1, false);
    calc();
  }

  // ---------- Запуск ----------
  initTheme();
  initMenu();
  initCarousel();
  initFeedbackForm();
  initCatalog();
  initProductPage();
  initBooking();
})();
