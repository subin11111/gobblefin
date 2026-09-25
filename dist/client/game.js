(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const ui = {
    score: document.getElementById("score"), size: document.getElementById("size"), rank: document.getElementById("rank"),
    leaderboard: document.getElementById("leaderboardList"), missionText: document.getElementById("missionText"),
    missionProgress: document.getElementById("missionProgress"), missionCount: document.getElementById("missionCount"),
    danger: document.getElementById("dangerCallout"), best: document.getElementById("bestScore"),
    finalScore: document.getElementById("finalScore"), newBest: document.getElementById("newBest"),
    startModal: document.getElementById("startModal"), gameOverModal: document.getElementById("gameOverModal"),
    pauseModal: document.getElementById("pauseModal"), sound: document.getElementById("soundButton"),
    nickname: document.getElementById("nicknameInput"), nicknameNote: document.getElementById("nicknameNote"),
    onlinePill: document.getElementById("onlinePill"), onlineCount: document.getElementById("onlineCount"),
    defeatReason: document.getElementById("defeatReason"), coinCount: document.getElementById("coinCount"),
    shopCoinCount: document.getElementById("shopCoinCount"), shopModal: document.getElementById("shopModal"),
    skinGrid: document.getElementById("skinGrid"), coinReward: document.getElementById("coinReward"),
    liveRoster: document.getElementById("liveRoster")
  };
  const buttons = {
    start: document.getElementById("startButton"), restart: document.getElementById("restartButton"),
    pause: document.getElementById("pauseButton"), resume: document.getElementById("resumeButton"),
    randomName: document.getElementById("randomNameButton"), shop: document.getElementById("shopButton"),
    shopClose: document.getElementById("shopCloseButton")
  };

  const WORLD = { w: 3600, h: 2400 };
  const COLORS = ["#10e2d2", "#d9ff67", "#ff6b74", "#ffe15c", "#8b7cff", "#44a8ff"];
  const NAMES = ["Bubble", "Nori", "Fin Diesel", "참치왕", "물멍이", "Splash", "꼬리별", "Mango", "소금빵", "DeepBlue", "파닥몬", "Coral"];
  const NAME_FIRST = ["용감한", "배고픈", "빠른", "반짝이는", "둥실둥실", "심해의", "파란", "졸린", "통통한", "날쌘"];
  const NAME_LAST = ["멸치", "복어", "고등어", "망둥이", "해마", "참치", "가오리", "문어", "상어", "니모"];
  const SKINS = [
    { id: "butterfly", name: "청록 나비고기", species: "나비고기", price: 0, base: "#10e2d2", accent: "#d9ff67", note: "산호초의 빛을 닮은 기본 디자인" },
    { id: "clownfish", name: "산호 흰동가리", species: "흰동가리", price: 12, base: "#ff7a38", accent: "#fff4d6", note: "주황빛 몸과 또렷한 흰 줄무늬" },
    { id: "bluetang", name: "코발트 블루탱", species: "블루탱", price: 36, base: "#2474ff", accent: "#ffe15c", note: "깊은 파랑과 노란 꼬리의 대비" },
    { id: "mandarin", name: "네온 만다린", species: "만다린피시", price: 75, base: "#1fd9cc", accent: "#ff7b37", note: "청록 바탕에 흐르는 오렌지 무늬" },
    { id: "betta", name: "오로라 베타", species: "베타", price: 130, base: "#8b5cff", accent: "#38f2e2", note: "길게 펼쳐지는 보랏빛 지느러미" },
    { id: "koi", name: "달빛 비단잉어", species: "비단잉어", price: 220, base: "#f4f5e9", accent: "#ff554f", note: "달빛 흰 몸 위의 붉은 반점" }
  ];
  const MISSION_GOALS = [5, 12, 22, 36];
  const EAT_RATIO = 1.08;
  let dpr = 1, width = 0, height = 0, last = performance.now();
  let running = false, paused = false, soundOn = false, frame = 0, camera = { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1 };
  let player, prey = [], rivals = [], remotePlayers = [], treasures = [], particles = [], bubbles = [], ripples = [];
  let best = Number(localStorage.getItem("gobblefin-best") || 0);
  let coins = Number(localStorage.getItem("gobblefin-coins") || 0);
  let selectedSkin = localStorage.getItem("gobblefin-skin") || "butterfly";
  let unlockedSkins = new Set(JSON.parse(localStorage.getItem("gobblefin-unlocked-skins") || '["butterfly"]'));
  let nickname = localStorage.getItem("gobblefin-name") || "";
  let syncElapsed = 0, roundToken = 0, rewardedRound = false;
  let audioCtx = null;
  const playerId = `${crypto.randomUUID().replaceAll("-", "")}_${Date.now().toString(36)}`;
  const multiplayer = { connected: false, syncing: false, failures: 0, lastSeen: 0 };
  const input = { x: innerWidth * .72, y: innerHeight * .5, down: false, boost: false, keys: new Set() };

  ui.best.textContent = best.toLocaleString("ko-KR");
  ui.nickname.value = nickname;
  ui.coinCount.textContent = coins.toLocaleString("ko-KR");

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * t;
  }

  function cleanName(value) {
    return String(value || "").normalize("NFKC").replace(/[^\p{L}\p{N}_ -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 12);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function skinById(id) { return SKINS.find(skin => skin.id === id) || SKINS[0]; }

  function saveEconomy() {
    localStorage.setItem("gobblefin-coins", String(coins));
    localStorage.setItem("gobblefin-skin", selectedSkin);
    localStorage.setItem("gobblefin-unlocked-skins", JSON.stringify([...unlockedSkins]));
    ui.coinCount.textContent = coins.toLocaleString("ko-KR");
    ui.shopCoinCount.textContent = coins.toLocaleString("ko-KR");
  }

  function addCoins(amount) {
    coins += Math.max(0, Math.floor(amount));
    saveEconomy();
  }

  function drawSkinPreview(canvasElement, skin) {
    const preview = canvasElement.getContext("2d"), scale = Math.min(devicePixelRatio || 1, 2);
    const w = 180, h = 90; canvasElement.width = w * scale; canvasElement.height = h * scale; preview.setTransform(scale, 0, 0, scale, 0, 0);
    preview.clearRect(0, 0, w, h); preview.save(); preview.translate(92, 45);
    preview.shadowColor = skin.base; preview.shadowBlur = 18; preview.fillStyle = skin.base;
    preview.beginPath(); preview.ellipse(0, 0, 47, 27, 0, 0, Math.PI * 2); preview.fill();
    preview.fillStyle = skin.accent; preview.beginPath(); preview.moveTo(-40, 0); preview.lineTo(-67, -24); preview.lineTo(-62, 0); preview.lineTo(-67, 24); preview.closePath(); preview.fill();
    preview.shadowBlur = 0;
    if (skin.id === "clownfish") {
      preview.fillStyle = "#fff7df"; [-19, 17].forEach(x => preview.fillRect(x, -24, 9, 48));
    } else if (skin.id === "bluetang") {
      preview.strokeStyle = "#082c78"; preview.lineWidth = 9; preview.beginPath(); preview.arc(-2, -2, 27, -.9, 2.1); preview.stroke();
    } else if (skin.id === "mandarin") {
      preview.strokeStyle = skin.accent; preview.lineWidth = 5; preview.beginPath(); preview.arc(-8, 0, 22, -.8, 2.2); preview.stroke(); preview.beginPath(); preview.arc(17, 3, 12, 1.8, 5.2); preview.stroke();
    } else if (skin.id === "betta") {
      preview.globalAlpha = .72; preview.beginPath(); preview.moveTo(-24, -12); preview.quadraticCurveTo(-70, -48, -72, 0); preview.quadraticCurveTo(-62, 44, -20, 15); preview.fill(); preview.globalAlpha = 1;
    } else if (skin.id === "koi") {
      preview.fillStyle = skin.accent; [[-22,-7,13],[8,10,11],[24,-10,8]].forEach(([x,y,r]) => { preview.beginPath(); preview.arc(x,y,r,0,Math.PI*2); preview.fill(); });
    } else {
      preview.fillStyle = "rgba(2,35,42,.28)"; preview.beginPath(); preview.ellipse(-4, 9, 28, 8, 0, 0, Math.PI * 2); preview.fill();
    }
    preview.fillStyle = "#f5ffff"; preview.beginPath(); preview.arc(24, -8, 5, 0, Math.PI * 2); preview.fill();
    preview.fillStyle = "#061922"; preview.beginPath(); preview.arc(26, -8, 2.5, 0, Math.PI * 2); preview.fill(); preview.restore();
  }

  function renderShop() {
    ui.shopCoinCount.textContent = coins.toLocaleString("ko-KR");
    ui.skinGrid.innerHTML = SKINS.map(skin => {
      const unlocked = unlockedSkins.has(skin.id), selected = selectedSkin === skin.id;
      const state = selected ? "선택 중" : unlocked ? "사용하기" : coins >= skin.price ? "구매 가능" : "코인 부족";
      return `<button class="skin-card ${selected ? "is-selected" : ""}" type="button" data-skin="${skin.id}">
        <span class="skin-price">${skin.price ? `● ${skin.price}` : "기본"}</span><canvas aria-hidden="true"></canvas>
        <h3>${skin.name}</h3><p>${skin.note}</p><span class="skin-state">${state}</span></button>`;
    }).join("");
    ui.skinGrid.querySelectorAll(".skin-card").forEach(card => {
      const skin = skinById(card.dataset.skin); drawSkinPreview(card.querySelector("canvas"), skin);
      card.addEventListener("click", () => {
        if (!unlockedSkins.has(skin.id)) {
          if (coins < skin.price) { card.animate([{ transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }], { duration: 180 }); return; }
          coins -= skin.price; unlockedSkins.add(skin.id); playTone(620, .18, "triangle", .05);
        }
        selectedSkin = skin.id; saveEconomy(); renderShop();
      });
    });
  }

  function openShop() { renderShop(); ui.shopModal.classList.add("is-visible"); buttons.shopClose.focus(); }
  function closeShop() { ui.shopModal.classList.remove("is-visible"); buttons.shop.focus(); }

  function randomName() {
    return `${NAME_FIRST[Math.floor(rand(0, NAME_FIRST.length))]} ${NAME_LAST[Math.floor(rand(0, NAME_LAST.length))]}`.slice(0, 12);
  }

  function refreshNameUI() {
    const cleaned = cleanName(ui.nickname.value);
    const valid = cleaned.length >= 2;
    buttons.start.disabled = !valid;
    ui.nicknameNote.textContent = valid ? "닉네임은 같은 바다의 플레이어에게 보여요." : "두 글자 이상 입력해 주세요.";
    ui.nicknameNote.classList.toggle("is-error", ui.nickname.value.length > 0 && !valid);
    return valid ? cleaned : "";
  }

  function setConnection(state) {
    multiplayer.connected = state === "connected";
    ui.onlinePill.classList.toggle("is-connected", state === "connected");
    ui.onlinePill.classList.toggle("is-retrying", state === "retrying");
    ui.onlinePill.title = state === "connected" ? "멀티플레이 연결됨" : state === "retrying" ? "연결 재시도 중" : "멀티플레이 연결 중";
  }

  async function postJson(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function ingestPlayers(rows) {
    const previous = new Map(remotePlayers.map(fish => [fish.id, fish]));
    remotePlayers = (rows || []).filter(row => row.id !== playerId).map(row => {
      const old = previous.get(row.id);
      if (old) {
        old.targetX = Number(row.x); old.targetY = Number(row.y); old.targetAngle = Number(row.angle);
        old.targetR = Number(row.r); old.score = Number(row.score); old.name = String(row.name).slice(0, 12);
        old.skin = row.skin || "butterfly"; old.color = skinById(old.skin).base; old.accent = skinById(old.skin).accent;
        return old;
      }
      const fish = {
        id: row.id, x: Number(row.x), y: Number(row.y), targetX: Number(row.x), targetY: Number(row.y),
        r: Number(row.r), targetR: Number(row.r), angle: Number(row.angle), targetAngle: Number(row.angle), score: Number(row.score),
        name: String(row.name).slice(0, 12), skin: row.skin || "butterfly", color: skinById(row.skin).base, accent: skinById(row.skin).accent, alive: true,
        live: true, trail: [], wobble: rand(0, 8)
      };
      for (let i = 0; i < 28; i++) fish.trail.push({ x: fish.x - Math.cos(fish.angle) * i * 3, y: fish.y - Math.sin(fish.angle) * i * 3 });
      return fish;
    });
    ui.onlineCount.textContent = String(remotePlayers.length + 1);
    ui.liveRoster.innerHTML = `<strong>접속 중</strong> · ${[nickname, ...remotePlayers.map(fish => fish.name)].map(escapeHtml).join(" · ")}`;
  }

  async function joinRoom(token) {
    setConnection("connecting");
    try {
      const data = await postJson("/api/room/join", {
        id: playerId, name: nickname, x: player.x, y: player.y, color: player.color, skin: player.skin
      });
      if (token !== roundToken) return;
      multiplayer.failures = 0; multiplayer.lastSeen = performance.now(); setConnection("connected"); ingestPlayers(data.players);
    } catch (_) {
      if (token !== roundToken) return;
      multiplayer.failures += 1; setConnection("retrying");
    }
  }

  async function syncRoom(token) {
    if (multiplayer.syncing || !running || !player?.alive) return;
    multiplayer.syncing = true;
    try {
      const data = await postJson("/api/room/state", {
        id: playerId, x: player.x, y: player.y, angle: player.angle, score: player.score
      });
      if (token !== roundToken) return;
      multiplayer.failures = 0; multiplayer.lastSeen = performance.now(); setConnection("connected"); ingestPlayers(data.players);
      if (!data.alive) defeat(data.eatenBy || "다른 플레이어");
      else if (Number(data.score) > player.score) { player.score = Number(data.score); grow(player); playTone(560, .16, "triangle", .055); }
    } catch (error) {
      if (token !== roundToken) return;
      multiplayer.failures += 1; setConnection("retrying");
      if (String(error.message).includes("join_required") || multiplayer.failures % 5 === 0) joinRoom(token);
    } finally {
      multiplayer.syncing = false;
    }
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function newPrey(x = rand(80, WORLD.w - 80), y = rand(80, WORLD.h - 80), options = {}) {
    const rare = options.rare ?? Math.random() < .08;
    return {
      x, y, r: options.r ?? (rare ? rand(10, 14) : rand(5, 10)), angle: options.angle ?? rand(0, Math.PI * 2),
      speed: options.speed ?? rand(15, 38), phase: rand(0, 10), color: options.color || (rare ? "#d9ff67" : COLORS[Math.floor(rand(0, 4))]),
      value: options.value ?? (rare ? 4 : 1), alive: true, dropped: Boolean(options.dropped),
      burstVx: options.burstVx || 0, burstVy: options.burstVy || 0, dropDelay: options.dropDelay || 0
    };
  }

  function newTreasure() {
    return { x: rand(120, WORLD.w - 120), y: rand(120, WORLD.h - 120), value: Math.floor(rand(3, 9)), phase: rand(0, 10), active: true, respawn: 0 };
  }

  function newRival(index, options = {}) {
    const reference = player?.r || 20;
    const roll = Math.random();
    let r = options.starterPrey
      ? rand(12.5, 16.8)
      : roll < .46
        ? clamp(rand(reference * .58, reference * .82), 12, 70)
        : roll < .72
          ? clamp(rand(reference * .9, reference * 1.08), 17, 78)
          : clamp(rand(reference * 1.18, reference * 1.62), 23, 84);
    const score = Math.max(0, Math.round((r - 20) / .22));
    const sizeOffset = r - (20 + score * .22);
    const edge = index % 4;
    let x = edge < 2 ? rand(140, WORLD.w - 140) : (edge === 2 ? 150 : WORLD.w - 150);
    let y = edge >= 2 ? rand(140, WORLD.h - 140) : (edge === 0 ? 150 : WORLD.h - 150);
    if (options.nearPlayer && player) {
      const angle = rand(0, Math.PI * 2), range = rand(250, 510);
      x = clamp(player.x + Math.cos(angle) * range, 100, WORLD.w - 100);
      y = clamp(player.y + Math.sin(angle) * range, 100, WORLD.h - 100);
    }
    return {
      x, y,
      r, angle: rand(0, Math.PI * 2), targetAngle: rand(0, Math.PI * 2), speed: rand(54, 82),
      color: COLORS[(index + 2) % COLORS.length], accent: COLORS[(index + 4) % COLORS.length],
      score, sizeOffset, name: NAMES[index % NAMES.length], targetR: r,
      think: rand(.3, 1.5), alive: true, wobble: rand(0, 9), trail: [], skin: "butterfly"
    };
  }

  function resetGame() {
    prey = Array.from({ length: 175 }, () => newPrey());
    treasures = Array.from({ length: 14 }, () => newTreasure());
    remotePlayers = []; particles = []; ripples = []; syncElapsed = 0; rewardedRound = false;
    const skin = skinById(selectedSkin);
    player = {
      x: WORLD.w / 2 + rand(-240, 240), y: WORLD.h / 2 + rand(-190, 190), r: 20, targetR: 20, angle: 0, targetAngle: 0, speed: 98,
      color: skin.base, accent: skin.accent, skin: skin.id, score: 0, eaten: 0, name: nickname || "나",
      alive: true, trail: [], wobble: 0, live: true
    };
    rivals = Array.from({ length: 8 }, (_, i) => newRival(i, { starterPrey: i < 3, nearPlayer: i < 3 }));
    for (let i = 0; i < 35; i++) player.trail.push({ x: player.x - i * 3, y: player.y });
    camera.x = player.x; camera.y = player.y; camera.zoom = 1;
    last = performance.now();
    updateUI(true);
  }

  function startGame() {
    const selectedName = refreshNameUI();
    if (!selectedName) { ui.nickname.focus(); return; }
    nickname = selectedName; localStorage.setItem("gobblefin-name", nickname);
    roundToken += 1;
    resetGame(); running = true; paused = false;
    ui.defeatReason.textContent = "";
    ui.startModal.classList.remove("is-visible");
    ui.gameOverModal.classList.remove("is-visible");
    ui.pauseModal.classList.remove("is-visible");
    joinRoom(roundToken);
    canvas.focus?.();
  }

  function togglePause(force) {
    if (!running || !player?.alive) return;
    paused = typeof force === "boolean" ? force : !paused;
    ui.pauseModal.classList.toggle("is-visible", paused);
    if (!paused) last = performance.now();
  }

  function playTone(freq, duration = .07, type = "sine", gain = .035) {
    if (!soundOn) return;
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(), volume = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.3, audioCtx.currentTime + duration);
    volume.gain.setValueAtTime(gain, audioCtx.currentTime);
    volume.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
    osc.connect(volume).connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
  }

  function eatPrey(hunter, fish) {
    fish.alive = false;
    hunter.score += fish.value;
    if (hunter === player) {
      player.eaten += 1; playTone(280 + Math.min(player.eaten, 20) * 14);
      burst(fish.x, fish.y, fish.color, 5 + fish.value);
      ripples.push({ x: fish.x, y: fish.y, r: 3, life: 1, color: fish.color });
    }
    grow(hunter);
  }

  function grow(fish) {
    fish.targetR = Math.min(86, 20 + Math.max(0, fish.score) * .22 + (fish.sizeOffset || 0));
    if (fish !== player && !fish.live) fish.r = fish.targetR;
  }

  function spawnRivalDrops(rival) {
    const count = Math.round(clamp(rival.r * .52, 7, 16));
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + rand(-.25, .25);
      const speed = rand(95, 185);
      prey.push(newPrey(
        clamp(rival.x + Math.cos(angle) * rand(2, rival.r * .35), 20, WORLD.w - 20),
        clamp(rival.y + Math.sin(angle) * rand(2, rival.r * .35), 20, WORLD.h - 20),
        {
          r: rand(4.8, 7.8), angle, speed: rand(28, 48),
          color: i % 3 === 0 ? rival.accent : rival.color,
          value: i % 5 === 0 ? 2 : 1, dropped: true,
          burstVx: Math.cos(angle) * speed, burstVy: Math.sin(angle) * speed,
          dropDelay: rand(.08, .2)
        }
      ));
    }
    return count;
  }

  function burst(x, y, color, amount) {
    for (let i = 0; i < amount; i++) particles.push({
      x, y, vx: rand(-65, 65), vy: rand(-65, 65), r: rand(1.5, 4), life: 1, color
    });
  }

  function defeat(byName = "큰 물고기") {
    if (!player.alive) return;
    const standings = rivals.filter(r => r.alive).concat(remotePlayers, player).sort((a, b) => b.score - a.score);
    const finalRank = standings.indexOf(player) + 1;
    const rankReward = finalRank === 1 ? 30 : finalRank === 2 ? 20 : finalRank === 3 ? 12 : 5;
    player.alive = false; running = false;
    playTone(100, .5, "sawtooth", .05);
    burst(player.x, player.y, player.color, 36);
    const score = Math.floor(player.score);
    const isBest = score > best;
    if (isBest) { best = score; localStorage.setItem("gobblefin-best", String(best)); }
    ui.finalScore.textContent = score.toLocaleString("ko-KR");
    ui.best.textContent = best.toLocaleString("ko-KR");
    ui.newBest.classList.toggle("is-visible", isBest);
    ui.defeatReason.textContent = `${byName}에게 잡혔어요`;
    if (!rewardedRound) { rewardedRound = true; addCoins(rankReward); }
    ui.coinReward.textContent = `${finalRank}위 보상  ● +${rankReward} 코인`;
    try { navigator.sendBeacon("/api/room/leave", new Blob([JSON.stringify({ id: playerId })], { type: "application/json" })); } catch (_) {}
    setTimeout(() => ui.gameOverModal.classList.add("is-visible"), 450);
  }

  function updatePlayer(dt) {
    const cx = width / 2, cy = height / 2;
    let dx = input.x - cx, dy = input.y - cy;
    if (input.keys.has("ArrowLeft") || input.keys.has("a")) dx -= 180;
    if (input.keys.has("ArrowRight") || input.keys.has("d")) dx += 180;
    if (input.keys.has("ArrowUp") || input.keys.has("w")) dy -= 180;
    if (input.keys.has("ArrowDown") || input.keys.has("s")) dy += 180;
    if (Math.hypot(dx, dy) > 12) player.targetAngle = Math.atan2(dy, dx);
    player.angle = angleLerp(player.angle, player.targetAngle, Math.min(1, dt * 5.2));
    const boosting = (input.down || input.boost) && player.score > 2;
    const speed = (player.speed + Math.max(0, 34 - player.r * .28)) * (boosting ? 1.72 : 1);
    player.x += Math.cos(player.angle) * speed * dt;
    player.y += Math.sin(player.angle) * speed * dt;
    if (boosting) { player.score = Math.max(0, player.score - dt * .8); grow(player); }
    player.r += (player.targetR - player.r) * Math.min(1, dt * 4.2);
    player.x = clamp(player.x, player.r, WORLD.w - player.r);
    player.y = clamp(player.y, player.r, WORLD.h - player.r);
    player.wobble += dt * (boosting ? 12 : 7);
    recordTrail(player, dt);
  }

  function recordTrail(fish) {
    fish.trail.unshift({ x: fish.x - Math.cos(fish.angle) * fish.r * .32, y: fish.y - Math.sin(fish.angle) * fish.r * .32 });
    const max = Math.floor(22 + fish.r * .72);
    if (fish.trail.length > max) fish.trail.length = max;
  }

  function updateRivals(dt) {
    for (const rival of rivals) {
      if (!rival.alive) continue;
      rival.think -= dt;
      if (rival.think <= 0) {
        rival.think = rand(.35, 1.2);
        let target = null, nearest = Infinity;
        for (const f of prey) {
          if (!f.alive) continue;
          const d = (f.x - rival.x) ** 2 + (f.y - rival.y) ** 2;
          if (d < nearest && d < 260000) { nearest = d; target = f; }
        }
        const pd = distance(rival, player);
        if (player.alive && rival.r > player.r * EAT_RATIO && pd < 520) target = player;
        if (player.alive && player.r > rival.r * EAT_RATIO && pd < 340) {
          rival.targetAngle = Math.atan2(rival.y - player.y, rival.x - player.x);
        } else if (target) {
          rival.targetAngle = Math.atan2(target.y - rival.y, target.x - rival.x);
        } else rival.targetAngle += rand(-1.1, 1.1);
      }
      if (rival.x < 100 || rival.x > WORLD.w - 100 || rival.y < 100 || rival.y > WORLD.h - 100) {
        rival.targetAngle = Math.atan2(WORLD.h / 2 - rival.y, WORLD.w / 2 - rival.x);
      }
      rival.angle = angleLerp(rival.angle, rival.targetAngle, Math.min(1, dt * 2.1));
      const speed = rival.speed + Math.max(0, 26 - rival.r * .2);
      rival.x = clamp(rival.x + Math.cos(rival.angle) * speed * dt, rival.r, WORLD.w - rival.r);
      rival.y = clamp(rival.y + Math.sin(rival.angle) * speed * dt, rival.r, WORLD.h - rival.r);
      rival.wobble += dt * 6; recordTrail(rival);

      for (const f of prey) if (f.alive && f.dropDelay <= 0 && rival.r > f.r * 1.4 && distance(rival, f) < rival.r * .72 + f.r) eatPrey(rival, f);
      const pd = distance(rival, player);
      if (player.alive && pd < (rival.r + player.r) * .8) {
        if (rival.r > player.r * EAT_RATIO) defeat(`${rival.name} (AI)`);
        else if (player.r > rival.r * EAT_RATIO) eatRival(rival);
      }
    }
    rivals = rivals.filter(r => r.alive);
    while (rivals.length < 8) rivals.push(newRival(Math.floor(rand(0, NAMES.length))));
  }

  function eatRival(rival) {
    rival.alive = false;
    const drops = spawnRivalDrops(rival);
    player.score += Math.max(3, Math.round(rival.r * .18));
    player.eaten += 1; grow(player);
    burst(rival.x, rival.y, rival.color, 24); ripples.push({ x: rival.x, y: rival.y, r: rival.r * .5, life: 1, color: rival.color });
    camera.shake = Math.max(camera.shake || 0, Math.min(11, 4 + drops * .45));
    playTone(430, .15, "triangle", .06); playTone(650, .11, "sine", .035);
  }

  function updatePrey(dt) {
    for (const fish of prey) {
      if (!fish.alive) continue;
      fish.phase += dt;
      fish.dropDelay = Math.max(0, fish.dropDelay - dt);
      fish.angle += Math.sin(fish.phase * 1.3) * dt * .45;
      if (fish.x < 40 || fish.x > WORLD.w - 40 || fish.y < 40 || fish.y > WORLD.h - 40) fish.angle += Math.PI * dt;
      fish.x = clamp(fish.x + (Math.cos(fish.angle) * fish.speed + fish.burstVx) * dt, 20, WORLD.w - 20);
      fish.y = clamp(fish.y + (Math.sin(fish.angle) * fish.speed + fish.burstVy) * dt, 20, WORLD.h - 20);
      fish.burstVx *= Math.max(0, 1 - dt * 4.5); fish.burstVy *= Math.max(0, 1 - dt * 4.5);
      if (fish.dropDelay <= 0 && player.alive && player.r > fish.r * 1.35 && distance(player, fish) < player.r * .82 + fish.r) eatPrey(player, fish);
    }
    const deadNatural = prey.reduce((n, f) => n + (!f.alive && !f.dropped ? 1 : 0), 0);
    prey = prey.filter(f => f.alive);
    if (deadNatural) prey.push(...Array.from({ length: deadNatural }, () => newPrey()));
  }

  function updateTreasures(dt) {
    for (const chest of treasures) {
      chest.phase += dt;
      if (!chest.active) {
        chest.respawn -= dt;
        if (chest.respawn <= 0) Object.assign(chest, newTreasure());
        continue;
      }
      if (player.alive && distance(player, chest) < player.r * .72 + 17) {
        chest.active = false; chest.respawn = rand(9, 16); addCoins(chest.value);
        burst(chest.x, chest.y, "#ffe15c", 14); ripples.push({ x: chest.x, y: chest.y, r: 12, life: 1, color: "#ffe15c" });
        playTone(740, .19, "triangle", .055);
      }
    }
  }

  function updateEffects(dt) {
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt * 1.8; });
    particles = particles.filter(p => p.life > 0);
    ripples.forEach(r => { r.r += dt * 55; r.life -= dt * 1.6; });
    ripples = ripples.filter(r => r.life > 0);
    bubbles.forEach(b => { b.y -= b.speed * dt; b.x += Math.sin(b.phase += dt) * 5 * dt; if (b.y < camera.y - height) { b.y = camera.y + height; b.x = camera.x + rand(-width, width); } });
    camera.shake = Math.max(0, (camera.shake || 0) - dt * 28);
  }

  function updateRemotePlayers(dt) {
    for (const fish of remotePlayers) {
      fish.x += (fish.targetX - fish.x) * Math.min(1, dt * 8);
      fish.y += (fish.targetY - fish.y) * Math.min(1, dt * 8);
      fish.angle = angleLerp(fish.angle, fish.targetAngle, Math.min(1, dt * 8));
      fish.r += (fish.targetR - fish.r) * Math.min(1, dt * 5);
      fish.wobble += dt * 7;
      recordTrail(fish);
    }
    if (multiplayer.lastSeen && performance.now() - multiplayer.lastSeen > 15000) {
      remotePlayers = []; ui.onlineCount.textContent = "1"; setConnection("retrying");
    }
  }

  function updateCamera(dt) {
    const targetZoom = clamp(1.05 - (player.r - 20) * .006, .68, 1.05);
    camera.x += (player.x - camera.x) * Math.min(1, dt * 4.5);
    camera.y += (player.y - camera.y) * Math.min(1, dt * 4.5);
    camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * 2);
  }

  function updateUI(force = false) {
    if (!player) return;
    ui.score.textContent = Math.floor(player.score).toLocaleString("ko-KR");
    ui.size.textContent = player.r.toFixed(1);
    const all = rivals.filter(r => r.alive).concat(remotePlayers, player).sort((a, b) => b.score - a.score);
    const rank = all.indexOf(player) + 1;
    ui.rank.textContent = `${rank} / ${all.length}`;
    if (force || frame % 12 === 0) {
      ui.leaderboard.innerHTML = all.slice(0, 5).map(f =>
        `<li class="${f === player ? "is-player" : ""}"><span class="dot" style="color:${f.color};background:${f.color}"></span><strong>${escapeHtml(f.name)}${f.live ? '<small class="live-tag">LIVE</small>' : ''}</strong><span>${Math.floor(f.score)}</span></li>`
      ).join("");
    }
    const stage = MISSION_GOALS.findIndex(goal => player.eaten < goal);
    const idx = stage === -1 ? MISSION_GOALS.length - 1 : stage;
    const goal = MISSION_GOALS[idx], previous = idx ? MISSION_GOALS[idx - 1] : 0;
    const current = Math.min(goal, player.eaten);
    ui.missionText.textContent = idx === MISSION_GOALS.length - 1 && player.eaten >= goal ? "리프의 최강자 유지하기" : `물고기 ${goal}마리 먹기`;
    ui.missionProgress.style.width = `${clamp((current - previous) / (goal - previous) * 100, 0, 100)}%`;
    ui.missionCount.textContent = `${current} / ${goal}`;
    const danger = rivals.concat(remotePlayers).some(r => r.alive && r.r > player.r * EAT_RATIO && distance(r, player) < 320);
    ui.danger.classList.toggle("is-visible", danger);
  }

  function worldToScreen(x, y) { return { x: (x - camera.x) * camera.zoom + width / 2 + (camera.shakeX || 0), y: (y - camera.y) * camera.zoom + height / 2 + (camera.shakeY || 0) }; }
  function isVisible(entity, margin = 100) {
    const p = worldToScreen(entity.x, entity.y);
    return p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin;
  }

  function drawBackground(time) {
    const grad = ctx.createRadialGradient(width * .48, height * .42, 20, width * .48, height * .42, Math.max(width, height) * .8);
    grad.addColorStop(0, "#0a3c4b"); grad.addColorStop(.52, "#062a39"); grad.addColorStop(1, "#031620");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 - camera.x * camera.zoom, height / 2 - camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
    const grid = 180;
    ctx.strokeStyle = "rgba(97, 219, 207, .035)"; ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let x = 0; x <= WORLD.w; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); }
    for (let y = 0; y <= WORLD.h; y += grid) { ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(116, 241, 223, .14)"; ctx.lineWidth = 5 / camera.zoom;
    ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
    ctx.restore();

    const light = ctx.createLinearGradient(0, 0, 0, height * .7);
    light.addColorStop(0, "rgba(129,255,230,.07)"); light.addColorStop(1, "transparent");
    ctx.fillStyle = light;
    for (let i = 0; i < 4; i++) {
      const x = ((i * 330 + time * .006) % (width + 500)) - 250;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 120, 0); ctx.lineTo(x + 390, height * .82); ctx.lineTo(x + 90, height * .82); ctx.closePath(); ctx.fill();
    }
  }

  function drawPrey(fish, time) {
    const p = worldToScreen(fish.x, fish.y), s = camera.zoom, r = fish.r * s;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(fish.angle); ctx.globalAlpha = .9;
    ctx.shadowColor = fish.color; ctx.shadowBlur = 9;
    ctx.fillStyle = fish.color;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * .55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * .85, 0); ctx.lineTo(-r * 1.55, -r * .55); ctx.lineTo(-r * 1.55, r * .55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#05222c"; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(r * .55, -r * .14, Math.max(1.2, r * .12), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function pointOnTrail(fish, index) {
    const safe = Math.min(index, fish.trail.length - 1);
    return fish.trail[safe] || { x: fish.x, y: fish.y };
  }

  function drawTreasure(chest, time) {
    if (!chest.active || !isVisible(chest, 60)) return;
    const p = worldToScreen(chest.x, chest.y + Math.sin(chest.phase * 2.2) * 5), s = camera.zoom;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s); ctx.shadowColor = "#ffe15c"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#7a3f18"; ctx.strokeStyle = "#ffe15c"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-17, -11, 34, 25, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#d99b2b"; ctx.fillRect(-18, -3, 36, 7); ctx.fillRect(-4, -12, 8, 27);
    ctx.fillStyle = "#fff3a5"; ctx.beginPath(); ctx.arc(0, 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBigFish(fish, isPlayer = false) {
    if (!isVisible(fish, 180)) return;
    const p = worldToScreen(fish.x, fish.y), s = camera.zoom, r = fish.r * s;
    ctx.save();
    ctx.globalAlpha = fish.alive ? 1 : .3;
    const segments = Math.min(10, Math.floor(5 + fish.r / 8));
    for (let i = segments; i >= 1; i--) {
      const t = pointOnTrail(fish, Math.floor(i * (fish.trail.length / (segments + 1))));
      const sp = worldToScreen(t.x, t.y), scale = 1 - i / (segments + 5);
      ctx.fillStyle = i % 2 ? fish.color : fish.accent;
      ctx.globalAlpha = .22 + scale * .52;
      ctx.shadowColor = fish.color; ctx.shadowBlur = isPlayer ? 14 : 8;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r * .48 * scale, 0, Math.PI * 2); ctx.fill();
    }
    const tail = pointOnTrail(fish, fish.trail.length - 1), tp = worldToScreen(tail.x, tail.y);
    const tailAngle = fish.trail.length > 3 ? Math.atan2(tail.y - pointOnTrail(fish, fish.trail.length - 4).y, tail.x - pointOnTrail(fish, fish.trail.length - 4).x) : fish.angle;
    ctx.save(); ctx.translate(tp.x, tp.y); ctx.rotate(tailAngle); ctx.fillStyle = fish.accent; ctx.globalAlpha = .7;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * .8, -r * .55); ctx.lineTo(-r * .65, 0); ctx.lineTo(-r * .8, r * .55); ctx.closePath(); ctx.fill(); ctx.restore();

    ctx.globalAlpha = 1; ctx.translate(p.x, p.y); ctx.rotate(fish.angle);
    ctx.shadowColor = fish.color; ctx.shadowBlur = isPlayer ? 22 : 13;
    const bodyGrad = ctx.createLinearGradient(-r, -r, r, r);
    bodyGrad.addColorStop(0, fish.accent); bodyGrad.addColorStop(.42, fish.color); bodyGrad.addColorStop(1, fish.color);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.02, r * .72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.02, r * .72, 0, 0, Math.PI * 2); ctx.clip();
    if (fish.skin === "clownfish") {
      ctx.fillStyle = "#fff7df";
      [-r * .42, r * .3].forEach(x => ctx.fillRect(x, -r, r * .2, r * 2));
      ctx.strokeStyle = "rgba(16,27,29,.45)"; ctx.lineWidth = r * .06;
      [-r * .42, -r * .22, r * .3, r * .5].forEach(x => { ctx.beginPath(); ctx.moveTo(x, -r); ctx.lineTo(x, r); ctx.stroke(); });
    } else if (fish.skin === "bluetang") {
      ctx.strokeStyle = "#082c78"; ctx.lineWidth = r * .22; ctx.beginPath(); ctx.arc(-r * .06, -r * .04, r * .55, -.9, 2.1); ctx.stroke();
    } else if (fish.skin === "mandarin") {
      ctx.strokeStyle = fish.accent; ctx.lineWidth = r * .11;
      ctx.beginPath(); ctx.arc(-r * .2, 0, r * .45, -.8, 2.35); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * .42, r * .08, r * .27, 1.8, 5.3); ctx.stroke();
    } else if (fish.skin === "betta") {
      ctx.fillStyle = "rgba(37,255,224,.25)"; ctx.beginPath(); ctx.ellipse(-r * .2, r * .22, r * .8, r * .26, -.18, 0, Math.PI * 2); ctx.fill();
    } else if (fish.skin === "koi") {
      ctx.fillStyle = fish.accent;
      [[-.46,-.16,.27],[.02,.26,.23],[.42,-.23,.18]].forEach(([x,y,size]) => { ctx.beginPath(); ctx.arc(r*x,r*y,r*size,0,Math.PI*2); ctx.fill(); });
    }
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(2,24,31,.25)";
    ctx.beginPath(); ctx.ellipse(-r * .05, r * .35, r * .58, r * .18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fish.accent;
    ctx.beginPath(); ctx.moveTo(-r * .1, -r * .55); ctx.quadraticCurveTo(-r * .25, -r * 1.08, r * .28, -r * .38); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#eafff8"; ctx.beginPath(); ctx.arc(r * .48, -r * .19, Math.max(2.5, r * .13), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#031820"; ctx.beginPath(); ctx.arc(r * .52, -r * .19, Math.max(1.4, r * .07), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(1,19,25,.65)"; ctx.lineWidth = Math.max(1, r * .045); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(r * .62, r * .13, r * .22, .2, 1.4); ctx.stroke();
    ctx.restore();

    if (!isPlayer) {
      ctx.save(); ctx.textAlign = "center"; ctx.font = `800 ${clamp(11 * camera.zoom, 10, 14)}px Nunito, sans-serif`;
      const edible = player.r > fish.r * EAT_RATIO;
      ctx.fillStyle = fish.r > player.r * EAT_RATIO ? "#ff8990" : (edible ? "#d9ff67" : "#b7d9d7");
      ctx.fillText(`${edible && !fish.live ? "냠! 맛있는 AI · " : ""}${fish.name}${fish.live ? "  ● LIVE" : ""}`, p.x, p.y - r - 12); ctx.restore();
    } else {
      ctx.save(); ctx.textAlign = "center"; ctx.font = `900 ${clamp(12 * camera.zoom, 11, 15)}px Nunito, sans-serif`; ctx.fillStyle = "#eafff8"; ctx.fillText(`${fish.name} (나)`, p.x, p.y - r - 14); ctx.restore();
    }
  }

  function drawEffects() {
    for (const b of bubbles) {
      const p = worldToScreen(b.x, b.y); ctx.strokeStyle = `rgba(160,245,235,${b.alpha})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r * camera.zoom, 0, Math.PI * 2); ctx.stroke();
    }
    for (const r of ripples) {
      const p = worldToScreen(r.x, r.y); ctx.globalAlpha = r.life; ctx.strokeStyle = r.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r.r * camera.zoom, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of particles) {
      const sp = worldToScreen(p.x, p.y); ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, p.r * camera.zoom, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render(time) {
    camera.shakeX = camera.shake ? rand(-camera.shake, camera.shake) : 0;
    camera.shakeY = camera.shake ? rand(-camera.shake, camera.shake) : 0;
    drawBackground(time);
    drawEffects();
    prey.filter(f => f.alive && isVisible(f, 40)).forEach(f => drawPrey(f, time));
    treasures.forEach(chest => drawTreasure(chest, time));
    rivals.filter(r => r.alive).sort((a, b) => a.r - b.r).forEach(r => drawBigFish(r));
    remotePlayers.slice().sort((a, b) => a.r - b.r).forEach(r => drawBigFish(r));
    if (player) drawBigFish(player, true);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .2, width / 2, height / 2, Math.max(width, height) * .7);
    vignette.addColorStop(0, "transparent"); vignette.addColorStop(1, "rgba(0,8,14,.44)"); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  }

  function loop(now) {
    const dt = Math.min(.033, (now - last) / 1000); last = now; frame++;
    if (running && player?.alive) {
      syncElapsed += dt;
      const syncEvery = paused ? 1 : .24;
      if (syncElapsed >= syncEvery) { syncElapsed = 0; syncRoom(roundToken); }
      updateRemotePlayers(dt);
      if (!paused) { updatePlayer(dt); updateRivals(dt); updatePrey(dt); updateTreasures(dt); updateCamera(dt); }
      updateEffects(dt); updateUI();
    } else updateEffects(dt);
    render(now);
    requestAnimationFrame(loop);
  }

  function setPointer(event) { input.x = event.clientX; input.y = event.clientY; }
  canvas.addEventListener("pointermove", setPointer);
  canvas.addEventListener("pointerdown", event => { setPointer(event); input.down = true; canvas.setPointerCapture?.(event.pointerId); });
  canvas.addEventListener("pointerup", event => { setPointer(event); input.down = false; });
  canvas.addEventListener("pointercancel", () => { input.down = false; });
  window.addEventListener("keydown", event => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(event.key)) event.preventDefault();
    input.keys.add(event.key); if (event.code === "Space") input.boost = true;
    if (event.key === "Escape" && ui.shopModal.classList.contains("is-visible")) closeShop();
    else if (event.key === "p" || event.key === "P" || event.key === "Escape") togglePause();
  }, { passive: false });
  window.addEventListener("keyup", event => { input.keys.delete(event.key); if (event.code === "Space") input.boost = false; });
  window.addEventListener("blur", () => { if (running && player?.alive) togglePause(true); });
  window.addEventListener("resize", resize);

  buttons.start.addEventListener("click", startGame);
  buttons.restart.addEventListener("click", startGame);
  buttons.randomName.addEventListener("click", () => { ui.nickname.value = randomName(); refreshNameUI(); ui.nickname.focus(); });
  buttons.shop.addEventListener("click", openShop);
  buttons.shopClose.addEventListener("click", closeShop);
  ui.nickname.addEventListener("input", refreshNameUI);
  ui.nickname.addEventListener("keydown", event => { if (event.key === "Enter" && !buttons.start.disabled) startGame(); });
  buttons.pause.addEventListener("click", () => togglePause());
  buttons.resume.addEventListener("click", () => togglePause(false));
  ui.sound.addEventListener("click", () => {
    soundOn = !soundOn; ui.sound.setAttribute("aria-pressed", String(soundOn));
    ui.sound.setAttribute("aria-label", soundOn ? "소리 끄기" : "소리 켜기");
    if (soundOn) playTone(420, .12);
  });
  document.querySelector(".brand").addEventListener("click", event => {
    event.preventDefault();
    if (running) { try { navigator.sendBeacon("/api/room/leave", new Blob([JSON.stringify({ id: playerId })], { type: "application/json" })); } catch (_) {} }
    roundToken += 1; running = false; paused = false; remotePlayers = []; ui.onlineCount.textContent = "1";
    ui.pauseModal.classList.remove("is-visible"); ui.gameOverModal.classList.remove("is-visible"); ui.startModal.classList.add("is-visible");
  });
  window.addEventListener("beforeunload", () => {
    if (!running) return;
    try { navigator.sendBeacon("/api/room/leave", new Blob([JSON.stringify({ id: playerId })], { type: "application/json" })); } catch (_) {}
  });

  function registerWebMCP() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const safeRegister = tool => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch (_) {} };
    const requireEmptyInput = input => {
      if (input == null || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
        throw new TypeError("입력값 없이 호출해야 합니다.");
      }
    };
    safeRegister({
      name: "start_gobblefin_round", title: "고블핀 게임 시작", description: "새 게임을 시작하고 플레이 상태를 초기화합니다.",
      inputSchema: { type: "object", properties: { nickname: { type: "string", minLength: 2, maxLength: 12 } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (input == null || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => key !== "nickname")) throw new TypeError("닉네임만 입력할 수 있습니다.");
        if (input.nickname) ui.nickname.value = cleanName(input.nickname);
        if (!refreshNameUI()) throw new TypeError("두 글자 이상의 닉네임이 필요합니다.");
        startGame(); return { status: "playing", nickname: player.name, score: 0, size: player.r };
      }
    });
    safeRegister({
      name: "pause_gobblefin_round", title: "고블핀 게임 일시정지", description: "진행 중인 게임을 일시정지합니다.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { requireEmptyInput(input); if (!running || !player?.alive) throw new Error("진행 중인 게임이 없습니다."); togglePause(true); return { status: "paused", score: Math.floor(player.score) }; }
    });
    safeRegister({
      name: "get_gobblefin_status", title: "고블핀 상태 확인", description: "현재 게임의 점수, 크기, 순위, 상태를 확인합니다.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) { requireEmptyInput(input); return { status: !running ? "idle" : paused ? "paused" : "playing", nickname, score: Math.floor(player?.score || 0), size: Number((player?.r || 20).toFixed(1)), best, coins, skin: selectedSkin, online: remotePlayers.length + 1 }; }
    });
    safeRegister({
      name: "select_gobblefin_skin", title: "고블핀 물고기 선택", description: "보유 코인으로 물고기 디자인을 구매하거나 이미 보유한 디자인을 선택합니다.",
      inputSchema: { type: "object", properties: { skinId: { type: "string", enum: SKINS.map(skin => skin.id) } }, required: ["skinId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== "object" || Object.keys(input).length !== 1 || !SKINS.some(skin => skin.id === input.skinId)) throw new TypeError("올바른 skinId가 필요합니다.");
        const skin = skinById(input.skinId);
        if (!unlockedSkins.has(skin.id)) {
          if (coins < skin.price) throw new Error(`코인이 ${skin.price - coins}개 부족합니다.`);
          coins -= skin.price; unlockedSkins.add(skin.id);
        }
        selectedSkin = skin.id; saveEconomy(); renderShop();
        return { selected: skin.id, name: skin.name, coins };
      }
    });
  }

  resize();
  if (!SKINS.some(skin => skin.id === selectedSkin) || !unlockedSkins.has(selectedSkin)) selectedSkin = "butterfly";
  saveEconomy();
  refreshNameUI();
  resetGame();
  bubbles = Array.from({ length: 56 }, () => ({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), r: rand(1.2, 4.5), speed: rand(7, 24), phase: rand(0, 10), alpha: rand(.08, .28) }));
  registerWebMCP();
  requestAnimationFrame(loop);
})();
