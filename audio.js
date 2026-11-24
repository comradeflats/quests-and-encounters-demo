/* Quests and Encounters: generative soundtrack, ambience and sound effects. Everything is
 * synthesised in the browser with Web Audio: no samples, no files.
 *
 *  - Music: a composer that plays live in a "mood" (key, scale, chords, tempo, instruments).
 *    Phrases are generated as you listen, so it never loops exactly. Moods change on the bar.
 *  - Ambience: wind, crickets, fire, water, birds, drips, a waterfall; mixed per scene.
 *  - SFX: clicks, steps, coins, steel, wards, hooves, stone, building, rain, loyalty chimes.
 *
 *  Audio.start()            on the first click (browsers need a gesture)
 *  Audio.mood('road')       road | tension | eerie | home | day | victory | defeat
 *  Audio.ambience([...])    e.g. ['wind','crickets']
 *  Audio.sfx('coin')        see SFX below
 *  Audio.toggle()           mute / unmute
 */
(function () {
  let ac, master, musicBus, ambBus, sfxBus, verb, verbSend, started = false, muted = false;
  const PL = {};  // pluck buffer cache
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function impulse(sec, decay) {
    const n = ac.sampleRate * sec, b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function noiseBuf(sec) {
    const n = ac.sampleRate * sec, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  let NOISE;

  function start() {
    if (started) { ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.8;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ac.destination);
    verb = ac.createConvolver(); verb.buffer = impulse(3.4, 2.6);
    verbSend = ac.createGain(); verbSend.gain.value = 0.9; verbSend.connect(verb); verb.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    ambBus = ac.createGain(); ambBus.gain.value = 0.55; ambBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.75; sfxBus.connect(master);
    const ms = ac.createGain(); ms.gain.value = 0.35; musicBus.connect(ms); ms.connect(verbSend);
    const ss = ac.createGain(); ss.gain.value = 0.18; sfxBus.connect(ss); ss.connect(verbSend);
    NOISE = noiseBuf(3);
    started = true;
    setInterval(tick, 60);
    if (pendingMood) mood(pendingMood);
    if (pendingAmb) ambience(pendingAmb);
  }

  /* ---------------- instruments ---------------- */
  function pluckBuf(midi, bright) {
    const key = midi + ':' + bright;
    if (PL[key]) return PL[key];
    const sr = ac.sampleRate, f = mtof(midi), n = Math.floor(sr * 2.6), per = Math.max(2, Math.round(sr / f));
    const b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), buf = new Float32Array(per);
    for (let i = 0; i < per; i++) buf[i] = Math.random() * 2 - 1;
    for (let k = 0; k < 2 - bright; k++) for (let i = 0; i < per; i++) buf[i] = (buf[i] + buf[(i + 1) % per]) * 0.5;
    const damp = 0.4985 + bright * 0.0012;
    for (let i = 0; i < n; i++) { const j = i % per; d[i] = buf[j]; buf[j] = damp * (buf[j] + buf[(j + 1) % per]); }
    for (let i = 0; i < 80; i++) d[i] *= i / 80;
    return (PL[key] = b);
  }
  function pluck(midi, t, vel = 0.5, bright = 1, bus = musicBus, pan = 0) {
    const s = ac.createBufferSource(); s.buffer = pluckBuf(midi, bright);
    s.playbackRate.value = 1 + rand(-0.002, 0.002);
    const g = ac.createGain(); g.gain.value = vel;
    const p = ac.createStereoPanner(); p.pan.value = pan;
    s.connect(g); g.connect(p); p.connect(bus); s.start(t); s.stop(t + 2.6);
  }
  function flute(midi, t, dur, vel = 0.12) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = o2.frequency.value = mtof(midi);
    const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5.2; vg.gain.value = mtof(midi) * 0.006;
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const g2 = ac.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(lp);
    o.connect(lp); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(g); g.connect(musicBus);
    const br = ac.createBufferSource(); br.buffer = NOISE; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = mtof(midi) * 2; bp.Q.value = 6;
    const bg = ac.createGain(); bg.gain.value = 0.05; br.connect(bp); bp.connect(bg); bg.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.09); g.gain.setValueAtTime(vel, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    [o, o2, vib, br].forEach(x => { x.start(t); x.stop(t + dur + 0.05); });
  }
  function pad(midis, t, dur, vel = 0.03, bright = 900) {
    const g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bright; lp.connect(g); g.connect(musicBus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    midis.forEach(m => [-4, 4].forEach(det => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); }));
  }
  function drum(t, vel = 0.4, pitch = 70) {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(pitch * 1.6, t); o.frequency.exponentialRampToValueAtTime(pitch * 0.7, t + 0.25);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.5);
    const n = ac.createBufferSource(); n.buffer = NOISE; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ac.createGain(); ng.gain.setValueAtTime(vel * 0.4, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(lp); lp.connect(ng); ng.connect(musicBus); n.start(t, rand(0, 2)); n.stop(t + 0.1);
  }
  // A held drone (hurdy-gurdy-ish): crossfades when the mood's root changes.
  let droneNode = null;
  function drone(root, level) {
    const t = ac.currentTime;
    if (droneNode) { const d = droneNode; d.g.gain.cancelScheduledValues(t); d.g.gain.setTargetAtTime(0, t, 0.8); setTimeout(() => d.os.forEach(o => o.stop()), 4000); droneNode = null; }
    if (!level) return;
    const g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 2;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 180; lfo.connect(lg); lg.connect(lp.frequency);
    const os = [root - 24, root - 17, root - 12].map((m, i) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = (i - 1) * 5; o.connect(lp); o.start(); return o; });
    os.push(lfo); lfo.start(); lp.connect(g); g.connect(musicBus); g.gain.value = 0; g.gain.setTargetAtTime(level, t, 1.2);
    droneNode = { g, os };
  }

  /* ---------------- more instruments ---------------- */
  // Bowed strings: a fiddle (or a cello an octave down). Two detuned saws through a body filter, with
  // vibrato that only arrives once the note has settled, and an optional tremolo for tense scenes.
  function bowed(midi, t, dur, vel = 0.05, { low = false, trem = 0 } = {}) {
    const f = mtof(midi), g = ac.createGain(), lp = ac.createBiquadFilter(), body = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = low ? 900 : 2600; body.type = 'peaking'; body.frequency.value = low ? 260 : 620; body.gain.value = 6; body.Q.value = 1.2;
    const os = [-6, 6].map(d => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); return o; });
    const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5.4; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.4, dur * 0.5));
    vib.connect(vg); os.forEach(o => vg.connect(o.frequency));
    lp.connect(body); body.connect(g); g.connect(musicBus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.12); g.gain.setValueAtTime(vel, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
    if (trem) { const tl = ac.createOscillator(), tg = ac.createGain(); tl.frequency.value = trem; tg.gain.value = vel * 0.6; tl.connect(tg); tg.connect(g.gain); tl.start(t); tl.stop(t + dur + 0.1); }
    [...os, vib].forEach(o => { o.start(t); o.stop(t + dur + 0.1); });
  }
  // A horn: a saw whose filter swells open, like a breath into brass.
  function horn(midi, t, dur, vel = 0.06) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = o2.frequency.value = mtof(midi); o2.detune.value = 4;
    lp.type = 'lowpass'; lp.Q.value = 1.5; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.25); lp.frequency.linearRampToValueAtTime(800, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(musicBus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.18); g.gain.setValueAtTime(vel * 0.85, t + dur * 0.75); g.gain.linearRampToValueAtTime(0, t + dur);
    [o, o2].forEach(x => { x.start(t); x.stop(t + dur + 0.05); });
  }
  // A choir 'aah': detuned saws through two vowel formants.
  function choir(midis, t, dur, vel = 0.02) {
    const g = ac.createGain(); g.connect(musicBus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur);
    for (const f0 of [800, 1150]) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0; bp.Q.value = 6; bp.connect(g);
      midis.forEach(m => [-9, 0, 9].forEach(d => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d + rand(-3, 3); o.connect(bp); o.start(t); o.stop(t + dur + 0.05); }));
    }
  }
  // Bells: FM sines, bright attack and a long shimmering decay.
  function bell(midi, t, vel = 0.08, pan = 0) {
    const f = mtof(midi), c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain(), p = ac.createStereoPanner();
    c.frequency.value = f; m.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 2.5);
    m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(p); p.pan.value = pan; p.connect(musicBus);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2);
    [c, m].forEach(o => { o.start(t); o.stop(t + 3.3); });
  }
  // A shawm: nasal, reedy double-reed pipe for bright outdoor tunes.
  function shawm(midi, t, dur, vel = 0.04) {
    const o = ac.createOscillator(), bp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = mtof(midi);
    const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 6; vg.gain.value = mtof(midi) * 0.005; vib.connect(vg); vg.connect(o.frequency);
    bp.type = 'peaking'; bp.frequency.value = 1300; bp.gain.value = 8; lp.type = 'lowpass'; lp.frequency.value = 3200;
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(musicBus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.04); g.gain.setValueAtTime(vel, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
    [o, vib].forEach(x => { x.start(t); x.stop(t + dur + 0.05); });
  }
  // A small chamber organ: stacked sine harmonics, for the hymns.
  function organ(midis, t, dur, vel = 0.018) {
    const g = ac.createGain(); g.connect(musicBus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.3); g.gain.setValueAtTime(vel, t + dur - 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    midis.forEach(m => [[1, 1], [2, .5], [3, .25], [4, .15]].forEach(([h, a]) => { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = mtof(m) * h; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05); }));
  }
  function deepDrum(t, vel = 0.5) {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 1.2);
  }
  function tabor(t, vel = 0.25) {
    const n = ac.createBufferSource(); n.buffer = NOISE; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); n.connect(bp); bp.connect(g); g.connect(musicBus); n.start(t, rand(0, 2)); n.stop(t + 0.15);
    const o = ac.createOscillator(), og = ac.createGain(); o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    og.gain.setValueAtTime(vel * 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(og); og.connect(musicBus); o.start(t); o.stop(t + 0.2);
  }

  /* ---------------- composer ---------------- */
  // Each mood is its own small ensemble: which instrument carries the tune (it can alternate by
  // phrase), what accompanies it, the bass, the percussion pattern, and the harmony bed.
  const SC = { dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10] };
  const MOODS = {
    // the open road: lute and recorder, fiddle answering every other phrase, a light frame drum
    road:    { root: 50, scale: 'dorian', bpm: 86, chords: [0, 6, 3, 0, 0, 6, 4, 0], arp: 'lute', lead: ['flute', 'fiddle'], bass: 'pluck', drums: { frame: [0, 2] }, drone: 0.018 },
    // danger: tremolo low strings, a slow horn, deep drums; no lute at all
    tension: { root: 45, scale: 'phrygian', bpm: 64, chords: [0, 1, 0, 6], arp: 'trem', lead: ['horn'], bass: 'cello', drums: { deep: [0, 1.5] }, pad: 'choirLow', drone: 0.035 },
    // holy, uncanny places: bells and a far choir, no rhythm
    eerie:   { root: 52, scale: 'lydian', bpm: 52, chords: [0, 1, 0, 4], arp: null, lead: ['bells'], bass: null, drums: {}, pad: 'choir', drone: 0.025 },
    // mist and the unknown: choir and low drone only, bells very sparse
    mist:    { root: 47, scale: 'aeolian', bpm: 46, chords: [0, 5, 3, 4], arp: null, lead: ['bellsSparse'], bass: 'cello', drums: {}, pad: 'choir', drone: 0.03 },
    // high places: horn calls over a cello drone and a slow deep drum
    peak:    { root: 48, scale: 'dorian', bpm: 70, chords: [0, 3, 6, 0], arp: 'harpSlow', lead: ['horn'], bass: 'cello', drums: { deep: [0] }, drone: 0.03 },
    // home: fingerpicked lute, a cello underneath, a slow fiddle tune
    home:    { root: 53, scale: 'major', bpm: 70, chords: [0, 3, 4, 0, 5, 3, 4, 0], arp: 'lute', lead: ['fiddle', 'flute'], bass: 'cello', drums: {}, drone: 0.0 },
    // bright daytime country: shawm and tabor, quick lute
    day:     { root: 55, scale: 'mixo', bpm: 104, chords: [0, 6, 3, 0], arp: 'luteFast', lead: ['shawm'], bass: 'pluck', drums: { tabor: [0, 1, 2, 2.5, 3] }, drone: 0.0 },
    // a market night: a quick fiddle dance with tabor and frame drum
    tavern:  { root: 50, scale: 'major', bpm: 122, chords: [0, 4, 0, 3, 0, 4, 5, 0], arp: 'luteFast', lead: ['fiddleFast'], bass: 'pluck', drums: { tabor: [0, 1, 2, 3], frame: [0, 2] }, drone: 0.0 },
    // pilgrims and chapels: organ and choir, a bell at each phrase
    hymn:    { root: 53, scale: 'major', bpm: 58, chords: [0, 3, 4, 0, 5, 1, 4, 0], arp: null, lead: ['choirLead'], bass: null, drums: {}, pad: 'organ', bellEvery: 4, drone: 0.0 },
    // the Fens: a lonely fiddle over a cello drone and a slow harp
    fen:     { root: 45, scale: 'aeolian', bpm: 60, chords: [0, 5, 6, 4], arp: 'harpSlow', lead: ['fiddle'], bass: 'cello', drums: {}, drone: 0.02 },
  };
  let cur = null, pendingMood = null, nextBar = 0, bar = 0, phrase = [], lastMoodName = null;
  function mood(name) {
    if (!started) { pendingMood = name; return; }
    if (name === 'victory' || name === 'defeat') { sting(name); drone(0, 0); cur = null; lastMoodName = name; return; }
    if (name === lastMoodName || !MOODS[name]) return;
    lastMoodName = name; const m = MOODS[name];
    const was = cur; cur = m; bar = 0; phrase = makePhrase(m, m.lead[0]);
    if (!was || was.root !== m.root || was.drone !== m.drone) drone(m.root, m.drone);
    if (!was) nextBar = ac.currentTime + 0.2;
  }
  const LONG = { horn: 1, choirLead: 1, fiddle: 1, bellsSparse: 1 };
  function makePhrase(m, lead) {
    // A 4-bar phrase on scale steps: a random walk that leans back toward chord tones.
    // Long-voiced instruments (horn, choir, fiddle) get fewer, longer notes.
    const ph = []; let deg = pick([4, 2, 0, 7]);
    for (let b = 0; b < 4; b++) {
      const notes = [];
      const slots = LONG[lead] ? (lead === 'bellsSparse' ? [0] : pick([[0, 2], [0], [0, 1, 2]]))
        : lead === 'bells' ? [0, 1.5, 2.5] : lead === 'fiddleFast' ? [0, .5, 1, 1.5, 2, 3] : pick([[0, 1, 2], [0, 1.5, 2, 3], [0, 2, 3], [0, .5, 1, 2]]);
      slots.forEach((s, k) => { deg += pick([-2, -1, -1, 1, 1, 2, 0]); deg = Math.max(-2, Math.min(9, deg));
        const len = (slots[k + 1] ?? 4) - s; if (Math.random() < 0.88) notes.push([s, deg, len]); });
      if (b === 3 && !LONG[lead]) notes.push([3, pick([0, 4]), 1]);
      ph.push(notes);
    }
    return ph;
  }
  const degToMidi = (m, deg, oct = 0) => { const s = SC[m.scale]; const o = Math.floor(deg / s.length); return m.root + s[((deg % s.length) + s.length) % s.length] + 12 * (o + oct); };
  function tick() {
    if (!cur || muted) return;
    const m = cur, beat = 60 / m.bpm;
    while (nextBar < ac.currentTime + 0.3) {
      const t0 = nextBar, ch = m.chords[bar % m.chords.length];
      const triad = [degToMidi(m, ch, -1), degToMidi(m, ch + 2, -1), degToMidi(m, ch + 4, -1)];
      // accompaniment
      if (m.arp === 'lute') [0, 2, 4, 2].forEach((iv, k) => pluck(degToMidi(m, ch + iv, -1), t0 + k * beat + rand(0, 0.015), 0.26, 0, musicBus, -0.25));
      if (m.arp === 'luteFast') [0, 4, 2, 4, 0, 4, 2, 4].forEach((iv, k) => pluck(degToMidi(m, ch + iv, -1), t0 + k * beat / 2, k % 2 ? 0.16 : 0.24, 0, musicBus, -0.2));
      if (m.arp === 'harpSlow') [0, 4, 7, 9].forEach((iv, k) => pluck(degToMidi(m, ch + iv, 0), t0 + k * beat * 0.75 + rand(0, 0.02), 0.16, 1, musicBus, 0.3));
      if (m.arp === 'trem') bowed(degToMidi(m, ch, -1), t0, beat * 4, 0.03, { low: true, trem: 7 });
      // bass
      if (m.bass === 'cello') bowed(degToMidi(m, ch, -2), t0, beat * 4, 0.035, { low: true });
      if (m.bass === 'pluck' && bar % 2 === 0) pluck(degToMidi(m, ch, -2), t0, 0.32, 0, musicBus, 0);
      // harmony bed
      if (m.pad === 'choir') choir(triad.map(x => x + 12), t0, beat * 4.2, 0.012);
      if (m.pad === 'choirLow') choir(triad, t0, beat * 4.2, 0.012);
      if (m.pad === 'organ') organ(triad.map(x => x + 12), t0, beat * 4, 0.014);
      if (m.bellEvery && bar % m.bellEvery === 0) bell(degToMidi(m, ch, 1), t0, 0.05, rand(-0.4, 0.4));
      // percussion
      for (const [k, pat] of Object.entries(m.drums || {})) pat.forEach(b => {
        const t = t0 + b * beat;
        if (k === 'frame') drum(t, b === 0 ? 0.3 : 0.16, 75); if (k === 'deep') deepDrum(t, b === 0 ? 0.45 : 0.25); if (k === 'tabor') tabor(t, b % 1 ? 0.12 : 0.2);
      });
      // melody: phrase A twice, then a fresh phrase, often with a different instrument; every 4th phrase rests
      const phraseN = Math.floor(bar / 4), lead = m.lead[phraseN % m.lead.length];
      if (bar % 4 === 0 && phraseN > 0 && (phraseN % 2 === 0 || m.lead.length > 1)) phrase = makePhrase(m, lead);
      if (phraseN % 4 !== 3) for (const [s, deg, len] of phrase[bar % 4]) {
        const t = t0 + s * beat, d = Math.max(0.3, len * beat * 0.95), n = degToMidi(m, ch + deg, 1);
        if (lead === 'flute') flute(n, t, Math.min(d, beat * 1.2), 0.07);
        else if (lead === 'fiddle') bowed(n, t, d, 0.04);
        else if (lead === 'fiddleFast') bowed(n, t, Math.min(d, beat * 0.6), 0.035);
        else if (lead === 'horn') horn(n - 12, t, d, 0.05);
        else if (lead === 'shawm') shawm(n, t, Math.min(d, beat * 0.9), 0.035);
        else if (lead === 'choirLead') choir([n], t, d, 0.02);
        else if (lead === 'bells' || lead === 'bellsSparse') bell(n + 12, t, 0.06, rand(-0.5, 0.5));
      }
      nextBar += beat * 4; bar++;
    }
  }
  function sting(kind) {
    const t = ac.currentTime + 0.05;
    const notes = kind === 'victory' ? [53, 57, 60, 65, 69, 72] : [50, 53, 57, 56, 50];
    notes.forEach((n, i) => pluck(n, t + i * (kind === 'victory' ? 0.11 : 0.32), 0.45, 1));
    pad(kind === 'victory' ? [53, 57, 60, 65] : [38, 45, 50, 53], t, 6, 0.05, kind === 'victory' ? 1600 : 600);
    if (kind === 'victory') { horn(65, t + 0.7, 2.6, 0.06); bell(77, t + 1.2, 0.07); } else { bowed(38, t, 5, 0.04, { low: true }); choir([50, 53, 57], t + 0.5, 4, 0.018); }
  }

  /* ---------------- ambience ---------------- */
  const AMB = {}; let pendingAmb = null;
  function noiseLoop(filterType, freq, q, level, lfoRate = 0.1, lfoDepth = 0.5) {
    const s = ac.createBufferSource(); s.buffer = NOISE; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = lfoRate; lg.gain.value = level * lfoDepth;
    const base = ac.createGain(); base.gain.value = 1;
    lfo.connect(lg); s.connect(f); f.connect(g); g.connect(ambBus); s.start(0, rand(0, 2)); lfo.start();
    const amp = ac.createGain(); // lfo modulates gain around the level
    lg.connect(g.gain);
    return { stop: () => { [s, lfo].forEach(x => x.stop()); }, g, level };
  }
  const MAKE = {
    wind: () => noiseLoop('bandpass', 420, 0.7, 0.16, 0.07, 0.6),
    gale: () => noiseLoop('bandpass', 650, 0.5, 0.26, 0.11, 0.7),
    water: () => noiseLoop('lowpass', 380, 0.8, 0.12, 0.25, 0.5),
    waterfall: () => noiseLoop('bandpass', 1300, 0.4, 0.14, 0.03, 0.2),
    hum: () => { const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 110; o2.frequency.value = 110.7 * 1.5; o.type = 'sine'; o2.type = 'sine';
      o.connect(g); o2.connect(g); g.connect(ambBus); g.gain.value = 0; o.start(); o2.start(); return { stop: () => { o.stop(); o2.stop(); }, g, level: 0.03 }; },
    crickets: () => timerAmb(() => { const t = ac.currentTime; for (let i = 0; i < 3; i++) chirp(t + i * 0.06, rand(4200, 4800), 0.012); }, 380, 900),
    fire: () => timerAmb(() => crackle(), 60, 260),
    birds: () => timerAmb(() => bird(), 1400, 4200),
    drips: () => timerAmb(() => { const t = ac.currentTime; const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(rand(1400, 2400), t); o.frequency.exponentialRampToValueAtTime(rand(500, 900), t + 0.12);
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.2); o.connect(g); g.connect(ambBus); g.connect(verbSend); o.start(t); o.stop(t + 0.25); }, 700, 2600),
    murmur: () => noiseLoop('bandpass', 260, 1.5, 0.05, 0.4, 0.8),
  };
  function timerAmb(fn, lo, hi) {
    let on = true; const g = ac.createGain(); g.gain.value = 1;
    (function loop() { if (!on) return; if (!muted) fn(); setTimeout(loop, rand(lo, hi)); })();
    return { stop: () => { on = false; }, g: null };
  }
  function chirp(t, f, v) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.linearRampToValueAtTime(0, t + 0.04); o.connect(g); g.connect(ambBus); o.start(t); o.stop(t + 0.05); }
  function crackle() { const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = NOISE; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = rand(1500, 4000);
    const g = ac.createGain(); const v = rand(0.02, 0.09); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + rand(0.01, 0.04)); s.connect(f); f.connect(g); g.connect(ambBus); s.start(t, rand(0, 2.5)); s.stop(t + 0.05); }
  function bird() { const t = ac.currentTime, n = Math.floor(rand(2, 5)), base = rand(2400, 3600);
    for (let i = 0; i < n; i++) { const o = ac.createOscillator(), g = ac.createGain(), tt = t + i * rand(0.08, 0.14);
      o.frequency.setValueAtTime(base * rand(0.9, 1.1), tt); o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.5), tt + 0.06);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.025, tt + 0.01); g.gain.linearRampToValueAtTime(0, tt + 0.07); o.connect(g); g.connect(ambBus); o.start(tt); o.stop(tt + 0.08); } }
  function ambience(list) {
    if (!started) { pendingAmb = list; return; }
    for (const k in AMB) if (!list.includes(k)) { const a = AMB[k]; if (a.g) { a.g.gain.setTargetAtTime(0, ac.currentTime, 0.6); setTimeout(() => a.stop(), 2500); } else a.stop(); delete AMB[k]; }
    for (const k of list) if (!AMB[k] && MAKE[k]) { const a = MAKE[k](); if (a.g) a.g.gain.setTargetAtTime(a.level, ac.currentTime, 0.8); AMB[k] = a; }
  }

  /* ---------------- sound effects ---------------- */
  function env(node, t, a, peak, d) { node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0005, t + a + d); }
  function tone(f, t, dur, v, type = 'sine', to) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(g, t, 0.005, v, dur); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05); return g; }
  function burst(t, dur, v, type, freq, q = 1) { const s = ac.createBufferSource(); s.buffer = NOISE; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); env(g, t, 0.004, v, dur); s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t, rand(0, 2.5)); s.stop(t + dur + 0.05); }
  const SFX = {
    click: t => { tone(310, t, 0.07, 0.25, 'triangle', 180); burst(t, 0.03, 0.15, 'bandpass', 2200, 2); },
    hover: t => tone(1800, t, 0.03, 0.02),
    page: t => { burst(t, 0.18, 0.06, 'bandpass', 3000, 0.8); burst(t + 0.09, 0.22, 0.05, 'bandpass', 2200, 0.8); },
    step: t => burst(t, 0.06, 0.05, 'lowpass', 420, 1),
    coin: t => { [0, 0.07, 0.15, 0.21].forEach((d, i) => { tone(2600 + i * 310, t + d, 0.35, 0.07); tone(2600 * 2.76 + i * 200, t + d, 0.15, 0.03); }); },
    clash: t => { burst(t, 0.12, 0.5, 'highpass', 2500); [1250, 2710, 3980].forEach(f => tone(f, t, 0.9, 0.08, 'sine')); tone(90, t, 0.25, 0.3, 'sine', 50); },
    ward: t => { [0, 4, 7, 11, 14, 19].forEach((iv, i) => pluck(74 + iv, t + i * 0.07, 0.25, 1, sfxBus, rand(-0.6, 0.6))); pad([62, 69, 74, 78], t, 3, 0.04, 2400); },
    gallop: t => { for (let i = 0; i < 14; i++) { const tt = t + i * 0.13 + (i % 2) * 0.05; burst(tt, 0.07, 0.3 * (1 - i / 16), 'lowpass', 300, 1); } },
    stone: t => { tone(70, t, 0.4, 0.5, 'sine', 40); burst(t, 0.35, 0.25, 'lowpass', 900, 0.7); burst(t + 0.05, 0.4, 0.1, 'bandpass', 2400, 1.2); },
    build: t => { for (let i = 0; i < 6; i++) { const tt = t + i * 0.26; tone(520 + (i % 2) * 90, tt, 0.12, 0.22, 'triangle', 300); burst(tt, 0.04, 0.2, 'bandpass', 1800, 2); } SFX.stone(t + 1.6); },
    whoosh: t => { const s = ac.createBufferSource(); s.buffer = NOISE; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
      const g = ac.createGain(); env(g, t, 0.2, 0.25, 0.5); s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 0.8); },
    rain: t => { const s = ac.createBufferSource(); s.buffer = NOISE; s.loop = true; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800; const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 1); g.gain.linearRampToValueAtTime(0, t + 5); s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 5.2); },
    fire: t => { for (let i = 0; i < 40; i++) setTimeout(crackle, i * 40); burst(t, 1.2, 0.12, 'lowpass', 600, 0.5); },
    gain: t => { [0, 0.06, 0.12].forEach((d, i) => tone([1568, 1976, 2349][i], t + d, 0.4, 0.09)); },
    loss: t => { tone(330, t, 0.3, 0.12, 'triangle', 220); tone(247, t + 0.12, 0.5, 0.1, 'triangle', 165); },
    loyalUp: t => { pluck(76, t, 0.3, 1, sfxBus); pluck(81, t + 0.12, 0.3, 1, sfxBus); },
    loyalDown: t => { pluck(69, t, 0.3, 0, sfxBus); pluck(65, t + 0.16, 0.3, 0, sfxBus); },
    depart: t => { [62, 60, 57, 53].forEach((n, i) => pluck(n, t + i * 0.35, 0.3, 0, sfxBus)); },
    hurt: t => { tone(180, t, 0.25, 0.25, 'sawtooth', 90); burst(t, 0.1, 0.2, 'lowpass', 800); },
    rumble: t => { for (let i = 0; i < 6; i++) burst(t + i * 0.25, 0.3, 0.25, 'lowpass', 160, 0.8); },
    prayer: t => { pad([64, 71, 76, 80], t, 4, 0.05, 1800); [88, 91, 95].forEach((n, i) => pluck(n, t + 0.4 + i * 0.3, 0.15, 1, sfxBus)); },
    snow: t => { const s = ac.createBufferSource(); s.buffer = NOISE; s.loop = true; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6; const g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 3); s.connect(f); f.connect(g); g.connect(ambBus); s.start(t); },
  };
  function sfx(name) { if (!started || muted || !SFX[name]) return; SFX[name](ac.currentTime + 0.01); }
  function toggle() { if (!started) return false; muted = !muted; master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.1); return muted; }
  window.Audio2 = { start, mood, ambience, sfx, toggle, get muted() { return muted; }, get started() { return started; } };
})();
