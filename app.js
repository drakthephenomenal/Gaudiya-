/* === GPS dedupe (auto-added): coalesce concurrent getCurrentPosition calls and cache for 60s
   Fixes double location prompt / double initial load. === */
(function(){
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  if (navigator.geolocation.__lcDeduped) return;
  var orig = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  var waiters = null;
  var cached = null;
  navigator.geolocation.getCurrentPosition = function(success, error, options){
    try {
      if (cached && Date.now() - cached.ts < 60000) {
        if (success) { try { success(cached.pos); } catch(e){ console.error(e); } }
        return;
      }
      if (waiters) { waiters.push({ s: success, e: error }); return; }
      waiters = [{ s: success, e: error }];
      orig(
        function(pos){
          cached = { pos: pos, ts: Date.now() };
          var w = waiters; waiters = null;
          w.forEach(function(cb){ if (cb.s) { try { cb.s(pos); } catch(e){ console.error(e); } } });
        },
        function(err){
          var w = waiters; waiters = null;
          w.forEach(function(cb){ if (cb.e) { try { cb.e(err); } catch(e){ console.error(e); } } });
        },
        options || {}
      );
    } catch(e){ console.error(e); if (error) try { error(e); } catch(_){} }
  };
  navigator.geolocation.__lcDeduped = true;
})();

// ═══════════════════════════════════════
// Radha Naam Jap — app.js
// ═══════════════════════════════════════

// ═══════════════════════════════════════════════════════
// APP — Single unified state object
// ═══════════════════════════════════════════════════════
const App = {
  // ── State ──
  S: {
    tk: "",
    ms: 108,
    dt: 0,
    lt: 0,
    cfg: { vib: true, sound: true, soundType: "shankya" },
    history: {},
    h28: {},
    stotrams: {},
    brahma: {},
    customSt: [],
    timerHistory: {},
    timer28History: {},
    sankalpas: [],
    occasions: {},
    syncBaseline: {},
    syncBaseline28: {},
    syncBaselineTimer: {},
    syncBaselineTimer28: {},
    migrationV2Done: false,
    japMode: "radha",
    historyRV: {},
    timerHistoryRV: {},
    dtRV: 0,
    ltRV: 0,
    nameJapDeductRV: 0,
    malaLogRV: [],
    syncBaselineRV: {},
    syncBaselineTimerRV: {},
    activityLog: [],
    sadhanaStart: "",
    milestones: { reached: {}, lastChecked: 0 },
    historyHK: {},
    timerHistoryHK: {},
    dtHK: 0,
    malaLogHK: [],
    syncBaselineHK: {},
    syncBaselineTimerHK: {},
    nameJapDeductHK: 0,
    gaudiyaMode: false,  // single mode for all — Gaudiya/ISKCON
    hkLang: "hi",
    lbOptIn: false,        // leaderboard opt-in
    lbDisplayName: "",     // leaderboard display name
    bgRadhaVallabh: 1,
    bgHitju: 1,
    bgGurudev: 1,
  },
  lmcRV: 0,
  lmcHK: 0,
  lmc: 0,
  lm28: 0,
  timerRunning: false,
  timerSeconds: 0,
  timerInterval: null,
  timerSavedSeconds: 0,
  autoStopTimeout: null,
  malaWallStart: 0, // Date.now() at start of current mala (persisted in localStorage)
  fbDebouncePush: null,

  // ── IndexedDB ──
  db: null,

  // ── Current signed-in UID (set by Firebase auth callback) ──
  _uid: null,

  // ── IDB key prefix scoped to UID (guest = 'guest') ──
  _stateKey() {
    return (this._uid || "guest") + ":main";
  },
  _lsKey() {
    return "rjap5_" + (this._uid || "guest");
  },

  async initDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open("RadhaJapDB", 4);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("state"))
          db.createObjectStore("state");
        if (!db.objectStoreNames.contains("history"))
          db.createObjectStore("history");
        if (!db.objectStoreNames.contains("h28")) db.createObjectStore("h28");
        if (!db.objectStoreNames.contains("timerHistory"))
          db.createObjectStore("timerHistory");
        if (!db.objectStoreNames.contains("timer28History"))
          db.createObjectStore("timer28History");
        if (!db.objectStoreNames.contains("malaLog"))
          db.createObjectStore("malaLog");
        // v4: lifetime per-day activityLog archive — no entry limit
        if (!db.objectStoreNames.contains("activityLogArchive"))
          db.createObjectStore("activityLogArchive");
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        res();
      };
      req.onerror = () => rej(req.error);
    });
  },

  async dbGet(store, key) {
    if (!this.db) return null;
    return new Promise((res) => {
      const tx = this.db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => res(null);
    });
  },

  async dbPut(store, key, value) {
    if (!this.db) return;
    return new Promise((res) => {
      const tx = this.db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = res;
    });
  },

  async dbGetAll(store) {
    if (!this.db) return {};
    return new Promise((res) => {
      const tx = this.db.transaction(store, "readonly");
      const os = tx.objectStore(store);
      const result = {};
      const req = os.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          result[cursor.key] = cursor.value;
          cursor.continue();
        } else res(result);
      };
      req.onerror = () => res({});
    });
  },

  async dbClearStore(store) {
    if (!this.db) return;
    return new Promise((res) => {
      const tx = this.db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = res;
      tx.onerror = res;
    });
  },

  async save() {
    // GUEST MODE: never persist to IDB or localStorage — guest jap is intentionally ephemeral.
    // Only signed-in users get local persistence (as an offline buffer for cloud sync).
    if (!this._uid) return;
    // Save full state snapshot to IDB so all dates and edits persist locally
    await this.dbPut("state", this._stateKey(), {
      ms: this.S.ms,
      dt: this.S.dt,
      lt: this.S.lt,
      nameJapDeduct: this.S.nameJapDeduct || 0,
      malaLog: this.S.malaLog || [],
      malaLogDate: this.S.tk,
      cfg: this.S.cfg,
      stotrams: this.S.stotrams,
      brahma: this.S.brahma,
      customSt: this.S.customSt,
      sankalpas: this.S.sankalpas,
      occasions: this.S.occasions,
      history: this.S.history,
      h28: this.S.h28,
      timerHistory: this.S.timerHistory,
      timer28History: this.S.timer28History,
      syncBaseline: this.S.syncBaseline,
      syncBaseline28: this.S.syncBaseline28,
      syncBaselineTimer: this.S.syncBaselineTimer,
      syncBaselineTimer28: this.S.syncBaselineTimer28,
      migrationV2Done: this.S.migrationV2Done,
      japMode: this.S.japMode,
      historyRV: this.S.historyRV,
      timerHistoryRV: this.S.timerHistoryRV,
      dtRV: this.S.dtRV,
      ltRV: this.S.ltRV,
      nameJapDeductRV: this.S.nameJapDeductRV,
      malaLogRV: this.S.malaLogRV,
      syncBaselineRV: this.S.syncBaselineRV,
      syncBaselineTimerRV: this.S.syncBaselineTimerRV,
      brahmacharya_start_date: this.S.brahmacharya_start_date,
      activityLog: this.S.activityLog || [],
      sadhanaStart: this.S.sadhanaStart || "",
      historyHK: this.S.historyHK || {},
      timerHistoryHK: this.S.timerHistoryHK || {},
      dtHK: this.S.dtHK || 0,
      malaLogHK: this.S.malaLogHK || [],
      syncBaselineHK: this.S.syncBaselineHK || {},
      syncBaselineTimerHK: this.S.syncBaselineTimerHK || {},
      nameJapDeductHK: this.S.nameJapDeductHK || 0,
      gaudiyaMode: this.S.gaudiyaMode || false,
      dt28Cycles: this.S.dt28Cycles || 0,
      milestones: this.S.milestones || { reached: {}, lastChecked: 0 },
      hkLang: this.S.hkLang || "hi",
      lastLat: this.S.lastLat ?? null,
      lastLng: this.S.lastLng ?? null,
    });
    // Keep per-day stores updated for compatibility with existing offline data
    const tk = this.S.tk;
    if (this.S.history[tk] !== undefined)
      await this.dbPut("history", tk, this.S.history[tk]);
    if (this.S.h28[tk] !== undefined)
      await this.dbPut("h28", tk, this.S.h28[tk]);
    if (this.S.timerHistory[tk] !== undefined)
      await this.dbPut("timerHistory", tk, this.S.timerHistory[tk]);
    if (this.S.timer28History[tk] !== undefined)
      await this.dbPut("timer28History", tk, this.S.timer28History[tk]);
    if (this.S.malaLog)
      await this.dbPut("malaLog", "today", { date: tk, log: this.S.malaLog });
    // Archive today's activityLog entries into lifetime per-day store (no 500 limit)
    if (this.S.activityLog && this.S.activityLog.length > 0) {
      const todayEntries = this.S.activityLog.filter(
        (e) => e.ts && _ldk(new Date(e.ts)) === tk,
      );
      if (todayEntries.length > 0)
        await this.dbPut("activityLogArchive", tk, todayEntries);
    }
    try {
      localStorage.setItem(this._lsKey(), JSON.stringify(this.S));
    } catch (e) {}
    if (fbUser && !fbForcedSignout && !this._suspendCloudSync && App._cloudHydrated)
      fbDebouncedPush();
  },

  async load() {
    await this.initDB();
    this.S.tk = this.getTk();

    // GUEST MODE: never load from IDB or localStorage — start clean every time.
    // Signed-in users load from IDB as an offline buffer; cloud pull immediately follows.
    if (!this._uid) return;

    // Try IndexedDB first
    const main = await this.dbGet("state", this._stateKey());
    if (main) {
      Object.assign(this.S, main);
    } else {
      // Fallback: migrate from localStorage (UID-scoped key first, then legacy)
      try {
        const ls =
          localStorage.getItem(this._lsKey()) || localStorage.getItem("rjap5");
        if (ls) {
          const d = JSON.parse(ls);
          Object.assign(this.S, d);
        }
      } catch (e) {}
    }

    // Load all count stores from IDB
    this.S.history = await this.dbGetAll("history");
    this.S.h28 = await this.dbGetAll("h28");
    this.S.timerHistory = await this.dbGetAll("timerHistory");
    this.S.timer28History = await this.dbGetAll("timer28History");

    // Merge full snapshots saved in main state so past/future edits also persist locally
    if (main?.history) this.S.history = { ...main.history, ...this.S.history };
    if (main?.h28) this.S.h28 = { ...main.h28, ...this.S.h28 };
    if (main?.timerHistory)
      this.S.timerHistory = { ...main.timerHistory, ...this.S.timerHistory };
    if (main?.timer28History)
      this.S.timer28History = {
        ...main.timer28History,
        ...this.S.timer28History,
      };

    // Merge localStorage history as fallback for old data
    try {
      const ls =
        localStorage.getItem(this._lsKey()) || localStorage.getItem("rjap5");
      if (ls) {
        const d = JSON.parse(ls);
        if (d.history) {
          for (const k in d.history)
            if (!this.S.history[k]) this.S.history[k] = d.history[k];
        }
        if (d.h28) {
          for (const k in d.h28) if (!this.S.h28[k]) this.S.h28[k] = d.h28[k];
        }
        if (d.timerHistory) {
          for (const k in d.timerHistory)
            if (!this.S.timerHistory[k])
              this.S.timerHistory[k] = d.timerHistory[k];
        }
        if (d.timer28History) {
          for (const k in d.timer28History)
            if (!this.S.timer28History[k])
              this.S.timer28History[k] = d.timer28History[k];
        }
      }
    } catch (e) {}

    if (!this.S.history[this.S.tk]) this.S.history[this.S.tk] = 0;
    if (!this.S.h28[this.S.tk]) this.S.h28[this.S.tk] = 0;
    if (!this.S.stotrams) this.S.stotrams = {};
    if (!this.S.brahma) this.S.brahma = {};
    if (!this.S.customSt) this.S.customSt = [];
    if (!this.S.timerHistory) this.S.timerHistory = {};
    if (!this.S.timer28History) this.S.timer28History = {};
    if (!this.S.sankalpas) this.S.sankalpas = [];
    if (!this.S.occasions) this.S.occasions = {};
    if (!this.S.historyRV) this.S.historyRV = {};
    if (!this.S.timerHistoryRV) this.S.timerHistoryRV = {};
    if (!this.S.japMode) this.S.japMode = "radha";
    if (!this.S.dtRV) this.S.dtRV = 0;
    if (!this.S.ltRV) this.S.ltRV = 0;
    if (!this.S.nameJapDeductRV) this.S.nameJapDeductRV = 0;
    if (!this.S.malaLogRV) this.S.malaLogRV = [];
    // Load malaLogRV — only keep if from today AND today has RV jap
    const todayRVJap = this.S.historyRV[this.S.tk] || 0;
    if (todayRVJap <= 0) {
      this.S.malaLogRV = [];
    }
    if (!this.S.syncBaselineRV) this.S.syncBaselineRV = {};
    if (!this.S.syncBaselineTimerRV) this.S.syncBaselineTimerRV = {};
    if (!this.S.activityLog) this.S.activityLog = [];
    if (!this.S.sadhanaStart)
      this.S.sadhanaStart = localStorage.getItem("rjap_sadhana_start") || "";
    if (!this.S.historyHK) this.S.historyHK = {};
    if (!this.S.timerHistoryHK) this.S.timerHistoryHK = {};
    if (this.S.dtHK === undefined) this.S.dtHK = 0;
    if (!this.S.malaLogHK) this.S.malaLogHK = [];
    if (!this.S.syncBaselineHK) this.S.syncBaselineHK = {};
    if (!this.S.syncBaselineTimerHK) this.S.syncBaselineTimerHK = {};
    if (this.S.nameJapDeductHK === undefined) this.S.nameJapDeductHK = 0;
    if (this.S.gaudiyaMode === undefined) this.S.gaudiyaMode = false;
    if (!this.S.hkLang) this.S.hkLang = "hi";
    if (!this.S.historyHK[this.S.tk]) this.S.historyHK[this.S.tk] = 0;
    if (!this.S.timerHistoryHK[this.S.tk]) this.S.timerHistoryHK[this.S.tk] = 0;
    // Load malaLogHK — only keep if today has HK jap
    const todayHKJap = this.S.historyHK[this.S.tk] || 0;
    if (todayHKJap <= 0) this.S.malaLogHK = [];
    if (!this.S.historyRV[this.S.tk]) this.S.historyRV[this.S.tk] = 0;
    if (!this.S.timerHistoryRV[this.S.tk]) this.S.timerHistoryRV[this.S.tk] = 0;
    // Load malaLog — only use if it's from today AND today has actual jap count
    const malaLogRec = await this.dbGet("malaLog", "today");
    const todayJap = this.S.history[this.S.tk] || 0;
    if (malaLogRec && malaLogRec.date === this.S.tk && todayJap > 0) {
      this.S.malaLog = malaLogRec.log || [];
    } else {
      // New day or no jap done today — discard any previous log entirely
      this.S.malaLog = [];
      await this.dbPut("malaLog", "today", { date: this.S.tk, log: [] });
      // (removed) destructive force-push of empty malaLog — would overwrite cloud on cold start
    }
    STLIST.forEach((x) => {
      if (!this.S.stotrams[x.id]) this.S.stotrams[x.id] = {};
    });
  },

  getTk() {
    // Date changes at 12:00 AM local time (GPS/device timezone).
    // Use local date methods so the key matches the user's clock midnight.
    const d = new Date(Date.now() + (window._serverTimeOffsetMs || 0));
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  },

  gTod() {
    if (this.S.japMode === "rv") return this.S.historyRV[this.S.tk] || 0;
    if (this.S.japMode === "hk") return this.S.historyHK[this.S.tk] || 0;
    return this.S.history[this.S.tk] || 0;
  },
  // Combined today: radha + RV (or HK-only when gaudiyaMode)
  gTodCombined() {
    if (this.S.gaudiyaMode) return this.S.historyHK[this.S.tk] || 0;
    return (
      (this.S.history[this.S.tk] || 0) + (this.S.historyRV[this.S.tk] || 0)
    );
  },
  gTot() {
    // COMBINED lifetime total from BOTH jap types (or HK-only in gaudiyaMode)
    if (this.S.gaudiyaMode) {
      return Math.max(
        0,
        Object.values(this.S.historyHK || {}).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductHK || 0),
      );
    }
    const radhaTotal = Math.max(
      0,
      Object.values(this.S.history).reduce((a, b) => a + b, 0) -
        (this.S.nameJapDeduct || 0),
    );
    const rvTotal = Math.max(
      0,
      Object.values(this.S.historyRV).reduce((a, b) => a + b, 0) -
        (this.S.nameJapDeductRV || 0),
    );
    return radhaTotal + rvTotal;
  },
  // Mode-specific total (for daily bar only)
  gTotMode() {
    if (this.S.japMode === "rv")
      return Math.max(
        0,
        Object.values(this.S.historyRV).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductRV || 0),
      );
    if (this.S.japMode === "hk")
      return Math.max(
        0,
        Object.values(this.S.historyHK || {}).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductHK || 0),
      );
    return Math.max(
      0,
      Object.values(this.S.history).reduce((a, b) => a + b, 0) -
        (this.S.nameJapDeduct || 0),
    );
  },
  getCurHistory() {
    if (this.S.japMode === "rv") return this.S.historyRV;
    if (this.S.japMode === "hk") return this.S.historyHK || {};
    return this.S.history;
  },
  getCurTimerHistory() {
    if (this.S.japMode === "rv") return this.S.timerHistoryRV;
    if (this.S.japMode === "hk") return this.S.timerHistoryHK || {};
    return this.S.timerHistory;
  },
  // Combined history: merge radha + RV counts per day (or HK-only in gaudiyaMode)
  getCombinedHistory() {
    if (this.S.gaudiyaMode)
      return JSON.parse(JSON.stringify(this.S.historyHK || {}));
    const combined = {};
    const h1 = this.S.history || {};
    const h2 = this.S.historyRV || {};
    const allKeys = new Set([...Object.keys(h1), ...Object.keys(h2)]);
    allKeys.forEach((k) => {
      combined[k] = (h1[k] || 0) + (h2[k] || 0);
    });
    return combined;
  },
  // Combined timer history: merge radha + RV timer per day (or HK-only in gaudiyaMode)
  getCombinedTimerHistory() {
    if (this.S.gaudiyaMode)
      return JSON.parse(JSON.stringify(this.S.timerHistoryHK || {}));
    const combined = {};
    const t1 = this.S.timerHistory || {};
    const t2 = this.S.timerHistoryRV || {};
    const allKeys = new Set([...Object.keys(t1), ...Object.keys(t2)]);
    allKeys.forEach((k) => {
      combined[k] = (t1[k] || 0) + (t2[k] || 0);
    });
    return combined;
  },
  getCurDt() {
    if (this.S.japMode === "rv") return this.S.dtRV;
    if (this.S.japMode === "hk") return this.S.dtHK || 0;
    return this.S.dt;
  },
  getCurLt() {
    return this.S.lt;
  },

  // ── Haptic Heartbeat ──
  // 10ms on every tap; triple long pulse (200-80-200-80-300ms) synced with mala complete
  vib(pat) {
    if (!this.S.cfg.vib) return;
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pat);
        return;
      } catch (e) {}
    }
    // Visual fallback
    const z = document.getElementById("tz");
    if (z) {
      z.style.boxShadow = "0 0 22px rgba(109,184,255,0.65)";
      setTimeout(() => (z.style.boxShadow = ""), 80);
    }
  },

  // ── Timer ──
  fmtTime(s) {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sc = s % 60;
    return (
      String(h).padStart(2, "0") +
      ":" +
      String(m).padStart(2, "0") +
      ":" +
      String(sc).padStart(2, "0")
    );
  },

  startTimer() {
    if (this.timerRunning) return;
    if (!this._sessionStart) this._sessionStart = Date.now();
    this.timerRunning = true;
    document.getElementById("timerDisplay").classList.add("running");
    document.getElementById("timerBtn").textContent = "⏸ Pause";
    document.getElementById("timerBtn").className = "tbtn pause";
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      // Persist so per-mala duration survives app close / reopen
      try { localStorage.setItem("rjap_timerSeconds", String(this.timerSeconds)); } catch(e){}
      document.getElementById("timerDisplay").textContent = this.fmtTime(
        this.timerSeconds,
      );
      this.updateTimerToday();
    }, 1000);
  },

  pauseTimer() {
    if (!this.timerRunning) return;
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerRunning = false;
    document.getElementById("timerDisplay").classList.remove("running");
    document.getElementById("timerBtn").textContent = "▶ Resume";
    document.getElementById("timerBtn").className = "tbtn start";
    // Save only the delta since last save (avoids double-counting on resume)
    const _th = this.getCurTimerHistory();
    const delta = this.timerSeconds - this.timerSavedSeconds;
    _th[this.S.tk] = (_th[this.S.tk] || 0) + delta;
    this.timerSavedSeconds = this.timerSeconds;
    // Log this jap session with timestamps
    if (this._sessionStart) {
      logActivity({
        t: "session",
        ts: this._sessionStart,
        end: Date.now(),
        mode: this.S.japMode,
        secs: delta,
      });
      this._sessionStart = null;
    }
    this.save();
    this.updateTimerToday();
  },

  tapTimer() {
    this.startTimer();
    clearTimeout(this.autoStopTimeout);
    // Snapshot timerSeconds at the moment of the last tap.
    // When auto-pause fires 6 s later we roll back to this snapshot
    // so the idle gap is never counted as jap time.
    const secondsAtTap = this.timerSeconds;
    this.autoStopTimeout = setTimeout(() => {
      this.timerSeconds = secondsAtTap;
      this.pauseTimer();
    }, 6000);
  },

  toggleTimer() {
    clearTimeout(this.autoStopTimeout);
    if (this.timerRunning) this.pauseTimer();
    else this.startTimer();
  },

  resetTimer() {
    clearTimeout(this.autoStopTimeout);
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerRunning = false;
    this.timerSeconds = 0;
    this.timerSavedSeconds = 0;
    this._malaTimerStart = 0; // reset per-mala timer anchor
    document.getElementById("timerDisplay").textContent = App.fmtTime(App.timerSeconds);
    document.getElementById("timerDisplay").classList.remove("running");
    document.getElementById("timerBtn").textContent = "▶ Start";
    document.getElementById("timerBtn").className = "tbtn start";
    this.updateTimerToday();
  },

  // ── UNIFIED: total Jap seconds today across ALL modes ──
  // = committed Radha + Radha Vallabh + Hare Krishna + 28 Names history for today
  //   + live in-progress deltas from whichever timer is currently running.
  getTotalJapSecondsToday() {
    const tk = this.S.tk;
    const radhaSec = (this.S.timerHistory   || {})[tk] || 0;
    const rvSec    = (this.S.timerHistoryRV || {})[tk] || 0;
    const hkSec    = (this.S.timerHistoryHK || {})[tk] || 0;
    const n28Sec   = (this.S.timer28History || {})[tk] || 0;
    // live delta from the Radha/RV/HK jap timer
    const liveJap = this.timerRunning
      ? Math.max(0, this.timerSeconds - this.timerSavedSeconds)
      : 0;
    // live delta from the 28-Names timer (elapsed since session start − already flushed)
    let live28 = 0;
    if (this._n28TotalStart && !this._n28Paused) {
      const elapsed = Math.floor((Date.now() - this._n28TotalStart) / 1000);
      live28 = Math.max(0, elapsed - (this._n28SavedSecs || 0));
    }
    return radhaSec + rvSec + hkSec + n28Sec + liveJap + live28;
  },

  updateTimerToday() {
    // ── UNIFIED: Today's Jap Time shared by Radha/RV/HK page AND 28 Names tab ──
    const combinedSec = this.getTotalJapSecondsToday();
    const tt = document.getElementById("timerToday2") || document.getElementById("timerToday");
    if (tt) tt.textContent = this.fmtTime(combinedSec);
    // Mirror the SAME total on the 28 Names tab
    const te28 = document.getElementById("n28TotalTimer");
    if (te28) te28.textContent = this.fmtTime(combinedSec);
  },

  // ── UNIFIED TIME: sync timerHistory[today] = sum of mala log entries ──
  // Called after any mala log change so all time displays stay in harmony.
  syncTimerFromMalaLog() {
    // Always sync ALL modes independently — mode switching must not corrupt any
    const radhaSum = (this.S.malaLog || []).reduce((a, b) => a + b, 0);
    const rvSum = (this.S.malaLogRV || []).reduce((a, b) => a + b, 0);
    const hkSum = (this.S.malaLogHK || []).reduce((a, b) => a + b, 0);
    if (!this.S.timerHistory) this.S.timerHistory = {};
    if (!this.S.timerHistoryRV) this.S.timerHistoryRV = {};
    if (!this.S.timerHistoryHK) this.S.timerHistoryHK = {};
    if (radhaSum > 0 || (this.S.malaLog || []).length > 0)
      this.S.timerHistory[this.S.tk] = radhaSum;
    if (rvSum > 0 || (this.S.malaLogRV || []).length > 0)
      this.S.timerHistoryRV[this.S.tk] = rvSum;
    if (hkSum > 0 || (this.S.malaLogHK || []).length > 0)
      this.S.timerHistoryHK[this.S.tk] = hkSum;
    // Re-anchor timerSavedSeconds so live delta is measured from current position
    this.timerSavedSeconds = this.timerSeconds;
  },

  // ── Get mala log sum for today (excludes live in-progress mala) ──
  getMalaLogSum() {
    const isRV = this.S.japMode === "rv";
    const isHK = this.S.japMode === "hk";
    const log = isRV
      ? this.S.malaLogRV || []
      : isHK
        ? this.S.malaLogHK || []
        : this.S.malaLog || [];
    return log.reduce((a, b) => a + b, 0);
  },
  ua() {
    const tod = this.gTod(),
      ms = this.S.ms || 108;
    const tot = this.gTot(); // COMBINED lifetime total
    const curDt = this.getCurDt(),
      curLt = this.getCurLt(); // shared lifetime target
    const md = Math.floor(tod / ms);
    const beadPos = tod % ms || ms;
    document.getElementById("jms").textContent = beadPos;
    const de = document.getElementById("mdots");
    if (de) {
      const inM = tod % ms,
        show = Math.min(ms, 12);
      de.innerHTML = "";
      for (let i = 0; i < show; i++) {
        const d = document.createElement("div");
        d.className = "mdt" + (i < Math.floor((inM * show) / ms) ? " on" : "");
        de.appendChild(d);
      }
    }
    const mtotEl = document.getElementById("mtot");
    if (mtotEl) mtotEl.textContent = md + " mala" + (md !== 1 ? "s" : "");
    const dP = curDt > 0 ? Math.min(100, Math.round((tod / curDt) * 100)) : 0;
    const lP = curLt > 0 ? Math.min(100, Math.round((tot / curLt) * 100)) : 0;
    // Daily bar (blue) — mode-specific
    document.getElementById("dPct").textContent = dP + "%";
    document.getElementById("dbarFill").style.width = dP + "%";
    document.getElementById("dbarDone").textContent = fmtIN(tod);
    document.getElementById("dbarTarget").textContent =
      "/ " + (curDt ? fmtIN(curDt) : "—");
    document.getElementById("dDet").textContent = md + " malas done";
    // Lifetime bar (gold) — COMBINED total, shared target
    document.getElementById("lPct").textContent = lP + "%";
    document.getElementById("lbarFill").style.width = lP + "%";
    document.getElementById("lbarDone").textContent = fmtIN(tot);
    document.getElementById("lbarTarget").textContent =
      "/ " + (curLt ? fmtIN(curLt) : "—");
    document.getElementById("lDet").textContent =
      Math.floor(tot / ms) + " malas done";
    this.updateTimerToday();
    if (typeof renderBeadFrame === "function") renderBeadFrame(tod, curDt);
    uStats();
  },

  // ── Set wall-clock start for new mala if needed ──
  ensureMalaWallStart() {
    const ms = this.S.ms || 108;
    const countInMala = this.gTod() % ms;
    if (countInMala === 1 || this.malaWallStart === 0) {
      this.malaWallStart = Date.now();
      localStorage.setItem("rjap_malaWallStart", String(this.malaWallStart));
      // Also anchor the timer-based mala start — this is the authoritative clock
      if (this._malaTimerStart === undefined || this._malaTimerStart === null)
        this._malaTimerStart = this.timerSeconds;
      localStorage.setItem("rjap_malaTimerStart", String(this._malaTimerStart));
    }
  },

  // ── Mala Complete — Bell sound + TRIPLE vibration + log duration + animate timer ──
  malaOk() {
    const f = document.getElementById("mf");
    const isHKmala = this.S.japMode === "hk";
    // For HK mode: show Chaitanya verse overlay until next tap
    if (isHKmala) {
      const lang = this.S.hkLang || "hi";
      const line1 =
        lang === "bn"
          ? "জয় শ্রীকৃষ্ণ চৈতন্য প্রভু নিত্যানন্দ।"
          : "जय श्री कृष्ण चैतन्य प्रभु नित्यानन्द।";
      const line2 =
        lang === "bn"
          ? "শ্রীঅদ্বৈত গদাধর শ্রীবাসাদি গৌরভক্তবৃন্দ।"
          : "श्री अद्वैत गदाधर श्रीवासादि गौर भक्त वृन्द॥";
      showHKMalaComplete(line1, line2);
    } else {
      f.classList.add("show");
      setTimeout(() => f.classList.remove("show"), 2800);
    }
    // Completion sound (bell chime or Panchojanno Shankya)
    if (this.S.cfg.sound) playMalaSound();
    // Triple long vibration synced with bell (only if vibration enabled in settings)
    this.vib([200, 80, 200, 80, 300]);
    // ── ARIA live region: announce mala completion to screen readers ──
    const _announcer = document.getElementById("japAnnounce");
    if (_announcer) {
      const _malaNum = this[this.S.japMode === "rv" ? "lmcRV" : this.S.japMode === "hk" ? "lmcHK" : "lmc"];
      _announcer.textContent = "";
      setTimeout(() => {
        _announcer.textContent = "Mala " + _malaNum + " complete. Radha Radha.";
      }, 50);
    }
    // ── Record mala duration using the SAME clock as the visible timer ──
    // timerSeconds is the authoritative source — it only ticks while the app
    // interval is actually running, matching exactly what the user sees on screen.
    // Wall-clock (malaWallStart) is NOT used because it keeps running even when
    // the phone screen is off or the browser throttles the interval.
    let malaDuration;
    if (this.timerSeconds > 0 && this._malaTimerStart !== undefined) {
      malaDuration = Math.max(1, this.timerSeconds - this._malaTimerStart);
    } else {
      // Fallback: wall-clock (e.g. timer was never started, manual jap entry)
      malaDuration = Math.max(
        1,
        Math.round((Date.now() - this.malaWallStart) / 1000),
      );
    }
    // Capture the REAL wall-clock start of this mala BEFORE we reset it
    const _malaRealStart = this.malaWallStart || (Date.now() - malaDuration * 1000);
    // Anchor next mala's timer start to current timerSeconds
    this._malaTimerStart = this.timerSeconds;
    localStorage.setItem("rjap_malaTimerStart", String(this._malaTimerStart));
    localStorage.setItem("rjap_timerSeconds", String(this.timerSeconds));
    this.malaWallStart = Date.now();
    localStorage.setItem("rjap_malaWallStart", String(this.malaWallStart));
    const isRVm = this.S.japMode === "rv";
    const isHKm = this.S.japMode === "hk";
    if (isRVm) {
      if (!this.S.malaLogRV) this.S.malaLogRV = [];
      this.S.malaLogRV.push(malaDuration);
    } else if (isHKm) {
      if (!this.S.malaLogHK) this.S.malaLogHK = [];
      this.S.malaLogHK.push(malaDuration);
    } else {
      if (!this.S.malaLog) this.S.malaLog = [];
      this.S.malaLog.push(malaDuration);
    }
    // Log mala completion with full timestamp
    // Use malaLog.length as the mala number — it's always the correct sequential count
    const malaNum = isRVm
      ? (this.S.malaLogRV || []).length
      : (this.S.malaLog || []).length;
    // Store wall-clock start so the history detail can show accurate start time
    // Real wall-clock start (e.g. 12:01) and real end (e.g. 12:21)
    const malaStartTs = _malaRealStart;
    logActivity({
      t: "mala",
      ts: Date.now(),
      startTs: malaStartTs,
      mode: this.S.japMode,
      n: malaNum,
      sec: malaDuration,
    });
    // ── UNIFIED TIME: timerHistory[today] = sum of mala log entries ──
    // This keeps all time displays (timer, stats, mala log, B&C day view) in harmony.
    this.syncTimerFromMalaLog();
    this.save();
    // Animate mala duration on timer display
    this.flashMalaDuration(malaDuration);
    // ✨ MALA GLOW FLASH: briefly reveal all deity images fully with intense glow
    if (typeof triggerMalaGlowFlash === 'function') triggerMalaGlowFlash();
  },

  flashMalaDuration(sec) {
    const disp = document.getElementById("timerDisplay");
    if (!disp) return;
    const _fh = Math.floor(sec / 3600),
      _fm = Math.floor((sec % 3600) / 60),
      _fs = sec % 60;
    const durStr =
      _fh > 0
        ? _fh + "h " + _fm + "m " + String(_fs).padStart(2, "0") + "s"
        : _fm > 0
          ? _fm + "m " + String(_fs).padStart(2, "0") + "s"
          : _fs + "s";
    // Spawn floating label anchored to the timer display position
    const rect = disp.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "mala-time-float";
    el.textContent = "📿 " + durStr;
    el.style.fontSize = "22px";
    el.style.left = rect.left + rect.width / 2 - 40 + "px";
    el.style.top = rect.top - 4 + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  },

  // ── Main tap ──
  ht(e) {
    // Suppress synthesized mousedown that follows a touchstart on the same tap
    if (e) {
      try { e.preventDefault(); } catch (_) {}
      const now = Date.now();
      if (e.type === "touchstart") {
        this._lastTouchTs = now;
      } else if (
        e.type === "mousedown" &&
        this._lastTouchTs &&
        now - this._lastTouchTs < 700
      ) {
        return;
      }
    }
    const ms = this.S.ms || 108;
    const isRV = this.S.japMode === "rv";
    const isHK = this.S.japMode === "hk";
    if (isRV) {
      this.S.historyRV[this.S.tk] = (this.S.historyRV[this.S.tk] || 0) + 1;
    } else if (isHK) {
      if (!this.S.historyHK) this.S.historyHK = {};
      this.S.historyHK[this.S.tk] = (this.S.historyHK[this.S.tk] || 0) + 1;
    } else {
      this.S.history[this.S.tk] = (this.S.history[this.S.tk] || 0) + 1;
    }
    this.ensureMalaWallStart();
    // Defer persistence off the input critical path — tap feels instant
    this._saveSoon();
    // Haptic heartbeat — 10ms bead feeling
    this.vib([10]);
    this.tapTimer();
    if (isRV) {
      spawnRV(e, document.getElementById("tz"));
    } else if (isHK) {
      spawnHK();
    } else {
      spawn(e, document.getElementById("tz"));
    }
    const nm = Math.floor(this.gTod() / ms);
    const lmcKey = isRV ? "lmcRV" : isHK ? "lmcHK" : "lmc";
    if (nm > this[lmcKey]) {
      this[lmcKey] = nm;
      this.malaOk();
      App.silentMonkBackup();
    }
    this.ua();
  },

  // Coalesced save scheduler — collapses many taps into a single save,
  // and pushes save off the gesture frame so the UI updates immediately.
  _saveSoon() {
    if (this._saveScheduled) return;
    this._saveScheduled = true;
    const run = () => {
      this._saveScheduled = false;
      try { this.save(); } catch (e) { console.warn("save:", e); }
      // Debounced cloud push (also guarded inside fbPushFull)
      if (typeof fbDebouncedPush === "function") fbDebouncedPush();
    };
    // Run after the current frame so visuals + haptic land first
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(run, 0));
    } else {
      setTimeout(run, 0);
    }
  },

  undo1() {
    const isRV = this.S.japMode === "rv";
    const isHK = this.S.japMode === "hk";
    const hist = isRV
      ? this.S.historyRV
      : isHK
        ? this.S.historyHK || {}
        : this.S.history;
    if ((hist[this.S.tk] || 0) > 0) {
      hist[this.S.tk]--;
      const lmcKey = isRV ? "lmcRV" : isHK ? "lmcHK" : "lmc";
      this[lmcKey] = Math.floor(this.gTod() / (this.S.ms || 108));
      this.save();
      fbDebouncedPush();
      this.ua();
      this.vib([10]);
    }
  },

  // ── 28 Names timers ──
  _n28CycleStart: null,
  _n28TotalStart: null,
  _n28TimerInterval: null,
  _n28SavedSecs: 0, // seconds already flushed into timer28History this session
  _n28Paused: false,
  _n28PausedCycleSec: 0, // cycle seconds frozen at moment of pause
  _n28PausedTotalSec: 0, // total seconds frozen at moment of pause
  _n28AutoPauseTimeout: null,
  _n28CompletionAnimating: false,
  _n28CompletionTimer: null,

  // ── Update pause button appearance ──
  _upd28PauseBtn() {
    const btn = document.getElementById("n28PauseBtn");
    if (!btn) return;
    const hasStarted = !!this._n28TotalStart || this._n28Paused;
    btn.style.display = hasStarted ? "" : "none";
    if (this._n28Paused) {
      btn.textContent = "▶ Resume";
      btn.style.background = "rgba(39,174,96,0.15)";
      btn.style.borderColor = "rgba(46,204,113,0.4)";
      btn.style.color = "var(--green)";
    } else {
      btn.textContent = "⏸ Pause";
      btn.style.background = "rgba(109,184,255,0.12)";
      btn.style.borderColor = "rgba(109,184,255,0.35)";
      btn.style.color = "var(--a2)";
    }
  },

  // ── Pause the 28 Names timers ──
  pause28() {
    if (this._n28Paused || !this._n28TotalStart) return;
    // Freeze current values
    this._n28PausedCycleSec = this._n28CycleStart
      ? Math.floor((Date.now() - this._n28CycleStart) / 1000)
      : 0;
    const sessionSec = Math.floor((Date.now() - this._n28TotalStart) / 1000);
    const savedSec = this.S.timer28History[this.S.tk] || 0;
    this._n28PausedTotalSec =
      savedSec + (sessionSec - (this._n28SavedSecs || 0));
    // Flush elapsed time to history
    this.flush28TimeToHistory();
    // Stop interval
    clearInterval(this._n28TimerInterval);
    this._n28TimerInterval = null;
    clearTimeout(this._n28AutoPauseTimeout);
    this._n28AutoPauseTimeout = null;
    // Clear session timestamps so flush doesn't double-count on resume
    this._n28TotalStart = null;
    this._n28CycleStart = null;
    this._n28SavedSecs = 0;
    this._n28Paused = true;
    this._upd28PauseBtn();
    // Show frozen cycle value; n28TotalTimer shows unified Today's Jap Time
    const fmt = (s) =>
      Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    const ce = document.getElementById("n28CycleTimer");
    if (ce) ce.textContent = fmt(this._n28PausedCycleSec);
    this.updateTimerToday();

  },

  // ── Resume the 28 Names timers ──
  resume28() {
    if (!this._n28Paused) return;
    this._n28Paused = false;
    // Re-anchor timestamps accounting for already-elapsed time
    // We offset TotalStart so the running total picks up from where it paused
    // (timer28History already has savedSec baked in from flush)
    this._n28TotalStart = Date.now();
    this._n28SavedSecs = 0;
    // Re-anchor cycle start so cycle timer picks up from frozen value
    this._n28CycleStart = Date.now() - this._n28PausedCycleSec * 1000;
    this._upd28PauseBtn();
    this.start28Timers();
    // Re-arm 6s auto-pause
    this._arm28AutoPause();
  },

  // ── Toggle pause/resume ──
  toggle28Pause() {
    if (this._n28Paused) this.resume28();
    else this.pause28();
  },

  // ── Arm 6-second auto-pause ──
  _arm28AutoPause() {
    clearTimeout(this._n28AutoPauseTimeout);
    this._n28AutoPauseTimeout = setTimeout(() => {
      if (!this._n28Paused) this.pause28();
    }, 6000);
  },

  start28Timers() {
    if (this._n28Paused) return; // don't start if paused
    if (!this._n28TotalStart) {
      this._n28TotalStart = Date.now();
      this._n28SavedSecs = 0;
    }
    if (!this._n28CycleStart) this._n28CycleStart = Date.now();
    if (this._n28TimerInterval) return; // already running
    this._n28TimerInterval = setInterval(() => {
      if (this._n28Paused) return;
      const fmt = (s) =>
        Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
      const cycSec = this._n28CycleStart
        ? Math.floor((Date.now() - this._n28CycleStart) / 1000)
        : 0;
      const ce = document.getElementById("n28CycleTimer");
      if (ce) ce.textContent = fmt(cycSec);
      // Keep the unified "Total Jap Time" mirror in sync every second
      this.updateTimerToday();
    }, 1000);
    this._upd28PauseBtn();
  },

  flush28TimeToHistory() {
    if (!this._n28TotalStart) return;
    const elapsed = Math.floor((Date.now() - this._n28TotalStart) / 1000);
    const newSecs = elapsed - this._n28SavedSecs;
    if (newSecs > 0) {
      this.S.timer28History[this.S.tk] =
        (this.S.timer28History[this.S.tk] || 0) + newSecs;
      this._n28SavedSecs = elapsed;
      this.save();
      fbDebouncedPush();
    }
  },

  resetCycleTimer28() {
    this.flush28TimeToHistory();
    // Reset cycle anchor — if paused, reset frozen cycle sec too
    if (this._n28Paused) {
      this._n28PausedCycleSec = 0;
      const ce = document.getElementById("n28CycleTimer");
      if (ce) ce.textContent = "0:00";
    } else {
      this._n28CycleStart = Date.now();
      const ce = document.getElementById("n28CycleTimer");
      if (ce) ce.textContent = "0:00";
    }
  },

  stopAll28Timers() {
    clearTimeout(this._n28AutoPauseTimeout);
    this._n28AutoPauseTimeout = null;
    clearTimeout(this._n28CompletionTimer);
    this._n28CompletionTimer = null;
    this._n28CompletionAnimating = false;
    this.flush28TimeToHistory();
    clearInterval(this._n28TimerInterval);
    this._n28TimerInterval = null;
    this._n28CycleStart = null;
    this._n28TotalStart = null;
    this._n28SavedSecs = 0;
    this._n28Paused = false;
    this._n28PausedCycleSec = 0;
    this._n28PausedTotalSec = 0;
    const ce = document.getElementById("n28CycleTimer");
    if (ce) ce.textContent = "0:00";
    // Show unified Today's Jap Time
    this.updateTimerToday();

    const mf28 = document.getElementById("mf28");
    if (mf28) mf28.classList.remove("show");
    this._upd28PauseBtn();
  },

  // ── 28 Names tap ──
  h28(e) {
    if (e) {
      try { e.preventDefault(); } catch (_) {}
      const now = Date.now();
      if (e.type === "touchstart") {
        this._lastTouchTs28 = now;
      } else if (
        e.type === "mousedown" &&
        this._lastTouchTs28 &&
        now - this._lastTouchTs28 < 700
      ) {
        return;
      }
    }
    if (this._n28CompletionAnimating) return;
    // If paused, resume on tap
    if (this._n28Paused) {
      this.resume28();
    }
    if (!this.S.h28[this.S.tk]) this.S.h28[this.S.tk] = 0;
    const posBefore = get28Pos();
    this.S.h28[this.S.tk]++;
    // Defer persistence + cloud push off the gesture critical path
    this._saveSoon();
    this.vib([10]);
    this.start28Timers();
    // Also drive the unified Jap timer so both tabs share the same clock
    this.tapTimer();
    // Re-arm 6s auto-pause on every tap
    this._arm28AutoPause();
    if (this.S.h28[this.S.tk] % 28 === 0) cycleDone28();
    u28();
  },

  undo28() {
    if ((this.S.h28[this.S.tk] || 0) > 0) {
      // Freeze wish progress before changing h28 so bar reflects the undo
      (this.S.sankalpas || [])
        .filter((s) => !s.done && s.startCycles !== null)
        .forEach((s) => {
          s._savedProgress =
            (s._savedProgress || 0) +
            Math.max(0, getTotalCycles28() - s.startCycles);
          s.startCycles = getTotalCycles28();
        });
      this.S.h28[this.S.tk]--;
      // Rebase wishes to new lower total
      (this.S.sankalpas || [])
        .filter((s) => !s.done && s.startCycles !== null)
        .forEach((s) => {
          s.startCycles = getTotalCycles28();
        });
      this.save();
      u28();
      this.vib([10]);
    }
  },

  // ── Silent Monk Auto Backup: triggered on every mala complete ──
  silentMonkBackup() {
    if (!fbUser) return;
    // Delta push to Firebase (near-instant cross-device sync)
    clearTimeout(this.fbDebouncePush);
    fbPushDelta();
    // JSON snapshot to Google Drive
  },
};

// ═══════════════════════════════════════════════════════
// HELPERS & GLOBALS
// ═══════════════════════════════════════════════════════
// Bell sound — synthesized 3-tone chime
function playSynthBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [
      [523, 0],
      [659, 0.3],
      [784, 0.6],
    ].forEach(([fr, t]) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = fr;
      o.type = "sine";
      g.gain.setValueAtTime(0.3, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 2);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 2);
    });
  } catch (e) {}
}

// Panchojanno Shankya — plays the bundled MP3
const SHANKYA_URL = "./Panchojanno%20Shankya.mp3";
let _shankyaAudio = null;
let _shankyaLoaded = false;
function _buildShankyaAudio() {
  _shankyaAudio = new Audio(SHANKYA_URL);
  _shankyaAudio.preload = "auto";
  _shankyaLoaded = false;
  _shankyaAudio.addEventListener("canplaythrough", function() { _shankyaLoaded = true; }, { once: true });
  _shankyaAudio.addEventListener("error", function() {
    // On load error, reset so next call retries
    _shankyaAudio = null;
    _shankyaLoaded = false;
  }, { once: true });
  _shankyaAudio.load();
}
// Pre-load on startup
try { _buildShankyaAudio(); } catch(e) {}

function playShankya() {
  try {
    // If audio object is missing or errored, rebuild it
    if (!_shankyaAudio) _buildShankyaAudio();
    // If audio is in an error/ended state, reset src to force reload
    if (_shankyaAudio.error) {
      _shankyaAudio = null;
      _buildShankyaAudio();
      // Attempt to play after a short reload delay
      setTimeout(function() {
        if (_shankyaAudio) {
          const p2 = _shankyaAudio.play();
          if (p2 && typeof p2.catch === "function") p2.catch(function(){});
        }
      }, 300);
      return;
    }
    _shankyaAudio.currentTime = 0;
    const p = _shankyaAudio.play();
    if (p && typeof p.catch === "function") p.catch(function(err) {
      // Autoplay blocked or decode error — reset and try once more
      _shankyaAudio = null;
      _buildShankyaAudio();
    });
  } catch (e) {
    _shankyaAudio = null;
  }
}

// Decide which completion sound to play based on user preference
function playMalaSound() {
  const t = (App.S && App.S.cfg && App.S.cfg.soundType) || "shankya";
  if (t === "shankya") playShankya();
  else playSynthBell();
}

// Test Sound button
function testSound() {
  playMalaSound();
}

// Setting handler for the sound type <select>
function setSoundType(v) {
  if (!App.S.cfg) App.S.cfg = {};
  App.S.cfg.soundType = v === "shankya" ? "shankya" : "bell";
  try { App.save(); } catch (_e) {}
  try { fbDebouncedPush(); } catch (_e) {}
  playMalaSound();
}

// Floating राधा spawn
let acf = false;
function spawn(e, zone) {
  const r = zone.getBoundingClientRect();
  let x, y;
  if (e.touches && e.touches[0]) {
    x = e.touches[0].clientX - r.left;
    y = e.touches[0].clientY - r.top;
  } else {
    x = e.clientX - r.left;
    y = e.clientY - r.top;
  }
  const el = document.createElement("div");
  el.className = "fn";
  el.textContent = "राधा";
  const fs = 110 + Math.random() * 60;
  el.style.left = x - fs * 0.6 + "px";
  el.style.top = y - fs * 0.4 + "px";
  el.style.fontSize = fs + "px";
  acf = !acf;
  el.style.color = acf ? "#FFD700" : "#6DB8FF";
  el.style.textShadow = acf
    ? "0 0 30px rgba(255,215,0,0.9)"
    : "0 0 30px rgba(109,184,255,0.9)";
  zone.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function spawnRV(e, zone) {
  const r = zone.getBoundingClientRect();
  let x, y;
  if (e.touches && e.touches[0]) {
    x = e.touches[0].clientX - r.left;
    y = e.touches[0].clientY - r.top;
  } else {
    x = e.clientX - r.left;
    y = e.clientY - r.top;
  }
  const el = document.createElement("div");
  el.className = "fn-rv";
  const fs = 55 + Math.random() * 25;
  el.innerHTML =
    '<span style="font-size:' +
    fs +
    'px">राधावल्लभ</span><span style="font-size:' +
    fs * 0.85 +
    'px">श्री हरिवंश</span>';
  el.style.left = x - fs * 1.2 + "px";
  el.style.top = y - fs * 0.5 + "px";
  acf = !acf;
  el.style.color = acf ? "#FFD700" : "#6DB8FF";
  el.style.textShadow = acf
    ? "0 0 30px rgba(255,215,0,0.9)"
    : "0 0 30px rgba(109,184,255,0.9)";
  zone.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// HK Mahamantra — appears centered, rises upward, 7 cycling colors
const HK_TEXT =
  "हरे कृष्ण हरे कृष्ण\nकृष्ण कृष्ण हरे हरे।\nहरे राम हरे राम\nराम राम हरे हरे॥";
const HK_TEXT_BN =
  "হরে কৃষ্ণ হরে কৃষ্ণ\nকৃষ্ণ কৃষ্ণ হরে হরে।\nহরে রাম হরে রাম\nরাম রাম হরে হরে॥";
const HK_COLORS = [
  "#FFD700", // gold
  "#6DB8FF", // blue
  "#FF6B9D", // pink
  "#7CFC00", // green
  "#FF8C42", // orange
  "#DA70D6", // orchid
  "#00CED1", // teal
];
const HK_SHADOWS_MAP = [
  "0 0 30px rgba(255,215,0,0.85)",
  "0 0 30px rgba(109,184,255,0.85)",
  "0 0 30px rgba(255,107,157,0.85)",
  "0 0 30px rgba(124,252,0,0.85)",
  "0 0 30px rgba(255,140,66,0.85)",
  "0 0 30px rgba(218,112,214,0.85)",
  "0 0 30px rgba(0,206,209,0.85)",
];
let _hkColorIdx = 0;
let _hkMalaBlocked = false; // blocks taps until user taps after mala complete

// Apply all language-sensitive labels for HK/Mahamantra
function applyHKLangLabels(lang) {
  const isBn = lang === "bn";
  // 1. Jap page top dropdown label
  const naamLbl = document.getElementById("naamHKLabel");
  if (naamLbl)
    naamLbl.textContent = isBn ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";
  // 2. Settings language toggle label
  const langLbl = document.getElementById("hkLangLabel");
  if (langLbl) langLbl.textContent = isBn ? "Bangla" : "Hindi";
  // 3. Settings language toggle new pill labels
  const newLangLbl = document.getElementById("hkLangNewLabel");
  if (newLangLbl) newLangLbl.textContent = isBn ? "বাংলা" : "हिंदी";
  // 4. Daily target heading
  const dtLbl = document.getElementById("hkDailyTargetLabel");
  if (dtLbl)
    dtLbl.textContent = isBn
      ? "🪷 হরে কৃষ্ণ মহামন্ত্র Targets"
      : "🪷 हरे कृष्ण महामंत्र Targets";
  // 5. Stats card lotus title
  const statsLotus = document.getElementById("hkcTitleLotus");
  if (statsLotus)
    statsLotus.textContent = isBn ? "🪷 হরে কৃষ্ণ" : "🪷 हरे कृष्ण";
  // 6. Toggle the hkLang toggle visual state
  const tgH = document.getElementById("tgHkLang");
  if (tgH) isBn ? tgH.classList.add("on") : tgH.classList.remove("on");
  // 7. body class drives active button highlight via CSS
  isBn
    ? document.body.classList.add("hk-bn")
    : document.body.classList.remove("hk-bn");
  // 8. History table HK column header
  const histHKHdr = document.getElementById("histHKColHeader");
  if (histHKHdr)
    histHKHdr.textContent = isBn ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";
}

function spawnHK() {
  // If mala-complete overlay is showing, first tap dismisses it and starts new mala
  if (_hkMalaBlocked) {
    _hkMalaBlocked = false;
    const mc = document.getElementById("hkMalaComplete");
    if (mc) mc.classList.remove("hkmc-visible");
    return;
  }
  const el = document.getElementById("hkPersist");
  if (!el) return;
  const lang = App.S.hkLang || "hi";
  const text = lang === "bn" ? HK_TEXT_BN : HK_TEXT;
  // CURRENT color → float rises up and disappears (the "old" text leaving)
  const currentColor = HK_COLORS[_hkColorIdx % 7];
  const currentShadow = HK_SHADOWS_MAP[_hkColorIdx % 7];
  // NEXT color → stays as persistent display (the "new" text arriving)
  const nextColor = HK_COLORS[(_hkColorIdx + 1) % 7];
  const nextShadow = HK_SHADOWS_MAP[(_hkColorIdx + 1) % 7];
  _hkColorIdx++;

  // Float carries the CURRENT (departing) color — rises and fades away
  const zone = document.getElementById("tz");
  if (zone) {
    const floatEl = document.createElement("div");
    floatEl.className = "hk-float-name";
    floatEl.innerHTML = text
      .split("\n")
      .map((l) => "<div>" + l + "</div>")
      .join("");
    floatEl.style.color = currentColor;
    floatEl.style.textShadow = currentShadow;
    zone.appendChild(floatEl);
    setTimeout(() => floatEl.remove(), 2200);
  }

  // Persistent display immediately shows NEXT color (arriving text)
  el.innerHTML = text
    .split("\n")
    .map((l) => "<div>" + l + "</div>")
    .join("");
  el.style.color = nextColor;
  el.style.textShadow = nextShadow;
  if (!el.classList.contains("hk-visible")) {
    el.classList.add("hk-visible");
  }
}

function showHKMalaComplete(line1, line2) {
  _hkMalaBlocked = true;
  // Hide the persistent mahamantra text
  const el = document.getElementById("hkPersist");
  if (el) el.classList.remove("hk-visible");
  // Show Jay Sri Krishna Chaitanya overlay
  const mc = document.getElementById("hkMalaComplete");
  if (!mc) return;
  mc.innerHTML = "<div>" + line1 + "</div><div>" + line2 + "</div>";
  mc.classList.add("hkmc-visible");
  // No auto-dismiss — stays until user taps
}

// Prevent double-tap zoom
let lt2 = 0;
document.addEventListener(
  "touchend",
  (e) => {
    // Do not cancel touchend inside the lyrics modal. Repeated flick-scrolls
    // can happen within 300ms; preventing them interrupts native momentum
    // scrolling and makes the Stotram text feel stuck/shaky on mobile.
    if (e.target && e.target.closest && e.target.closest("#lmo")) return;
    const n = Date.now();
    if (n - lt2 < 300) e.preventDefault();
    lt2 = n;
  },
  { passive: false },
);

// Stats timer tick
setInterval(() => {
  App.updateTimerToday();
}, 1000);

// 28 Names stats panel live tick — refreshes time while timer is running
setInterval(() => {
  if (App._n28TimerInterval) refresh28StatsIfOpen();
}, 2000);

// ── Midnight date-rollover check ──
// Fixes mala log not resetting when app stays open past midnight
setInterval(() => {
  const newTk = App.getTk();
  if (newTk !== App.S.tk) {
    App.S.tk = newTk;
    App.S.malaLog = [];
    App.S.malaLogRV = [];
    App.S.malaLogHK = [];
    if (!App.S.history[App.S.tk]) App.S.history[App.S.tk] = 0;
    if (!App.S.h28[App.S.tk]) App.S.h28[App.S.tk] = 0;
    if (!App.S.timerHistory[App.S.tk]) App.S.timerHistory[App.S.tk] = 0;
    if (!App.S.timer28History[App.S.tk]) App.S.timer28History[App.S.tk] = 0;
    if (!App.S.historyRV) App.S.historyRV = {};
    if (!App.S.historyRV[App.S.tk]) App.S.historyRV[App.S.tk] = 0;
    if (!App.S.timerHistoryRV) App.S.timerHistoryRV = {};
    if (!App.S.timerHistoryRV[App.S.tk]) App.S.timerHistoryRV[App.S.tk] = 0;
    if (!App.S.historyHK) App.S.historyHK = {};
    if (!App.S.historyHK[App.S.tk]) App.S.historyHK[App.S.tk] = 0;
    if (!App.S.timerHistoryHK) App.S.timerHistoryHK = {};
    if (!App.S.timerHistoryHK[App.S.tk]) App.S.timerHistoryHK[App.S.tk] = 0;
    App.lmc = 0;
    App.lmcRV = 0;
    App.lmcHK = 0;
    App.save();
    fbDebouncedPush();
    // Push leaderboard immediately on date rollover so "Today" tab resets to 0 for all viewers
    if (typeof pushLeaderboard === 'function') {
      pushLeaderboard().then(() => {
        localStorage.setItem('rjap_lastLbPushDate', newTk);
      }).catch(() => {});
    }
    App.ua();
    uStats();
  }
}, 60000);

// ── Get canonical app URL (strips index.html, query, hash) ──
function _getAppUrl() {
  let url = window.location.href;
  // Remove index.html from the end if present
  url = url.replace(/\/index\.html([?#].*)?$/, "/");
  // Remove query string and hash
  url = url.split("?")[0].split("#")[0];
  // Ensure trailing slash
  if (!url.endsWith("/")) url += "/";
  return url;
}

// ── Share App ──
function shareApp() {
  const url = _getAppUrl();
  const shareText =
    "Radha Vallabh Sri Harivangsa \uD83D\uDE4F\n\n" +
    "Boost your Naam Jap experience with this little app —\n" +
    "track Brahmacharya daily Jap & lots of statistics \u2728 \uD83E\uDEB7\n\n" +
    "\uD83D\uDC49 " +
    url;
  if (navigator.share) {
    navigator
      .share({ text: shareText })
      .then(() => toast("Shared! \uD83D\uDE4F Jai Radhe!"))
      .catch((err) => {
        if (err.name !== "AbortError") _copyAppUrl(shareText);
      });
  } else {
    _copyAppUrl(shareText);
  }
}

function _copyAppUrl(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(url)
      .then(() => toast("✅ App link copied! 🙏 Jai Radhe!"))
      .catch(() => _legacyCopy(url));
  } else {
    _legacyCopy(url);
  }
}

function _legacyCopy(url) {
  const ta = document.createElement("textarea");
  ta.value = url;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
    toast("✅ App link copied! 🙏 Jai Radhe!");
  } catch (e) {
    toast("Link: " + url);
  }
  ta.remove();
}

// ── Toast ──
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText =
      "position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:rgba(74,144,226,0.2);border:1px solid rgba(109,184,255,0.4);backdrop-filter:blur(10px);color:var(--a2);padding:9px 18px;border-radius:18px;font-size:13px;z-index:500;transition:opacity 0.3s;pointer-events:none;white-space:nowrap;font-family:Inter,sans-serif";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  setTimeout(() => (t.style.opacity = "0"), 2000);
}

// ── RV Target Save ──
function svtRV(type) {
  if (type === "d") {
    const v = parseInt(document.getElementById("dtRVIn").value) || 0;
    App.S.dtRV = v;
  }
  App.save();
  fbDebouncedPush();
  App.ua();
  toast("RV Daily Target saved! 🎯");
}

// ── HK Target Save ──
function svtHK(type) {
  if (type === "d") {
    const v = parseInt(document.getElementById("dtHKIn").value) || 0;
    App.S.dtHK = v;
  }
  App.save();
  fbDebouncedPush();
  App.ua();
  toast("HK Daily Target saved! 🎯");
}

// ── Target input sync: jap ↔ mala (used by both Radha and RV settings inputs) ──
function syncTargetJapToMala(prefix) {
  const ms = App.S.ms || 108;
  const japEl = document.getElementById(prefix + "In");
  const malaEl = document.getElementById(prefix + "MalaIn");
  const dispEl = document.getElementById(prefix + "Mala");
  const jap = parseInt((japEl && japEl.value) || 0) || 0;
  if (malaEl) malaEl.value = jap > 0 ? Math.round(jap / ms) : "";
  if (dispEl) dispEl.textContent = Math.ceil(jap / ms);
  // sync crore display when prefix is 'lt'
  if (prefix === "lt") {
    const croreEl = document.getElementById("ltCroreIn");
    const croreDisp = document.getElementById("ltCroreDisp");
    if (croreEl) croreEl.value = jap > 0 ? +(jap / 10000000).toFixed(4) : "";
    if (croreDisp)
      croreDisp.textContent = jap > 0 ? (jap / 10000000).toFixed(2) : "0";
  }
}
function syncTargetMalaToJap(prefix) {
  const ms = App.S.ms || 108;
  const japEl = document.getElementById(prefix + "In");
  const malaEl = document.getElementById(prefix + "MalaIn");
  const dispEl = document.getElementById(prefix + "Mala");
  const malas = parseInt((malaEl && malaEl.value) || 0) || 0;
  if (japEl) japEl.value = malas > 0 ? malas * ms : "";
  if (dispEl) dispEl.textContent = malas;
  // sync crore display when prefix is 'lt'
  if (prefix === "lt") {
    const jap = malas * ms;
    const croreEl = document.getElementById("ltCroreIn");
    const croreDisp = document.getElementById("ltCroreDisp");
    if (croreEl) croreEl.value = jap > 0 ? +(jap / 10000000).toFixed(4) : "";
    if (croreDisp)
      croreDisp.textContent = jap > 0 ? (jap / 10000000).toFixed(2) : "0";
  }
}
function syncTargetCroreToJap() {
  const ms = App.S.ms || 108;
  const CRORE_VAL = 10000000;
  const croreEl = document.getElementById("ltCroreIn");
  const japEl = document.getElementById("ltIn");
  const malaEl = document.getElementById("ltMalaIn");
  const dispEl = document.getElementById("ltMala");
  const croreDisp = document.getElementById("ltCroreDisp");
  const crores = parseFloat((croreEl && croreEl.value) || 0) || 0;
  const jap = Math.round(crores * CRORE_VAL);
  if (japEl) japEl.value = jap > 0 ? jap : "";
  if (malaEl) malaEl.value = jap > 0 ? Math.round(jap / ms) : "";
  if (dispEl)
    dispEl.textContent = jap > 0 ? Math.ceil(jap / ms).toLocaleString() : "0";
  if (croreDisp) croreDisp.textContent = crores > 0 ? crores.toFixed(2) : "0";
}

// ── Init jap mode UI on page load ──
function initJapModeUI() {
  // Normalize: in Gaudiya mode only HK is allowed; otherwise HK is not allowed
  let initMode = App.S.japMode || "radha";
  if (App.S.gaudiyaMode && initMode !== "hk") initMode = "hk";
  if (!App.S.gaudiyaMode && initMode === "hk") initMode = "radha";
  switchJapMode(initMode);

  const ms = App.S.ms || 108;
  // Populate RV target inputs
  const dtRVIn = document.getElementById("dtRVIn");
  if (dtRVIn && App.S.dtRV) dtRVIn.value = App.S.dtRV;
  const dtRVM = document.getElementById("dtRVMala");
  if (dtRVM) dtRVM.textContent = Math.floor((App.S.dtRV || 0) / ms);
  // Populate HK target inputs
  const dtHKIn = document.getElementById("dtHKIn");
  if (dtHKIn && App.S.dtHK) dtHKIn.value = App.S.dtHK;
  const dtHKM = document.getElementById("dtHKMala");
  if (dtHKM) dtHKM.textContent = Math.floor((App.S.dtHK || 0) / ms);
  // Init Gaudiya Mode toggle state
  const tgG = document.getElementById("tgGaudiya");
  if (tgG)
    App.S.gaudiyaMode ? tgG.classList.add("on") : tgG.classList.remove("on");
  if (App.S.gaudiyaMode) document.body.classList.add("gaudiya-mode");
  // Init Horizon Mode toggle state
  // Init HK language toggle state
  const tgH = document.getElementById("tgHkLang");
  if (tgH)
    App.S.hkLang === "bn"
      ? tgH.classList.add("on")
      : tgH.classList.remove("on");
  const lblH = document.getElementById("hkLangLabel");
  if (lblH) lblH.textContent = App.S.hkLang === "bn" ? "Bangla" : "Hindi";
  // Apply all language-sensitive labels on load
  applyHKLangLabels(App.S.hkLang || "hi");
  try { populateSettingsUI(); } catch (_e) {}
}

// ── Naam Selector Toggle ──
function toggleNaamSel() {
  const dd = document.getElementById("naamSelDd");
  const btn = document.getElementById("naamSelBtn");
  dd.classList.toggle("show");
  btn.classList.toggle("open");
  // Close on outside click
  if (dd.classList.contains("show")) {
    setTimeout(() => {
      document.addEventListener("click", closeNaamSelOutside);
      document.addEventListener("touchstart", closeNaamSelOutside, { passive: true });
    }, 10);
  }
}
function closeNaamSelOutside(e) {
  const dd = document.getElementById("naamSelDd");
  const btn = document.getElementById("naamSelBtn");
  if (!dd.contains(e.target) && !btn.contains(e.target)) {
    dd.classList.remove("show");
    btn.classList.remove("open");
    document.removeEventListener("click", closeNaamSelOutside);
    document.removeEventListener("touchstart", closeNaamSelOutside);
  }
}
function switchJapMode(mode) {
  App.S.japMode = mode;
  const dd = document.getElementById("naamSelDd");
  const btn = document.getElementById("naamSelBtn");
  dd.classList.remove("show");
  btn.classList.remove("open");
  document.removeEventListener("click", closeNaamSelOutside);
  document.removeEventListener("touchstart", closeNaamSelOutside);
  // Update UI
  const optR = document.getElementById("naamOptRadha");
  const optRV = document.getElementById("naamOptRV");
  const optHK = document.getElementById("naamOptHK");
  const titleEl = document.getElementById("rnTitle");
  const hkEl = document.getElementById("hkPersist");
  // Clear all active states first
  [optR, optRV, optHK].forEach((o) => {
    if (o) {
      o.classList.remove("active");
      o.querySelector(".ns-check").textContent = "";
    }
  });
  if (mode === "rv") {
    _hkMalaBlocked = false;
    const _mcClr = document.getElementById("hkMalaComplete");
    if (_mcClr) _mcClr.classList.remove("hkmc-visible");
    if (optRV) {
      optRV.classList.add("active");
      optRV.querySelector(".ns-check").textContent = "✓";
    }
    titleEl.innerHTML =
      '<span style="font-size:clamp(18px,5vw,28px);line-height:1.1">राधावल्लभ</span><br><span style="font-size:clamp(16px,4.5vw,24px);line-height:1.1">श्री हरिवंश</span>';
    titleEl.style.textAlign = "center";
    if (hkEl) {
      hkEl.classList.remove("hk-visible");
    }
  } else if (mode === "hk") {
    if (optHK) {
      optHK.classList.add("active");
      optHK.querySelector(".ns-check").textContent = "✓";
    }
    // Reset mala-complete block when switching into HK mode
    _hkMalaBlocked = false;
    const mc = document.getElementById("hkMalaComplete");
    if (mc) mc.classList.remove("hkmc-visible");
    const lang = App.S.hkLang || "hi";
    // Update dropdown label based on language
    const naamHKLabel = document.getElementById("naamHKLabel");
    if (naamHKLabel)
      naamHKLabel.textContent =
        lang === "bn" ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";
    const word = lang === "bn" ? "মহামন্ত্র" : "महामंत्र";
    titleEl.innerHTML =
      "<span style=\"font-size:clamp(22px,6vw,34px);line-height:1.1;color:#6DB8FF;font-family:'Tiro Devanagari Hindi','Hind Siliguri',serif\">" +
      word +
      "</span>";
    titleEl.style.textAlign = "center";
    if (hkEl) {
      hkEl.classList.remove("hk-visible");
      _hkColorIdx = 0;
    }
  } else {
    if (optR) {
      optR.classList.add("active");
      optR.querySelector(".ns-check").textContent = "✓";
    }
    titleEl.textContent = "राधा";
    titleEl.style.textAlign = "";
    if (hkEl) {
      hkEl.classList.remove("hk-visible");
    }
  }
  // Reset mala counter for the mode
  const ms = App.S.ms || 108;
  if (mode === "rv") {
    App.lmcRV = Math.floor((App.S.historyRV[App.S.tk] || 0) / ms);
  } else if (mode === "hk") {
    App.lmcHK = Math.floor(((App.S.historyHK || {})[App.S.tk] || 0) / ms);
  } else {
    App.lmc = Math.floor((App.S.history[App.S.tk] || 0) / ms);
  }
  App.save();
  App.ua();
  uStats();
  renderMalaLog();
  const toastMap = {
    rv: "राधावल्लभ श्री हरिवंश 🙏",
    hk: "हरे कृष्ण महामंत्र 🪷",
    radha: "राधा 🙏",
  };
  toast(toastMap[mode] || "राधा 🙏");
}

function escHtml(t) {
  return (t + "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Indian number abbreviation: 3Cr 36L 2K 100
function fmtIN(n) {
  n = Math.floor(n || 0);
  if (n === 0) return "0";
  const CR = 1e7,
    L = 1e5,
    K = 1e3;
  let parts = [];
  const cr = Math.floor(n / CR);
  n %= CR;
  const la = Math.floor(n / L);
  n %= L;
  const k = Math.floor(n / K);
  n %= K;
  if (cr) parts.push(cr + "Cr");
  if (la) parts.push(la + "L");
  if (k) parts.push(k + "K");
  if (n) parts.push(n + "");
  return parts.join(" ");
}

// setSyncPill
function setSyncPill(state, text) {
  const p = document.getElementById("syncPill");
  const tx = document.getElementById("syncPillText");
  if (!p || !tx) return;
  p.className =
    "sync-pill" +
    (state === "syncing" ? " syncing" : state === "error" ? " error" : "");
  tx.textContent = text;
}

// ── View Switcher ──
function sv(id, btn) {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nb").forEach((b) => b.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  if (btn) btn.classList.add("active");
  if (id === "vs") {
    uStats();
    _historyAutoLoaded = false;
  }
  if (id === "vb") {
    initBrahmaStartInput();
    renderCal();
    requestAnimationFrame(function () {
      setTimeout(renderBcGraph, 50);
    });
  }
  if (id === "vst") renderSt();
  if (id === "v28") {
    u28();
    render28Dots(get28Pos());
  } else {
    App.flush28TimeToHistory();
  }
  if (id === "vms") {
    renderMilestonesTab();
  }
  if (id === "vset") {
    populateSettingsUI();
  }
}

// ── Populate ALL Settings target/input fields from App.S ──
// Safe to call anytime (no-ops when elements aren't present yet).
// Called when navigating to Settings AND after every cloud pull / sign-in.
function populateSettingsUI() {
  if (typeof renderPhotoPickers === 'function') renderPhotoPickers();
  const ms = App.S.ms || 108;
  // Radha Daily
  const dtIn = document.getElementById("dtIn");
  if (dtIn) dtIn.value = App.S.dt > 0 ? App.S.dt : "";
  const dtMalaInEl = document.getElementById("dtMalaIn");
  if (dtMalaInEl) dtMalaInEl.value = App.S.dt > 0 ? Math.round(App.S.dt / ms) : "";
  const dtMalaDisp = document.getElementById("dtMala");
  if (dtMalaDisp) dtMalaDisp.textContent = App.S.dt > 0 ? Math.ceil(App.S.dt / ms) : "0";
  // Radha Lifetime
  const ltIn = document.getElementById("ltIn");
  if (ltIn) ltIn.value = App.S.lt > 0 ? App.S.lt : "";
  const ltMalaInEl = document.getElementById("ltMalaIn");
  if (ltMalaInEl) ltMalaInEl.value = App.S.lt > 0 ? Math.round(App.S.lt / ms) : "";
  const ltCroreInEl = document.getElementById("ltCroreIn");
  if (ltCroreInEl) ltCroreInEl.value = App.S.lt > 0 ? +(App.S.lt / 10000000).toFixed(4) : "";
  const ltCroreDispEl = document.getElementById("ltCroreDisp");
  if (ltCroreDispEl) ltCroreDispEl.textContent = App.S.lt > 0 ? (App.S.lt / 10000000).toFixed(2) : "0";
  const ltMalaDispEl = document.getElementById("ltMala");
  if (ltMalaDispEl) ltMalaDispEl.textContent = App.S.lt > 0 ? Math.ceil(App.S.lt / ms).toLocaleString() : "0";
  // Mala size
  const msIn = document.getElementById("msIn");
  if (msIn) msIn.value = ms;
  // RV Daily
  const dtRVEl = document.getElementById("dtRVIn");
  if (dtRVEl) dtRVEl.value = App.S.dtRV > 0 ? App.S.dtRV : "";
  const dtRVMalaInEl = document.getElementById("dtRVMalaIn");
  if (dtRVMalaInEl) dtRVMalaInEl.value = App.S.dtRV > 0 ? Math.round(App.S.dtRV / ms) : "";
  const dtRVMalaDisp = document.getElementById("dtRVMala");
  if (dtRVMalaDisp) dtRVMalaDisp.textContent = App.S.dtRV > 0 ? Math.floor(App.S.dtRV / ms) : "0";
  // HK Daily
  const dtHKEl = document.getElementById("dtHKIn");
  if (dtHKEl) dtHKEl.value = (App.S.dtHK || 0) > 0 ? App.S.dtHK : "";
  const dtHKMalaInEl = document.getElementById("dtHKMalaIn");
  if (dtHKMalaInEl) dtHKMalaInEl.value = (App.S.dtHK || 0) > 0 ? Math.round((App.S.dtHK || 0) / ms) : "";
  const dtHKMalaDisp = document.getElementById("dtHKMala");
  if (dtHKMalaDisp) dtHKMalaDisp.textContent = (App.S.dtHK || 0) > 0 ? Math.floor((App.S.dtHK || 0) / ms) : "0";
  // 28 Names daily target (cycles)
  const dt28El = document.getElementById("dt28CycleIn");
  if (dt28El) dt28El.value = (App.S.dt28Cycles || 0) > 0 ? App.S.dt28Cycles : "";
  const dt28Disp = document.getElementById("dt28JapDisp");
  if (dt28Disp) dt28Disp.textContent = (App.S.dt28Cycles || 0) * 28;
  // Gaudiya Mode toggle
  const tgG = document.getElementById("tgGaudiya");
  if (tgG) App.S.gaudiyaMode ? tgG.classList.add("on") : tgG.classList.remove("on");
  // Sound type select
  const stSel = document.getElementById("soundTypeSel");
  if (stSel) stSel.value = (App.S.cfg && App.S.cfg.soundType) || "shankya";
  // App link display (if visible)
  try {
    const linkEl = document.getElementById("appLinkDisplay");
    if (linkEl && typeof _getAppUrl === "function") linkEl.textContent = _getAppUrl();
  } catch (_e) {}
  // Leaderboard settings
  try { populateLbSettingsUI(); } catch (_e) {}
  // Background Photos settings
  try {
    const inBgRV = document.getElementById("inBgRadhaVallabh");
    if (inBgRV) inBgRV.value = App.S.bgRadhaVallabh ?? 1;
    const inBgHJ = document.getElementById("inBgHitju");
    if (inBgHJ) inBgHJ.value = App.S.bgHitju ?? 1;
    const inBgGD = document.getElementById("inBgGurudev");
    if (inBgGD) inBgGD.value = App.S.bgGurudev ?? 1;
    if (typeof applyBgPhotos === 'function') applyBgPhotos();
  } catch (_e) {}
}

// ── Settings ──
document.addEventListener("DOMContentLoaded", () => {
  const dti = document.getElementById("dtIn");
  const lti = document.getElementById("ltIn");
  if (dti)
    dti.addEventListener("input", function () {
      document.getElementById("dtMala").textContent = Math.ceil(
        (parseInt(this.value) || 0) / (App.S.ms || 108),
      );
    });
  if (lti)
    lti.addEventListener("input", function () {
      document.getElementById("ltMala").textContent = Math.ceil(
        (parseInt(this.value) || 0) / (App.S.ms || 108),
      ).toLocaleString();
    });

  // Live preview for new jap entry fields — trigger uStats on any change
  [
    "manualJapIn",
    "prevJapIn",
    "addJapOtherIn",
    "addJapOtherDate",
    "deductTodayIn",
    "deductOtherIn",
    "deductOtherDate",
    "jtAddTodayMin",
    "jtAddTodaySec",
    "jtAddOtherMin",
    "jtAddOtherSec",
    "jtAddOtherDate",
    "jtDedTodayMin",
    "jtDedTodaySec",
    "jtDedOtherMin",
    "jtDedOtherSec",
    "jtDedOtherDate",
    "nameJapDeductIn",
    "nameJapRestoreIn",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", uStats);
    if (el) el.addEventListener("change", uStats);
  });
});

function svt(tp) {
  if (tp === "d")
    App.S.dt = parseInt(document.getElementById("dtIn").value) || 0;
  else App.S.lt = parseInt(document.getElementById("ltIn").value) || 0;
  App.save();
  fbDebouncedPush();
  App.ua();
  toast("Target saved! 🎯");
}
function svm() {
  App.S.ms = parseInt(document.getElementById("msIn").value) || 108;
  App.save();
  App.ua();
  fbDebouncedPush();
  toast("Mala size saved! 📿");
}
function tgs(k) {
  if (k === "hkLang") {
    App.S.hkLang = App.S.hkLang === "bn" ? "hi" : "bn";
    const tgH = document.getElementById("tgHkLang");
    if (tgH)
      App.S.hkLang === "bn"
        ? tgH.classList.add("on")
        : tgH.classList.remove("on");
    const lblH = document.getElementById("hkLangLabel");
    if (lblH) lblH.textContent = App.S.hkLang === "bn" ? "Bangla" : "Hindi";
    // Update dropdown label in Jap page
    const naamHKLbl = document.getElementById("naamHKLabel");
    if (naamHKLbl)
      naamHKLbl.textContent =
        App.S.hkLang === "bn" ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";
    // Update Daily Target section label
    applyHKLangLabels(App.S.hkLang);
    // Update active state on lower language buttons
    if (typeof _applyHKLangBtnStyles === "function") _applyHKLangBtnStyles();
    const hkEl = document.getElementById("hkPersist");
    if (hkEl && hkEl.classList.contains("hk-visible")) {
      const newText = App.S.hkLang === "bn" ? HK_TEXT_BN : HK_TEXT;
      hkEl.innerHTML = newText
        .split("\n")
        .map((l) => "<div>" + l + "</div>")
        .join("");
    }
    if (App.S.japMode === "hk") switchJapMode("hk");
    App.save();
    fbDebouncedPush();
    toast(App.S.hkLang === "bn" ? "মহামন্ত্র · Bangla" : "महामंत्र · Hindi");
    return;
  }
  if (k === "gaudiyaMode") {
    App.S.gaudiyaMode = !App.S.gaudiyaMode;
    const tgG = document.getElementById("tgGaudiya");
    if (tgG)
      App.S.gaudiyaMode ? tgG.classList.add("on") : tgG.classList.remove("on");
    App.S.gaudiyaMode
      ? document.body.classList.add("gaudiya-mode")
      : document.body.classList.remove("gaudiya-mode");
    // Auto-switch jap mode so only valid options are visible at the top toggle
    if (App.S.gaudiyaMode) {
      if (App.S.japMode !== "hk") switchJapMode("hk");
    } else {
      if (App.S.japMode === "hk") switchJapMode("radha");
    }
    App.save();
    fbDebouncedPush();
    uStats();
    renderHistory && typeof renderHistory === "function" && renderHistory();
    if (typeof renderCal === "function") renderCal();
    toast(App.S.gaudiyaMode ? "🪷 Gaudiya Mode ON" : "🪷 Gaudiya Mode OFF");

    // Ensure any leftover banner from a previous flow is hidden.
    if (_gBanner) _gBanner.style.display = "none";
    return;
  }

  if (k === "gpsLocation") {
    // Toggle GPS location permission request
    const tgGps = document.getElementById("tgGpsLocation");
    const isCurrentlyOn = tgGps && tgGps.classList.contains("on");
    if (!isCurrentlyOn) {
      // User is turning ON — request location now
      if (!navigator.geolocation) {
        toast("⚠️ GPS not available on this device");
        return;
      }
      const statusEl = document.getElementById("gpsLocationStatus");
      if (statusEl) statusEl.textContent = "📍 Detecting your location…";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude, lng = pos.coords.longitude;
          window._appLat = lat; window._appLng = lng; // share with Vedic Panchanga engine
          if (App.S) { App.S.lastLat = lat; App.S.lastLng = lng; App.save(); }
          // Persist GPS-enabled state and coords to localStorage so the toggle
          // stays ON across refreshes for both guest and signed-in users,
          // WITHOUT re-prompting for geolocation permission on load.
          try {
            localStorage.setItem("rjap_gps_enabled", "1");
            localStorage.setItem("rjap_lastLat", String(lat));
            localStorage.setItem("rjap_lastLng", String(lng));
          } catch(e) {}
          updateSunInfo(lat, lng);
          if (tgGps) tgGps.classList.add("on");
          if (statusEl) statusEl.textContent = "✅ Location detected · " + lat.toFixed(3) + ", " + lng.toFixed(3);
          toast("📍 GPS location saved! Brahma Muhurta times updated 🙏");
          if (typeof renderCal === "function") renderCal();
        },
        () => {
          if (statusEl) statusEl.textContent = "⚠️ Location access denied. Please allow GPS in browser settings.";
          toast("⚠️ Could not get location. Please allow GPS access.");
        },
        { timeout: 10000, maximumAge: 0 },
      );
    } else {
      // Turning OFF — clear saved location and reset everything that depended on GPS
      if (App.S) { delete App.S.lastLat; delete App.S.lastLng; App.save(); }
      try {
        localStorage.removeItem("rjap_gps_enabled");
        localStorage.removeItem("rjap_lastLat");
        localStorage.removeItem("rjap_lastLng");
      } catch(e) {}
      if (tgGps) tgGps.classList.remove("on");
      const statusEl = document.getElementById("gpsLocationStatus");
      if (statusEl) statusEl.textContent = "— Tap toggle to detect your location 📍";
      // GPS is OFF — clear all time displays rather than show fake-coord times
      ["bm-start","bm-end","rh-sunrise","sk-start","sk-end","rh-sunset"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "—";
      });
      if (typeof renderCal === "function") renderCal();
      toast("📍 GPS location disabled — times reset to default");
    }
    return;
  }

  App.S.cfg[k] = !App.S.cfg[k];
  const m = { sound: "tgSnd", vib: "tgVib" };
  const el = m[k] ? document.getElementById(m[k]) : null;
  if (el) App.S.cfg[k] ? el.classList.add("on") : el.classList.remove("on");
  App.save();
  fbDebouncedPush();
}

// ── Rectangular mala bead frame (108 beads around Daily + Lifetime boxes) ──
const BEAD_SVG_NS = "http://www.w3.org/2000/svg";
function ensureBeadFrame() {
  const wrap = document.getElementById("beadFrameWrap");
  const svg = document.getElementById("beadFrame");
  if (!wrap || !svg) return null;
  if (svg.childElementCount !== 109) {
    svg.innerHTML = "";
    for (let i = 0; i < 108; i++) {
      const c = document.createElementNS(BEAD_SVG_NS, "circle");
      c.setAttribute("r", "2.2");
      // Last 8 of each mala = gold (guru section); first 100 = blue
      c.setAttribute("class", i < 100 ? "bead bead-blue" : "bead bead-gold");
      svg.appendChild(c);
    }
    // Sumeru bead — index 108. Fixed at top-center. Never counted, never moved.
    const sumeru = document.createElementNS(BEAD_SVG_NS, "circle");
    sumeru.setAttribute("id", "beadSumeru");
    sumeru.setAttribute("r", "4.5");
    sumeru.setAttribute("class", "bead bead-sumeru");
    svg.appendChild(sumeru);
  }
  return { wrap, svg };
}
let _beadState = { tod: 0, target: 0, lastFilled: -1 };

// ── Convert a perimeter distance (0..perim) to x,y on the rectangle ──
function _perimToXY(d, x0, y0, x1, y1) {
  const w = x1 - x0,
    h = y1 - y0;
  const perim = 2 * (w + h);
  d = ((d % perim) + perim) % perim; // normalise
  if (d < w) return { x: x0 + d, y: y0 };
  else if (d < w + h) return { x: x1, y: y0 + (d - w) };
  else if (d < 2 * w + h) return { x: x1 - (d - w - h), y: y1 };
  else return { x: x0, y: y1 - (d - 2 * w - h) };
}

function renderBeadFrame(tod, target) {
  const refs = ensureBeadFrame();
  if (!refs) return;
  if (typeof tod === "number" && typeof target === "number") {
    _beadState.tod = tod;
    _beadState.target = target;
  } else {
    tod = _beadState.tod;
    target = _beadState.target;
  }
  const { wrap, svg } = refs;
  const rect = wrap.getBoundingClientRect();
  const W = rect.width,
    H = rect.height;
  if (!W || !H) return;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const inset = 4;
  const x0 = inset,
    y0 = inset,
    x1 = W - inset,
    y1 = H - inset;
  const w = x1 - x0,
    h = y1 - y0;
  const N = 108;
  const GOLD = 8; // last 8 beads of each mala are gold
  const perim = 2 * (w + h);
  // 109 total slots (108 mala beads + 1 Sumeru) — equal spacing for all
  const step = perim / 109;

  const ms = (App && App.S && App.S.ms) || 108;
  const inMala = tod % ms;
  const malaIdx = Math.floor(tod / ms);
  const completedView = inMala === 0 && tod > 0;
  const effectiveMala = completedView ? malaIdx - 1 : malaIdx;
  // Mala 1,3,5… (odd, effectiveMala=0,2,4 zero-based) → CW: start RIGHT of Sumeru, gold ends LEFT
  // Mala 2,4,6… (even, effectiveMala=1,3,5 zero-based) → CCW: start LEFT of Sumeru, gold ends RIGHT
  const isCW = effectiveMala % 2 === 0;
  const filled = completedView ? N : Math.floor((inMala * N) / ms);
  const beads = svg.children;
  const justAdvanced =
    filled > _beadState.lastFilled && _beadState.lastFilled !== -1;

  // ── Sumeru: always fixed at top-center ──
  const sumeruCX = W / 2;
  const sumeruCY = y0;
  const sumeruEl = document.getElementById("beadSumeru");
  if (sumeruEl) {
    sumeruEl.setAttribute("cx", sumeruCX);
    sumeruEl.setAttribute("cy", sumeruCY);
  }

  // 109 equal slots around the perimeter. Sumeru occupies the top-center slot.
  // sumeruD = distance from top-left corner along top edge to Sumeru.
  const sumeruD = sumeruCX - x0;

  // CW mala (odd):
  //   Bead 0 is 1 slot to the RIGHT of Sumeru (clockwise from Sumeru).
  //   Each next bead advances clockwise (+step in perimeter distance).
  //   Bead 107 (last gold) lands 1 slot to the LEFT of Sumeru. Gold block = LEFT side. ✓
  //
  // CCW mala (even):
  //   Bead 0 is 1 slot to the LEFT of Sumeru (anticlockwise from Sumeru).
  //   Each next bead advances anticlockwise (-step in perimeter distance).
  //   Bead 107 (last gold) lands 1 slot to the RIGHT of Sumeru. Gold block = RIGHT side. ✓

  for (let i = 0; i < N; i++) {
    let d;
    if (isCW) {
      // Start 1 slot RIGHT of Sumeru, advance clockwise (increasing perimeter distance)
      d = sumeruD + step + i * step;
    } else {
      // Start 1 slot LEFT of Sumeru, advance anticlockwise (decreasing perimeter distance)
      d = sumeruD - step - i * step;
    }
    const { x, y } = _perimToXY(d, x0, y0, x1, y1);
    const c = beads[i];
    c.setAttribute("cx", x);
    c.setAttribute("cy", y);
    c.setAttribute("r", "2.2");
    c.setAttribute("style", "");
    const isGold = i >= N - GOLD;
    const baseCls = isGold ? "bead bead-gold" : "bead bead-blue";
    c.setAttribute("class", baseCls + (i < filled ? " filled" : ""));
  }

  // Pulse the freshly-filled bead
  if (justAdvanced && filled > 0 && filled <= N) {
    const pulsed = beads[filled - 1];
    if (pulsed) {
      pulsed.classList.add("bead-pulse");
      setTimeout(() => pulsed.classList.remove("bead-pulse"), 500);
    }
  }
  _beadState.lastFilled = filled;
}
window.addEventListener("resize", () => renderBeadFrame());
window.addEventListener("load", () => {
  setTimeout(() => renderBeadFrame(), 100);
});

// ── Auto-load today's view in History on first open ──
let _historyAutoLoaded = false;
function autoLoadHistory() {
  if (_historyAutoLoaded) return;
  const body = document.getElementById("historyBody");
  if (!body || !body.classList.contains("open")) return;
  _historyAutoLoaded = true;
  const today = _ldk(new Date());
  const f = document.getElementById("histFrom"),
    t = document.getElementById("histTo");
  if (f && !f.value) f.value = today;
  if (t && !t.value) t.value = today;
  const todayBtn = document.querySelector(
    '#histPresetRow .hpb[data-preset="1"]',
  );
  if (todayBtn) {
    todayBtn.classList.add("active");
    window._histActiveLabel = "Today";
  }
  if (typeof renderHistory === "function")
    try {
      renderHistory();
    } catch (e) {}
}

// ── Collapsible Section Toggle ──
function toggleCs(bodyId, chevId) {
  const body = document.getElementById(bodyId);
  const chev = document.getElementById(chevId);
  if (!body) return;
  const isOpen = body.classList.contains("open");
  body.classList.toggle("open", !isOpen);
  if (chev) chev.style.transform = isOpen ? "" : "rotate(180deg)";
}

// ── Manual Jap Entry ──
function addManualJap() {
  const n = parseInt(document.getElementById("manualJapIn").value) || 0;
  if (n <= 0) {
    toast("Please enter a number > 0");
    return;
  }
  // ── DAILY-TARGET FIX: ensure tk matches current day before writing ──
  // Previously a stale App.S.tk could cause the new jap to be written to a
  // different date key than the one gTod() reads back from, leaving the
  // Daily progress bar showing 0 until a later refresh corrected it.
  App.S.tk = App.getTk();
  if (!App.S.history) App.S.history = {};
  if (!App.S.historyRV) App.S.historyRV = {};
  if (!App.S.historyHK) App.S.historyHK = {};
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  if (isRV) {
    App.S.historyRV[App.S.tk] = (App.S.historyRV[App.S.tk] || 0) + n;
  } else if (isHK) {
    App.S.historyHK[App.S.tk] = (App.S.historyHK[App.S.tk] || 0) + n;
  } else {
    App.S.history[App.S.tk] = (App.S.history[App.S.tk] || 0) + n;
  }
  // Handle time input — add mala log entries then sync timerHistory from log sum
  const minEl = document.getElementById("manualJapMin");
  const secEl = document.getElementById("manualJapSec");
  const timeSecs =
    (parseInt(minEl?.value) || 0) * 60 +
    Math.min(59, Math.max(0, parseInt(secEl?.value) || 0));
  // Hoisted so the celebration block below can safely reference it even when
  // no time was entered (previously a block-scoped const threw a ReferenceError).
  let avgPerMala = 0;
  if (timeSecs > 0) {
    // Push averaged mala entries into malaLog so Today's Mala Log shows them.
    // Also log to activityLog so history per-mala table shows them correctly.
    const ms2 = App.S.ms || 108;
    const malasAdded = Math.max(1, Math.floor(n / ms2));
    avgPerMala = Math.round(timeSecs / malasAdded);
    const log = isRV
      ? App.S.malaLogRV || (App.S.malaLogRV = [])
      : isHK
        ? App.S.malaLogHK || (App.S.malaLogHK = [])
        : App.S.malaLog || (App.S.malaLog = []);
    const now = Date.now();
    const modeStr = isRV ? "rv" : isHK ? "hk" : "radha";
    for (let i = 0; i < malasAdded; i++) {
      log.push(avgPerMala);
      logActivity({
        t: "mala",
        mode: modeStr,
        sec: avgPerMala,
        ts: now + i * 1000,
        startTs: now + i * 1000 - avgPerMala * 1000,
        manual: true,
      });
    }
    // Sync timerHistory from updated mala log sum
    App.syncTimerFromMalaLog();
  }
  App.ensureMalaWallStart();
  const nm = Math.floor(App.gTod() / (App.S.ms || 108));
  const lmcKey = isRV ? "lmcRV" : isHK ? "lmcHK" : "lmc";
  if (nm > (App[lmcKey] || 0)) {
    App[lmcKey] = nm;
    // Celebrate the new mala milestone WITHOUT calling malaOk() —
    // malaOk() pushes a wall-clock duration into malaLog which creates a
    // ghost entry. We only want the visual/audio celebration here.
    const _mf = document.getElementById("mf");
    if (_mf) {
      if (isHK) {
        const lang = App.S.hkLang || "hi";
        const line1 =
          lang === "bn"
            ? "জয় শ্রীকৃষ্ণ চৈতন্য প্রভু নিত্যানন্দ।"
            : "जय श्री कृष्ण चैतन्य प्रभु नित्यानन्द।";
        const line2 =
          lang === "bn"
            ? "শ্রীঅদ্বৈত গদাধর শ্রীবাসাদি গৌরভক্তবৃন্দ।"
            : "श्री अद्वैत गदाधर श्रीवासादि गौर भक्त वृन्द॥";
        const l1e = _mf.querySelector(".mf-line1");
        const l2e = _mf.querySelector(".mf-line2");
        const o1 = l1e ? l1e.textContent : "";
        const o2 = l2e ? l2e.textContent : "";
        if (l1e) {
          l1e.textContent = line1;
          l1e.style.fontSize = "clamp(14px,3.8vw,22px)";
        }
        if (l2e) {
          l2e.textContent = line2;
          l2e.style.fontSize = "clamp(12px,3.2vw,18px)";
          l2e.style.fontFamily =
            "'Tiro Devanagari Hindi','Hind Siliguri',serif";
          l2e.style.color = "var(--gold)";
        }
        _mf.classList.add("show-long");
        setTimeout(() => {
          _mf.classList.remove("show-long");
          if (l1e) {
            l1e.textContent = o1;
            l1e.style.fontSize = "";
          }
          if (l2e) {
            l2e.textContent = o2;
            l2e.style.fontSize = "";
            l2e.style.fontFamily = "";
            l2e.style.color = "";
          }
        }, 4000);
      } else {
        _mf.classList.add("show");
        setTimeout(() => _mf.classList.remove("show"), 2800);
      }
    }
    if (App.S.cfg && App.S.cfg.sound) playMalaSound();
    App.vib([200, 80, 200, 80, 300]);
    App.flashMalaDuration(avgPerMala);
  }
  App.save();
  App.ua();
  fbDebouncedPush();
  // ── DAILY-TARGET FIX: force every dependent view to re-read from state now,
  // not just the home progress bar. This eliminates the lag where the Daily
  // bar/Stats stayed at the old value until a later sync triggered a redraw. ──
  try {
    uStats();
  } catch (e) {}
  try {
    if (typeof renderCal === "function") renderCal();
  } catch (e) {}
  try {
    if (typeof renderBcal === "function") renderBcal();
  } catch (e) {}
  renderMalaLog();
  if (typeof renderHistory === "function") {
    try {
      renderHistory();
    } catch (e) {}
  }
  // Defensive second pass on next tick to win any race with concurrent renders.
  setTimeout(() => {
    try {
      App.ua();
      uStats();
    } catch (e) {}
  }, 0);
  document.getElementById("manualJapIn").value = "";
  if (minEl) minEl.value = "";
  if (secEl) secEl.value = "";
  document.getElementById("manualMalaPreview").textContent = "0";
  document.getElementById("manualTodayPreview").textContent = App.gTod();
  toast(
    "Added " +
      n +
      " jap" +
      (timeSecs > 0
        ? " + " + Math.floor(timeSecs / 60) + "m " + (timeSecs % 60) + "s"
        : "") +
      " to today! Total: " +
      App.gTod() +
      " 🙏",
  );
}

function addPrevJap() {
  const n = parseInt(document.getElementById("prevJapIn").value) || 0;
  if (n <= 0) {
    toast("Please enter a number > 0");
    return;
  }
  const prevKey = "prev_" + Date.now();
  const isRV = App.S.japMode === "rv";
  if (isRV) {
    App.S.historyRV[prevKey] = n;
  } else {
    App.S.history[prevKey] = n;
  }
  // Clear input BEFORE re-render so the live preview resets to "—"
  document.getElementById("prevJapIn").value = "";
  const _pml = document.getElementById("prevMalaPreview");
  if (_pml) _pml.textContent = "0";
  const _plp = document.getElementById("prevLifetimePreview");
  if (_plp) _plp.textContent = "—";
  App.save();
  App.ua();
  fbDebouncedPush();
  toast("Added " + n.toLocaleString() + " jap to lifetime! 🙏 Jai Radhe!");
}

// ── Deduct Name Jap from Lifetime ──
function addNameJapDeduct() {
  const n = parseInt(document.getElementById("nameJapDeductIn").value) || 0;
  if (n <= 0) {
    toast("Please enter a number > 0");
    return;
  }
  if (App.S.japMode === "rv") {
    App.S.nameJapDeductRV = (App.S.nameJapDeductRV || 0) + n;
  } else if (App.S.japMode === "hk") {
    App.S.nameJapDeductHK = (App.S.nameJapDeductHK || 0) + n;
  } else {
    App.S.nameJapDeduct = (App.S.nameJapDeduct || 0) + n;
  }
  App.save();
  App.ua();
  fbDebouncedPush();
  document.getElementById("nameJapDeductIn").value = "";
  document.getElementById("nameJapDeductPreview").textContent = "—";
  uStats();
  toast("Deducted " + n.toLocaleString() + " name jap from lifetime total 🙏");
}

function removeNameJapDeduct() {
  const n = parseInt(document.getElementById("nameJapRestoreIn").value) || 0;
  if (n <= 0) {
    toast("Please enter a number > 0");
    return;
  }
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const cur = isRV
    ? App.S.nameJapDeductRV || 0
    : isHK
      ? App.S.nameJapDeductHK || 0
      : App.S.nameJapDeduct || 0;
  if (n > cur) {
    toast(
      "Cannot restore more than currently deducted (" +
        cur.toLocaleString() +
        ")",
    );
    return;
  }
  if (isRV) {
    App.S.nameJapDeductRV = cur - n;
  } else if (isHK) {
    App.S.nameJapDeductHK = cur - n;
  } else {
    App.S.nameJapDeduct = cur - n;
  }
  App.save();
  App.ua();
  fbDebouncedPush();
  document.getElementById("nameJapRestoreIn").value = "";
  document.getElementById("nameJapRestorePreview").textContent = "—";
  uStats();
  toast("Restored " + n.toLocaleString() + " jap to lifetime total 🙏");
}

function deductTodayJap() {
  const n = parseInt(document.getElementById("deductTodayIn").value) || 0;
  if (n <= 0) {
    toast("Please enter a number > 0");
    return;
  }
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const hist = isRV
    ? App.S.historyRV
    : isHK
      ? App.S.historyHK || (App.S.historyHK = {})
      : App.S.history;
  const cur = hist[App.S.tk] || 0;
  if (n > cur) {
    toast("Cannot deduct more than today's count (" + cur + ")");
    return;
  }
  hist[App.S.tk] = cur - n;
  const lmcKey = isRV ? "lmcRV" : isHK ? "lmcHK" : "lmc";
  App[lmcKey] = Math.floor(App.gTod() / (App.S.ms || 108));

  // Explicit time input wins; otherwise fall back to proportional removal from mala log
  const minEl = document.getElementById("deductTodayMin");
  const secEl = document.getElementById("deductTodaySec");
  const explicitTime =
    (parseInt(minEl?.value) || 0) * 60 +
    Math.min(59, Math.max(0, parseInt(secEl?.value) || 0));
  const log = isRV
    ? App.S.malaLogRV || (App.S.malaLogRV = [])
    : isHK
      ? App.S.malaLogHK || (App.S.malaLogHK = [])
      : App.S.malaLog || (App.S.malaLog = []);

  if (explicitTime > 0) {
    // Shrink the mala log entries proportionally so total drops by explicitTime,
    // then re-sync timerHistory[today] from the log (single source of truth).
    const total = log.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const factor = Math.max(0, (total - explicitTime) / total);
      for (let i = 0; i < log.length; i++) log[i] = Math.round(log[i] * factor);
    }
    App.syncTimerFromMalaLog();
  } else if (log.length > 0) {
    const ratio = n / cur;
    const malasToRemove = Math.floor(n / (App.S.ms || 108));
    if (malasToRemove > 0 && malasToRemove <= log.length) {
      const removed = log.splice(log.length - malasToRemove, malasToRemove);
      const removedTime = removed.reduce((a, b) => a + b, 0);
      const th = App.getCurTimerHistory();
      th[App.S.tk] = Math.max(0, (th[App.S.tk] || 0) - removedTime);
    } else if (malasToRemove === 0 && ratio > 0 && log.length > 0) {
      const timeShrink = Math.round(
        ratio * (App.getCurTimerHistory()[App.S.tk] || 0),
      );
      const th = App.getCurTimerHistory();
      th[App.S.tk] = Math.max(0, (th[App.S.tk] || 0) - timeShrink);
    }
  }

  App.save();
  App.ua();
  fbDebouncedPush();
  document.getElementById("deductTodayIn").value = "";
  if (minEl) minEl.value = "";
  if (secEl) secEl.value = "";
  toast(
    "Deducted " +
      n +
      (explicitTime > 0
        ? " + " +
          Math.floor(explicitTime / 60) +
          "m " +
          (explicitTime % 60) +
          "s"
        : "") +
      ". New total: " +
      App.gTod() +
      " 🙏",
  );
}

function deductOtherJap() {
  const date = (document.getElementById("deductOtherDate").value || "").trim();
  const n = parseInt(document.getElementById("deductOtherIn").value) || 0;
  if (!date) {
    toast("Please select a date");
    return;
  }
  if (n <= 0) {
    toast("Please enter a number > 0");
    return;
  }
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const hist = isRV
    ? App.S.historyRV
    : isHK
      ? App.S.historyHK || (App.S.historyHK = {})
      : App.S.history;
  const cur = hist[date] || 0;
  if (n > cur) {
    toast("Cannot deduct more than that day's count (" + cur + ")");
    return;
  }
  hist[date] = cur - n;

  // Optional time deduction — directly subtract from per-day timerHistory
  const minEl = document.getElementById("deductOtherMin");
  const secEl = document.getElementById("deductOtherSec");
  const timeSecs =
    (parseInt(minEl?.value) || 0) * 60 +
    Math.min(59, Math.max(0, parseInt(secEl?.value) || 0));
  if (timeSecs > 0) {
    const th = isRV
      ? App.S.timerHistoryRV || (App.S.timerHistoryRV = {})
      : isHK
        ? App.S.timerHistoryHK || (App.S.timerHistoryHK = {})
        : App.S.timerHistory || (App.S.timerHistory = {});
    th[date] = Math.max(0, (th[date] || 0) - timeSecs);
  }

  App.save();
  App.ua();
  fbDebouncedPush();
  renderCal();
  // ── HISTORY FIX: re-render history table so the change appears immediately ──
  if (typeof renderHistory === "function") {
    try {
      renderHistory();
    } catch (e) {}
  }
  document.getElementById("deductOtherIn").value = "";
  if (minEl) minEl.value = "";
  if (secEl) secEl.value = "";
  toast(
    "Deducted " +
      n +
      (timeSecs > 0
        ? " + " + Math.floor(timeSecs / 60) + "m " + (timeSecs % 60) + "s"
        : "") +
      " from " +
      date +
      " 🙏",
  );
}

function addOtherDayJap() {
  const date = (document.getElementById("addJapOtherDate").value || "").trim();
  const n = parseInt(document.getElementById("addJapOtherIn").value) || 0;
  if (!date) {
    toast("Please select a date");
    return;
  }
  if (n <= 0) {
    toast("Please enter a number > 0");
    return;
  }
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const hist = isRV
    ? App.S.historyRV
    : isHK
      ? App.S.historyHK || (App.S.historyHK = {})
      : App.S.history;
  hist[date] = (hist[date] || 0) + n;

  // Optional estimated time — directly add to per-day timerHistory
  const minEl = document.getElementById("addJapOtherMin");
  const secEl = document.getElementById("addJapOtherSec");
  const timeSecs =
    (parseInt(minEl?.value) || 0) * 60 +
    Math.min(59, Math.max(0, parseInt(secEl?.value) || 0));
  if (timeSecs > 0) {
    const th = isRV
      ? App.S.timerHistoryRV || (App.S.timerHistoryRV = {})
      : isHK
        ? App.S.timerHistoryHK || (App.S.timerHistoryHK = {})
        : App.S.timerHistory || (App.S.timerHistory = {});
    th[date] = (th[date] || 0) + timeSecs;
  }

  App.save();
  App.ua();
  fbDebouncedPush();
  renderCal();
  // ── HISTORY FIX: re-render history table so the new entry appears immediately ──
  if (typeof renderHistory === "function") {
    try {
      renderHistory();
    } catch (e) {}
  }
  document.getElementById("addJapOtherIn").value = "";
  if (minEl) minEl.value = "";
  if (secEl) secEl.value = "";
  document.getElementById("addJapOtherPreview").textContent = "—";
  toast(
    "Added " +
      n +
      (timeSecs > 0
        ? " + " + Math.floor(timeSecs / 60) + "m " + (timeSecs % 60) + "s"
        : "") +
      " jap to " +
      date +
      " 🙏",
  );
}

// ── Jap Time Manual Entry ──
function _jtSecs(minId, secId) {
  const m = parseInt(document.getElementById(minId).value) || 0;
  const s = parseInt(document.getElementById(secId).value) || 0;
  return m * 60 + Math.min(59, Math.max(0, s));
}

function addJapTimeToday() {
  const secs = _jtSecs("jtAddTodayMin", "jtAddTodaySec");
  if (secs <= 0) {
    toast("Please enter at least 1 minute");
    return;
  }
  const th = App.getCurTimerHistory();
  th[App.S.tk] = (th[App.S.tk] || 0) + secs;
  // Keep mala log in harmony: distribute added time proportionally across existing entries
  // or add a single adjustment entry if no malas done yet today
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const log = isRV
    ? App.S.malaLogRV || (App.S.malaLogRV = [])
    : isHK
      ? App.S.malaLogHK || (App.S.malaLogHK = [])
      : App.S.malaLog || (App.S.malaLog = []);
  if (log.length > 0) {
    // Distribute proportionally: each mala entry gets its share
    const total = log.reduce((a, b) => a + b, 0);
    let remaining = secs;
    for (let i = 0; i < log.length - 1; i++) {
      const share = Math.round((secs * log[i]) / total);
      log[i] += share;
      remaining -= share;
    }
    log[log.length - 1] += remaining; // last entry absorbs rounding difference
  } else {
    // No malas done yet — add as a single time-adjustment entry
    log.push(secs);
  }
  App.save();
  App.ua();
  fbDebouncedPush();
  document.getElementById("jtAddTodayMin").value = "";
  document.getElementById("jtAddTodaySec").value = "";
  document.getElementById("jtAddTodayPreview").textContent = "—";
  const m = Math.floor(secs / 60),
    s = secs % 60;
  toast("Added " + m + "m " + s + "s to today's jap time 🙏");
}

function addJapTimeOther() {
  const date = (document.getElementById("jtAddOtherDate").value || "").trim();
  const secs = _jtSecs("jtAddOtherMin", "jtAddOtherSec");
  if (!date) {
    toast("Please select a date");
    return;
  }
  if (secs <= 0) {
    toast("Please enter at least 1 minute");
    return;
  }
  const th2 = App.getCurTimerHistory();
  th2[date] = (th2[date] || 0) + secs;
  App.save();
  App.ua();
  fbDebouncedPush();
  // ── HISTORY FIX: re-render history table so the new time appears immediately ──
  if (typeof renderHistory === "function") {
    try {
      renderHistory();
    } catch (e) {}
  }
  document.getElementById("jtAddOtherMin").value = "";
  document.getElementById("jtAddOtherSec").value = "";
  document.getElementById("jtAddOtherDate").value = "";
  document.getElementById("jtAddOtherPreview").textContent = "—";
  const m = Math.floor(secs / 60),
    s = secs % 60;
  toast("Added " + m + "m " + s + "s to " + date + " 🙏");
}

function deductJapTimeToday() {
  const secs = _jtSecs("jtDedTodayMin", "jtDedTodaySec");
  if (secs <= 0) {
    toast("Please enter at least 1 minute");
    return;
  }
  const th3 = App.getCurTimerHistory();
  const cur = th3[App.S.tk] || 0;
  if (secs > cur) {
    toast(
      "Cannot deduct more than today's time (" +
        Math.floor(cur / 60) +
        "m " +
        (cur % 60) +
        "s)",
    );
    return;
  }
  th3[App.S.tk] = cur - secs;
  // Keep mala log in harmony: reduce entries proportionally
  const isRV = App.S.japMode === "rv";
  const log = isRV ? App.S.malaLogRV || [] : App.S.malaLog || [];
  if (log.length > 0) {
    const total = log.reduce((a, b) => a + b, 0);
    if (total > 0) {
      let remaining = secs;
      for (let i = 0; i < log.length - 1; i++) {
        const share = Math.round((secs * log[i]) / total);
        log[i] = Math.max(1, log[i] - share); // keep each entry at least 1s
        remaining -= share;
      }
      log[log.length - 1] = Math.max(1, log[log.length - 1] - remaining);
    }
  }
  App.save();
  App.ua();
  fbDebouncedPush();
  document.getElementById("jtDedTodayMin").value = "";
  document.getElementById("jtDedTodaySec").value = "";
  document.getElementById("jtDedTodayPreview").textContent = "—";
  const m = Math.floor(secs / 60),
    s = secs % 60;
  toast("Deducted " + m + "m " + s + "s from today's jap time 🙏");
}

function deductJapTimeOther() {
  const date = (document.getElementById("jtDedOtherDate").value || "").trim();
  const secs = _jtSecs("jtDedOtherMin", "jtDedOtherSec");
  if (!date) {
    toast("Please select a date");
    return;
  }
  if (secs <= 0) {
    toast("Please enter at least 1 minute");
    return;
  }
  const th4 = App.getCurTimerHistory();
  const cur = th4[date] || 0;
  if (secs > cur) {
    toast(
      "Cannot deduct more than that day's time (" + Math.floor(cur / 60) + "m)",
    );
    return;
  }
  th4[date] = cur - secs;
  App.save();
  App.ua();
  fbDebouncedPush();
  // ── HISTORY FIX: re-render history table so the change appears immediately ──
  if (typeof renderHistory === "function") {
    try {
      renderHistory();
    } catch (e) {}
  }
  document.getElementById("jtDedOtherMin").value = "";
  document.getElementById("jtDedOtherSec").value = "";
  document.getElementById("jtDedOtherDate").value = "";
  document.getElementById("jtDedOtherPreview").textContent = "—";
  const m = Math.floor(secs / 60),
    s = secs % 60;
  toast("Deducted " + m + "m " + s + "s from " + date + " 🙏");
}

// ── Stats ──
function uStats() {
  const ms = App.S.ms || 108,
    tot = App.gTot(),
    now = new Date();
  const tod = App.gTodCombined(); // COMBINED today for stats
  const curHist = App.getCombinedHistory(); // COMBINED radha + RV
  const curTimerHist = App.getCombinedTimerHistory(); // COMBINED timer
  const wk = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    wk.push(_ldk(d));
  }
  const ws = wk.reduce((s, k) => s + (curHist[k] || 0), 0);
  const mp = _ldk(now).slice(0, 7);
  let ms2 = 0,
    best = 0,
    streak = 0;
  Object.entries(curHist).forEach(([k, v]) => {
    if (k.startsWith(mp)) ms2 += v;
    if (!k.startsWith("prev_") && v > best) best = v;
  });
  // ── Streak & Best Streak (mode-aware, per-target checking) ──
  const _isGaudiya = App.S.gaudiyaMode || false;
  const _radhaTarget = App.S.dt || 0;
  const _rvTarget = App.S.dtRV || 0;
  const _hkTarget = App.S.dtHK || 0;
  // A target is "active" if at least one target is configured for the current mode
  const _hasTarget = _isGaudiya
    ? _hkTarget > 0
    : _radhaTarget > 0 || _rvTarget > 0;
  // Returns true only when EVERY configured target for this mode is individually met on day k
  function _dayHitsTarget(k) {
    if (_isGaudiya) {
      return _hkTarget > 0 && (App.S.historyHK[k] || 0) >= _hkTarget;
    }
    const radhaOk =
      _radhaTarget <= 0 || (App.S.history[k] || 0) >= _radhaTarget;
    const rvOk = _rvTarget <= 0 || (App.S.historyRV[k] || 0) >= _rvTarget;
    return (_radhaTarget > 0 || _rvTarget > 0) && radhaOk && rvOk;
  }
  // Active Streak: consecutive days where ALL configured targets were individually hit.
  // If today hasn't hit every target yet, start from yesterday so an
  // in-progress day doesn't break an otherwise-live streak.
  const d2 = new Date();
  if (_hasTarget && !_dayHitsTarget(_ldk(d2))) {
    d2.setDate(d2.getDate() - 1);
  }
  while (streak < 999 && _hasTarget) {
    const k = _ldk(d2);
    if (_dayHitsTarget(k)) {
      streak++;
      d2.setDate(d2.getDate() - 1);
    } else break;
  }
  // Best Streak Ever: longest consecutive run where ALL configured targets were individually hit
  let bestStreakEver = 0;
  if (_hasTarget) {
    const _allHistKeys = new Set([
      ...Object.keys(App.S.history || {}),
      ...Object.keys(App.S.historyRV || {}),
      ...Object.keys(App.S.historyHK || {}),
    ]);
    const tgtDays = Array.from(_allHistKeys)
      .filter((k) => !k.startsWith("prev_") && _dayHitsTarget(k))
      .sort();
    let run = 0;
    for (let i = 0; i < tgtDays.length; i++) {
      if (i === 0) {
        run = 1;
      } else {
        const diff = Math.round(
          (new Date(tgtDays[i]) - new Date(tgtDays[i - 1])) / 86400000,
        );
        run = diff === 1 ? run + 1 : 1;
      }
      if (run > bestStreakEver) bestStreakEver = run;
    }
    // Active streak always wins if it surpasses the historical best
    bestStreakEver = Math.max(bestStreakEver, streak);
  }
  const elBSE = document.getElementById("sBestStreakEver");
  const elBSESub = document.getElementById("sBestStreakEverSub");
  if (elBSE) elBSE.textContent = bestStreakEver;
  if (elBSESub)
    elBSESub.textContent = _hasTarget
      ? "Best ever consecutive target days"
      : "Set a daily target to track";
  document.getElementById("sTod").textContent = tod;
  document.getElementById("sTodM").textContent =
    Math.floor(tod / ms) + " malas";
  document.getElementById("sWk").textContent = ws;
  document.getElementById("sWkM").textContent = Math.floor(ws / ms) + " malas";
  document.getElementById("sMo").textContent = ms2;
  document.getElementById("sMoM").textContent = Math.floor(ms2 / ms) + " malas";
  document.getElementById("sTot").textContent = tot;
  document.getElementById("sTotM").textContent =
    Math.floor(tot / ms) + " malas";
  // ── SEPARATED LIFETIME TOTALS ──
  const radhaLifetime = Math.max(
    0,
    Object.values(App.S.history || {}).reduce((a, b) => a + b, 0) -
      (App.S.nameJapDeduct || 0),
  );
  const rvLifetime = Math.max(
    0,
    Object.values(App.S.historyRV || {}).reduce((a, b) => a + b, 0) -
      (App.S.nameJapDeductRV || 0),
  );
  const n28Lifetime = Object.values(App.S.h28 || {}).reduce((a, b) => a + b, 0);
  function fmtCount(n) {
    if (n <= 0) return "0";
    const cr = Math.floor(n / 10000000);
    const l = Math.floor((n % 10000000) / 100000);
    const k = Math.floor((n % 100000) / 1000);
    const r = n % 1000;
    let parts = [];
    if (cr) parts.push(cr + " Cr");
    if (l) parts.push(l + " L");
    if (k) parts.push(k + "K");
    if (r) parts.push(r + "");
    return parts.join(" ") || "0";
  }
  const sRadha = document.getElementById("sRadhaTot");
  if (sRadha) sRadha.textContent = radhaLifetime.toLocaleString("en-IN");
  const sRadhaM = document.getElementById("sRadhaTotM");
  if (sRadhaM) sRadhaM.textContent = Math.floor(radhaLifetime / ms) + " malas";
  const sRadhaF = document.getElementById("sRadhaTotF");
  if (sRadhaF) sRadhaF.textContent = fmtCount(radhaLifetime) + " jap";
  const sRV = document.getElementById("sRVTot");
  if (sRV) sRV.textContent = rvLifetime.toLocaleString("en-IN");
  const sRVM = document.getElementById("sRVTotM");
  if (sRVM) sRVM.textContent = Math.floor(rvLifetime / ms) + " malas";
  const sRVF = document.getElementById("sRVTotF");
  if (sRVF) sRVF.textContent = fmtCount(rvLifetime) + " jap";
  const s28 = document.getElementById("s28Tot");
  if (s28) s28.textContent = n28Lifetime.toLocaleString("en-IN");
  const s28M = document.getElementById("s28TotM");
  if (s28M) s28M.textContent = Math.floor(n28Lifetime / 28) + " cycles";
  const s28F = document.getElementById("s28TotF");
  if (s28F) s28F.textContent = fmtCount(n28Lifetime) + " names";
  // HK Lifetime
  const hkLifetime = Math.max(
    0,
    Object.values(App.S.historyHK || {}).reduce((a, b) => a + b, 0) -
      (App.S.nameJapDeductHK || 0),
  );
  const sHK = document.getElementById("sHKTot");
  if (sHK) sHK.textContent = hkLifetime.toLocaleString("en-IN");
  const sHKM = document.getElementById("sHKTotM");
  if (sHKM) sHKM.textContent = Math.floor(hkLifetime / ms) + " malas";
  const sHKF = document.getElementById("sHKTotF");
  if (sHKF) sHKF.textContent = fmtCount(hkLifetime) + " jap";
  // Combined Lifetime Jap (Radha + RV + 28 names)
  const ltJapAll = radhaLifetime + rvLifetime + n28Lifetime;
  const sLtJA = document.getElementById("sLtJapAll");
  if (sLtJA) sLtJA.textContent = ltJapAll.toLocaleString("en-IN");
  const sLtJAF = document.getElementById("sLtJapAllF");
  if (sLtJAF) sLtJAF.textContent = fmtCount(ltJapAll) + " jap";
  // Gaudiya Mode: toggle visibility of stat boxes
  const isGaudiya = App.S.gaudiyaMode || false;
  [
    "sbRadhaCount",
    "sbRadhaTime",
    "sbRVCount",
    "sbRVTime",
    "sb28Count",
    "sb28Time",
    "sbLtJapAll",
    "sbLtTime",
  ].forEach((id) => {
    const el2 = document.getElementById(id);
    if (el2) el2.style.display = isGaudiya ? "none" : "";
  });
  // HK stat boxes: show in gaudiyaMode
  // (handled by CSS .hk-only-stat, but also JS for safety)
  // HK time stats
  const hkTH = App.S.timerHistoryHK || {};
  const isHKMode = App.S.japMode === "hk";
  const liveExtraHK =
    App.timerRunning && isHKMode
      ? Math.max(0, App.timerSeconds - App.timerSavedSeconds)
      : 0;
  const hkTod = (hkTH[App.S.tk] || 0) + liveExtraHK;
  const hkWk = wk.reduce((s, k) => s + (hkTH[k] || 0), 0) + liveExtraHK;
  const hkMo =
    Object.entries(hkTH)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + liveExtraHK;
  const hkLt = Object.values(hkTH).reduce((s, v) => s + v, 0) + liveExtraHK;
  const _setHK = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtShort(v);
  };
  _setHK("tHKTod", hkTod);
  _setHK("tHKWk", hkWk);
  _setHK("tHKMo", hkMo);
  _setHK("tHKLt", hkLt);
  // Option C Lotus Petals — mirror duplicate period IDs
  _setHK("tHKTod2", hkTod);
  _setHK("tHKWk2", hkWk);
  _setHK("tHKMo2", hkMo);
  const _setEl = (id, v) => {
    const e = document.getElementById(id);
    if (e) e.textContent = v;
  };
  const hkTodCount = App.S.historyHK[App.S.tk] || 0;
  const hkWkCount = wk.reduce((s, k) => s + (App.S.historyHK[k] || 0), 0);
  const hkMoCount = Object.entries(App.S.historyHK || {})
    .filter(([k]) => k.startsWith(mp))
    .reduce((s, [, v]) => s + v, 0);
  _setEl("sTod2", hkTodCount.toLocaleString("en-IN"));
  _setEl("sTodM2", Math.floor(hkTodCount / ms) + "m");
  _setEl("sWk2", hkWkCount.toLocaleString("en-IN"));
  _setEl("sWkM2", Math.floor(hkWkCount / ms) + "m");
  _setEl("sMo2", hkMoCount.toLocaleString("en-IN"));
  _setEl("sMoM2", Math.floor(hkMoCount / ms) + "m");

  // Lifetime Jap Time (all jap time + all 28 names time)
  const ltTimeSec =
    Object.values(App.getCombinedTimerHistory()).reduce((a, b) => a + b, 0) +
    Object.values(App.S.timer28History || {}).reduce((a, b) => a + b, 0);
  const ltH = Math.floor(ltTimeSec / 3600),
    ltM = Math.floor((ltTimeSec % 3600) / 60),
    ltS = ltTimeSec % 60;
  document.getElementById("sLtTime").textContent =
    ltH > 0
      ? ltH + "h " + ltM + "m " + String(ltS).padStart(2, "0") + "s"
      : ltM + "m " + String(ltS).padStart(2, "0") + "s";
  document.getElementById("sStr").textContent = streak;
  // ── Per-deity period counts & combined totals (new UI) ──
  const rPTod = (App.S.history || {})[App.S.tk] || 0;
  const rPWk = wk.reduce((s, k) => s + ((App.S.history || {})[k] || 0), 0);
  const rPMo = Object.entries(App.S.history || {})
    .filter(([k]) => k.startsWith(mp))
    .reduce((s, [, v]) => s + v, 0);
  const rvPTod = (App.S.historyRV || {})[App.S.tk] || 0;
  const rvPWk = wk.reduce((s, k) => s + ((App.S.historyRV || {})[k] || 0), 0);
  const rvPMo = Object.entries(App.S.historyRV || {})
    .filter(([k]) => k.startsWith(mp))
    .reduce((s, [, v]) => s + v, 0);
  const n28PTod = (App.S.h28 || {})[App.S.tk] || 0;
  const n28PWk = wk.reduce((s, k) => s + ((App.S.h28 || {})[k] || 0), 0);
  const n28PMo = Object.entries(App.S.h28 || {})
    .filter(([k]) => k.startsWith(mp))
    .reduce((s, [, v]) => s + v, 0);
  const _sn = (id, v) => {
    const e = document.getElementById(id);
    if (e) e.textContent = v.toLocaleString("en-IN");
  };
  const _sm = (id, v, sz) => {
    const e = document.getElementById(id);
    if (e) e.textContent = Math.floor(v / (sz || ms)) + "m";
  };
  const _sc = (id, v) => {
    const e = document.getElementById(id);
    if (e) e.textContent = Math.floor(v / 28) + " cy";
  };
  _sn("sRTod", rPTod);
  _sm("sRTodM", rPTod);
  _sn("sRWk", rPWk);
  _sm("sRWkM", rPWk);
  _sn("sRMo", rPMo);
  _sm("sRMoM", rPMo);
  _sn("sRVPTod", rvPTod);
  _sm("sRVPTodM", rvPTod);
  _sn("sRVPWk", rvPWk);
  _sm("sRVPWkM", rvPWk);
  _sn("sRVPMo", rvPMo);
  _sm("sRVPMoM", rvPMo);
  _sn("s28PTod", n28PTod);
  _sc("s28PTodM", n28PTod);
  _sn("s28PWk", n28PWk);
  _sc("s28PWkM", n28PWk);
  _sn("s28PMo", n28PMo);
  _sc("s28PMoM", n28PMo);
  // Combined Radha+RV lifetime time
  const _eCombLt = document.getElementById("tCombLt");
  if (_eCombLt) {
    const _combLtSec =
      Object.values(App.S.timerHistory || {}).reduce((a, b) => a + b, 0) +
      Object.values(App.S.timerHistoryRV || {}).reduce((a, b) => a + b, 0);
    _eCombLt.textContent = fmtShort(_combLtSec);
  }
  // All combined period counts
  _sn("sAllTod", rPTod + rvPTod + n28PTod);
  _sn("sAllWk", rPWk + rvPWk + n28PWk);
  _sn("sAllMo", rPMo + rvPMo + n28PMo);
  // All combined period times
  const _rTH = App.S.timerHistory || {},
    _rvTH = App.S.timerHistoryRV || {},
    _n28TH = App.S.timer28History || {};
  const _allTodTime =
    (_rTH[App.S.tk] || 0) + (_rvTH[App.S.tk] || 0) + (_n28TH[App.S.tk] || 0);
  const _allWkTime = wk.reduce(
    (s, k) => s + (_rTH[k] || 0) + (_rvTH[k] || 0) + (_n28TH[k] || 0),
    0,
  );
  const _allMoKeys = new Set([
    ...Object.keys(_rTH),
    ...Object.keys(_rvTH),
    ...Object.keys(_n28TH),
  ]);
  const _allMoTime = [..._allMoKeys]
    .filter((k) => k.startsWith(mp))
    .reduce(
      (s, k) => s + (_rTH[k] || 0) + (_rvTH[k] || 0) + (_n28TH[k] || 0),
      0,
    );
  const _allLtTime =
    Object.values(_rTH).reduce((a, b) => a + b, 0) +
    Object.values(_rvTH).reduce((a, b) => a + b, 0) +
    Object.values(_n28TH).reduce((a, b) => a + b, 0);
  const _st = (id, v) => {
    const e = document.getElementById(id);
    if (e) e.textContent = fmtShort(v);
  };
  _st("tAllTod", _allTodTime);
  _st("tAllWk", _allWkTime);
  _st("tAllMo", _allMoTime);
  _st("tAllLt", _allLtTime);

  document.getElementById("sBest").textContent = best;
  const bars = document.getElementById("cbrs");
  bars.innerHTML = "";
  const mx = Math.max(...wk.map((k) => curHist[k] || 0), 1);
  const dn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  wk.forEach((k) => {
    const v = curHist[k] || 0,
      h = Math.max(2, Math.round((v / mx) * 50));
    const c = document.createElement("div");
    c.className = "cbc";
    c.innerHTML =
      '<div class="cbb" style="height:' +
      h +
      'px"></div><div class="cbl">' +
      dn[new Date(k + "T12:00:00").getDay()] +
      "</div>";
    bars.appendChild(c);
  });
  const timeTod =
    (curTimerHist[App.S.tk] || 0) +
    (App.timerRunning ? App.timerSeconds - App.timerSavedSeconds : 0);
  const timeWk =
    wk.reduce((s, k) => s + (curTimerHist[k] || 0), 0) +
    (App.timerRunning ? App.timerSeconds - App.timerSavedSeconds : 0);
  const timeMo =
    Object.entries(curTimerHist)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) +
    (App.timerRunning ? App.timerSeconds - App.timerSavedSeconds : 0);
  function fmtShort(s) {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sc = s % 60;
    return (
      (h > 0 ? h + "h " : "") + (m > 0 || h > 0 ? m + "m " : "") + sc + "s"
    );
  }
  // Legacy hidden combined nodes (kept for any external readers)
  const _tTod = document.getElementById("tTod");
  if (_tTod) _tTod.textContent = fmtShort(timeTod);
  const _tWk = document.getElementById("tWk");
  if (_tWk) _tWk.textContent = fmtShort(timeWk);
  const _tMo = document.getElementById("tMo");
  if (_tMo) _tMo.textContent = fmtShort(timeMo);
  // Split Radha vs RV time per row
  const radhaTH = App.S.timerHistory || {};
  const rvTH = App.S.timerHistoryRV || {};
  const liveExtra = App.timerRunning
    ? Math.max(0, App.timerSeconds - App.timerSavedSeconds)
    : 0;
  const isRVMode = App.S.japMode === "rv";
  const rTod = (radhaTH[App.S.tk] || 0) + (!isRVMode ? liveExtra : 0);
  const rWk =
    wk.reduce((s, k) => s + (radhaTH[k] || 0), 0) + (!isRVMode ? liveExtra : 0);
  const rMo =
    Object.entries(radhaTH)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + (!isRVMode ? liveExtra : 0);
  const vTod = (rvTH[App.S.tk] || 0) + (isRVMode ? liveExtra : 0);
  const vWk =
    wk.reduce((s, k) => s + (rvTH[k] || 0), 0) + (isRVMode ? liveExtra : 0);
  const vMo =
    Object.entries(rvTH)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + (isRVMode ? liveExtra : 0);
  const _set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtShort(v);
  };
  const rLt =
    Object.values(radhaTH).reduce((s, v) => s + v, 0) +
    (!isRVMode ? liveExtra : 0);
  const vLt =
    Object.values(rvTH).reduce((s, v) => s + v, 0) + (isRVMode ? liveExtra : 0);
  _set("tRadhaTod", rTod);
  _set("tRadhaWk", rWk);
  _set("tRadhaMo", rMo);
  _set("tRadhaLt", rLt);
  _set("tRVTod", vTod);
  _set("tRVWk", vWk);
  _set("tRVMo", vMo);
  _set("tRVLt", vLt);
  // 28 Names time — separate from main jap time
  const _28running = !!(App._n28TimerInterval && App._n28TotalStart);
  const _28liveExtra = _28running
    ? Math.max(
        0,
        Math.floor((Date.now() - App._n28TotalStart) / 1000) -
          (App._n28SavedSecs || 0),
      )
    : 0;
  const t28Tod =
    (App.S.timer28History[App.S.tk] || 0) + Math.max(0, _28liveExtra);
  const t28Wk =
    wk.reduce((s, k) => s + (App.S.timer28History[k] || 0), 0) +
    (_28running && wk.includes(App.S.tk) ? Math.max(0, _28liveExtra) : 0);
  const t28Mo =
    Object.entries(App.S.timer28History)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) +
    (_28running && App.S.tk.startsWith(mp) ? Math.max(0, _28liveExtra) : 0);
  const t28Lt =
    Object.values(App.S.timer28History || {}).reduce((s, v) => s + v, 0) +
    (_28running ? Math.max(0, _28liveExtra) : 0);
  const e28Tod = document.getElementById("t28Tod"),
    e28Wk = document.getElementById("t28Wk"),
    e28Mo = document.getElementById("t28Mo"),
    e28Lt = document.getElementById("t28Lt");
  if (e28Tod) e28Tod.textContent = fmt28Short(t28Tod);
  if (e28Wk) e28Wk.textContent = fmt28Short(t28Wk);
  if (e28Mo) e28Mo.textContent = fmt28Short(t28Mo);
  if (e28Lt) e28Lt.textContent = fmt28Short(t28Lt);

  // Live previews for jap entry
  const mji = document.getElementById("manualJapIn");
  const pji = document.getElementById("prevJapIn");
  const aoi = document.getElementById("addJapOtherIn");
  const aod = document.getElementById("addJapOtherDate");
  const dti2 = document.getElementById("deductTodayIn");
  const doi = document.getElementById("deductOtherIn");
  const dod = document.getElementById("deductOtherDate");
  if (mji) {
    const n = parseInt(mji.value) || 0;
    document.getElementById("manualMalaPreview").textContent =
      n > 0 ? Math.floor(n / ms) : "0";
    document.getElementById("manualTodayPreview").textContent =
      n > 0 ? tod + n : "—";
  }
  // ── Mode-aware helpers (Radha / RV / HK) for lifetime previews ──
  const _mode = App.S.gaudiyaMode ? "hk" : App.S.japMode;
  const _modeHist =
    _mode === "rv"
      ? App.S.historyRV || {}
      : _mode === "hk"
        ? App.S.historyHK || {}
        : App.S.history || {};
  const _modeDeduct =
    _mode === "rv"
      ? App.S.nameJapDeductRV || 0
      : _mode === "hk"
        ? App.S.nameJapDeductHK || 0
        : App.S.nameJapDeduct || 0;
  const _modeRawTot = Object.values(_modeHist).reduce((a, b) => a + b, 0);
  const _modeLifetime = Math.max(0, _modeRawTot - _modeDeduct);

  if (pji) {
    const n = parseInt(pji.value) || 0;
    document.getElementById("prevMalaPreview").textContent =
      n > 0 ? Math.floor(n / ms) : "0";
    // addPrevJap() writes n into the current mode's history → mode lifetime grows by n
    document.getElementById("prevLifetimePreview").textContent =
      n > 0 ? (_modeLifetime + n).toLocaleString() : "—";
  }
  if (aoi && aod) {
    const n = parseInt(aoi.value) || 0;
    const d = aod.value;
    const cur = d ? _modeHist[d] || 0 : 0;
    document.getElementById("addJapOtherPreview").textContent =
      n > 0 && d ? cur + n : "—";
  }
  if (dti2) {
    const n = parseInt(dti2.value) || 0;
    document.getElementById("deductTodayPreview").textContent =
      n > 0 ? Math.max(0, tod - n) : "—";
  }
  if (doi && dod) {
    const n = parseInt(doi.value) || 0;
    const d = dod.value;
    const cur = d ? _modeHist[d] || 0 : 0;
    document.getElementById("deductOtherPreview").textContent =
      n > 0 && d ? Math.max(0, cur - n) : "—";
  }
  // Name Jap Deduct / Restore live previews — mode-aware
  const njdi = document.getElementById("nameJapDeductIn");
  const njri = document.getElementById("nameJapRestoreIn");
  const njdCur = document.getElementById("nameJapDeductCur");
  const njdMalas = document.getElementById("nameJapDeductMalas");
  if (njdCur) njdCur.textContent = _modeDeduct.toLocaleString();
  if (njdMalas)
    njdMalas.textContent = Math.floor(_modeDeduct / ms).toLocaleString();
  if (njdi) {
    const n = parseInt(njdi.value) || 0;
    // addNameJapDeduct() increases mode deduct by n → mode lifetime drops by n
    document.getElementById("nameJapDeductPreview").textContent =
      n > 0 ? Math.max(0, _modeLifetime - n).toLocaleString() : "—";
  }
  if (njri) {
    const n = parseInt(njri.value) || 0;
    // removeNameJapDeduct() decreases mode deduct by n (capped at current deduct)
    // → mode lifetime grows by min(n, currentDeduct), never beyond raw total
    const restorable = Math.min(n, _modeDeduct);
    document.getElementById("nameJapRestorePreview").textContent =
      n > 0
        ? Math.min(_modeRawTot, _modeLifetime + restorable).toLocaleString()
        : "—";
  }
  // Jap time previews
  function _fmtSec(s) {
    s = Math.round(s || 0);
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sc = s % 60;
    if (h > 0) return h + "h " + m + "m " + String(sc).padStart(2, "0") + "s";
    if (m > 0) return m + "m " + String(sc).padStart(2, "0") + "s";
    return sc + "s";
  }
  const curTimeTod = App.S.timerHistory[App.S.tk] || 0;
  const jtAtm = document.getElementById("jtAddTodayMin"),
    jtAts = document.getElementById("jtAddTodaySec");
  if (jtAtm) {
    const s =
      (parseInt(jtAtm.value) || 0) * 60 +
      (jtAts ? parseInt(jtAts.value) || 0 : 0);
    document.getElementById("jtAddTodayPreview").textContent =
      s > 0 ? _fmtSec(curTimeTod + s) : "—";
  }
  const jtDtm = document.getElementById("jtDedTodayMin"),
    jtDts = document.getElementById("jtDedTodaySec");
  if (jtDtm) {
    const s =
      (parseInt(jtDtm.value) || 0) * 60 +
      (jtDts ? parseInt(jtDts.value) || 0 : 0);
    document.getElementById("jtDedTodayPreview").textContent =
      s > 0 ? _fmtSec(Math.max(0, curTimeTod - s)) : "—";
  }
  const jtAom = document.getElementById("jtAddOtherMin"),
    jtAos = document.getElementById("jtAddOtherSec"),
    jtAod = document.getElementById("jtAddOtherDate");
  if (jtAom && jtAod && jtAod.value) {
    const curO = App.S.timerHistory[jtAod.value] || 0;
    const s =
      (parseInt(jtAom.value) || 0) * 60 +
      (jtAos ? parseInt(jtAos.value) || 0 : 0);
    document.getElementById("jtAddOtherPreview").textContent =
      s > 0 ? _fmtSec(curO + s) : "—";
  }
  const jtDom = document.getElementById("jtDedOtherMin"),
    jtDos = document.getElementById("jtDedOtherSec"),
    jtDod = document.getElementById("jtDedOtherDate");
  if (jtDom && jtDod && jtDod.value) {
    const curO2 = App.S.timerHistory[jtDod.value] || 0;
    const s =
      (parseInt(jtDom.value) || 0) * 60 +
      (jtDos ? parseInt(jtDos.value) || 0 : 0);
    document.getElementById("jtDedOtherPreview").textContent =
      s > 0 ? _fmtSec(Math.max(0, curO2 - s)) : "—";
  }
  renderMalaLog();
}

function renderMalaLog() {
  const listEl = document.getElementById("malaLogList");
  const countEl = document.getElementById("malaLogCount");
  const inlineEl = document.getElementById("malaLogInline");
  const avgEl = document.getElementById("malaLogAvg");
  const typeEl = document.getElementById("malaLogType");

  // FIX: Always clear the container first to prevent ghost data
  if (listEl) listEl.innerHTML = "";
  if (avgEl) {
    avgEl.style.display = "none";
    avgEl.textContent = "";
  }
  if (countEl) countEl.textContent = "";
  if (inlineEl) inlineEl.textContent = "";

  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";

  // FIX: Reset type label fresh each time — no global carryover
  if (typeEl) {
    if (isRV) typeEl.textContent = "(राधावल्लभ)";
    else if (isHK) typeEl.textContent = "(हरे कृष्ण)";
    else typeEl.textContent = "(राधा)";
  }

  // FIX: Strict filtering — get the correct log for current mode only
  const rawLog = isRV
    ? App.S.malaLogRV || []
    : isHK
      ? App.S.malaLogHK || []
      : App.S.malaLog || [];
  // Filter out entries with 0 or invalid values
  const log = rawLog.filter(
    (sec) => typeof sec === "number" && sec > 0 && isFinite(sec),
  );

  if (countEl)
    countEl.textContent = log.length > 0 ? "(" + log.length + ")" : "";

  if (log.length === 0) {
    listEl.innerHTML =
      '<div style="font-size:11px;color:var(--td);text-align:center;padding:6px 0">No malas completed yet today</div>';
    if (avgEl) avgEl.style.display = "none";
    return;
  }

  // Average per mala
  if (avgEl && log.length > 0) {
    const totalSec = log.reduce((a, b) => a + b, 0);
    const avgSec = Math.round(totalSec / log.length);
    const _ah = Math.floor(avgSec / 3600),
      _am = Math.floor((avgSec % 3600) / 60),
      _as = avgSec % 60;
    const avgStr =
      _ah > 0
        ? _ah + "h " + _am + "m " + String(_as).padStart(2, "0") + "s"
        : _am > 0
          ? _am + "m " + String(_as).padStart(2, "0") + "s"
          : _as + "s";
    avgEl.textContent = "Average per mala: " + avgStr;
    avgEl.style.display = "block";
    avgEl.style.cssText =
      "font-size:11px;color:var(--green);margin-bottom:6px;text-align:center;padding:5px 10px;background:rgba(46,204,113,0.08);border-radius:8px;border:1px solid rgba(46,204,113,0.18);display:block";
    if (inlineEl)
      inlineEl.textContent = "· " + log.length + " malas · avg " + avgStr;
  }

  log.forEach((sec, i) => {
    const _mh = Math.floor(sec / 3600),
      _mm = Math.floor((sec % 3600) / 60),
      _ms2 = sec % 60;
    const durStr =
      _mh > 0
        ? _mh + "h " + _mm + "m " + String(_ms2).padStart(2, "0") + "s"
        : _mm > 0
          ? _mm + "m " + String(_ms2).padStart(2, "0") + "s"
          : _ms2 + "s";
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(46,204,113,0.07);border:1px solid rgba(46,204,113,0.15);border-radius:9px;";
    row.innerHTML =
      '<span style="font-size:11px;color:var(--td)">Mala ' +
      (i + 1) +
      "</span>" +
      '<span style="display:flex;align-items:center;gap:8px">' +
      "<span style=\"font-family:'EB Garamond',serif;font-size:16px;color:var(--green);letter-spacing:0.5px\">" +
      durStr +
      "</span>" +
      '<span onclick="editMalaEntry(' +
      i +
      ')" style="cursor:pointer;font-size:13px;opacity:0.6" title="Edit">✏️</span>' +
      '<span onclick="deleteMalaEntry(' +
      i +
      ')" style="cursor:pointer;font-size:13px;opacity:0.6" title="Delete">🗑️</span>' +
      "</span>";
    listEl.appendChild(row);
  });
}

function editMalaEntry(idx) {
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const log = isRV ? App.S.malaLogRV : isHK ? App.S.malaLogHK : App.S.malaLog;
  if (!log || idx >= log.length) return;
  const cur = log[idx];
  const curM = Math.floor(cur / 60),
    curS = cur % 60;
  const input = prompt(
    "Edit Mala " + (idx + 1) + " time (format: M:SS)",
    curM + ":" + String(curS).padStart(2, "0"),
  );
  if (input === null) return;
  const parts = input.split(":");
  const newSecs = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
  if (newSecs <= 0) {
    toast("Invalid time");
    return;
  }
  log[idx] = newSecs;
  // Sync timerHistory from the updated mala log sum (single source of truth)
  App.syncTimerFromMalaLog();
  App.save();
  App.ua();
  fbDebouncedPush();
  renderMalaLog();
  toast("Mala " + (idx + 1) + " updated ✏️");
}

function deleteMalaEntry(idx) {
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const log = isRV ? App.S.malaLogRV : isHK ? App.S.malaLogHK : App.S.malaLog;
  if (!log || idx >= log.length) return;
  if (!confirm("Delete Mala " + (idx + 1) + " entry?")) return;
  log.splice(idx, 1);
  // Sync timerHistory from updated mala log sum (single source of truth)
  App.syncTimerFromMalaLog();
  App.save();
  App.ua();
  fbDebouncedPush();
  renderMalaLog();
  toast("Mala entry deleted 🗑️");
}

// ── Reset ──
let pr = null;
function cr2(tp) {
  pr = tp;
  const t = document.getElementById("moT"),
    d = document.getElementById("moD");
  if (tp === "28today") {
    t.textContent = "Reset Today's Jap & Time?";
    d.textContent = "This will clear today's " + (App.S.h28[App.S.tk] || 0) + " taps and today's 28 Names timer. Cannot be undone.";
  } else if (tp === "28all") {
    t.textContent = "⚠️ Reset All 28 Names Data & Time?";
    d.textContent = "All 28 Names counts, time, and wish progress will be permanently deleted.";
  } else if (tp === "namesAndTime") {
    t.textContent = "⚠️ Delete all Name Jap & Time data?";
    d.textContent =
      "This permanently deletes all Radha, RV, and HK jap counts, all jap time, all mala logs and history. 28 Names data, Brahmacharya and Milestones data will be kept. This cannot be undone.";
  } else if (tp === "brahmaMilestones") {
    t.textContent = "⚠️ Delete all Brahmacharya & Milestones data?";
    d.textContent =
      "This permanently deletes your Brahmacharya start date, all Brahmacharya records, sankalpas (milestones), and occasions. Jap and time data will be kept. This cannot be undone.";
  } else {
    // legacy fallback
    t.textContent = "⚠️ Reset?";
    d.textContent = "Are you sure?";
  }
  document.getElementById("mo").classList.add("show");
  document.getElementById("moCf").onclick = doReset;
}
// ── Helper: suspend Firestore listener, push clean state, then re-enable ──
async function _fbResetPush() {
  // 1. Stop the live listener so cloud data can't fire back and overwrite our reset
  if (typeof fbListener === "function") {
    fbListener();
    fbListener = null;
  }
  clearTimeout(_fbDeb);
  _fbDeb = null;
  // 2. Push the clean local state to Firebase immediately (overwrite cloud)
  // IMPORTANT: bypass the _cloudHydrated guard — a reset must ALWAYS reach Firebase.
  if (fbUser && !fbForcedSignout) {
    const prevAllowInitialPush = App._allowInitialPush;
    App._allowInitialPush = true; // force push through the hydration guard
    try {
      await fbPushFull();
    } catch (e) {
      console.warn("Reset push failed:", e.message);
    } finally {
      App._allowInitialPush = prevAllowInitialPush;
    }
  }
  // 3. Re-start the listener so future changes sync normally
  if (fbUser && !fbForcedSignout && typeof fbAutoSync === "function") {
    setTimeout(() => fbAutoSync(), 500);
  }
}

function doReset() {
  const tk = App.S.tk;

  // ── STEP 1: Stop Firestore listener immediately so it can't restore old data ──
  if (typeof fbListener === "function") {
    fbListener();
    fbListener = null;
  }
  clearTimeout(_fbDeb);
  _fbDeb = null;
  App._suspendCloudSync = true;
  App._resetInProgress = true;

  if (pr === "28today") {
    // Freeze active wishes before zeroing
    (App.S.sankalpas || [])
      .filter((s) => !s.done && s.startCycles !== null)
      .forEach((s) => {
        s._savedProgress =
          (s._savedProgress || 0) +
          Math.max(0, getTotalCycles28() - s.startCycles);
        s.startCycles = getTotalCycles28();
      });
    App.S.h28[tk] = 0;
    App.S.timer28History[tk] = 0;
    App.lm28 = 0;
    App.stopAll28Timers();
    (App.S.sankalpas || [])
      .filter((s) => !s.done && s.startCycles !== null)
      .forEach((s) => {
        s.startCycles = getTotalCycles28();
      });
    App.dbPut("h28", tk, 0);
    App.dbPut("timer28History", tk, 0);
    u28();
    render28StatsPanel();
    renderSankalpas();
  } else if (pr === "28all") {
    App.S.h28 = {};
    App.S.timer28History = {};
    App.S.h28[tk] = 0;
    App.S.timer28History[tk] = 0;
    App.S.sankalpas = [];
    App.S.syncBaseline28 = {};
    App.lm28 = 0;
    App.stopAll28Timers();
    App.dbClearStore("h28").then(() => App.dbPut("h28", tk, 0));
    App.dbClearStore("timer28History").then(() =>
      App.dbPut("timer28History", tk, 0),
    );
    u28();
    render28StatsPanel();
    renderSankalpas();
  } else if (pr === "namesAndTime") {
    // Delete all Name Jap (Radha + RV + HK) and all Time data
    // NOTE: 28 Names counts/time/sankalpas are intentionally preserved here.
    App.S.history = {};
    App.S.historyRV = {};
    App.S.historyHK = {};
    App.S.dt = 0;
    App.S.lt = 0;
    App.S.dtRV = 0;
    App.S.ltRV = 0;
    App.S.dtHK = 0;
    App.S.nameJapDeduct = 0;
    App.S.nameJapDeductRV = 0;
    App.S.nameJapDeductHK = 0;
    App.S.timerHistory = {};
    App.S.timerHistoryRV = {};
    App.S.timerHistoryHK = {};
    App.S.malaLog = [];
    App.S.malaLogRV = [];
    App.S.malaLogHK = [];
    App.S.activityLog = [];
    App.S.syncBaseline = {};
    App.S.syncBaselineTimer = {};
    App.S.syncBaselineRV = {};
    App.S.syncBaselineTimerRV = {};
    App.S.syncBaselineHK = {};
    App.S.syncBaselineTimerHK = {};
    App.lmc = 0;
    App.lmcRV = 0;
    App.lmcHK = 0;
    App.dbClearStore("history");
    App.dbClearStore("historyRV").catch(() => {});
    App.dbClearStore("historyHK").catch(() => {});
    App.dbClearStore("timerHistory");
    App.dbClearStore("timerHistoryRV");
    App.dbClearStore("timerHistoryHK").catch(() => {});
    App.dbClearStore("activityLogArchive");
    App.dbClearStore("malaLog");
    App.resetTimer();
    ["dtIn", "ltIn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderMalaLog();
    u28();
    render28StatsPanel();
    renderSankalpas();
  } else if (pr === "brahmaMilestones") {
    // Delete all Brahmacharya + Milestones (sankalpas) + occasions
    App.S.brahma = {};
    App.S.brahmacharya_start_date = "";
    App.S.sankalpas = [];
    App.S.occasions = {};
    App.S.milestones = { reached: {}, lastChecked: 0 };
    try { localStorage.removeItem("rjap_milestones"); } catch (_) {}
    const msEl = document.getElementById("msIn");
    if (msEl) msEl.value = "";
    initBrahmaStartInput();
    renderSankalpas();
  }

  // ── STEP 2: Save clean state locally ──
  App._suspendCloudSync = false;
  App.save();
  App.ua();
  renderCal();
  cm();
  toast("Resetting… pushing to cloud ☁️");

  // ── STEP 3: Push clean state to Firebase (overwrites old cloud data) ──
  // Then restart listener so future changes sync normally
  _fbResetPush().then(() => {
    App._resetInProgress = false;
    toast("Reset complete 🙏");
  });
}
function cm() {
  document.getElementById("mo").classList.remove("show");
}

// ── Backup / Restore ──
function exportAllData() {
  const backup = {
    _version: 3,
    _exported: new Date().toISOString(),
    history: App.S.history || {},
    h28: App.S.h28 || {},
    timerHistory: App.S.timerHistory || {},
    timer28History: App.S.timer28History || {},
    stotrams: App.S.stotrams || {},
    brahma: App.S.brahma || {},
    customSt: App.S.customSt || [],
    sankalpas: App.S.sankalpas || [],
    occasions: App.S.occasions || {},
    ms: App.S.ms || 108,
    dt: App.S.dt || 0,
    lt: App.S.lt || 0,
    nameJapDeduct: App.S.nameJapDeduct || 0,
    cfg: App.S.cfg || {},
    malaLog: App.S.malaLog || [],
    malaLogDate: App.S.tk,
    brahmacharya_start_date: App.S.brahmacharya_start_date || "",
    japMode: App.S.japMode || "radha",
    historyRV: App.S.historyRV || {},
    timerHistoryRV: App.S.timerHistoryRV || {},
    dtRV: App.S.dtRV || 0,
    ltRV: App.S.ltRV || 0,
    nameJapDeductRV: App.S.nameJapDeductRV || 0,
    malaLogRV: App.S.malaLogRV || [],
    historyHK: App.S.historyHK || {},
    timerHistoryHK: App.S.timerHistoryHK || {},
    dtHK: App.S.dtHK || 0,
    nameJapDeductHK: App.S.nameJapDeductHK || 0,
    malaLogHK: App.S.malaLogHK || [],
    gaudiyaMode: App.S.gaudiyaMode || false,
  };
  try {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename =
      "radha-naam-jap-backup-" + App.getTk() + ".json";
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
    // iOS Safari fallback — if download attribute is ignored, open in a new tab
    setTimeout(() => {
      if (
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !window.MSStream
      ) {
        try { window.open(url, "_blank"); } catch (_) {}
      }
    }, 50);
    toast("Backup downloaded! 🙏 Jai Radhe!");
  } catch (e) {
    console.error("exportAllData failed:", e);
    toast("❌ Backup failed: " + (e && e.message ? e.message : e));
  }
}

function importAllData(input) {
  const file = input.files[0];
  if (!file) return;
  const st = document.getElementById("restoreStatus");
  if (st) st.textContent = "Reading file…";
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.history) App.S.history = { ...App.S.history, ...data.history };
      if (data.h28) App.S.h28 = { ...App.S.h28, ...data.h28 };
      if (data.timerHistory)
        App.S.timerHistory = { ...App.S.timerHistory, ...data.timerHistory };
      if (data.timer28History)
        App.S.timer28History = {
          ...App.S.timer28History,
          ...data.timer28History,
        };
      if (data.stotrams)
        App.S.stotrams = { ...App.S.stotrams, ...data.stotrams };
      if (data.brahma) App.S.brahma = { ...App.S.brahma, ...data.brahma };
      if (data.customSt) App.S.customSt = data.customSt;
      if (data.sankalpas) App.S.sankalpas = data.sankalpas;
      if (data.occasions)
        App.S.occasions = { ...App.S.occasions, ...data.occasions };
      if (data.ms) App.S.ms = data.ms;
      if (data.dt !== undefined) App.S.dt = data.dt;
      if (data.lt !== undefined) App.S.lt = data.lt;
      if (data.nameJapDeduct !== undefined)
        App.S.nameJapDeduct = data.nameJapDeduct;
      if (data.cfg) App.S.cfg = { ...App.S.cfg, ...data.cfg };
      if (data.historyRV)
        App.S.historyRV = { ...App.S.historyRV, ...data.historyRV };
      if (data.timerHistoryRV)
        App.S.timerHistoryRV = {
          ...App.S.timerHistoryRV,
          ...data.timerHistoryRV,
        };
      if (data.japMode) App.S.japMode = data.japMode;
      if (data.dtRV !== undefined) App.S.dtRV = data.dtRV;
      if (data.ltRV !== undefined) App.S.ltRV = data.ltRV;
      if (data.nameJapDeductRV !== undefined)
        App.S.nameJapDeductRV = data.nameJapDeductRV;
      if (data.malaLogRV) App.S.malaLogRV = data.malaLogRV;
      if (data.historyHK)
        App.S.historyHK = { ...App.S.historyHK, ...data.historyHK };
      if (data.timerHistoryHK)
        App.S.timerHistoryHK = {
          ...App.S.timerHistoryHK,
          ...data.timerHistoryHK,
        };
      if (data.dtHK !== undefined) App.S.dtHK = data.dtHK;
      if (data.nameJapDeductHK !== undefined)
        App.S.nameJapDeductHK = data.nameJapDeductHK;
      if (data.malaLogHK) App.S.malaLogHK = data.malaLogHK;
      if (data.gaudiyaMode !== undefined) App.S.gaudiyaMode = data.gaudiyaMode;
      App.S.syncBaseline = JSON.parse(JSON.stringify(App.S.history));
      App.S.syncBaseline28 = JSON.parse(JSON.stringify(App.S.h28));
      App.S.syncBaselineTimer = JSON.parse(JSON.stringify(App.S.timerHistory));
      App.S.syncBaselineTimer28 = JSON.parse(
        JSON.stringify(App.S.timer28History),
      );
      App.save();
      switchJapMode(App.S.japMode || "radha");
      renderSt();
      u28();
      renderBcal();
      renderCal();
      uStats();
      renderSankalpas();
      renderMalaLog();
      App.lmc = Math.floor((App.S.history[App.S.tk] || 0) / (App.S.ms || 108));
      App.lm28 = Math.floor((App.S.h28[App.S.tk] || 0) / (App.S.ms || 108));
      App.lmcHK = Math.floor(
        ((App.S.historyHK || {})[App.S.tk] || 0) / (App.S.ms || 108),
      );
      // Re-apply gaudiyaMode body class after import
      App.S.gaudiyaMode
        ? document.body.classList.add("gaudiya-mode")
        : document.body.classList.remove("gaudiya-mode");
      if (st) {
        st.textContent = "✅ Data restored successfully! 🙏 Jai Radhe!";
        st.style.color = "var(--green)";
      }
      toast("All data restored! 🙏 Jai Radhe!");
      input.value = "";
    } catch (err) {
      if (st) {
        st.textContent = "❌ Could not read file: " + err.message;
        st.style.color = "var(--red)";
      }
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════
// DIVINE CELEBRATION — Morpankh & Golden Particles
// ═══════════════════════════════════════════════
function spawnDivineCelebration() {
  const tz = document.getElementById("tz");
  if (!tz) return;
  const rect = tz.getBoundingClientRect();
  const feathers = ["🪶", "✨", "🦚", "💫", "⭐"];

  // Spawn 25 particles
  for (let i = 0; i < 25; i++) {
    const el = document.createElement("div");
    const isFeather = i < 10;
    el.className = "divine-particle " + (isFeather ? "feather" : "golden");
    const angle = (Math.PI * 2 * i) / 25;
    const dist = 60 + Math.random() * 100;
    el.style.setProperty("--dx", Math.cos(angle) * dist + "px");
    el.style.setProperty("--dy", Math.sin(angle) * dist + "px");
    el.style.left = "50%";
    el.style.top = "50%";
    el.style.animationDelay = Math.random() * 0.5 + "s";
    if (isFeather) el.textContent = feathers[i % feathers.length];
    tz.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // Sacred vibration pattern for milestone (only if vibration enabled)
  if ((window.App && window.App.S && window.App.S.cfg && window.App.S.cfg.vib) && navigator.vibrate) {
    try {
      navigator.vibrate([100, 50, 100, 50, 200, 100, 300]);
    } catch (e) {}
  }
}

// ═══════════════════════════════════════════════
// VELOCITY TRACKER
// ═══════════════════════════════════════════════
function renderVelocityTracker() {
  /* removed */
}
// ═══════════════════════════════════════════════
// RENDER MILESTONES TAB
// ═══════════════════════════════════════════════
function renderMilestonesTab() {
  const el = document.getElementById("msContent");
  if (!el) return;
  const _isG = App.S.gaudiyaMode || false;
  const hist = App.S.history || {};
  const histRV = App.S.historyRV || {};
  const histHK = App.S.historyHK || {};
  const rawTot = _isG
    ? Object.values(histHK).reduce((a, b) => a + b, 0)
    : Object.values(hist).reduce((a, b) => a + b, 0) +
      Object.values(histRV).reduce((a, b) => a + b, 0);
  const deduct = _isG ? App.S.nameJapDeductHK || 0 : App.S.nameJapDeduct || 0;
  const total = Math.max(0, rawTot - deduct);
  const lang = window._msLang || "hi";

  // Calculate 7-day average
  const today = new Date();
  let sum7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = _ldk(d);
    sum7 += _isG ? histHK[k] || 0 : (hist[k] || 0) + (histRV[k] || 0);
  }
  const avg7 = sum7 / 7;

  // Sadhana start date — read from App.S (persistent) with localStorage fallback
  const saved =
    App.S.sadhanaStart || localStorage.getItem("rjap_sadhana_start") || "";
  if (saved) {
    App.S.sadhanaStart = saved;
    localStorage.setItem("rjap_sadhana_start", saved);
  }
  const startInput = document.getElementById("msSadhanaStart");
  if (startInput && saved) startInput.value = saved;
  const msDisp = document.getElementById("msSadhanaStartDisp");
  if (msDisp) msDisp.textContent = _fmtDateFriendly(saved);
  const sinceEl = document.getElementById("msSadhanaSince");
  if (sinceEl && saved) {
    const startLocal = _gpsParseDate(saved);
    const todayLocal = _gpsLocalToday();
    const days = Math.round((todayLocal - startLocal) / 86400000) + 1; // +1: start day = Day 1
    const yrs = Math.floor(days / 365),
      rem = days % 365,
      mos = Math.floor(rem / 30);
    let s = "🙏 ";
    if (yrs > 0) s += yrs + " year" + (yrs > 1 ? "s" : "") + " ";
    if (mos > 0) s += mos + " month" + (mos > 1 ? "s" : "") + " ";
    s += (rem % 30) + " days of Sadhana";
    sinceEl.textContent = s;
  } else if (sinceEl) {
    sinceEl.textContent = "Set your journey start date above ☝️";
  }

  // Build lakh milestones (1L to 130L)
  const lakhMs = [];
  const keyLakhs = [1, 2, 3, 5, 10, 20, 50];
  for (let l = 1; l <= 130; l++) {
    const count = l * 100000;
    const isKey = keyLakhs.includes(l);
    const isMillion = l >= 10;
    let tier = "bronze";
    if (l >= 10) tier = "gold";
    else if (l >= 1 && l < 10)
      tier = l <= 1 ? "bronze" : l <= 5 ? "silver" : "silver";
    if (l <= 1) tier = "bronze";
    else if (l <= 5) tier = "silver";
    else tier = "gold";
    lakhMs.push({ count, label: l + " Lakh", tier, isKey, isMillion: l >= 10 });
  }

  // Predict date
  function predictDate(remaining) {
    if (avg7 <= 0) return null;
    const daysNeeded = Math.ceil(remaining / avg7);
    const d = new Date();
    d.setDate(d.getDate() + daysNeeded);
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return d.getDate() + " " + months[d.getMonth()] + ", " + d.getFullYear();
  }

  let out = "";

  // ─── LAKH MILESTONES ───
  out += '<div class="ms-phase-title">📿 Lakh Milestones</div>';
  out += '<div class="ms-phase-sub">10K → 1 CRORE JOURNEY</div>';

  // Key lakhs as full cards
  const keyLakhData = lakhMs.filter((m) => m.isKey || m.isMillion);
  keyLakhData.forEach((m) => {
    if (m.count >= CRORE) return; // skip crore+, handled below
    const pct = Math.min(100, (total / m.count) * 100);
    const achieved = total >= m.count;
    const remaining = Math.max(0, m.count - total);
    const pred = !achieved ? predictDate(remaining) : null;
    const tierClass = m.tier;
    const millionClass = m.isMillion ? " million" : "";
    out +=
      '<div class="ms-card tier-' +
      tierClass +
      (achieved ? " achieved" : " locked") +
      millionClass +
      "\" onclick=\"openMsDetail('lakh'," +
      m.count +
      "," +
      pct.toFixed(1) +
      "," +
      achieved +
      ')">';
    out += '<div class="ms-card-header">';
    out += '<span class="ms-icon">' + (achieved ? "👑" : "📿") + "</span>";
    out += '<div><div class="ms-label">' + m.label + "</div></div>";
    out += '<span class="ms-count-label">' + formatMsCount(m.count) + "</span>";
    out += "</div>";
    if (achieved) {
      out += '<div class="ms-badge achieved">✓ ACHIEVED</div>';
    } else if (pred) {
      out +=
        '<div class="ms-badge prediction">⏳ Estimated: ' + pred + "</div>";
    } else if (!achieved) {
      out +=
        '<div class="ms-badge locked">🙏 Keep chanting to see prediction</div>';
    }
    out +=
      '<div class="ms-pct">' +
      pct.toFixed(1) +
      "% — " +
      formatMsCount(total) +
      " / " +
      formatMsCount(m.count) +
      "</div>";
    out +=
      '<div class="ms-progress-wrap"><div class="ms-progress-fill ' +
      tierClass +
      '" style="width:' +
      pct +
      '%"></div></div>';
    out += "</div>";
  });

  // Grid for remaining lakhs
  const otherLakhs = lakhMs.filter(
    (m) => !m.isKey && !m.isMillion && m.count < CRORE,
  );
  if (otherLakhs.length) {
    out += '<div class="ms-lakh-grid">';
    otherLakhs.forEach((m) => {
      const pct = Math.min(100, (total / m.count) * 100);
      const achieved = total >= m.count;
      out +=
        '<div class="ms-lakh-card' +
        (achieved ? " achieved" : "") +
        "\" onclick=\"openMsDetail('lakh'," +
        m.count +
        "," +
        pct.toFixed(1) +
        "," +
        achieved +
        ')">';
      out +=
        '<div class="ms-lakh-label">' +
        (achieved ? "✓ " : "") +
        m.label +
        "</div>";
      out += '<div class="ms-lakh-pct">' + pct.toFixed(1) + "%</div>";
      out +=
        '<div class="ms-progress-wrap"><div class="ms-progress-fill ' +
        (achieved ? "gold" : "bronze") +
        '" style="width:' +
        pct +
        '%"></div></div>';
      out += "</div>";
    });
    out += "</div>";
  }

  out += '<div class="ms-section-sep"></div>';

  // ─── SPIRITUAL CRORE MILESTONES ───
  PHASES.forEach((phase) => {
    out += '<div class="ms-phase-title">' + phase.name + "</div>";
    out += '<div class="ms-phase-sub">' + phase.sub + "</div>";
    SPIRITUAL_MILESTONES.filter((sm) => {
      const crNum = sm.count / CRORE;
      return crNum >= phase.range[0] && crNum <= phase.range[1];
    }).forEach((sm) => {
      const pct = Math.min(100, (total / sm.count) * 100);
      const achieved = total >= sm.count;
      const remaining = Math.max(0, sm.count - total);
      const pred = !achieved ? predictDate(remaining) : null;
      const crNum = sm.count / CRORE;
      const isBig = crNum >= 10;
      const descHi = CRORE_DESCS_HI[crNum] || sm.desc;
      const descBn = CRORE_DESCS_BN[crNum] || "";
      const desc = lang === "bn" && descBn ? descBn : descHi;
      out +=
        '<div class="ms-card tier-saffron' +
        (achieved ? " achieved" : " locked") +
        (isBig ? " million" : "") +
        "\" onclick=\"openMsDetail('crore'," +
        sm.count +
        "," +
        pct.toFixed(1) +
        "," +
        achieved +
        ')">';
      out += '<div class="ms-card-header">';
      out += '<span class="ms-icon">' + sm.icon + "</span>";
      out += '<div><div class="ms-label">' + crNum + " Crore</div>";
      out += '<div class="ms-eng">' + sm.eng + "</div></div>";
      out += '<span class="ms-count-label">' + sm.tag + "</span>";
      out += "</div>";
      const descId = "msDesc" + sm.count;
      out +=
        '<div class="ms-desc' +
        (lang === "bn" ? " bangla" : "") +
        '" id="' +
        descId +
        '">' +
        desc +
        "</div>";
      out +=
        '<span class="ms-read-more" onclick="event.stopPropagation();toggleMsDesc(\'' +
        descId +
        "',this)\">Read more ▾</span>";
      if (achieved) {
        out += '<div class="ms-badge achieved">✓ ACHIEVED</div>';
      } else if (pred) {
        out +=
          '<div class="ms-badge prediction">⏳ Estimated: ' + pred + "</div>";
      } else {
        out +=
          '<div class="ms-badge locked">🙏 Keep chanting to see prediction</div>';
      }
      out +=
        '<div class="ms-pct">' +
        pct.toFixed(1) +
        "% — " +
        formatMsCount(total) +
        " / " +
        formatMsCount(sm.count) +
        "</div>";
      out +=
        '<div class="ms-progress-wrap"><div class="ms-progress-fill saffron" style="width:' +
        pct +
        '%"></div></div>';
      out += "</div>";
    });
  });

  el.innerHTML = out;
}

// ─── CRORE DESCRIPTIONS ───
const CRORE_DESCS_HI = {
  1: "Tanu Shuddhi: Sharir puri tarah nishpaap aur pavitra ho jata hai. Rajogun aur Tamogun ka nash hota hai, aur har samay Shuddh Satogun bana rehta hai. Har samay Bhagwan ka bhajan hota he. Bimariyon ke 'paap beej' (root causes) khatam ho jate hain. Agar koi rog hai bhi, toh use sehne ki taqat mil jati hai. Sapne mein devta, rishi-muni aur sant, bhakta aakar baatein karte hain.",
  2: "Dhan (Wealth): Dhan ka abhaav (lack of money) khatam ho jata hai. Sabse badi baat ye hai ki insan ke andar se ameer banne ki chah (desire) hi mit jati hai. Bhagwan do tarah se madad karte hain—ya toh desire hata dete hain, ya fir bina maange itna dhan dete hain ki chah khatam ho jaye. Jaise nadiyaan apne aap samundar mein milti hain, saara vaibhav sadhak ko gher leta hai. Return to home from abroad.",
  3: "Mental Purity: Antahkaran param pavitra hota hai. Jo buri aadatein (kaam, krodh) pehle 'asadhy' (impossible) lagti thi, wo aasaan ho jati hain. Pura sansaar sadhak ko sage bhai ki tarah pyar karne lagta hai.",
  4: "Sukha Sthan: Hriday mein Bhagvadanand (Divine Bliss) prakat hota hai. Stability: Maan-apmaan ya dukh-sukh ka hriday par koi asar nahi padta. Self-Realization: Bina shastra padhe hi 'Nityatva Bodh' ho jata hai ki 'Main nitya hoon, ye sharir anitya hai'.",
  5: "Divine Knowledge: Vidya ka prakaash hota hai. Sadhak ki vaani se shastra nikalne lagte hain. Material Success: Agar koi worldly cheez chahiye (putra, lambi aayu, ya dushman par vijay), toh wo turant mil jati hai.",
  6: "Victory over Enemies: Kaam, krodh, lobh, moh, mad, aur matsarya par puri vijay. Healing: 'Dushadhya' (incurable) rog bhi sankalp se samool vinash ho jate hain.",
  7: "Purity from Lust: Duniya ki koi bhi apsara ya kaamini use mohit nahi kar sakti. Direct Interaction: Narad Ji aur Sanakadi jaise mahabhagwat prakat mein milkar baatein karte hain.",
  8: "No Fear of Death: Mritiyu ka bhay khatam. Sadhak hamesha 'Atma-Singhasan' par viraajman rehta hai.",
  9: "Sagun Sakshatkar: Jiska naam japa (Ram, Radha, Shiv), unka sakhshat darshan hota hai. Satyavakta: Sadhak jo bolega wahi hoga. Uska kalyan ho jayega.",
  10: "Karma Burn: Saare sanchit aur prarabdha karma bhasm ho jate hain. No Rebirth: Ab dubara janm nahi lena padega. Hriday mein itna anand hota hai ki uska varnan nahi ho sakta.",
  11: "11 Crore: Gyan, bhakti aur yog ki saari bhumikaayein aur siddhiyaan haazir ho jati hain. Gokul, Ayodhya, Kashi ki leelaon mein pravesh milta hai.",
  12: "12 Crore: Bhagwan bhakt ke adheen ho jate hain aur uske piche-piche dolte hain.",
  13: "13 Crore: Sadhak kisi bhi paapi insan ko 'Moksha' dila sakta hai.",
};

const CRORE_DESCS_BN = {
  1: "তনু শুদ্ধি: শরীর পুরোপুরি নিষ্পাপ ও পবিত্র হয়ে যায়। রজোগুণ ও তমোগুণ নাশ হয় এবং সর্বদা শুদ্ধ সত্যগুণ বজায় থাকে। সব সময় ভগবানের ভজন হতে থাকে। রোগের 'পাপ বীজ' (মূল কারণ) খতম হয়ে যায়। যদি কোনো রোগ থাকেও, তবে তা সহ্য করার শক্তি পাওয়া যায়। স্বপ.S�নে দেবতা, ঋষি-মুনি এবং সন্ত-ভক্তরা এসে কথা বলেন।",
  2: "ধন (সম্পদ): ধনের অভাব খতম হয়ে যায়। সবচেয়ে বড় কথা হলো মানুষের ভিতর থেকে ধনী হওয়ার তৃষ্ণা (ইচ্ছা) মিটে যায়। ভগবান দুইভাবে সাহায্য করেন—হয় ইচ্ছা সরিয়ে দেন, না হয় না চাইতেই এত ধন দেন যে ইচ্ছা শেষ হয়ে যায়। যেমন নদী নিজে থেকেই সমুদ্রে গিয়ে মেশে, তেমনই সমস্ত বৈভব সাধককে ঘিরে ধরে। বিদেশ থেকে স্বদেশে প্রত্যাবর্তন।",
  3: "মানসিক পবিত্রতা: অন্তঃকরণ পরম পবিত্র হয়। যে খারাপ অভ্যাসগুলো (কাম, ক্রোধ) আগে 'অসাধ্য' (অসম্ভব) মনে হতো, তা সহজ হয়ে যায়। সারা পৃথিবী সাধককে নিজের আপন ভাইয়ের মতো ভালোবাসতে শুরু করে।",
  4: "সুখ স্থান: হৃদয়ে ভগবদানন্দ (দিব্য আনন্দ) প্রকট হয়। স্থায়িত্ব: মান-অপমান বা সুখ-দুঃখের হৃদয়ের ওপর কোনো প্রভাব পড়ে না। আত্ম-উপলব্ধি: শাস্ত্র না পড়েই 'নিত্যত্ব বোধ' হয়ে যায় যে 'আমি নিত্য, এই শরীর অনিত্য'।",
  5: "দিব্য জ্ঞান: বিদ্যার প্রকাশ ঘটে। সাধকের বাণী থেকে শাস্ত্র নির্গত হতে থাকে। জাগতিক সাফল্য: যদি কোনো পার্থিব বস্তু (পুত্র, দীর্ঘ আয়ু, বা শত্রুর ওপর বিজয়) প্রয়োজন হয়, তবে তা তৎক্ষণাৎ মিলে যায়।",
  6: "শত্রুর ওপর বিজয়: কাম, ক্রোধ, লোভ, মোহ, মদ এবং মাৎসর্যের ওপর পূর্ণ বিজয়। নিরাময়: 'দুসাধ্য' (অসাধ্য) রোগও সংকল্পের মাধ্যমে সমূলে বিনাশ হয়ে যায়।",
  7: "কামনাবাসনা থেকে মুক্তি: দুনিয়ার কোনো অপ্সরা বা কামিনী তাকে মোহিত করতে পারে না। সরাসরি আলাপচারিতা: নারদ জী এবং সনকাদির মতো মহাভাগবতরা সশরীরে এসে কথা বলেন।",
  8: "মৃত্যুর ভয় নেই: মৃত্যুর ভয় শেষ হয়ে যায়। সাধক সর্বদা 'আত্ম-সিংহাসনে' বিরাজমান থাকেন।",
  9: "সগুণ সাক্ষাৎকার: যাঁর নাম জপ করা হয় (রাম, রাধা, শিব), তাঁর সাক্ষাৎ দর্শন মেলে। সত্যবক্তা: সাধক যা বলবেন তাই হবে। তার কল্যাণ হয়ে যাবে।",
  10: "কর্ম দহন: সমস্ত সঞ্চিত এবং প্রারব্ধ কর্ম ভস্ম হয়ে যায়। পুনর্জন্ম রোধ: আর দ্বিতীয়বার জন্ম নিতে হবে না। হৃদয়ে এত আনন্দ হয় যে তার বর্ণনা করা সম্ভব নয়।",
  11: "১১ কোটি: জ্ঞান, ভক্তি ও যোগের সমস্ত ভূমিকা ও সিদ্ধি উপস্থিত হয়। গোকুল, অযোধ্যা, কাশীর লীলায় প্রবেশাধিকার মেলে।",
  12: "১২ কোটি: ভগবান ভক্তের অধীন হয়ে যান এবং তার পিছু পিছু ঘোরেন।",
  13: "১৩ কোটি: সাধক যেকোনো পাপী মানুষকেও 'মোক্ষ' পাইয়ে দিতে পারেন।",
};

window._msLang = "hi";
function setMsLang(lang) {
  window._msLang = lang;
  document.getElementById("msLangHi").classList.toggle("active", lang === "hi");
  document.getElementById("msLangBn").classList.toggle("active", lang === "bn");
  renderMilestonesTab();
  // Auto-sync Mahamantra language toggle when Bengali is selected
  if (lang === "bn" && App && App.S && App.S.hkLang !== "bn") {
    App.S.hkLang = "bn";
    const tgH = document.getElementById("tgHkLang");
    if (tgH) tgH.classList.add("on");
    const lblH = document.getElementById("hkLangLabel");
    if (lblH) lblH.textContent = "Bangla";
    const hkEl = document.getElementById("hkPersist");
    if (hkEl && hkEl.classList.contains("hk-visible")) {
      hkEl.innerHTML = HK_TEXT_BN.split("\n")
        .map((l) => "<div>" + l + "</div>")
        .join("");
    }
    if (App.S.japMode === "hk") switchJapMode("hk");
    App.save();
  } else if (lang === "hi" && App && App.S && App.S.hkLang !== "hi") {
    App.S.hkLang = "hi";
    const tgH = document.getElementById("tgHkLang");
    if (tgH) tgH.classList.remove("on");
    const lblH = document.getElementById("hkLangLabel");
    if (lblH) lblH.textContent = "Hindi";
    const hkEl = document.getElementById("hkPersist");
    if (hkEl && hkEl.classList.contains("hk-visible")) {
      hkEl.innerHTML = HK_TEXT.split("\n")
        .map((l) => "<div>" + l + "</div>")
        .join("");
    }
    if (App.S.japMode === "hk") switchJapMode("hk");
    App.save();
  }
}

function toggleMsDesc(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("expanded");
  btn.textContent = el.classList.contains("expanded")
    ? "Show less ▴"
    : "Read more ▾";
}

function openMsDetail(type, count, pct, achieved) {
  const sheet = document.getElementById("msDetailSheet");
  const overlay = document.getElementById("msDetailOverlay");
  if (!sheet || !overlay) return;
  const lang = window._msLang || "hi";
  const hist = App.S.history || {};
  const histRV = App.S.historyRV || {};
  const rawTot =
    Object.values(hist).reduce((a, b) => a + b, 0) +
    Object.values(histRV).reduce((a, b) => a + b, 0);
  const total = Math.max(0, rawTot - (App.S.nameJapDeduct || 0));

  let icon = "📿",
    title = "",
    eng = "",
    desc = "",
    descBn = "";
  if (type === "crore") {
    const sm = SPIRITUAL_MILESTONES.find((s) => s.count === count);
    if (sm) {
      icon = sm.icon;
      title = count / CRORE + " Crore — " + sm.label;
      eng = sm.eng;
      desc = CRORE_DESCS_HI[count / CRORE] || sm.desc;
      descBn = CRORE_DESCS_BN[count / CRORE] || "";
    }
  } else {
    const l = count / 100000;
    icon = achieved ? "👑" : "📿";
    title = l + " Lakh Jap";
    eng = formatMsCount(count) + " completed";
    desc = "";
  }

  // Total days calculation
  const startDate = localStorage.getItem("rjap_sadhana_start");
  let totalDays = "—";
  if (startDate) {
    const startLocal = _gpsParseDate(startDate);
    const todayLocal = _gpsLocalToday();
    const d = Math.round((todayLocal - startLocal) / 86400000) + 1; // +1: start = Day 1
    totalDays = d + " day" + (d !== 1 ? "s" : "");
  }

  // Peak day
  const allHist = { ...hist };
  Object.keys(histRV).forEach((k) => {
    allHist[k] = (allHist[k] || 0) + (histRV[k] || 0);
  });
  const _pdMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  let peakDay = "—",
    peakVal = 0;
  Object.entries(allHist).forEach(([k, v]) => {
    if (v > peakVal) {
      peakVal = v;
      peakDay = k;
    }
  });
  if (peakVal > 0) {
    const _pd = new Date(peakDay + "T00:00:00");
    peakDay =
      _pd.getDate() + " " + _pdMonths[_pd.getMonth()] + ", " + _pd.getFullYear() +
      " (" + peakVal.toLocaleString("en-IN") + " jap)";
  }

  const displayDesc = lang === "bn" && descBn ? descBn : desc;

  let h =
    '<button class="ms-detail-close" onclick="closeMsDetail()">✕ Close</button>';
  h += '<div class="ms-detail-icon">' + icon + "</div>";
  h += '<div class="ms-detail-title">' + title + "</div>";
  h += '<div class="ms-detail-eng">' + eng + "</div>";
  if (achieved) {
    h += '<div class="ms-detail-stamp">✦ ACHIEVED ✦</div>';
  } else {
    h +=
      '<div class="ms-detail-stamp" style="color:var(--td);font-size:14px">' +
      pct +
      "% complete</div>";
  }
  h += '<div class="ms-detail-stats">';
  h +=
    '<div class="ms-detail-stat"><div class="val">' +
    totalDays +
    '</div><div class="lbl">Journey Duration</div></div>';
  h +=
    '<div class="ms-detail-stat"><div class="val">' +
    peakDay.split(" (")[0] +
    '</div><div class="lbl">Peak Day</div></div>';
  h +=
    '<div class="ms-detail-stat"><div class="val">' +
    formatMsCount(total) +
    '</div><div class="lbl">Total Jap</div></div>';
  h +=
    '<div class="ms-detail-stat"><div class="val">' +
    pct +
    '%</div><div class="lbl">Progress</div></div>';
  h += "</div>";
  if (displayDesc) {
    h +=
      '<div class="ms-detail-desc' +
      (lang === "bn" ? " bangla" : "") +
      '">' +
      displayDesc +
      "</div>";
  }
  sheet.innerHTML = h;
  overlay.classList.add("show");

  // Fire confetti for achieved milestones
  if (achieved && typeof confetti === "function") {
    confetti({
      particleCount: 80,
      spread: 70,
      colors: ["#FFD700", "#FF9933", "#FFA500"],
      origin: { y: 0.7 },
    });
  }
}

function closeMsDetail() {
  document.getElementById("msDetailOverlay").classList.remove("show");
}

function renderLakhGati2() {
  renderMilestonesTab();
}

// ═══════════════════════════════════════════════════════
// FIREBASE — Google Sign-In Only (no email/password)
// ═══════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyCvvXEdsJjXpTbITE2HuyYFnPZfZIkxVWA",
  authDomain: "guru-kripahi-kevalam-108.firebaseapp.com",
  projectId: "guru-kripahi-kevalam-108",
  storageBucket: "guru-kripahi-kevalam-108.firebasestorage.app",
  messagingSenderId: "368485403238",
  appId: "1:368485403238:web:a3ab5c1427ad0c40fffba7",
  measurementId: "G-SJP0N1FDZD",
};
// NOTE: Make sure drakthephenomenal.github.io is added as an Authorized Domain
// in Firebase Console → Authentication → Settings → Authorized domains

let fbApp = null,
  fbAuth = null,
  fbDb = null,
  fbUser = null;
let fbListener = null;
let fbDeviceId = (function () {
  let id = localStorage.getItem("rjap_device_id");
  if (!id) {
    id =
      "dev_" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36);
    localStorage.setItem("rjap_device_id", id);
  }
  return id;
})();

let fbSessionListener = null;

// ── Single-device session enforcement ──
async function fbClaimSession() {
  if (!fbUser || !fbDb) return;
  const sessionRef = fbDb
    .collection("users")
    .doc(fbUser.uid)
    .collection("session")
    .doc("active");
  try {
    await sessionRef.set({
      deviceId: fbDeviceId,
      signedInAt: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent.slice(0, 120),
    });
    console.log("Session claimed by device:", fbDeviceId);
  } catch (e) {
    console.warn("Failed to claim session:", e.message);
  }
}

let fbForcedSignout = false;

function lockSignedOutScreen() {
  fbForcedSignout = true;
  if (fbSessionListener) {
    fbSessionListener();
    fbSessionListener = null;
  }
  if (fbListener) {
    fbListener();
    fbListener = null;
  }
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;padding:0;background:#000;";
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font:600 20px system-ui;padding:24px;z-index:999999;";
  overlay.innerHTML =
    '<div style="font-size:48px;margin-bottom:24px;">⚠️</div>' +
    '<div style="margin-bottom:12px;">Another device has signed in.</div>' +
    '<div style="font-size:14px;color:#888;">This session has been permanently signed out.<br>Please close this tab or refresh to sign in again.</div>';
  document.body.appendChild(overlay);
  fbAuth.signOut().catch(() => {});
}

function fbWatchSession() {
  if (fbSessionListener) {
    fbSessionListener();
    fbSessionListener = null;
  }
  if (!fbUser || !fbDb) return;
  const sessionRef = fbDb
    .collection("users")
    .doc(fbUser.uid)
    .collection("session")
    .doc("active");
  fbSessionListener = sessionRef.onSnapshot(
    (snap) => {
      if (!snap.exists) return;
      const data = snap.data();
      if (data.deviceId && data.deviceId !== fbDeviceId) {
        console.log(
          "Another device signed in (" +
            data.deviceId +
            "). Locking this device.",
        );
        lockSignedOutScreen();
      }
    },
    (err) => console.warn("Session listener error:", err.message),
  );
}

// ── SERVER TIME SYNC ──
// Measures offset between local clock and Firebase server clock.
// Stored in window._serverTimeOffsetMs so getTk() uses corrected time.
// This prevents date-key mismatches when device clock is wrong or across timezones.
window._serverTimeOffsetMs = 0;
async function fbSyncServerTime() {
  if (!fbDb) return;
  try {
    const localBefore = Date.now();
    // Write a server timestamp and immediately read it back to measure offset
    const tempRef = fbDb.collection("_timesync").doc("probe");
    await tempRef.set({ t: firebase.firestore.FieldValue.serverTimestamp() });
    const snap = await tempRef.get();
    const localAfter = Date.now();
    if (snap.exists && snap.data().t) {
      const serverMs = snap.data().t.toMillis();
      const localMid = Math.round((localBefore + localAfter) / 2);
      window._serverTimeOffsetMs = serverMs - localMid;
      const driftSec = Math.round(window._serverTimeOffsetMs / 1000);
      if (Math.abs(driftSec) > 60) {
        console.warn(
          "[TimeSync] Device clock drifts from server by " +
            driftSec +
            "s. Correcting getTk().",
        );
        toast(
          "⚠️ Device clock corrected by " + driftSec + "s for accurate sync",
        );
      } else {
        console.log(
          "[TimeSync] Server offset: " +
            window._serverTimeOffsetMs +
            "ms (within tolerance)",
        );
      }
      // Clean up probe document
      tempRef.delete().catch(() => {});
    }
  } catch (e) {
    console.warn("[TimeSync] Could not sync server time:", e.message);
  }
}

function fbInit() {
  if (fbApp) return true;
  if (typeof firebase === "undefined") {
    if (!fbInit._r) fbInit._r = 0;
    if (fbInit._r++ < 10) {
      setTimeout(fbInit, 300);
    }
    return false;
  }
  try {
    fbApp = firebase.apps.length
      ? firebase.apps[0]
      : firebase.initializeApp(firebaseConfig);
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
    fbDb.enablePersistence({ synchronizeTabs: false }).catch(() => {});
    // Handle redirect sign-in result (for in-app browsers that used signInWithRedirect)
    fbAuth
      .getRedirectResult()
      .then((result) => {
        if (result && result.credential && result.credential.accessToken) {
          toast("Signed in with Google! ☁️ Sync active 🙏");
        }
      })
      .catch((e) => {
        // Ignore errors here — redirect result may simply not exist
        console.warn("getRedirectResult:", e.message);
      });

    // ── When the device comes back online, push any local changes
    //    accumulated while offline. Firestore persistence also replays its
    //    own queued writes, but this ensures the latest in-memory state
    //    (including counters incremented since the last debounced push)
    //    reaches the cloud immediately on reconnect.
    if (!fbInit._onlineHooked) {
      fbInit._onlineHooked = true;
      window.addEventListener("online", () => {
        if (fbUser && !fbForcedSignout) {
          if (!App._cloudHydrated) {
            // App went offline before the initial cloud pull completed.
            // Re-run the full sync cycle: pull from Firebase first, then push offline work.
            fbAutoSync().catch((e) => console.warn("Online resync (full):", e && e.message));
          } else {
            // Already hydrated — just push any offline jap accumulated since last sync.
            fbPushFull().catch((e) => console.warn("Online resync (push):", e && e.message));
          }
        }
      });
    }

    fbAuth.onAuthStateChanged(async (user) => {
      if (fbForcedSignout) {
        lockSignedOutScreen();
        return;
      }
      const prevUid = App._uid;
      fbUser = user;
      if (user) {
        // ── CRITICAL: if UID changed, reload data scoped to new user ──
        if (prevUid !== user.uid) {
          App._uid = user.uid;
          // Preserve GPS coords across user switch
          const _prevLat = App.S.lastLat ?? null;
          const _prevLng = App.S.lastLng ?? null;
          // Reset in-memory state to defaults before loading new user's data
          App.S = {
            tk: App.getTk(),
            ms: 108,
            dt: 0,
            lt: 0,
            cfg: { vib: true, sound: true, soundType: "shankya" },
            history: {},
            h28: {},
            stotrams: {},
            brahma: {},
            customSt: [],
            timerHistory: {},
            timer28History: {},
            sankalpas: [],
            occasions: {},
            syncBaseline: {},
            syncBaseline28: {},
            syncBaselineTimer: {},
            syncBaselineTimer28: {},
            migrationV2Done: false,
            japMode: "radha",
            historyRV: {},
            timerHistoryRV: {},
            dtRV: 0,
            ltRV: 0,
            nameJapDeductRV: 0,
            malaLogRV: [],
            activityLog: [],
            syncBaselineRV: {},
            syncBaselineTimerRV: {},
            historyHK: {},
            timerHistoryHK: {},
            dtHK: 0,
            malaLogHK: [],
            syncBaselineHK: {},
            syncBaselineTimerHK: {},
            nameJapDeductHK: 0,
            gaudiyaMode: false,
            milestones: { reached: {}, lastChecked: 0 },
            lastLat: _prevLat,
            lastLng: _prevLng,
          };
          // ── Load IDB offline buffer (only if we were previously signed in offline) ──
          // Cloud pull in fbMigrate() will ALWAYS overwrite with authoritative data.
          // Guest-mode jap is intentionally NOT carried over here (guest IDB is never written).
          App._cloudHydrated = false; // block any push until cloud pull completes
          await App.load();
          App.lmc = Math.floor(App.gTod() / (App.S.ms || 108));
          App.lmcRV = Math.floor(
            (App.S.historyRV[App.S.tk] || 0) / (App.S.ms || 108),
          );
          App.lmcHK = Math.floor(
            ((App.S.historyHK || {})[App.S.tk] || 0) / (App.S.ms || 108),
          );
          App.lm28 = Math.floor((App.S.h28[App.S.tk] || 0) / (App.S.ms || 108));
          if (App.S.gaudiyaMode) document.body.classList.add("gaudiya-mode");
          switchJapMode(App.S.japMode || "radha");
          App.ua();
          renderSt();
          u28();
          renderBcal();
          renderCal();
          uStats();
          renderSankalpas();
          renderMalaLog();
        }
        document.getElementById("fbLoggedOut").style.display = "none";
        document.getElementById("fbLoggedIn").style.display = "block";
        document.getElementById("fbUserEmail").textContent =
          user.phoneNumber || user.email || user.displayName || "Devotee";
        setSyncPill("syncing", "Loading from cloud…");
        // ── ALWAYS pull from Firebase first on every login/refresh ──
        // fbMigrate() does a direct .get() (not just onSnapshot) so it is
        // guaranteed to fetch the latest cloud data before anything is rendered.
        fbClaimSession().then(async () => {
          fbWatchSession();
          // ── Sync device clock with Firebase server time ──
          // Corrects getTk() if local clock is wrong or in different timezone
          await fbSyncServerTime();
          // Direct cloud pull — overwrites local cache with authoritative Firebase data
          await fbAutoSync();

          if (isDeveloper()) {
            const devOptionsPanel = document.getElementById("devOptionsPanel");
            if (devOptionsPanel) devOptionsPanel.style.display = "block";
          } else {
            const devOptionsPanel = document.getElementById("devOptionsPanel");
            if (devOptionsPanel) devOptionsPanel.style.display = "none";
          }
          watchNewFeedback(); // Dev-only: real-time badge for new user feedback
          watchMyFeedback(); // All users: show developer replies + popup notification
        });
      } else {
        document.getElementById("fbLoggedOut").style.display = "block";
        document.getElementById("fbLoggedIn").style.display = "none";
        // Clean up session listener on sign out
        if (fbSessionListener) {
          fbSessionListener();
          fbSessionListener = null;
        }
        if (fbListener) {
          fbListener();
          fbListener = null;
        }
        // ── Sign-out: reset in-memory jap state so the device shows a clean
        // slate. Any jap done while signed out then accumulates in the
        // "guest" IDB bucket (App._uid = null) and CANNOT leak back into
        // the previously signed-in account on next login, because the
        // sign-in flow does a fresh App.load() + cloud pull keyed by uid.
        if (prevUid) {
          App._uid = null;
          App._cloudHydrated = false;
          App._allowInitialPush = false;
          const _prevLat2 = App.S && App.S.lastLat != null ? App.S.lastLat : null;
          const _prevLng2 = App.S && App.S.lastLng != null ? App.S.lastLng : null;
          App.S = {
            tk: App.getTk(),
            ms: 108,
            dt: 0,
            lt: 0,
            cfg: { vib: true, sound: true, soundType: "shankya" },
            history: {},
            h28: {},
            stotrams: {},
            brahma: {},
            customSt: [],
            timerHistory: {},
            timer28History: {},
            sankalpas: [],
            occasions: {},
            syncBaseline: {},
            syncBaseline28: {},
            syncBaselineTimer: {},
            syncBaselineTimer28: {},
            migrationV2Done: false,
            japMode: "radha",
            historyRV: {},
            timerHistoryRV: {},
            dtRV: 0,
            ltRV: 0,
            nameJapDeductRV: 0,
            malaLogRV: [],
            activityLog: [],
            syncBaselineRV: {},
            syncBaselineTimerRV: {},
            historyHK: {},
            timerHistoryHK: {},
            dtHK: 0,
            malaLogHK: [],
            syncBaselineHK: {},
            syncBaselineTimerHK: {},
            nameJapDeductHK: 0,
            gaudiyaMode: false,
            dt28Cycles: 0,
            milestones: { reached: {}, lastChecked: 0 },
            lastLat: _prevLat2,
            lastLng: _prevLng2,
          };
          // GUEST MODE: intentionally do NOT load from IDB or localStorage.
          // Guest jap is ephemeral — never persisted, never merged into signed-in state.
          App.lmc = Math.floor(App.gTod() / (App.S.ms || 108));
          App.lmcRV = Math.floor(
            (App.S.historyRV[App.S.tk] || 0) / (App.S.ms || 108),
          );
          App.lmcHK = Math.floor(
            ((App.S.historyHK || {})[App.S.tk] || 0) / (App.S.ms || 108),
          );
          App.lm28 = Math.floor((App.S.h28[App.S.tk] || 0) / (App.S.ms || 108));
          document.body.classList.remove("gaudiya-mode");
          switchJapMode(App.S.japMode || "radha");
          App.ua();
          try { renderSt(); } catch (_e) {}
          try { u28(); } catch (_e) {}
          try { renderBcal(); } catch (_e) {}
          try { renderCal(); } catch (_e) {}
          try { uStats(); } catch (_e) {}
          try { renderSankalpas(); } catch (_e) {}
          try { renderMalaLog(); } catch (_e) {}
          try { populateSettingsUI(); } catch (_e) {}
        }
      }
    });
    return true;
  } catch (e) {
    console.error("Firebase init:", e);
    return false;
  }
}

// ── Single "Sign in with Google" button ──
function fbSignInGoogle() {
  if (!fbInit()) {
    toast("Firebase not ready. Check your connection.");
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  // Try popup first; if it fails (in-app browsers, storage-partitioned envs), fall back to redirect
  fbAuth
    .signInWithPopup(provider)
    .then((result) => {
      const credential = result.credential;
      toast("Signed in with Google! ☁️ Sync active 🙏");
    })
    .catch((e) => {
      // Popup blocked or storage partitioned (e.g. Facebook in-app browser)
      if (
        e.code === "auth/popup-blocked" ||
        e.code === "auth/popup-closed-by-user" ||
        e.code === "auth/cancelled-popup-request" ||
        e.message.includes("sessionStorage") ||
        e.message.includes("initial state") ||
        e.message.includes("storage-partitioned")
      ) {
        // Inform user and open in external browser instead
        toast("Opening in your browser for sign-in…");
        setTimeout(() => {
          // Try redirect as fallback
          try {
            fbAuth.signInWithRedirect(provider);
          } catch (err) {
            // If even redirect fails (rare), show helpful message
            const el = document.getElementById("fbErr");
            if (el) {
              el.textContent =
                "Please open this app in Chrome or Safari (not inside Facebook/WhatsApp) to sign in.";
              setTimeout(() => (el.textContent = ""), 8000);
            }
          }
        }, 1000);
      } else {
        const el = document.getElementById("fbErr");
        if (el) {
          el.textContent = e.message;
          setTimeout(() => (el.textContent = ""), 5000);
        }
      }
    });
}

// ── Sign in with Zoho (OIDC provider) ──
function fbSignInZoho() {
  if (!fbInit()) {
    toast("Firebase not ready. Check your connection.");
    return;
  }
  const provider = new firebase.auth.OAuthProvider("oidc.zoho");

  fbAuth
    .signInWithPopup(provider)
    .then((result) => {
      toast("Signed in with Zoho! ☁️ Cloud sync active 🙏");
    })
    .catch((e) => {
      if (
        e.code === "auth/popup-blocked" ||
        e.code === "auth/popup-closed-by-user" ||
        e.code === "auth/cancelled-popup-request"
      ) {
        toast("Opening in your browser for Zoho sign-in…");
        setTimeout(() => {
          try {
            fbAuth.signInWithRedirect(provider);
          } catch (err) {
            const el = document.getElementById("fbErr");
            if (el) {
              el.textContent =
                "Please open this app in Chrome or Safari to sign in with Zoho.";
              setTimeout(() => (el.textContent = ""), 8000);
            }
          }
        }, 1000);
      } else {
        const el = document.getElementById("fbErr");
        if (el) {
          el.textContent = e.message;
          setTimeout(() => (el.textContent = ""), 5000);
        }
      }
    });
}

// ── Email / Password sign-in helpers ──
function _fbEmailErr(msg) {
  const el = document.getElementById("fbErr");
  if (el) {
    el.textContent = msg || "";
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 6000);
  }
}
function _fbReadEmailPass() {
  const e = (document.getElementById("fbEmailIn") || {}).value || "";
  const p = (document.getElementById("fbPassIn") || {}).value || "";
  return { email: e.trim(), pass: p };
}
function fbSignInEmail() {
  if (!fbInit()) { toast("Firebase not ready. Check your connection."); return; }
  const { email, pass } = _fbReadEmailPass();
  if (!email || !pass) { _fbEmailErr("Enter email and password"); return; }
  fbAuth.signInWithEmailAndPassword(email, pass)
    .then((cred) => {
      const u = cred && cred.user;
      if (u && !u.emailVerified) {
        try { u.sendEmailVerification(); } catch (_e) {}
        try { fbAuth.signOut(); } catch (_e) {}
        _fbEmailErr("Please verify your email first. A new verification link has been sent to " + (u.email || email) + ".");
        return;
      }
      toast("Signed in! ☁️ Sync active 🙏"); _fbEmailErr("");
    })
    .catch((e) => _fbEmailErr(e.message || "Sign-in failed"));
}
// ── Persistent info modal for auth flows. Stays open until the user
//    explicitly closes it (no auto-dismiss timer). Used for verification
//    email + forgot-password confirmations so the instructions stay
//    visible long enough to read.
function _fbInfoModal(title, bodyHtml) {
  try {
    var old = document.getElementById("fbAuthInfoModal");
    if (old) old.remove();
    var ov = document.createElement("div");
    ov.id = "fbAuthInfoModal";
    ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,sans-serif;animation:fbInfoFade .2s ease-out";
    ov.innerHTML = ''
      + '<style>@keyframes fbInfoFade{from{opacity:0}to{opacity:1}}@keyframes fbInfoPop{from{transform:translateY(14px) scale(.97);opacity:0}to{transform:none;opacity:1}}</style>'
      + '<div role="dialog" aria-modal="true" style="max-width:440px;width:100%;max-height:88vh;overflow-y:auto;background:linear-gradient(180deg,#1a2244,#0f1530);border:1px solid rgba(255,215,0,0.25);border-radius:18px;padding:22px 22px 18px;box-shadow:0 24px 60px rgba(0,0,0,0.55);animation:fbInfoPop .25s ease-out">'
      +   '<div style="font-size:17px;font-weight:700;color:#ffd97a;margin-bottom:12px;text-align:center;letter-spacing:.3px">' + title + '</div>'
      +   '<div style="font-size:13.5px;color:#e6e9f5;line-height:1.65">' + bodyHtml + '</div>'
      +   '<button id="fbAuthInfoClose" style="margin-top:18px;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(74,144,226,0.5);background:rgba(74,144,226,0.22);color:#cfe2ff;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Got it</button>'
      + '</div>';
    document.body.appendChild(ov);
    var close = function () { try { ov.remove(); } catch (_) {} };
    ov.querySelector("#fbAuthInfoClose").addEventListener("click", close);
    // Click backdrop (outside dialog) does NOT close — prevents accidental dismissal.
    // User must tap the explicit button.
  } catch (e) { try { alert(title + "\n\n" + bodyHtml.replace(/<[^>]+>/g, "")); } catch (_) {} }
}

// ── Phone / OTP sign-in (Firebase) ──────────────────────────────────
// Requires "Phone" provider enabled in Firebase Console → Authentication.
let _fbRecaptcha = null;
let _fbConfirmation = null;

function _fbEnsureRecaptcha() {
  if (!fbAuth) return null;
  if (_fbRecaptcha) return _fbRecaptcha;
  try {
    _fbHideRecaptchaBadge();
    _fbRecaptcha = new firebase.auth.RecaptchaVerifier("fbRecaptchaContainer", {
      size: "invisible",
      callback: function () { _fbHideRecaptchaBadge(); },
      "expired-callback": function () {
        try { _fbRecaptcha.clear(); } catch (_) {}
        _fbRecaptcha = null;
      }
    });
    _fbRecaptcha.render()
      .then(function () { _fbHideRecaptchaBadge(); })
      .catch(function (e) { console.warn("reCAPTCHA render:", e && e.message); });
  } catch (e) {
    console.warn("reCAPTCHA init:", e && e.message);
    _fbRecaptcha = null;
  }
  return _fbRecaptcha;
}

function _fbHideRecaptchaBadge() {
  try {
    var st = document.getElementById("fbRecaptchaHideStyle");
    if (!st) {
      st = document.createElement("style");
      st.id = "fbRecaptchaHideStyle";
      st.textContent = ".grecaptcha-badge{visibility:hidden!important;pointer-events:none!important}#fbRecaptchaContainer{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important}";
      document.head.appendChild(st);
    }
  } catch (_) {}
}

function _fbReadPhone() {
  const el = document.getElementById("fbPhoneIn");
  const codeEl = document.getElementById("fbPhoneCountry");
  const code = codeEl ? codeEl.value : "+91";
  let v = (el && el.value || "").trim().replace(/[\s\-()]/g, "");
  if (!v) return "";
  if (v.startsWith('+')) return v;
  return code + v;
}

function fbSendPhoneOtp(isResend) {
  if (!fbInit()) { toast("Firebase not ready. Check your connection."); return; }
  const phone = _fbReadPhone();
  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
    _fbEmailErr("Enter phone number (e.g. 9876543210)");
    return;
  }
  const verifier = _fbEnsureRecaptcha();
  if (!verifier) { _fbEmailErr("Could not initialize verification. Please reload."); return; }

  const btn = document.getElementById("fbPhoneSendBtn");
  if (btn) { btn.disabled = true; btn.textContent = isResend ? "Resending…" : "Sending…"; }
  _fbEmailErr("");

  fbAuth.signInWithPhoneNumber(phone, verifier)
    .then(function (confirmation) {
      _fbConfirmation = confirmation;
      const otpRow = document.getElementById("fbOtpRow");
      if (otpRow) otpRow.style.display = "block";
      const otpIn = document.getElementById("fbOtpIn");
      if (otpIn) { otpIn.value = ""; try { otpIn.focus(); } catch (_) {} }
      if (btn) { btn.disabled = false; btn.textContent = "Resend"; }
      _fbInfoModal("📱 OTP sent",
        '<p style="margin:0 0 10px">A 6-digit code has just been texted to:<br><span style="color:#ffd97a">' + phone + '</span></p>'
        + '<ol style="margin:8px 0 10px 18px;padding:0">'
        +   '<li>Check your Messages/SMS inbox. On Android, the code may also appear in the keyboard suggestion/clipboard bar.</li>'
        +   '<li>Tap that suggested code or type it into the <b>OTP</b> field, then tap <b>Verify &amp; Sign In</b>.</li>'
        +   '<li>Didn\'t get it within a minute? Tap <b>Resend OTP</b>.</li>'
        + '</ol>'
        + '<p style="margin:10px 0 0;font-size:12.5px;opacity:.85">Make sure the number includes your country code (e.g. <b>+91</b> for India, <b>+1</b> for US).</p>'
      );
    })
    .catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Send OTP"; }
      try { if (_fbRecaptcha) { _fbRecaptcha.clear(); } } catch (_) {}
      _fbRecaptcha = null;
      _fbEmailErr((e && e.message) || "Could not send OTP");
    });
}

function fbVerifyPhoneOtp() {
  if (!_fbConfirmation) { _fbEmailErr("Please request an OTP first"); return; }
  const otpEl = document.getElementById("fbOtpIn");
  const code = (otpEl && otpEl.value || "").trim();
  if (!/^\d{4,8}$/.test(code)) { _fbEmailErr("Enter the 6-digit OTP from your SMS"); return; }
  _fbEmailErr("");
  _fbConfirmation.confirm(code)
    .then(function () {
      _fbConfirmation = null;
      try { if (_fbRecaptcha) { _fbRecaptcha.clear(); } } catch (_) {}
      _fbRecaptcha = null;
      const otpRow = document.getElementById("fbOtpRow");
      if (otpRow) otpRow.style.display = "none";
      toast("Signed in! ☁️ Sync active 🙏");
    })
    .catch(function (e) {
      _fbEmailErr((e && e.message) || "Invalid or expired OTP");
    });
}

function fbResetPhoneOtp() {
  _fbConfirmation = null;
  const otpRow = document.getElementById("fbOtpRow");
  if (otpRow) otpRow.style.display = "none";
  const btn = document.getElementById("fbPhoneSendBtn");
  if (btn) { btn.disabled = false; btn.textContent = "Send OTP"; }
  _fbEmailErr("");
}

function fbSignUpEmail() {

  if (!fbInit()) { toast("Firebase not ready. Check your connection."); return; }
  const { email, pass } = _fbReadEmailPass();
  if (!email || !pass) { _fbEmailErr("Enter email and password"); return; }
  if (pass.length < 6) { _fbEmailErr("Password must be at least 6 characters"); return; }
  fbAuth.createUserWithEmailAndPassword(email, pass)
    .then((cred) => {
      const u = cred && cred.user;
      const send = (u && u.sendEmailVerification)
        ? u.sendEmailVerification()
        : Promise.resolve();
      return send.then(() => {
        try { fbAuth.signOut(); } catch (_e) {}
        _fbEmailErr("");
        const addr = (u && u.email) ? u.email : email;
        _fbInfoModal("📬 Verification email sent",
          '<p style="margin:0 0 10px"><b>A verification link has been sent to:</b><br><span style="color:#ffd97a;word-break:break-all">' + addr + '</span></p>'
          + '<ol style="margin:8px 0 10px 18px;padding:0">'
          +   '<li>Open your inbox and tap the link to verify your email.</li>'
          +   '<li><b>Can\'t find it?</b> Check your <b>Spam</b>, <b>Promotions</b>, or <b>Junk</b> folder.</li>'
          +   '<li>Come back here and tap <b>Sign In</b> with the same email & password.</li>'
          + '</ol>'
          + '<p style="margin:10px 0 0;font-size:12.5px;opacity:.85">Once verified, future sign-ins on this or any other device will <u>not</u> need another confirmation email.</p>'
        );
      });
    })
    .catch((e) => _fbEmailErr(e.message || "Sign-up failed"));
}
function fbResetEmail() {
  if (!fbInit()) { toast("Firebase not ready. Check your connection."); return; }
  const { email } = _fbReadEmailPass();
  if (!email) { _fbEmailErr("Enter your email above first"); return; }
  fbAuth.sendPasswordResetEmail(email)
    .then(() => {
      _fbEmailErr("");
      _fbInfoModal("🔑 Password reset email sent",
        '<p style="margin:0 0 10px"><b>A password-reset link has been sent to:</b><br><span style="color:#ffd97a;word-break:break-all">' + email + '</span></p>'
        + '<ol style="margin:8px 0 10px 18px;padding:0">'
        +   '<li>Open your inbox and tap the reset link.</li>'
        +   '<li><b>Can\'t find it?</b> Check your <b>Spam</b>, <b>Promotions</b>, or <b>Junk</b> folder.</li>'
        +   '<li>Choose a new password, then come back and tap <b>Sign In</b>.</li>'
        + '</ol>'
        + '<p style="margin:10px 0 0;font-size:12.5px;opacity:.85">The link expires after a short time — request another one if needed.</p>'
      );
    })
    .catch((e) => _fbEmailErr(e.message || "Could not send reset email"));
}

// ── Wipe ALL locally cached data for a given UID. Used on sign-out so
//    the next login (same device or another) ALWAYS pulls authoritative
//    state from Firebase, never from a stale local cache. Guest data is
//    cleared too so the signed-out screen shows a clean zero-zero state.
async function clearLocalUserData(uid) {
  try {
    if (App.db) {
      // Remove this UID's main snapshot
      await new Promise((res) => {
        const tx = App.db.transaction("state", "readwrite");
        tx.objectStore("state").delete((uid || "guest") + ":main");
        tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
      });
      // Also clear the guest snapshot so guest mode starts clean.
      await new Promise((res) => {
        const tx = App.db.transaction("state", "readwrite");
        tx.objectStore("state").delete("guest:main");
        tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
      });
      // Clear shared per-date stores (not UID-scoped in IDB schema).
      for (const store of ["history","h28","timerHistory","timer28History","malaLog","activityLogArchive"]) {
        try { await App.dbClearStore(store); } catch (_) {}
      }
    }
  } catch (e) { console.warn("clearLocalUserData IDB:", e.message); }
  // Wipe localStorage mirrors for both UID and legacy keys.
  try { if (uid) localStorage.removeItem("rjap5_" + uid); } catch (_) {}
  try { localStorage.removeItem("rjap5_guest"); } catch (_) {}
  try { localStorage.removeItem("rjap5"); } catch (_) {}
  try { localStorage.removeItem("rjap_sadhana_start"); } catch (_) {}
}

async function fbSignOut() {
  if (!fbAuth) return;
  const outgoingUid = (fbUser && fbUser.uid) || App._uid || null;
  // ── STEP 1: Push current state to Firebase BEFORE signing out so the
  //    user's "last state" is preserved as the next-login baseline.
  //    Firestore offline persistence will queue the write while offline;
  //    we still attempt it so reconnection can replay it.
  if (fbUser && App._cloudHydrated) {
    try {
      setSyncPill("syncing", "Saving before sign-out…");
      if (!navigator.onLine) {
        toast("Offline — your last state will sync when you're back online");
      }
      await fbPushFull();
    } catch (e) {
      console.warn("Push before sign-out failed:", e && e.message);
    }
  }
  // Stop sync listeners so cloud changes cannot resurrect local state mid-wipe.
  if (fbSessionListener) { fbSessionListener(); fbSessionListener = null; }
  if (fbListener) { fbListener(); fbListener = null; }
  // Block any further writes until the next sign-in completes its cloud pull.
  App._cloudHydrated = false;
  App._allowInitialPush = false;
  App._suspendCloudSync = true;
  // ── STEP 2: Wipe local data so re-login always reflects Firebase, and
  //    so the signed-out (guest) display starts at zero-zero.
  await clearLocalUserData(outgoingUid);
  App._uid = null;
  App._suspendCloudSync = false;

  // ── Reset in-memory state to zero-zero immediately ──
  // Do NOT wait for onAuthStateChanged — it won't re-render because _uid is already null.
  const _prevLat = App.S && App.S.lastLat != null ? App.S.lastLat : null;
  const _prevLng = App.S && App.S.lastLng != null ? App.S.lastLng : null;
  App.S = {
    tk: App.getTk(), ms: 108, dt: 0, lt: 0,
    cfg: { vib: true, sound: true, soundType: "shankya" },
    history: {}, h28: {}, stotrams: {}, brahma: {}, customSt: [],
    timerHistory: {}, timer28History: {}, sankalpas: [], occasions: {},
    syncBaseline: {}, syncBaseline28: {}, syncBaselineTimer: {}, syncBaselineTimer28: {},
    migrationV2Done: false, japMode: "radha",
    historyRV: {}, timerHistoryRV: {}, dtRV: 0, ltRV: 0, nameJapDeductRV: 0,
    malaLogRV: [], activityLog: [], syncBaselineRV: {}, syncBaselineTimerRV: {},
    historyHK: {}, timerHistoryHK: {}, dtHK: 0, malaLogHK: [],
    syncBaselineHK: {}, syncBaselineTimerHK: {}, nameJapDeductHK: 0,
    gaudiyaMode: false, dt28Cycles: 0,
    milestones: { reached: {}, lastChecked: 0 },
    lastLat: _prevLat, lastLng: _prevLng,
  };
  App.lmc = 0; App.lmcRV = 0; App.lmcHK = 0; App.lm28 = 0;
  document.body.classList.remove("gaudiya-mode");
  switchJapMode("radha");
  try { App.ua(); } catch (_e) {}
  try { renderSt(); } catch (_e) {}
  try { u28(); } catch (_e) {}
  try { renderBcal(); } catch (_e) {}
  try { renderCal(); } catch (_e) {}
  try { uStats(); } catch (_e) {}
  try { renderSankalpas(); } catch (_e) {}
  try { renderMalaLog(); } catch (_e) {}
  try { populateSettingsUI(); } catch (_e) {}

  fbAuth.signOut().then(() => toast("Signed out 🙏"));
}
async function fbPushDelta() {
  return fbPushFull();
}

async function fbPushFull() {
  if (!fbUser) return;
  // SAFETY: never push local state to cloud until we have successfully
  // pulled the authoritative cloud copy at least once this session.
  // Prevents wiping cloud data after "Clear app data" + re-login.
  if (!App._cloudHydrated && !App._allowInitialPush) {
    console.warn("fbPushFull blocked: cloud not yet hydrated");
    return;
  }
  setSyncPill("syncing", "Syncing…");
  const payload = {
    history: App.S.history || {},
    h28: App.S.h28 || {},
    stotrams: App.S.stotrams || {},
    brahma: App.S.brahma || {},
    customSt: App.S.customSt || [],
    timerHistory: App.S.timerHistory || {},
    timer28History: App.S.timer28History || {},
    sankalpas: App.S.sankalpas || [],
    occasions: App.S.occasions || {},
    ms: App.S.ms || 108,
    dt: App.S.dt || 0,
    lt: App.S.lt || 0,
    nameJapDeduct: App.S.nameJapDeduct || 0,
    cfg: App.S.cfg || {},
    malaLog: App.S.malaLog || [],
    malaLogDate: App.S.tk,
    brahmacharya_start_date: App.S.brahmacharya_start_date || "",
    japMode: App.S.japMode || "radha",
    historyRV: App.S.historyRV || {},
    timerHistoryRV: App.S.timerHistoryRV || {},
    dtRV: App.S.dtRV || 0,
    ltRV: App.S.ltRV || 0,
    nameJapDeductRV: App.S.nameJapDeductRV || 0,
    malaLogRV: App.S.malaLogRV || [],
    brahmacharya_start_date: App.S.brahmacharya_start_date || "",
    activityLog: App.S.activityLog || [],
    sadhanaStart: App.S.sadhanaStart || "",
    historyHK: App.S.historyHK || {},
    timerHistoryHK: App.S.timerHistoryHK || {},
    dtHK: App.S.dtHK || 0,
    nameJapDeductHK: App.S.nameJapDeductHK || 0,
    malaLogHK: App.S.malaLogHK || [],
    gaudiyaMode: App.S.gaudiyaMode || false,
    dt28Cycles: App.S.dt28Cycles || 0,
    milestones: App.S.milestones || { reached: {}, lastChecked: 0 },
    lbOptIn: App.S.lbOptIn || false,
    lbDisplayName: App.S.lbDisplayName || "",
    bgRadhaVallabh: App.S.bgRadhaVallabh ?? 1,
    bgHitju: App.S.bgHitju ?? 1,
    bgGurudev: App.S.bgGurudev ?? 1,
    lastSync: firebase.firestore.FieldValue.serverTimestamp(),
    deviceId: fbDeviceId,
  };
  try {
    await fbDb
      .collection("users")
      .doc(fbUser.uid)
      .collection("data")
      .doc("main")
      .set(payload);
    // ── Push leaderboard entry if opted in ──
    pushLeaderboard().catch(() => {});
    App.S.syncBaseline = JSON.parse(JSON.stringify(App.S.history || {}));
    App.S.syncBaseline28 = JSON.parse(JSON.stringify(App.S.h28 || {}));
    App.S.syncBaselineTimer = JSON.parse(
      JSON.stringify(App.S.timerHistory || {}),
    );
    App.S.syncBaselineTimer28 = JSON.parse(
      JSON.stringify(App.S.timer28History || {}),
    );
    App._suspendCloudSync = true;
    await App.save();
    App._suspendCloudSync = false;
    setSyncPill("", "☁️ Synced " + new Date().toLocaleTimeString());
  } catch (e) {
    App._suspendCloudSync = false;
    console.warn("Full sync failed:", e.message);
    setSyncPill("error", "Sync failed");
  }
}

function fbApplyRemote(d) {
  if (d.deviceId && d.deviceId === fbDeviceId) return;
  // If a reset is in progress, ignore incoming cloud data to prevent resurrection
  if (App._resetInProgress) return;
  // Ensure UID is set before saving (prevents saving to wrong UID key)
  if (fbUser && App._uid !== fbUser.uid) App._uid = fbUser.uid;
  if ("history" in d)
    App.S.history = JSON.parse(JSON.stringify(d.history || {}));
  if ("h28" in d) App.S.h28 = JSON.parse(JSON.stringify(d.h28 || {}));
  if ("timerHistory" in d)
    App.S.timerHistory = JSON.parse(JSON.stringify(d.timerHistory || {}));
  if ("timer28History" in d)
    App.S.timer28History = JSON.parse(JSON.stringify(d.timer28History || {}));
  if ("stotrams" in d)
    App.S.stotrams = JSON.parse(JSON.stringify(d.stotrams || {}));
  if ("brahma" in d) App.S.brahma = JSON.parse(JSON.stringify(d.brahma || {}));
  if ("customSt" in d)
    App.S.customSt = JSON.parse(JSON.stringify(d.customSt || []));
  if ("sankalpas" in d)
    App.S.sankalpas = JSON.parse(JSON.stringify(d.sankalpas || []));
  if ("occasions" in d)
    App.S.occasions = JSON.parse(JSON.stringify(d.occasions || {}));
  // Only apply malaLog from Firebase if it belongs to today AND local today has jap
  if ("malaLog" in d) {
    const remoteMalaLog = d.malaLog || [];
    const remoteMalaDate = d.malaLogDate || null;
    const localTodayJap = App.S.history[App.S.tk] || 0;
    if (remoteMalaDate === App.S.tk && localTodayJap > 0) {
      App.S.malaLog = JSON.parse(JSON.stringify(remoteMalaLog));
    } else {
      // Remote log is stale or no jap done today — clear it
      App.S.malaLog = [];
    }
  }
  if (d.ms) App.S.ms = d.ms;
  if (d.dt !== undefined) App.S.dt = d.dt;
  if (d.lt !== undefined) App.S.lt = d.lt;
  if (d.nameJapDeduct !== undefined) App.S.nameJapDeduct = d.nameJapDeduct;
  if (d.cfg) App.S.cfg = JSON.parse(JSON.stringify(d.cfg || {}));
  if ("historyRV" in d)
    App.S.historyRV = JSON.parse(JSON.stringify(d.historyRV || {}));
  if ("timerHistoryRV" in d)
    App.S.timerHistoryRV = JSON.parse(JSON.stringify(d.timerHistoryRV || {}));
  if (d.japMode) App.S.japMode = d.japMode;
  if (d.dtRV !== undefined) App.S.dtRV = d.dtRV;
  if (d.ltRV !== undefined) App.S.ltRV = d.ltRV;
  if (d.nameJapDeductRV !== undefined)
    App.S.nameJapDeductRV = d.nameJapDeductRV;
  if (d.brahmacharya_start_date)
    App.S.brahmacharya_start_date = d.brahmacharya_start_date;
  if ("activityLog" in d) {
    // Merge remote + local, deduplicate by ts+t, keep latest 2000 in memory
    // Full lifetime data lives in activityLogArchive IDB store
    const remote = d.activityLog || [];
    const local = App.S.activityLog || [];
    const seen = new Set();
    const merged = [...remote, ...local].filter((e) => {
      const key = e.t + "_" + e.ts;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    merged.sort((a, b) => a.ts - b.ts);
    App.S.activityLog = merged.slice(-2000);
  }
  // Only apply malaLogRV from Firebase if it belongs to today AND local today has RV jap
  if ("malaLogRV" in d) {
    const remoteMalaLogRV = d.malaLogRV || [];
    const remoteMalaDate = d.malaLogDate || null;
    const localTodayRVJap = App.S.historyRV[App.S.tk] || 0;
    if (remoteMalaDate === App.S.tk && localTodayRVJap > 0) {
      App.S.malaLogRV = JSON.parse(JSON.stringify(remoteMalaLogRV));
    } else {
      App.S.malaLogRV = [];
    }
  }
  // HK fields
  if ("historyHK" in d)
    App.S.historyHK = JSON.parse(JSON.stringify(d.historyHK || {}));
  if ("timerHistoryHK" in d)
    App.S.timerHistoryHK = JSON.parse(JSON.stringify(d.timerHistoryHK || {}));
  if (d.dtHK !== undefined) App.S.dtHK = d.dtHK;
  if (d.dt28Cycles !== undefined) {
    // Only apply remote dt28Cycles if it's actually set (>0), or if local is also 0.
    // Prevents a stale Firebase doc (dt28Cycles:0) from wiping a freshly saved target.
    if ((d.dt28Cycles || 0) > 0 || (App.S.dt28Cycles || 0) === 0) {
      App.S.dt28Cycles = d.dt28Cycles;
    }
  }
  if (d.milestones) {
    // Merge: union of local + remote reached flags so neither device loses a celebration
    const localReached = (App.S.milestones && App.S.milestones.reached) || {};
    const remoteReached = d.milestones.reached || {};
    App.S.milestones = {
      reached: { ...remoteReached, ...localReached },
      lastChecked: Math.max(
        (App.S.milestones && App.S.milestones.lastChecked) || 0,
        d.milestones.lastChecked || 0
      ),
    };
    // Keep localStorage mirror in sync
    try { localStorage.setItem("rjap_milestones", JSON.stringify(App.S.milestones)); } catch (_) {}
  }
  if (d.nameJapDeductHK !== undefined)
    App.S.nameJapDeductHK = d.nameJapDeductHK;
  if (d.gaudiyaMode !== undefined) {
    App.S.gaudiyaMode = d.gaudiyaMode;
    App.S.gaudiyaMode
      ? document.body.classList.add("gaudiya-mode")
      : document.body.classList.remove("gaudiya-mode");
  }
  if ("malaLogHK" in d) {
    const remoteMalaLogHK = d.malaLogHK || [];
    const remoteMalaDate2 = d.malaLogDate || null;
    const localTodayHKJap = (App.S.historyHK || {})[App.S.tk] || 0;
    if (remoteMalaDate2 === App.S.tk && localTodayHKJap > 0) {
      App.S.malaLogHK = JSON.parse(JSON.stringify(remoteMalaLogHK));
    } else {
      App.S.malaLogHK = [];
    }
  }
  if (d.sadhanaStart) {
    App.S.sadhanaStart = d.sadhanaStart;
    localStorage.setItem("rjap_sadhana_start", d.sadhanaStart);
    const inp = document.getElementById("msSadhanaStart");
    if (inp) inp.value = d.sadhanaStart;
  }
  // Leaderboard & Photo settings
  if (d.lbOptIn !== undefined) App.S.lbOptIn = d.lbOptIn;
  if (d.lbDisplayName !== undefined) App.S.lbDisplayName = d.lbDisplayName;
  if (d.bgRadhaVallabh !== undefined) App.S.bgRadhaVallabh = d.bgRadhaVallabh;
  if (d.bgHitju !== undefined) App.S.bgHitju = d.bgHitju;
  if (d.bgGurudev !== undefined) App.S.bgGurudev = d.bgGurudev;

  // Old saves wrote both startDate AND endDate to occasions. Remove the endDate entry

  if (!App.S.historyRV) App.S.historyRV = {};
  if (!App.S.timerHistoryRV) App.S.timerHistoryRV = {};
  if (!App.S.historyRV[App.S.tk]) App.S.historyRV[App.S.tk] = 0;
  if (!App.S.timerHistoryRV[App.S.tk]) App.S.timerHistoryRV[App.S.tk] = 0;
  if (!App.S.history[App.S.tk]) App.S.history[App.S.tk] = 0;
  if (!App.S.h28[App.S.tk]) App.S.h28[App.S.tk] = 0;
  if (!App.S.timerHistory[App.S.tk]) App.S.timerHistory[App.S.tk] = 0;
  if (!App.S.timer28History[App.S.tk]) App.S.timer28History[App.S.tk] = 0;
  App.S.syncBaseline = JSON.parse(JSON.stringify(App.S.history || {}));
  App.S.syncBaseline28 = JSON.parse(JSON.stringify(App.S.h28 || {}));
  App.S.syncBaselineTimer = JSON.parse(
    JSON.stringify(App.S.timerHistory || {}),
  );
  App.S.syncBaselineTimer28 = JSON.parse(
    JSON.stringify(App.S.timer28History || {}),
  );
  App._suspendCloudSync = true;
  App.save().finally(() => {
    App._suspendCloudSync = false;
  });
  App.lmc = Math.floor(App.gTod() / (App.S.ms || 108));
  App.lm28 = Math.floor((App.S.h28[App.S.tk] || 0) / (App.S.ms || 108));
  App.lmcHK = Math.floor(
    ((App.S.historyHK || {})[App.S.tk] || 0) / (App.S.ms || 108),
  );
  if (App.S.gaudiyaMode) document.body.classList.add("gaudiya-mode");
  switchJapMode(App.S.japMode || "radha");
  renderSt();
  u28();
  renderBcal();
  renderCal();
  uStats();
  renderSankalpas();
  renderMalaLog();
  try { populateSettingsUI(); } catch (_e) {}
  setSyncPill("", "🔄 Synced from cloud");
}

async function fbMigrate() {
  // Always pull fresh from Firebase on every login/refresh.
  // migrationV2Done only guards the one-time data-format migration,
  // but we ALWAYS fetch the latest cloud state so the device is up to date.
  try {
    const docRef = fbDb
      .collection("users")
      .doc(fbUser.uid)
      .collection("data")
      .doc("main");
    setSyncPill("syncing", "Loading from cloud…");
    // CRITICAL: a brand-new device has an empty offline cache. The default
    // get() can resolve from that empty cache and incorrectly report
    // "no cloud doc exists", which would then push local zeroes and wipe
    // the user's real cloud data. Force a server fetch on the initial pull.
    let snap;
    try {
      snap = await docRef.get({ source: "server" });
    } catch (eServer) {
      // Offline or server unreachable — fall back to cache, but DO NOT
      // treat a cache miss as proof there's no cloud doc.
      console.warn("Server pull failed, falling back to cache:", eServer.message);
      snap = await docRef.get({ source: "cache" }).catch(() => null);
      if (!snap || !snap.exists) {
        // Could not confirm cloud state — refuse to push so we never
        // overwrite real cloud data with empty local state.
        // _cloudHydrated stays false — the "online" listener will retry fbAutoSync() automatically.
        App._cloudHydrated = false;
        setSyncPill("error", "Offline — will sync when online");
        return;
      }
    }
    if (!snap.exists) {
      // Server confirmed no cloud doc exists yet.
      // SAFETY: only seed Firebase if local state actually has meaningful data.
      // After a browser "Delete & reset", local is zeros AND cloud may incorrectly
      // appear empty due to cache wipe — never overwrite cloud with zeros.
      const hasLocalData =
        Object.values(App.S.history || {}).some(v => v > 0) ||
        Object.values(App.S.historyRV || {}).some(v => v > 0) ||
        Object.values(App.S.historyHK || {}).some(v => v > 0) ||
        (App.S.dt || 0) > 0 || (App.S.dtRV || 0) > 0 || (App.S.dtHK || 0) > 0;
      if (hasLocalData) {
        // Genuine first-time user with local data — seed Firebase
        App._allowInitialPush = true;
        try { await fbPushFull(); } finally { App._allowInitialPush = false; }
        App._cloudHydrated = true;
      } else {
        // Local is zeros — could be a fresh install OR a browser reset wipe.
        // Do a second server fetch after a short delay to confirm truly no doc.
        await new Promise(r => setTimeout(r, 2000));
        let snap2 = null;
        try { snap2 = await docRef.get({ source: "server" }); } catch (_) {}
        if (snap2 && snap2.exists) {
          // Doc appeared on retry — browser reset scenario. Apply cloud data.
          fbApplyRemote({ ...snap2.data(), deviceId: null });
          App._cloudHydrated = true;
        } else {
          // Confirmed truly new user — safe to seed
          App._allowInitialPush = true;
          try { await fbPushFull(); } finally { App._allowInitialPush = false; }
          App._cloudHydrated = true;
        }
      }
    } else {
      // ── OFFLINE-WORK PRESERVATION ──
      // Snapshot local counts BEFORE applying cloud data.
      // If the user did jap while signed-in but offline (app closed & reopened),
      // local IDB has higher counts than cloud. We must not overwrite them.
      const localHistory      = JSON.parse(JSON.stringify(App.S.history      || {}));
      const localH28          = JSON.parse(JSON.stringify(App.S.h28          || {}));
      const localTimerHistory = JSON.parse(JSON.stringify(App.S.timerHistory || {}));
      const localHistoryRV    = JSON.parse(JSON.stringify(App.S.historyRV    || {}));
      const localHistoryHK    = JSON.parse(JSON.stringify(App.S.historyHK    || {}));
      const localTimerHistoryRV = JSON.parse(JSON.stringify(App.S.timerHistoryRV || {}));
      const localTimerHistoryHK = JSON.parse(JSON.stringify(App.S.timerHistoryHK || {}));
      const localDt   = App.S.dt   || 0;
      const localDtRV = App.S.dtRV || 0;
      const localDtHK = App.S.dtHK || 0;

      // Cloud data exists — apply it (overrides local cache)
      fbApplyRemote({ ...snap.data(), deviceId: null });
      App._cloudHydrated = true; // cloud copy applied, future saves may push

      // ── MERGE: for each date key, keep whichever is higher (local offline wins) ──
      let offlineWorkFound = false;
      function mergeMax(local, applied) {
        for (const k in local) {
          if ((local[k] || 0) > (applied[k] || 0)) {
            applied[k] = local[k];
            offlineWorkFound = true;
          }
        }
      }
      mergeMax(localHistory,        App.S.history);
      mergeMax(localH28,            App.S.h28);
      mergeMax(localTimerHistory,   App.S.timerHistory);
      mergeMax(localHistoryRV,      App.S.historyRV);
      mergeMax(localHistoryHK,      App.S.historyHK);
      mergeMax(localTimerHistoryRV, App.S.timerHistoryRV);
      mergeMax(localTimerHistoryHK, App.S.timerHistoryHK);
      // Also preserve higher dt (lifetime jap seconds) if local is ahead
      if (localDt   > App.S.dt)   { App.S.dt   = localDt;   offlineWorkFound = true; }
      if (localDtRV > App.S.dtRV) { App.S.dtRV = localDtRV; offlineWorkFound = true; }
      if (localDtHK > App.S.dtHK) { App.S.dtHK = localDtHK; offlineWorkFound = true; }

      if (offlineWorkFound) {
        // Local had offline jap ahead of cloud — push the merged state immediately
        console.log("Offline work detected — pushing merged state to Firebase");
        setSyncPill("syncing", "Syncing offline jap…");
        App._allowInitialPush = true;
        try { await fbPushFull(); } finally { App._allowInitialPush = false; }
      }

      if (!App.S.migrationV2Done) {
        // First-ever migration: push merged state back
        await fbPushFull();
        App.S.migrationV2Done = true;
        App.save();
      }
    }
    setSyncPill("", "✅ Synced from cloud");
  } catch (e) {
    console.warn("Cloud pull failed:", e.message);
    setSyncPill("error", "Sync failed");
  }
}

async function fbAutoSync() {
  if (fbListener) {
    fbListener();
    fbListener = null;
  }
  // ── Always do an immediate direct pull from Firebase (no delay, no cache) ──
  // This ensures every login/refresh gets authoritative cloud data first.
  await fbMigrate();
  // ── Then set up the real-time listener for subsequent changes ──
  try {
    const docRef = fbDb
      .collection("users")
      .doc(fbUser.uid)
      .collection("data")
      .doc("main");
    fbListener = docRef.onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        fbApplyRemote(snap.data());
      },
      (err) => console.warn("Listener:", err.message),
    );
  } catch (e) {
    console.warn("Could not start listener:", e.message);
  }
}

let _fbDeb = null;
function fbDebouncedPush() {
  if (!fbUser) return;
  clearTimeout(_fbDeb);
  _fbDeb = setTimeout(() => fbPushDelta(), 3000);
}

// ═══════════════════════════════════════════════════════
// GOOGLE DRIVE — Silent Monk Auto Backup
// Uses the access token from Google Sign-In (same login)
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════

const NAMES28 = [
  { num: "১", name: "রাধা", nameHindi: "राधा", meaning: "The Supreme Beloved" },
  {
    num: "২",
    name: "রাসেশ্বরী",
    nameHindi: "रासेश्वरी",
    meaning: "Goddess of the Rasa dance",
  },
  {
    num: "৩",
    name: "রম্যা",
    nameHindi: "रम्या",
    meaning: "The most beautiful & delightful",
  },
  {
    num: "৪",
    name: "শ্রীকৃষ্ণমন্ত্রাধিদেবতা",
    nameHindi: "श्रीकृष्णमन्त्राधिदेवता",
    meaning: "Presiding deity of Krishna-mantra",
  },
  {
    num: "৫",
    name: "সর্বাদ্যা",
    nameHindi: "सर्वाद्या",
    meaning: "The primordial, first of all",
  },
  {
    num: "৬",
    name: "সর্ববন্দ্যা",
    nameHindi: "सर्वबन्द्या",
    meaning: "Worthy of worship by all",
  },
  {
    num: "৭",
    name: "বৃন্দাবনবিহারিণী",
    nameHindi: "वृन्दावनविहारिणी",
    meaning: "Who plays in Vrindavan",
  },
  {
    num: "৮",
    name: "বৃন্দারাধ্যা",
    nameHindi: "वृन्दाराध्या",
    meaning: "Worshipped by Vrinda Devi",
  },
  { num: "৯", name: "রমা", nameHindi: "रमा", meaning: "The blissful one" },
  {
    num: "১০",
    name: "অশেষগোপীমণ্ডলপূজিতা",
    nameHindi: "अशेषगोपीमण्डलपूजिता",
    meaning: "Worshipped by all the gopis",
  },
  {
    num: "১১",
    name: "সত্যা",
    nameHindi: "सत्या",
    meaning: "The eternal Truth",
  },
  {
    num: "১২",
    name: "সত্যপরা",
    nameHindi: "सत्यपरा",
    meaning: "Supreme among the truthful",
  },
  {
    num: "১৩",
    name: "সত্যভামা",
    nameHindi: "सत्यभामा",
    meaning: "True and lustrous one",
  },
  {
    num: "১৪",
    name: "শ্রীকৃষ্ণবল্লভা",
    nameHindi: "श्रीकृष्णवल्लभा",
    meaning: "The beloved of Shri Krishna",
  },
  {
    num: "১৫",
    name: "বৃষভানুসুতা",
    nameHindi: "वृषभानुसुता",
    meaning: "Daughter of King Vrishabhanu",
  },
  {
    num: "১৬",
    name: "গোপী",
    nameHindi: "गोपी",
    meaning: "The divine cowherd girl",
  },
  {
    num: "১৭",
    name: "মূলপ্রকৃতি",
    nameHindi: "मूलप्रकृति",
    meaning: "The primordial nature",
  },
  {
    num: "১৮",
    name: "ঈশ্বরী",
    nameHindi: "ईश्वरी",
    meaning: "The supreme goddess",
  },
  {
    num: "১৯",
    name: "গান্ধর্বা",
    nameHindi: "गान्धर्वा",
    meaning: "Goddess of divine music",
  },
  {
    num: "২০",
    name: "রাধিকা",
    nameHindi: "राधिका",
    meaning: "She who worships Krishna",
  },
  {
    num: "২১",
    name: "আরম্যা",
    nameHindi: "आरम्या",
    meaning: "Noble, honoured one",
  },
  {
    num: "২২",
    name: "রুক্মিণী",
    nameHindi: "रुक्मिणी",
    meaning: "Adorned with gold",
  },
  {
    num: "২৩",
    name: "পরমেশ্বরী",
    nameHindi: "परमेश्वरी",
    meaning: "The supreme ruler",
  },
  {
    num: "২৪",
    name: "পরাৎপরতরা",
    nameHindi: "परात्परतरा",
    meaning: "Beyond the beyond",
  },
  {
    num: "২৫",
    name: "পূর্ণা",
    nameHindi: "पूर्णा",
    meaning: "The complete, perfect one",
  },
  {
    num: "২৬",
    name: "পূর্ণচন্দ্রনিভাননা",
    nameHindi: "पूर्णचन्द्रनिभानना",
    meaning: "Face like the full moon",
  },
  {
    num: "২৭",
    name: "ভুক্তিমুক্তিপ্রদা",
    nameHindi: "भुक्तिमुक्तिप्रदा",
    meaning: "Giver of enjoyment & liberation",
  },
  {
    num: "২৮",
    name: "ভবব্যাধিবিনাশিনী",
    nameHindi: "भवव्याधिविनाशिनी",
    meaning: "Destroyer of worldly suffering",
  },
];

// Hindi/Bengali script toggle for 28 Names (default: Bengali)
let _n28ScriptHindi = false;
function toggle28Script() {
  _n28ScriptHindi = !_n28ScriptHindi;
  const btn = document.getElementById("n28ScriptToggle");
  if (btn) btn.textContent = _n28ScriptHindi ? "বাংলা" : "हिन्दी";
  u28();
}
function get28Name(entry) {
  return _n28ScriptHindi && entry.nameHindi ? entry.nameHindi : entry.name;
}

function get28Pos() {
  return (App.S.h28[App.S.tk] || 0) % 28;
}

function render28Dots(pos) {
  const pg = document.getElementById("n28prog");
  if (!pg) return;
  pg.innerHTML = "";
  for (let i = 0; i < 28; i++) {
    const d = document.createElement("div");
    d.className = "n28dot" + (i < pos ? " done" : i === pos ? " current" : "");
    pg.appendChild(d);
  }
}

// ── 28 Names Daily Target helpers ──
function sync28CycleTarget() {
  const v = parseInt(document.getElementById("dt28CycleIn")?.value) || 0;
  const el = document.getElementById("dt28JapDisp");
  if (el) el.textContent = v * 28;
}
function svt28() {
  const v = parseInt(document.getElementById("dt28CycleIn")?.value) || 0;
  App.S.dt28Cycles = v;
  App.save();
  // Push immediately (not debounced) so the value reaches Firebase before
  // the realtime listener can fire back with a stale dt28Cycles value.
  if (typeof fbPushFull === "function" && App._cloudHydrated) {
    fbPushFull().catch(e => console.warn("svt28 push:", e && e.message));
  } else if (typeof fbDebouncedPush === "function") {
    fbDebouncedPush();
  }
  App.ua();
  u28();
  toast("✅ 28 Names daily target saved: " + v + " cycle" + (v !== 1 ? "s" : "") + " (" + (v * 28) + " japs/day)");
}
function _update28ProgressBar(todJaps) {
  const targetCycles = App.S.dt28Cycles || 0;
  const target = targetCycles * 28;
  const wrap = document.getElementById("n28ProgressWrap");
  const bar  = document.getElementById("n28ProgressBar");
  const lbl  = document.getElementById("n28ProgressLabel");
  if (!wrap) return;
  // Always show the bottom bar (it holds the unified Today's Jap Time + cycles label).
  wrap.style.display = "flex";
  const todCycles = Math.floor(todJaps / 28);
  const inCycle = todJaps % 28;
  if (target) {
    const pct = Math.min(100, Math.round((todJaps / target) * 100));
    if (bar) {
      bar.style.width = pct + "%";
      bar.style.background = pct >= 100
        ? "linear-gradient(90deg,rgba(46,204,113,0.8),rgba(0,200,100,0.95))"
        : "linear-gradient(90deg,rgba(189,147,249,0.8),rgba(150,80,255,0.9))";
      bar.style.boxShadow = pct >= 100 ? "0 0 10px rgba(46,204,113,0.6)" : "0 0 8px rgba(189,147,249,0.5)";
    }
  } else {
    // No daily target set — show current cycle progress (full bar when a cycle just completed).
    const num = inCycle === 0 && todCycles > 0 ? 28 : inCycle;
    const pct = Math.round((num / 28) * 100);
    if (bar) {
      bar.style.width = pct + "%";
      bar.style.background = "linear-gradient(90deg,rgba(189,147,249,0.8),rgba(150,80,255,0.9))";
      bar.style.boxShadow = "0 0 8px rgba(189,147,249,0.5)";
    }
  }

  // Always render label as "{cycles} cycles · {N}/28"
  if (lbl) lbl.textContent = todCycles + " cycle" + (todCycles === 1 ? "" : "s") + " · " + inCycle + "/28";
}

function u28() {
  const tod = App.S.h28[App.S.tk] || 0;
  const tot = Object.values(App.S.h28).reduce((a, b) => a + b, 0);
  const cycles28 = Math.floor(tot / 28);
  const todEl = document.getElementById("n28t");
  if (todEl) todEl.textContent = tod;
  _update28ProgressBar(tod);
  const pos = get28Pos(),
    entry = NAMES28[pos];
  const nameEl = document.getElementById("n28name");
  const meanEl = document.getElementById("n28meaning"),
    cycEl = document.getElementById("n28cycle");
  const isCompleting = !!App._n28CompletionAnimating;
  if (nameEl) {
    if (isCompleting) {
      nameEl.style.animation = "none";
      nameEl.textContent = "";
      if (meanEl) meanEl.textContent = "";
    } else {
      const newName = get28Name(entry);
      const oldName = nameEl.textContent;

      // Force full container width on nameEl every update — fixes WebKit flex bug
      // where long names overflow right due to GPU layer width being locked
      const _tz = nameEl.parentNode;
      if (_tz) {
        const _w = _tz.getBoundingClientRect().width;
        if (_w > 0) {
          nameEl.style.width = _w + "px";
          nameEl.style.maxWidth = _w + "px";
          nameEl.style.left = "0px";
          nameEl.style.position = "relative";
        }
      }

      if (oldName && oldName !== newName && !window.__bbTakeover28) {
        // Ghost clone removed — coin pod carries the old name visually.
        // New name appears immediately with a quick pop-in.
        nameEl.style.animation = "none";
        nameEl.offsetHeight;
        nameEl.textContent = newName;
        nameEl.style.animation = "nameIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards";
        if (meanEl) {
          meanEl.style.transition = "opacity 0.25s";
          meanEl.textContent = entry.meaning;
          meanEl.style.opacity = "0.85";
        }
      } else {
        nameEl.style.animation = "none";
        nameEl.offsetHeight;
        nameEl.style.animation = "nameIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards";
        nameEl.textContent = newName;
        if (meanEl) meanEl.textContent = entry.meaning;
      }
    }
  }
  if (meanEl && !isCompleting) { /* handled above */ }
  const cc = Math.floor(tod / 28);
  if (cycEl) {
    cycEl.textContent =
      tod === 0
        ? "Tap to begin · Cycle 1"
        : pos === 0 && tod > 0
          ? "✨ Cycle " + (cc + 1) + " begins!"
          : "Cycle " + (cc + 1) + " · " + pos + "/28 done";
  }
  render28Dots(pos);
  renderSankalpas();
  // Always mirror the unified Today's Jap Time
  if (typeof App.updateTimerToday === "function") App.updateTimerToday();

  App._upd28PauseBtn();
  refresh28StatsIfOpen();
}

function spawnName28(e, nameText) {
  const zone = document.getElementById("tz28");
  const r = zone.getBoundingClientRect();
  let x, y;
  if (e.touches && e.touches[0]) {
    x = e.touches[0].clientX - r.left;
    y = e.touches[0].clientY - r.top;
  } else {
    x = e.clientX - r.left;
    y = e.clientY - r.top;
  }
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;font-family:serif;pointer-events:none;z-index:10;font-size:" +
    (22 + Math.random() * 16).toFixed(0) +
    "px;color:rgba(255,215,0,0.65);text-shadow:0 0 8px rgba(255,215,0,0.5);left:" +
    (x - 40) +
    "px;top:" +
    (y - 10) +
    "px;animation:fu28 1.8s ease-out forwards;white-space:nowrap";
  el.textContent = nameText;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function cycleDone28() {
  // Capture cycle time before resetting
  const cycleTimeSec = App._n28CycleStart
    ? Math.floor((Date.now() - App._n28CycleStart) / 1000)
    : 0;
  const cycleNum = Math.floor((App.S.h28[App.S.tk] || 0) / 28);
  const cycleStartTs = App._n28CycleStart
    ? App._n28CycleStart
    : Date.now() - cycleTimeSec * 1000;
  logActivity({
    t: "28cycle",
    ts: Date.now(),
    startTs: cycleStartTs,
    n: cycleNum,
    sec: cycleTimeSec,
  });
  const fmtCyc = (s) => {
    s = Math.round(s);
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sc = s % 60;
    if (h > 0) return h + "h " + m + "m " + String(sc).padStart(2, "0") + "s";
    if (m > 0) return m + "m " + String(sc).padStart(2, "0") + "s";
    return sc + "s";
  };
  App._n28CompletionAnimating = true;
  clearTimeout(App._n28CompletionTimer);

  App.resetCycleTimer28();

  // ── Cycle completion: whole tap zone glows ──
  const tz28El = document.getElementById("tz28");
  if (tz28El) {
    tz28El.classList.remove("rc-cycle-glow");
    void tz28El.offsetWidth;
    tz28El.classList.add("rc-cycle-glow");
    setTimeout(() => tz28El.classList.remove("rc-cycle-glow"), 3200);
  }

  // ── Cycle completion: Panchajanya Shankha MP3 ──
  try { playShankya(); } catch(e) {}

  // Show Radha Vallabh / Sri Harivangsa animation
  const mf28 = document.getElementById("mf28");
  if (mf28) mf28.classList.add("show");
  App._n28CompletionTimer = setTimeout(() => {
    if (mf28) mf28.classList.remove("show");
    App._n28CompletionAnimating = false;
    App._n28CompletionTimer = null;
    u28();
  }, 3000);

  // Show cycle time floating animation
  if (cycleTimeSec > 0) {
    const te = document.getElementById("n28CycleTimer");
    if (te) {
      const rect = te.getBoundingClientRect();
      const el = document.createElement("div");
      el.className = "mala-time-float";
      el.textContent = "📿 " + fmtCyc(cycleTimeSec);
      el.style.fontSize = "20px";
      el.style.left = rect.left + rect.width / 2 - 40 + "px";
      el.style.top = rect.top - 4 + "px";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2100);
    }
  }

  // Stop total timer, reset cycle timer to zero
  App.flush28TimeToHistory();
  clearInterval(App._n28TimerInterval);
  App._n28TimerInterval = null;
  clearTimeout(App._n28AutoPauseTimeout);
  App._n28AutoPauseTimeout = null;
  App._n28CycleStart = null;
  App._n28TotalStart = null;
  App._n28SavedSecs = 0;
  App._n28Paused = false;
  App._n28PausedCycleSec = 0;
  App._n28PausedTotalSec = 0;
  const ce = document.getElementById("n28CycleTimer");
  if (ce) ce.textContent = "0:00";
  // Show unified Jap timer (same as main Jap tab)
  const teDisp = document.getElementById("n28TotalTimer");
  if (teDisp) teDisp.textContent = App.fmtTime(App.timerSeconds);
  App._upd28PauseBtn();

  const zone = document.getElementById("tz28");
  zone.style.background =
    "radial-gradient(ellipse at center,rgba(255,215,0,0.25) 0%,rgba(6,13,31,0.6) 100%)";
  setTimeout(() => (zone.style.background = ""), 600);
  const active = getActiveSankalp();
  let fulfilled = false;
  if (active && active.startCycles !== null) {
    const prog =
      (active._savedProgress || 0) +
      Math.max(0, getTotalCycles28() - active.startCycles);
    if (prog >= active.target) {
      active.done = true;
      active.doneDate = App.S.tk;
      fulfilled = true;
      activateNextSankalp();
    }
  }
  if (fulfilled) {
    App.save();
    fbDebouncedPush();
    renderSankalpas();
    toast("🌟 Sankalp fulfilled! Jai Radhe Radhe! 🙏");
  } else {
    toast("🌸 Cycle complete! राधे राधे 🙏");
  }
  if ((window.App && window.App.S && window.App.S.cfg && window.App.S.cfg.vib) && navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 200]);
}

// ── Sankalp ──
function getTotalCycles28() {
  return Math.floor(Object.values(App.S.h28).reduce((a, b) => a + b, 0) / 28);
}
function getActiveSankalp() {
  return (App.S.sankalpas || []).find((s) => !s.done) || null;
}
function activateNextSankalp() {
  const next = (App.S.sankalpas || []).find((s) => !s.done);
  if (next && next.startCycles === null) {
    next.startCycles = getTotalCycles28();
  }
}
function getSankalpProgress(sk) {
  const saved = sk._savedProgress || 0;
  const active = getActiveSankalp();
  if (active && active.id === sk.id) {
    if (sk.startCycles === null) return saved;
    return Math.min(
      saved + Math.max(0, getTotalCycles28() - sk.startCycles),
      sk.target,
    );
  }
  return saved > 0 ? saved : -1;
}

function addSankalp() {
  const wish = (document.getElementById("skWish").value || "").trim();
  const target = parseInt(document.getElementById("skTarget").value) || 0;
  if (!wish) {
    toast("ইচ্ছা লিখুন 🙏");
    return;
  }
  if (target < 1) {
    toast("Please enter target cycles");
    return;
  }
  const hasActive = (App.S.sankalpas || []).some((s) => !s.done);
  const sk = {
    id: "sk_" + Date.now(),
    wish,
    target,
    startDate: App.S.tk,
    startCycles: hasActive ? null : getTotalCycles28(),
    done: false,
    doneDate: null,
    _savedProgress: 0,
  };
  App.S.sankalpas.push(sk);
  document.getElementById("skWish").value = "";
  document.getElementById("skTarget").value = "";
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  toast(
    hasActive ? "Queued after current wish 🌸" : "Sankalp added! 🌸 Jai Radhe!",
  );
}

// ── Prioritize: move wish to front, activate immediately ──
function prioritizeSankalp(id) {
  const all = App.S.sankalpas || [];
  const idx = all.findIndex((s) => s.id === id);
  if (idx <= 0) return;
  const sk = all.splice(idx, 1)[0];
  // Pause current active — reset its startCycles so progress is preserved
  const prevActive = all.find((s) => !s.done);
  if (prevActive && prevActive.startCycles !== null) {
    const liveProgress = Math.max(
      0,
      getTotalCycles28() - prevActive.startCycles,
    );
    prevActive._savedProgress = (prevActive._savedProgress || 0) + liveProgress;
    prevActive.startCycles = null;
  }
  sk.startCycles = getTotalCycles28();
  all.unshift(sk);
  App.S.sankalpas = all;
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  toast("⬆ Wish moved to front! 🌸 Jai Radhe!");
}

function getSankalpProgressById(id, list) {
  const sk = (list || App.S.sankalpas || []).find((s) => s.id === id);
  if (!sk) return 0;
  const saved = sk._savedProgress || 0;
  if (sk.startCycles === null) return saved;
  return Math.min(
    saved + Math.max(0, getTotalCycles28() - sk.startCycles),
    sk.target,
  );
}

// ── Edit target: update cycle count for a wish ──
function editSankalpTarget(id) {
  const sk = (App.S.sankalpas || []).find((s) => s.id === id);
  if (!sk) return;
  const el = document.getElementById("sk-edit-" + id);
  if (!el) return;
  const newTarget = parseInt(el.value) || 0;
  if (newTarget < 1) {
    toast("Target must be at least 1");
    return;
  }
  const prog = getSankalpProgressById(id, null);
  if (newTarget < prog) {
    toast("Target cannot be less than current progress (" + prog + ")");
    return;
  }
  sk.target = newTarget;
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  toast("Target updated to " + newTarget + " cycles 🙏");
}

function adjustSankalpCycles(id, sign) {
  const sk = (App.S.sankalpas || []).find((s) => s.id === id);
  if (!sk) return;
  const el = document.getElementById("sk-adj-" + id);
  if (!el) return;
  const amt = parseInt(el.value) || 0;
  if (amt < 1) {
    toast("Enter a valid number");
    return;
  }

  const activeWish = getActiveSankalp();
  const editingActiveWish = !!activeWish && activeWish.id === id;
  const activeLiveBefore =
    !editingActiveWish && activeWish && activeWish.startCycles !== null
      ? Math.max(0, getTotalCycles28() - activeWish.startCycles)
      : null;

  // ── STEP 1: Freeze this wish's live progress into _savedProgress ──
  // This rebases startCycles so the upcoming h28 change doesn't
  // cause a double-count or under-count on the wish bar.
  if (sk.startCycles !== null) {
    const live = Math.max(0, getTotalCycles28() - sk.startCycles);
    sk._savedProgress = (sk._savedProgress || 0) + live;
    sk.startCycles = getTotalCycles28(); // will be updated again below after h28 changes
  }

  if (sign === "add") {
    // Write to h28 → shows in All Time cycles and Stats panel automatically
    if (!App.S.h28) App.S.h28 = {};
    if (!App.S.h28[App.S.tk]) App.S.h28[App.S.tk] = 0;
    App.S.h28[App.S.tk] += amt * 28;
    App.lm28 = Math.floor(App.S.h28[App.S.tk] / (App.S.ms || 108));
    // Credit this wish's progress bar for exactly amt cycles
    sk._savedProgress = (sk._savedProgress || 0) + amt;
    // Rebase startCycles to new total so live taps don't re-add these cycles
    if (sk.startCycles !== null) sk.startCycles = getTotalCycles28();
  } else {
    const totalProg = getSankalpProgressById(id, null);
    if (amt > totalProg) {
      toast("Cannot deduct more than current progress (" + totalProg + ")");
      return;
    }
    // Deduct from h28 → Stats and All Time go down
    if (!App.S.h28[App.S.tk]) App.S.h28[App.S.tk] = 0;
    App.S.h28[App.S.tk] = Math.max(0, App.S.h28[App.S.tk] - amt * 28);
    App.lm28 = Math.floor(App.S.h28[App.S.tk] / (App.S.ms || 108));
    // Remove from this wish's progress bar for exactly amt cycles
    sk._savedProgress = Math.max(0, (sk._savedProgress || 0) - amt);
    // Rebase startCycles so live taps don't re-add the deducted amount
    if (sk.startCycles !== null) sk.startCycles = getTotalCycles28();
  }

  // Rebase the ACTIVE wish's startCycles too (if different from target)
  // so it doesn't absorb the h28 change as phantom live progress
  if (
    !editingActiveWish &&
    activeWish &&
    activeWish.startCycles !== null &&
    activeLiveBefore !== null
  ) {
    activeWish.startCycles = Math.max(0, getTotalCycles28() - activeLiveBefore);
  }

  el.value = "";
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  render28StatsPanel();
  u28();
  toast((sign === "add" ? "Added " : "Deducted ") + amt + " cycle(s) 🙏");
  const totalProg2 = getSankalpProgressById(id, null);
  if (!sk.done && totalProg2 >= sk.target) {
    sk.done = true;
    sk.doneDate = App.S.tk;
    activateNextSankalp();
    App.save();
    fbDebouncedPush();
    renderSankalpas();
    toast("🌟 Sankalp fulfilled! 🙏");
  }
}

function renderSankalpas() {
  const el = document.getElementById("skList");
  if (!el) return;
  const all = App.S.sankalpas || [];
  if (!all.length) {
    el.innerHTML = '<div class="sk-empty">No sankalpa yet 🌸</div>';
    return;
  }
  const nonDone = all.filter((s) => !s.done),
    done = all.filter((s) => s.done);
  let html = "";
  nonDone.forEach((sk, idx) => {
    const activeSk = getActiveSankalp();
    const isActive = activeSk && activeSk.id === sk.id;
    const prog = getSankalpProgressById(sk.id, null);
    if (isActive) {
      const pct = Math.round((prog / sk.target) * 100);
      html +=
        '<div class="sk-item" style="border-color:rgba(232,51,109,0.55);background:rgba(232,51,109,0.07)">' +
        '<div style="font-size:9px;color:var(--rose);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px">▶ CURRENT WISH</div>' +
        '<div class="sk-wish">' +
        escHtml(sk.wish) +
        "</div>" +
        '<div class="sk-meta">Started ' +
        sk.startDate +
        ' · Target: <strong style="color:var(--tl)">' +
        sk.target +
        "</strong> cycles</div>" +
        '<div class="sk-bar-wrap"><div class="sk-bar' +
        (pct >= 100 ? " full" : "") +
        '" style="width:' +
        Math.min(pct, 100) +
        '%"></div></div>' +
        '<div class="sk-prog-text">' +
        prog +
        " / " +
        sk.target +
        " cycles (" +
        pct +
        "%)</div>" +
        // Edit target row
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;padding:7px 9px;background:rgba(255,255,255,0.04);border-radius:8px">' +
        '<span style="font-size:11px;color:var(--td);flex:1">✏ Change target:</span>' +
        '<input id="sk-edit-' +
        sk.id +
        '" type="number" min="' +
        Math.max(1, prog) +
        '" value="' +
        sk.target +
        '" style="width:64px;background:rgba(0,0,0,0.35);border:1px solid rgba(232,51,109,0.3);border-radius:7px;padding:5px 8px;color:var(--tl);font-size:13px;text-align:center;font-family:Inter,sans-serif">' +
        '<button class="sk-btn grn" onclick="editSankalpTarget(\'' +
        sk.id +
        "')\">Save</button>" +
        "</div>" +
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;padding:7px 9px;background:rgba(255,255,255,0.04);border-radius:8px">' +
        '<span style="font-size:11px;color:var(--td);flex:1">🔄 Adjust cycles:</span>' +
        '<input id="sk-adj-' +
        sk.id +
        '" type="number" min="1" placeholder="0" style="width:54px;background:rgba(0,0,0,0.35);border:1px solid rgba(232,51,109,0.3);border-radius:7px;padding:5px 8px;color:var(--tl);font-size:13px;text-align:center;font-family:Inter,sans-serif">' +
        '<button class="sk-btn" style="color:#4f4;border-color:rgba(0,255,0,0.3);font-size:11px" onclick="adjustSankalpCycles(\'' +
        sk.id +
        "','add')\">＋</button>" +
        '<button class="sk-btn" style="color:#f55;border-color:rgba(255,68,68,0.3);font-size:11px" onclick="adjustSankalpCycles(\'' +
        sk.id +
        "','deduct')\">－</button>" +
        "</div>" +
        '<div class="sk-btns"><button class="sk-btn grn" onclick="fulfillSankalp(\'' +
        sk.id +
        "')\">✓ Fulfilled</button>" +
        '<button class="sk-btn grey" style="color:#f55;border-color:rgba(255,68,68,0.45)" onclick="deleteSankalp(\'' +
        sk.id +
        "')\">✕ Delete Wish</button></div>" +
        "</div>";
    } else {
      const qProg = sk._savedProgress || 0;
      const qPct = sk.target > 0 ? Math.round((qProg / sk.target) * 100) : 0;
      html +=
        '<div class="sk-item" style="opacity:0.85">' +
        '<div style="font-size:9px;color:var(--td);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px">⏳ QUEUED #' +
        (idx + 1) +
        "</div>" +
        '<div class="sk-wish" style="color:var(--tl)">' +
        escHtml(sk.wish) +
        "</div>" +
        '<div class="sk-meta">Target: <strong style="color:var(--tl)">' +
        sk.target +
        "</strong> cycles</div>" +
        (qProg > 0
          ? '<div class="sk-bar-wrap"><div class="sk-bar" style="width:' +
            Math.min(qPct, 100) +
            '%"></div></div><div class="sk-prog-text">' +
            qProg +
            " / " +
            sk.target +
            " cycles (" +
            qPct +
            "%) — paused</div>"
          : "") +
        // Edit target row for queued
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;padding:7px 9px;background:rgba(255,255,255,0.03);border-radius:8px">' +
        '<span style="font-size:11px;color:var(--td);flex:1">✏ Change target:</span>' +
        '<input id="sk-edit-' +
        sk.id +
        '" type="number" min="1" value="' +
        sk.target +
        '" style="width:64px;background:rgba(0,0,0,0.35);border:1px solid rgba(74,144,226,0.25);border-radius:7px;padding:5px 8px;color:var(--tl);font-size:13px;text-align:center;font-family:Inter,sans-serif">' +
        '<button class="sk-btn grn" onclick="editSankalpTarget(\'' +
        sk.id +
        "')\">Save</button>" +
        "</div>" +
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;padding:7px 9px;background:rgba(255,255,255,0.04);border-radius:8px">' +
        '<span style="font-size:11px;color:var(--td);flex:1">🔄 Adjust cycles:</span>' +
        '<input id="sk-adj-' +
        sk.id +
        '" type="number" min="1" placeholder="0" style="width:54px;background:rgba(0,0,0,0.35);border:1px solid rgba(74,144,226,0.25);border-radius:7px;padding:5px 8px;color:var(--tl);font-size:13px;text-align:center;font-family:Inter,sans-serif">' +
        '<button class="sk-btn" style="color:#4f4;border-color:rgba(0,255,0,0.3);font-size:11px" onclick="adjustSankalpCycles(\'' +
        sk.id +
        "','add')\">＋</button>" +
        '<button class="sk-btn" style="color:#f55;border-color:rgba(255,68,68,0.3);font-size:11px" onclick="adjustSankalpCycles(\'' +
        sk.id +
        "','deduct')\">－</button>" +
        "</div>" +
        '<div class="sk-btns">' +
        (idx > 0
          ? '<button class="sk-btn" style="color:var(--a2);border-color:rgba(74,144,226,0.4)" onclick="prioritizeSankalp(\'' +
            sk.id +
            "')\">⬆ Prioritize</button>"
          : "") +
        '<button class="sk-btn grey" style="color:#f55;border-color:rgba(255,68,68,0.45)" onclick="deleteSankalp(\'' +
        sk.id +
        "')\">✕ Delete Wish</button></div>" +
        "</div>";
    }
  });
  if (done.length) {
    html += '<div class="sk-divider">✨ Fulfilled Sankalpas ✨</div>';
    done.forEach((sk) => {
      html +=
        '<div class="sk-item done">' +
        '<div class="sk-done-badge">✓ Fulfilled · ' +
        sk.doneDate +
        "</div>" +
        '<div class="sk-wish" style="color:var(--td)">' +
        escHtml(sk.wish) +
        "</div>" +
        '<div class="sk-btns"><button class="sk-btn grey" onclick="deleteSankalp(\'' +
        sk.id +
        "')\">✕ Remove</button></div>" +
        "</div>";
    });
  }
  el.innerHTML = html;
}

function fulfillSankalp(id) {
  const sk = (App.S.sankalpas || []).find((s) => s.id === id);
  if (!sk) return;
  sk.done = true;
  sk.doneDate = App.S.tk;
  activateNextSankalp();
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  toast("🌸 Sankalp fulfilled! Jai Radhe!");
}
function deleteSankalp(id) {
  const wasActive = getActiveSankalp() && getActiveSankalp().id === id;
  App.S.sankalpas = (App.S.sankalpas || []).filter((s) => s.id !== id);
  if (wasActive) activateNextSankalp();
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  toast("Removed.");
}
function toggleSankalp() {
  const c = document.getElementById("skCollapse"),
    v = document.getElementById("skChevron");
  const open = c.classList.toggle("open");
  if (v) v.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
  if (open) renderSankalpas();
}

// ═══════════════════════════════════════════════════════
// 28 NAMES STATS PANEL
// ═══════════════════════════════════════════════════════
function toggle28Stats() {
  const panel = document.getElementById("n28StatsPanel");
  const chev = document.getElementById("n28StatsChev");
  const open = panel.style.display === "block";
  panel.style.display = open ? "none" : "block";
  if (chev) chev.style.transform = open ? "rotate(0deg)" : "rotate(180deg)";
  if (!open) render28StatsPanel();
}

// Called from u28() to keep stats panel live when open
function refresh28StatsIfOpen() {
  const panel = document.getElementById("n28StatsPanel");
  if (panel && panel.style.display === "block") render28StatsPanel();
}

function fmt28Short(s) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  if (h > 0) return h + "h " + m + ":" + String(sec).padStart(2, "0");
  return m + ":" + String(sec).padStart(2, "0");
}

function render28StatsPanel() {
  const tk = App.S.tk;
  // Cycle counts — read directly from h28
  const todCycles = Math.floor((App.S.h28[tk] || 0) / 28);
  const allCycles = getTotalCycles28();
  const e1 = document.getElementById("sp28CyclesTod"),
    e2 = document.getElementById("sp28CyclesAll");
  if (e1) e1.textContent = todCycles;
  if (e2) e2.textContent = allCycles;
  // Time — include live running session (not yet flushed)
  const savedTod = App.S.timer28History[tk] || 0;
  const liveExtra =
    App._n28TotalStart && !App._n28Paused
      ? Math.max(
          0,
          Math.floor((Date.now() - App._n28TotalStart) / 1000) -
            (App._n28SavedSecs || 0),
        )
      : 0;
  const todTime = savedTod + liveExtra;
  const allTime =
    Object.values(App.S.timer28History).reduce((a, b) => a + b, 0) + liveExtra;
  const et = document.getElementById("sp28TimeTod"),
    ea = document.getElementById("sp28TimeAll");
  if (et) et.textContent = fmt28Short(todTime);
  if (ea) ea.textContent = fmt28Short(allTime);
}

// Add/deduct cycles (1 cycle = 28 taps)
// Live preview helpers
function prev28Cycles(val) {
  const n = parseInt(val) || 0;
  const el = document.getElementById("sp28CyclePreview");
  if (!el) return;
  el.textContent = n > 0 ? "= " + n * 28 + " taps" : "";
}

function prev28Time() {
  const m = parseInt(document.getElementById("sp28TimeMin")?.value) || 0;
  const s = parseInt(document.getElementById("sp28TimeSec")?.value) || 0;
  const el = document.getElementById("sp28TimePreview");
  if (!el) return;
  el.textContent = m > 0 || s > 0 ? m + "m " + s + "s" : "";
}

function adj28Cycles(sign) {
  const n = parseInt(document.getElementById("sp28CycleVal").value) || 0;
  if (n < 1) {
    toast("Enter number of cycles");
    return;
  }
  const taps = n * 28;
  const tk = App.S.tk;

  // ── Freeze ALL active wishes before touching h28 ──
  // Each wish's live progress = _savedProgress + (getTotalCycles28() - startCycles).
  // If we change h28 without freezing, every wish bar drifts by the same amount.
  // So we bake the live portion into _savedProgress first, then rebase after.
  (App.S.sankalpas || [])
    .filter((s) => !s.done && s.startCycles !== null)
    .forEach((s) => {
      s._savedProgress =
        (s._savedProgress || 0) +
        Math.max(0, getTotalCycles28() - s.startCycles);
      s.startCycles = getTotalCycles28();
    });

  if (sign > 0) {
    App.S.h28[tk] = (App.S.h28[tk] || 0) + taps;
    App.lm28 = Math.floor(App.S.h28[tk] / (App.S.ms || 108));
    // Rebase all active wishes to the new global total — their bars stay put
    (App.S.sankalpas || [])
      .filter((s) => !s.done && s.startCycles !== null)
      .forEach((s) => {
        s.startCycles = getTotalCycles28();
      });
    // Check fulfillment for active wish
    const active = getActiveSankalp();
    if (active) {
      const prog = getSankalpProgressById(active.id, null);
      if (prog >= active.target) {
        active.done = true;
        active.doneDate = tk;
        activateNextSankalp();
        renderSankalpas();
        toast("🌟 Sankalp fulfilled! 🙏");
      }
    }
  } else {
    const cur = App.S.h28[tk] || 0;
    if (taps > cur) {
      toast("Cannot deduct more than today's count");
      return;
    }
    App.S.h28[tk] = cur - taps;
    App.lm28 = Math.floor(App.S.h28[tk] / (App.S.ms || 108));
    // Rebase all active wishes to the new (lower) global total — bars stay put
    (App.S.sankalpas || [])
      .filter((s) => !s.done && s.startCycles !== null)
      .forEach((s) => {
        s.startCycles = getTotalCycles28();
      });
  }

  document.getElementById("sp28CycleVal").value = "";
  const pr = document.getElementById("sp28CyclePreview");
  if (pr) pr.textContent = "";
  render28StatsPanel();
  u28();
  uStats();
  renderSankalpas();
  App.save();
  fbDebouncedPush();
  toast(
    (sign > 0 ? "Added " : "Deducted ") +
      n +
      " cycle" +
      (n > 1 ? "s" : "") +
      " 🙏",
  );
}

// Add/deduct time (minutes + seconds)
function adj28Time(sign) {
  const m = parseInt(document.getElementById("sp28TimeMin").value) || 0;
  const s = parseInt(document.getElementById("sp28TimeSec").value) || 0;
  const secs = m * 60 + Math.min(59, Math.max(0, s));
  if (secs < 1) {
    toast("Enter time to adjust");
    return;
  }
  const tk = App.S.tk;
  if (sign > 0) {
    App.S.timer28History[tk] = (App.S.timer28History[tk] || 0) + secs;
  } else {
    const cur = App.S.timer28History[tk] || 0;
    if (secs > cur) {
      toast("Cannot deduct more than today's 28 Names time");
      return;
    }
    App.S.timer28History[tk] = cur - secs;
  }
  // Clear inputs and preview instantly
  document.getElementById("sp28TimeMin").value = "";
  document.getElementById("sp28TimeSec").value = "";
  const pv = document.getElementById("sp28TimePreview");
  if (pv) pv.textContent = "";
  // Update all displays immediately
  render28StatsPanel();
  uStats();
  // Save and sync in background
  App.save();
  fbDebouncedPush();
  toast((sign > 0 ? "Added " : "Deducted ") + m + "m " + s + "s 🙏");
}

// Reset 28 Names time
function reset28Time(scope) {
  if (scope === "today") {
    App.S.timer28History[App.S.tk] = 0;
    if (App._n28TotalStart || App._n28Paused) App.stopAll28Timers();
    toast("Today's 28 Names time reset 🙏");
  } else {
    App.S.timer28History = {};
    App.stopAll28Timers();
    toast("All 28 Names time reset 🙏");
  }
  // Update displays immediately
  render28StatsPanel();
  uStats();
  // Save and sync in background
  App.save();
  fbDebouncedPush();
}

// ── STOTRAM LIST & LYRICS are now in stotram.js ──
// Make sure to include stotram.js before app.js in your HTML

function renderSt() {
  const list = document.getElementById("stList");
  list.innerHTML = "";

  // Inject premium glow animations once
  if (!document.getElementById('st-card-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'st-card-styles';
    styleEl.textContent = [
      '@keyframes stCardGlow{0%,100%{box-shadow:0 0 7px 1px var(--sgc,#ffd700),0 2px 18px rgba(0,0,0,0.55);border-color:rgba(255,215,0,0.30)}50%{box-shadow:0 0 22px 5px var(--sgc,#ffd700),0 2px 24px rgba(0,0,0,0.65);border-color:rgba(255,215,0,0.72)}}',
      '@keyframes stColorCycle{0%{--sgc:#ffd700}20%{--sgc:#ff9d00}40%{--sgc:#ff6bff}60%{--sgc:#00e5ff}80%{--sgc:#7dff6b}100%{--sgc:#ffd700}}',
      '@keyframes stNameShimmer{0%,100%{background-position:-200% center}100%{background-position:200% center}}',
      '@keyframes stFadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes stCountPop{0%{transform:scale(1)}40%{transform:scale(1.22);color:#fff}100%{transform:scale(1)}}',
      '.st-card{animation:stCardGlow var(--spd,3.2s) ease-in-out infinite,stColorCycle var(--scd,10s) ease-in-out infinite,stFadeUp 0.45s ease both;animation-delay:var(--sad,0s),var(--sod,0s),var(--sfd,0s);background:rgba(0,0,0,0.48);border:1px solid rgba(255,215,0,0.30);border-radius:16px;padding:16px 16px 14px;margin-bottom:12px;box-sizing:border-box;transition:transform 0.15s;-webkit-tap-highlight-color:transparent}',
      '.st-card:active{transform:scale(0.985)}',
      '.st-name{background:linear-gradient(90deg,#ffd700 0%,#fff8dc 30%,#ffaa00 50%,#fff8dc 70%,#ffd700 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:stNameShimmer 3.5s linear infinite;font-family:"Hind Siliguri",serif;font-size:17px;font-weight:700;line-height:1.3}',
      '.st-sub{font-family:"Hind Siliguri",serif;font-size:12px;color:rgba(255,215,0,0.45);margin-top:3px;letter-spacing:0.3px}',
      '.st-count{font-size:40px;font-weight:700;color:#ffd700;line-height:1;font-family:"Inter",sans-serif;text-shadow:0 0 12px rgba(255,215,0,0.5)}',
      '.st-count.pop{animation:stCountPop 0.3s ease}',
      '.st-meta{font-size:11px;color:rgba(255,215,0,0.42);margin-top:4px;letter-spacing:0.3px}',
      '.st-meta strong{color:rgba(255,215,0,0.80)}',
      '.st-row{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:8px}',
      '.st-btns{display:flex;gap:8px}',
      '.st-btn{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,215,0,0.30);background:rgba(255,215,0,0.08);color:#ffd700;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,box-shadow 0.15s;-webkit-tap-highlight-color:transparent}',
      '.st-btn:active{background:rgba(255,215,0,0.22);box-shadow:0 0 10px 2px rgba(255,215,0,0.4)}',
      '.st-btn.read{font-size:18px}',
      '.st-edit-btn{font-size:13px;width:32px;height:32px;border-radius:8px;border:1px solid rgba(74,144,226,0.35);background:rgba(74,144,226,0.10);color:#7ab8ff;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    ].join('');
    document.head.appendChild(styleEl);
  }

  const all = [
    ...STLIST,
    ...(App.S.customSt || []).map((x) => ({ ...x, custom: true })),
  ];

  const glowColors = ['#ffd700','#ffaa00','#ff6bff','#00e5ff','#7dff6b','#ff6b6b','#b388ff','#00ffcc','#ffd700','#ff9d00'];

  all.forEach((st, idx) => {
    const tc = (App.S.stotrams[st.id] || {})[App.S.tk] || 0;
    const tot = Object.values(App.S.stotrams[st.id] || {}).reduce((a,b)=>a+b, 0);
    const effLyrics = getEffectiveLyrics(st.id);
    const hasLyrics = !!(effLyrics && effLyrics.trim().length > 0);

    const gc = glowColors[idx % glowColors.length];
    const pulseDur = (2.8 + (idx % 5) * 0.45).toFixed(1) + 's';
    const colorDur = (9 + (idx % 4) * 1.5).toFixed(1) + 's';
    const fadeDelay = (idx * 0.055).toFixed(2) + 's';
    const colorOff = '-' + (idx * 0.7).toFixed(1) + 's';

    const c = document.createElement("div");
    c.className = "st-card";
    c.style.cssText = '--sgc:' + gc + ';--spd:' + pulseDur + ';--scd:' + colorDur + ';--sad:' + fadeDelay + ';--sod:' + colorOff + ';--sfd:' + fadeDelay + ';';

    const globalTag = st.global
      ? '<span style="font-size:9px;color:#ffd700;border:1px solid rgba(255,215,0,0.35);border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle;letter-spacing:0.5px">🌍 GLOBAL</span>'
      : '';

    let headerRight = '';
    if (st.custom) {
      headerRight = '<div style="display:flex;gap:5px;flex-shrink:0">' +
        '<button class="st-edit-btn" onclick="toggleStEdit(\'' + st.id + '\')">✏</button>' +
        '<button class="st-edit-btn" style="border-color:rgba(255,80,80,0.35);color:#ff8888;background:rgba(255,80,80,0.08)" onclick="delSt(\'' + st.id + '\')">✕</button>' +
        '</div>';
    }

    let inner =
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="st-name">' + escHtml(st.name) + globalTag + '</div>' +
          (st.sub ? '<div class="st-sub">' + escHtml(st.sub) + '</div>' : '') +
        '</div>' +
        headerRight +
      '</div>' +
      '<div class="st-row">' +
        '<div>' +
          '<div class="st-count" id="sc' + st.id + '">' + tc + '</div>' +
          '<div class="st-meta">Today · Total: <strong>' + tot + '</strong></div>' +
        '</div>' +
        '<div class="st-btns">' +
          '<button class="st-btn" onclick="adjSt(\'' + st.id + '\',-1)">−</button>' +
          '<button class="st-btn" onclick="adjSt(\'' + st.id + '\',1)">+</button>' +
          (hasLyrics ? '<button class="st-btn read" onclick="showLyrics(\'' + st.id + '\')">📖</button>' : '') +
        '</div>' +
      '</div>';

    if (st.custom) {
      inner +=
        '<div id="slePanel-' + st.id + '" style="display:none;margin-top:12px">' +
        '<div style="font-size:11px;color:rgba(74,144,226,0.8);margin-bottom:6px;letter-spacing:1px">✏ Edit Lyrics</div>' +
        '<textarea id="sle-' + st.id + '" rows="8" style="width:100%;background:rgba(0,0,0,0.40);border:1px solid rgba(74,144,226,0.25);border-radius:10px;padding:10px 12px;color:var(--tl);font-size:14px;font-family:Hind Siliguri,serif;resize:vertical;line-height:1.8;box-sizing:border-box" placeholder="Paste full lyrics here…"></textarea>' +
        '<button onclick="editStLyrics(\'' + st.id + '\')" style="margin-top:8px;padding:9px 20px;border-radius:10px;border:none;background:rgba(255,215,0,0.12);color:#ffd700;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;border:1px solid rgba(255,215,0,0.30)">💾 Save Lyrics</button>' +
        '</div>';
    }

    c.innerHTML = inner;

    // Pop animation on count change
    c.querySelectorAll('.st-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cntEl = c.querySelector('.st-count');
        if (cntEl) { cntEl.classList.remove('pop'); void cntEl.offsetWidth; cntEl.classList.add('pop'); }
      });
    });

    list.appendChild(c);
  });
}

// ─────────────────────────────────────────────────────────
// DEVELOPER STOTRAM MANAGEMENT
// Developer IDs: drakthephenomenal@gmail.com, akthephenomenal@zohomail.com, anupkumarpaulshuvo@gmail.com
// ─────────────────────────────────────────────────────────
const DEV_IDS = [
  "drakthephenomenal@gmail.com",
  "akthephenomenal@zohomail.com",
  "anupkumarpaulshuvo@gmail.com",
];

function isDeveloper() {
  if (!fbUser) return false;
  const email = (fbUser.email || "").toLowerCase().trim();
  return DEV_IDS.map((e) => e.toLowerCase()).includes(email);
}

function getEffectiveLyrics(id) {
  return (
    LYRICS[id] ||
    ((App.S.customSt || []).find((x) => x.id === id) || {}).lyrics ||
    ""
  );
}


function adjSt(id, d) {
  if (!App.S.stotrams[id]) App.S.stotrams[id] = {};
  if (!App.S.stotrams[id][App.S.tk]) App.S.stotrams[id][App.S.tk] = 0;
  App.S.stotrams[id][App.S.tk] = Math.max(0, App.S.stotrams[id][App.S.tk] + d);
  if (d > 0)
    logActivity({
      t: "stotram",
      ts: Date.now(),
      id: id,
      count: App.S.stotrams[id][App.S.tk],
    });
  App.save();
  fbDebouncedPush();
  const e = document.getElementById("sc" + id);
  if (e) e.textContent = App.S.stotrams[id][App.S.tk];
  App.vib([20]);
}
function addSt() {
  const name = document.getElementById("snIn").value.trim();
  if (!name) {
    toast("Please enter a name");
    return;
  }
  const sub = document.getElementById("ssIn").value.trim();
  const lyrics = (document.getElementById("slIn").value || "").trim();
  const id = "c_" + Date.now();
  if (!App.S.customSt) App.S.customSt = [];
  App.S.customSt.push({ id, name, sub, lyrics });
  if (!App.S.stotrams[id]) App.S.stotrams[id] = {};
  App.save();
  fbDebouncedPush();
  document.getElementById("snIn").value = "";
  document.getElementById("ssIn").value = "";
  document.getElementById("slIn").value = "";
  renderSt();
  toggleAsfForm(false); // auto-collapse after adding
  toast("Stotram added" + (lyrics ? " with lyrics" : "") + "! 🙏");
}

// Edit lyrics for existing custom stotram
function editStLyrics(id) {
  const st = (App.S.customSt || []).find((x) => x.id === id);
  if (!st) return;
  const el = document.getElementById("sle-" + id);
  if (!el) return;
  st.lyrics = el.value.trim();
  App.save();
  fbDebouncedPush();
  renderSt();
  toast("Lyrics saved! 🙏");
}

function toggleStEdit(id) {
  const panel = document.getElementById("slePanel-" + id);
  if (!panel) return;
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  if (!isOpen) {
    const st = (App.S.customSt || []).find((x) => x.id === id);
    const ta = document.getElementById("sle-" + id);
    if (st && ta) ta.value = st.lyrics || "";
  }
}
function delSt(id) {
  App.S.customSt = (App.S.customSt || []).filter((x) => x.id !== id);
  delete App.S.stotrams[id];
  App.save();
  fbDebouncedPush();
  renderSt();
  toast("Removed");
}

// _ADHIK_MAAS_WINDOWS, _getAdhikMaasWindow, isAdhikMaasDate
// defined in panchangData.js (loaded before app.js)

// ── Brahmacharya Progress Graph ──
// Anchor: May 16, 2026 = Amavasya (new moon, tithi 30/0 of Krishna paksha)
// Synodic month ≈ 29.530589 days
const BC_AMAVASYA_ANCHOR = new Date("2026-05-16T00:00:00");
const SYNODIC_MONTH = 29.530589;

function getLunarTithi(date) {
  // Approximate tithi from synodic month anchor (BC_AMAVASYA_ANCHOR)
  const days = (date.getTime() - BC_AMAVASYA_ANCHOR.getTime()) / 86400000;
  const phase = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  return Math.min(Math.max(Math.floor((phase / SYNODIC_MONTH) * 30) + 1, 1), 30);
}

function isRiskDay(date) {
  const t = getLunarTithi(date);
  // Risk window: Navami to Trayodashi in both paksha
  // Shukla: 9-13, Krishna: 24-28 (15+9 to 15+13)
  if ((t >= 9 && t <= 13) || (t >= 24 && t <= 28)) return true;
  return false;
}
// ── setHKLangDirect — directly set HK language to 'hi' or 'bn', used by Mahamantra Language buttons ──
function setHKLangDirect(lang) {
  if (!App || !App.S) return;
  if (App.S.hkLang === lang) return; // already selected
  App.S.hkLang = lang;
  // applyHKLangLabels handles: body.hk-bn class (CSS active states), all labels, toggle UI
  applyHKLangLabels(lang);
  // Update hkPersist if visible
  const hkEl = document.getElementById("hkPersist");
  if (hkEl && hkEl.classList.contains("hk-visible")) {
    const newText = lang === "bn" ? HK_TEXT_BN : HK_TEXT;
    hkEl.innerHTML = newText.split("\n").map(l => "<div>" + l + "</div>").join("");
  }
  if (App.S.japMode === "hk") switchJapMode("hk");
  App.save();
  fbDebouncedPush();
  return h + ":" + String(m).padStart(2, "0") + " " + ap;
}
// ── Vaishnava / Purnimanta month names (index 0=Chaitra … 11=Phalguna) ──
// Vaishnava month names — Gaurabda deity name + traditional Hindu name
// Index 0=Chaitra … 11=Phalguna (Purnimanta order)
const _VAISHNAVA_MONTH_NAMES = [
  { deity: "Vishnu",      hindu: "Chaitra"      },
  { deity: "Madhusudana", hindu: "Vaishakha"    },
  { deity: "Trivikrama",  hindu: "Jyeshtha"     },
  { deity: "Vamana",      hindu: "Ashadha"      },
  { deity: "Sridhara",    hindu: "Shravana"     },
  { deity: "Hrishikesha", hindu: "Bhadrapada"   },
  { deity: "Padmanabha",  hindu: "Ashwin"       },
  { deity: "Damodara",    hindu: "Kartik"       },
  { deity: "Keshava",     hindu: "Margashirsha" },
  { deity: "Narayana",    hindu: "Pausha"       },
  { deity: "Madhava",     hindu: "Magha"        },
  { deity: "Govinda",     hindu: "Phalguna"     },
];

// Gaurabda Year from a Gregorian date (approx: Gaurabda 1 = 1486 CE)
// Gaurabda year increments on Gaura Purnima (Phalguna Purnima, roughly Feb/Mar).
// Simplified: use Gregorian year − 1486; adjust if before ~March of that year.
function _gaurabdaYear(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  // Gaura Purnima is around March; before March of a year, still in previous Gaurabda
  return m < 2 ? (y - 1486 - 1) : (y - 1486);
}
function toggleEkEdit(startDate) {
  const eid = "ekEd_" + startDate.replace(/-/g, "");
  const el = document.getElementById(eid);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
}
// ── Graph range state: offset in days from today (0 = last 90d, -90 = prev 90d, etc.)
let _bcRangeOffset = 0;

function bcShiftRange(delta) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startD = new Date(getBrahmaStart());
  startD.setHours(0, 0, 0, 0);
  const totalDays = Math.round((today - startD) / 86400000) + 1;
  _bcRangeOffset += delta;
  // Clamp: can't go before start, can't go after today
  if (_bcRangeOffset > 0) _bcRangeOffset = 0;
  const minOffset = -Math.max(0, totalDays - 90);
  if (_bcRangeOffset < minOffset) _bcRangeOffset = minOffset;
  // Update next button visibility
  const nextBtn = document.getElementById("bcRangeNext");
  if (nextBtn) nextBtn.style.opacity = _bcRangeOffset < 0 ? "1" : "0.3";
  renderBcGraph();
}

// ── Brahma Muhurta boundary helpers ──────────────────────────────
// Brahma Muhurta starts 96 minutes (1hr 36min) before sunrise.
// For a given date's brahmacharya stamping: if current clock time is
// between midnight and that day's Brahma Muhurta start, it belongs
// to the PREVIOUS calendar date.

// Returns Brahma Muhurta start time (Date object) for a given date
function _getBrahmaMuhurtStart(dateObj, lat, lng) {
  lat = lat || (App.S && App.S.lastLat) || 23.8103;
  lng = lng || (App.S && App.S.lastLng) || 90.4125;
  if (typeof calcSunTimes === "function") {
    const sr = calcSunTimes(lat, lng, dateObj);
    if (sr && sr.sunriseH !== undefined) {
      // sunriseH is decimal hours e.g. 5.95 = 5:57 AM
      const sunriseMs = sr.sunriseH * 3600000;
      const bmMs = sunriseMs - 96 * 60000; // subtract 96 minutes
      const bm = new Date(dateObj);
      bm.setHours(0, 0, 0, 0);
      bm.setTime(bm.getTime() + bmMs);
      return bm;
    }
  }
  // Fallback: 4:21 AM
  const bm = new Date(dateObj);
  bm.setHours(4, 21, 0, 0);
  return bm;
}

// Returns a local-timezone YYYY-MM-DD string — used for ALL date keys
// (date changes at 12:00 AM local/device time, matching GPS timezone).
function _localDateStr(d) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

// Returns UTC offset in minutes for a given GPS longitude.
// Snaps to the nearest standard timezone offset used in the region.
// Falls back to device timezone if no GPS available.
function _gpsUtcOffsetMin() {
  const lat = (App.S && App.S.lastLat != null) ? App.S.lastLat
            : parseFloat(localStorage.getItem("rjap_lastLat") || "");
  const lng = (App.S && App.S.lastLng != null) ? App.S.lastLng
            : parseFloat(localStorage.getItem("rjap_lastLng") || "");
  if (isNaN(lat) || isNaN(lng)) {
    // No GPS — fall back to device timezone
    return -new Date().getTimezoneOffset();
  }
  // Derive raw solar offset from longitude (15° = 1 hour)
  const rawMin = Math.round(lng / 15 * 60);
  // Snap to real standard timezone offsets (covers India, Bangladesh, and neighbours)
  const knownOffsets = [
    -600,-570,-540,-510,-480,-450,-420,-390,-360,-330,-300,-270,-240,-210,
    -180,-150,-120,-60,0,60,120,180,210,240,270,300,330,345,360,390,
    420,450,480,510,525,540,570,600,630,660
  ];
  return knownOffsets.reduce((best, off) =>
    Math.abs(off - rawMin) < Math.abs(best - rawMin) ? off : best
  , knownOffsets[0]);
}

// Returns "today" Date object at GPS-local midnight (00:00:00 in the GPS timezone).
function _gpsLocalToday() {
  const offsetMin = _gpsUtcOffsetMin();
  const nowUtcMs = Date.now();
  // Shift now into the GPS timezone, extract calendar date, return midnight in that tz
  const localMs = nowUtcMs + offsetMin * 60000;
  const d = new Date(localMs);
  const yyyy = d.getUTCFullYear(), mm = d.getUTCMonth(), dd = d.getUTCDate();
  // Return as UTC ms representing midnight in GPS timezone
  return new Date(Date.UTC(yyyy, mm, dd) - offsetMin * 60000);
}

// Parse a YYYY-MM-DD string as midnight in the GPS timezone.
function _gpsParseDate(isoStr) {
  if (!isoStr) return null;
  const [y, mo, day] = isoStr.split("-").map(Number);
  const offsetMin = _gpsUtcOffsetMin();
  return new Date(Date.UTC(y, mo - 1, day) - offsetMin * 60000);
}
// Short alias
function _ldk(d) {
  return _localDateStr(d);
}

// Returns the brahmacharya date key for a given timestamp.
// Date changes at 12:00 AM local time (GPS/device timezone) — same as getTk().
function getBcDateKey(now) {
  now = now || new Date();
  return (
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0")
  );
}

// Time-of-day label based on clock hour
function _bcTimeLabel(h) {
  if (h < 5) return "night"; // 12 AM – 5 AM
  if (h < 12) return "morning"; // 5 AM – 12 PM
  if (h < 16) return "afternoon"; // 12 PM – 4 PM
  if (h < 20) return "evening"; // 4 PM – 8 PM
  return "night"; // 8 PM – 12 AM
}

// Format break time: "16 May, 2026 at night 12:15"
function formatBcBreakTime(timeStr, dateKey) {
  // timeStr is HH:MM (24hr from <input type="time">)
  // dateKey is YYYY-MM-DD (the BC date key, already adjusted for BM boundary)
  if (!timeStr || !dateKey) return "";
  const [hh, mm] = timeStr.split(":").map(Number);

  const label = _bcTimeLabel(hh + mm / 60);

  // Always show the BC date (dateKey) — this is the day the user sees in the
  // calendar. If they broke at 1:23 AM on May 11's BC day, show "11 May".
  // The time (1:23 AM) already makes clear it was in the early night hours.
  const displayDate = new Date(dateKey + "T00:00:00");
  const day = displayDate.getDate();
  const mon = displayDate.toLocaleDateString("en-GB", { month: "long" });
  const yr = displayDate.getFullYear();

  // 12hr format for the time
  let h12 = hh % 12 || 12;
  const mStr = String(mm).padStart(2, "0");
  const ampm = hh < 12 ? "AM" : "PM";

  return `${day} ${mon}, ${yr} at ${label} ${h12}:${mStr} ${ampm}`;
}

function renderBcGraph() {
  var canvas = document.getElementById("bcGraph");
  if (!canvas) return;

  // Retry until App and its data are fully initialised
  if (
    typeof App === "undefined" ||
    !App.S ||
    typeof App.S.brahma === "undefined"
  ) {
    setTimeout(renderBcGraph, 400);
    return;
  }

  var dpr = window.devicePixelRatio || 1;

  // Resolve container width robustly — fall back through several anchors
  var containerW = window.innerWidth - 56;
  var scrollWrap = canvas.parentElement;
  if (scrollWrap && scrollWrap.offsetWidth > 20)
    containerW = scrollWrap.offsetWidth;
  else {
    var _sec =
      scrollWrap &&
      scrollWrap.closest &&
      scrollWrap.closest(".bc-graph-section");
    if (_sec && _sec.offsetWidth > 20) containerW = _sec.offsetWidth - 36;
    else {
      var _vb = document.getElementById("vb");
      if (_vb && _vb.offsetWidth > 20) containerW = _vb.offsetWidth - 28;
    }
  }
  if (containerW < 20) {
    requestAnimationFrame(function () {
      setTimeout(renderBcGraph, 150);
    });
    return;
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var brahmaStart = getBrahmaStart();
  var startD = new Date(brahmaStart);
  startD.setHours(0, 0, 0, 0);
  if (isNaN(startD.getTime())) startD = new Date();
  startD.setHours(0, 0, 0, 0);

  var wEnd = new Date(today);
  if (_bcRangeOffset < 0) wEnd.setDate(wEnd.getDate() + _bcRangeOffset);
  var wStart = new Date(wEnd);
  wStart.setDate(wStart.getDate() - 89);
  if (wStart < startD) wStart.setTime(startD.getTime());
  var DAYS = Math.round((wEnd - wStart) / 86400000) + 1;

  // Update range label
  var lbl = document.getElementById("bcRangeLabel");
  if (lbl) {
    var fmt = function (d) {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    };
    lbl.textContent =
      _bcRangeOffset === 0
        ? "Last 90 days"
        : fmt(wStart) + " \u2013 " + fmt(wEnd);
  }
  var nextBtn = document.getElementById("bcRangeNext");
  if (nextBtn) nextBtn.style.opacity = _bcRangeOffset < 0 ? "1" : "0.3";

  var PER_DAY = Math.max(32, Math.floor(containerW / Math.min(DAYS, 28)));
  var W = Math.max(containerW, DAYS * PER_DAY + 72);
  var H = 360;

  // Size the canvas — set CSS first so the parent expands, then internal buffer
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  var ctx = canvas.getContext("2d");
  if (!ctx) {
    setTimeout(renderBcGraph, 300);
    return;
  }
  ctx.scale(dpr, dpr);

  // White background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  if (DAYS < 2) {
    ctx.fillStyle = "#aaa";
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Not enough data yet", W / 2, H / 2);
    return;
  }

  // Build streak data — walk from brahma start for correct carry-in
  var brahmaData = App.S.brahma || {};
  var allStart = new Date(startD);
  var fullDays = Math.round((wEnd - allStart) / 86400000) + 1;
  var streak = 0;
  var days = [];
  try {
    for (var i = 0; i < fullDays; i++) {
      var d = new Date(allStart);
      d.setDate(d.getDate() + i);
      var key = _ldk(d);
      var en = brahmaData[key];
      var broken = !!(en && en.status === "b");
      if (broken) streak = 0;
      else streak++;
      if (d >= wStart && d <= wEnd) {
        days.push({
          date: new Date(d),
          key: key,
          broken: broken,
          streak: streak,
          times: (en && en.times) || [],
        });
      }
    }
  } catch (e) {
    ctx.fillStyle = "#e00";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Graph error — please reload", W / 2, H / 2);
    return;
  }

  if (days.length === 0) {
    ctx.fillStyle = "#aaa";
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Not enough data yet", W / 2, H / 2);
    return;
  }

  var maxStreak = Math.max.apply(
    null,
    days
      .map(function (d) {
        return d.streak;
      })
      .concat([1]),
  );

  // Generous padding — space around every edge
  var PAD = { l: 52, r: 28, t: 28, b: 56 };
  var gW = W - PAD.l - PAD.r;
  var gH = H - PAD.t - PAD.b;
  var xStep = days.length > 1 ? gW / (days.length - 1) : gW;

  // Horizontal grid lines — very light, dashed
  [0.25, 0.5, 0.75, 1].forEach(function (f) {
    var y = PAD.t + gH - f * gH;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(W - PAD.r, y);
    ctx.strokeStyle = "rgba(0,0,0,0.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#bbb";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(Math.round(f * maxStreak) + "d", PAD.l - 10, y + 4);
  });

  // Weekly vertical guide lines (Sundays)
  days.forEach(function (d, i) {
    if (d.date.getDay() !== 0) return;
    var x = PAD.l + i * xStep;
    ctx.beginPath();
    ctx.moveTo(x, PAD.t);
    ctx.lineTo(x, PAD.t + gH);
    ctx.strokeStyle = "rgba(0,0,0,0.04)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();
  });

  // Green fill under curve
  ctx.beginPath();
  days.forEach(function (d, i) {
    var x = PAD.l + i * xStep;
    var y = PAD.t + gH - (d.streak / maxStreak) * gH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  var lastX = PAD.l + (days.length - 1) * xStep;
  ctx.lineTo(lastX, PAD.t + gH);
  ctx.lineTo(PAD.l, PAD.t + gH);
  ctx.closePath();
  var fillGrad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + gH);
  fillGrad.addColorStop(0, "rgba(34,197,94,0.20)");
  fillGrad.addColorStop(1, "rgba(34,197,94,0.01)");
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Green streak line — smooth, 2.5px
  ctx.beginPath();
  days.forEach(function (d, i) {
    var x = PAD.l + i * xStep;
    var y = PAD.t + gH - (d.streak / maxStreak) * gH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  ctx.stroke();

  // Small green node dots on maintained days
  days.forEach(function (d, i) {
    if (d.broken) return;
    var x = PAD.l + i * xStep;
    var y = PAD.t + gH - (d.streak / maxStreak) * gH;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#22c55e";
    ctx.fill();
  });

  // Red broken-day dots — pinned near baseline, prominent
  days.forEach(function (d, i) {
    if (!d.broken) return;
    var x = PAD.l + i * xStep;
    var dotY = PAD.t + gH - 6;

    ctx.beginPath();
    ctx.arc(x, dotY + 2, 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239,68,68,0.15)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, dotY, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    var times = d.times || [];
    if (times.length > 0 && times[0].time) {
      // Convert HH:MM to 12hr format for graph label
      var tParts = times[0].time.split(":");
      var th = parseInt(tParts[0]),
        tm = parseInt(tParts[1] || 0);
      var tampm = th >= 12 ? "pm" : "am";
      var th12 = th % 12 || 12;
      var tLabel = th12 + ":" + String(tm).padStart(2, "0") + " " + tampm;
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tLabel, x, dotY - 12);
      if (times.length > 1) {
        ctx.fillStyle = "#f87171";
        ctx.font = "8px Inter, sans-serif";
        ctx.fillText("+" + (times.length - 1), x, dotY - 22);
      }
    }
  });

  // Baseline axis line
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t + gH);
  ctx.lineTo(W - PAD.r, PAD.t + gH);
  ctx.strokeStyle = "rgba(0,0,0,0.10)";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.stroke();

  // X-axis labels: date on Sundays + month name when it changes
  var MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  var lastLabelMonth = -1;
  ctx.textAlign = "center";
  days.forEach(function (d, i) {
    var x = PAD.l + i * xStep;
    var isSunOrFirst = d.date.getDay() === 0 || i === 0;
    if (isSunOrFirst) {
      ctx.fillStyle = "#999";
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(d.date.getDate(), x, PAD.t + gH + 18);
    }
    if (d.date.getMonth() !== lastLabelMonth) {
      lastLabelMonth = d.date.getMonth();
      ctx.fillStyle = "#555";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillText(MONTHS[d.date.getMonth()], x, PAD.t + gH + 36);
    }
  });
  ctx.textAlign = "left";
}

// ── Brahmacharya ──
function getBrahmaStart() {
  return App.S.brahmacharya_start_date || "2026-03-16";
}
function confirmBrahmaStartChange(val) {
  if (!val) return;
  const prev = getBrahmaStart();
  if (val === prev) return;
  if (
    !confirm(
      "Changing start date will recalculate your entire Brahmacharya streak. Are you sure?",
    )
  ) {
    document.getElementById("brahmaStartInput").value = prev;
    return;
  }
  App.S.brahmacharya_start_date = val;
  App.save();
  fbDebouncedPush();
  renderBcal();
  const disp = document.getElementById("brahmaStartDisp");
  if (disp) disp.textContent = _fmtDateFriendly(val);
  toast("Start date updated 🛡️");
}
function _fmtDateFriendly(isoStr) {
  if (!isoStr) return "";
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const d = new Date(isoStr + "T00:00:00");
  return d.getDate() + " " + months[d.getMonth()] + ", " + d.getFullYear();
}
function initBrahmaStartInput() {
  const el = document.getElementById("brahmaStartInput");
  if (el) el.value = getBrahmaStart();
  const disp = document.getElementById("brahmaStartDisp");
  if (disp) disp.textContent = _fmtDateFriendly(getBrahmaStart());
}
let bcd = new Date();
const MN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function renderBcal() {
  renderCal();
}
function cbm(d) {
  bcd.setMonth(bcd.getMonth() + d);
  renderBcal();
}
function openBcDay(key, isBroken, cnt) {
  const parts = key.split("-");
  const _bcMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const label = parseInt(parts[2]) + " " + _bcMonths[parseInt(parts[1]) - 1] + ", " + parts[0];
  document.getElementById("bcmoT").textContent =
    (isBroken ? "❌ Broken — " : "✅ Maintained — ") + label;
  document.getElementById("bcmoD").textContent = isBroken
    ? "Tap to restore or update."
    : "Tap to mark as broken.";
  document.getElementById("bcmoCnt").value = cnt || 1;
  document.getElementById("bcmoBrkRow").style.display = isBroken
    ? "none"
    : "flex";
  document.getElementById("bcmoRst").style.display = isBroken ? "" : "none";
  document.getElementById("bcmoBrk").style.display = isBroken ? "none" : "";
  document.getElementById("bcmoBrk").onclick = function () {
    App.S.brahma[key] = {
      status: "b",
      count: parseInt(document.getElementById("bcmoCnt").value) || 1,
    };
    App.save();
    fbDebouncedPush();
    renderBcal();
    document.getElementById("bcmo").classList.remove("show");
    toast("Marked as broken 🙏");
  };
  document.getElementById("bcmoRst").onclick = function () {
    delete App.S.brahma[key];
    App.save();
    fbDebouncedPush();
    renderBcal();
    document.getElementById("bcmo").classList.remove("show");
    toast("✅ Restored!");
  };
  document.getElementById("bcmo").classList.add("show");
}
function lb(st) {
  const cnt = parseInt(document.getElementById("bci").value) || 1;
  const bcKey = getBcDateKey(); // use BM-aware date key
  if (st === "b") App.S.brahma[bcKey] = { status: "b", count: cnt };
  else delete App.S.brahma[bcKey];
  App.save();
  fbDebouncedPush();
  renderBcal();
  toast(st === "b" ? "Logged. Keep going 🙏" : "✅ Restored!");
}
function uBStats() {
  const startD = new Date(getBrahmaStart());
  startD.setHours(0, 0, 0, 0);
  const todayD = new Date();
  todayD.setHours(0, 0, 0, 0);
  const totalDays = Math.max(0, Math.round((todayD - startD) / 86400000) + 1);
  const brok = Object.values(App.S.brahma).filter(
    (e) => e.status === "b",
  ).length;
  const maint = totalDays - brok;
  const tmc = Object.values(App.S.brahma)
    .filter((e) => e.status === "b")
    .reduce((s, e) => s + e.count, 0);
  const pct = totalDays > 0 ? Math.round((maint / totalDays) * 100) : 0;
  let cs = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (cs < 999) {
    const k = _ldk(d);
    if (k < getBrahmaStart()) break;
    const en = App.S.brahma[k];
    if (!en || en.status !== "b") {
      cs++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  let bs = 0,
    run = 0;
  const allDays = [],
    cur = new Date(getBrahmaStart());
  cur.setHours(0, 0, 0, 0);
  while (cur <= todayD) {
    allDays.push(_ldk(cur));
    cur.setDate(cur.getDate() + 1);
  }
  allDays.forEach((k) => {
    const en = App.S.brahma[k];
    if (!en || en.status !== "b") {
      run++;
      if (run > bs) bs = run;
    } else run = 0;
  });
  document.getElementById("bcs").textContent = cs;
  document.getElementById("bbs").textContent = bs;
  document.getElementById("bbc").textContent = brok;
  document.getElementById("bmd").textContent = maint;
  document.getElementById("bbd").textContent = brok;
  document.getElementById("btm").textContent = tmc;
  document.getElementById("bmp").textContent = pct + "%";
}

// ── Calendar ──
let cald = new Date();
function renderCal() {
  const yr = cald.getFullYear(),
    mo = cald.getMonth();
  document.getElementById("cmy").textContent = MN[mo] + " " + yr;
  const g = document.getElementById("cg");
  while (g.children.length > 7) g.removeChild(g.lastChild);
  const fd = new Date(yr, mo, 1).getDay(),
    dim = new Date(yr, mo + 1, 0).getDate(),
    ts = App.getTk();
  for (let i = 0; i < fd; i++) g.appendChild(document.createElement("div"));
  for (let d = 1; d <= dim; d++) {
    const key =
      yr +
      "-" +
      String(mo + 1).padStart(2, "0") +
      "-" +
      String(d).padStart(2, "0");
    const _isG = App.S.gaudiyaMode || false;
    const cnt = _isG
        ? App.S.historyHK[key] || 0
        : (App.S.history[key] || 0) + (App.S.historyRV[key] || 0),
      timeSec = _isG
        ? App.S.timerHistoryHK[key] || 0
        : (App.S.timerHistory[key] || 0) + (App.S.timerHistoryRV[key] || 0),
      time28Sec = App.S.timer28History[key] || 0;
    const occ = App.S.occasions && App.S.occasions[key];
    const c = document.createElement("div");
    c.className = "cc";
    if (key === ts) c.classList.add("today");
    // Brahmacharya coloring
    const bcEn = App.S.brahma[key],
      isBcBroken = bcEn && bcEn.status === "b";
    const isBcActive = key >= getBrahmaStart() && key <= ts;
    if (isBcActive) {
      c.classList.add(isBcBroken ? "bc-b" : "bc-m");
    }
    const combinedDt = (App.S.dt || 0) + (App.S.dtRV || 0);
    if (cnt > 0) {
      c.classList.add("hd");
      if (combinedDt > 0 && cnt >= combinedDt) c.classList.add("tm");
    }
    if (occ) c.classList.add("occ");
    let inner = "<span>" + d + "</span>";
    if (cnt > 0) inner += '<span class="ccc">' + cnt + "</span>";
    if (occ) {
      // Strip parampara/paksha/time details — show only the core occasion name
      let occShort = occ
        .replace(/\s*[☀️🌙]\s*(Shukla|Krishna)(\s*Paksha)?/g, "") // remove paksha labels
        .replace(/\s*\(Arunodaya[^)]*\)/g, "") // remove Arunodaya note
        .replace(/\s+\d{1,2}:\d{2}\s*(AM|PM)[\s\S]*$/i, "") // remove time ranges
        .replace(/\s*·\s*(Smarta|Vaishnava|Gaudiya)[^·]*/gi, "") // remove parampara
        .trim();
      inner += '<span class="cco">' + escHtml(occShort) + "</span>";
    }
    c.innerHTML = inner;
    c.onclick = (() => {
      const k = key,
        n = cnt,
        t = timeSec,
        t28 = time28Sec;
      return () => showDay(k, n, t, t28);
    })();
    g.appendChild(c);
  }
  uBStats();
  renderBcGraph();
}
function chm(d) {
  cald.setMonth(cald.getMonth() + d);
  renderCal();
}
// ── Calendar day bottom sheet ──
let _sheetKey = null;
// ── Panchang rendering for the day popup ─────────────────────────
function _renderDayPanchang(key) {
  // Reset to loading state
  const ids = [
    "cdmpPaksha",
    "cdmpTithi",
    "cdmpNakshatra",
    "cdmpYoga",
    "cdmpKarana",
    "cdmpVaara",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.innerHTML =
        '<span style="color:rgba(255,255,255,0.25);font-size:12px">…</span>';
  });
  const monthEl = document.getElementById("cdmoPanchangMonth");
  if (monthEl)
    monthEl.innerHTML =
      '<span style="color:rgba(255,255,255,0.25);font-size:12px">Loading…</span>';

  if (typeof getPanchangData !== "function") {
    if (monthEl) monthEl.textContent = "Panchang module not loaded";
    return;
  }

  // Build date at local midnight (00:00) so the panchang search starts from the
  // beginning of the calendar day — otherwise if called after a tithi change
  // (e.g. Amavasya ends at 3 AM and we pass 6 AM), we miss that tithi entirely.
  const parts = key.split("-");
  const dateAtMidnight = new Date(
    parseInt(parts[0]),
    parseInt(parts[1]) - 1,
    parseInt(parts[2]),
    0,
    0,
    0,
  );

  async function _renderWithLatLng(lat, lng) {
    try {
      const p = await getPanchangData(lat, lng, dateAtMidnight);

      // ── Guaranteed Gaurabda — never NaN ──────────────────────────
      const _gyRaw = p.gaurabdaYear ?? p.gaurabda ?? _gaurabdaYear(key);
      const gaurabdaSafe = (typeof _gyRaw === 'number' && !isNaN(_gyRaw))
        ? _gyRaw : _gaurabdaYear(key);

      // Month block — Purnimanta + Amanta + Gaudiya
      if (monthEl) {
        const adhikBadge = p.month.isAdhik
          ? ' <span style="font-size:9px;background:rgba(206,147,216,0.2);border:1px solid rgba(206,147,216,0.4);border-radius:4px;padding:1px 6px;color:#ce93d8;">Adhik Maas</span>'
          : "";
        const sameMonth = p.month.std === p.month.amanta; // true during Shukla Paksha
        monthEl.innerHTML =
          // Row 1: Bengali names + Gaurabda
          `<span style="font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:.5px">Purnimanta</span> ` +
          `<span style="color:#ce93d8;font-weight:600">${p.month.stdBn}</span>` +
          ` <span style="color:rgba(255,255,255,0.25);font-size:11px">/</span> ` +
          `<span style="color:#b39ddb">${p.month.gaudiyaBn}</span>${adhikBadge}` +
          `<span style="font-size:11px;color:rgba(255,255,255,0.28);margin-left:8px">${gaurabdaSafe} Gaurabda</span><br>` +
          // Row 2: English Purnimanta
          `<span style="font-size:11px;color:rgba(255,255,255,0.4)">${p.month.std} / ${p.month.gaudiya}</span><br>` +
          // Row 3: Amanta (only show if different from Purnimanta)
          (sameMonth
            ? ""
            : `<span style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:.5px">Amanta</span> ` +
              `<span style="font-size:11px;color:#9fa8da">${p.month.amantaBn}</span>` +
              ` <span style="color:rgba(255,255,255,0.2);font-size:10px">/</span> ` +
              `<span style="font-size:11px;color:#7986cb">${p.month.amantaGaudiyaBn}</span><br>` +
              `<span style="font-size:10px;color:rgba(255,255,255,0.28)">${p.month.amanta} / ${p.month.amantaGaudiya}</span>`);
      }

      // Helper to build a val span with Bengali + end time
      function val(en, bn, endTime) {
        let html = `${en} <span class="cdmp-bn">${bn}</span>`;
        if (endTime) html += ` <span class="cdmp-end">up to ${endTime}</span>`;
        return html;
      }

      const pakshaEl = document.getElementById("cdmpPaksha");
      if (pakshaEl)
        pakshaEl.innerHTML = val(p.paksha.gaudiya, p.paksha.gaudiyaBn, null);

      const tithiEl = document.getElementById("cdmpTithi");
      if (tithiEl)
        tithiEl.innerHTML = val(
          p.tithi.name,
          p.tithi.nameBn,
          p.tithi.endTimeHM,
        );

      const nakEl = document.getElementById("cdmpNakshatra");
      if (nakEl)
        nakEl.innerHTML = val(
          p.nakshatra.name,
          p.nakshatra.nameBn,
          p.nakshatra.endTimeHM,
        );

      const yogaEl = document.getElementById("cdmpYoga");
      if (yogaEl)
        yogaEl.innerHTML = val(p.yoga.name, p.yoga.nameBn, p.yoga.endTimeHM);

      const karanaEl = document.getElementById("cdmpKarana");
      if (karanaEl)
        karanaEl.innerHTML = val(p.karana.name, p.karana.nameBn, null);

      const vaaraEl = document.getElementById("cdmpVaara");
      if (vaaraEl) vaaraEl.innerHTML = val(p.vaara.name, p.vaara.nameBn, null);
    } catch (e) {
      if (monthEl) monthEl.textContent = "Panchang error";
      console.error("Panchang error:", e);
    }
  }

  // Use ONLY coords saved by the GPS Location toggle — no independent geolocation call.
  const savedLat = App.S && App.S.lastLat;
  const savedLng = App.S && App.S.lastLng;
  if (savedLat && savedLng) {
    _renderWithLatLng(savedLat, savedLng);
  } else {
    // GPS toggle is OFF — render with default Bangladesh coords
    _renderWithLatLng(23.0, 89.5);
  }
}

function showDay(key, cnt, timeSec, time28Sec) {
  _sheetKey = key;
  const ms = App.S.ms || 108;
  const pts = key.split("-"),
    yr = pts[0],
    mo = pts[1],
    d = pts[2];
  const occ = App.S.occasions && App.S.occasions[key];

  // Title
  document.getElementById("cdmoTitle").textContent =
    String(parseInt(d)).padStart(2, "0") +
    ":" +
    String(parseInt(mo)).padStart(2, "0") +
    ":" +
    yr;

  // Stats — detailed breakdown
  const radhaCount = App.S.history[key] || 0;
  const rvCount = App.S.historyRV[key] || 0;
  const radhaTime = App.S.timerHistory[key] || 0;
  const rvTime = App.S.timerHistoryRV[key] || 0;
  const n28Count = App.S.h28[key] || 0;
  const n28TimeSec = App.S.timer28History[key] || 0;
  const n28Cycles = Math.floor(n28Count / 28);
  const radhaMalas = Math.floor(radhaCount / ms);
  const rvMalas = Math.floor(rvCount / ms);
  const totalCount = radhaCount + rvCount;
  const totalMalas = Math.floor(totalCount / ms);
  // HK / Mahamantra counts for Gaudiya mode
  const hkCount = App.S.historyHK[key] || 0;
  const hkTime = App.S.timerHistoryHK[key] || 0;
  const hkMalas = Math.floor(hkCount / ms);
  const hkJapEl = document.getElementById("cdmoHkJap");
  if (hkJapEl)
    hkJapEl.textContent =
      hkCount > 0 ? hkCount + " jap · " + hkMalas + " malas" : "—";
  const hkTimeEl = document.getElementById("cdmoHkTime");
  if (hkTimeEl) hkTimeEl.textContent = hkTime > 0 ? App.fmtTime(hkTime) : "—";

  document.getElementById("cdmoRadhaJap").textContent =
    radhaCount > 0 ? radhaCount + " jap · " + radhaMalas + " malas" : "—";
  document.getElementById("cdmoRvJap").textContent =
    rvCount > 0 ? rvCount + " jap · " + rvMalas + " malas" : "—";
  document.getElementById("cdmoRadhaTime").textContent =
    radhaTime > 0 ? App.fmtTime(radhaTime) : "—";
  document.getElementById("cdmoRvTime").textContent =
    rvTime > 0 ? App.fmtTime(rvTime) : "—";
  document.getElementById("cdmo28Names").textContent =
    n28Count > 0 ? n28Count + " jap · " + n28Cycles + " cycles" : "—";
  const el28 = document.getElementById("cdmoTime28");
  if (el28) {
    if (n28TimeSec > 0) {
      const _m = Math.floor(n28TimeSec / 60),
        _s = n28TimeSec % 60;
      el28.textContent = _m + ":" + String(_s).padStart(2, "0");
    } else el28.textContent = "—";
  }
  document.getElementById("cdmoTotalCount").textContent =
    totalCount > 0 ? totalCount + " jap (" + totalMalas + " malas)" : "—";
  const totalTimeSec = radhaTime + rvTime + n28TimeSec;
  document.getElementById("cdmoTotalTime").textContent =
    totalTimeSec > 0 ? App.fmtTime(totalTimeSec) : "—";
  const combinedDt = (App.S.dt || 0) + (App.S.dtRV || 0);
  const pct = combinedDt > 0 ? Math.round((cnt / combinedDt) * 100) + "%" : "—";
  document.getElementById("cdmoPct").textContent = pct;

  // Occasion
  _renderSheetOcc(key);

  // Brahmacharya section
  const bcSec = document.getElementById("cdmoBcSection");
  const bcStatus = document.getElementById("cdmoBcStatus");
  const bcCntRow = document.getElementById("cdmoBcCntRow");
  const bcMaintBtn = document.getElementById("cdmoBcMaint");
  const bcBrkBtn = document.getElementById("cdmoBcBrk");
  const ts = App.getTk();
  const isBcActive = key >= getBrahmaStart() && key <= ts;
  if (isBcActive) {
    bcSec.style.display = "";
    const bcEn = App.S.brahma[key],
      isBroken = bcEn && bcEn.status === "b";
    if (isBroken) {
      // Build time display from saved times array
      const savedTimes = bcEn.times || [];
      let timesHtml = "";
      if (savedTimes.length > 0) {
        timesHtml = '<div class="bc-times-display">';
        savedTimes.forEach((t, i) => {
          const formatted = t.time ? formatBcBreakTime(t.time, key) : "";
          const tStr = formatted
            ? '<span class="bc-time-badge">🕐 ' + formatted + "</span>"
            : '<span class="bc-time-badge bc-time-unknown">🕐 —</span>';
          const nStr = t.note
            ? '<span class="bc-note-badge">' + escHtml(t.note) + "</span>"
            : "";
          timesHtml +=
            '<div class="bc-time-item">' +
            (savedTimes.length > 1
              ? '<span class="bc-instance-num">#' + (i + 1) + "</span>"
              : "") +
            tStr +
            nStr +
            "</div>";
        });
        timesHtml += "</div>";
      }
      bcStatus.innerHTML =
        '❌ <span style="color:var(--red)">Broken</span>' +
        (bcEn.count > 1 ? " (" + bcEn.count + "x)" : "") +
        timesHtml;
      // Allow editing count/times directly without first marking maintained
      bcMaintBtn.style.display = "";
      bcBrkBtn.style.display = "";
      bcBrkBtn.textContent = "Update";
      bcCntRow.style.display = "flex";
      const bcTimeRows = document.getElementById("bcTimeRows");
      if (bcTimeRows) bcTimeRows.style.display = "block";
    } else {
      bcStatus.innerHTML =
        '✅ <span style="color:var(--green)">Maintained</span>';
      bcMaintBtn.style.display = "none";
      bcBrkBtn.style.display = "";
      bcBrkBtn.textContent = "Mark Broken";
      bcCntRow.style.display = "flex";
      const bcTimeRows = document.getElementById("bcTimeRows");
      if (bcTimeRows) bcTimeRows.style.display = "block";
    }
    const cntInputEl = document.getElementById("cdmoBcCnt");
    if (cntInputEl)
      cntInputEl.oninput = function () {
        renderBcTimeRows();
      };
    document.getElementById("cdmoBcCnt").value = (bcEn && bcEn.count) || 1;
    renderBcTimeRows();
  } else {
    bcSec.style.display = "none";
  }

  // Clear input
  document.getElementById("cdmoOccIn").value = "";

  // Panchang
  _renderDayPanchang(key);

  document.getElementById("cdmo").classList.add("show");
}
function _renderSheetOcc(key) {
  const occ = App.S.occasions && App.S.occasions[key];
  const nameEl = document.getElementById("cdmoOccName");
  const curEl = document.getElementById("cdmoOccCur");
  if (occ) {
    curEl.innerHTML =
      '<span style="color:var(--gold)">🪔 ' +
      escHtml(occ) +
      "</span>" +
      '<button class="cdmo-occ-del" onclick="_delSheetOcc(\'' +
      key +
      "')\">✕</button>";
  } else {
    curEl.innerHTML =
      '<span style="color:var(--td);font-style:italic">None added</span>';
  }
}
function _delSheetOcc(key) {
  if (App.S.occasions) delete App.S.occasions[key];
  App.save();
  fbDebouncedPush();
  renderCal();
  _renderSheetOcc(key);
  toast("Occasion removed.");
}
function addOccasionFromSheet() {
  const key = _sheetKey;
  if (!key) return;
  const name = (document.getElementById("cdmoOccIn").value || "").trim();
  if (!name) {
    toast("Please enter an occasion name 🪔");
    return;
  }
  if (!App.S.occasions) App.S.occasions = {};
  App.S.occasions[key] = name;
  document.getElementById("cdmoOccIn").value = "";
  App.save();
  fbDebouncedPush();
  renderCal();
  _renderSheetOcc(key);
  toast("Occasion added! 🪔 " + name);
}
function closeDaySheet() {
  document.getElementById("cdmo").classList.remove("show");
  const container = document.getElementById("bcTimeRows");
  if (container) container.dataset.sheetKey = "";
  _sheetKey = null;
}
function sheetMarkBc(action) {
  const key = _sheetKey;
  if (!key) return;
  if (action === "b") {
    const cnt = parseInt(document.getElementById("cdmoBcCnt").value) || 1;
    // Collect times from dynamic time inputs
    const times = [];
    for (let i = 0; i < cnt; i++) {
      const tEl = document.getElementById("bcTime_" + i);
      const nEl = document.getElementById("bcNote_" + i);
      times.push({
        time: tEl ? tEl.value : "",
        note: nEl ? nEl.value.trim() : "",
      });
    }
    App.S.brahma[key] = { status: "b", count: cnt, times: times };
    logActivity({
      t: "brahma",
      ts: Date.now(),
      status: "b",
      date: key,
      count: cnt,
      times: times,
    });
    toast("Marked as broken 🙏");
  } else {
    delete App.S.brahma[key];
    logActivity({ t: "brahma", ts: Date.now(), status: "m", date: key });
    toast("✅ Restored as maintained!");
  }
  App.save();
  fbDebouncedPush();
  renderCal();
  // Refresh the sheet to show updated status
  const _isG2 = App.S.gaudiyaMode || false;
  const cnt2 = _isG2
    ? App.S.historyHK[key] || 0
    : (App.S.history[key] || 0) + (App.S.historyRV[key] || 0);
  const timeSec2 =
    (App.S.timerHistory[key] || 0) + (App.S.timerHistoryRV[key] || 0);
  const time28Sec2 = App.S.timer28History[key] || 0;
  showDay(key, cnt2, timeSec2, time28Sec2);
}

// ── Render dynamic time input rows in brahmacharya broken section ──
function renderBcTimeRows() {
  const key = _sheetKey;
  const cntEl = document.getElementById("cdmoBcCnt");
  const cnt = parseInt(cntEl ? cntEl.value : 1) || 1;
  const container = document.getElementById("bcTimeRows");
  if (!container) return;

  // Only preserve existing DOM values if we're still on the same day
  // (i.e. user changed the count spinner, not opened a different day)
  const domKey = container.dataset.sheetKey;
  const sameDay = domKey === key;

  const existing = [];
  if (sameDay) {
    const old = container.querySelectorAll(".bc-time-row");
    old.forEach((row, i) => {
      existing[i] = {
        time: (row.querySelector('input[type="time"]') || {}).value || "",
        note: (row.querySelector('input[type="text"]') || {}).value || "",
      };
    });
  }

  // Pre-fill from saved data for this specific day
  const saved =
    key && App.S.brahma[key] && App.S.brahma[key].times
      ? App.S.brahma[key].times
      : [];
  container.innerHTML = "";
  container.dataset.sheetKey = key; // stamp current day on container

  for (let i = 0; i < cnt; i++) {
    const prefill =
      sameDay && existing[i] && existing[i].time ? existing[i] : saved[i] || {};
    const div = document.createElement("div");
    div.className = "bc-time-row";
    div.innerHTML =
      '<span class="bc-time-label">Instance ' +
      (i + 1) +
      ":</span>" +
      '<input type="time" id="bcTime_' +
      i +
      '" class="bc-time-input" value="' +
      (prefill.time || "") +
      '" placeholder="HH:MM">' +
      '<input type="text" id="bcNote_' +
      i +
      '" class="bc-note-input" value="' +
      escHtml(prefill.note || "") +
      '" placeholder="Note (optional)">';
    container.appendChild(div);
  }
}
function addOccasion() {
  const date = (
    document.getElementById("occDate") || { value: "" }
  ).value.trim();
  const name = (
    document.getElementById("occName") || { value: "" }
  ).value.trim();
  if (!date || !name) return;
  if (!App.S.occasions) App.S.occasions = {};
  App.S.occasions[date] = name;
  App.save();
  fbDebouncedPush();
  renderCal();
  toast("Occasion added! 🪔 " + name);
}
function deleteOccasion(key) {
  if (App.S.occasions) delete App.S.occasions[key];
  App.save();
  fbDebouncedPush();
  renderCal();
  toast("Removed.");
}
function renderOccasionList() {
  const el = document.getElementById("occList");
  if (!el) return;
  const occs = App.S.occasions || {},
    keys = Object.keys(occs).sort();
  if (!keys.length) {
    el.innerHTML =
      '<div style="font-size:12px;color:var(--td);padding:4px 0">No occasions added yet.</div>';
    return;
  }
  el.innerHTML = keys
    .map((k) => {
      const pts = k.split("-"),
        label =
          String(parseInt(pts[2])).padStart(2, "0") +
          ":" +
          String(parseInt(pts[1])).padStart(2, "0") +
          ":" +
          pts[0];
      return (
        '<div class="occ-item"><span class="occ-item-date">' +
        label +
        '</span><span class="occ-item-name">🪔 ' +
        escHtml(occs[k]) +
        '</span><button class="occ-item-del" onclick="deleteOccasion(\'' +
        k +
        "')\">✕</button></div>"
      );
    })
    .join("");
}

// ── Sun Times ──
function calcSunTimes(lat, lng, date) {
  // NOAA Solar Calculator — apparent sunrise/sunset (Earth-sky mode, 90.833°)
  // For Celestial mode: sunrise = solar noon − 6h, sunset = solar noon + 6h
  // This matches ISKCON Panjika exactly:
  //   Earth-sky  → standard apparent horizon (disc + refraction = 90.833°)
  //   Celestial  → pure Vedic/astronomical: solar noon ± 6 hours (Local Apparent Solar Time)
  //
  // The function always computes the apparent (Earth-sky) times first.
  const rad = Math.PI / 180;

  // JD at noon UTC for the requested calendar date (device local midnight → UTC noon)
  const JD = Math.floor(date.getTime() / 86400000) + 2440587.5 + 0.5;
  const T = (JD - 2451545.0) / 36525.0; // Julian centuries since J2000.0

  // Geometric mean longitude and anomaly of the Sun
  const L0 =
    (((280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360) + 360) % 360;
  const M =
    (((357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360) + 360) % 360;
  const Mr = M * rad;

  // Equation of centre
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);

  // Sun true longitude → apparent longitude (aberration + nutation)
  const sunTrueLon = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = sunTrueLon - 0.00569 - 0.00478 * Math.sin(omega * rad);

  // Mean obliquity + correction
  const epsilon0 =
    23.0 +
    26.0 / 60 +
    21.448 / 3600 -
    (46.815 / 3600) * T -
    (0.00059 / 3600) * T * T +
    (0.001813 / 3600) * T * T * T;
  const epsilon = (epsilon0 + 0.00256 * Math.cos(omega * rad)) * rad;

  // Declination
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda * rad));

  // Equation of time (minutes)
  const y = Math.tan(epsilon / 2) ** 2;
  const L0r = L0 * rad;
  const eqT =
    (4 / rad) *
    (y * Math.sin(2 * L0r) -
      2 * 0.016708634 * Math.sin(Mr) +
      4 * 0.016708634 * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * 0.016708634 ** 2 * Math.sin(2 * Mr));

  // Apparent (Earth-sky) horizon: disc radius (0.267°) + refraction (0.566°) = 90.833°
  const cosHA =
    (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) /
    (Math.cos(lat * rad) * Math.cos(dec));
  if (cosHA > 1 || cosHA < -1) return null; // polar night / midnight sun

  const HA = Math.acos(cosHA) / rad; // degrees

  // Solar noon, apparent sunrise, apparent sunset — all in UTC minutes from midnight
  const solarNoonUTC = 720 - 4 * lng - eqT;
  const sunriseUTC = solarNoonUTC - HA * 4;
  const sunsetUTC  = solarNoonUTC + HA * 4;

  // UTC minutes → local decimal hours using device timezone offset
  const tzOffMin = -date.getTimezoneOffset(); // positive east of UTC
  function toLocalH(utcMin) {
    return ((((utcMin + tzOffMin) / 60) % 24) + 24) % 24;
  }

  // Apparent (Earth-sky) values — always computed, used as base for daytime length
  const apparentSunriseH = toLocalH(sunriseUTC);
  const apparentSunsetH  = toLocalH(sunsetUTC);
  const solarNoonH       = toLocalH(solarNoonUTC);

  const sunriseH = apparentSunriseH;
  const sunsetH  = apparentSunsetH;

  function fmtH(h) {
    let hh = Math.floor(h),
      mm = Math.round((h - hh) * 60);
    if (mm >= 60) { hh++; mm = 0; }
    if (hh >= 24) hh -= 24;
    if (hh < 0)   hh += 24;
    const ap = hh >= 12 ? "PM" : "AM",
      h12 = hh % 12 || 12;
    return (
      String(h12).padStart(2, "0") +
      ":" +
      String(mm).padStart(2, "0") +
      " " +
      ap
    );
  }

  return {
    sunriseH,
    sunsetH,
    // Apparent values exposed for any feature that needs apparent daytime length
    apparentSunriseH,
    apparentSunsetH,
    solarNoonH,
    sunrise: fmtH(sunriseH),
    sunset:  fmtH(sunsetH),
  };
}
function fmtHour(h) {
  let hh = Math.floor(h),
    mm = Math.round((h - hh) * 60);
  if (mm >= 60) {
    hh++;
    mm = 0;
  }
  if (hh >= 24) hh -= 24;
  const ap = hh >= 12 ? "PM" : "AM",
    h12 = hh % 12 || 12;
  return (
    String(h12).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + " " + ap
  );
}
function updateSunInfo(lat, lng) {
  const now = new Date(),
    times = calcSunTimes(lat, lng, now);
  if (!times) return;
  // Brahma Muhurta = 2 muhurtas (96 min) before sunrise, ending 48 min before sunrise
  // In Celestial mode sunriseH = solar noon − 6h, so BM correctly anchors to celestial sunrise
  const bmStart = times.sunriseH - 96 / 60,
    bmEnd = times.sunriseH - 48 / 60;
  document.getElementById("bm-start").textContent = fmtHour(
    bmStart < 0 ? bmStart + 24 : bmStart,
  );
  document.getElementById("bm-end").textContent = fmtHour(
    bmEnd < 0 ? bmEnd + 24 : bmEnd,
  );
  document.getElementById("rh-sunrise").textContent = times.sunrise;
  const skStart = times.sunsetH - 24 / 60,
    skEnd = times.sunsetH + 24 / 60;
  document.getElementById("sk-start").textContent = fmtHour(skStart);
  document.getElementById("sk-end").textContent = fmtHour(
    skEnd > 24 ? skEnd - 24 : skEnd,
  );
  document.getElementById("rh-sunset").textContent = times.sunset;
}
function initSunTimes() {
  // ARCHITECTURE: initSunTimes only reads coordinates saved by the GPS Location toggle.
  // It never triggers its own geolocation request — the GPS toggle is the sole source.
  const savedLat = App.S && App.S.lastLat;
  const savedLng = App.S && App.S.lastLng;
  if (savedLat && savedLng) {
    window._appLat = savedLat; window._appLng = savedLng; // seed for Vedic Panchanga
    // GPS toggle was ON and coords are saved — use them
    updateSunInfo(savedLat, savedLng);
    setInterval(() => updateSunInfo(savedLat, savedLng), 600000);
  } else {
    // GPS toggle is OFF — clear all time displays, show nothing fake
    ["bm-start","bm-end","rh-sunrise","sk-start","sk-end","rh-sunset"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "—";
    });
  }
}

// ── PWA Manifest ──
function buildPwaManifest() {
  const img = document.getElementById("appIconImg");
  function attach() {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#060D1F";
      ctx.fillRect(0, 0, 512, 512);
      ctx.save();
      ctx.beginPath();
      ctx.arc(256, 256, 256, 0, Math.PI * 2);
      ctx.clip();
      const s = Math.min(img.naturalWidth || 512, img.naturalHeight || 512);
      ctx.drawImage(img, (img.naturalWidth - s) / 2, 0, s, s, 0, 0, 512, 512);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,215,0,0.55)";
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.arc(256, 256, 248, 0, Math.PI * 2);
      ctx.stroke();
      const url = c.toDataURL("image/png");
      const mf = {
        name: "Radha Naam Jap",
        short_name: "Radha Jap",
        description: "Jai Shri Radha",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#060D1F",
        theme_color: "#060D1F",
        icons: [
          {
            src: url,
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: url,
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      };
      const blob = new Blob([JSON.stringify(mf)], {
        type: "application/manifest+json",
      });
      const lnk = document.createElement("link");
      lnk.rel = "manifest";
      lnk.href = URL.createObjectURL(blob);
      document.head.appendChild(lnk);
      document
        .querySelectorAll('link[rel*="icon"],link[rel="apple-touch-icon"]')
        .forEach((l) => l.remove());
      const ati = document.createElement("link");
      ati.rel = "apple-touch-icon";
      ati.sizes = "512x512";
      ati.href = url;
      document.head.appendChild(ati);
      const ico = document.createElement("link");
      ico.rel = "icon";
      ico.type = "image/png";
      ico.href = url;
      document.head.appendChild(ico);
    } catch (e) {}
  }
  if (img && img.complete && img.naturalWidth) attach();
  else if (img) img.addEventListener("load", attach);
  else setTimeout(buildPwaManifest, 100);
}

// ── Collapsible: Occasion Names form ──
function toggleOccForm() {
  const body = document.getElementById("occFormBody");
  const chevron = document.getElementById("occChevron");
  if (!body) return;
  const isOpen = body.classList.toggle("open");
  if (chevron)
    chevron.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
}

// ── Collapsible: Add Stotram form ──
function toggleAsfForm(forceOpen) {
  const body = document.getElementById("asfBody");
  const chevron = document.getElementById("asfChevron");
  if (!body) return;
  const isOpen =
    forceOpen !== undefined ? forceOpen : !body.classList.contains("open");
  body.classList.toggle("open", isOpen);
  if (chevron)
    chevron.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
}

// ── Collapsible: Mark as Broken ──
function toggleBrkCollapse() {
  const body = document.getElementById("brkBody");
  const chevron = document.getElementById("brkChevron");
  if (!body) return;
  const isOpen = body.classList.toggle("open");
  if (chevron)
    chevron.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
}

// ─────────────────────────────────────────────────────────
// ACTIVITY LOG — records every action with Unix timestamp

// ─────────────────────────────────────────────────────────
function logActivity(entry) {
  if (!App.S.activityLog) App.S.activityLog = [];
  App.S.activityLog.push(entry);
  // Keep last 2000 entries in memory (~200KB) — still within Firestore 1MB doc limit
  // Older entries are archived per-day in activityLogArchive IDB store (no limit).
  // getLifetimeActivityLog() merges archive + in-memory for full history.
  if (App.S.activityLog.length > 2000) {
    App.S.activityLog = App.S.activityLog.slice(-2000);
  }
  // Debounced save — don't save on every single tap, batch with existing save
  // App.save() is already called by the caller (malaOk, pauseTimer etc)
}

// ── INIT ──
window.addEventListener("load", async () => {


  await App.load();
  App.lmc = Math.floor(App.gTod() / (App.S.ms || 108));
  App.lm28 = Math.floor((App.S.h28[App.S.tk] || 0) / (App.S.ms || 108));
  App.lmcRV = Math.floor((App.S.historyRV[App.S.tk] || 0) / (App.S.ms || 108));
  App.lmcHK = Math.floor(
    ((App.S.historyHK || {})[App.S.tk] || 0) / (App.S.ms || 108),
  );
  if (App.S.gaudiyaMode) document.body.classList.add("gaudiya-mode");

  // Timer always starts from 0 on each app open.
  // timerSavedSeconds tracks what's already committed to timerHistory this session.
  App.timerSeconds = 0;
  App.timerSavedSeconds = 0;
  App._malaTimerStart = 0; // timer-based anchor for mala duration (authoritative clock)
  // Restore wall-clock mala start for cross-session timing
  const savedMalaWall = localStorage.getItem("rjap_malaWallStart");
  const todayCount = App.gTod();
  const ms = App.S.ms || 108;
  const countInCurrentMala = todayCount % ms;
  if (savedMalaWall && countInCurrentMala > 0) {
    App.malaWallStart = parseInt(savedMalaWall);
    // Mala in progress → restore active-tap timer so duration accumulates correctly
    const savedTS = parseInt(localStorage.getItem("rjap_timerSeconds") || "0");
    const savedMTS = parseInt(localStorage.getItem("rjap_malaTimerStart") || "0");
    if (!isNaN(savedTS) && savedTS > 0) {
      App.timerSeconds = savedTS;
      App.timerSavedSeconds = savedTS;
    }
    if (!isNaN(savedMTS)) App._malaTimerStart = savedMTS;
  } else {
    App.malaWallStart = Date.now();
    localStorage.setItem("rjap_malaWallStart", String(App.malaWallStart));
    localStorage.removeItem("rjap_timerSeconds");
    localStorage.removeItem("rjap_malaTimerStart");
  }
  document.getElementById("timerDisplay").textContent = "00:00:00";

  // Apply settings UI
  if (App.S.cfg.sound) document.getElementById("tgSnd").classList.add("on");
  const tgVibEl = document.getElementById("tgVib");
  if (tgVibEl) { App.S.cfg.vib ? tgVibEl.classList.add("on") : tgVibEl.classList.remove("on"); }

  // GPS Location toggle — persist across refreshes via localStorage flag.
  // Never auto-request geolocation permission on app load (the user enables it
  // manually from settings). Toggle state survives refresh / re-open even for
  // guest users (who don't persist App.S), as long as data is not cleared.
  const tgGpsInit = document.getElementById("tgGpsLocation");
  if (tgGpsInit) {
    let lsGpsOn = false, lsLat = null, lsLng = null;
    try {
      lsGpsOn = localStorage.getItem("rjap_gps_enabled") === "1";
      const _la = parseFloat(localStorage.getItem("rjap_lastLat"));
      const _ln = parseFloat(localStorage.getItem("rjap_lastLng"));
      if (!isNaN(_la) && !isNaN(_ln)) { lsLat = _la; lsLng = _ln; }
    } catch(e) {}
    // Backfill App.S coords from localStorage if missing (e.g. guest mode).
    if (App.S && (App.S.lastLat == null || App.S.lastLng == null) && lsLat != null) {
      App.S.lastLat = lsLat; App.S.lastLng = lsLng;
    }
    // Backfill localStorage from App.S for users who enabled GPS before this fix.
    if (!lsGpsOn && App.S && App.S.lastLat != null && App.S.lastLng != null) {
      try {
        localStorage.setItem("rjap_gps_enabled", "1");
        localStorage.setItem("rjap_lastLat", String(App.S.lastLat));
        localStorage.setItem("rjap_lastLng", String(App.S.lastLng));
      } catch(e) {}
      lsGpsOn = true;
    }
    const hasCoords = App.S && App.S.lastLat != null && App.S.lastLng != null;
    const gpsOn = lsGpsOn || hasCoords;
    if (gpsOn) tgGpsInit.classList.add("on");
    const gpsStatusEl = document.getElementById("gpsLocationStatus");
    if (gpsStatusEl) {
      gpsStatusEl.textContent = hasCoords
        ? "✅ Location saved · " + Number(App.S.lastLat).toFixed(3) + ", " + Number(App.S.lastLng).toFixed(3)
        : (gpsOn ? "📍 GPS enabled — tap toggle to refresh location" : "— Tap toggle to detect your location 📍");
    }
    // Do NOT auto-request geolocation on app load — only when the user taps the GPS toggle.
  }

  // Live previews for stats inputs
  [
    "manualJapIn",
    "prevJapIn",
    "deductTodayIn",
    "deductOtherIn",
    "deductOtherDate",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", uStats);
  });
  const dtIn = document.getElementById("dtIn");
  const ltIn = document.getElementById("ltIn");
  if (dtIn)
    dtIn.addEventListener("input", function () {
      document.getElementById("dtMala").textContent = Math.ceil(
        (parseInt(this.value) || 0) / (App.S.ms || 108),
      );
    });
  if (ltIn)
    ltIn.addEventListener("input", function () {
      document.getElementById("ltMala").textContent = Math.ceil(
        (parseInt(this.value) || 0) / (App.S.ms || 108),
      ).toLocaleString();
    });

  App.ua();
  initJapModeUI();
  fbInit();
  initSunTimes();
  buildPwaManifest();
  // (ensures correct dates even if settings were changed on another device)
  // Persist the cleaned occasions immediately
  App.save();
  fbDebouncedPush();

  // Trigger auto-backup check
  setTimeout(checkAutoBackup, 2000);

  // Push leaderboard on fresh open so "Today" tab never shows stale yesterday data.
  // Runs after cloud hydration completes (which happens inside fbInit → fbPull).
  // A 6-second delay gives fbPull time to finish before we push.
  setTimeout(() => {
    const lastLbPushDate = localStorage.getItem('rjap_lastLbPushDate') || '';
    const todayKey = App.S.tk || App.getTk();
    if (lastLbPushDate !== todayKey && typeof pushLeaderboard === 'function') {
      pushLeaderboard().then(() => {
        localStorage.setItem('rjap_lastLbPushDate', todayKey);
      }).catch(() => {});
    }
  }, 6000);

  // Hide loading — guaranteed cleanup
  setTimeout(() => {
    const ls = document.getElementById("ls");
    if (ls) {
      ls.classList.add("hide");
      setTimeout(() => {
        if (ls.parentNode) ls.parentNode.removeChild(ls);
      }, 900);
    }
  }, 5000);
});

// ═══════════════════════════════════════════════════════
// PWA ONE-CLICK INSTALL MODAL — stable, single-fire
// ═══════════════════════════════════════════════════════
let deferredPrompt = null;
let _installBannerShownThisSession = false;
let _installShowTimer = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Already shown this session — just keep the prompt fresh, don't show again
  if (_installBannerShownThisSession) return;
  // Already installed (standalone mode)
  if (window.matchMedia("(display-mode: standalone)").matches) return;
  // Dismissed within last 3 days
  const dismissed = localStorage.getItem("installBannerDismissed");
  if (dismissed && Date.now() - Number(dismissed) < 3 * 24 * 60 * 60 * 1000) return;

  // Cancel any pending timer so SW_READY can't double-fire
  if (_installShowTimer) { clearTimeout(_installShowTimer); _installShowTimer = null; }

  _installShowTimer = setTimeout(() => {
    _installShowTimer = null;
    if (_installBannerShownThisSession) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    _installBannerShownThisSession = true;
    showInstallModal();
  }, 3000);
});

function showInstallModal() {
  // Only show once — guard against any duplicate calls
  if (document.getElementById("installModal")) return;

  const modal = document.createElement("div");
  modal.id = "installModal";
  modal.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);
    display:flex;align-items:center;justify-content:center;
    padding:20px;opacity:0;transition:opacity 0.35s ease;
  `;
  modal.innerHTML = `
    <div id="installModalCard" style="
      background:linear-gradient(160deg,#0d1f3c 0%,#060D1F 100%);
      border:1.5px solid rgba(255,215,0,0.38);
      border-radius:24px;padding:30px 22px 24px;
      width:100%;max-width:360px;
      box-shadow:0 0 60px rgba(255,215,0,0.18),0 20px 60px rgba(0,0,0,0.7);
      transform:scale(0.93) translateY(18px);
      transition:transform 0.38s cubic-bezier(0.34,1.5,0.64,1);
      text-align:center;
    ">
      <img src="./icon-192.png" style="width:72px;height:72px;border-radius:18px;margin-bottom:14px;box-shadow:0 0 28px rgba(255,215,0,0.35);">
      <div style="font-family:'Cinzel Decorative',serif;font-size:17px;color:#FFD700;letter-spacing:1px;margin-bottom:6px;">Radha Naam Jap</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;margin-bottom:22px;font-family:Inter,sans-serif;">
        Press <b style="color:#FFD700">Install</b> to get an app icon on your Home Screen for quick, easy access — for offline use 🙏
      </div>
      <button id="installModalBtn" style="
        display:block;width:100%;padding:15px;margin-bottom:11px;
        background:linear-gradient(135deg,#FFD700 0%,#FFAA00 60%,#FF8C00 100%);
        color:#1a0800;border:none;border-radius:14px;
        font-size:15px;font-weight:800;letter-spacing:0.4px;
        font-family:'Cinzel Decorative',serif;cursor:pointer;
        box-shadow:0 4px 22px rgba(255,180,0,0.45),0 1px 0 rgba(255,255,255,0.25) inset;
        transition:transform 0.12s,box-shadow 0.12s;
      ">📲 Install</button>
      <button id="installModalDismiss" style="
        display:block;width:100%;padding:13px;
        background:linear-gradient(135deg,rgba(74,144,226,0.22),rgba(40,90,180,0.18));
        color:#6DB8FF;border:1.5px solid rgba(74,144,226,0.35);border-radius:14px;
        font-size:14px;font-weight:600;
        font-family:Inter,sans-serif;cursor:pointer;
        box-shadow:0 2px 12px rgba(74,144,226,0.12);
        transition:background 0.15s;
      ">Add To Homescreen Later — Not Now</button>
    </div>
  `;

  document.body.appendChild(modal);

  // Animate in
  requestAnimationFrame(() => requestAnimationFrame(() => {
    modal.style.opacity = "1";
    const card = document.getElementById("installModalCard");
    if (card) card.style.transform = "scale(1) translateY(0)";
  }));

  const btn = document.getElementById("installModalBtn");
  const dis = document.getElementById("installModalDismiss");
  if (btn) {
    btn.addEventListener("pointerdown", () => { btn.style.transform = "scale(0.97)"; });
    btn.addEventListener("pointerup", () => { btn.style.transform = "scale(1)"; });
    btn.addEventListener("click", triggerInstall);
  }
  if (dis) dis.addEventListener("click", dismissInstallModal);
}

function _closeInstallModal() {
  const m = document.getElementById("installModal");
  if (!m) return;
  m.style.opacity = "0";
  const card = document.getElementById("installModalCard");
  if (card) card.style.transform = "scale(0.93) translateY(18px)";
  setTimeout(() => { if (m.parentNode) m.parentNode.removeChild(m); }, 380);
}

function triggerInstall() {
  if (!deferredPrompt) {
    toast('ব্রাউজার মেনু থেকে "Add to Home Screen" বেছে নিন 🙏');
    dismissInstallModal();
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(() => {
    deferredPrompt = null;
    dismissInstallModal();
  });
}

function dismissInstallModal() {
  _closeInstallModal();
  localStorage.setItem("installBannerDismissed", Date.now());
}

// Legacy alias (in case anything still calls old name)
function dismissInstallBanner() { dismissInstallModal(); }
function showInstallBanner() { showInstallModal(); }

window.addEventListener("appinstalled", () => { _closeInstallModal(); });

// ── Cache-bust IIFE removed ──────────────────────────────────────────────────
// Vercel serves fresh files on every deploy; the SW handles cache invalidation
// via its CACHE version string (radha-jap-v107). The old IIFE was doing an
// extra location.replace() that caused the app to visibly reload twice on first
// open after a new deploy. Removed entirely — no user-visible impact.
// ─────────────────────────────────────────────────────────────────────────────

// Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((r) => {
        console.log("SW registered:", r.scope);

        // ── SW update path ──────────────────────────────────────────────────
        // We listen for SW_UPDATED message (sent by the new SW on activate).
        // We do NOT also listen on updatefound/statechange — that would fire a
        // second reload on the same page load, causing the install popup flicker.
        // One reload path only: the SW_UPDATED message below.
        // ────────────────────────────────────────────────────────────────────
      })
      .catch((e) => console.warn("SW registration failed:", e.message));

    navigator.serviceWorker.addEventListener("message", (e) => {
      // ── SW_UPDATED: new SW activated — reload ONLY if this page is older than
      // 6 seconds (fresh loads already have the new files from the SW install
      // step and don't need a reload). Guard with sessionStorage against double-fire.
      if (e.data && e.data.type === "SW_UPDATED") {
        if (sessionStorage.getItem("sw_reloaded") === e.data.version) return;
        sessionStorage.setItem("sw_reloaded", e.data.version);
        const pageAge = performance.now(); // ms since page navigation start
        if (pageAge < 6000) {
          // Page is brand-new — SW already served fresh files, no reload needed
          console.log("[SW] SW_UPDATED ignored — page is fresh (<6s old)");
          return;
        }
        console.log("[SW] SW_UPDATED — scheduling reload for fresh content");
        // Small delay so any in-flight saves/renders finish cleanly
        setTimeout(() => window.location.reload(), 800);
      }
    });

    // ── SW_READY path: SW was already controlling when this page loaded ──────
    // This fires when the page is a fresh load under an already-active SW
    // (not a reload triggered by SW_UPDATED). Safe to show install modal here
    // because beforeinstallprompt's own 3s timer is the primary trigger; this
    // is only a fallback for cases where beforeinstallprompt already fired
    // before the SW registration promise resolved.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // controllerchange fires when a new SW claims this client.
      // This is the correct signal that a new SW is now in control.
      // The SW_UPDATED message handles the reload; nothing extra needed here.
      console.log("[SW] controllerchange — new SW is now controlling");
    });
  });
}

// ══════════════════════════════════════════════M��════════
// GURUDEV PHOTO FALLBACK — beautiful canvas placeholder
// if base64 is truncated/missing
// ═══════════════════════════════════════════════════════
function drawGuruDevFallback(img) {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 440;
    const ctx = c.getContext("2d");
    // Deep blue background
    const bg = ctx.createRadialGradient(220, 180, 10, 220, 220, 220);
    bg.addColorStop(0, "#0A1535");
    bg.addColorStop(1, "#060D1F");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 440, 440);
    // Gold circle border
    ctx.beginPath();
    ctx.arc(220, 220, 210, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,215,0,0.6)";
    ctx.lineWidth = 4;
    ctx.stroke();
    // Lotus / OM symbol in gold
    ctx.fillStyle = "rgba(255,215,0,0.15)";
    ctx.beginPath();
    ctx.arc(220, 220, 160, 0, Math.PI * 2);
    ctx.fill();
    // OM text
    ctx.font = "bold 120px serif";
    ctx.fillStyle = "rgba(255,215,0,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ॐ", 220, 210);
    // Name text
    ctx.font = "bold 22px serif";
    ctx.fillStyle = "rgba(255,215,0,0.9)";
    ctx.fillText("Shri Hit Premanand Ji", 220, 310);
    ctx.font = "16px serif";
    ctx.fillStyle = "rgba(109,184,255,0.8)";
    ctx.fillText("Jai Shri Radha", 220, 345);
    img.src = c.toDataURL("image/png");
  } catch (e) {
    img.style.background = "linear-gradient(135deg,#0A1535,#2255CC)";
    img.src = "";
    img.alt = "ॐ";
  }
}

// Run fallback on load too in case base64 is partially broken
window.addEventListener("load", function () {
  const img = document.getElementById("guruImg");
  if (img && (!img.complete || img.naturalWidth === 0)) {
    drawGuruDevFallback(img);
  }
});


// ═══════════════════════════════════════════════════════

// ── NKC/GMS: detect if a verse is a "prose block" (narrative, not a stotram verse)
// Prose blocks: no ॥ or । punctuation, or contain verse markers like বললেন / গোস্বামী
function _isProseBlock(verse) {
  const hasVerseMarker = /[॥।]/.test(verse) || /\d+\s*[।॥]/.test(verse);
  const longProse = verse.length > 180 && !hasVerseMarker;
  return longProse;
}

// ── IDs that support translation (অনুবাদ) button
const TRANSLATION_IDS = ["nkc", "gms", "rsn", "svb"];
// ── IDs where prose sections need vertical-scroll mode
const PROSE_IDS = ["nkc"];

// ── Sectioned-stotram picker (svb, blv, …) lives in stotrams.js ─────────────

// ── showLyrics — watery card swipe reader ──
let _verses = [],
  _verseIdx = 0,
  _currentStotramId = "";
let _translationVisible = false;
// Global preference set from the Stotram list screen toggle
let _globalTranslationPref = false;

function setGlobalTranslation(on) {
  _globalTranslationPref = on;
  // Sync the toggle UI on list screen
  var sw = document.getElementById("st-global-toggle-sw");
  if (sw) {
    sw.className = "lm-toggle-sw" + (on ? " on" : "");
    sw.setAttribute("aria-checked", on ? "true" : "false");
  }
  var lbl = document.getElementById("st-global-toggle-label");
  if (lbl) lbl.textContent = on ? "অনুবাদ: চালু" : "অনুবাদ: বন্ধ";
}

// ── Devotional SVG decorations ────────────────────────────────
// Trishul top for Shiv stotrams
const SVG_TRISHUL_TOP = `<svg width="140" height="54" viewBox="0 0 140 54" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- horizontal vine bar -->
  <path d="M10 36 Q35 28 60 33 Q70 35 80 33 Q105 28 130 36" stroke="#8B5E00" stroke-width="1.4" fill="none" opacity="0.7"/>
  <!-- left flourish -->
  <path d="M10 36 Q4 30 8 24 Q12 18 8 14" stroke="#8B5E00" stroke-width="1.2" fill="none" opacity="0.6"/>
  <circle cx="8" cy="13" r="2" fill="#8B5E00" opacity="0.5"/>
  <!-- right flourish mirror -->
  <path d="M130 36 Q136 30 132 24 Q128 18 132 14" stroke="#8B5E00" stroke-width="1.2" fill="none" opacity="0.6"/>
  <circle cx="132" cy="13" r="2" fill="#8B5E00" opacity="0.5"/>
  <!-- OM symbol centre -->
  <text x="70" y="20" text-anchor="middle" font-size="22" fill="#7a3d00" opacity="0.80" font-family="serif">ॐ</text>
  <!-- trishul above OM -->
  <g transform="translate(70,2) scale(0.55)" opacity="0.75">
    <!-- centre prong -->
    <line x1="0" y1="-16" x2="0" y2="4" stroke="#7a3d00" stroke-width="2.2" stroke-linecap="round"/>
    <!-- left prong -->
    <path d="M0 0 Q-7 -4 -7 -12 Q-7 -18 -3 -16" stroke="#7a3d00" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <!-- right prong -->
    <path d="M0 0 Q7 -4 7 -12 Q7 -18 3 -16" stroke="#7a3d00" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <!-- base crossbar -->
    <line x1="-5" y1="2" x2="5" y2="2" stroke="#7a3d00" stroke-width="1.8" stroke-linecap="round"/>
  </g>
  <!-- side leaf pairs -->
  <path d="M38 30 Q32 22 40 20 Q42 28 38 30Z" fill="#8B5E00" opacity="0.35"/>
  <path d="M102 30 Q108 22 100 20 Q98 28 102 30Z" fill="#8B5E00" opacity="0.35"/>
</svg>`;

// Radha symbol (paisley/mor-pankh style) top for Radha/Krishna stotrams
const SVG_RADHA_TOP = `<svg width="140" height="54" viewBox="0 0 140 54" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- horizontal vine bar -->
  <path d="M10 38 Q35 30 60 35 Q70 37 80 35 Q105 30 130 38" stroke="#1a3a80" stroke-width="1.4" fill="none" opacity="0.6"/>
  <!-- left flourish -->
  <path d="M10 38 Q4 32 8 26 Q12 20 8 16" stroke="#1a3a80" stroke-width="1.2" fill="none" opacity="0.55"/>
  <circle cx="8" cy="15" r="2" fill="#1a3a80" opacity="0.45"/>
  <!-- right flourish -->
  <path d="M130 38 Q136 32 132 26 Q128 20 132 16" stroke="#1a3a80" stroke-width="1.2" fill="none" opacity="0.55"/>
  <circle cx="132" cy="15" r="2" fill="#1a3a80" opacity="0.45"/>
  <!-- Radha paisley at centre -->
  <g transform="translate(70,6)" opacity="0.82">
    <!-- paisley body -->
    <path d="M0 0 C6 -8 12 -14 8 -22 C4 -30 -4 -28 -6 -20 C-8 -12 -4 -4 0 0Z" stroke="#1a3a80" stroke-width="1.6" fill="rgba(26,58,128,0.12)"/>
    <!-- inner curl -->
    <path d="M0 0 C2 -6 4 -10 2 -16" stroke="#1a3a80" stroke-width="1" fill="none"/>
    <!-- lotus base -->
    <path d="M-6 2 Q0 -2 6 2" stroke="#1a3a80" stroke-width="1.4" fill="none"/>
    <circle cx="0" cy="3" r="2.2" fill="#1a3a80" opacity="0.5"/>
  </g>
  <!-- mini peacock eye dots flanking -->
  <circle cx="46" cy="28" r="3.5" stroke="#1a3a80" stroke-width="1.2" fill="rgba(26,58,128,0.15)" opacity="0.7"/>
  <circle cx="46" cy="28" r="1.5" fill="#1a3a80" opacity="0.6"/>
  <circle cx="94" cy="28" r="3.5" stroke="#1a3a80" stroke-width="1.2" fill="rgba(26,58,128,0.15)" opacity="0.7"/>
  <circle cx="94" cy="28" r="1.5" fill="#1a3a80" opacity="0.6"/>
  <!-- leaf pairs -->
  <path d="M38 32 Q32 24 40 22 Q42 30 38 32Z" fill="#1a3a80" opacity="0.30"/>
  <path d="M102 32 Q108 24 100 22 Q98 30 102 32Z" fill="#1a3a80" opacity="0.30"/>
</svg>`;

// Peacock feather bottom for Radha/Krishna stotrams
const SVG_PEACOCK_BOTTOM = `<svg width="160" height="48" viewBox="0 0 160 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- centre lotus divider line -->
  <line x1="20" y1="12" x2="62" y2="12" stroke="#1a3a80" stroke-width="1" opacity="0.45"/>
  <line x1="98" y1="12" x2="140" y2="12" stroke="#1a3a80" stroke-width="1" opacity="0.45"/>
  <!-- lotus centre -->
  <path d="M80 4 Q74 10 76 16 Q80 14 84 16 Q86 10 80 4Z" fill="rgba(26,58,128,0.35)" opacity="0.75"/>
  <path d="M73 8 Q70 14 74 18 Q77 16 77 12Z"  fill="rgba(26,58,128,0.25)" opacity="0.65"/>
  <path d="M87 8 Q90 14 86 18 Q83 16 83 12Z"  fill="rgba(26,58,128,0.25)" opacity="0.65"/>
  <!-- left peacock feather -->
  <path d="M62 12 Q48 8 36 20 Q28 30 34 38" stroke="#1a4a20" stroke-width="1.4" fill="none" opacity="0.6"/>
  <path d="M62 12 Q52 6 44 18 Q40 26 44 34" stroke="#2a6a30" stroke-width="1" fill="none" opacity="0.5"/>
  <ellipse cx="34" cy="38" rx="5" ry="7" transform="rotate(-20,34,38)" fill="rgba(26,100,50,0.3)" stroke="#1a4a20" stroke-width="1" opacity="0.7"/>
  <ellipse cx="34" cy="38" rx="2.5" ry="3.5" transform="rotate(-20,34,38)" fill="rgba(10,40,160,0.55)" opacity="0.85"/>
  <!-- right peacock feather mirror -->
  <path d="M98 12 Q112 8 124 20 Q132 30 126 38" stroke="#1a4a20" stroke-width="1.4" fill="none" opacity="0.6"/>
  <path d="M98 12 Q108 6 116 18 Q120 26 116 34" stroke="#2a6a30" stroke-width="1" fill="none" opacity="0.5"/>
  <ellipse cx="126" cy="38" rx="5" ry="7" transform="rotate(20,126,38)" fill="rgba(26,100,50,0.3)" stroke="#1a4a20" stroke-width="1" opacity="0.7"/>
  <ellipse cx="126" cy="38" rx="2.5" ry="3.5" transform="rotate(20,126,38)" fill="rgba(10,40,160,0.55)" opacity="0.85"/>
</svg>`;

// Lotus bottom for Shiv stotrams
const SVG_SHIV_BOTTOM = `<svg width="160" height="36" viewBox="0 0 160 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="15" y1="10" x2="64" y2="10" stroke="#8B5E00" stroke-width="1" opacity="0.45"/>
  <line x1="96" y1="10" x2="145" y2="10" stroke="#8B5E00" stroke-width="1" opacity="0.45"/>
  <circle cx="80" cy="10" r="3" fill="#8B5E00" opacity="0.4"/>
  <!-- lotus petals -->
  <path d="M80 2 Q74 8 76 14 Q80 12 84 14 Q86 8 80 2Z" fill="rgba(139,90,0,0.40)"/>
  <path d="M73 5 Q68 12 72 16 Q76 14 75 10Z"            fill="rgba(139,90,0,0.28)"/>
  <path d="M87 5 Q92 12 88 16 Q84 14 85 10Z"            fill="rgba(139,90,0,0.28)"/>
  <path d="M67 9 Q63 16 68 18 Q72 16 70 12Z"            fill="rgba(139,90,0,0.20)"/>
  <path d="M93 9 Q97 16 92 18 Q88 16 90 12Z"            fill="rgba(139,90,0,0.20)"/>
  <!-- side scrollwork -->
  <path d="M15 10 Q10 6 14 3 Q18 1 16 6" stroke="#8B5E00" stroke-width="1" fill="none" opacity="0.45"/>
  <path d="M145 10 Q150 6 146 3 Q142 1 144 6" stroke="#8B5E00" stroke-width="1" fill="none" opacity="0.45"/>
</svg>`;
// ──────────────────────────────────────────────────────────────

function showLyrics(id) {
  const ly = getEffectiveLyrics(id);
  if (!ly) {
    toast("পাঠ্য পাওয়া যায়নি 🙏");
    return;
  }

  _currentStotramId = id;
  // Inherit the global translation preference set on the list screen
  _translationVisible = TRANSLATION_IDS.includes(id)
    ? _globalTranslationPref
    : false;

  // ── Sectioned stotrams (svb, blv, …): show section picker ──
  if (window.StotramSections && window.StotramSections.isSectioned(id)) {
    var stsCard = document.querySelector(".lm-water-card");
    if (stsCard) stsCard.setAttribute("data-theme", "radha");
    var stsLmo = document.getElementById("lmo");
    if (stsLmo) stsLmo.setAttribute("data-bg", "radha");
    window.StotramSections.show(id);
    return;
  }

  // Apply devotional theme to the card based on stotram deity
  (function () {
    var card = document.querySelector(".lm-water-card");
    if (!card) return;
    var shiv = ["bss", "ans", "rds", "sps"];
    var radha = ["hcj", "rks", "gms", "nkc", "vs2"];
    var lmo = document.getElementById("lmo");
    // Remove any previous decoration elements
    ["lm-deco-top", "lm-deco-bottom"].forEach(function (cid) {
      var old = document.getElementById(cid);
      if (old) old.remove();
    });
    var inner = card.querySelector(".lm-card-inner");

    function injectDeco(topSvg, botSvg) {
      if (inner && topSvg) {
        var t = document.createElement("div");
        t.id = "lm-deco-top";
        t.className = "lm-theme-top";
        t.innerHTML = topSvg;
        inner.insertBefore(t, inner.firstChild);
      }
      if (inner && botSvg) {
        var b = document.createElement("div");
        b.id = "lm-deco-bottom";
        b.className = "lm-theme-bottom";
        b.innerHTML = botSvg;
        inner.appendChild(b);
      }
    }

    if (shiv.indexOf(id) !== -1) {
      card.setAttribute("data-theme", "shiv");
      if (lmo) lmo.setAttribute("data-bg", "shiv");
      injectDeco(SVG_TRISHUL_TOP, SVG_SHIV_BOTTOM);
    } else if (radha.indexOf(id) !== -1) {
      card.setAttribute("data-theme", "radha");
      if (lmo) lmo.setAttribute("data-bg", "radha");
      injectDeco(SVG_RADHA_TOP, SVG_PEACOCK_BOTTOM);
    } else {
      card.removeAttribute("data-theme");
      if (lmo) lmo.removeAttribute("data-bg");
    }
  })();

  // Split by blank lines into verses
  let allVerses = ly
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  // Remove first verse if it's just the stotram title (for all except hcj)
  if (id !== "hcj" && allVerses.length > 0) {
    const firstV = allVerses[0];
    // Title verse: short (< 100 chars), no ।॥ markers, no numbered shloka
    const isTitle =
      firstV.length < 100 && !/[।॥]/.test(firstV) && !/শ্লোক/.test(firstV);
    if (isTitle) allVerses = allVerses.slice(1);
  }

  // Merge verses that are ONLY অর্থ: lines into the preceding verse.
  // This prevents standalone translation-only "pages" with no Sanskrit content.
  const mergedVerses = [];
  for (let i = 0; i < allVerses.length; i++) {
    const v = allVerses[i];
    const linesOnly = v.split("\n").filter((l) => l.trim().length > 0);
    const allArtha =
      linesOnly.length > 0 &&
      linesOnly.every((l) => /^অর্থ\s*:/.test(l.trim()));
    if (allArtha && mergedVerses.length > 0) {
      // Append to previous verse with a blank line separator
      mergedVerses[mergedVerses.length - 1] += "\n\n" + v;
    } else {
      mergedVerses.push(v);
    }
  }
  // Strip colophon final verse (e.g. ॥ ইতি ... সম্পূর্ণম্ ॥) for audio stotrams
  // so clip count matches exactly
  if (_AUDIO_STOTRAMS[id] && mergedVerses.length > 0) {
    const last = mergedVerses[mergedVerses.length - 1];
    const isColophon = last.trim().startsWith('॥') && last.trim().endsWith('॥') && last.split('\n').length <= 2;
    if (isColophon) mergedVerses.pop();
  }
  _verses = mergedVerses;
  _verseIdx = 0;
  _hcjStopAudio();

  const allSt = [
    ...STLIST,
    ...(App.S.customSt || []),
  ];
  const nm = allSt.find((x) => x.id === id);
  document.getElementById("lmTitle").textContent = nm ? nm.name : id;

  _renderVerse(0, null);
  document.getElementById("lmo").classList.add("show");
  _initSwipeHandler();
}

function _renderVerse(idx, dir) {
  const body = document.getElementById("lyrBody");
  const ctr = null;
  const prev = document.getElementById("lmPrev");
  const next = document.getElementById("lmNext");

  const verseText = _verses[idx] || "";
  const isProse =
    PROSE_IDS.includes(_currentStotramId) && _isProseBlock(verseText);
  const hasTranslation = TRANSLATION_IDS.includes(_currentStotramId);

  // Does this verse have any অর্থ: lines at all?
  const verseHasArtha = /^অর্থ\s*:/m.test(verseText);

  // Does this verse have any non-artha, non-empty content lines?
  const verseHasContent = verseText.split("\n").some((l) => {
    const t = l.trim();
    return t.length > 0 && !/^অর্থ\s*:/.test(t);
  });

  let linesHtml = "";
  if (isProse) {
    const escaped = verseText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    linesHtml = '<span class="lyr-prose">' + escaped + "</span>";
  } else {
    const rawLines = verseText.split("\n");
    linesHtml = rawLines
      .map((line) => {
        if (line.trim() === "") return '<span class="lyr-line-empty"></span>';
        const esc = line
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        if (/^অর্থ\s*:/.test(line.trim())) {
          // Only inject অর্থ: line when translation is ON
          if (!hasTranslation || !_translationVisible) return "";
          return '<span class="lyr-line lyr-artha">' + esc + "</span>";
        }
        return '<span class="lyr-line">' + esc + "</span>";
      })
      .join("");
  }

  // Decide if the card should be visible at all:
  // Hide it when: translation is OFF and the verse has ONLY অর্থ: lines (no Sanskrit content)
  const cardVisible =
    isProse || verseHasContent || (verseHasArtha && _translationVisible);
  const cardWrap = document.getElementById("lmb");
  if (cardWrap) cardWrap.style.visibility = cardVisible ? "" : "hidden";

  const footerHtml = '<div class="lyr-footer">❧ &nbsp; 🌸 &nbsp; ❧</div>';
  body.innerHTML = (cardVisible ? linesHtml : "") + footerHtml;

  // Re-inject SVG theme decorations (lost when innerHTML was rebuilt)
  _reinjectThemeDecos();

  // Toggle: only show when this verse actually has অর্থ: lines
  _renderTranslationToggle(verseHasArtha);

  body.classList.remove("lyr-slide-enter-left", "lyr-slide-enter-right");
  if (dir === 1) {
    void body.offsetWidth;
    body.classList.add("lyr-slide-enter-left");
  }
  if (dir === -1) {
    void body.offsetWidth;
    body.classList.add("lyr-slide-enter-right");
  }

  if (ctr) ctr.textContent = "VERSE " + (idx + 1) + " / " + _verses.length;
  prev.disabled = idx === 0;
  next.disabled = idx === _verses.length - 1;

  const inner = document.querySelector(".lm-card-inner");
  if (inner) {
    // Reset after the DOM has painted so mobile browsers do not fight an
    // in-progress user scroll while verse/audio UI is being re-rendered.
    requestAnimationFrame(function () {
      inner.scrollTop = 0;
    });
  }
  _hcjRenderPlayer(idx);
  _hcjOnVerseChange(idx);
}

// Render translation toggle — shown ONLY when current verse has অর্থ: lines.
// verseHasArtha: boolean passed from _renderVerse
function _renderTranslationToggle(verseHasArtha) {
  // Not a translatable stotram → always remove
  if (!TRANSLATION_IDS.includes(_currentStotramId)) {
    var old = document.getElementById("lm-translate-wrap");
    if (old) old.remove();
    return;
  }

  var existing = document.getElementById("lm-translate-wrap");

  // This verse has no অর্থ: → hide toggle (and reset translation state)
  if (!verseHasArtha) {
    if (existing) existing.style.display = "none";
    return;
  }

  // This verse has অর্থ: → show toggle
  if (existing) {
    existing.style.display = "";
    _syncToggleUI();
    return;
  }

  // First time — build the toggle
  const nav = document.getElementById("lmNav");
  if (!nav) return;

  var wrap = document.createElement("div");
  wrap.id = "lm-translate-wrap";
  wrap.className = "lm-translate-wrap";

  var label = document.createElement("span");
  label.className = "lm-toggle-label";
  label.textContent = "Translation";

  var sw = document.createElement("button");
  sw.id = "lm-toggle-sw";
  sw.className = "lm-toggle-sw" + (_translationVisible ? " on" : "");
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", _translationVisible ? "true" : "false");
  sw.innerHTML = '<span class="lm-toggle-thumb"></span>';
  sw.onclick = function () {
    _translationVisible = !_translationVisible;
    _renderVerse(_verseIdx, null);
  };

  wrap.appendChild(label);
  wrap.appendChild(sw);
  nav.parentNode.insertBefore(wrap, nav);
}

function _reinjectThemeDecos() {
  // Remove stale decos from previous render
  ["lm-deco-top", "lm-deco-bottom"].forEach(function (cid) {
    var old = document.getElementById(cid);
    if (old) old.remove();
  });
  var card = document.querySelector(".lm-water-card");
  if (!card) return;
  var theme = card.getAttribute("data-theme");
  if (!theme) return;
  var inner = card.querySelector(".lm-card-inner");
  if (!inner) return;

  var topSvg =
    theme === "shiv"
      ? SVG_TRISHUL_TOP
      : theme === "radha"
        ? SVG_RADHA_TOP
        : null;
  var botSvg =
    theme === "shiv"
      ? SVG_SHIV_BOTTOM
      : theme === "radha"
        ? SVG_PEACOCK_BOTTOM
        : null;

  if (topSvg) {
    var t = document.createElement("div");
    t.id = "lm-deco-top";
    t.className = "lm-theme-top";
    t.innerHTML = topSvg;
    inner.insertBefore(t, inner.firstChild);
  }
  if (botSvg) {
    var b = document.createElement("div");
    b.id = "lm-deco-bottom";
    b.className = "lm-theme-bottom";
    b.innerHTML = botSvg;
    inner.appendChild(b);
  }
}

function _syncToggleUI() {
  var sw = document.getElementById("lm-toggle-sw");
  if (!sw) return;
  sw.className = "lm-toggle-sw" + (_translationVisible ? " on" : "");
  sw.setAttribute("aria-checked", _translationVisible ? "true" : "false");
}

function _buildDots() {
  /* dots removed */
}

function verseNav(delta) {
  const newIdx = _verseIdx + delta;
  if (newIdx < 0 || newIdx >= _verses.length) return;
  _verseIdx = newIdx;
  _renderVerse(_verseIdx, delta > 0 ? 1 : -1);
}

function _initSwipeHandler() {
  // Horizontal swipe nav enabled for all stotrams EXCEPT hcj.
  // If enlarged text makes the lyric panel scrollable, touches that begin
  // inside that panel are reserved for native vertical scrolling.
  const card = document.getElementById("lmCard");
  if (!card) return;

  // Remove any previous swipe listeners
  card._swipeCleanup && card._swipeCleanup();

  if (_AUDIO_STOTRAMS[_currentStotramId]) return; // audio stotrams use their own player arrows

  let startX = 0,
    startY = 0,
    startedInScrollableLyrics = false;

  function onStart(e) {
    const t = e.touches ? e.touches[0] : e;
    startX = t.clientX;
    startY = t.clientY;
    const inner =
      e.target && e.target.closest ? e.target.closest(".lm-card-inner") : null;
    startedInScrollableLyrics = !!(
      inner && inner.scrollHeight > inner.clientHeight + 4
    );
  }
  function onEnd(e) {
    if (startedInScrollableLyrics) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      // Horizontal swipe detected — prevent vertical scroll conflict
      if (dx < 0)
        verseNav(1); // swipe left → next
      else verseNav(-1); // swipe right → prev
    }
  }

  card.addEventListener("touchstart", onStart, { passive: true });
  card.addEventListener("touchend", onEnd, { passive: true });

  card._swipeCleanup = function () {
    card.removeEventListener("touchstart", onStart);
    card.removeEventListener("touchend", onEnd);
  };
}

function closeLyrics() {
  var lmo = document.getElementById("lmo");
  lmo.classList.remove("show");
  lmo.removeAttribute("data-bg");
  var card = document.querySelector(".lm-water-card");
  if (card) card.removeAttribute("data-theme");
  /* Clean up HCJ player window listeners before destroying audio */
  if (_hcjPlayerCleanup) {
    _hcjPlayerCleanup();
    _hcjPlayerCleanup = null;
  }
  var pw = document.getElementById("hcj-player-wrap");
  if (pw) pw.remove();
  /* Reset scroll area bottom override set by _hcjRenderPlayer */
  var _lci = document.querySelector("#lmo .lm-card-inner");
  if (_lci) _lci.style.bottom = "";
  _hcjStopAudio();
  _verses = [];
  _verseIdx = 0;
  _currentStotramId = "";
  _translationVisible = false;
  if (window.StotramSections) window.StotramSections.reset();
  var oldWrap = document.getElementById("lm-translate-wrap");
  if (oldWrap) oldWrap.remove();
  var navBar = document.getElementById("lmNav");
  if (navBar) navBar.style.display = "";
  var lmb = document.getElementById("lmb");
  if (lmb) lmb.style.display = "";
}

// ═══════════════════════════════════════════════════════

// HCJ AUDIO ENGINE
var _hcjAudio = null,
  _hcjMode = "manual",
  _hcjPlaying = false,
  _hcjAudioIdx = -1;
var _hcjRafId = null; // requestAnimationFrame id for progress bar
var _hcjPlayerCleanup = null; // cleanup fn for window listeners added in _hcjRenderPlayer

// Audio clip path — works for any stotram that has audio clips
var _AUDIO_STOTRAMS = {
  hcj: { prefix: "hcj" },
  bss: { prefix: "bss" }
};
function _hcjAudioPath(i) {
  var cfg = _AUDIO_STOTRAMS[_currentStotramId];
  var prefix = cfg ? cfg.prefix : "hcj";
  return "audio/" + prefix + "_" + (i + 1) + ".mp3";
}

// Format seconds → m:ss
function _hcjFmtTime(s) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  var m = Math.floor(s / 60),
    sec = Math.floor(s % 60);
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}

// RAF loop — updates progress bar & timestamps every frame while playing
function _hcjProgressLoop() {
  _hcjUpdateProgress();
  if (_hcjAudio && !_hcjAudio.paused) {
    _hcjRafId = requestAnimationFrame(_hcjProgressLoop);
  } else {
    _hcjRafId = null;
  }
}

function _hcjStartProgressLoop() {
  if (_hcjRafId) return; // already running
  _hcjRafId = requestAnimationFrame(_hcjProgressLoop);
}

function _hcjStopProgressLoop() {
  if (_hcjRafId) {
    cancelAnimationFrame(_hcjRafId);
    _hcjRafId = null;
  }
}

function _hcjUpdateProgress() {
  var bar = document.getElementById("hcj-prog-fill");
  var thumb = document.getElementById("hcj-prog-thumb");
  var cur = document.getElementById("hcj-time-cur");
  var tot = document.getElementById("hcj-time-tot");
  if (!bar) return;
  if (_hcjAudio && _hcjAudio.duration > 0) {
    var pct = (_hcjAudio.currentTime / _hcjAudio.duration) * 100;
    bar.style.width = pct + "%";
    if (thumb) thumb.style.left = pct + "%";
    if (cur) cur.textContent = _hcjFmtTime(_hcjAudio.currentTime);
    if (tot) tot.textContent = _hcjFmtTime(_hcjAudio.duration);
  } else {
    bar.style.width = "0%";
    if (thumb) thumb.style.left = "0%";
    if (cur) cur.textContent = "0:00";
    if (tot) tot.textContent = "0:00";
  }
}

function _hcjStopAudio() {
  _hcjStopProgressLoop();
  if (_hcjAudio) {
    _hcjAudio.pause();
    _hcjAudio.onended = null;
    _hcjAudio = null;
  }
  _hcjPlaying = false;
  _hcjAudioIdx = -1;
  _hcjSyncUI();
  _hcjUpdateProgress();
  if (window._lyrHcjAudioChanged) window._lyrHcjAudioChanged(null, false);
}
function _hcjPauseAudio() {
  /* True pause — keeps the audio element and current position */
  _hcjStopProgressLoop();
  if (_hcjAudio) _hcjAudio.pause();
  _hcjPlaying = false;
  _hcjSyncUI();
  if (window._lyrHcjAudioChanged) window._lyrHcjAudioChanged(_hcjAudio, false);
}
function _hcjPlayVerse(idx) {
  _hcjStopProgressLoop();
  if (_hcjAudio) {
    _hcjAudio.pause();
    _hcjAudio.onended = null;
    _hcjAudio = null;
  }
  _hcjAudio = new Audio(_hcjAudioPath(idx));
  _hcjAudioIdx = idx;
  _hcjAudio.loop = _hcjMode === "loop";
  _hcjAudio.onended = function () {
    _hcjStopProgressLoop();
    if (_hcjMode === "continue" && idx + 1 < _verses.length) {
      _verseIdx = idx + 1;
      _renderVerse(_verseIdx, 1);
      _hcjPlayVerse(_verseIdx);
    } else {
      _hcjPlaying = false;
      _hcjAudioIdx = -1;
      _hcjSyncUI();
      _hcjUpdateProgress();
      if (window._lyrHcjAudioChanged) window._lyrHcjAudioChanged(null, false);
    }
  };
  _hcjAudio
    .play()
    .then(function () {
      _hcjPlaying = true;
      _hcjSyncUI();
      _hcjStartProgressLoop();
      if (window._lyrHcjAudioChanged)
        window._lyrHcjAudioChanged(_hcjAudio, true);
    })
    .catch(function () {
      _hcjPlaying = false;
      _hcjAudioIdx = -1;
      _hcjSyncUI();
    });
}
function _hcjTogglePlay() {
  if (_hcjPlaying) {
    /* True pause — keeps position so Resume works */
    _hcjPauseAudio();
  } else if (_hcjAudio && _hcjAudioIdx === _verseIdx) {
    /* Resume from paused position (same verse, audio element still exists) */
    _hcjAudio
      .play()
      .then(function () {
        _hcjPlaying = true;
        _hcjSyncUI();
        _hcjStartProgressLoop();
        if (window._lyrHcjAudioChanged)
          window._lyrHcjAudioChanged(_hcjAudio, true);
      })
      .catch(function () {
        _hcjPlaying = false;
        _hcjSyncUI();
      });
  } else {
    /* Start fresh for this verse */
    _hcjPlayVerse(_verseIdx);
  }
}
function _hcjSetMode(mode) {
  // Toggle off back to manual if the same mode button is tapped again
  _hcjMode = _hcjMode === mode ? "manual" : mode;
  if (_hcjAudio) _hcjAudio.loop = _hcjMode === "loop";
  _hcjSyncUI();
}
// Called whenever the displayed verse changes — keep audio in sync.
function _hcjOnVerseChange(idx) {
  if (!_AUDIO_STOTRAMS[_currentStotramId]) return;
  if (_hcjPlaying && _hcjAudioIdx !== idx) {
    _hcjPlayVerse(idx);
  }
  var si = document.getElementById("hcj-seek-input");
  if (si) si.value = idx + 1;
}
function _hcjGoToVerse(n) {
  var i = parseInt(n) - 1;
  if (isNaN(i) || i < 0 || i >= _verses.length) return;
  _verseIdx = i;
  _renderVerse(i, 0);
}
function _hcjSyncUI() {
  // ▶ play button — dim when already playing
  var pl = document.getElementById("hcj-play-btn");
  if (pl) pl.classList.toggle("hcj-btn-dim", _hcjPlaying);
  // ⏸ pause button — dim when not playing
  var pa = document.getElementById("hcj-pause-btn");
  if (pa) pa.classList.toggle("hcj-btn-dim", !_hcjPlaying);
  // mode buttons
  ["loop", "continue"].forEach(function (m) {
    var b = document.getElementById("hcj-mode-" + m);
    if (b) b.classList.toggle("hcj-mode-active", _hcjMode === m);
  });
}
function _hcjRenderPlayer(idx) {
  var ow = document.getElementById("hcj-player-wrap");
  if (ow) ow.remove();
  /* Remove any window listeners left by the previous player render */
  if (_hcjPlayerCleanup) {
    _hcjPlayerCleanup();
    _hcjPlayerCleanup = null;
  }
  var navBar = document.getElementById("lmNav");
  var _hasAudioPlayer = !!_AUDIO_STOTRAMS[_currentStotramId];
  if (!_hasAudioPlayer) {
    if (navBar) navBar.style.display = "";
    var _ci = document.querySelector("#lmo .lm-card-inner");
    if (_ci) _ci.style.bottom = "";
    return;
  }
  if (navBar) navBar.style.display = "none";
  var lmd = document.querySelector("#lmo .lmd");
  if (!lmd) return;

  var wrap = document.createElement("div");
  wrap.id = "hcj-player-wrap";

  // ── Progress bar row (above buttons) ──
  var progRow = document.createElement("div");
  progRow.className = "hcj-prog-row";

  var timeCur = document.createElement("span");
  timeCur.id = "hcj-time-cur";
  timeCur.className = "hcj-time";
  timeCur.textContent = "0:00";
  progRow.appendChild(timeCur);

  var progTrack = document.createElement("div");
  progTrack.className = "hcj-prog-track";
  var progFill = document.createElement("div");
  progFill.id = "hcj-prog-fill";
  progFill.className = "hcj-prog-fill";
  var progThumb = document.createElement("div");
  progThumb.id = "hcj-prog-thumb";
  progThumb.className = "hcj-prog-thumb";
  progFill.appendChild(progThumb);
  progTrack.appendChild(progFill);

  // Scrub on tap/drag
  function _hcjScrubAt(e) {
    if (!_hcjAudio || !_hcjAudio.duration) return;
    e.preventDefault();
    var rect = progTrack.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    _hcjAudio.currentTime = pct * _hcjAudio.duration;
    _hcjUpdateProgress();
  }
  var _scrubbing = false;
  progTrack.addEventListener("mousedown", function (e) {
    _scrubbing = true;
    _hcjScrubAt(e);
  });
  progTrack.addEventListener(
    "touchstart",
    function (e) {
      _scrubbing = true;
      _hcjScrubAt(e);
    },
    { passive: false },
  );

  /* touchmove is on progTrack only — NOT on window.
     Touch events fire on the element where touchstart occurred, so this
     still fires when the finger moves outside the bar. Keeping it on the
     small progTrack element means Chrome NEVER has to wait for a global
     touchmove handler before scrolling the text area, which eliminates
     the shake-without-scrolling bug entirely. */
  progTrack.addEventListener(
    "touchmove",
    function (e) {
      if (_scrubbing) {
        e.preventDefault();
        _hcjScrubAt(e);
      }
    },
    { passive: false },
  );

  /* Mouse drag still uses window so the cursor can leave the track */
  var _onMouseMove = function (e) {
    if (_scrubbing) _hcjScrubAt(e);
  };
  var _onMouseUp = function () {
    _scrubbing = false;
  };
  var _onTouchEnd = function () {
    _scrubbing = false;
  };
  window.addEventListener("mousemove", _onMouseMove);
  window.addEventListener("mouseup", _onMouseUp);
  window.addEventListener("touchend", _onTouchEnd);
  _hcjPlayerCleanup = function () {
    window.removeEventListener("mousemove", _onMouseMove);
    window.removeEventListener("mouseup", _onMouseUp);
    window.removeEventListener("touchend", _onTouchEnd);
  };

  progRow.appendChild(progTrack);

  var timeTot = document.createElement("span");
  timeTot.id = "hcj-time-tot";
  timeTot.className = "hcj-time";
  timeTot.textContent = "0:00";
  progRow.appendChild(timeTot);

  wrap.appendChild(progRow);

  // ── Buttons row ──
  var row = document.createElement("div");
  row.className = "hcj-player";

  // Prev arrow (left of player)
  var prevBtn = document.createElement("button");
  prevBtn.id = "hcj-prev-btn";
  prevBtn.className = "hcj-mini-btn hcj-arrow-btn";
  prevBtn.innerHTML = "&#8592;";
  prevBtn.title = "পূর্ববর্তী পদ";
  prevBtn.disabled = idx === 0;
  prevBtn.onclick = function () {
    verseNav(-1);
  };
  row.appendChild(prevBtn);

  // ▶ Play button — always shows ▶, dims while already playing
  var plb = document.createElement("button");
  plb.id = "hcj-play-btn";
  plb.className =
    "hcj-mini-btn hcj-play-btn" + (_hcjPlaying ? " hcj-btn-dim" : "");
  plb.textContent = "\u25b6"; // ▶
  plb.title = "বাজাও";
  plb.onclick = function () {
    if (_hcjPlaying) return; // already playing
    if (_hcjAudio && _hcjAudioIdx === _verseIdx) {
      _hcjAudio
        .play()
        .then(function () {
          _hcjPlaying = true;
          _hcjSyncUI();
          _hcjStartProgressLoop();
          if (window._lyrHcjAudioChanged)
            window._lyrHcjAudioChanged(_hcjAudio, true);
        })
        .catch(function () {
          _hcjPlaying = false;
          _hcjSyncUI();
        });
    } else {
      _hcjPlayVerse(_verseIdx);
    }
  };
  row.appendChild(plb);

  // ⏸ Pause button — always shows ⏸, dims while not playing
  var pab = document.createElement("button");
  pab.id = "hcj-pause-btn";
  pab.className =
    "hcj-mini-btn hcj-pause-btn" + (!_hcjPlaying ? " hcj-btn-dim" : "");
  pab.textContent = "\u23f8"; // ⏸
  pab.title = "বিরতি";
  pab.onclick = function () {
    if (_hcjPlaying) _hcjPauseAudio();
  };
  row.appendChild(pab);

  // Mode buttons (icon-only, tiny)
  var modes = [
    { k: "loop", i: "\uD83D\uDD01", t: "লুপ (একই পদ)" },
    { k: "continue", i: "\u23ED", t: "ক্রমাগত (পরবর্তী পদ)" },
  ];
  modes.forEach(function (m) {
    var b = document.createElement("button");
    b.id = "hcj-mode-" + m.k;
    b.className =
      "hcj-mini-btn hcj-mode-btn" +
      (_hcjMode === m.k ? " hcj-mode-active" : "");
    b.textContent = m.i;
    b.title = m.t;
    b.onclick = function () {
      _hcjSetMode(m.k);
    };
    row.appendChild(b);
  });

  // Verse seek (compact)
  var si = document.createElement("input");
  si.id = "hcj-seek-input";
  si.type = "number";
  si.min = 1;
  si.max = _verses.length;
  si.value = idx + 1;
  si.className = "hcj-seek-input";
  si.title = "পদ নং";
  si.onchange = function () {
    _hcjGoToVerse(this.value);
  };
  si.onkeydown = function (e) {
    if (e.key === "Enter") _hcjGoToVerse(this.value);
  };
  row.appendChild(si);

  var tot = document.createElement("span");
  tot.className = "hcj-seek-total";
  tot.textContent = "/" + _verses.length;
  row.appendChild(tot);

  // Next arrow (right of player)
  var nextBtn = document.createElement("button");
  nextBtn.id = "hcj-next-btn";
  nextBtn.className = "hcj-mini-btn hcj-arrow-btn";
  nextBtn.innerHTML = "&#8594;";
  nextBtn.title = "পরবর্তী পদ";
  nextBtn.disabled = idx === _verses.length - 1;
  nextBtn.onclick = function () {
    verseNav(1);
  };
  row.appendChild(nextBtn);

  wrap.appendChild(row);
  lmd.appendChild(wrap);

  /* Shrink the scroll area so it never slides under the player.
     The player is now position:absolute at the bottom of .lmd.
     We read its rendered height after layout and push .lm-card-inner
     bottom up by that amount so every touch lands in the scroll area. */
  requestAnimationFrame(function () {
    var pw = document.getElementById("hcj-player-wrap");
    var inner = document.querySelector("#lmo .lm-card-inner");
    if (pw && inner) inner.style.bottom = pw.offsetHeight + "px";
  });
}


// ══════════════════════════════════════════
// ── MILESTONE SYSTEM ──
// ══════════════════════════════════════════

// ── 13 CRORE SPIRITUAL MILESTONES (Shri Hit Premanand Ji Maharaj) ──
const CRORE = 10000000; // 1 crore = 10 million
const SPIRITUAL_MILESTONES = [
  {
    count: 1 * CRORE,
    icon: "⭐",
    label: "Sharir ki Shuddhi",
    tag: "Tanu Sthan",
    eng: "Body Purification",
    phase: "shuddhikaran",
    desc: "Sharir nishpaap hone lagta hai. Rajogun aur Tamogun khatam hokar Shuddha Sattva aata hai. Rogon ke beej nasht hote hain aur sapne mein Devi-Devtaon ke darshan hone lagte hain.",
  },
  {
    count: 2 * CRORE,
    icon: "◇",
    label: "Dhan Sthan ki Shuddhi",
    tag: "Dhan Sthan",
    eng: "Wealth Purification",
    phase: "shuddhikaran",
    desc: "Garibi aur daridrata ka dukh hamesha ke liye khatam ho jata hai. Bhagwan ya toh itna dhan de dete hain ki chah khatam ho jaye, ya fir man se paise ki bhookh hi mita dete hain.",
  },
  {
    count: 3 * CRORE,
    icon: "✦",
    label: "Antahkaran ki Shuddhi",
    tag: "Parakram Sthan",
    eng: "Inner Strength",
    phase: "shuddhikaran",
    desc: "Jo kaam pehle Asadhya lagte the (jaise gussa ya moh chhodna), wo Sadhya ho jate hain. Pura sansar aapko prem ki nazar se dekhne lagta hai.",
  },
  {
    count: 4 * CRORE,
    icon: "❊",
    label: "Hriday ki Shuddhi",
    tag: "Sukh Sthan",
    eng: "Heart Purification",
    phase: "shuddhikaran",
    desc: "Nityatva Bodh hota hai — aapko feel hone lagta hai ki aap ye marne wala sharir nahi, balki ek nitya Atma ho. Man aur buddhi par kisi bhi worldly dukh ka asar nahi padta.",
  },
  {
    count: 5 * CRORE,
    icon: "☀",
    label: "Vidya Sthan Jagrit",
    tag: "Vidya Sthan",
    eng: "Knowledge Awakening",
    phase: "shakti",
    desc: "Shastron ka gyan apne aap andar se nikalne lagta hai. Agar koi worldly wish ho (jaise santan ya lambi umar), toh wo bina maange puri hone lagti hai.",
  },
  {
    count: 6 * CRORE,
    icon: "⚔",
    label: "Shatruo par Vijay",
    tag: "Ripu Sthan",
    eng: "Victory Over Enemies",
    phase: "shakti",
    desc: "Bahar ke dushman hi nahi, balki andar ke 6 dushman (Kaam, Krodh, Lobh, Moh, Mad, Matsar) haar jate hain. Koi bhi incurable disease sankalp matra se thik ho sakta hai.",
  },
  {
    count: 7 * CRORE,
    icon: "◉",
    label: "Ichchhaon par Niyantran",
    tag: "Jaya Sthan",
    eng: "Desire Mastery",
    phase: "shakti",
    desc: "Duniya ki koi bhi attraction aise sadhak ko bhatka nahi sakti. Is stage par Narad Ji jaise maha-purushon se Pratyaksh milan aur baatchit shuru ho jati hai.",
  },
  {
    count: 8 * CRORE,
    icon: "∞",
    label: "Mrityu Bhay ka Ant",
    tag: "Mrityu Sthan",
    eng: "Death Fear Removed",
    phase: "shakti",
    desc: "Maut ka darr hamesha ke liye chala jata hai. Sadhak Atma-Raj ke sinhasan par baith jata hai, yani wo apne swaroop mein sthit ho jata hai.",
  },
  {
    count: 9 * CRORE,
    icon: "◎",
    label: "Saakshaatkaar",
    tag: "Dharam Sthan",
    eng: "Direct Divine Vision",
    phase: "bhagwat",
    desc: "Aap jiska naam jap rahe hain (Ram, Krishna, Shiva, ya Radha), unka Saakshaatkaar (Direct Vision) hota hai. Sadhak ki vani Satya ho jati hai — jo bologe wo ho jayega.",
  },
  {
    count: 10 * CRORE,
    icon: "✿",
    label: "Karm Bandhan Mukti",
    tag: "Karm Sthan",
    eng: "Karma Liberation",
    phase: "bhagwat",
    desc: "Saare purane karmo ka stock (Sanchit) aur current karmo ka phal bhasm ho jata hai. Ab janm-maran ka chakra hamesha ke liye khatam.",
  },
  {
    count: 11 * CRORE,
    icon: "◈",
    label: "Saari Siddhiyan Prapt",
    tag: "Siddhi Sthan",
    eng: "All Siddhis Attained",
    phase: "bhagwat",
    desc: "Saari Siddhiyan aur Riddhiyan haath jodkar khadi rehti hain. Sadhak Bhagwan ki nitya leelaon (Vrindavan, Saket etc.) mein pravesh kar jata hai.",
  },
  {
    count: 12 * CRORE,
    icon: "☸",
    label: "Bhagwan Bhakt ke Adheen",
    tag: "Bhakti Sthan",
    eng: "God Follows Devotee",
    phase: "bhagwat",
    desc: "Sadhak itna powerful ho jata hai ki Bhagwan uske piche-piche dolte hain (Bhagwan bhakt ke adheen ho jate hain).",
  },
  {
    count: 13 * CRORE,
    icon: "ੴ",
    label: "Moksh Pradaan ki Shakti",
    tag: "Moksh Sthan",
    eng: "Power to Grant Liberation",
    phase: "bhagwat",
    desc: "Ye limit hai. Jo 13 crore naam jap leta hai, wo itna samarth ho jata hai ki wo kisi bhi Paapi insan ko bhi Moksha (liberation) dila sakta hai.",
  },
];

const PHASES = [
  {
    id: "shuddhikaran",
    name: "Shuddhikaran",
    sub: "PURIFICATION · 1-4 CRORE",
    range: [1, 4],
  },
  {
    id: "shakti",
    name: "Shakti & Vijay",
    sub: "POWER & MASTERY · 5-8 CRORE",
    range: [5, 8],
  },
  {
    id: "bhagwat",
    name: "Bhagwat Prapti",
    sub: "ULTIMATE UNION · 9-13 CRORE",
    range: [9, 13],
  },
];

// Regular 1K milestones (kept for regular celebrations)
const MILESTONES = [];
for (let k = 1; k <= 99; k++) {
  MILESTONES.push({
    count: k * 1000,
    icon: "✨",
    label: k + "K Jap",
    badge: "🎖️",
    type: "regular",
  });
}
// Add bigger regular milestones
// Add all lakh milestones for tracking
for (let ll = 1; ll <= 130; ll++) {
  const lc = ll * 100000;
  if (
    ![100000, 200000, 300000, 500000, 1000000, 2000000, 5000000].includes(lc)
  ) {
    MILESTONES.push({
      count: lc,
      icon: "📿",
      label: ll + " Lakh Jap",
      badge: "📿",
      type: "regular",
    });
  }
}
[100000, 200000, 300000, 500000, 1000000, 2000000, 5000000].forEach((c) => {
  MILESTONES.push({
    count: c,
    icon: "👑",
    label: formatMsCountLabel(c),
    badge: "👑",
    type: "regular",
  });
});
// Add spiritual milestones to MILESTONES for celebration triggers
SPIRITUAL_MILESTONES.forEach((sm) => {
  MILESTONES.push({
    count: sm.count,
    icon: sm.icon,
    label: sm.label,
    badge: sm.icon,
    type: "spiritual",
    tag: sm.tag,
    eng: sm.eng,
    desc: sm.desc,
  });
});
MILESTONES.sort((a, b) => a.count - b.count);

function formatMsCountLabel(n) {
  if (n >= CRORE) return n / CRORE + " Crore";
  if (n >= 100000) return n / 100000 + " Lakh";
  if (n >= 1000) return n / 1000 + "K";
  return n.toLocaleString("en-IN");
}

function getMilestoneData() {
  // Primary: use App.S (synced via Firebase). Fallback: localStorage (legacy).
  if (App.S && App.S.milestones) return App.S.milestones;
  try {
    const d = localStorage.getItem("rjap_milestones");
    return d ? JSON.parse(d) : { reached: {}, lastChecked: 0 };
  } catch (e) {
    return { reached: {}, lastChecked: 0 };
  }
}

function saveMilestoneData(data) {
  // Save to App.S so it gets persisted to IDB and pushed to Firebase.
  if (App.S) {
    App.S.milestones = data;
    App.save();
    if (typeof fbDebouncedPush === "function" && App._cloudHydrated) fbDebouncedPush();
  }
  // Also mirror to localStorage as fallback.
  try {
    localStorage.setItem("rjap_milestones", JSON.stringify(data));
  } catch (e) {}
}

function formatMsCount(n) {
  if (n >= CRORE) return n / CRORE + " Crore";
  if (n >= 100000)
    return (
      (n / 100000).toFixed(n % 100000 ? 1 : 0).replace(/\.0$/, "") + " Lakh"
    );
  return n.toLocaleString("en-IN");
}

function playShankha() {
  /* removed */
}

function spawnMsParticles() {
  /* removed */
}

function showMilestoneCelebration() {
  /* removed */
}

function dismissMilestone() {
  /* removed */
}

// ── LAKH MILESTONES for Jap ki Gati ──
const LAKH_MILESTONES = [];
for (let l = 1; l <= 130; l++) {
  LAKH_MILESTONES.push({ count: l * 100000, label: l + " Lakh", num: l });
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "—";
  const days = Math.floor(ms / 86400000);
  const hrs = Math.floor((ms % 86400000) / 3600000);
  if (days > 365) {
    const yrs = Math.floor(days / 365);
    const remDays = days % 365;
    return yrs + "y " + remDays + "d";
  }
  if (days > 0) return days + "d " + hrs + "h";
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hrs > 0) return hrs + "h " + mins + "m";
  return mins + "m";
}

function renderLakhGati() {
  renderMilestonesTab();
}

function saveSadhanaStartDate(val) {
  if (val) {
    localStorage.setItem("rjap_sadhana_start", val);
    App.S.sadhanaStart = val;
    App.save();
    fbDebouncedPush();
    const disp = document.getElementById("msSadhanaStartDisp");
    if (disp) disp.textContent = _fmtDateFriendly(val);
    updateSadhanaSince();
    renderLakhGati();
  }
}

function loadSadhanaStartDate() {
  // Read from App.S first (syncs across devices), fallback to localStorage
  const saved =
    App.S.sadhanaStart || localStorage.getItem("rjap_sadhana_start") || "";
  if (saved) {
    // Keep both in sync
    App.S.sadhanaStart = saved;
    localStorage.setItem("rjap_sadhana_start", saved);
  }
  const input = document.getElementById("msSadhanaStart");
  if (saved && input) input.value = saved;
  const disp = document.getElementById("msSadhanaStartDisp");
  if (disp) disp.textContent = _fmtDateFriendly(saved);
  updateSadhanaSince();
}

function updateSadhanaSince() {
  const el =
    document.getElementById("sadhanaSince") ||
    document.getElementById("msSadhanaSince");
  const saved =
    App.S.sadhanaStart || localStorage.getItem("rjap_sadhana_start");
  if (!el) return;
  if (!saved) {
    el.textContent = "Set your journey start date above ☝️";
    return;
  }
  const start = _gpsParseDate(saved);
  const todayLocal = _gpsLocalToday();
  const days = Math.round((todayLocal - start) / 86400000) + 1; // +1: start day = Day 1
  const years = Math.floor(days / 365);
  const remDays = days % 365;
  const months = Math.floor(remDays / 30);
  let str = "🙏 ";
  if (years > 0) str += years + " year" + (years > 1 ? "s" : "") + " ";
  if (months > 0) str += months + " month" + (months > 1 ? "s" : "") + " ";
  str += (remDays % 30) + " days of Sadhana";
  el.textContent = str;
}

function renderMsView() {
  renderMilestonesTab();
}

// ═══════════════════════════════════════════════════════
// HISTORY SECTION
// ═══════════════════════════════════════════════════════

function _histFmtDate(tk) {
  // tk = 'YYYY-MM-DD' → '13 May 2026'
  const [y, m, d] = tk.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return parseInt(d) + " " + months[parseInt(m) - 1] + " " + y;
}

function _histFmtSec(s) {
  if (!s || s <= 0) return "—";
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  if (h > 0) return h + "h " + m + "m " + String(sc).padStart(2, "0") + "s";
  if (m > 0) return m + "m " + String(sc).padStart(2, "0") + "s";
  return sc + "s";
}

function _histFmtTime(ts) {
  // ts = Date.now() timestamp → 'HH:MM:SS AM/PM'
  if (!ts) return "—";
  const d = new Date(ts);
  let h = d.getHours(),
    m = d.getMinutes(),
    s = d.getSeconds();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return (
    h +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    " " +
    ampm
  );
}

function _histSetActive(btn) {
  const row = document.getElementById("histPresetRow");
  if (row)
    row.querySelectorAll(".hpb").forEach((b) => b.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
    window._histActiveLabel =
      btn.getAttribute("data-label") || btn.textContent.trim();
  } else {
    window._histActiveLabel = "Custom";
  }
}

function showHistDay(tk, filterMode) {
  const detail = document.getElementById("histDayDetail");
  const title = document.getElementById("histDayTitle");
  const content = document.getElementById("histDayContent");

  const ms = App.S.ms || 108;
  const isGaudiya = App.S.gaudiyaMode || false;
  const _hkDayLang = App.S.hkLang || "hi";
  const _hkDayLabel = _hkDayLang === "bn" ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";

  // Map deityKey names to showHistSet set values
  const deityToSet = { radha: 'radha', rv: 'rv', '28': '28', hk: 'hk' };
  const autoSet = filterMode ? deityToSet[filterMode] : null;

  // If we have a specific mode filter AND that mode has data, go straight to per-mala detail
  if (autoSet) {
    const radha = App.S.history[tk] || 0;
    const rv = (App.S.historyRV || {})[tk] || 0;
    const hk = (App.S.historyHK || {})[tk] || 0;
    const taps28 = (App.S.h28 || {})[tk] || 0;
    const hasData = autoSet === 'radha' ? radha > 0
                  : autoSet === 'rv'    ? rv > 0
                  : autoSet === 'hk'    ? hk > 0
                  : taps28 > 0;

    // Build a minimal title showing date + mode
    const modeLabel = autoSet === 'radha' ? '🌸 Radha Jap'
                    : autoSet === 'rv'    ? '🌼 Radha Vallabh'
                    : autoSet === '28'   ? '🪷 28 Names'
                    : _hkDayLabel;
    title.textContent = _histFmtDate(tk) + ' — ' + modeLabel;
    detail.style.display = "block";
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Stash context then immediately show per-mala set detail
    window._histDayCtx = { tk, isToday: tk === App.S.tk };

    if (!hasData) {
      content.innerHTML = `<div style="text-align:center;color:var(--td);padding:24px;font-size:13px">
        No ${modeLabel} recorded on this day.</div>`;
      return;
    }

    // Show the per-mala list directly — no card grid needed
    content.innerHTML = '<div id="histSetDetail" style="margin-top:4px"></div>';
    showHistSet(autoSet);
    return;
  }

  // Default: no filter mode — show all types grid
  title.textContent = _histFmtDate(tk);
  detail.style.display = "block";
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const radha = App.S.history[tk] || 0;
  const rv = App.S.historyRV[tk] || 0;
  const hk = App.S.historyHK[tk] || 0;
  const taps28 = App.S.h28[tk] || 0;
  const tSecR = App.S.timerHistory[tk] || 0;
  const tSecRV = App.S.timerHistoryRV[tk] || 0;
  const tSecHK = App.S.timerHistoryHK[tk] || 0;
  const t28Sec = App.S.timer28History[tk] || 0;

  const radhaM = Math.floor(radha / ms);
  const rvM = Math.floor(rv / ms);
  const hkM = Math.floor(hk / ms);
  const cyc28 = Math.floor(taps28 / 28);
  const grand = isGaudiya ? tSecHK : tSecR + tSecRV + t28Sec;
  const fmtN = (n) => n.toLocaleString();

  // Stash data for the per-set drill-down
  window._histDayCtx = { tk, isToday: tk === App.S.tk };

  // Build clickable per-set cards (premium style, same as Period Totals)
  const card = (cls, set, label, mainNum, mainUnit, sub, time, enabled) => `
    <div class="pt-card ${cls}${enabled ? " pt-card-tap" : " pt-card-dim"}"
         ${enabled ? `onclick="showHistSet('${set}')"` : ""}
         role="${enabled ? "button" : ""}" tabindex="${enabled ? "0" : "-1"}">
      <div class="pt-card-label">${label}</div>
      <div class="pt-card-main"><span class="pt-num">${fmtN(mainNum)}</span><span class="pt-unit">${mainUnit}</span></div>
      <div class="pt-card-sub">${sub}</div>
      <div class="pt-card-time">⏱ ${time}</div>
      ${enabled ? '<div class="pt-card-chev">›</div>' : ""}
    </div>`;

  let html = "";
  html += `<div class="pt-head" style="margin-top:2px"><span class="pt-head-icon">📊</span><span class="pt-head-title">Day Totals</span><span class="pt-head-hint">tap a set for per-mala detail</span></div>`;

  if (isGaudiya) {
    html += `<div class="pt-grid pt-grid-1">`;
    html += card(
      "pt-hk", "hk", _hkDayLabel,
      hkM, hkM === 1 ? "mala" : "malas",
      fmtN(hk) + " names", _histFmtSec(tSecHK), hk > 0,
    );
    html += `</div>`;
  } else {
    html += `<div class="pt-grid pt-grid-3">`;
    html += card("pt-radha", "radha", "Radha Jap", radhaM, radhaM === 1 ? "mala" : "malas", fmtN(radha) + " names", _histFmtSec(tSecR), radha > 0);
    html += card("pt-rv",    "rv",    "RV Jap",    rvM,    rvM === 1    ? "mala" : "malas", fmtN(rv)    + " names", _histFmtSec(tSecRV), rv > 0);
    html += card("pt-28",   "28",    "28 Names",  cyc28,  cyc28 === 1  ? "cycle" : "cycles", fmtN(taps28) + " taps", _histFmtSec(t28Sec), taps28 > 0);
    html += card("pt-hk",   "hk",    _hkDayLabel, hkM,    hkM === 1    ? "mala" : "malas", fmtN(hk)    + " names", _histFmtSec(tSecHK), hk > 0);
    html += `</div>`;
  }
  html += `<div class="pt-total"><span class="pt-total-label">Total Time</span><span class="pt-total-val">${_histFmtSec(grand)}</span></div>`;

  // Drill-down slot (populated by showHistSet)
  html += `<div id="histSetDetail" style="margin-top:14px"></div>`;

  content.innerHTML = html;
}

function histPreset(days, btn) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  document.getElementById("histFrom").value = _ldk(from);
  document.getElementById("histTo").value = _ldk(to);
  _histSetActive(btn);
  renderHistory();
}

function histPresetMonth(btn) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById("histFrom").value = _ldk(from);
  document.getElementById("histTo").value = _ldk(now);
  _histSetActive(btn);
  renderHistory();
}

function histRangeChanged() {
  // Manual date change clears preset selection and re-renders
  _histSetActive(null);
  renderHistory();
}

function _histGetDates(from, to) {
  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(_ldk(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function renderHistory() {
  const from = document.getElementById("histFrom").value;
  const to = document.getElementById("histTo").value;
  const sumLine = document.getElementById("histSummaryLine");
  const wrap = document.getElementById("histTableWrap");
  const tbody = document.getElementById("histTableBody");
  const totDiv = document.getElementById("histTotals");
  const detail = document.getElementById("histDayDetail");

  if (!from || !to) {
    sumLine.textContent = "Please select both From and To dates.";
    return;
  }
  if (from > to) {
    sumLine.textContent = "From date must be before To date.";
    return;
  }

  detail.style.display = "none";
  const drillPanel = document.getElementById("histDeityDrill");
  if (drillPanel) { drillPanel.style.display = "none"; drillPanel.innerHTML = ""; }
  const dates = _histGetDates(from, to);
  const ms = App.S.ms || 108;
  const isGaudiya = App.S.gaudiyaMode || false;

  const hist = App.S.history || {};
  const histRV = App.S.historyRV || {};
  const histHK = App.S.historyHK || {};
  const h28 = App.S.h28 || {};
  const tHist = App.S.timerHistory || {};
  const tHistRV = App.S.timerHistoryRV || {};
  const tHistHK = App.S.timerHistoryHK || {};
  const t28Hist = App.S.timer28History || {};

  let totRadha = 0,
    totRV = 0,
    totHK = 0,
    tot28taps = 0,
    totTimeSec = 0,
    totTimeSec28 = 0;
  window._ptRadhaSec = 0;
  window._ptRVSec = 0;
  window._ptHKSec = 0; // reset per-mode time accumulators
  let activeDays = 0;
  tbody.innerHTML = "";

  dates.forEach((tk) => {
    const radha = hist[tk] || 0;
    const rv = histRV[tk] || 0;
    const hk = histHK[tk] || 0;
    const taps28 = h28[tk] || 0;
    const tSecR_row = tHist[tk] || 0;
    const tSecRV_row = tHistRV[tk] || 0;
    const tSecHK_row = tHistHK[tk] || 0;
    const tSec = isGaudiya ? tSecHK_row : tSecR_row + tSecRV_row;
    const t28Sec = isGaudiya ? 0 : t28Hist[tk] || 0;
    const totalSec = tSec + t28Sec;

    // Skip empty days depending on mode
    if (isGaudiya) {
      if (hk === 0) return;
    } else {
      if (radha === 0 && rv === 0 && taps28 === 0) return;
    }

    activeDays++;
    totRadha += radha;
    totRV += rv;
    totHK += hk;
    tot28taps += taps28;
    totTimeSec += tSec;
    totTimeSec28 += t28Sec;
    window._ptRadhaSec += tSecR_row;
    window._ptRVSec += tSecRV_row;
    window._ptHKSec += tSecHK_row;

    const radhaM = Math.floor(radha / ms);
    const rvM = Math.floor(rv / ms);
    const hkM = Math.floor(hk / ms);
    const cyc28 = Math.floor(taps28 / 28);

    const tr = document.createElement("tr");
    tr.className = "hist-row";
    tr.onclick = () => showHistDay(tk);

    const cell = (n, label) =>
      n > 0
        ? '<span class="hist-n">' +
          n +
          '</span> <span class="hist-u">' +
          label +
          "</span>"
        : '<span class="hist-dash">—</span>';

    const radhaStr = cell(radhaM, radhaM === 1 ? "mala" : "malas");
    const rvStr = cell(rvM, rvM === 1 ? "mala" : "malas");
    const hkStr = cell(hkM, hkM === 1 ? "mala" : "malas");
    const n28Str = cell(cyc28, cyc28 === 1 ? "cycle" : "cycles");

    const dateCell = `<td class="hist-date"><span class="hist-tap-dot"></span>${_histFmtDate(tk)}</td>`;
    const chevCell = `<td class="hist-chev">›</td>`;

    if (isGaudiya) {
      tr.innerHTML = `
        ${dateCell}
        <td class="hist-hk-col hist-val hist-c-hk">${hkStr}</td>
        <td class="hist-val hist-c-time">${_histFmtSec(totalSec)}</td>
        ${chevCell}
      `;
    } else {
      tr.innerHTML = `
        ${dateCell}
        <td class="hist-radha-col hist-val hist-c-gold">${radhaStr}</td>
        <td class="hist-radha-col hist-val hist-c-rv">${rvStr}</td>
        <td class="hist-radha-col hist-val hist-c-green">${n28Str}</td>
        <td class="hist-val hist-c-time">${_histFmtSec(totalSec)}</td>
        ${chevCell}
      `;
    }
    tbody.appendChild(tr);
  });

  if (activeDays === 0) {
    sumLine.textContent = "No jap recorded in this date range.";
    wrap.style.display = "none";
    if (totDiv) {
      totDiv.innerHTML = "";
      totDiv.style.display = "none";
    }
    return;
  }

  sumLine.textContent =
    activeDays +
    " active day" +
    (activeDays > 1 ? "s" : "") +
    " in range · tap a card below to view dates";
  wrap.style.display = "none";

  // Totals row
  const totRadhaM = Math.floor(totRadha / ms);
  const totRVM = Math.floor(totRV / ms);
  const totHKM = Math.floor(totHK / ms);
  const totCyc28 = Math.floor(tot28taps / 28);
  const grandTotal = totTimeSec + totTimeSec28;
  const fmtN = (n) => n.toLocaleString();
  const rangeLbl = window._histActiveLabel || "Custom";
  const statCard = (cls, icon, label, mainNum, mainUnit, sub, time, deityKey) => `
    <div class="pt-card ${cls} pt-card-tap" onclick="showHistDeityDates('${deityKey}')" role="button" tabindex="0" style="cursor:pointer">
      <div class="pt-card-icon">${icon}</div>
      <div class="pt-card-label">${label}</div>
      <div class="pt-card-main"><span class="pt-num">${fmtN(mainNum)}</span><span class="pt-unit">${mainUnit}</span></div>
      <div class="pt-card-sub">${sub}</div>
      <div class="pt-card-time">⏱ ${time}</div>
      <div class="pt-card-chev">›</div>
    </div>`;

  totDiv.style.display = "block";
  const _hkPTLang = App.S.hkLang || "hi";
  const _hkPTLabel =
    _hkPTLang === "bn" ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";

  if (isGaudiya) {
    totDiv.innerHTML = `
      <div class="pt-head"><span class="pt-head-icon">📊</span><span class="pt-head-title">Period Totals</span><span class="pt-head-range">(${rangeLbl})</span><span class="pt-head-tag">Gaudiya</span></div>
      <div class="pt-grid pt-grid-1">
        ${statCard("pt-hk", "🪈", _hkPTLabel, totHKM, totHKM === 1 ? "mala" : "malas", fmtN(totHK) + " names", _histFmtSec(window._ptHKSec || 0), "hk")}
      </div>
      <div class="pt-total"><span class="pt-total-label">Total Time</span><span class="pt-total-val">${_histFmtSec(grandTotal)}</span></div>
    `;
  } else {
    totDiv.innerHTML = `
      <div class="pt-head"><span class="pt-head-icon">📊</span><span class="pt-head-title">Period Totals</span><span class="pt-head-range">(${rangeLbl})</span></div>
      <div class="pt-grid pt-grid-3">
        ${statCard("pt-radha", "📿", "Radha Jap", totRadhaM, totRadhaM === 1 ? "mala" : "malas", fmtN(totRadha) + " names", _histFmtSec(window._ptRadhaSec || 0), "radha")}
        ${statCard("pt-rv", "🕉️", "RV Jap", totRVM, totRVM === 1 ? "mala" : "malas", fmtN(totRV) + " names", _histFmtSec(window._ptRVSec || 0), "rv")}
        ${statCard("pt-28", "🪷", "28 Names", totCyc28, totCyc28 === 1 ? "cycle" : "cycles", fmtN(tot28taps) + " taps", _histFmtSec(totTimeSec28), "28")}
      </div>
      <div class="pt-total"><span class="pt-total-label">Total Time</span><span class="pt-total-val">${_histFmtSec(grandTotal)}</span></div>
    `;
  }
}

// ── Period Totals drill-down: show date-wise rows for a single deity ──
function showHistDeityDates(deityKey) {
  const drill = document.getElementById("histDeityDrill");
  const wrap  = document.getElementById("histTableWrap");
  const sumLine = document.getElementById("histSummaryLine");
  if (!drill) return;

  const from = document.getElementById("histFrom").value;
  const to   = document.getElementById("histTo").value;
  if (!from || !to) return;

  const dates  = _histGetDates(from, to);
  const ms     = App.S.ms || 108;
  const fmtN   = (n) => n.toLocaleString();
  const isGaudiya = App.S.gaudiyaMode || false;

  // Config per deity
  const cfg = {
    radha: { label: "Radha Jap",    cls: "pt-radha", icon: "📿",  color: "var(--gold)",  histKey: "history",   timerKey: "timerHistory",   unit: (m) => m === 1 ? "mala" : "malas",  toMain: (v) => Math.floor(v / ms), toSub: (v) => fmtN(v) + " names" },
    rv:    { label: "RV Jap",       cls: "pt-rv",    icon: "🕉️",  color: "var(--a2)",    histKey: "historyRV", timerKey: "timerHistoryRV", unit: (m) => m === 1 ? "mala" : "malas",  toMain: (v) => Math.floor(v / ms), toSub: (v) => fmtN(v) + " names" },
    "28":  { label: "28 Names",     cls: "pt-28",    icon: "🪷",  color: "var(--green)", histKey: "h28",       timerKey: "timer28History", unit: (c) => c === 1 ? "cycle" : "cycles", toMain: (v) => Math.floor(v / 28), toSub: (v) => fmtN(v) + " taps"  },
    hk:    { label: "हरे कृष्ण",   cls: "pt-hk",    icon: "🪈",  color: "#6DB8FF",      histKey: "historyHK", timerKey: "timerHistoryHK", unit: (m) => m === 1 ? "mala" : "malas",  toMain: (v) => Math.floor(v / ms), toSub: (v) => fmtN(v) + " names" },
  };

  const c = cfg[deityKey];
  if (!c) return;

  const hist  = App.S[c.histKey]  || {};
  const tHist = App.S[c.timerKey] || {};

  // Build rows — only active days
  const rows = [];
  let totVal = 0, totSec = 0;
  dates.forEach((tk) => {
    const val = hist[tk] || 0;
    const sec = tHist[tk] || 0;
    if (val === 0) return;
    totVal += val; totSec += sec;
    rows.push({ tk, val, sec });
  });

  // Hide the Period Totals card — drill-down replaces it in the same space
  const totDiv = document.getElementById("histTotals");
  if (totDiv) totDiv.style.display = "none";

  // Hide the flat history table — drill-down replaces it
  if (wrap) wrap.style.display = "none";
  sumLine.textContent = "";

  if (rows.length === 0) {
    drill.style.display = "block";
    drill.className = "hist-totals-card";
    drill.innerHTML = `
        <button class="hist-back-btn" onclick="closeHistDeityDrill()">‹ Period Totals</button>
        <div style="text-align:center;color:var(--td);font-size:12px;padding:16px 0">No ${c.label} recorded in this period.</div>`;
    return;
  }

  const totMain = c.toMain(totVal);
  const rowsHtml = rows.map(({ tk, val, sec }) => {
    const main = c.toMain(val);
    return `
      <div class="hdd-row" onclick="showHistDay('${tk}', '${deityKey}')">
        <div class="hdd-date">${_histFmtDate(tk)}</div>
        <div class="hdd-main" style="color:${c.color}">
          <span class="hdd-num">${fmtN(main)}</span>
          <span class="hdd-unit">${c.unit(main)}</span>
        </div>
        <div class="hdd-sub">${c.toSub(val)}</div>
        <div class="hdd-time">⏱ ${_histFmtSec(sec)}</div>
        <div class="hdd-chev">›</div>
      </div>`;
  }).join("");

  drill.style.display = "block";
  drill.className = "hist-totals-card";
  drill.innerHTML = `
      <div class="pt-head">
        <button class="hist-back-btn" style="margin:0" onclick="closeHistDeityDrill()">‹ Back</button>
        <span class="pt-head-icon" style="margin-left:8px">${c.icon}</span>
        <span class="pt-head-title" style="color:${c.color}">${c.label}</span>
        <span class="pt-head-range">(${window._histActiveLabel || "Custom"})</span>
      </div>
      <div class="hdd-summary">
        <span class="hdd-sum-num" style="color:${c.color}">${fmtN(totMain)}</span>
        <span class="hdd-sum-unit">${c.unit(totMain)}</span>
        <span class="hdd-sum-sub">${c.toSub(totVal)}</span>
        <span class="hdd-sum-time">⏱ ${_histFmtSec(totSec)}</span>
      </div>
      <div class="hdd-list">${rowsHtml}</div>`;
  drill.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeHistDeityDrill() {
  const drill = document.getElementById("histDeityDrill");
  const wrap  = document.getElementById("histTableWrap");
  const totDiv = document.getElementById("histTotals");
  const sumLine = document.getElementById("histSummaryLine");
  if (drill) { drill.style.display = "none"; drill.innerHTML = ""; drill.className = ""; }
  // Restore Period Totals card
  if (totDiv) totDiv.style.display = "block";
  // Keep the flat table hidden — drill via Period Totals cards only
  if (wrap) wrap.style.display = "none";
  const _activeDays = document.querySelectorAll("#histTableBody tr").length;
  if (sumLine) sumLine.textContent = _activeDays + " active day" + (_activeDays !== 1 ? "s" : "") + " in range · tap a card above to view dates";
}


function showHistSet(set) {
  const ctx = window._histDayCtx;
  if (!ctx) return;
  const { tk, isToday } = ctx;
  const slot = document.getElementById("histSetDetail");
  if (!slot) return;

  const tkPrefix = tk.slice(0, 10);

  // Build a unified entry list for this date:
  //   1) in-memory activityLog (live + recent)
  //   2) lifetime archive entries from IDB for this exact day
  // De-duplicated by ts+t so older malas don't disappear once they roll
  // out of the 2000-entry in-memory cap.
  const _inMem = (App.S.activityLog || []).filter(
    (e) => _ldk(new Date(e.ts)) === tkPrefix,
  );
  const _renderWith = (log) => _renderHistSetInner(set, tk, isToday, log, slot);

  // Render immediately with what we have, then upgrade from archive.
  _renderWith(_inMem);
  App.dbGet("activityLogArchive", tk)
    .then((archived) => {
      if (!Array.isArray(archived) || archived.length === 0) return;
      const seen = new Set(_inMem.map((e) => e.ts + "|" + e.t));
      const merged = _inMem.concat(
        archived.filter((e) => !seen.has(e.ts + "|" + e.t)),
      );
      merged.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      _renderWith(merged);
    })
    .catch(() => {});
}

function _renderHistSetInner(set, tk, isToday, log, slot) {
  let inner = "";
  const backBtn = `<button class="hist-back-btn" onclick="document.getElementById('histSetDetail').innerHTML=''">‹ Back to Day Totals</button>`;

  if (set === "radha") {
    const radhaEntries = log.filter(
      (e) => e.t === "mala" && e.mode !== "rv" && e.mode !== "hk",
    );
    inner += backBtn;
    if (radhaEntries.length > 0) {
      inner += _histMalaTable(
        "🌸 Radha Jap — Per Mala",
        radhaEntries,
        "var(--gold)",
      );
    } else if (isToday && (App.S.malaLog || []).length > 0) {
      inner += _histTodayMalaLogTable(
        "🌸 Radha Jap — Today's Malas",
        App.S.malaLog,
        "var(--gold)",
      );
    } else {
      inner += `<div style="font-size:11px;color:var(--td);text-align:center;padding:10px 0">Per-mala detail not available for this date<br><span style="font-size:10px">(activity log only keeps recent sessions)</span></div>`;
    }
  } else if (set === "rv") {
    const rvEntries = log.filter((e) => e.t === "mala" && e.mode === "rv");
    inner += backBtn;
    if (rvEntries.length > 0) {
      inner += _histMalaTable("🔵 RV Jap — Per Mala", rvEntries, "var(--a2)");
    } else if (isToday && (App.S.malaLogRV || []).length > 0) {
      inner += _histTodayMalaLogTable(
        "🔵 RV Jap — Today's Malas",
        App.S.malaLogRV,
        "var(--a2)",
      );
    } else {
      inner += `<div style="font-size:11px;color:var(--td);text-align:center;padding:10px 0">Per-mala detail not available for this date</div>`;
    }
  } else if (set === "28") {
    const cycleEntries = log.filter((e) => e.t === "28cycle");
    inner += backBtn;
    if (cycleEntries.length > 0) {
      inner += _hist28CycleTable(cycleEntries);
    } else {
      inner += `<div style="font-size:11px;color:var(--td);text-align:center;padding:10px 0">Per-cycle detail not available for this date</div>`;
    }
  } else if (set === "hk") {
    const hkEntries = log.filter((e) => e.t === "mala" && e.mode === "hk");
    const _hkSetLang = App.S.hkLang || "hi";
    const _hkSetLabel =
      _hkSetLang === "bn"
        ? "🪈 হরে কৃষ্ণ মহামন্ত্র — Per Mala"
        : "🪈 हरे कृष्ण महामंत्र — Per Mala";
    inner += backBtn;
    if (hkEntries.length > 0) {
      inner += _histMalaTable(_hkSetLabel, hkEntries, "var(--rl)");
    } else if (isToday && (App.S.malaLogHK || []).length > 0) {
      inner += _histTodayMalaLogTable(
        _hkSetLabel,
        App.S.malaLogHK,
        "var(--rl)",
      );
    } else {
      inner += `<div style="font-size:11px;color:var(--td);text-align:center;padding:10px 0">Per-mala detail not available for this date</div>`;
    }
  }

  slot.innerHTML = inner;
  slot.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function _histMalaTable(label, entries, color) {
  let html = `<div style="margin-bottom:10px">`;
  html += `<div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${color};margin-bottom:6px;font-weight:600">${label}</div>`;
  html += `<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(255,255,255,0.08)">`;
  html += `<table style="width:100%;border-collapse:collapse;font-family:Inter,sans-serif;font-size:11px">`;
  html += `<thead><tr style="background:rgba(255,255,255,0.05);color:var(--td)">
    <th style="padding:6px 8px;text-align:left">Mala #</th>
    <th style="padding:6px 8px;text-align:left">End Time</th>
    <th style="padding:6px 8px;text-align:left">Start Time</th>
    <th style="padding:6px 8px;text-align:right">Duration</th>
  </tr></thead><tbody>`;

  entries.forEach((e, i) => {
    const endTs = e.ts;
    // Use stored startTs if available (accurate wall-clock); fall back to computed
    const startTs = e.startTs ? e.startTs : endTs - e.sec * 1000;
    const even = i % 2 === 0;
    // Always use sequential index (i+1) — e.n can repeat when modes switch
    html += `<tr style="background:${even ? "rgba(0,0,0,0.15)" : "transparent"}">
      <td style="padding:6px 8px;color:${color};font-weight:600">Mala ${i + 1}</td>
      <td style="padding:6px 8px;color:var(--tl)">${_histFmtTime(endTs)}</td>
      <td style="padding:6px 8px;color:var(--td)">${_histFmtTime(startTs)}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--green)">${_histFmtSec(e.sec)}</td>
    </tr>`;
  });

  html += `</tbody></table></div></div>`;
  return html;
}

function _hist28CycleTable(entries) {
  let html = `<div style="margin-bottom:10px">`;
  html += `<div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--green);margin-bottom:6px;font-weight:600">🌿 28 Names — Cycles</div>`;
  html += `<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(255,255,255,0.08)">`;
  html += `<table style="width:100%;border-collapse:collapse;font-family:Inter,sans-serif;font-size:11px">`;
  html += `<thead><tr style="background:rgba(255,255,255,0.05);color:var(--td)">
    <th style="padding:6px 8px;text-align:left">Cycle #</th>
    <th style="padding:6px 8px;text-align:left">End Time</th>
    <th style="padding:6px 8px;text-align:left">Start Time</th>
    <th style="padding:6px 8px;text-align:right">Cycle Time</th>
  </tr></thead><tbody>`;

  entries.forEach((e, i) => {
    const endTs = e.ts;
    const startTs = e.startTs ? e.startTs : endTs - (e.sec || 0) * 1000;
    const even = i % 2 === 0;
    html += `<tr style="background:${even ? "rgba(0,0,0,0.15)" : "transparent"}">
      <td style="padding:6px 8px;color:var(--green);font-weight:600">Cycle ${i + 1}</td>
      <td style="padding:6px 8px;color:var(--tl)">${_histFmtTime(endTs)}</td>
      <td style="padding:6px 8px;color:var(--td)">${_histFmtTime(startTs)}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--gold)">${_histFmtSec(e.sec)}</td>
    </tr>`;
  });

  html += `</tbody></table></div></div>`;
  return html;
}

function _histTodayMalaLogTable(label, malaLog, color) {
  // malaLog is array of durations (seconds) only — no timestamps
  // reconstruct approximate start times from total timer
  let html = `<div style="margin-bottom:10px">`;
  html += `<div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${color};margin-bottom:6px;font-weight:600">${label}</div>`;
  html += `<div style="overflow-x:auto;border-radius:10px;border:1px solid rgba(255,255,255,0.08)">`;
  html += `<table style="width:100%;border-collapse:collapse;font-family:Inter,sans-serif;font-size:11px">`;
  html += `<thead><tr style="background:rgba(255,255,255,0.05);color:var(--td)">
    <th style="padding:6px 8px;text-align:left">Mala #</th>
    <th style="padding:6px 8px;text-align:right">Duration</th>
  </tr></thead><tbody>`;

  malaLog.forEach((sec, i) => {
    const even = i % 2 === 0;
    html += `<tr style="background:${even ? "rgba(0,0,0,0.15)" : "transparent"}">
      <td style="padding:6px 8px;color:${color};font-weight:600">Mala ${i + 1}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--green)">${_histFmtSec(sec)}</td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  html += `<div style="font-size:10px;color:var(--td);margin-top:4px;padding:0 2px">* Start/end times available in future sessions (stored in activity log)</div>`;
  html += `</div>`;
  return html;
}

function copyHistoryText() {
  const from = document.getElementById("histFrom").value;
  const to = document.getElementById("histTo").value;
  if (!from || !to) return;

  const ms = App.S.ms || 108;
  const dates = _histGetDates(from, to);
  const hist = App.S.history || {};
  const histRV = App.S.historyRV || {};
  const h28 = App.S.h28 || {};
  const tHist = App.S.timerHistory || {};
  const tHistRV = App.S.timerHistoryRV || {};
  const t28Hist = App.S.timer28History || {};

  let lines = ["📿 Radha Naam Jap — History Report"];
  lines.push("Period: " + _histFmtDate(from) + " to " + _histFmtDate(to));
  lines.push("─".repeat(42));

  let totR = 0,
    totRV = 0,
    tot28 = 0,
    totT = 0,
    totT28 = 0;
  let days = 0;

  dates.forEach((tk) => {
    const r = hist[tk] || 0,
      rv = histRV[tk] || 0,
      t28 = h28[tk] || 0;
    const tR = tHist[tk] || 0,
      tRV = tHistRV[tk] || 0,
      t28s = t28Hist[tk] || 0;
    if (r === 0 && rv === 0 && t28 === 0) return;
    days++;
    totR += r;
    totRV += rv;
    tot28 += t28;
    totT += tR + tRV;
    totT28 += t28s;

    const parts = [];
    if (r > 0)
      parts.push(
        "Radha: " + Math.floor(r / ms) + "m (" + r + ") " + _histFmtSec(tR),
      );
    if (rv > 0)
      parts.push(
        "RV: " + Math.floor(rv / ms) + "m (" + rv + ") " + _histFmtSec(tRV),
      );
    if (t28 > 0)
      parts.push(
        "28 Names: " +
          Math.floor(t28 / 28) +
          "c (" +
          t28 +
          ") " +
          _histFmtSec(t28s),
      );
    const total = tR + tRV + t28s;
    if (total > 0) parts.push("Total: " + _histFmtSec(total));

    lines.push(_histFmtDate(tk) + " — " + parts.join(" | "));
  });

  lines.push("─".repeat(42));
  lines.push("TOTALS (" + days + " days):");
  lines.push(
    "Radha: " +
      Math.floor(totR / ms) +
      " malas (" +
      totR +
      ") | RV: " +
      Math.floor(totRV / ms) +
      " malas (" +
      totRV +
      ") | 28 Names: " +
      Math.floor(tot28 / 28) +
      " cycles (" +
      tot28 +
      ")",
  );
  lines.push(
    "Jap Time: " +
      _histFmtSec(totT) +
      " | 28 Names Time: " +
      _histFmtSec(totT28) +
      " | Grand Total: " +
      _histFmtSec(totT + totT28),
  );
  lines.push("🙏 Radha Vallabh Sri Harivangsa 🙏");

  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => toast("History copied! 📋"))
    .catch(() => toast("Copy failed"));
}

// ─────────────────────────────────────────────────────────
// LIFETIME ACTIVITY LOG — loads ALL archived days from IDB
// No 500-entry limit.
// ─────────────────────────────────────────────────────────
async function getLifetimeActivityLog() {
  // Load all days from the archive store
  const archive = await App.dbGetAll("activityLogArchive");
  // Merge all arrays, sort by timestamp ascending
  let all = [];
  Object.values(archive).forEach(function (entries) {
    if (Array.isArray(entries)) all = all.concat(entries);
  });
  // Also include any in-memory entries not yet archived (today's live entries)
  const inMem = App.S.activityLog || [];
  const archiveSet = new Set(all.map((e) => e.ts + "|" + e.t));
  inMem.forEach(function (e) {
    if (!archiveSet.has(e.ts + "|" + e.t)) all.push(e);
  });
  all.sort(function (a, b) {
    return (a.ts || 0) - (b.ts || 0);
  });
  return all;
}

function _fmtDateDMY(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return (
    days[dt.getDay()] +
    " " +
    String(parseInt(d)).padStart(2, "0") +
    ":" +
    String(parseInt(m)).padStart(2, "0") +
    ":" +
    y
  );
}

/* ════════════════════════════════════════════════════════════
   v87  (2026-05-25) — merged from stotram-patch.js
   Discrete-step text-size control + audio pause/scroll padding
   for the stotram lyric overlay.
   ════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* Discrete font sizes (px). Step 1 = smallest, last = biggest.
     The upper end scales with the device so larger phones/tablets
     can reach a comfortably big size instead of being capped at 10. */
  var BASE_STEPS = [11, 13, 15, 17, 19, 21, 24, 28, 32, 38, 44, 52, 62, 74];
  function buildSteps() {
    var vw = Math.max(
      window.innerWidth || 0,
      document.documentElement.clientWidth || 0,
    );
    // Cap top size at ~12% of viewport width, min 38px, max 96px.
    var cap = Math.max(38, Math.min(96, Math.round(vw * 0.12)));
    var out = [];
    for (var i = 0; i < BASE_STEPS.length; i++) {
      if (BASE_STEPS[i] <= cap) out.push(BASE_STEPS[i]);
    }
    if (out[out.length - 1] < cap) out.push(cap);
    return out;
  }
  var STEPS = buildSteps();
  var DEFAULT_STEP = 3; // index into STEPS (≈17px)
  var STORAGE_KEY = "lyr_step"; // new key (integer step)
  var LEGACY_KEY = "lyr_manual_px"; // old key (px value)

  var _autoStep = null;
  var _manualStep = null;
  var _pending = false;
  var _barBuilt = false;
  var _audioEl = null;

  try {
    var sv = localStorage.getItem(STORAGE_KEY);
    if (sv !== null) {
      var n = parseInt(sv, 10);
      if (!isNaN(n)) _manualStep = clampStep(n);
    } else {
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy !== null) _manualStep = pxToStep(parseFloat(legacy));
    }
  } catch (e) {}

  function clampStep(i) {
    if (i < 0) return 0;
    if (i > STEPS.length - 1) return STEPS.length - 1;
    return i;
  }
  function pxToStep(px) {
    if (!isFinite(px)) return DEFAULT_STEP;
    var best = 0,
      bestD = Infinity;
    for (var i = 0; i < STEPS.length; i++) {
      var d = Math.abs(STEPS[i] - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function autoFitStep(lyrEl) {
    var lines = lyrEl.querySelectorAll(".lyr-line");
    if (!lines.length) return null;
    var cw = lyrEl.getBoundingClientRect().width;
    if (cw < 4) return null;

    lyrEl.style.setProperty("--lyr-fs", STEPS[0] + "px");
    var i;
    for (i = 0; i < lines.length; i++) {
      lines[i].style.display = "inline-block";
      lines[i].style.width = "auto";
      lines[i].style.whiteSpace = "nowrap";
    }
    var maxW = 0;
    for (i = 0; i < lines.length; i++) {
      if (lines[i].offsetWidth > maxW) maxW = lines[i].offsetWidth;
    }
    for (i = 0; i < lines.length; i++) {
      lines[i].style.display = "";
      lines[i].style.width = "";
      lines[i].style.whiteSpace = "";
    }
    if (maxW < 1) return null;
    var idealPx = (cw / maxW) * STEPS[0];
    return pxToStep(idealPx);
  }

  function applyStep(step, modal) {
    step = clampStep(step);
    var px = STEPS[step];
    var value = px + "px";
    var lyrs = modal.querySelectorAll(".lyr");
    for (var i = 0; i < lyrs.length; i++) {
      lyrs[i].style.setProperty("--lyr-fs", value);
      var lines = lyrs[i].querySelectorAll(".lyr-line");
      for (var j = 0; j < lines.length; j++) lines[j].style.fontSize = value;
    }
    updateLabel("T " + (step + 1) + "/" + STEPS.length);
  }

  function fit() {
    if (_pending) return;
    var modal = document.querySelector(".lmo");
    if (!modal || !modal.classList.contains("show")) return;
    _pending = true;
    requestAnimationFrame(function () {
      var lyrs = modal.querySelectorAll(".lyr");
      var s = lyrs.length ? autoFitStep(lyrs[0]) : null;
      if (s !== null) _autoStep = s;
      var target = _manualStep !== null ? _manualStep : _autoStep;
      if (target !== null) applyStep(target, modal);
      _pending = false;
    });
  }
  function fitSoon() {
    [80, 300, 600, 1100, 2000].forEach(function (d) {
      setTimeout(fit, d);
    });
  }
  window.fitLyrLines = fit;

  var _resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      STEPS = buildSteps();
      if (_manualStep !== null) _manualStep = clampStep(_manualStep);
      fit();
    }, 220);
  });

  function buildBar() {
    if (_barBuilt) return;
    var modal = document.getElementById("lmo");
    if (!modal) return;
    _barBuilt = true;

    var wrap = document.createElement("div");
    wrap.id = "lyr-fs-ctrl";
    wrap.innerHTML =
      '<button id="lyr-fs-pause" style="display:none" title="Pause/Resume">⏸</button>' +
      '<button id="lyr-fs-down" title="Smaller text" aria-label="Smaller text">−</button>' +
      '<span id="lyr-fs-label">—</span>' +
      '<button id="lyr-fs-up"   title="Larger text"  aria-label="Larger text">+</button>';
    modal.appendChild(wrap);

    var down = document.getElementById("lyr-fs-down");
    var up = document.getElementById("lyr-fs-up");
    var pause = document.getElementById("lyr-fs-pause");

    function stepBy(delta) {
      var base =
        _manualStep !== null
          ? _manualStep
          : _autoStep !== null
            ? _autoStep
            : DEFAULT_STEP;
      _manualStep = clampStep(base + delta);
      savePref();
      var m = document.querySelector(".lmo");
      if (m) applyStep(_manualStep, m);
    }

    bindRepeat(down, function () {
      stepBy(-1);
    });
    bindRepeat(up, function () {
      stepBy(1);
    });

    pause.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!_audioEl) return;
      if (_audioEl.paused) _audioEl.play();
      else _audioEl.pause();
      syncPauseBtn();
    });
  }

  /* Tap + long-press repeat (140ms after a 380ms warm-up) */
  function bindRepeat(btn, fn) {
    var holdT, repT;
    function start(e) {
      e.stopPropagation();
      fn();
      holdT = setTimeout(function () {
        repT = setInterval(fn, 140);
      }, 380);
    }
    function stop() {
      clearTimeout(holdT);
      clearInterval(repT);
      holdT = repT = null;
    }
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  function updateLabel(t) {
    var el = document.getElementById("lyr-fs-label");
    if (el) el.textContent = t;
  }
  function syncPauseBtn() {
    var btn = document.getElementById("lyr-fs-pause");
    if (!btn) return;
    if (!_audioEl || _audioEl.ended) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "inline-block";
    btn.textContent = _audioEl.paused ? "▶" : "⏸";
    btn.title = _audioEl.paused ? "Resume" : "Pause";
  }
  function savePref() {
    try {
      if (_manualStep === null) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, String(_manualStep));
      }
    } catch (e) {}
  }

  function getPlayerHeight() {
    var ids = [
      "hcj-player-wrap",
      "lm-audio-player",
      "audio-player-wrap",
      "playerWrap",
      "player-wrap",
    ];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.offsetHeight > 20) return el.offsetHeight + 12;
    }
    if (_audioEl) {
      var p = _audioEl.parentElement;
      for (var k = 0; k < 5 && p; k++) {
        if (p.offsetHeight > 30 && p.offsetHeight < 300)
          return p.offsetHeight + 12;
        p = p.parentElement;
      }
    }
    return 110;
  }
  function setScrollPadding(active) {
    var modal = document.querySelector(".lmo");
    if (!modal) return;
    var inner = modal.querySelector(".lm-card-inner");
    if (inner)
      inner.style.paddingBottom = active ? getPlayerHeight() + "px" : "";
  }

  function onAudioEnded() {
    setScrollPadding(false);
    syncPauseBtn();
  }
  function _attachAudioListeners(el) {
    el.removeEventListener("pause", syncPauseBtn);
    el.removeEventListener("play", syncPauseBtn);
    el.removeEventListener("ended", onAudioEnded);
    el.addEventListener("pause", syncPauseBtn);
    el.addEventListener("play", syncPauseBtn);
    el.addEventListener("ended", onAudioEnded);
  }
  document.addEventListener(
    "play",
    function (e) {
      if (!e.target || e.target.tagName !== "AUDIO") return;
      _audioEl = e.target;
      _attachAudioListeners(_audioEl);
      syncPauseBtn();
      setScrollPadding(true);
    },
    true,
  );
  document.addEventListener(
    "pause",
    function (e) {
      if (e.target && e.target.tagName === "AUDIO") syncPauseBtn();
    },
    true,
  );

  window._lyrHcjAudioChanged = function (audioEl, isPlaying) {
    if (isPlaying) setScrollPadding(true);
    else if (!audioEl) setScrollPadding(false);
  };

  function init() {
    buildBar();
    var modal = document.querySelector(".lmo");
    if (!modal) return;

    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (
          m.type === "attributes" &&
          m.target === modal &&
          m.attributeName === "class"
        ) {
          if (modal.classList.contains("show")) fitSoon();
          return;
        }
        if (m.type === "childList" && m.addedNodes.length) {
          if (m.addedNodes[0] && m.addedNodes[0].id === "lyr-fs-ctrl") continue;
          // Only refit when an actual lyric line is added/removed.
          // Ignoring HCJ audio-player progress/text updates prevents
          // mid-scroll font-size rewrites that snap the page on iPad.
          var touchesLyrics = false;
          for (var ai = 0; ai < m.addedNodes.length; ai++) {
            var n = m.addedNodes[ai];
            if (
              n.nodeType === 1 &&
              ((n.classList &&
                (n.classList.contains("lyr-line") ||
                  n.classList.contains("lyr-prose"))) ||
                (n.querySelector && n.querySelector(".lyr-line, .lyr-prose")))
            ) {
              touchesLyrics = true;
              break;
            }
          }
          if (touchesLyrics) setTimeout(fit, 120);
          return;
        }
      }
    }).observe(modal, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });

    if (modal.classList.contains("show")) fitSoon();

    modal.addEventListener(
      "touchmove",
      function (e) {
        if (
          e.target &&
          e.target.closest &&
          e.target.closest(".lm-card-inner")
        ) {
          e.stopPropagation();
        }
      },
      { passive: true },
    );

    var clampScrollSoon = function () {
      setTimeout(function () {
        var inner = modal.querySelector(".lm-card-inner");
        if (!inner) return;
        var max = Math.max(0, inner.scrollHeight - inner.clientHeight);
        if (inner.scrollTop > max) inner.scrollTop = max;
      }, 50);
    };
    ["lyr-fs-up", "lyr-fs-down"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener("click", clampScrollSoon);
    });

    modal.addEventListener("click", function (e) {
      if (
        e.target.closest(".lm-nav-btn") ||
        e.target.closest(".lm-arr") ||
        e.target.closest(".lm-dot") ||
        e.target.closest("[data-verse]")
      ) {
        setTimeout(fit, 150);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// ═══════════════════════════════════════════════════════
// LEADERBOARD MODULE
// ═══════════════════════════════════════════════════════

window._lbPeriod = 'alltime';
window._lbUnsubscribe = null;

/** Get the date key prefix for the current period filter */
function _lbGetPeriodKeys(period) {
  const now = new Date();
  const keys = [];
  if (period === 'alltime') return null; // null = use totalJap field (no date filter)
  if (period === 'today') {
    // Always use local date key (App.S.tk) — avoids UTC offset bug for UTC+5:30/+6 users
    if (window.App && window.App.S && window.App.S.tk) {
      return [window.App.S.tk];
    }
    // Fallback: derive local date from device clock (NOT toISOString which is UTC)
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    return [y + '-' + m + '-' + d];
  }
  if (period === 'month') {
    const y = now.getFullYear(), m = now.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const dd = String(d).padStart(2,'0');
      const mm = String(m + 1).padStart(2,'0');
      keys.push(`${y}-${mm}-${dd}`);
    }
    return keys;
  }
  if (period === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      keys.push(`${y}-${m}-${dd}`);
    }
    return keys;
  }
  return null;
}

/** Format large jap counts with K/L abbreviations */
function _lbFmtJap(n) {
  if (!n) return '0';
  if (n >= 10000000) return (n/10000000).toFixed(1).replace(/\.0$/,'') + ' Cr';
  if (n >= 100000)   return (n/100000).toFixed(1).replace(/\.0$/,'')  + ' L';
  if (n >= 1000)     return (n/1000).toFixed(1).replace(/\.0$/,'')    + 'K';
  return n.toLocaleString('en-IN');
}

/** Load leaderboard from Firestore and render it */
async function loadLeaderboard(period) {
  window._lbPeriod = period || 'alltime';

  // Unsubscribe any previous listener
  if (window._lbUnsubscribe) { try { window._lbUnsubscribe(); } catch(_) {} }

  const list = document.getElementById('lbList');
  const empty = document.getElementById('lbEmpty');
  const signInPrompt = document.getElementById('lbSigninPrompt');
  const optinBanner = document.getElementById('lbOptinBanner');
  const myRankCard = document.getElementById('lbMyRank');

  // Hide/show states
  if (empty) empty.style.display = 'none';
  if (signInPrompt) signInPrompt.style.display = 'none';
  if (myRankCard) myRankCard.style.display = 'none';

  // Show shimmer
  if (list) {
    list.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const sh = document.createElement('div');
      sh.className = 'lb-shimmer';
      list.appendChild(sh);
    }
  }

  // Must be signed in
  if (!fbUser || !fbDb) {
    if (list) list.innerHTML = '';
    if (signInPrompt) signInPrompt.style.display = 'block';
    if (optinBanner) optinBanner.style.display = 'none';
    return;
  }

  // Show opt-in banner if not opted in
  const optedIn = App.S.lbOptIn || false;
  if (optinBanner) optinBanner.style.display = optedIn ? 'none' : 'flex';

  // Populate settings UI
  populateLbSettingsUI();

  try {
    // Real-time snapshot of leaderboard collection
    window._lbUnsubscribe = fbDb.collection('leaderboard')
      .where('optIn', '==', true)
      .limit(100)
      .onSnapshot(function(snap) {
        const docs = [];
        snap.forEach(function(doc) {
          const d = doc.data();
          d._uid = doc.id;
          docs.push(d);
        });
        renderLeaderboard(docs, window._lbPeriod);
      }, function(err) {
        console.warn('Leaderboard snapshot error:', err.message);
        if (list) list.innerHTML = '<div class="lb-empty"><div style="font-size:40px;margin-bottom:12px">⚠️</div><div style="font-size:13px;color:var(--rl)">Could not load leaderboard</div></div>';
      });
  } catch(e) {
    console.warn('loadLeaderboard error:', e.message);
  }
}

/** Render leaderboard entries given raw Firestore docs */
function renderLeaderboard(docs, period) {
  const list = document.getElementById('lbList');
  const empty = document.getElementById('lbEmpty');
  const myRankCard = document.getElementById('lbMyRank');
  const myRankNum = document.getElementById('lbMyRankNum');
  const myRankJap = document.getElementById('lbMyRankJap');
  if (!list) return;

  // Compute score for each doc based on period
  const periodKeys = _lbGetPeriodKeys(period);
  const scored = docs.map(function(d) {
    let score = 0;
    let timeScore = 0;
    if (!periodKeys) {
      // All time — use stored totalJap
      score = (d.totalJap || 0);
      timeScore = (d.timerSeconds || 0);
      const sr = Object.values(d.history || {}).reduce((a,b)=>a+b,0);
      const srv = Object.values(d.historyRV || {}).reduce((a,b)=>a+b,0);
      const shk = Object.values(d.historyHK || {}).reduce((a,b)=>a+b,0);
      const s28 = Object.values(d.history28 || {}).reduce((a,b)=>a+b,0);
      d._breakdown = { r: sr, rv: srv, hk: shk, n28: s28 };
      const tr2 = Object.values(d.timerHistory || {}).reduce((a,b)=>a+b,0);
      const trv2 = Object.values(d.timerHistoryRV || {}).reduce((a,b)=>a+b,0);
      const thk2 = Object.values(d.timerHistoryHK || {}).reduce((a,b)=>a+b,0);
      const t282 = Object.values(d.timer28History || {}).reduce((a,b)=>a+b,0);
      d._timeBreakdown = { r: tr2, rv: trv2, hk: thk2, n28: t282 };
    } else {
      // Sum history for this period
      const hist   = d.history || {};
      const histRV = d.historyRV || {};
      const histHK = d.historyHK || {};
      const hist28 = d.history28 || {};
      let sr = 0, srv = 0, shk = 0, s28 = 0;
      let tr = 0, trv = 0, thk = 0, t28 = 0;
      const tHist = d.timerHistory || {};
      const tHistRV = d.timerHistoryRV || {};
      const tHistHK = d.timerHistoryHK || {};
      const tHist28 = d.timer28History || {};
      periodKeys.forEach(function(k) {
        sr += (hist[k] || 0);
        srv += (histRV[k] || 0);
        shk += (histHK[k] || 0);
        s28 += (hist28[k] || 0);
        tr += (tHist[k] || 0);
        trv += (tHistRV[k] || 0);
        thk += (tHistHK[k] || 0);
        t28 += (tHist28[k] || 0);
      });
      score += sr + srv + shk + s28;
      timeScore += tr + trv + thk + t28;
      d._breakdown = { r: sr, rv: srv, hk: shk, n28: s28 };
      d._timeBreakdown = { r: tr, rv: trv, hk: thk, n28: t28 };
    }
    return { ...d, score, timeScore };
  });

  // Sort descending, filter out zero scores
  const filtered = scored
    .filter(function(d) { return d.score > 0; })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 50);

  if (!filtered.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (myRankCard) myRankCard.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Find current user's rank
  const myUid = fbUser && fbUser.uid;
  let myRank = -1;
  let myScore = 0;
  filtered.forEach(function(d, idx) {
    if (d._uid === myUid) { myRank = idx + 1; myScore = d.score; }
  });

  // Update my-rank card
  if (myRank > 0 && App.S.lbOptIn) {
    if (myRankCard) myRankCard.style.display = 'flex';
    if (myRankNum) myRankNum.textContent = '#' + myRank;
    if (myRankJap) myRankJap.textContent = _lbFmtJap(myScore) + ' jap';
  } else {
    if (myRankCard) myRankCard.style.display = 'none';
  }

  // Build HTML
  const medals = ['🥇','🥈','🥉'];
  const html = filtered.map(function(d, idx) {
    const rank = idx + 1;
        const isMe = (d._uid === myUid);
    const isTop3 = rank <= 3;
    const medal = rank <= 3 ? medals[rank-1] : null;
    const badgeClass = rank === 1 ? 'lb-badge-1' : rank === 2 ? 'lb-badge-2' : rank === 3 ? 'lb-badge-3' : 'lb-badge-n';
    const badgeContent = medal ? medal : rank;
    const rowClass = 'lb-row' + (isMe ? ' lb-row-me' : '') + (isTop3 ? ' lb-row-top3' : '');
    const nameClass = 'lb-name' + (isMe ? ' lb-name-me' : '');
    const meMark = isMe ? ' ✦ You' : '';
    
    const nowMs = Date.now();
    let isOnline = false;
    if (d.lastActive) isOnline = (nowMs - d.lastActive.toDate().getTime()) < 5 * 60 * 1000;
    else if (d.updatedAt) isOnline = (nowMs - d.updatedAt.toDate().getTime()) < 5 * 60 * 1000;
    const onlineDot = isOnline ? '<span style="display:inline-block;width:8px;height:8px;background:#4ade80;border-radius:50%;margin-left:6px;box-shadow:0 0 6px rgba(74,222,128,0.6)" title="Online"></span>' : '';
    
    const name = (d.displayName || 'Anonymous Devotee').replace(/</g,'&lt;').replace(/>/g,'&gt;') + onlineDot;
    const ms = App.S.ms || 108;
    
    let b = d._breakdown || { r:0, rv:0, hk:0, n28:0 };
    let tb = d._timeBreakdown || { r:0, rv:0, hk:0, n28:0 };
    
    // Build per-type breakdown: R and RV show malas (count/108), 28N shows cycles (count/28), HK shows malas
    let bdParts = [];
    if (b.r > 0) {
      const rM = Math.floor(b.r / ms);
      const rStr = _lbFmtJap(b.r) + (rM > 0 ? ' (' + rM + 'M)' : '');
      bdParts.push('R: ' + rStr + (tb.r > 0 ? ' ⏱ ' + _histFmtSec(tb.r) : ''));
    }
    if (b.rv > 0) {
      const rvM = Math.floor(b.rv / ms);
      const rvStr = _lbFmtJap(b.rv) + (rvM > 0 ? ' (' + rvM + 'M)' : '');
      bdParts.push('RV: ' + rvStr + (tb.rv > 0 ? ' ⏱ ' + _histFmtSec(tb.rv) : ''));
    }
    if (b.n28 > 0) {
      const cyc28 = Math.floor(b.n28 / 28);
      const cyc28Str = (cyc28 > 0 ? cyc28 + 'C ' : '') + '(' + _lbFmtJap(b.n28) + ')';
      bdParts.push('28N: ' + cyc28Str + (tb.n28 > 0 ? ' ⏱ ' + _histFmtSec(tb.n28) : ''));
    }
    if (b.hk > 0) {
      const hkM = Math.floor(b.hk / ms);
      const hkStr = _lbFmtJap(b.hk) + (hkM > 0 ? ' (' + hkM + 'M)' : '');
      bdParts.push('HK: ' + hkStr + (tb.hk > 0 ? ' ⏱ ' + _histFmtSec(tb.hk) : ''));
    }
    // Total: only count R+RV+HK malas (not 28N), 28N shown as cycles separately
    const japOnly = (b.r || 0) + (b.rv || 0) + (b.hk || 0);
    const totalMalas = Math.floor(japOnly / ms);
    const total28Cyc = Math.floor((b.n28 || 0) / 28);
    let totalStr = _lbFmtJap(d.score) + ' jap';
    if (totalMalas > 0 || total28Cyc > 0) {
      let tParts = [];
      if (totalMalas > 0) tParts.push(totalMalas + 'M');
      if (total28Cyc > 0) tParts.push(total28Cyc + 'C');
      totalStr += ' (' + tParts.join(', ') + ')';
    }
    if (d.timeScore > 0) totalStr += ' ⏱ ' + _histFmtSec(d.timeScore);
    if (d.streak > 0) totalStr += ' 🔥' + d.streak + 'd';
    const breakdown = bdParts.length > 0 ? bdParts.join(' · ') : '';
    const meta = (breakdown ? breakdown + '<br>' : '') + 'Total: ' + totalStr;
    return `<div class="${rowClass}">
      <div class="lb-badge ${badgeClass}">${badgeContent}</div>
      <div class="lb-info">
        <div class="${nameClass}">${name}${meMark}</div>
        <div class="lb-meta">${meta}</div>
      </div>
      <div class="lb-count">
        <div class="lb-count-num">${_lbFmtJap(d.score)}</div>
        <div class="lb-count-lbl">jap</div>
      </div>
    </div>`;
  }).join('');

  list.innerHTML = html;
}

/** Switch leaderboard period tab */
function lbSwitchPeriod(period) {
  window._lbPeriod = period;
  ['alltime','month','week','today'].forEach(function(p) {
    const btn = document.getElementById('lbTab' + p.charAt(0).toUpperCase() + p.slice(1));
    if (btn) btn.classList.toggle('active', p === period);
  });
  // Re-render with the same snapshot data (avoid extra Firestore read)
  // If there's no snapshot loaded yet, do a full load
  loadLeaderboard(period);
}

/** Push current user's data to the leaderboard collection */
async function pushLeaderboard() {
  if (!fbUser || !fbDb) return;
  if (!App.S.lbOptIn) {
    // If opted out, remove the entry
    try {
      await fbDb.collection('leaderboard').doc(fbUser.uid).delete();
    } catch(_) {}
    return;
  }

  // Compute lifetime totals
  const hist   = App.S.history   || {};
  const histRV = App.S.historyRV || {};
  const histHK = App.S.historyHK || {};
  const totalRadha = Object.values(hist).reduce((a,b)=>a+b,0);
  const totalRV    = Object.values(histRV).reduce((a,b)=>a+b,0);
  const totalHK    = Object.values(histHK).reduce((a,b)=>a+b,0);
  const totalJap   = Math.max(0, totalRadha + totalRV + totalHK - (App.S.nameJapDeduct||0) - (App.S.nameJapDeductRV||0) - (App.S.nameJapDeductHK||0));

  // Build display name
  let displayName = (App.S.lbDisplayName || '').trim();
  if (!displayName && fbUser) {
    displayName = (fbUser.displayName || (fbUser.email || '').split('@')[0] || 'Anonymous Devotee').slice(0,30);
  }
  if (!displayName) displayName = 'Anonymous Devotee';

  // Compute streak from App.S (reuse existing streak logic)
  let streak = 0;
  try {
    const tk = App.S.tk;
    const allHist = {};
    Object.keys({...hist,...histRV,...histHK}).forEach(function(k) {
      allHist[k] = (hist[k]||0)+(histRV[k]||0)+(histHK[k]||0);
    });
    const today = new Date(tk+'T00:00:00');
    let d = new Date(today);
    while(true) {
      const key = d.toISOString().slice(0,10);
      const dayJap = allHist[key] || 0;
      const target = App.S.dt || App.S.dtRV || App.S.dtHK || 0;
      if (dayJap <= 0 || (target > 0 && dayJap < target)) break;
      streak++;
      d.setDate(d.getDate()-1);
      if (streak > 3650) break;
    }
  } catch(_) {}

  const payload = {
    displayName,
    totalJap,
    totalMalas: Math.floor(totalJap / (App.S.ms || 108)),
    streak,
    optIn: true,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    // Store per-day histories so month/week filtering works
    history:   hist,
    historyRV: histRV,
    historyHK: histHK,
    history28: App.S.h28 || {},
    // Push total timer seconds for leaderboard display
    timerSeconds: Object.values(App.S.timerHistory || {}).reduce((a,b)=>a+b,0) +
                  Object.values(App.S.timerHistoryRV || {}).reduce((a,b)=>a+b,0) +
                  Object.values(App.S.timerHistoryHK || {}).reduce((a,b)=>a+b,0) +
                  Object.values(App.S.timer28History || {}).reduce((a,b)=>a+b,0),
    timerHistory:   App.S.timerHistory || {},
    timerHistoryRV: App.S.timerHistoryRV || {},
    timerHistoryHK: App.S.timerHistoryHK || {},
    timer28History: App.S.timer28History || {},
  };

  try {
    await fbDb.collection('leaderboard').doc(fbUser.uid).set(payload);
  } catch(e) {
    console.warn('pushLeaderboard error:', e.message);
  }
}

/** Toggle leaderboard opt-in from Settings */
async function toggleLbOptIn() {
  if (!fbUser) {
    toast('Please sign in to join the leaderboard');
    return;
  }
  App.S.lbOptIn = !App.S.lbOptIn;
  populateLbSettingsUI();
  App.save();
  if (App.S.lbOptIn) {
    toast('🏆 Joined the leaderboard!');
    await pushLeaderboard();
  } else {
    toast('Removed from leaderboard');
    await pushLeaderboard(); // will delete the doc
  }
  // Refresh if the leaderboard view is currently visible
  const vlb = document.getElementById('vlb');
  if (vlb && vlb.classList.contains('active')) {
    loadLeaderboard(window._lbPeriod || 'alltime');
  }
}

/** Save display name from Settings */
async function saveLbName() {
  const inp = document.getElementById('lbNameIn');
  const fb  = document.getElementById('lbNameFeedback');
  if (!inp) return;
  const name = inp.value.trim().slice(0, 30);
  if (!name) {
    if (fb) { fb.textContent = 'Please enter a name'; fb.style.color = 'var(--rl)'; }
    return;
  }
  App.S.lbDisplayName = name;
  App.save();
  if (fb) {
    fb.textContent = '✓ Saved!';
    fb.style.color = 'var(--green)';
    setTimeout(function() { if(fb) fb.textContent = ''; }, 2500);
  }
  if (App.S.lbOptIn) {
    await pushLeaderboard();
  }
  toast('Display name saved 🙏');
}

/** Sync Settings UI with current App.S leaderboard state */
function populateLbSettingsUI() {
  const tg  = document.getElementById('tgLbOptIn');
  const inp = document.getElementById('lbNameIn');
  const row = document.getElementById('lbNameRow');
  if (tg)  tg.classList.toggle('on', !!App.S.lbOptIn);
  if (inp && !inp.value) inp.value = App.S.lbDisplayName || '';
  if (row) row.style.display = App.S.lbOptIn ? 'block' : 'none';
}

// ═══════════════════════════════════════════════════════
// BACKGROUND PHOTO CUSTOMIZATION (Visual Picker + Upload)
// ═══════════════════════════════════════════════════════

// Keep online status updated every 3 minutes while app is active
setInterval(() => {
  if (App && App.S && App.S.lbOptIn && fbUser && fbDb && !document.hidden) {
    fbDb.collection('leaderboard').doc(fbUser.uid).update({
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(()=>{});
  }
}, 3 * 60 * 1000);

// 1. Initialize dedicated Photos Database to prevent localStorage bloating
const PhotosDB = {
  db: null,
  async init() {
    if (this.db) return;
    return new Promise((res, rej) => {
      const req = indexedDB.open("RadhaJapPhotosDB", 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
      };
      req.onsuccess = e => { this.db = e.target.result; res(); };
      req.onerror = () => rej(req.error);
    });
  },
  async get(key) {
    await this.init();
    return new Promise(res => {
      const req = this.db.transaction("photos", "readonly").objectStore("photos").get(key);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  },
  async put(key, dataUrl) {
    await this.init();
    return new Promise(res => {
      const tx = this.db.transaction("photos", "readwrite");
      tx.objectStore("photos").put(dataUrl, key);
      tx.oncomplete = res;
    });
  },
  async del(key) {
    await this.init();
    return new Promise(res => {
      const tx = this.db.transaction("photos", "readwrite");
      tx.objectStore("photos").delete(key);
      tx.oncomplete = res;
    });
  }
};

const PHOTO_CONFIG = {
  rv:     { id: 'bgRadhaVallabh', stateKey: 'bgRadhaVallabh', folder: 'radha_vallabh',  maxNum: 9, fallback: 'Radha-Vallabh.png' },
  hitju:  { id: 'bgHitju',        stateKey: 'bgHitju',        folder: 'hitju_maharaj',  maxNum: 9, fallback: 'hitju-maharaj.png' },
  gurudev:{ id: 'bgGurudev',      stateKey: 'bgGurudev',      folder: 'gurudev',        maxNum: 9, fallback: 'gurudev.png' }
};

window.renderPhotoPickers = async function() {
  for (const [key, conf] of Object.entries(PHOTO_CONFIG)) {
    const stripId = key === 'rv' ? 'photoStripRV' : key === 'hitju' ? 'photoStripHitju' : 'photoStripGurudev';
    const strip = document.getElementById(stripId);
    if (!strip) continue;
    strip.innerHTML = '';
    
    let currentVal = App.S[conf.stateKey] ?? 1;
    
    // Add default repo photos
    for (let i = 1; i <= conf.maxNum; i++) {
      const img = document.createElement('img');
      img.className = `photo-thumb ${currentVal === i ? 'selected' : ''}`;
      img.src = `./${conf.folder}/${i}.jpg`;
      // If JPG fails, try PNG. If both fail, hide it entirely so missing files don't show broken icons.
      img.onerror = () => {
        if (img.src.endsWith('.jpg')) {
          img.src = `./${conf.folder}/${i}.png`;
        } else {
          img.style.display = 'none';
        }
      };
      img.onclick = () => selectRepoPhoto(key, i);
      strip.appendChild(img);
    }
    
    // If a custom photo is in IDB, append it as a thumbnail always
    const customData = await PhotosDB.get(key);
    if (customData) {
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.style.display = 'inline-block';
      wrap.style.flexShrink = '0';
      
      const img = document.createElement('img');
      img.className = `photo-thumb ${currentVal === 'custom' ? 'selected' : ''}`;
      img.src = customData;
      img.onclick = () => {
        App.S[conf.stateKey] = 'custom';
        App.save();
        renderPhotoPickers();
        applyBgPhotos();
      };
      
      const delBtn = document.createElement('div');
      delBtn.innerHTML = '🗑️';
      delBtn.style.position = 'absolute';
      delBtn.style.top = '-4px';
      delBtn.style.right = '-4px';
      delBtn.style.background = '#ff4d4d';
      delBtn.style.borderRadius = '50%';
      delBtn.style.padding = '4px';
      delBtn.style.fontSize = '12px';
      delBtn.style.lineHeight = '1';
      delBtn.style.cursor = 'pointer';
      delBtn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        await PhotosDB.del(key);
        if (App.S[conf.stateKey] === 'custom') {
          App.S[conf.stateKey] = 1;
          App.save();
          applyBgPhotos();
        }
        renderPhotoPickers();
      };
      
      wrap.appendChild(img);
      wrap.appendChild(delBtn);
      strip.appendChild(wrap);
    }
    
    // Update active state of buttons — IIFE captures currentVal + strip per iteration
    ((val, s) => {
      setTimeout(() => {
        const row = s.parentElement;
        if (!row) return;
        const btns = row.querySelectorAll('.photo-reset-btn, .photo-upload-btn');
        btns.forEach(b => b.classList.remove('active'));
        if (val === 0 || val === '0') {
          const blankBtn = Array.from(btns).find(b => b.textContent.trim().includes('Blank'));
          if (blankBtn) blankBtn.classList.add('active');
        } else if (val === 'custom') {
          const uploadBtn = Array.from(btns).find(b => b.textContent.trim().includes('Upload'));
          if (uploadBtn) uploadBtn.classList.add('active');
        } else {
          const defBtn = Array.from(btns).find(b => b.textContent.trim().includes('Default'));
          if (defBtn) defBtn.classList.add('active');
        }
      }, 10);
    })(currentVal, strip);
  }
};

window.selectRepoPhoto = function(key, num) {
  const conf = PHOTO_CONFIG[key];
  App.S[conf.stateKey] = num;
  App.save();
  renderPhotoPickers();
  applyBgPhotos();
};

window.uploadCustomPhoto = function(key, inputElement) {
  const file = inputElement.files[0];
  if (!file) return;
  
  // Validate file size (prevent huge memory issues, limit to ~5MB)
  if (file.size > 5 * 1024 * 1024) {
    if(typeof toast === 'function') toast("File too large. Please select an image under 5MB.");
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    await PhotosDB.put(key, dataUrl);
    const conf = PHOTO_CONFIG[key];
    App.S[conf.stateKey] = 'custom';
    App.save();
    renderPhotoPickers();
    applyBgPhotos();
    if(typeof toast === 'function') toast("Custom photo saved! 🙏");
  };
  reader.readAsDataURL(file);
};

window.resetPhoto = async function(key) {
  // We no longer delete the custom photo from IDB, just switch away from it
  selectRepoPhoto(key, 1);
  if(typeof toast === 'function') toast("Reset to default photo");
};

window.applyBgPhotos = async function() {
  for (const [key, conf] of Object.entries(PHOTO_CONFIG)) {
    const el = document.getElementById(conf.id);
    if (!el) continue;
    
    let val = App.S[conf.stateKey];
    if (val === undefined) val = 1;
    
    // Blank Mode
    if (val === 0 || val === '0') {
      el.style.display = 'none';
      continue;
    } else {
      el.style.display = '';
    }
    
    if (val === 'custom') {
      const customData = await PhotosDB.get(key);
      if (customData) {
        el.src = customData;
        el.classList.add('custom-bg');
      } else {
        val = 1; // Fallback if IDB entry is missing
      }
    }
    
    if (val !== 'custom' && val !== 0) {
      el.classList.remove('custom-bg');
      const jpgSrc = `./${conf.folder}/${val}.jpg`;
      const pngSrc = `./${conf.folder}/${val}.png`;
      const fallbackSrc = `./${conf.fallback || (conf.folder + '/1.png')}`;
      const temp = new Image();
      temp.onload = () => { el.src = jpgSrc; };
      temp.onerror = () => {
        const temp2 = new Image();
        temp2.onload = () => { el.src = pngSrc; };
        temp2.onerror = () => { el.src = fallbackSrc; }; // Final fallback to root file
        temp2.src = pngSrc;
      };
      temp.src = jpgSrc;
    }
  }
};

// ✨ MALA GLOW FLASH — all deity images briefly show fully with huge glow, synced
window.triggerMalaGlowFlash = function() {
  const ids = ['bgRadhaVallabh', 'bgHitju', 'bgGurudev'];
  const els = ids.map(id => document.getElementById(id)).filter(el => el && el.style.display !== 'none');
  if (!els.length) return;

  // Add sustained glow class — stays ON until shankya finishes
  els.forEach(el => {
    el.classList.remove('mala-glow-flash');
    el.classList.add('mala-glow-sustained');
  });

  // Listen for Panchojanno Shankya audio end to remove glow
  function removeSustainedGlow() {
    els.forEach(el => {
      el.classList.remove('mala-glow-sustained');
    });
  }

  // Attach to shankya audio onended if available
  if (typeof _shankyaAudio !== 'undefined' && _shankyaAudio) {
    const handler = function() {
      removeSustainedGlow();
      _shankyaAudio.removeEventListener('ended', handler);
    };
    _shankyaAudio.addEventListener('ended', handler);
    // Safety fallback: if audio doesn't fire ended within 30s, remove anyway
    setTimeout(() => {
      removeSustainedGlow();
      try { _shankyaAudio.removeEventListener('ended', handler); } catch(e){}
    }, 30000);
  } else {
    // No audio: hold glow for 4s fallback
    setTimeout(removeSustainedGlow, 4000);
  }
};

// ==========================================
// NEW FEATURES: AUTO-BACKUP, NOTIFICATIONS, FEEDBACK, VIDEO LINK
// ==========================================

// 1. Auto Backup on Open
async function checkAutoBackup() {
  const lastBackupStr = localStorage.getItem('rjap_lastAutoBackup');
  let lastBackup = lastBackupStr ? parseInt(lastBackupStr) : 0;
  
  const now = new Date();
  let mostRecentThreshold = new Date(now);
  mostRecentThreshold.setMinutes(0, 0, 0);
  if (now.getHours() >= 12) {
    mostRecentThreshold.setHours(12);
  } else {
    mostRecentThreshold.setHours(0);
  }
  
  // Also only run if we have App.S initialized to prevent empty backups
  if (lastBackup < mostRecentThreshold.getTime() && window.App && App.S) {
    let backupData = {};
    for (let i = 0; i < localStorage.length; i++) {
      let key = localStorage.key(i);
      backupData[key] = localStorage.getItem(key);
    }
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const dStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const timeStr = now.getHours() >= 12 ? '12PM' : '12AM';
    a.download = `RadhaNaamJap_Backup_${dStr}_${timeStr}.json`;
    
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
    
    localStorage.setItem('rjap_lastAutoBackup', Date.now().toString());
    toast('Auto Backup Generated! 🙏');
  }
}

// 2. Notifications System — removed

// 3. Feedback System
// ═══════════════════════════════════════════════════════
// CHAT-BASED FEEDBACK SYSTEM
// Each user has one thread doc in /feedbacks/{uid}
// Messages stored in /feedbacks/{uid}/messages subcollection
// Real-time via onSnapshot — both user and dev see live updates
// ═══════════════════════════════════════════════════════

// ── Helpers ───────────────────────────────────────────
function _chatBubble(text, sender, time) {
  const isUser   = sender === 'user';
  const isDev    = sender === 'developer';
  const alignDir = isUser ? 'flex-end' : 'flex-start';
  const bg       = isUser
    ? 'rgba(74,144,226,0.22)'
    : isDev
      ? 'rgba(46,204,113,0.18)'
      : 'rgba(255,255,255,0.06)';
  const border   = isUser
    ? 'rgba(74,144,226,0.45)'
    : isDev
      ? 'rgba(46,204,113,0.4)'
      : 'rgba(255,255,255,0.1)';
  const label    = isDev ? '🛠 Developer' : '';
  const d = document.createElement('div');
  d.style.cssText = `display:flex;flex-direction:column;align-items:${alignDir};`;
  d.innerHTML = `
    ${label ? `<div style="font-size:10px;color:#2ecc71;font-weight:600;margin-bottom:2px;padding:0 4px;">${label}</div>` : ''}
    <div style="max-width:82%;background:${bg};border:1px solid ${border};border-radius:14px;padding:9px 13px;">
      <div style="white-space:pre-wrap;word-break:break-word;color:var(--tl);font-size:13px;line-height:1.55;">${escHtml(text)}</div>
    </div>
    <div style="font-size:10px;color:rgba(255,255,255,0.28);margin-top:3px;padding:0 4px;">${time}</div>`;
  return d;
}

function _scrollToBottom(el) {
  if (el) el.scrollTop = el.scrollHeight;
}

function _fmtMsgTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
    : d.toLocaleDateString([], {day:'2-digit', month:'short'}) + ' ' +
      d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

// ── USER CHAT ─────────────────────────────────────────
let _userChatUnsub = null;
let _userThreadRef = null;

async function _ensureUserThread() {
  if (!fbUser) return null;
  const uid = fbUser.uid;
  // Thread doc lives at /feedbacks/{uid} — stable, uid-keyed
  const ref = fbDb.collection('feedbacks').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const userName  = fbUser.displayName || (fbUser.email || '').split('@')[0] || 'Devotee';
    const userPhone = fbUser.phoneNumber || null;
    const userEmail = fbUser.email || null;
    await ref.set({
      uid,
      userName,
      userPhone,
      userEmail,
      lastMessage: '',
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),
      devRead: false,
      userRead: true
    });
  }
  return ref;
}

window.openUserChat = async function() {
  if (!fbUser) { toast('Please sign in first to use chat.'); return; }
  const modal = document.getElementById('userChatModal');
  const msgBox = document.getElementById('userChatMessages');
  if (!modal || !msgBox) return;
  modal.style.display = 'flex';

  // Mark thread as userRead
  _userThreadRef = await _ensureUserThread();
  if (_userThreadRef) {
    _userThreadRef.update({ userRead: true }).catch(() => {});
    // Hide user badge
    const b = document.getElementById('userChatBadge');
    if (b) b.style.display = 'none';
  }

  msgBox.innerHTML = '<div style="text-align:center;color:var(--td);margin-top:30px;font-size:13px;">Loading messages...</div>';

  // Real-time listener on messages subcollection
  if (_userChatUnsub) { try { _userChatUnsub(); } catch(_) {} }
  _userChatUnsub = _userThreadRef.collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot((snap) => {
      msgBox.innerHTML = '';
      if (snap.empty) {
        msgBox.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);margin-top:40px;font-size:13px;">No messages yet.<br>Send your first message below! 🙏</div>';
        return;
      }
      snap.forEach(doc => {
        const d = doc.data();
        msgBox.appendChild(_chatBubble(d.text || '', d.sender, _fmtMsgTime(d.createdAt)));
      });
      _scrollToBottom(msgBox);
    }, () => {});
};

window.closeUserChat = function() {
  const modal = document.getElementById('userChatModal');
  if (modal) modal.style.display = 'none';
  if (_userChatUnsub) { try { _userChatUnsub(); } catch(_) {} _userChatUnsub = null; }
};

window._userChatSend = async function() {
  const inp = document.getElementById('userChatInput');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  if (!fbUser) { toast('Please sign in first.'); return; }
  inp.value = '';
  inp.disabled = true;
  try {
    if (!_userThreadRef) _userThreadRef = await _ensureUserThread();
    await _userThreadRef.collection('messages').add({
      text,
      sender: 'user',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await _userThreadRef.update({
      lastMessage: text,
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),
      devRead: false,
      userRead: true
    });
  } catch(e) {
    toast('Error: ' + e.message);
  } finally {
    inp.disabled = false;
    inp.focus();
  }
};

// Enter to send (Shift+Enter for newline)
document.addEventListener('DOMContentLoaded', function() {
  const inp = document.getElementById('userChatInput');
  if (inp) inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._userChatSend(); }
  });
  const dinp = document.getElementById('devChatInput');
  if (dinp) dinp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._devChatSend(); }
  });
});

// ── DEVELOPER CHAT PANEL ─────────────────────────────
let _devChatUnsub = null;
let _devActiveThreadId = null;
let _devThreadsUnsub = null;

window.openDevFeedbackPanel = function() {
  if (!isDeveloper()) return;
  const modal = document.getElementById('devFeedbackModal');
  if (!modal) return;
  modal.style.display = 'flex';
  _devShowThreadList();
};

function _devShowThreadList() {
  const content   = document.getElementById('devFeedbackContent');
  const chatView  = document.getElementById('devChatView');
  const titleEl   = document.getElementById('devPanelTitle');
  const backBtn   = document.getElementById('devPanelBackBtn');
  if (!content || !chatView) return;

  // Switch to list view
  content.style.display = '';
  chatView.style.display = 'none';
  if (titleEl) titleEl.textContent = 'User Feedback';
  if (backBtn) backBtn.textContent = '✕ Close';

  // Stop any per-thread listener
  if (_devChatUnsub) { try { _devChatUnsub(); } catch(_) {} _devChatUnsub = null; }
  _devActiveThreadId = null;

  // Update badge
  const badge = document.getElementById('feedbackBadge');
  if (badge) badge.style.display = 'none';

  content.innerHTML = '<div style="text-align:center;color:var(--td);margin-top:20px;">Loading...</div>';

  // Real-time thread list
  if (_devThreadsUnsub) { try { _devThreadsUnsub(); } catch(_) {} }
  _devThreadsUnsub = fbDb.collection('feedbacks')
    .orderBy('lastAt', 'desc')
    .limit(50)
    .onSnapshot((snap) => {
      if (snap.empty) {
        content.innerHTML = '<div style="text-align:center;color:var(--td);margin-top:30px;">No feedback yet.</div>';
        return;
      }
      content.innerHTML = '';
      snap.forEach(doc => {
        const data = doc.data();
        const isUnread = data.devRead === false;
        const name  = escHtml(data.userName || data.userEmail || 'Anonymous');
        const phone = data.userPhone ? escHtml(data.userPhone) : null;
        const preview = escHtml((data.lastMessage || '').slice(0, 60));
        const timeStr = data.lastAt ? _fmtMsgTime(data.lastAt) : '';

        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;
          border:1.5px solid ${isUnread ? 'rgba(255,210,0,0.55)' : 'rgba(46,204,113,0.18)'};
          background:${isUnread ? 'rgba(255,210,0,0.04)' : 'rgba(0,0,0,0.25)'};
          margin-bottom:10px;cursor:pointer;`;
        row.innerHTML = `
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:2px;">
              ${isUnread ? '<div style="width:8px;height:8px;border-radius:50%;background:#FFD700;flex-shrink:0;"></div>' : ''}
              <div style="font-size:13px;color:#2ecc71;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
            </div>
            ${phone ? `<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:3px;">📱 ${phone}</div>` : ''}
            <div style="font-size:12px;color:rgba(255,255,255,0.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${preview}</div>
          </div>
          <div style="font-size:10px;color:rgba(255,255,255,0.3);flex-shrink:0;text-align:right;">${timeStr}</div>`;
        row.onclick = () => _devOpenThread(doc.id, data);
        content.appendChild(row);
      });
    }, () => {});
}

function _devOpenThread(threadId, data) {
  const content   = document.getElementById('devFeedbackContent');
  const chatView  = document.getElementById('devChatView');
  const msgBox    = document.getElementById('devChatMessages');
  const titleEl   = document.getElementById('devPanelTitle');
  const backBtn   = document.getElementById('devPanelBackBtn');
  if (!content || !chatView || !msgBox) return;

  // Stop thread-list listener while in chat view
  if (_devThreadsUnsub) { try { _devThreadsUnsub(); } catch(_) {} _devThreadsUnsub = null; }

  _devActiveThreadId = threadId;
  const name = data.userName || data.userEmail || 'Anonymous';

  // Switch to chat view
  content.style.display = 'none';
  chatView.style.display = 'flex';
  if (titleEl) titleEl.textContent = name;
  if (backBtn) backBtn.textContent = '← Back';

  // Mark as devRead
  fbDb.collection('feedbacks').doc(threadId).update({ devRead: true }).catch(() => {});

  msgBox.innerHTML = '';

  // Real-time messages
  if (_devChatUnsub) { try { _devChatUnsub(); } catch(_) {} }
  _devChatUnsub = fbDb.collection('feedbacks').doc(threadId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot((snap) => {
      msgBox.innerHTML = '';
      if (snap.empty) {
        msgBox.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);margin-top:30px;">No messages yet.</div>';
        return;
      }
      snap.forEach(doc => {
        const d = doc.data();
        msgBox.appendChild(_chatBubble(d.text || '', d.sender, _fmtMsgTime(d.createdAt)));
      });
      _scrollToBottom(msgBox);
    }, () => {});
}

window._devPanelBack = function() {
  // If in chat view, go back to list; otherwise close modal
  const chatView = document.getElementById('devChatView');
  const isInChat = chatView && chatView.style.display !== 'none';
  if (isInChat) {
    if (_devChatUnsub) { try { _devChatUnsub(); } catch(_) {} _devChatUnsub = null; }
    _devShowThreadList();
  } else {
    if (_devThreadsUnsub) { try { _devThreadsUnsub(); } catch(_) {} _devThreadsUnsub = null; }
    const modal = document.getElementById('devFeedbackModal');
    if (modal) modal.style.display = 'none';
  }
};

window._devChatSend = async function() {
  if (!isDeveloper() || !_devActiveThreadId) return;
  const inp = document.getElementById('devChatInput');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  inp.disabled = true;
  try {
    const threadRef = fbDb.collection('feedbacks').doc(_devActiveThreadId);
    await threadRef.collection('messages').add({
      text,
      sender: 'developer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await threadRef.update({
      lastMessage: text,
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),
      devRead: true,
      userRead: false   // mark unread for user
    });
  } catch(e) {
    toast('Error: ' + e.message);
  } finally {
    inp.disabled = false;
    inp.focus();
  }
};

// ── NOTIFICATIONS ─────────────────────────────────────
// Developer: real-time badge + popup on new user messages
let _feedbackWatcher = null;
let _feedbackPopupShownFor = null;

function _showFeedbackPopup(data) {
  let p = document.getElementById('feedbackPopup');
  if (!p) {
    p = document.createElement('div');
    p.id = 'feedbackPopup';
    p.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-120%);width:min(360px,92vw);background:linear-gradient(135deg,rgba(46,204,113,0.18),rgba(6,13,31,0.97));border:1px solid rgba(46,204,113,0.5);border-radius:14px;padding:14px 16px;z-index:99999;box-shadow:0 8px 30px rgba(0,0,0,0.5);transition:transform 0.35s ease;cursor:pointer;font-family:Inter,sans-serif;";
    document.body.appendChild(p);
    p.onclick = function() {
      p.style.transform = 'translateX(-50%) translateY(-120%)';
      window.openDevFeedbackPanel();
    };
  }
  const from    = escHtml(data.userName || data.userEmail || 'Anonymous');
  const preview = escHtml((data.lastMessage || '').slice(0, 90));
  p.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:10px;">' +
      '<div style="font-size:22px;">💬</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;font-weight:700;color:#2ecc71;letter-spacing:0.5px;margin-bottom:3px;">New Message</div>' +
        '<div style="font-size:11px;color:var(--td);margin-bottom:4px;">' + from + '</div>' +
        '<div style="font-size:13px;color:var(--tl);line-height:1.4;">' + preview + '</div>' +
      '</div>' +
    '</div>';
  requestAnimationFrame(() => { p.style.transform = 'translateX(-50%) translateY(0)'; });
  clearTimeout(p._hideT);
  p._hideT = setTimeout(() => { p.style.transform = 'translateX(-50%) translateY(-120%)'; }, 6000);
}

async function _updateFeedbackBadgeCount() {
  if (!isDeveloper()) return;
  const badge = document.getElementById('feedbackBadge');
  if (!badge) return;
  try {
    const snap = await fbDb.collection('feedbacks').where('devRead', '==', false).limit(99).get();
    const count = snap.size;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.cssText += ';display:flex;align-items:center;justify-content:center;';
    } else {
      badge.style.display = 'none';
    }
  } catch(e) {}
}

function watchNewFeedback() {
  if (!isDeveloper()) return;
  if (_feedbackWatcher) { try { _feedbackWatcher(); } catch(_) {} }
  _updateFeedbackBadgeCount();
  // Watch for any thread where devRead == false (new message from user)
  _feedbackWatcher = fbDb.collection('feedbacks')
    .where('devRead', '==', false)
    .onSnapshot((snap) => {
      _updateFeedbackBadgeCount();
      snap.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          const ts   = data.lastAt ? data.lastAt.toMillis() : 0;
          // Only popup for messages in the last 2 minutes
          if (ts > Date.now() - 2 * 60 * 1000 && _feedbackPopupShownFor !== change.doc.id + '_' + ts) {
            _feedbackPopupShownFor = change.doc.id + '_' + ts;
            _showFeedbackPopup(data);
          }
        }
      });
    }, () => {});
}

// User: real-time badge on dev reply (userRead == false)
let _myFeedbackWatcher = null;

function watchMyFeedback() {
  if (!fbUser) return;
  if (_myFeedbackWatcher) { try { _myFeedbackWatcher(); } catch(_) {} }
  const uid = fbUser.uid;
  _myFeedbackWatcher = fbDb.collection('feedbacks').doc(uid)
    .onSnapshot((snap) => {
      if (!snap.exists) return;
      const data = snap.data();
      // Show badge on "Open Chat" button if dev replied and user hasn't read
      const badge = document.getElementById('userChatBadge');
      if (badge) {
        if (data.userRead === false) {
          badge.textContent = '!';
          badge.style.display = 'flex';
          badge.style.alignItems = 'center';
          badge.style.justifyContent = 'center';
          // Popup notification for user
          _showUserReplyPopup(data.lastMessage || '');
        } else {
          badge.style.display = 'none';
        }
      }
    }, () => {});
}

let _replyPopupShownFor = '';
function _showUserReplyPopup(text) {
  const key = text.slice(0, 30);
  if (_replyPopupShownFor === key) return;
  _replyPopupShownFor = key;
  let p = document.getElementById('replyPopup');
  if (!p) {
    p = document.createElement('div');
    p.id = 'replyPopup';
    p.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-120%);width:min(360px,92vw);background:linear-gradient(135deg,rgba(74,144,226,0.18),rgba(6,13,31,0.97));border:1px solid rgba(74,144,226,0.5);border-radius:14px;padding:14px 16px;z-index:99999;box-shadow:0 8px 30px rgba(0,0,0,0.5);transition:transform 0.35s ease;cursor:pointer;font-family:Inter,sans-serif;";
    document.body.appendChild(p);
    p.onclick = function() {
      p.style.transform = 'translateX(-50%) translateY(-120%)';
      window.openUserChat();
    };
  }
  const preview = escHtml(text.slice(0, 90));
  p.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:10px;">' +
      '<div style="font-size:22px;">↩️</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;font-weight:700;color:var(--a2);letter-spacing:0.5px;margin-bottom:3px;">Developer Replied</div>' +
        '<div style="font-size:13px;color:var(--tl);line-height:1.4;">' + preview + '</div>' +
      '</div>' +
    '</div>';
  requestAnimationFrame(() => { p.style.transform = 'translateX(-50%) translateY(0)'; });
  clearTimeout(p._hideT);
  p._hideT = setTimeout(() => { p.style.transform = 'translateX(-50%) translateY(-120%)'; }, 6000);
}



/* ───────────────────────────────────────────────────────────
   RADHA COIN FLIGHT — rebuilt from scratch (v2)
   Listens directly on the 28-Names tap zone (#tz28) for taps,
   independent of any wrapping around App.h28. After the native
   tap handler runs and the daily count increases, spawns one
   ./radha-coin.png coin at the tapped name and flies it to the
   Bhagavadik Bank image, then bumps the bank's coin counter.
   Falls back to a 🪙 emoji if the coin image fails to load.
   ─────────────────────────────────────────────────────────── */
(function () {
  var COIN_SRC = "./radha-coin.png";
  var STORAGE_KEY = "radhaCurrency";
  var coinImageOk = true;

  // Preflight: check the coin image actually loads
  (function preloadCoin() {
    var test = new Image();
    test.onload = function () { coinImageOk = true; };
    test.onerror = function () {
      coinImageOk = false;
      console.error("[RadhaCoin] " + COIN_SRC + " failed to load — falling back to 🪙 emoji");
    };
    test.src = COIN_SRC;
  })();

  function restoreCounter() {
    try {
      var saved = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
      var bbc = document.getElementById("bbCount");
      if (bbc && !isNaN(saved) && saved > 0) {
        bbc.textContent = saved >= 1000 ? saved.toLocaleString() : String(saved);
      }
    } catch (_) {}
  }

  function bumpCounter() {
    var bbc = document.getElementById("bbCount");
    var bbctr = document.getElementById("bbCounter");
    if (!bbc) return;
    var n = (parseInt((bbc.textContent || "0").replace(/,/g, ""), 10) || 0) + 1;
    bbc.textContent = n >= 1000 ? n.toLocaleString() : String(n);
    try { localStorage.setItem(STORAGE_KEY, String(n)); } catch (_) {}
    if (bbctr) {
      bbctr.classList.remove("pop");
      void bbctr.offsetWidth;
      bbctr.classList.add("pop");
    }
  }

  function getTod() {
    try {
      return (App.S.h28[App.S.tk] || 0);
    } catch (_) {
      return 0;
    }
  }

  function spawnCoin(tappedName, tapX, tapY) {
    var nameEl = document.getElementById("n28name");
    var tz = document.getElementById("tz28");
    var bankImg = document.getElementById("bbImg");
    if (!nameEl || !tz || !bankImg) {
      console.warn("[RadhaCoin] missing nameEl, tz28 or bbImg — cannot spawn coin");
      return;
    }

    var tzRect = tz.getBoundingClientRect();

    // ── Coin and name travel as ONE unit ──
    var COIN_SIZE = 180; // px — must be declared BEFORE COIN_HALF
    var GAP = 8;         // px between coin bottom and name top
    var COIN_HALF = COIN_SIZE / 2; // = 90

    // Use transform:translateX(-50%) so pod always centres regardless of its width
    var tapCX  = tapX || (tzRect.left + tzRect.width * 0.5);  // tap centre X
    var tapCY  = tapY || (tzRect.top  + tzRect.height * 0.75); // tap centre Y
    var isIPad = window.innerWidth >= 768;
    var bankCX = tzRect.left + tzRect.width  * 0.5;
    var bankCY = tzRect.top  + tzRect.height * (isIPad ? 0.44 : 0.32);
    // Pod left is always set to the target centre X; translateX(-50%) centres it
    var startX = tapCX;
    var startY = tapCY - COIN_HALF;   // top of coin at tap point
    var endX   = bankCX;
    var endY   = bankCY - COIN_HALF;

    // Suppress any stray nameOut clones
    try {
      var clones = tz.querySelectorAll(".n28name:not(#n28name)");
      clones.forEach(function(c) { c.style.display = "none"; });
    } catch(_) {}

    // Container: positioned at coin centre, no transform offset (children handle their own offset)
    var pod = document.createElement("div");
    pod.style.cssText = [
      "position:fixed",
      "left:" + startX + "px",
      "top:"  + startY + "px",
      "pointer-events:none",
      "z-index:9000",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "opacity:0",
      "transform:translateX(-50%) scale(0.3)",
      "will-change:left,top,transform,opacity",
      "transition:" + [
        "left 0.85s cubic-bezier(0.33,0.0,0.2,1)",
        "top  0.85s cubic-bezier(0.33,0.0,0.2,1)",
        "transform 0.85s cubic-bezier(0.33,0.0,0.2,1)",
        "opacity 0.18s ease"
      ].join(",")
    ].join(";");

    // ── Coin inside pod ──
    var coin = document.createElement("div");
    coin.style.cssText = [
      "width:" + COIN_SIZE + "px",
      "height:" + COIN_SIZE + "px",
      "border-radius:50%",
      "flex-shrink:0",
      "background:transparent",
      "box-shadow:none"
    ].join(";");

    if (coinImageOk) {
      var img = document.createElement("img");
      img.src = COIN_SRC;
      img.alt = "Radha Coin";
      img.draggable = false;
      img.style.cssText = "width:100%;height:100%;border-radius:50%;display:block;filter:drop-shadow(0 0 18px rgba(255,215,0,0.9)) drop-shadow(0 0 40px rgba(255,170,0,0.5));";
      img.onerror = function () {
        coinImageOk = false;
        coin.innerHTML = "";
        coin.textContent = "🪙";
        coin.style.fontSize = "72px";
        coin.style.lineHeight = "1";
        coin.style.background = "transparent";
        coin.style.boxShadow = "none";
      };
      coin.appendChild(img);
    } else {
      coin.textContent = "🪙";
      coin.style.fontSize = "72px";
      coin.style.lineHeight = "1";
      coin.style.background = "transparent";
      coin.style.boxShadow = "none";
    }
    pod.appendChild(coin);

    // ── Name label inside pod, just below the coin ──
    var nameStyle = window.getComputedStyle(nameEl);
    var ghost = document.createElement("div");
    var screenW = window.innerWidth;
    ghost.style.cssText = [
      "margin-top:" + GAP + "px",
      "font-family:" + nameStyle.fontFamily,
      "font-size:" + nameStyle.fontSize,
      "font-weight:" + nameStyle.fontWeight,
      "color:" + nameStyle.color,
      "white-space:normal",
      "word-break:break-word",
      "text-align:center",
      "width:" + Math.min(screenW - 32, 420) + "px",
      "max-width:" + Math.min(screenW - 32, 420) + "px",
      "text-shadow:0 0 25px rgba(255,217,61,0.85),0 0 50px rgba(255,200,40,0.4)"
    ].join(";");
    ghost.textContent = tappedName || nameEl.textContent;
    pod.appendChild(ghost);

    // Bake the -COIN_SIZE/2 offset into left/top (margins ignored on position:fixed)
    // This makes pod.left = coin-centre-x and pod.top = coin-centre-y

    document.body.appendChild(pod);
    void pod.getBoundingClientRect();

    requestAnimationFrame(function () {
      pod.style.opacity = "1";
      pod.style.transform = "translateX(-50%) scale(1)";

      requestAnimationFrame(function () {
        pod.style.left = endX + "px";
        pod.style.top  = endY + "px";
        pod.style.transform = "translateX(-50%) scale(0.6)";
      });
    });

    // On arrival: shrink to nothing, pulse the bank, bump the counter
    setTimeout(function () {
      pod.style.transition = [
        "left 0.32s cubic-bezier(0.4,0,0.6,1)",
        "top  0.32s cubic-bezier(0.4,0,0.6,1)",
        "transform 0.32s cubic-bezier(0.4,0,0.6,1)",
        "opacity 0.32s ease 0.05s"
      ].join(",");
      pod.style.transform = "translateX(-50%) scale(0.05)";
      pod.style.opacity   = "0";
      bankImg.classList.remove("rc-pulse");
      void bankImg.offsetWidth;
      bankImg.classList.add("rc-pulse");
      bumpCounter();
    }, 900);

    // Cleanup
    setTimeout(function () {
      if (pod.parentNode) pod.parentNode.removeChild(pod);
    }, 1400);
  }

  function onTapCapture(e) {
    // Capture phase: fires BEFORE App.h28 runs — snap current displayed name + tap position
    onTap._before = getTod();
    onTap._wasAnimating = !!App._n28CompletionAnimating; // snapshot BEFORE cycleDone28 can fire
    var nameEl = document.getElementById("n28name");
    onTap._capturedName = nameEl ? nameEl.textContent : "";
    // Get tap coordinates (touch or mouse)
    var touch = e && e.touches && e.touches[0];
    onTap._tapX = touch ? touch.clientX : (e ? e.clientX : null);
    onTap._tapY = touch ? touch.clientY : (e ? e.clientY : null);
  }

  function onTap() {
    var before = (typeof onTap._before === "number") ? onTap._before : getTod();
    var wasAnimating = !!onTap._wasAnimating; // pre-captured in onTapCapture, before cycleDone28
    var capturedName = onTap._capturedName || "";
    var tapX = onTap._tapX;
    var tapY = onTap._tapY;
    // Let the native handler (App.h28) run first, then check on next tick
    setTimeout(function () {
      var after = getTod();
      // Use wasAnimating (state BEFORE this tap) not current — fixes name 28 coin not banking
      if (after > before && !wasAnimating) {
        try { spawnCoin(capturedName, tapX, tapY); } catch (err) { console.error("[RadhaCoin] spawn error:", err); }
      }
    }, 0);
  }

  function setup() {
    var tz = document.getElementById("tz28");
    if (typeof App === "undefined" || !App || !tz) {
      return setTimeout(setup, 120);
    }
    if (App.__radhaCoinWrapped) return;
    App.__radhaCoinWrapped = true;

    restoreCounter();

    tz.addEventListener("touchstart", onTapCapture, { capture: true, passive: true });
    tz.addEventListener("mousedown", onTapCapture, { capture: true });
    tz.addEventListener("touchstart", onTap, { passive: true });
    tz.addEventListener("mousedown", onTap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
