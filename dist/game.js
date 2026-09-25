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
    pauseModal: document.getElementById("pauseModal"), sound: document.getElementById("soundButton")
  };
  const buttons = {
    start: document.getElementById("startButton"), restart: document.getElementById("restartButton"),
    pause: document.getElementById("pauseButton"), resume: document.getElementById("resumeButton")
  };

  const WORLD = { w: 3600, h: 2400 };
  const COLORS = ["#10e2d2", "#d9ff67", "#ff6b74", "#ffe15c", "#8b7cff", "#44a8ff"];
  const NAMES = ["Bubble", "Nori", "Fin Diesel", "참치왕", "물멍이", "Splash", "꼬리별", "Mango", "소금빵", "DeepBlue", "파닥몬", "Coral"];
  const MISSION_GOALS = [5, 12, 22, 36];
  let dpr = 1, width = 0, height = 0, last = performance.now();
  let running = false, paused = false, soundOn = false, frame = 0, camera = { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1 };
  let player, prey = [], rivals = [], particles = [], bubbles = [], ripples = [];
  let best = Number(localStorage.getItem("gobblefin-best") || 0);
  let audioCtx = null;
  const input = { x: innerWidth * .72, y: innerHeight * .5, down: false, boost: false, keys: new Set() };

  ui.best.textContent = best.toLocaleString("ko-KR");

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * t;
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function newPrey(x = rand(80, WORLD.w - 80), y = rand(80, WORLD.h - 80)) {
    const rare = Math.random() < .08;
    return {
      x, y, r: rare ? rand(10, 14) : rand(5, 10), angle: rand(0, Math.PI * 2),
      speed: rand(15, 38), phase: rand(0, 10), color: rare ? "#d9ff67" : COLORS[Math.floor(rand(0, 4))],
      value: rare ? 4 : 1, alive: true
    };
  }

  function newRival(index) {
    const r = rand(17, 43);
    const edge = index % 4;
    return {
      x: edge < 2 ? rand(140, WORLD.w - 140) : (edge === 2 ? 150 : WORLD.w - 150),
      y: edge >= 2 ? rand(140, WORLD.h - 140) : (edge === 0 ? 150 : WORLD.h - 150),
      r, angle: rand(0, Math.PI * 2), targetAngle: rand(0, Math.PI * 2), speed: rand(54, 82),
      color: COLORS[(index + 2) % COLORS.length], accent: COLORS[(index + 4) % COLORS.length],
      score: Math.round((r - 16) * (r - 16) * .55), name: NAMES[index % NAMES.length],
      think: rand(.3, 1.5), alive: true, wobble: rand(0, 9), trail: []
    };
  }

  function resetGame() {
    prey = Array.from({ length: 175 }, () => newPrey());
    rivals = Array.from({ length: 11 }, (_, i) => newRival(i));
    particles = []; ripples = [];
    player = {
      x: WORLD.w / 2, y: WORLD.h / 2, r: 20, angle: 0, targetAngle: 0, speed: 98,
      color: "#10e2d2", accent: "#d9ff67", score: 0, eaten: 0, name: "나",
      alive: true, trail: [], wobble: 0
    };
    for (let i = 0; i < 35; i++) player.trail.push({ x: player.x - i * 3, y: player.y });
    camera.x = player.x; camera.y = player.y; camera.zoom = 1;
    last = performance.now();
    updateUI(true);
  }

  function startGame() {
    resetGame(); running = true; paused = false;
    ui.startModal.classList.remove("is-visible");
    ui.gameOverModal.classList.remove("is-visible");
    ui.pauseModal.classList.remove("is-visible");
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
    fish.r = 18 + Math.sqrt(Math.max(0, fish.score)) * 1.48;
    fish.r = Math.min(fish.r, 82);
  }

  function burst(x, y, color, amount) {
    for (let i = 0; i < amount; i++) particles.push({
      x, y, vx: rand(-65, 65), vy: rand(-65, 65), r: rand(1.5, 4), life: 1, color
    });
  }

  function defeat() {
    if (!player.alive) return;
    player.alive = false; running = false;
    playTone(100, .5, "sawtooth", .05);
    burst(player.x, player.y, player.color, 36);
    const score = Math.floor(player.score);
    const isBest = score > best;
    if (isBest) { best = score; localStorage.setItem("gobblefin-best", String(best)); }
    ui.finalScore.textContent = score.toLocaleString("ko-KR");
    ui.best.textContent = best.toLocaleString("ko-KR");
    ui.newBest.classList.toggle("is-visible", isBest);
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
        if (player.alive && rival.r > player.r * 1.13 && pd < 520) target = player;
        if (player.alive && player.r > rival.r * 1.18 && pd < 340) {
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

      for (const f of prey) if (f.alive && rival.r > f.r * 1.4 && distance(rival, f) < rival.r * .72 + f.r) eatPrey(rival, f);
      const pd = distance(rival, player);
      if (player.alive && pd < (rival.r + player.r) * .67) {
        if (rival.r > player.r * 1.12) defeat();
        else if (player.r > rival.r * 1.14) eatRival(rival);
      }
    }
    rivals = rivals.filter(r => r.alive);
    while (rivals.length < 11) rivals.push(newRival(Math.floor(rand(0, NAMES.length))));
  }

  function eatRival(rival) {
    rival.alive = false;
    player.score += Math.max(8, Math.round(rival.r * .9));
    player.eaten += 3; grow(player);
    burst(rival.x, rival.y, rival.color, 18); ripples.push({ x: rival.x, y: rival.y, r: rival.r * .5, life: 1, color: rival.color });
    playTone(520, .16, "triangle", .055);
  }

  function updatePrey(dt) {
    for (const fish of prey) {
      if (!fish.alive) continue;
      fish.phase += dt;
      fish.angle += Math.sin(fish.phase * 1.3) * dt * .45;
      if (fish.x < 40 || fish.x > WORLD.w - 40 || fish.y < 40 || fish.y > WORLD.h - 40) fish.angle += Math.PI * dt;
      fish.x = clamp(fish.x + Math.cos(fish.angle) * fish.speed * dt, 20, WORLD.w - 20);
      fish.y = clamp(fish.y + Math.sin(fish.angle) * fish.speed * dt, 20, WORLD.h - 20);
      if (player.alive && player.r > fish.r * 1.35 && distance(player, fish) < player.r * .78 + fish.r) eatPrey(player, fish);
    }
    const dead = prey.reduce((n, f) => n + (!f.alive ? 1 : 0), 0);
    if (dead) prey = prey.filter(f => f.alive).concat(Array.from({ length: dead }, () => newPrey()));
  }

  function updateEffects(dt) {
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt * 1.8; });
    particles = particles.filter(p => p.life > 0);
    ripples.forEach(r => { r.r += dt * 55; r.life -= dt * 1.6; });
    ripples = ripples.filter(r => r.life > 0);
    bubbles.forEach(b => { b.y -= b.speed * dt; b.x += Math.sin(b.phase += dt) * 5 * dt; if (b.y < camera.y - height) { b.y = camera.y + height; b.x = camera.x + rand(-width, width); } });
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
    ui.size.textContent = Math.round(player.r).toString();
    const all = rivals.filter(r => r.alive).concat(player).sort((a, b) => b.score - a.score);
    const rank = all.indexOf(player) + 1;
    ui.rank.textContent = `${rank} / ${all.length}`;
    if (force || frame % 12 === 0) {
      ui.leaderboard.innerHTML = all.slice(0, 5).map(f =>
        `<li class="${f === player ? "is-player" : ""}"><span class="dot" style="color:${f.color};background:${f.color}"></span><strong>${f === player ? "나" : f.name}</strong><span>${Math.floor(f.score)}</span></li>`
      ).join("");
    }
    const stage = MISSION_GOALS.findIndex(goal => player.eaten < goal);
    const idx = stage === -1 ? MISSION_GOALS.length - 1 : stage;
    const goal = MISSION_GOALS[idx], previous = idx ? MISSION_GOALS[idx - 1] : 0;
    const current = Math.min(goal, player.eaten);
    ui.missionText.textContent = idx === MISSION_GOALS.length - 1 && player.eaten >= goal ? "리프의 최강자 유지하기" : `물고기 ${goal}마리 먹기`;
    ui.missionProgress.style.width = `${clamp((current - previous) / (goal - previous) * 100, 0, 100)}%`;
    ui.missionCount.textContent = `${current} / ${goal}`;
    const danger = rivals.some(r => r.alive && r.r > player.r * 1.12 && distance(r, player) < 320);
    ui.danger.classList.toggle("is-visible", danger);
  }

  function worldToScreen(x, y) { return { x: (x - camera.x) * camera.zoom + width / 2, y: (y - camera.y) * camera.zoom + height / 2 }; }
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
      ctx.fillStyle = fish.r > player.r * 1.12 ? "#ff8990" : (player.r > fish.r * 1.14 ? "#d9ff67" : "#b7d9d7");
      ctx.fillText(fish.name, p.x, p.y - r - 12); ctx.restore();
    } else {
      ctx.save(); ctx.textAlign = "center"; ctx.font = `900 ${clamp(12 * camera.zoom, 11, 15)}px Nunito, sans-serif`; ctx.fillStyle = "#eafff8"; ctx.fillText("나", p.x, p.y - r - 14); ctx.restore();
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
    drawBackground(time);
    drawEffects();
    prey.filter(f => f.alive && isVisible(f, 40)).forEach(f => drawPrey(f, time));
    rivals.filter(r => r.alive).sort((a, b) => a.r - b.r).forEach(r => drawBigFish(r));
    if (player) drawBigFish(player, true);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .2, width / 2, height / 2, Math.max(width, height) * .7);
    vignette.addColorStop(0, "transparent"); vignette.addColorStop(1, "rgba(0,8,14,.44)"); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  }

  function loop(now) {
    const dt = Math.min(.033, (now - last) / 1000); last = now; frame++;
    if (running && !paused && player?.alive) {
      updatePlayer(dt); updateRivals(dt); updatePrey(dt); updateEffects(dt); updateCamera(dt); updateUI();
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
    if (event.key === "p" || event.key === "P" || event.key === "Escape") togglePause();
  }, { passive: false });
  window.addEventListener("keyup", event => { input.keys.delete(event.key); if (event.code === "Space") input.boost = false; });
  window.addEventListener("blur", () => { if (running && player?.alive) togglePause(true); });
  window.addEventListener("resize", resize);

  buttons.start.addEventListener("click", startGame);
  buttons.restart.addEventListener("click", startGame);
  buttons.pause.addEventListener("click", () => togglePause());
  buttons.resume.addEventListener("click", () => togglePause(false));
  ui.sound.addEventListener("click", () => {
    soundOn = !soundOn; ui.sound.setAttribute("aria-pressed", String(soundOn));
    ui.sound.setAttribute("aria-label", soundOn ? "소리 끄기" : "소리 켜기");
    if (soundOn) playTone(420, .12);
  });
  document.querySelector(".brand").addEventListener("click", event => {
    event.preventDefault(); running = false; paused = false; ui.pauseModal.classList.remove("is-visible"); ui.gameOverModal.classList.remove("is-visible"); ui.startModal.classList.add("is-visible");
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
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { requireEmptyInput(input); startGame(); return { status: "playing", score: 0, size: Math.round(player.r) }; }
    });
    safeRegister({
      name: "pause_gobblefin_round", title: "고블핀 게임 일시정지", description: "진행 중인 게임을 일시정지합니다.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { requireEmptyInput(input); if (!running || !player?.alive) throw new Error("진행 중인 게임이 없습니다."); togglePause(true); return { status: "paused", score: Math.floor(player.score) }; }
    });
    safeRegister({
      name: "get_gobblefin_status", title: "고블핀 상태 확인", description: "현재 게임의 점수, 크기, 순위, 상태를 확인합니다.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) { requireEmptyInput(input); return { status: !running ? "idle" : paused ? "paused" : "playing", score: Math.floor(player?.score || 0), size: Math.round(player?.r || 20), best }; }
    });
  }

  resize();
  resetGame();
  bubbles = Array.from({ length: 56 }, () => ({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), r: rand(1.2, 4.5), speed: rand(7, 24), phase: rand(0, 10), alpha: rand(.08, .28) }));
  registerWebMCP();
  requestAnimationFrame(loop);
})();
