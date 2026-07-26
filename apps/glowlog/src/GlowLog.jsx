import { useState, useEffect, useRef, useMemo } from "react";
import { Flame, Send, X, Copy, Check, Shuffle, Trash2, Sparkles } from "lucide-react";

/* ────────────────────────────────────────────
   GlowLog — 따뜻한 순간만 캐싱하는 개인 로그
   · Positive-only ingestion / No negative logging
   · 나이 든 기억은 은하 중심으로, 최근 기억은 바깥에서 반짝임
   ──────────────────────────────────────────── */

const KEY = "glowlog:entries";

/* ---------- helpers ---------- */
const hash01 = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
};
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const parseD = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const startOfToday = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const ageDays = (s) => Math.max(0, (startOfToday() - parseD(s)) / 86400000);
const dateK = (s) => {
  const p = s.split("-").map(Number);
  return `${p[1]}월 ${p[2]}일`;
};
const mkId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- outbound templates ---------- */
const TPL = {
  polite: [
    (n, e) => `${n}님, 문득 그날이 생각나서요 — "${e.text}" 덕분에 정말 좋았어요. 요즘 잘 지내시죠?`,
    (n, e) => `${n}님, ${dateK(e.date)}에 있었던 일 기억하세요? ${e.text} — 아직도 종종 떠올라요. 조만간 또 봬요!`,
    (n, e) => `${n}님 덕분에 좋았던 순간이 갑자기 떠올라서 연락드려요. (${e.text}) 늘 감사해요.`,
  ],
  casual: [
    (n, e) => `${n}, 갑자기 그날 생각났어 — ${e.text} 그때 진짜 좋았는데. 잘 지내지?`,
    (n, e) => `${n}, ${dateK(e.date)}에 그거 기억나? ${e.text} — 조만간 한번 보자!`,
    (n, e) => `문득 생각나서. ${n} 덕분에 그때 참 좋았어. (${e.text}) 고맙다, 진짜.`,
  ],
};

/* ---------- sample embers (first-run preview) ---------- */
const makeSamples = () => {
  const mk = (daysAgo, name, text) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return {
      id: mkId() + daysAgo,
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      name,
      text,
      createdAt: Date.now() - daysAgo * 86400000,
    };
  };
  return [
    mk(0, "김철수", "오랜만에 커피 타임. 새로 산 키보드 타건감 공유하며 크게 웃음."),
    mk(4, "박 팀장", '마감 직후 "고생했다"며 건넨 모바일 주스 쿠폰. 따뜻함 충전.'),
    mk(9, "이영희", "프로젝트 버그 해결에 결정적 힌트 줌. 서로 리스펙트 확인."),
    mk(34, "카페 사장님", "비 오는 날 서비스 쿠키. 별거 아닌데 하루가 다 풀림."),
    mk(120, "윤서", "새벽까지 게임 얘기. 좋아하는 걸 좋아한다고 말해도 되는 사람."),
  ];
};

/* ---------- styles ---------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
.glroot, .glroot * { box-sizing: border-box; }
.glroot { font-family: 'Gowun Batang', 'Noto Serif KR', serif; color: #efe3cf; }
.glmono { font-family: 'IBM Plex Mono', monospace; }
.glroot ::selection { background: rgba(240,162,74,.35); }
.glroot ::-webkit-scrollbar { width: 8px; height: 8px; }
.glroot ::-webkit-scrollbar-track { background: transparent; }
.glroot ::-webkit-scrollbar-thumb { background: rgba(240,162,74,.22); border-radius: 4px; }
.glroot input, .glroot textarea, .glroot button { font-family: inherit; }
.glroot input:focus, .glroot textarea:focus { outline: none; }
.glroot button:focus-visible { outline: 2px solid rgba(255,200,130,.7); outline-offset: 2px; }

@keyframes glflash {
  0% { box-shadow: 0 0 0 rgba(255,190,110,0); }
  25% { box-shadow: 0 0 46px rgba(255,190,110,.55), 0 0 14px rgba(255,190,110,.65); }
  100% { box-shadow: 0 0 0 rgba(255,190,110,0); }
}
.glflash { animation: glflash .9s ease-out; }
@keyframes glin {
  from { opacity: 0; transform: translateY(16px) scale(.97); filter: blur(5px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes glfloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes glfade { from { opacity: 0; } to { opacity: 1; } }
@keyframes glpulse {
  0%,100% { box-shadow: 0 0 20px rgba(240,162,74,.4); }
  50% { box-shadow: 0 0 34px rgba(240,162,74,.75); }
}
@media (prefers-reduced-motion: reduce) {
  .glflash, .glfabpulse { animation: none !important; }
}
.glfabpulse { animation: glpulse 3.2s ease-in-out infinite; }
.glrow .gldel { opacity: 0; transition: opacity .15s; }
.glrow:hover .gldel, .glrow:focus-within .gldel { opacity: 1; }
.glrow:hover { background: rgba(240,162,74,.05); }
.glghostbtn { transition: all .15s; }
.glghostbtn:hover { border-color: rgba(240,162,74,.6) !important; color: #ffd9a0 !important; }
@media (max-width: 640px) {
  .gltag { display: none; }
  .glheader { padding: max(12px, env(safe-area-inset-top)) 12px 12px !important; }
  .glviewbtn { padding: 6px 11px !important; }
  .glcount { display: none; }
  .glcommit-wrap { bottom: max(10px, env(safe-area-inset-bottom)) !important; }
  .glcommit-panel { border-radius: 18px !important; align-items: flex-end !important; padding: 9px 10px !important; }
  .glcommit-fields {
    display: grid !important;
    grid-template-columns: minmax(92px, 1fr) minmax(70px, .8fr);
    gap: 7px 10px !important;
  }
  .glcommit-fields > span { display: none; }
  .gldate { width: 100% !important; grid-column: 1; }
  .glnamein { width: 100% !important; grid-column: 2; }
  .glmomentin { grid-column: 1 / -1; min-height: 30px; }
  .glpositive { max-width: calc(100vw - 96px); text-align: center; line-height: 1.35; }
  .glfab-galaxy { right: 14px !important; bottom: 142px !important; }
  .glfab-log { right: 14px !important; bottom: max(18px, env(safe-area-inset-bottom)) !important; }
  .glrow { align-items: flex-start !important; flex-wrap: wrap; gap: 5px 8px !important; padding: 10px 8px !important; }
  .glrow > span:nth-of-type(2) { display: none; }
  .glrow > span:last-of-type { width: 100%; flex: 0 0 100% !important; padding-left: 0; color: #d8cbb5 !important; }
  .glrow .gldel { opacity: .72; margin-left: auto; }
}
`;

/* ---------- tiny UI atoms ---------- */
const Panel = ({ children, style, className }) => (
  <div
    className={className}
    style={{
      background: "rgba(24,19,13,0.88)",
      border: "1px solid rgba(240,162,74,0.18)",
      borderRadius: 16,
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      ...style,
    }}
  >
    {children}
  </div>
);

const GhostBtn = ({ children, onClick, style, title }) => (
  <button
    className="glghostbtn"
    title={title}
    onClick={onClick}
    style={{
      background: "transparent",
      border: "1px solid rgba(240,162,74,0.3)",
      color: "#c9b895",
      borderRadius: 999,
      padding: "7px 14px",
      fontSize: 13,
      cursor: "pointer",
      ...style,
    }}
  >
    {children}
  </button>
);

const AmberBtn = ({ children, onClick, style, disabled, title }) => (
  <button
    title={title}
    disabled={disabled}
    onClick={onClick}
    style={{
      background: disabled
        ? "rgba(240,162,74,0.25)"
        : "linear-gradient(135deg, #f0a24a, #d9822e)",
      border: "none",
      color: "#1d1509",
      borderRadius: 999,
      padding: "9px 18px",
      fontSize: 13.5,
      fontWeight: 700,
      cursor: disabled ? "default" : "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      boxShadow: disabled ? "none" : "0 0 18px rgba(240,162,74,.35)",
      ...style,
    }}
  >
    {children}
  </button>
);

/* ════════════════════════════════════════════ */
export default function GlowLog() {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [view, setView] = useState("galaxy"); // 'galaxy' | 'log'
  const [form, setForm] = useState({ date: todayStr(), name: "", text: "" });
  const [flash, setFlash] = useState(false);
  const [selected, setSelected] = useState(null); // {entry,x,y}
  const [personFilter, setPersonFilter] = useState(null);
  const [showRetrieval, setShowRetrieval] = useState(false);
  const [picks, setPicks] = useState([]);
  const [ob, setOb] = useState(null); // {name, momentId, tone, tpl}
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 800, h: 600, dpr: 1 });
  const rotRef = useRef({ yaw: 0.6, pitch: -0.95, down: false, dragging: false, moved: false, lx: 0, ly: 0 });
  const wtRef = useRef(0);
  const particlesRef = useRef(new Map());
  const projRef = useRef(new Map());
  const entriesRef = useRef([]);
  const selectedRef = useRef(null);
  const hoverRef = useRef(null);
  const viewRef = useRef("galaxy");

  /* ---------- persistence ---------- */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw !== null) {
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved)) throw new Error("Stored GlowLog data is not an array");
        setEntries(saved);
      } else {
        // 첫 방문자는 입력 전에 완성된 감각부터 본다. 샘플은 저장하지 않는다.
        setEntries(makeSamples());
        setDemoMode(true);
      }
    } catch (e) {
      console.error("GlowLog load error:", e);
      setEntries(makeSamples());
      setDemoMode(true);
    }
    setLoaded(true);
  }, []);

  const persist = (next) => {
    setEntries(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      console.error("GlowLog storage error:", e);
    }
  };

  /* ---------- ref mirrors ---------- */
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { viewRef.current = view; }, [view]);

  /* ---------- esc closes overlays ---------- */
  useEffect(() => {
    const f = (e) => {
      if (e.key === "Escape") {
        setShowRetrieval(false);
        setOb(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  /* ---------- galaxy render loop ---------- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf;
    let last = performance.now();

    // ambient dust (spiral body + core bulge)
    const dust = [];
    for (let i = 0; i < 150; i++) {
      const r = 0.14 + 0.8 * Math.pow(Math.random(), 0.75);
      dust.push({ r, a: Math.random() * Math.PI * 2, y: (Math.random() - 0.5) * 0.09, al: 0.04 + Math.random() * 0.1, sz: 0.6 + Math.random() * 0.8, sp: 0.9 + Math.random() * 0.5 });
    }
    for (let i = 0; i < 45; i++) {
      const r = Math.random() * Math.random() * 0.16;
      dust.push({ r, a: Math.random() * Math.PI * 2, y: (Math.random() - 0.5) * 0.05, al: 0.08 + Math.random() * 0.12, sz: 0.6 + Math.random() * 0.9, sp: 1.5 });
    }

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = w + "px";
      cv.style.height = h + "px";
      sizeRef.current = { w, h, dpr };
    };
    resize();
    window.addEventListener("resize", resize);

    const step = (now) => {
      const dt = Math.min(50, now - last);
      last = now;
      if (document.hidden || viewRef.current !== "galaxy") {
        raf = requestAnimationFrame(step);
        return;
      }
      const { w, h, dpr } = sizeRef.current;
      const rot = rotRef.current;

      // 기억을 들여다보는 동안엔 은하의 시간이 멈춘다
      if (!selectedRef.current) wtRef.current += dt;
      if (!selectedRef.current && !rot.dragging) rot.yaw += dt * 0.000042;
      const wt = wtRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0e0c09");
      bg.addColorStop(1, "#15100b");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2, cy = h * 0.45;
      const R = Math.min(w, h) * 0.42;

      // core halo
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
      cg.addColorStop(0, "rgba(240,170,90,0.10)");
      cg.addColorStop(1, "rgba(240,170,90,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 0.55, R * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3D projection: disk → yaw(Y) → pitch(X) → perspective
      const proj = (r, a, yN) => {
        const x0 = Math.cos(a) * r * R, z0 = Math.sin(a) * r * R, y0 = yN * R;
        const cyaw = Math.cos(rot.yaw), syaw = Math.sin(rot.yaw);
        const x1 = x0 * cyaw + z0 * syaw;
        const z1 = -x0 * syaw + z0 * cyaw;
        const cp = Math.cos(rot.pitch), sp = Math.sin(rot.pitch);
        const y2 = y0 * cp - z1 * sp;
        const z2 = y0 * sp + z1 * cp;
        const f = R * 3;
        const sc = f / (f + z2);
        return { x: cx + x1 * sc, y: cy - y2 * sc, sc, z: z2 };
      };

      ctx.globalCompositeOperation = "lighter";

      for (const d of dust) {
        const ang = d.a + (1 - d.r) * 2.6 + wt * 0.00002 * (0.6 + (1 - d.r)) * d.sp;
        const p = proj(d.r, ang, d.y);
        ctx.globalAlpha = d.al;
        ctx.fillStyle = "#e8b87d";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, d.sz * p.sc), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // memory embers
      const pm = new Map();
      const comp = [];
      for (const e of entriesRef.current) {
        let st = particlesRef.current.get(e.id);
        if (!st) {
          st = {
            base: hash01(e.id) * Math.PI * 2,
            yN: (hash01(e.id + "y") - 0.5) * 0.11,
            ph: hash01(e.id + "p") * Math.PI * 2,
            tw: 1.2 + hash01(e.id + "t") * 2.2,
            hs: hash01(e.id + "h"),
          };
          particlesRef.current.set(e.id, st);
        }
        const age = ageDays(e.date);
        const rN = 0.16 + 0.78 * Math.exp(-age / 70); // 오래될수록 중심으로
        const orb = 0.000022 + 0.00006 * (1 - rN);    // 중심일수록 빠른 공전
        const ang = st.base + (1 - rN) * 2.6 + wt * orb;
        comp.push({ e, st, age, p: proj(rN, ang, st.yN) });
      }
      comp.sort((a, b) => b.p.z - a.p.z);

      for (const c of comp) {
        const { e, st, age, p } = c;
        const recent = Math.exp(-age / 14);
        let px = p.x, py = p.y, boost = 1;

        if (st.spawnStart) {
          const tt = (now - st.spawnStart) / 1100;
          if (tt >= 1) delete st.spawnStart;
          else {
            const ez = 1 - Math.pow(1 - tt, 3);
            px = (w / 2) * (1 - ez) + p.x * ez;
            py = (h - 120) * (1 - ez) + p.y * ez;
            boost = 1.7 - 0.7 * ez;
          }
        }

        const twk = 0.72 + 0.28 * Math.sin(now * 0.001 * st.tw * (1 + recent * 1.6) + st.ph);
        const hov = hoverRef.current === e.id;
        const selHit = selectedRef.current && selectedRef.current.entry.id === e.id;
        const emph = hov || selHit;
        const sz = (2.1 + 2.7 * recent) * p.sc * boost * (emph ? 1.5 : 1);
        const alpha = Math.min(1, (0.42 + 0.58 * recent) * twk * boost * (emph ? 1.2 : 1));
        const hue = 32 + st.hs * 10;
        const light = 60 + 20 * recent;
        const sat = 95 - 25 * recent;

        const gr = ctx.createRadialGradient(px, py, 0, px, py, sz * 5.2);
        gr.addColorStop(0, `hsla(${hue},${sat}%,${light}%,${(alpha * 0.4).toFixed(3)})`);
        gr.addColorStop(1, `hsla(${hue},${sat}%,${light}%,0)`);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(px, py, sz * 5.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${hue},${sat}%,${light}%,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${hue - 4},100%,${Math.min(92, light + 22)}%,${(alpha * 0.9).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, sz * 0.45, 0, Math.PI * 2);
        ctx.fill();

        if (selHit) {
          ctx.strokeStyle = "rgba(255,214,150,0.85)";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(px, py, sz * 2.6 + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        pm.set(e.id, { x: px, y: py, s: sz });
      }
      projRef.current = pm;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /* ---------- pointer interaction ---------- */
  const hitTest = (x, y) => {
    let best = null, bd = 1e9;
    for (const [id, p] of projRef.current) {
      const d = Math.hypot(p.x - x, p.y - y);
      const th = Math.max(15, p.s * 4);
      if (d < th && d < bd) { bd = d; best = id; }
    }
    if (!best) return null;
    return entriesRef.current.find((e) => e.id === best) || null;
  };
  const onDown = (ev) => {
    const r = rotRef.current;
    r.down = true; r.moved = false;
    r.lx = ev.clientX; r.ly = ev.clientY;
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (e) {}
  };
  const onMove = (ev) => {
    const r = rotRef.current;
    if (r.down) {
      const dx = ev.clientX - r.lx, dy = ev.clientY - r.ly;
      if (Math.abs(dx) + Math.abs(dy) > 4) { r.moved = true; r.dragging = true; }
      r.lx = ev.clientX; r.ly = ev.clientY;
      if (r.dragging) {
        r.yaw += dx * 0.005;
        r.pitch = Math.max(-1.35, Math.min(-0.45, r.pitch + dy * 0.004));
      }
    } else {
      const hit = hitTest(ev.clientX, ev.clientY);
      hoverRef.current = hit ? hit.id : null;
      ev.currentTarget.style.cursor = hit ? "pointer" : "grab";
    }
  };
  const onUp = (ev) => {
    const r = rotRef.current;
    const was = r.moved;
    r.down = false; r.dragging = false;
    if (!was) {
      const hit = hitTest(ev.clientX, ev.clientY);
      if (hit) setSelected({ entry: hit, x: ev.clientX, y: ev.clientY });
      else setSelected(null);
    }
  };
  const onCancel = () => {
    const r = rotRef.current;
    r.down = false;
    r.dragging = false;
    r.moved = false;
  };

  /* ---------- actions ---------- */
  const addEntry = () => {
    const name = form.name.trim(), text = form.text.trim();
    if (!name || !text) return;
    const e = { id: mkId(), date: form.date || todayStr(), name, text, createdAt: Date.now() };
    particlesRef.current.set(e.id, {
      base: hash01(e.id) * Math.PI * 2,
      yN: (hash01(e.id + "y") - 0.5) * 0.11,
      ph: hash01(e.id + "p") * Math.PI * 2,
      tw: 1.8,
      hs: hash01(e.id + "h"),
      spawnStart: performance.now(),
    });
    // 첫 실제 기록이 들어오는 순간 미리보기 불씨를 걷어낸다.
    persist(demoMode ? [e] : [e, ...entries]);
    setDemoMode(false);
    setForm((f) => ({ ...f, text: "" }));
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
  };

  const removeEntry = (id) => {
    if (demoMode) return;
    particlesRef.current.delete(id);
    if (selected && selected.entry.id === id) setSelected(null);
    setConfirmDel(null);
    persist(entries.filter((e) => e.id !== id));
  };

  const openRetrieval = () => {
    const pool = [...entries];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setPicks(pool.slice(0, 3));
    setShowRetrieval(true);
  };

  const openOutbound = (name) => {
    const list = entries.filter((e) => e.name === name).sort((a, b) => b.date.localeCompare(a.date));
    if (!list.length) return;
    setCopied(false);
    setOb({ name, momentId: list[0].id, tone: "polite", tpl: 0 });
  };

  useEffect(() => {
    if (!ob) return;
    const e = entries.find((x) => x.id === ob.momentId);
    if (!e) return;
    setDraft(TPL[ob.tone][ob.tpl % 3](ob.name, e));
  }, [ob]); // eslint-disable-line

  const copyDraft = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(draft);
      ok = true;
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = draft;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        ok = true;
      } catch (e2) {}
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  /* ---------- derived ---------- */
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [entries]
  );
  const people = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(e.name, (m.get(e.name) || 0) + 1);
    return m;
  }, [entries]);
  const filter = personFilter && people.has(personFilter) ? personFilter : null;
  const shown = filter ? sorted.filter((e) => e.name === filter) : sorted;

  const logRows = useMemo(() => {
    const rows = [];
    let lastM = "";
    for (const e of shown) {
      const m = e.date.slice(0, 7);
      if (m !== lastM) {
        lastM = m;
        const [y, mo] = m.split("-");
        rows.push({ sep: `${y}년 ${+mo}월`, id: "sep-" + m });
      }
      rows.push({ e, id: e.id });
    }
    return rows;
  }, [shown]);

  const W = typeof window !== "undefined" ? window.innerWidth : 1000;
  const H = typeof window !== "undefined" ? window.innerHeight : 700;

  /* ════════════════ render ════════════════ */
  return (
    <div className="glroot" data-demo={demoMode ? "true" : "false"} style={{ position: "fixed", inset: 0, minHeight: "100dvh", overflow: "hidden", background: "#0e0c09" }}>
      <style>{CSS}</style>

      {/* galaxy canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onLostPointerCapture={onCancel}
        style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "grab" }}
      />

      {/* vignette */}
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 42%, transparent 52%, rgba(8,6,4,0.6) 100%)",
        }}
      />

      {/* ── header ── */}
      <div
        className="glheader"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 5,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, pointerEvents: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Sparkles size={16} color="#f0a24a" style={{ filter: "drop-shadow(0 0 6px rgba(240,162,74,.8))" }} />
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: ".5px", color: "#f5e6cb" }}>GlowLog</span>
          </div>
          <span className="gltag glmono" style={{ fontSize: 11, color: "#8a7b64" }}>
            따뜻한 순간만 캐싱하는 곳
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
          {entries.length > 0 && (
            <span className="glmono glcount" style={{ fontSize: 11, color: "#8a7b64", marginRight: 4 }}>
              {demoMode ? "미리보기" : `${entries.length}✦`}
            </span>
          )}
          {["galaxy", "log"].map((v) => (
            <button
              key={v}
              className="glviewbtn"
              onClick={() => { setView(v); setSelected(null); }}
              style={{
                background: view === v ? "rgba(240,162,74,0.16)" : "transparent",
                border: `1px solid ${view === v ? "rgba(240,162,74,0.5)" : "rgba(240,162,74,0.18)"}`,
                color: view === v ? "#ffd9a0" : "#a89a82",
                borderRadius: 999, padding: "6px 15px", fontSize: 13, cursor: "pointer",
              }}
            >
              {v === "galaxy" ? "은하계" : "로그"}
            </button>
          ))}
        </div>
      </div>

      {/* ── empty state ── */}
      {loaded && entries.length === 0 && view === "galaxy" && (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 14, zIndex: 3,
            pointerEvents: "none", animation: "glfade .8s ease",
          }}
        >
          <div style={{ fontSize: 22, color: "#c9b895" }}>아직 은하가 비어 있어요</div>
          <div style={{ fontSize: 14, color: "#8a7b64" }}>아래에서 첫 번째 좋은 순간을 커밋해 보세요</div>
          <button
            className="glghostbtn"
            onClick={() => {
              try { window.localStorage.removeItem(KEY); } catch (e) {}
              setEntries(makeSamples());
              setDemoMode(true);
            }}
            style={{
              pointerEvents: "auto", marginTop: 8, background: "transparent",
              border: "1px solid rgba(240,162,74,0.35)", color: "#c9b895",
              borderRadius: 999, padding: "8px 18px", fontSize: 13, cursor: "pointer",
            }}
          >
            샘플 불씨로 미리보기 ✦
          </button>
        </div>
      )}

      {/* ── first-visit hook: 완성된 감각을 먼저, 입력 요구는 나중에 ── */}
      {loaded && demoMode && view === "galaxy" && (
        <div
          style={{
            position: "absolute", left: "50%", top: "18%", zIndex: 3,
            transform: "translateX(-50%)", width: "min(430px, 88vw)",
            textAlign: "center", pointerEvents: "none", animation: "glfade .8s ease",
          }}
        >
          <div className="glmono" style={{ fontSize: 10.5, color: "#a78c65", letterSpacing: "1.4px", marginBottom: 8 }}>
            PREVIEW GALAXY
          </div>
          <div style={{ fontSize: "clamp(18px, 4vw, 24px)", color: "#ead8bb", lineHeight: 1.45 }}>
            좋았던 순간은 사라지지 않고<br />당신 주위를 천천히 돕니다
          </div>
          <div style={{ fontSize: 12.5, color: "#81725d", marginTop: 10, lineHeight: 1.55 }}>
            아래에 한 줄을 남기면, 이 미리보기는 당신의 첫 불씨로 바뀝니다
          </div>
        </div>
      )}

      {/* ── flash commit bar (galaxy only) ── */}
      {view === "galaxy" && (
        <div className="glcommit-wrap" style={{ position: "absolute", bottom: 18, left: 0, right: 0, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
          <Panel
            className="glcommit-panel"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 12px", width: "min(680px, 93vw)", borderRadius: 999,
            }}
          >
            <div className={`glcommit-fields ${flash ? "glflash" : ""}`} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, borderRadius: 999 }}>
              <input
                className="glmono gldate"
                aria-label="날짜"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                style={{
                  width: 128, background: "transparent", border: "none", color: "#a89a82",
                  fontSize: 12.5, colorScheme: "dark", flexShrink: 0,
                }}
              />
              <span style={{ color: "#4a4235" }}>│</span>
              <input
                className="glnamein"
                aria-label="함께한 사람 이름"
                placeholder="이름"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addEntry()}
                style={{ width: 92, background: "transparent", border: "none", color: "#ffd9a0", fontSize: 14, flexShrink: 0 }}
              />
              <span style={{ color: "#4a4235" }}>│</span>
              <input
                className="glmomentin"
                aria-label="좋았던 순간"
                placeholder="미소 지었던 순간 한 줄"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addEntry()}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "#efe3cf", fontSize: 14 }}
              />
            </div>
            <button
              title="커밋"
              onClick={addEntry}
              disabled={!form.name.trim() || !form.text.trim()}
              style={{
                width: 38, height: 38, borderRadius: "50%", border: "none", flexShrink: 0,
                background: form.name.trim() && form.text.trim()
                  ? "linear-gradient(135deg,#f0a24a,#d9822e)"
                  : "rgba(240,162,74,0.15)",
                color: "#1d1509", fontSize: 17, cursor: form.name.trim() && form.text.trim() ? "pointer" : "default",
                boxShadow: form.name.trim() && form.text.trim() ? "0 0 16px rgba(240,162,74,.4)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✦
            </button>
          </Panel>
          <div className="glmono glpositive" style={{ fontSize: 10.5, color: "#6b6152", letterSpacing: ".3px" }}>
            {demoMode ? "미리보기는 저장되지 않습니다 · 첫 기록부터 당신의 은하가 됩니다" : "Positive-only · 이 브라우저에만 조용히 저장됩니다"}
          </div>
        </div>
      )}

      {/* ── warmth retrieval FAB ── */}
      {loaded && entries.length > 0 && (
        <button
          className={`glfabpulse glfab-${view}`}
          title="온기 리트리벌 — 지칠 때 누르는 충전 버튼"
          onClick={openRetrieval}
          style={{
            position: "absolute", right: 20, bottom: view === "galaxy" ? 104 : 24, zIndex: 5,
            width: 54, height: 54, borderRadius: "50%", border: "1px solid rgba(255,210,150,.4)",
            background: "radial-gradient(circle at 35% 30%, #ffcf8f, #e08a2e 70%)",
            color: "#2a1c0a", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
          }}
        >
          <Flame size={20} />
          <span style={{ fontSize: 9, fontWeight: 700 }}>충전</span>
        </button>
      )}

      {/* ── ember popup ── */}
      {selected && view === "galaxy" && (
        <Panel
          style={{
            position: "fixed", zIndex: 6, width: 272, padding: "14px 16px",
            left: Math.max(10, Math.min(selected.x + 14, W - 286)),
            top: Math.max(64, Math.min(selected.y - 20, H - 210)),
            animation: "glin .35s ease",
          }}
        >
          <button
            onClick={() => setSelected(null)}
            style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "#6b6152", cursor: "pointer", padding: 4 }}
          >
            <X size={14} />
          </button>
          <div className="glmono" style={{ fontSize: 11, color: "#8a7b64", marginBottom: 4 }}>{selected.entry.date}</div>
          <div style={{ fontSize: 15, color: "#ffd9a0", fontWeight: 700, marginBottom: 6 }}>[{selected.entry.name}]</div>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: "#efe3cf", marginBottom: 12 }}>{selected.entry.text}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <GhostBtn
              style={{ fontSize: 12, padding: "6px 12px" }}
              onClick={() => { setPersonFilter(selected.entry.name); setView("log"); setSelected(null); }}
            >
              로그 보기
            </GhostBtn>
            <GhostBtn
              style={{ fontSize: 12, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => { openOutbound(selected.entry.name); setSelected(null); }}
            >
              <Send size={12} /> 온기 보내기
            </GhostBtn>
          </div>
        </Panel>
      )}

      {/* ── git-log view ── */}
      {view === "log" && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 4, overflowY: "auto",
            background: "rgba(12,10,7,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            padding: "76px 16px 40px", animation: "glfade .3s ease",
          }}
        >
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            {/* people chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
              <button
                onClick={() => setPersonFilter(null)}
                style={{
                  background: !filter ? "rgba(240,162,74,0.16)" : "transparent",
                  border: `1px solid ${!filter ? "rgba(240,162,74,0.5)" : "rgba(240,162,74,0.18)"}`,
                  color: !filter ? "#ffd9a0" : "#a89a82",
                  borderRadius: 999, padding: "5px 13px", fontSize: 12.5, cursor: "pointer",
                }}
              >
                전체 ({entries.length})
              </button>
              {[...people.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => (
                <button
                  key={n}
                  onClick={() => setPersonFilter(filter === n ? null : n)}
                  style={{
                    background: filter === n ? "rgba(240,162,74,0.16)" : "transparent",
                    border: `1px solid ${filter === n ? "rgba(240,162,74,0.5)" : "rgba(240,162,74,0.18)"}`,
                    color: filter === n ? "#ffd9a0" : "#a89a82",
                    borderRadius: 999, padding: "5px 13px", fontSize: 12.5, cursor: "pointer",
                  }}
                >
                  {n} ({c})
                </button>
              ))}
            </div>

            {/* person header */}
            {filter && (
              <Panel style={{ padding: "16px 20px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: "#ffd9a0" }}>{filter}</div>
                  <div className="glmono" style={{ fontSize: 11.5, color: "#8a7b64", marginTop: 4 }}>
                    불씨 {shown.length}개 · {shown[shown.length - 1].date} ~ {shown[0].date}
                  </div>
                </div>
                <AmberBtn onClick={() => openOutbound(filter)}>
                  <Send size={14} /> 온기 보내기
                </AmberBtn>
              </Panel>
            )}

            {/* log lines */}
            {shown.length === 0 ? (
              <div style={{ textAlign: "center", color: "#8a7b64", padding: "60px 0", fontSize: 14 }}>
                아직 기록이 없어요. 은하계 화면에서 첫 순간을 커밋해 보세요.
              </div>
            ) : (
              logRows.map((row) =>
                row.sep ? (
                  <div key={row.id} className="glmono" style={{ fontSize: 11, color: "#6b6152", margin: "20px 0 8px", letterSpacing: "1px" }}>
                    ── {row.sep} ──
                  </div>
                ) : (
                  <div
                    key={row.id}
                    className="glrow"
                    style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 10px", borderRadius: 8 }}
                  >
                    <span className="glmono" style={{ fontSize: 12, color: "#8a7b64", flexShrink: 0 }}>{row.e.date}</span>
                    <span style={{ color: "#4a4235", flexShrink: 0 }}>│</span>
                    <button
                      onClick={() => setPersonFilter(row.e.name)}
                      style={{ background: "none", border: "none", color: "#ffd9a0", fontSize: 13.5, cursor: "pointer", padding: 0, flexShrink: 0, fontWeight: 700 }}
                    >
                      [{row.e.name}]
                    </button>
                    <span style={{ fontSize: 14, color: "#e6d8c0", lineHeight: 1.6, flex: 1 }}>{row.e.text}</span>
                    {!demoMode && (confirmDel === row.e.id ? (
                      <button
                        onClick={() => removeEntry(row.e.id)}
                        className="glmono"
                        style={{ background: "rgba(200,80,60,.18)", border: "1px solid rgba(220,100,80,.5)", color: "#e89a86", borderRadius: 6, fontSize: 11, padding: "3px 9px", cursor: "pointer", flexShrink: 0 }}
                      >
                        삭제 확정
                      </button>
                    ) : (
                      <button
                        className="gldel"
                        title="오타 정정용 삭제"
                        onClick={() => { setConfirmDel(row.e.id); setTimeout(() => setConfirmDel((c) => (c === row.e.id ? null : c)), 2500); }}
                        style={{ background: "none", border: "none", color: "#6b6152", cursor: "pointer", padding: 2, flexShrink: 0 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    ))}
                  </div>
                )
              )
            )}
          </div>
        </div>
      )}

      {/* ── warmth retrieval overlay ── */}
      {showRetrieval && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 10,
            background: "rgba(10,8,5,0.88)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: 20, animation: "glfade .35s ease", overflowY: "auto",
          }}
        >
          <Flame size={26} color="#f0a24a" style={{ filter: "drop-shadow(0 0 10px rgba(240,162,74,.9))", marginBottom: 8 }} />
          <div style={{ fontSize: 19, fontWeight: 700, color: "#f5e6cb", marginBottom: 4 }}>온기 리트리벌</div>
          <div style={{ fontSize: 12.5, color: "#8a7b64", marginBottom: 24 }}>
            당신이 직접 모아둔, 실제로 있었던 일들이에요
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "min(520px, 92vw)" }}>
            {picks.map((e, i) => (
              <div
                key={e.id}
                style={{
                  background: "rgba(32,25,17,0.94)",
                  border: "1px solid rgba(255,200,130,0.32)",
                  boxShadow: "0 0 38px rgba(240,162,74,.18)",
                  borderRadius: 16, padding: "18px 20px",
                  animation: `glin .6s ease ${i * 0.32}s both, glfloat 5s ease-in-out ${i * 0.7}s infinite`,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 7 }}>
                  <span className="glmono" style={{ fontSize: 11, color: "#8a7b64" }}>{e.date}</span>
                  <span style={{ fontSize: 14, color: "#ffd9a0", fontWeight: 700 }}>[{e.name}]</span>
                </div>
                <div style={{ fontSize: 15.5, lineHeight: 1.7, color: "#f2e7d2" }}>{e.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
            <GhostBtn onClick={openRetrieval} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Shuffle size={13} /> 한 번 더
            </GhostBtn>
            <AmberBtn onClick={() => setShowRetrieval(false)}>충전 완료</AmberBtn>
          </div>
        </div>
      )}

      {/* ── outbound warmth modal ── */}
      {ob && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 10,
            background: "rgba(10,8,5,0.8)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            animation: "glfade .3s ease",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOb(null); }}
        >
          <Panel style={{ width: "min(560px, 94vw)", maxHeight: "88vh", overflowY: "auto", padding: "22px 24px", position: "relative", animation: "glin .35s ease" }}>
            <button
              onClick={() => setOb(null)}
              style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: "#6b6152", cursor: "pointer", padding: 4 }}
            >
              <X size={16} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Send size={15} color="#f0a24a" />
              <span style={{ fontSize: 17, fontWeight: 700, color: "#f5e6cb" }}>{ob.name}에게 온기 보내기</span>
            </div>
            <div style={{ fontSize: 12, color: "#8a7b64", marginBottom: 16 }}>
              기록해 둔 실제 순간 기반이라 갑작스러워도 부담이 없어요. 보내기 전 자유롭게 다듬으세요.
            </div>

            <div className="glmono" style={{ fontSize: 11, color: "#8a7b64", marginBottom: 7, letterSpacing: ".5px" }}>어떤 순간으로?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto", marginBottom: 16, paddingRight: 4 }}>
              {entries
                .filter((e) => e.name === ob.name)
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setOb({ ...ob, momentId: e.id })}
                    style={{
                      textAlign: "left",
                      background: ob.momentId === e.id ? "rgba(240,162,74,0.12)" : "transparent",
                      border: `1px solid ${ob.momentId === e.id ? "rgba(240,162,74,0.5)" : "rgba(240,162,74,0.14)"}`,
                      color: "#e6d8c0", borderRadius: 10, padding: "8px 12px", fontSize: 13, cursor: "pointer", lineHeight: 1.5,
                    }}
                  >
                    <span className="glmono" style={{ color: "#8a7b64", fontSize: 11, marginRight: 8 }}>{e.date}</span>
                    {e.text}
                  </button>
                ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {[["polite", "존댓말"], ["casual", "반말"]].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setOb({ ...ob, tone: k })}
                  style={{
                    background: ob.tone === k ? "rgba(240,162,74,0.16)" : "transparent",
                    border: `1px solid ${ob.tone === k ? "rgba(240,162,74,0.5)" : "rgba(240,162,74,0.18)"}`,
                    color: ob.tone === k ? "#ffd9a0" : "#a89a82",
                    borderRadius: 999, padding: "5px 14px", fontSize: 12.5, cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
              <GhostBtn
                onClick={() => setOb({ ...ob, tpl: ob.tpl + 1 })}
                style={{ fontSize: 12.5, padding: "5px 13px", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <Shuffle size={12} /> 다른 문장
              </GhostBtn>
            </div>

            <textarea
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{
                width: "100%", background: "rgba(14,11,8,0.7)", border: "1px solid rgba(240,162,74,0.22)",
                borderRadius: 12, color: "#f2e7d2", fontSize: 14.5, lineHeight: 1.7, padding: "12px 14px",
                resize: "vertical", marginBottom: 14,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <AmberBtn onClick={copyDraft}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "복사됨" : "복사하기"}
              </AmberBtn>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
