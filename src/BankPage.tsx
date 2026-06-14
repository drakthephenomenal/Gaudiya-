import { useEffect, useRef, useState, useCallback } from "react";
import { NAMES_28, type Name28 } from "../names28";
import "./bank.css";

/* ─── Types ──────────────────────────────────────── */
interface Vessel { filled: boolean; glowing: boolean; }
interface FloatingToken {
  id: number; name: string; nameHindi: string;
  startX: number; startY: number;
  destX: number; destY: number;
  isCycleDeposit: boolean;
}
interface Spark { id: number; cx: number; cy: number; angle: number; dist: number; color: string; }

let idCounter = 0;

/* ─── Vessel grid ──────────────────────────────────── */
const ROWS = 4, COLS = 7;
const VESSEL_GRID = Array.from({ length: ROWS * COLS }, (_, i) => {
  const row = Math.floor(i / COLS), col = i % COLS;
  const cellW = (81 - 19) / COLS, cellH = (73 - 39) / ROWS;
  return {
    left:   19 + col * cellW + cellW * 0.06,
    top:    39 + row * cellH + cellH * 0.06,
    width:  cellW * 0.88,
    height: cellH * 0.88,
  };
});

/* ─── Jap Timer hook ──────────────────────────────── */
function useJapTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef   = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    if (startRef.current === null) startRef.current = Date.now() - elapsed * 1000;
    const tick = () => {
      setElapsed(Math.floor((Date.now() - startRef.current!) / 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };
  return fmt(elapsed);
}

/* ─── Main component ──────────────────────────────── */
export default function BankPage() {
  const [vessels,       setVessels]       = useState<Vessel[]>(() => Array.from({ length: 28 }, () => ({ filled: false, glowing: false })));
  const [floatingItems, setFloatingItems] = useState<FloatingToken[]>([]);
  const [sparks,        setSparks]        = useState<Spark[]>([]);
  const [nameIdx,       setNameIdx]       = useState(0);
  const [cycleCount,    setCycleCount]    = useState(0);
  const [showHindi,     setShowHindi]     = useState(false);
  const [hasStarted,    setHasStarted]    = useState(false);
  const [statsOpen,     setStatsOpen]     = useState(false);
  const [wishesOpen,    setWishesOpen]    = useState(false);
  const [history,       setHistory]       = useState<number[]>([]);

  const bankWrapRef = useRef<HTMLDivElement>(null);
  const tapZoneRef  = useRef<HTMLDivElement>(null);
  const nameTapRef  = useRef<HTMLDivElement>(null);

  const japTime     = useJapTimer(hasStarted);
  const currentName: Name28 = NAMES_28[nameIdx];
  const filledCount = vessels.filter(v => v.filled).length;
  const allFilled   = filledCount === 28;

  const getVesselCenter = useCallback((idx: number) => {
    const wrap = bankWrapRef.current, tz = tapZoneRef.current;
    if (!wrap || !tz) return { x: 0, y: 0 };
    const wRect = wrap.getBoundingClientRect(), tzRect = tz.getBoundingClientRect();
    const v = VESSEL_GRID[idx];
    return {
      x: wRect.left - tzRect.left + wRect.width  * (v.left  + v.width  / 2) / 100,
      y: wRect.top  - tzRect.top  + wRect.height * (v.top   + v.height / 2) / 100,
    };
  }, []);

  const spawnSparks = useCallback((cx: number, cy: number) => {
    const colors = ["#FFD93D","#FFF8DC","#6DB8FF","#fff","#FFAA00","#FFD700","#FF9900"];
    const s: Spark[] = Array.from({ length: 14 }, (_, i) => ({
      id: ++idCounter, cx, cy,
      angle: (i / 14) * Math.PI * 2 + Math.random() * 0.3,
      dist: 20 + Math.random() * 35,
      color: colors[i % colors.length],
    }));
    setSparks(p => [...p, ...s]);
    setTimeout(() => setSparks(p => p.filter(sp => !s.find(n => n.id === sp.id))), 900);
  }, []);

  const handleTap = useCallback(() => {
    if (allFilled) return;
    if (!hasStarted) setHasStarted(true);

    const tz = tapZoneRef.current, nameEl = nameTapRef.current;
    if (!tz || !nameEl) return;

    const tzRect   = tz.getBoundingClientRect();
    const nameRect = nameEl.getBoundingClientRect();
    const startX   = nameRect.left - tzRect.left + nameRect.width / 2;
    const startY   = nameRect.top  - tzRect.top;

    /* Each tap fills its own vessel: tap 1 → vessel 0, tap 2 → vessel 1, etc. */
    const vesselIdx = nameIdx;
    const vc = getVesselCenter(vesselIdx);
    const isLast = nameIdx === 27;

    const id = ++idCounter;
    setFloatingItems(p => [...p, {
      id,
      name: currentName.name, nameHindi: currentName.nameHindi,
      startX, startY,
      destX: vc.x, destY: vc.y,
      isCycleDeposit: true,
    }]);

    setHistory(h => [...h.slice(-49), nameIdx]);
    setNameIdx(i => (i + 1) % 28);
    if (isLast) setCycleCount(c => c + 1);

    /* Slow travel: 4.5s to vessel */
    const TRAVEL = 4500;
    setTimeout(() => {
      setFloatingItems(p => p.filter(f => f.id !== id));
      setVessels(p => { const n = [...p]; n[vesselIdx] = { filled: true, glowing: true }; return n; });
      const vc2 = getVesselCenter(vesselIdx);
      spawnSparks(vc2.x, vc2.y);
      setTimeout(() => setVessels(p => { const n = [...p]; n[vesselIdx] = { ...n[vesselIdx], glowing: false }; return n; }), 1400);
    }, TRAVEL);
  }, [allFilled, hasStarted, nameIdx, currentName, getVesselCenter, spawnSparks]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setNameIdx(prev);
    if (prev === 27 && cycleCount > 0) setCycleCount(c => c - 1);
  };

  const resetAll = () => {
    setVessels(Array.from({ length: 28 }, () => ({ filled: false, glowing: false })));
    setNameIdx(0); setCycleCount(0);
    setFloatingItems([]); setSparks([]);
    setHasStarted(false); setHistory([]);
  };

  const cycleProgress = (cycleCount + nameIdx / 28) % 1 || (nameIdx / 28);

  return (
    <div className="bk-root">

      {/* ── Top bar ──────────────────────────── */}
      <header className="bk-topbar">
        <div className="bk-topbar-left">
          <button className="bk-pill-btn" onClick={() => setStatsOpen(true)}>
            <span className="bk-pill-icon">📊</span> Stats
          </button>
          <button className="bk-pill-btn" onClick={handleUndo} disabled={history.length === 0}>
            <span className="bk-pill-icon">↩</span> Undo
          </button>
        </div>
        <div className="bk-topbar-right">
          <button className="bk-pill-btn bk-pill-lang" onClick={() => setShowHindi(h => !h)}>
            {showHindi ? "বাংলা" : "हिन्दी"}
          </button>
          <button className="bk-pill-btn" onClick={() => setWishesOpen(true)}>
            <span className="bk-pill-icon">🙏</span> Wishes
          </button>
        </div>
      </header>

      {/* ── Bank label ──────────────────────── */}
      <div className="bk-bank-label">Sri Harivangsa Bank</div>

      {/* ── Tap zone ────────────────────────── */}
      <div className="bk-tapzone" ref={tapZoneRef}>

        {/* Bank + vessels */}
        <div className="bk-bank-wrap" ref={bankWrapRef}>
          <img className="bk-bank-img" src="/harivangsa-bank-nobg.png" alt="Sri Harivangsa Bank" draggable={false} />

          {VESSEL_GRID.map((v, i) => (
            <div key={i}
              className={["bk-vessel", vessels[i]?.filled ? "filled" : "", vessels[i]?.glowing ? "glowing" : ""].join(" ")}
              style={{ left: `${v.left}%`, top: `${v.top}%`, width: `${v.width}%`, height: `${v.height}%` }}
            >
              {vessels[i]?.filled && <img src="/radha-coin.png" alt="" className="bk-vessel-coin" />}
            </div>
          ))}

          {allFilled && (
            <div className="bk-complete">
              <div>✨ सभी 28 पात्र भर गए ✨</div>
              <div className="bk-complete-sub">{cycleCount} माला पूर्ण</div>
              <button className="bk-reset-btn" onClick={resetAll}>नई माला शुरू करें</button>
            </div>
          )}
        </div>

        {/* Floating tokens */}
        {floatingItems.map(item => <FloatingTokenEl key={item.id} item={item} showHindi={showHindi} />)}

        {/* Sparks */}
        {sparks.map(sp => (
          <div key={sp.id} className="bk-spark"
            style={{ left: sp.cx, top: sp.cy, background: sp.color, boxShadow: `0 0 7px ${sp.color}`,
              "--ex": `${Math.cos(sp.angle) * sp.dist}px`, "--ey": `${Math.sin(sp.angle) * sp.dist}px` } as React.CSSProperties}
          />
        ))}

        {/* ── Name tap area ─────────────────── */}
        <div className="bk-name-area" ref={nameTapRef} onClick={handleTap} role="button" tabIndex={0}
          onKeyDown={e => (e.key === " " || e.key === "Enter") && (e.preventDefault(), handleTap())}
          aria-label={`Tap to chant: ${currentName.name}`}
        >
          <div className="bk-name-text">
            {showHindi ? currentName.nameHindi : currentName.name}
          </div>
          <div className="bk-name-meaning">{currentName.meaning}</div>
        </div>

      </div>{/* end tapzone */}

      {/* ── Daily progress strip ─────────────── */}
      <div className="bk-progress-strip">
        <div className="bk-progress-top">
          <span className="bk-progress-label">Daily Progress</span>
          <span className="bk-progress-meta">{cycleCount} cycle{cycleCount !== 1 ? "s" : ""} · {nameIdx}/{28}</span>
        </div>
        <div className="bk-progress-track">
          <div className="bk-progress-fill" style={{ width: `${(nameIdx / 28) * 100}%` }} />
        </div>
        <div className="bk-jap-time">Today's Jap Time : {japTime}</div>
      </div>

      {/* ── Bottom nav ──────────────────────── */}
      <nav className="bk-bottomnav">
        {[
          { icon: "🕉️",  label: "Jap"        },
          { icon: "☸️",  label: "28 Names",  active: true },
          { icon: "📜",  label: "Stotram"    },
          { icon: "🛡️",  label: "B&C"        },
          { icon: "🏆",  label: "Milestones" },
          { icon: "⭐",  label: "Stars"      },
          { icon: "👥",  label: "Community"  },
          { icon: "⚙️",  label: "Settings"   },
        ].map(tab => (
          <div key={tab.label} className={`bk-tab${tab.active ? " bk-tab-active" : ""}`}>
            <span className="bk-tab-icon">{tab.icon}</span>
            <span className="bk-tab-label">{tab.label}</span>
          </div>
        ))}
      </nav>

      {/* ── Stats overlay ───────────────────── */}
      {statsOpen && (
        <div className="bk-overlay" onClick={() => setStatsOpen(false)}>
          <div className="bk-modal" onClick={e => e.stopPropagation()}>
            <div className="bk-modal-title">📊 Statistics</div>
            <div className="bk-stat-row"><span>Cycles complete</span><strong>{cycleCount}</strong></div>
            <div className="bk-stat-row"><span>Names today</span><strong>{cycleCount * 28 + nameIdx}</strong></div>
            <div className="bk-stat-row"><span>Vessels filled</span><strong>{filledCount} / 28</strong></div>
            <div className="bk-stat-row"><span>Jap time</span><strong>{japTime}</strong></div>
            <button className="bk-modal-close" onClick={() => setStatsOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {/* ── Wishes overlay ──────────────────── */}
      {wishesOpen && (
        <div className="bk-overlay" onClick={() => setWishesOpen(false)}>
          <div className="bk-modal" onClick={e => e.stopPropagation()}>
            <div className="bk-modal-title">🙏 Wishes</div>
            <div style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.7, textAlign: "center" }}>
              राधे राधे 🌸<br />
              May Shri Radha Rani bless you<br />
              with devotion, peace, and love.<br /><br />
              <em>Chant Her 28 Names<br />to fill the sacred vessels.</em>
            </div>
            <button className="bk-modal-close" onClick={() => setWishesOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Floating Token ──────────────────────────────── */
function FloatingTokenEl({ item, showHindi }: { item: FloatingToken; showHindi: boolean }) {
  const [sty, setSty] = useState<React.CSSProperties>({
    position: "absolute", left: item.startX, top: item.startY,
    transform: "translate(-50%, -100%) scale(0)", opacity: 0,
    pointerEvents: "none", zIndex: 40,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    transition: "none", willChange: "transform, left, top, opacity",
  });

  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      setSty(s => ({ ...s, transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease", transform: "translate(-50%,-115%) scale(1)", opacity: 1 }));
    }));
    const t = setTimeout(() => {
      /* slow, graceful travel — 4.2s to vessel */
      const travel = 4.2;
      setSty(s => ({
        ...s,
        transition: [`left ${travel}s cubic-bezier(0.3,0.5,0.4,1)`, `top ${travel}s cubic-bezier(0.3,0.5,0.4,1)`, `transform ${travel + 0.3}s ease-out`, `opacity 0.6s ${travel - 0.7}s ease`].join(","),
        left: item.destX, top: item.destY,
        transform: "translate(-50%,-50%) scale(0.12)", opacity: 0,
      }));
    }, 420);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [item.destX, item.destY, item.isCycleDeposit]);

  return (
    <div style={sty}>
      <img src="/radha-coin.png" alt="" style={{ width: 88, height: 88, objectFit: "contain", animation: "bkCoinSpin 2.5s linear infinite", filter: "drop-shadow(0 0 16px rgba(255,215,0,1)) drop-shadow(0 0 36px rgba(255,180,0,0.7))" }} />
      <span style={{ fontFamily: "'Hind Siliguri',sans-serif", fontSize: "clamp(17px,4.5vw,26px)", fontWeight: 700, color: "#FFD93D", textShadow: "0 0 18px rgba(255,215,0,0.9)", whiteSpace: "nowrap" }}>
        {showHindi ? item.nameHindi : item.name}
      </span>
    </div>
  );
}
