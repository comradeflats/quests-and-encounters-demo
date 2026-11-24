/* Quests and Encounters: translation layer.
 *
 * The game writes English; this layer translates text as it reaches the screen. Each text node is
 * cut into segments (sentences, and the pieces between " · "). In each segment, numbers (#),
 * Company names (@) and glossary terms (%: places, items, resources...) become slots, so
 * "+3 Coin." and "+5 Coin." share one entry, "+# %.". A translation fills the slots in order, or by
 * index (#1, @2, %1...). A glossary term right after a number takes the plural form for that number.
 *
 *   I18N.set('ru')         switch language (remembered in localStorage)
 *   I18N.capture = Set     record every segment key the dictionary doesn't have (for extraction)
 *   dictionaries:          window.I18N_DICT = { ru: {key: text}, es: {...} }   (i18n_ru.js, i18n_es.js)
 *   glossaries:            window.I18N_GLOSS = { ru: {term: text | [forms]}, es: ... }
 */
(function () {
  const MEMBERS = ['Brother Aldous', 'Captain Brannoc', 'Wren', 'Aldous', 'Brannoc', 'Ness'];
  const TERMS = [
    // places and regions
    'Ravenwick', 'The Fork', 'The Spire', 'The High Pass', 'Sunlit Hollow', 'Old Quarry', 'Oakwell Road', 'The Ridge Road', 'The Ruts', 'Hollin',
    'The Old Ferry', 'The Black Water', 'The Drowned Chapel', 'Stillwater', 'the Greyspires', 'the lowlands', 'the Fens', 'Greyspires', 'lowlands', 'Fens',
    // gear, stores and learned skills
    'Fen-iron sword', 'Climbing irons', 'Signet of a dead lord', 'Marsh-light in a jar', "Healer's satchel", 'Healer’s satchel', 'Pack mule', 'Eel traps',
    "Saint's Bell", 'Saint’s Bell', 'Masonry', 'Fen fishing', 'Herb lore', 'Haggling',
    // resources, time, stats, buildings
    'Stone', 'Coin', 'Bread', 'Ward', 'Wards', 'days', 'day', 'Might', 'Wits', 'Faith', 'Stealth', 'Walls', 'Watchtower',
  ];
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const PAT = new RegExp('(\\d+)|(' + MEMBERS.map(esc).join('|') + ')(?![\\w-])|(' +
    [...TERMS].sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![\\w-])', 'g');

  function tokenize(s) {
    const nums = [], mems = [], terms = [];
    let key = '', last = 0, m, lastNum = null, lastEnd = -1;
    PAT.lastIndex = 0;
    while ((m = PAT.exec(s))) {
      const before = s[m.index - 1];
      if (before && /[\w-]/.test(before)) continue;   // inside a longer word
      key += s.slice(last, m.index);
      if (m[1] !== undefined) { nums.push(+m[1]); key += '#'; lastNum = +m[1]; lastEnd = m.index + m[0].length; }
      else if (m[2]) { mems.push(m[2]); key += '@'; }
      else {
        const gap = s.slice(lastEnd, m.index);
        terms.push({ t: m[3], n: lastEnd >= 0 && /^\s*$/.test(gap) ? lastNum : null });
        key += '%';
      }
      last = m.index + m[0].length;
    }
    key += s.slice(last);
    return { key, nums, mems, terms };
  }

  const PLURAL = {
    ru: n => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2; },
    es: n => (Math.abs(n) === 1 ? 0 : 1),
  };
  function term(lang, t) {
    const g = (window.I18N_GLOSS || {})[lang] || {}, v = g[t.t];
    if (v === undefined) return t.t;
    if (Array.isArray(v)) return v[t.n == null ? 0 : (PLURAL[lang] || (() => 0))(t.n)] ?? v[0];
    return v;
  }
  function member(lang, name) { const g = (window.I18N_GLOSS || {})[lang] || {}; return g[name] ?? name; }

  function fill(lang, tpl, tok) {
    const c = { '#': 0, '@': 0, '%': 0 };
    return tpl.replace(/([#@%])(\d)?/g, (_, k, i) => {
      const idx = i ? +i - 1 : c[k]++;
      if (k === '#') return tok.nums[idx] ?? '';
      if (k === '@') return tok.mems[idx] ? member(lang, tok.mems[idx]) : '';
      return tok.terms[idx] ? term(lang, tok.terms[idx]) : '';
    });
  }

  const I18N = { lang: 'en', capture: null };
  function dict() { return ((window.I18N_DICT || {})[I18N.lang]) || {}; }
  function trSeg(seg) {
    const core = seg.trim();
    if (!core || !/[A-Za-z]/.test(core)) return seg;
    const lead = seg.slice(0, seg.indexOf(core)), trail = seg.slice(seg.indexOf(core) + core.length);
    const D = dict();
    if (D[core] !== undefined) return lead + D[core] + trail;
    const tok = tokenize(core);
    if (D[tok.key] !== undefined) return lead + fill(I18N.lang, D[tok.key], tok) + trail;
    if (I18N.capture) I18N.capture.add(tok.key);
    // nothing for the sentence, but a lone glossary term can still be translated
    if (tok.key === '%' || tok.key === '@') {  // a lone name or term: keep the English capitalisation
      let t = fill(I18N.lang, tok.key, tok);
      if (/^[A-Z]/.test(core)) t = t.charAt(0).toLocaleUpperCase(I18N.lang) + t.slice(1);
      return lead + t + trail;
    }
    return seg;
  }
  function split(s) {
    // sentences (after . ! ? … and any closing quote), and the parts between " · "
    const out = []; let cur = '';
    for (let i = 0; i < s.length; i++) {
      cur += s[i];
      if (s.startsWith(' · ', i + 1)) { out.push(cur); out.push(' · '); cur = ''; i += 3; continue; }
      if (s.startsWith('; ', i + 1)) { out.push(cur); out.push('; '); cur = ''; i += 2; continue; }
      if (/[.!?…]/.test(s[i])) {
        let j = i + 1; while (j < s.length && /[”"’)]/.test(s[j])) { cur += s[j]; j++; }
        if (j < s.length && /\s/.test(s[j])) { let k = j; while (k < s.length && /\s/.test(s[k])) k++; out.push(cur + s.slice(j, k)); cur = ''; i = k - 1; continue; }
        i = j - 1;
      }
    }
    if (cur) out.push(cur);
    return out;
  }
  function tr(s) {
    if (I18N.lang === 'en' && !I18N.capture) return s;
    const core = s.trim();
    if (!core) return s;
    const D = dict(), tok = tokenize(core);
    if (D[core] !== undefined || D[tok.key] !== undefined) return trSeg(s);
    return split(s).map(p => (p === ' · ' || p === '; ' ? p : trSeg(p))).join('');
  }

  // Translate text nodes as the game writes them; remember each node's English for language switches.
  const orig = new WeakMap(), wrote = new WeakMap();
  const SKIP = { SCRIPT: 1, STYLE: 1, PRE: 1 };
  function doNode(n) {
    if (!n.parentNode || SKIP[n.parentNode.nodeName]) return;
    if (wrote.get(n) === n.nodeValue) return;
    const en = n.nodeValue;
    orig.set(n, en);
    const out = tr(en);
    if (out !== en) { wrote.set(n, out); n.nodeValue = out; }
  }
  function walk(root) {
    if (root.nodeType === 3) return doNode(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = it.nextNode())) doNode(n);
  }
  const obs = new MutationObserver(ms => {
    if (I18N.lang === 'en' && !I18N.capture) return;
    for (const m of ms) {
      if (m.type === 'characterData') doNode(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  I18N.tr = tr;
  I18N.tokenize = tokenize;
  I18N.set = function (lang) {
    I18N.lang = lang;
    try { localStorage.setItem('qe_lang', lang); } catch (e) {}
    document.documentElement.lang = lang;
    // put every node back to English, then translate again in the new language
    const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = it.nextNode())) { if (orig.has(n) && wrote.get(n) === n.nodeValue) n.nodeValue = orig.get(n); wrote.delete(n); }
    if (lang !== 'en' || I18N.capture) walk(document.body);
    window.dispatchEvent(new Event('langchange'));
  };
  I18N.start = function () {
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    let saved = 'en'; try { saved = localStorage.getItem('qe_lang') || 'en'; } catch (e) {}
    const q = new URLSearchParams(location.search).get('lang'); if (q) saved = q;
    if (saved !== 'en') I18N.set(saved);
  };
  window.I18N = I18N;
})();
