const WORLD = { w: 3600, h: 2400 };
const COLORS = new Set(["#10e2d2", "#d9ff67", "#ff6b74", "#ffe15c", "#8b7cff", "#44a8ff"]);
const SKINS = new Set(["butterfly", "clownfish", "bluetang", "mandarin", "betta", "koi"]);
let schemaReady = false;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanId(value) {
  const id = String(value || "");
  return /^[a-zA-Z0-9_-]{16,80}$/.test(id) ? id : null;
}

function cleanName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
}

function radiusFor(score) {
  return Math.min(86, 20 + Math.max(0, score) * .22);
}

async function body(request) {
  try { return await request.json(); } catch { return null; }
}

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, x REAL NOT NULL DEFAULT 1800,
    y REAL NOT NULL DEFAULT 1200, angle REAL NOT NULL DEFAULT 0, radius REAL NOT NULL DEFAULT 20,
    score REAL NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT '#10e2d2', skin TEXT NOT NULL DEFAULT 'butterfly', alive INTEGER NOT NULL DEFAULT 1,
    eaten_by TEXT, last_seen INTEGER NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen)").run();
  schemaReady = true;
}

async function roomPlayers(db, now) {
  const result = await db.prepare(
    "SELECT id, name, x, y, angle, radius AS r, score, color, skin FROM players WHERE alive = 1 AND last_seen > ? ORDER BY score DESC LIMIT 40"
  ).bind(now - 15000).all();
  return result.results || [];
}

async function joinRoom(request, env) {
  const input = await body(request);
  const id = cleanId(input?.id), name = cleanName(input?.name);
  if (!id || !name) return json({ error: "invalid_player" }, 400);
  const now = Date.now();
  const color = COLORS.has(input?.color) ? input.color : "#10e2d2";
  const skin = SKINS.has(input?.skin) ? input.skin : "butterfly";
  const x = Math.max(30, Math.min(WORLD.w - 30, finite(input?.x, WORLD.w / 2)));
  const y = Math.max(30, Math.min(WORLD.h - 30, finite(input?.y, WORLD.h / 2)));
  await ensureSchema(env.DB);
  await env.DB.prepare(
    `INSERT INTO players (id, name, x, y, angle, radius, score, color, skin, alive, eaten_by, last_seen)
     VALUES (?, ?, ?, ?, 0, 20, 0, ?, ?, 1, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, x=excluded.x, y=excluded.y,
       angle=0, radius=20, score=0, color=excluded.color, skin=excluded.skin, alive=1, eaten_by=NULL, last_seen=excluded.last_seen`
  ).bind(id, name, x, y, color, skin, now).run();
  await env.DB.prepare("DELETE FROM players WHERE last_seen < ?").bind(now - 86400000).run();
  return json({ ok: true, alive: true, players: await roomPlayers(env.DB, now), serverTime: now });
}

async function updateState(request, env) {
  const input = await body(request);
  const id = cleanId(input?.id);
  if (!id) return json({ error: "invalid_player" }, 400);
  const now = Date.now();
  await ensureSchema(env.DB);
  const saved = await env.DB.prepare("SELECT alive, eaten_by, score FROM players WHERE id = ?").bind(id).first();
  if (!saved) return json({ error: "join_required" }, 409);
  if (!saved.alive) {
    const eater = saved.eaten_by
      ? await env.DB.prepare("SELECT name FROM players WHERE id = ?").bind(saved.eaten_by).first()
      : null;
    return json({ ok: true, alive: false, eatenBy: eater?.name || "다른 플레이어", players: await roomPlayers(env.DB, now), serverTime: now });
  }

  const x = Math.max(20, Math.min(WORLD.w - 20, finite(input?.x, WORLD.w / 2)));
  const y = Math.max(20, Math.min(WORLD.h - 20, finite(input?.y, WORLD.h / 2)));
  const angle = finite(input?.angle, 0);
  let score = Math.max(0, Math.min(10000, finite(input?.score, saved.score)));
  let radius = radiusFor(score);
  await env.DB.prepare(
    "UPDATE players SET x=?, y=?, angle=?, radius=?, score=?, last_seen=? WHERE id=? AND alive=1"
  ).bind(x, y, angle, radius, score, now, id).run();

  const nearby = await env.DB.prepare(
    "SELECT id, name, x, y, radius AS r, score FROM players WHERE id != ? AND alive=1 AND last_seen > ? LIMIT 40"
  ).bind(id, now - 15000).all();
  let alive = true, eatenBy = null, bonus = 0;
  for (const other of nearby.results || []) {
    const d = Math.hypot(x - other.x, y - other.y);
    if (d >= (radius + other.r) * .62) continue;
    if (other.r > radius * 1.12) {
      const result = await env.DB.prepare(
        "UPDATE players SET alive=0, eaten_by=?, last_seen=? WHERE id=? AND alive=1"
      ).bind(other.id, now, id).run();
      if ((result.meta?.changes || 0) > 0) { alive = false; eatenBy = other.name; }
      break;
    }
    if (radius > other.r * 1.14) {
      const result = await env.DB.prepare(
        "UPDATE players SET alive=0, eaten_by=?, last_seen=? WHERE id=? AND alive=1"
      ).bind(id, now, other.id).run();
      if ((result.meta?.changes || 0) > 0) bonus += Math.max(8, Math.round(other.r * .9));
    }
  }

  if (alive && bonus > 0) {
    score += bonus; radius = radiusFor(score);
    await env.DB.prepare("UPDATE players SET score=?, radius=? WHERE id=? AND alive=1").bind(score, radius, id).run();
  }
  return json({ ok: true, alive, eatenBy, bonus, score, radius, players: await roomPlayers(env.DB, now), serverTime: now });
}

async function leaveRoom(request, env) {
  const input = await body(request), id = cleanId(input?.id);
  if (!id) return json({ error: "invalid_player" }, 400);
  await ensureSchema(env.DB);
  await env.DB.prepare("UPDATE players SET last_seen=0 WHERE id=?").bind(id).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, multiplayer: true });
    if (url.pathname === "/api/room/join" && request.method === "POST") return joinRoom(request, env);
    if (url.pathname === "/api/room/state" && request.method === "POST") return updateState(request, env);
    if (url.pathname === "/api/room/leave" && request.method === "POST") return leaveRoom(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response("GOBBLEFIN assets unavailable", { status: 503 });
  },
};
