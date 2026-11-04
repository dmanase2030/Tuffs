/* ============================================================
   Sound: hiệu ứng âm thanh sinh bằng Web Audio API (không cần file)
   Dùng: Sound.play("place" | "capture" | "win" | "lose" | "draw"
                     | "error" | "select" | "rotate" | "shot" | "miss"
                     | "explode" | "flip" | "score" | "powerup" | "drop" | "coin" | "react")
   ============================================================ */
window.Sound = (function () {
  let ctxAudio = null;
  let enabled = true;
  let masterVol = 0.8;
  let musicOn = false;
  let musicTimer = null;
  let musicStep = 0;

  // Khôi phục lựa chọn từ lần trước
  try {
    const saved = localStorage.getItem("tpg_sound");
    if (saved !== null) enabled = saved === "1";
    const v = localStorage.getItem("tpg_volume");
    if (v !== null) masterVol = Math.max(0, Math.min(1, parseFloat(v) || 0.8));
    musicOn = localStorage.getItem("tpg_music") === "1";
  } catch (e) { /* ignore */ }

  function ac() {
    if (!ctxAudio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctxAudio = new AC();
    }
    // một số trình duyệt khóa audio cho tới khi có tương tác người dùng
    if (ctxAudio.state === "suspended") ctxAudio.resume();
    return ctxAudio;
  }

  // Phát một nốt: tần số, thời lượng, dạng sóng, âm lượng
  function tone(freq, dur, type = "sine", vol = 0.2, startAt = 0) {
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime + startAt;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    const v = Math.max(0.0001, vol * masterVol);
    // bao âm: lên nhanh, tắt dần -> nghe "mượt", tránh tiếng "tách"
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Tiếng "nhiễu" ngắn cho hiệu ứng va chạm/nước (dùng buffer ngẫu nhiên)
  function noise(dur, vol = 0.15, startAt = 0, filterFreq = 1000) {
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime + startAt;
    const len = Math.floor(a.sampleRate * dur);
    const buffer = a.createBuffer(1, len, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buffer;
    const filter = a.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = a.createGain();
    gain.gain.setValueAtTime(vol * masterVol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(t0);
    src.stop(t0 + dur);
  }

  const EFFECTS = {
    place()   { tone(440, 0.08, "triangle", 0.18); },
    select()  { tone(660, 0.05, "sine", 0.12); },
    capture() { tone(330, 0.1, "square", 0.14); tone(220, 0.12, "square", 0.12, 0.05); },
    rotate()  { tone(300, 0.06, "sawtooth", 0.1); tone(420, 0.08, "sawtooth", 0.1, 0.06); },
    shot()    { noise(0.18, 0.22, 0, 800); tone(160, 0.12, "square", 0.12); },
    miss()    { noise(0.25, 0.12, 0, 500); },
    error()   { tone(180, 0.18, "sawtooth", 0.16); },
    win()     { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.2, i * 0.1)); },
    lose()    { [392, 330, 262].forEach((f, i) => tone(f, 0.22, "sine", 0.18, i * 0.12)); },
    draw()    { tone(440, 0.15, "sine", 0.15); tone(440, 0.15, "sine", 0.12, 0.16); },
    notify()  { tone(880, 0.08, "sine", 0.16); tone(1175, 0.1, "sine", 0.16, 0.09); },
    // Hiệu ứng riêng phong phú hơn
    explode() {
      noise(0.45, 0.32, 0, 380);
      tone(90, 0.35, "sawtooth", 0.22);
      tone(60, 0.5, "sine", 0.18, 0.02);
      noise(0.18, 0.18, 0.04, 1600);
    },
    flip()    { tone(520, 0.05, "sine", 0.10); tone(760, 0.06, "triangle", 0.12, 0.05); },
    score()   { [784, 1047, 1319].forEach((f, i) => tone(f, 0.12, "triangle", 0.16, i * 0.06)); },
    powerup() { [440, 587, 740, 988].forEach((f, i) => tone(f, 0.1, "square", 0.12, i * 0.05)); },
    drop()    { tone(300, 0.05, "sine", 0.12); tone(180, 0.12, "triangle", 0.16, 0.05); noise(0.06, 0.08, 0.04, 1200); },
    coin()    { tone(988, 0.07, "square", 0.12); tone(1319, 0.1, "square", 0.12, 0.06); },
    react()   { tone(700, 0.05, "sine", 0.12); tone(1050, 0.07, "sine", 0.1, 0.04); },
  };

  function play(name) {
    if (!enabled) return;
    const fn = EFFECTS[name];
    if (fn) { try { fn(); } catch (e) { /* ignore */ } }
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem("tpg_sound", enabled ? "1" : "0"); } catch (e) { /* ignore */ }
    if (enabled) play("select");
  }

  function isEnabled() { return enabled; }

  // ----- Âm lượng tổng -----
  function setVolume(v) {
    masterVol = Math.max(0, Math.min(1, Number(v) || 0));
    try { localStorage.setItem("tpg_volume", String(masterVol)); } catch (e) { /* ignore */ }
  }
  function getVolume() { return masterVol; }

  // ----- Nhạc nền sinh tự động (pad ngũ cung nhẹ nhàng) -----
  const MSCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  function musicTick() {
    if (!musicOn) return;
    const i = musicStep % MSCALE.length;
    const f = MSCALE[i];
    try {
      tone(f, 1.8, "sine", 0.05);
      if (musicStep % 4 === 0) tone(f / 2, 2.6, "triangle", 0.035);
      if (musicStep % 3 === 0) tone(f * 1.5, 1.2, "sine", 0.025, 0.4);
    } catch (e) { /* ignore */ }
    musicStep++;
  }
  function startMusic() {
    if (musicTimer) return;
    musicStep = 0;
    musicTick();
    musicTimer = setInterval(musicTick, 950);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }
  function setMusic(on) {
    musicOn = !!on;
    try { localStorage.setItem("tpg_music", musicOn ? "1" : "0"); } catch (e) { /* ignore */ }
    if (musicOn) startMusic(); else stopMusic();
  }
  function isMusicOn() { return musicOn; }

  return { play, setEnabled, isEnabled, setVolume, getVolume, setMusic, isMusicOn, startMusic, stopMusic };
})();
