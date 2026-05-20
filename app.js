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
    cfg: { vib: true, sound: true },
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
    customEkadashi: [],
    ekParampara: "smarta",
    historyHK: {},
    timerHistoryHK: {},
    dtHK: 0,
    malaLogHK: [],
    syncBaselineHK: {},
    syncBaselineTimerHK: {},
    nameJapDeductHK: 0,
    gaudiyaMode: false,
    hkLang: "hi",
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
      customEkadashi: this.S.customEkadashi || [],
      ekParampara: this.S.ekParampara || "smarta",
      historyHK: this.S.historyHK || {},
      timerHistoryHK: this.S.timerHistoryHK || {},
      dtHK: this.S.dtHK || 0,
      malaLogHK: this.S.malaLogHK || [],
      syncBaselineHK: this.S.syncBaselineHK || {},
      syncBaselineTimerHK: this.S.syncBaselineTimerHK || {},
      nameJapDeductHK: this.S.nameJapDeductHK || 0,
      gaudiyaMode: this.S.gaudiyaMode || false,
      hkLang: this.S.hkLang || "hi",
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
    if (fbUser && !fbForcedSignout && !this._suspendCloudSync)
      fbDebouncedPush();
  },

  async load() {
    await this.initDB();
    this.S.tk = this.getTk();

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
    if (!this.S.customEkadashi) this.S.customEkadashi = [];
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
      // Force push empty log to Firebase so stale cloud data is overwritten
      setTimeout(() => {
        if (fbUser && !fbForcedSignout) fbDebouncedPush();
      }, 3000);
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
    document.getElementById("timerDisplay").textContent = "00:00:00";
    document.getElementById("timerDisplay").classList.remove("running");
    document.getElementById("timerBtn").textContent = "▶ Start";
    document.getElementById("timerBtn").className = "tbtn start";
    this.updateTimerToday();
  },

  updateTimerToday() {
    // ── UNIFIED: Today's Jap Time = committed mala log sum + live in-progress delta ──
    // timerHistory[today] is always kept equal to mala log sum (by syncTimerFromMalaLog).
    // The live delta (timerSeconds - timerSavedSeconds) is the current incomplete mala.
    const radhaTimeSec = this.S.timerHistory[this.S.tk] || 0;
    const rvTimeSec = this.S.timerHistoryRV[this.S.tk] || 0;
    const liveSec = this.timerRunning
      ? this.timerSeconds - this.timerSavedSeconds
      : 0;
    const combinedSec = radhaTimeSec + rvTimeSec + liveSec;
    document.getElementById("timerToday").textContent =
      "Today's Jap Time: " + this.fmtTime(combinedSec);
    // ── UNIFIED TIMER: mirror the same Jap timer on the 28 Names tab ──
    const te28 = document.getElementById("n28TotalTimer");
    if (te28) te28.textContent = this.fmtTime(this.timerSeconds);
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
      if (this._malaTimerStart === undefined)
        this._malaTimerStart = this.timerSeconds;
    }
  },

  // ── Mala Complete — Bell sound + TRIPLE vibration + log duration + animate timer ──
  malaOk() {
    const f = document.getElementById("mf");
    const isHKmala = this.S.japMode === "hk";
    // For HK mode: show Chaitanya verse overlay until next tap
    if (isHKmala) {
      const lang = this.S.hkLang || "hi";
      const line1 = lang === "bn"
        ? "জয় শ্রীকৃষ্ণ চৈতন্য প্রভু নিত্যানন্দ।"
        : "जय श्री कृष्ण चैतन्य प्रभु नित्यानन्द।";
      const line2 = lang === "bn"
        ? "শ্রীঅদ্বৈত গদাধর শ্রীবাসাদি গৌরভক্তবৃন্দ।"
        : "श्री अद्वैत गदाधर श्रीवासादि गौर भक्त वृन्द॥";
      showHKMalaComplete(line1, line2);
    } else {
      f.classList.add("show");
      setTimeout(() => f.classList.remove("show"), 2800);
    }
    // Bell sound
    if (this.S.cfg.sound) playSynthBell();
    // Triple long vibration synced with bell
    this.vib([200, 80, 200, 80, 300]);
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
    // Anchor next mala's timer start to current timerSeconds
    this._malaTimerStart = this.timerSeconds;
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
    const malaStartTs = Date.now() - malaDuration * 1000;
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
    e.preventDefault();
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
    this.save();
    fbDebouncedPush();
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
    // Show frozen cycle value; n28TotalTimer shows unified Jap timer
    const fmt = (s) =>
      Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    const ce = document.getElementById("n28CycleTimer");
    const te = document.getElementById("n28TotalTimer");
    if (ce) ce.textContent = fmt(this._n28PausedCycleSec);
    if (te) te.textContent = this.fmtTime(this.timerSeconds);
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
      // n28TotalTimer is now driven by the unified Jap timer (App.timerSeconds)
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
    const te = document.getElementById("n28TotalTimer");
    if (ce) ce.textContent = "0:00";
    // Show unified Jap timer (same as main Jap tab)
    if (te) te.textContent = this.fmtTime(this.timerSeconds);
    const mf28 = document.getElementById("mf28");
    if (mf28) mf28.classList.remove("show");
    this._upd28PauseBtn();
  },

  // ── 28 Names tap ──
  h28(e) {
    e.preventDefault();
    if (this._n28CompletionAnimating) return;
    // If paused, resume on tap
    if (this._n28Paused) {
      this.resume28();
    }
    if (!this.S.h28[this.S.tk]) this.S.h28[this.S.tk] = 0;
    const posBefore = get28Pos();
    this.S.h28[this.S.tk]++;
    this.save();
    fbDebouncedPush();
    this.vib([10]);
    this.start28Timers();
    // Also drive the unified Jap timer so both tabs share the same clock
    this.tapTimer();
    // Re-arm 6s auto-pause on every tap
    this._arm28AutoPause();
    spawnName28(e, get28Name(NAMES28[posBefore]));
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

// Test Bell Sound button
function testSound() {
  playSynthBell();
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
  if (naamLbl) naamLbl.textContent = isBn ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";
  // 2. Settings language toggle label
  const langLbl = document.getElementById("hkLangLabel");
  if (langLbl) langLbl.textContent = isBn ? "Bangla" : "Hindi";
  // 3. Settings language toggle new pill labels
  const newLangLbl = document.getElementById("hkLangNewLabel");
  if (newLangLbl) newLangLbl.textContent = isBn ? "বাংলা" : "हिंदी";
  // 4. Daily target heading
  const dtLbl = document.getElementById("hkDailyTargetLabel");
  if (dtLbl) dtLbl.textContent = isBn
    ? "🪷 হরে কৃষ্ণ মহামন্ত্র Targets"
    : "🪷 हरे कृष्ण महामंत्र Targets";
  // 5. Stats card lotus title
  const statsLotus = document.getElementById("hkcTitleLotus");
  if (statsLotus) statsLotus.textContent = isBn ? "🪷 হরে কৃষ্ণ" : "🪷 हरे कृष्ण";
  // 6. Toggle the hkLang toggle visual state
  const tgH = document.getElementById("tgHkLang");
  if (tgH) isBn ? tgH.classList.add("on") : tgH.classList.remove("on");
  // 7. body class drives active button highlight via CSS
  isBn ? document.body.classList.add("hk-bn") : document.body.classList.remove("hk-bn");
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
  const currentColor  = HK_COLORS[_hkColorIdx % 7];
  const currentShadow = HK_SHADOWS_MAP[_hkColorIdx % 7];
  // NEXT color → stays as persistent display (the "new" text arriving)
  const nextColor  = HK_COLORS[(_hkColorIdx + 1) % 7];
  const nextShadow = HK_SHADOWS_MAP[(_hkColorIdx + 1) % 7];
  _hkColorIdx++;

  // Float carries the CURRENT (departing) color — rises and fades away
  const zone = document.getElementById("tz");
  if (zone) {
    const floatEl = document.createElement("div");
    floatEl.className = "hk-float-name";
    floatEl.innerHTML = text.split("\n").map((l) => "<div>" + l + "</div>").join("");
    floatEl.style.color = currentColor;
    floatEl.style.textShadow = currentShadow;
    zone.appendChild(floatEl);
    setTimeout(() => floatEl.remove(), 2200);
  }

  // Persistent display immediately shows NEXT color (arriving text)
  el.innerHTML = text.split("\n").map((l) => "<div>" + l + "</div>").join("");
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
    const n = Date.now();
    if (n - lt2 < 300) e.preventDefault();
    lt2 = n;
  },
  { passive: false },
);

// Stats timer tick
setInterval(() => {
  if (App.timerRunning) App.updateTimerToday();
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
    "🙏 Radha Naam Jap Sadhana App — Track your jap sadhana. Jai Radhe Radhe! 🌸";
  if (navigator.share) {
    navigator
      .share({ title: "Radha Naam Jap 🙏", text: shareText, url })
      .then(() => toast("Shared! 🙏 Jai Radhe!"))
      .catch((err) => {
        // User cancelled or share failed — fall back to copy
        if (err.name !== "AbortError") _copyAppUrl(url);
      });
  } else {
    _copyAppUrl(url);
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
}
function syncTargetMalaToJap(prefix) {
  const ms = App.S.ms || 108;
  const japEl = document.getElementById(prefix + "In");
  const malaEl = document.getElementById(prefix + "MalaIn");
  const dispEl = document.getElementById(prefix + "Mala");
  const malas = parseInt((malaEl && malaEl.value) || 0) || 0;
  if (japEl) japEl.value = malas > 0 ? malas * ms : "";
  if (dispEl) dispEl.textContent = malas;
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
  }
}
function switchJapMode(mode) {
  App.S.japMode = mode;
  const dd = document.getElementById("naamSelDd");
  const btn = document.getElementById("naamSelBtn");
  dd.classList.remove("show");
  btn.classList.remove("open");
  document.removeEventListener("click", closeNaamSelOutside);
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
    if (naamHKLabel) naamHKLabel.textContent = lang === "bn" ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";
    const word = lang === "bn" ? "মহামন্ত্র" : "महामंत्र";
    titleEl.innerHTML =
      '<span style="font-size:clamp(22px,6vw,34px);line-height:1.1;color:#6DB8FF;font-family:\'Tiro Devanagari Hindi\',\'Hind Siliguri\',serif">' +
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
    renderEkadashiList();
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
    const ms = App.S.ms || 108;
    if (App.S.dt) document.getElementById("dtIn").value = App.S.dt;
    if (App.S.lt) document.getElementById("ltIn").value = App.S.lt;
    document.getElementById("msIn").value = ms;
    // Populate mala equivalents for Radha targets
    const dtMalaInEl = document.getElementById("dtMalaIn");
    if (dtMalaInEl)
      dtMalaInEl.value = App.S.dt > 0 ? Math.round(App.S.dt / ms) : "";
    const ltMalaInEl = document.getElementById("ltMalaIn");
    if (ltMalaInEl)
      ltMalaInEl.value = App.S.lt > 0 ? Math.round(App.S.lt / ms) : "";
    // Populate RV daily target (fix: was missing, target not showing)
    const dtRVEl = document.getElementById("dtRVIn");
    if (dtRVEl) dtRVEl.value = App.S.dtRV > 0 ? App.S.dtRV : "";
    const dtRVMalaInEl = document.getElementById("dtRVMalaIn");
    if (dtRVMalaInEl)
      dtRVMalaInEl.value = App.S.dtRV > 0 ? Math.round(App.S.dtRV / ms) : "";
    const dtRVMalaDisp = document.getElementById("dtRVMala");
    if (dtRVMalaDisp)
      dtRVMalaDisp.textContent = Math.floor((App.S.dtRV || 0) / ms);
    // Populate HK daily target
    const dtHKEl = document.getElementById("dtHKIn");
    if (dtHKEl) dtHKEl.value = (App.S.dtHK || 0) > 0 ? App.S.dtHK : "";
    const dtHKMalaInEl = document.getElementById("dtHKMalaIn");
    if (dtHKMalaInEl)
      dtHKMalaInEl.value =
        (App.S.dtHK || 0) > 0 ? Math.round((App.S.dtHK || 0) / ms) : "";
    const dtHKMalaDisp = document.getElementById("dtHKMala");
    if (dtHKMalaDisp)
      dtHKMalaDisp.textContent = Math.floor((App.S.dtHK || 0) / ms);
    // Gaudiya Mode toggle
    const tgG = document.getElementById("tgGaudiya");
    if (tgG)
      App.S.gaudiyaMode ? tgG.classList.add("on") : tgG.classList.remove("on");
    initReminderUI();
    renderEkadashiList();
    renderEkParampara();
    // Populate the app link display
    const appUrl = _getAppUrl();
    const linkEl = document.getElementById("appLinkDisplay");
    if (linkEl) linkEl.textContent = appUrl;
  }
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
    if (naamHKLbl) naamHKLbl.textContent = App.S.hkLang === "bn" ? "হরে কৃষ্ণ মহামন্ত্র" : "हरे कृष्ण महामंत्र";
    // Update Daily Target section label
    applyHKLangLabels(App.S.hkLang);
    // Update hkPersist text immediately if visible
    const hkEl = document.getElementById("hkPersist");
    if (hkEl && hkEl.classList.contains("hk-visible")) {
      const newText = App.S.hkLang === "bn" ? HK_TEXT_BN : HK_TEXT;
      hkEl.innerHTML = newText.split("\n").map((l) => "<div>" + l + "</div>").join("");
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
    toast(App.S.gaudiyaMode ? "🪷 Gaudiya Mode ON" : "🪷 Gaudiya Mode OFF");
    return;
  }

  App.S.cfg[k] = !App.S.cfg[k];
  const m = { vib: "tgVib", sound: "tgSnd" };
  App.S.cfg[k]
    ? document.getElementById(m[k]).classList.add("on")
    : document.getElementById(m[k]).classList.remove("on");
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
        const line1 = lang === "bn"
          ? "জয় শ্রীকৃষ্ণ চৈতন্য প্রভু নিত্যানন্দ।"
          : "जय श्री कृष्ण चैतन्य प्रभु नित्यानन्द।";
        const line2 = lang === "bn"
          ? "শ্রীঅদ্বৈত গদাধর শ্রীবাসাদি গৌরভক্তবৃন্দ।"
          : "श्री अद्वैत गदाधर श्रीवासादि गौर भक्त वृन्द॥";
        const l1e = _mf.querySelector(".mf-line1");
        const l2e = _mf.querySelector(".mf-line2");
        const o1 = l1e ? l1e.textContent : "";
        const o2 = l2e ? l2e.textContent : "";
        if (l1e) { l1e.textContent = line1; l1e.style.fontSize = "clamp(14px,3.8vw,22px)"; }
        if (l2e) { l2e.textContent = line2; l2e.style.fontSize = "clamp(12px,3.2vw,18px)"; l2e.style.fontFamily = "'Tiro Devanagari Hindi','Hind Siliguri',serif"; l2e.style.color = "var(--gold)"; }
        _mf.classList.add("show-long");
        setTimeout(() => {
          _mf.classList.remove("show-long");
          if (l1e) { l1e.textContent = o1; l1e.style.fontSize = ""; }
          if (l2e) { l2e.textContent = o2; l2e.style.fontSize = ""; l2e.style.fontFamily = ""; l2e.style.color = ""; }
        }, 4000);
      } else {
        _mf.classList.add("show");
        setTimeout(() => _mf.classList.remove("show"), 2800);
      }
    }
    if (App.S.cfg && App.S.cfg.sound) playSynthBell();
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
  App.save();
  App.ua();
  fbDebouncedPush();
  document.getElementById("prevJapIn").value = "";
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
  const d2 = new Date();
  while (streak < 999) {
    const k = _ldk(d2);
    if ((curHist[k] || 0) > 0) {
      streak++;
      d2.setDate(d2.getDate() - 1);
    } else break;
  }
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
  const _setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const hkTodCount = App.S.historyHK[App.S.tk] || 0;
  const hkWkCount  = wk.reduce((s, k) => s + (App.S.historyHK[k] || 0), 0);
  const hkMoCount  = Object.entries(App.S.historyHK || {})
    .filter(([k]) => k.startsWith(mp)).reduce((s, [, v]) => s + v, 0);
  _setEl("sTod2",  hkTodCount.toLocaleString("en-IN"));
  _setEl("sTodM2", Math.floor(hkTodCount / ms) + "m");
  _setEl("sWk2",   hkWkCount.toLocaleString("en-IN"));
  _setEl("sWkM2",  Math.floor(hkWkCount  / ms) + "m");
  _setEl("sMo2",   hkMoCount.toLocaleString("en-IN"));
  _setEl("sMoM2",  Math.floor(hkMoCount  / ms) + "m");

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
  if (pji) {
    const n = parseInt(pji.value) || 0;
    document.getElementById("prevMalaPreview").textContent =
      n > 0 ? Math.floor(n / ms) : "0";
    document.getElementById("prevLifetimePreview").textContent =
      n > 0 ? (tot + n).toLocaleString() : "—";
  }
  if (aoi && aod) {
    const n = parseInt(aoi.value) || 0;
    const d = aod.value;
    const curH =
      App.S.japMode === "rv"
        ? App.S.historyRV
        : App.S.japMode === "hk"
          ? App.S.historyHK || {}
          : App.S.history;
    const cur = d ? curH[d] || 0 : 0;
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
    const curH2 =
      App.S.japMode === "rv"
        ? App.S.historyRV
        : App.S.japMode === "hk"
          ? App.S.historyHK || {}
          : App.S.history;
    const cur = d ? curH2[d] || 0 : 0;
    document.getElementById("deductOtherPreview").textContent =
      n > 0 && d ? Math.max(0, cur - n) : "—";
  }
  // Name Jap Deduct live previews
  const curDeduct = App.S.nameJapDeduct || 0;
  const rawTot = Object.values(App.S.history).reduce((a, b) => a + b, 0);
  const njdi = document.getElementById("nameJapDeductIn");
  const njri = document.getElementById("nameJapRestoreIn");
  const njdCur = document.getElementById("nameJapDeductCur");
  const njdMalas = document.getElementById("nameJapDeductMalas");
  if (njdCur) njdCur.textContent = curDeduct.toLocaleString();
  if (njdMalas)
    njdMalas.textContent = Math.floor(curDeduct / ms).toLocaleString();
  if (njdi) {
    const n = parseInt(njdi.value) || 0;
    document.getElementById("nameJapDeductPreview").textContent =
      n > 0 ? Math.max(0, rawTot - curDeduct - n).toLocaleString() : "—";
  }
  if (njri) {
    const n = parseInt(njri.value) || 0;
    document.getElementById("nameJapRestorePreview").textContent =
      n > 0
        ? Math.min(rawTot, Math.max(0, rawTot - curDeduct + n)).toLocaleString()
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
  if (tp === "today") {
    t.textContent = "Reset Today?";
    d.textContent = "Clear today's " + App.gTod() + " jap count.";
  } else if (tp === "28today") {
    t.textContent = "Reset 28 Names Today?";
    d.textContent = "Clear today's " + (App.S.h28[App.S.tk] || 0) + " count.";
  } else if (tp === "28all") {
    t.textContent = "⚠️ Reset All 28 Names Data?";
    d.textContent = "All 28 Names counts and time will be permanently deleted.";
  } else if (tp === "range") {
    const f = document.getElementById("rfrom").value,
      to = document.getElementById("rto").value;
    if (!f || !to) {
      toast("Please select both dates");
      return;
    }
    t.textContent = "Reset Date Range?";
    d.textContent = "Data from " + f + " to " + to + " will be deleted.";
  } else {
    t.textContent = "⚠️ Reset All Data?";
    d.textContent = "All history and records will be permanently deleted.";
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
  if (fbUser && !fbForcedSignout) {
    try {
      await fbPushFull();
    } catch (e) {
      console.warn("Reset push failed:", e.message);
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

  if (pr === "today") {
    // ── Reset Today: ALL modes — Radha + RV + 28 Names ──
    App.S.history[tk] = 0;
    App.S.historyRV[tk] = 0;
    App.S.h28[tk] = 0;
    App.S.timerHistory[tk] = 0;
    App.S.timerHistoryRV[tk] = 0;
    App.S.timer28History[tk] = 0;
    if (!App.S.historyHK) App.S.historyHK = {};
    if (!App.S.timerHistoryHK) App.S.timerHistoryHK = {};
    App.S.historyHK[tk] = 0;
    App.S.timerHistoryHK[tk] = 0;
    App.S.malaLog = [];
    App.S.malaLogRV = [];
    App.S.malaLogHK = [];
    App.S.activityLog = (App.S.activityLog || []).filter(
      (e) => !e.ts || _ldk(new Date(e.ts)) !== tk,
    );
    App.lmc = 0;
    App.lmcRV = 0;
    App.lmcHK = 0;
    App.lm28 = 0;
    // Reset all sankalpas anchors since 28 Names count just zeroed
    (App.S.sankalpas || [])
      .filter((s) => !s.done && s.startCycles !== null)
      .forEach((s) => {
        s._savedProgress =
          (s._savedProgress || 0) +
          Math.max(0, getTotalCycles28() - s.startCycles);
        s.startCycles = getTotalCycles28();
      });
    App.stopAll28Timers();
    App.malaWallStart = Date.now();
    localStorage.setItem("rjap_malaWallStart", String(App.malaWallStart));
    App._malaTimerStart = App.timerSeconds;
    App.syncTimerFromMalaLog();
    // Persist zeros to IDB immediately (prevent resurrection on reload)
    App.dbPut("history", tk, 0);
    App.dbPut("timerHistory", tk, 0);
    App.dbPut("timerHistoryRV", tk, 0);
    App.dbPut("h28", tk, 0);
    App.dbPut("timer28History", tk, 0);
    App.dbPut("malaLog", "today", { date: tk, log: [] });
    App.dbPut("activityLogArchive", tk, []);
    renderMalaLog();
    u28();
    render28StatsPanel();
    renderSankalpas();
  } else if (pr === "28today") {
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
  } else if (pr === "range") {
    const f = document.getElementById("rfrom").value,
      to = document.getElementById("rto").value;
    const allKeys = new Set([
      ...Object.keys(App.S.history || {}),
      ...Object.keys(App.S.historyRV || {}),
      ...Object.keys(App.S.h28 || {}),
    ]);
    allKeys.forEach((k) => {
      if (k >= f && k <= to) {
        if (App.S.history) App.S.history[k] = 0;
        if (App.S.historyRV) App.S.historyRV[k] = 0;
        if (App.S.h28) App.S.h28[k] = 0;
        if (App.S.timerHistory) App.S.timerHistory[k] = 0;
        if (App.S.timerHistoryRV) App.S.timerHistoryRV[k] = 0;
        if (App.S.timer28History) App.S.timer28History[k] = 0;
        if (App.S.historyHK) App.S.historyHK[k] = 0;
        if (App.S.timerHistoryHK) App.S.timerHistoryHK[k] = 0;
      }
    });
    // If today is in range, also clear live logs and IDB
    if (tk >= f && tk <= to) {
      App.S.malaLog = [];
      App.S.malaLogRV = [];
      App.S.malaLogHK = [];
      App.S.activityLog = (App.S.activityLog || []).filter(
        (e) => !e.ts || _ldk(new Date(e.ts)) < f || _ldk(new Date(e.ts)) > to,
      );
      App.lmc = 0;
      App.lmcRV = 0;
      App.lm28 = 0;
      App.stopAll28Timers();
      App.dbPut("history", tk, 0);
      App.dbPut("timerHistory", tk, 0);
      App.dbPut("timerHistoryRV", tk, 0);
      App.dbPut("h28", tk, 0);
      App.dbPut("timer28History", tk, 0);
      App.dbPut("malaLog", "today", { date: tk, log: [] });
      App.syncTimerFromMalaLog();
      renderMalaLog();
    }
  } else {
    // ── Full Reset: EVERYTHING — Radha + RV + HK + 28 Names + all history ──
    App.S.history = {};
    App.S.h28 = {};
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
    App.S.stotrams = {};
    App.S.brahma = {};
    App.S.brahmacharya_start_date = "";
    App.S.timerHistory = {};
    App.S.timer28History = {};
    App.S.timerHistoryRV = {};
    App.S.timerHistoryHK = {};
    App.S.malaLog = [];
    App.S.malaLogRV = [];
    App.S.malaLogHK = [];
    App.S.activityLog = []; // wipe full activity log
    App.S.sankalpas = [];
    App.S.occasions = {};
    App.S.syncBaseline = {};
    App.S.syncBaseline28 = {};
    App.S.syncBaselineTimer = {};
    App.S.syncBaselineTimer28 = {};
    App.S.syncBaselineRV = {};
    App.S.syncBaselineTimerRV = {};
    App.S.syncBaselineHK = {};
    App.S.syncBaselineTimerHK = {};
    App.lmc = 0;
    App.lm28 = 0;
    App.lmcRV = 0;
    App.lmcHK = 0;
    STLIST.forEach((x) => {
      App.S.stotrams[x.id] = {};
    });
    // Clear ALL IDB stores including activityLogArchive
    App.dbClearStore("history");
    App.dbClearStore("h28");
    App.dbClearStore("timerHistory");
    App.dbClearStore("timer28History");
    App.dbClearStore("timerHistoryRV");
    App.dbClearStore("activityLogArchive");
    App.dbClearStore("malaLog");
    App.resetTimer();
    App.stopAll28Timers();
    ["dtIn", "ltIn", "msIn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    initBrahmaStartInput();
    renderMalaLog();
    u28();
    render28StatsPanel();
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
    customEkadashi: App.S.customEkadashi || [],
    ekParampara: App.S.ekParampara || "smarta",
    historyHK: App.S.historyHK || {},
    timerHistoryHK: App.S.timerHistoryHK || {},
    dtHK: App.S.dtHK || 0,
    nameJapDeductHK: App.S.nameJapDeductHK || 0,
    malaLogHK: App.S.malaLogHK || [],
    gaudiyaMode: App.S.gaudiyaMode || false,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "radha-naam-jap-backup-" + App.getTk() + ".json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
  toast("Backup downloaded! 🙏 Jai Radhe!");
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

  // Sacred vibration pattern for milestone
  if (navigator.vibrate) {
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
  const hist   = App.S.history || {};
  const histRV = App.S.historyRV || {};
  const histHK = App.S.historyHK || {};
  const rawTot = _isG
    ? Object.values(histHK).reduce((a, b) => a + b, 0)
    : Object.values(hist).reduce((a, b) => a + b, 0) +
      Object.values(histRV).reduce((a, b) => a + b, 0);
  const deduct = _isG
    ? (App.S.nameJapDeductHK || 0)
    : (App.S.nameJapDeduct || 0);
  const total = Math.max(0, rawTot - deduct);
  const lang = window._msLang || "hi";

  // Calculate 7-day average
  const today = new Date();
  let sum7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = _ldk(d);
    sum7 += _isG
      ? (histHK[k] || 0)
      : (hist[k] || 0) + (histRV[k] || 0);
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
  const sinceEl = document.getElementById("msSadhanaSince");
  if (sinceEl && saved) {
    const diff = Date.now() - new Date(saved).getTime();
    const days = Math.floor(diff / 86400000);
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
    return (
      String(d.getDate()).padStart(2, "0") +
      ":" +
      String(d.getMonth() + 1).padStart(2, "0") +
      ":" +
      d.getFullYear()
    );
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
      hkEl.innerHTML = HK_TEXT_BN.split("\n").map((l) => "<div>" + l + "</div>").join("");
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
      hkEl.innerHTML = HK_TEXT.split("\n").map((l) => "<div>" + l + "</div>").join("");
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
    const diff = Date.now() - new Date(startDate).getTime();
    totalDays = Math.floor(diff / 86400000) + " days";
  }

  // Peak day
  const allHist = { ...hist };
  Object.keys(histRV).forEach((k) => {
    allHist[k] = (allHist[k] || 0) + (histRV[k] || 0);
  });
  let peakDay = "—",
    peakVal = 0;
  Object.entries(allHist).forEach(([k, v]) => {
    if (v > peakVal) {
      peakVal = v;
      peakDay = k;
    }
  });
  if (peakVal > 0) {
    const _pd = new Date(peakDay);
    peakDay =
      String(_pd.getDate()).padStart(2, "0") +
      ":" +
      String(_pd.getMonth() + 1).padStart(2, "0") +
      ":" +
      _pd.getFullYear() +
      " (" +
      peakVal.toLocaleString("en-IN") +
      " jap)";
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
          // Reset in-memory state to defaults before loading new user's data
          App.S = {
            tk: App.getTk(),
            ms: 108,
            dt: 0,
            lt: 0,
            cfg: { vib: true, sound: true },
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
          };
          // ── Always load IDB first so app is usable offline ──
          // Cloud pull in fbMigrate() will immediately overwrite with authoritative data.
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
          user.email || user.displayName || "Google User";
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
          // Load global stotrams (inbuilt overrides + global stotrams for all users)
          loadGlobalStotrams();
        });
      } else {
        document.getElementById("fbLoggedOut").style.display = "block";
        document.getElementById("fbLoggedIn").style.display = "none";
        // Clean up session listener on sign out
        if (fbSessionListener) {
          fbSessionListener();
          fbSessionListener = null;
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

function fbSignOut() {
  if (!fbAuth) return;
  if (fbSessionListener) {
    fbSessionListener();
    fbSessionListener = null;
  }
  if (fbListener) {
    fbListener();
    fbListener = null;
  }
  App._uid = null;
  fbAuth.signOut().then(() => toast("Signed out 🙏"));
}

// ── Firestore Full-State Sync ──
// ── Remove legacy duplicate Ekadashi occasions ──
// Old code wrote BOTH startDate and endDate into occasions{}.
// New code writes only ONE date (the actual fasting date per parampara).
// This migrates existing data: for each saved Ekadashi, keep only the fasting date
// and delete the other one if it was set by the old code.
function _cleanLegacyEkadashiOccasions() {
  const eks = App.S.customEkadashi || [];
  const occ = App.S.occasions || {};
  const parampara = App.S.ekParampara || "smarta";
  eks.forEach((ek) => {
    const sd = _ekDate(ek);
    const ed = typeof ek === "object" && ek.endDate ? ek.endDate : sd;
    if (!sd || sd === ed) return;
    // Determine correct fasting date per current parampara
    let fastingDate = sd;
    if (parampara === "vaishnava" && ek.startTime) {
      const [h, m] = ek.startTime.split(":").map(Number);
      if (h * 60 + m >= 264) fastingDate = ed;
    }
    const wrongDate = fastingDate === sd ? ed : sd;
    // Only delete the wrongDate entry if it looks like it was written by Ekadashi code
    if (wrongDate && occ[wrongDate]) {
      const label = occ[wrongDate];
      const ekName = typeof ek === "object" && ek.name ? ek.name : "";
      if (
        label.includes("Ekadashi") ||
        label.includes("Mahadvadashi") ||
        (ekName && label.includes(ekName))
      ) {
        delete occ[wrongDate];
      }
    }
    // Rewrite the correct fasting date with the proper label (updates legacy format too)
    const name = typeof ek === "object" && ek.name ? ek.name : "Ekadashi";
    const paksha = typeof ek === "object" && ek.paksha ? ek.paksha : "shukla";
    const label = name + (paksha === "shukla" ? " ☀️ Shukla" : " 🌙 Krishna");
    const sf =
      typeof ek === "object" && ek.startTime ? _fmtTime12(ek.startTime) : "";
    const ef =
      typeof ek === "object" && ek.endTime ? _fmtTime12(ek.endTime) : "";
    const timeNote = sf
      ? parampara === "vaishnava" && fastingDate === ed
        ? " (Mahadvadashi · Arunodaya Viddha)"
        : " " + sf + (ef ? "–" + ef : "")
      : parampara === "vaishnava" && fastingDate === ed
        ? " (Mahadvadashi)"
        : "";
    occ[fastingDate] = label + timeNote;
  });
  App.S.occasions = occ;
}

async function fbPushDelta() {
  return fbPushFull();
}

async function fbPushFull() {
  if (!fbUser) return;
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
    customEkadashi: App.S.customEkadashi || [],
    ekParampara: App.S.ekParampara || "smarta",
    sadhanaStart: App.S.sadhanaStart || "",
    historyHK: App.S.historyHK || {},
    timerHistoryHK: App.S.timerHistoryHK || {},
    dtHK: App.S.dtHK || 0,
    nameJapDeductHK: App.S.nameJapDeductHK || 0,
    malaLogHK: App.S.malaLogHK || [],
    gaudiyaMode: App.S.gaudiyaMode || false,
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
  // ── Ekadashi data — critical for multi-device sync ──
  if ("customEkadashi" in d)
    App.S.customEkadashi = JSON.parse(JSON.stringify(d.customEkadashi || []));
  if ("ekParampara" in d) App.S.ekParampara = d.ekParampara || "smarta";
  if (d.sadhanaStart) {
    App.S.sadhanaStart = d.sadhanaStart;
    localStorage.setItem("rjap_sadhana_start", d.sadhanaStart);
    const inp = document.getElementById("msSadhanaStart");
    if (inp) inp.value = d.sadhanaStart;
  }

  // ── Clean up legacy two-date Ekadashi occasions ──
  // Old saves wrote both startDate AND endDate to occasions. Remove the endDate entry
  // when the same Ekadashi name already appears on startDate.
  _cleanLegacyEkadashiOccasions();

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
  if (typeof renderEkadashiList === "function") renderEkadashiList();
  if (typeof renderEkParampara === "function") renderEkParampara();
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
    const snap = await docRef.get();
    if (!snap.exists) {
      // No cloud data yet — push local state up
      await fbPushFull();
    } else {
      // Cloud data exists — ALWAYS apply it (overrides local cache)
      fbApplyRemote({ ...snap.data(), deviceId: null });
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

function u28() {
  const tod = App.S.h28[App.S.tk] || 0;
  const tot = Object.values(App.S.h28).reduce((a, b) => a + b, 0);
  const cycles28 = Math.floor(tot / 28);
  const todEl = document.getElementById("n28t");
  if (todEl) todEl.textContent = tod;
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
    } else {
      nameEl.style.animation = "none";
      nameEl.offsetHeight;
      nameEl.style.animation =
        "nameIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards";
      nameEl.textContent = get28Name(entry);
    }
  }
  if (meanEl) meanEl.textContent = isCompleting ? "" : entry.meaning;
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
  // Show today's accumulated 28-Names time in Total Timer if not currently running
  if (!App._n28TimerInterval) {
    const te = document.getElementById("n28TotalTimer");
    if (te) te.textContent = App.fmtTime(App.timerSeconds);
  }
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
  if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 200]);
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
        '<button class="sk-btn grey" onclick="deleteSankalp(\'' +
        sk.id +
        "')\">✕</button></div>" +
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
        '<button class="sk-btn grey" onclick="deleteSankalp(\'' +
        sk.id +
        "')\">✕</button></div>" +
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

// ── STOTRAM LIST & LYRICS are now in stotrams.js ──
// Make sure to include stotrams.js before app.js in your HTML

function renderSt() {
  const list = document.getElementById("stList");
  list.innerHTML = "";
  // Merge: inbuilt + global (from Firestore) + personal custom
  const globalSt = (_globalStotrams || []).map((x) => ({ ...x, global: true }));
  const all = [
    ...STLIST,
    ...globalSt,
    ...(App.S.customSt || []).map((x) => ({ ...x, custom: true })),
  ];
  // Show dev panel toggle button for developers
  const devBtn = document.getElementById("devStBtn");
  if (devBtn) devBtn.style.display = isDeveloper() ? "" : "none";
  all.forEach((st) => {
    const tc = (App.S.stotrams[st.id] || {})[App.S.tk] || 0;
    const tot = Object.values(App.S.stotrams[st.id] || {}).reduce(
      (a, b) => a + b,
      0,
    );
    // Show 📖 for built-in (via LYRICS or override), global, or custom with lyrics
    const effLyrics = getEffectiveLyrics(st.id);
    const hasLyrics = !!(effLyrics && effLyrics.trim().length > 0);
    const c = document.createElement("div");
    c.className = "stc";
    // Tag for global stotrams
    const globalTag = st.global
      ? '<span style="font-size:9px;color:var(--gold);border:1px solid rgba(255,215,0,0.3);border-radius:4px;padding:1px 5px;margin-left:5px;vertical-align:middle">🌍 GLOBAL</span>'
      : "";
    let inner =
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:3px">' +
      '<span class="stn">' +
      escHtml(st.name) +
      globalTag +
      "</span>" +
      (st.custom
        ? '<div style="display:flex;gap:5px">' +
          '<button class="dsb" style="color:var(--a2);border-color:rgba(74,144,226,0.35)" onclick="toggleStEdit(\'' +
          st.id +
          "')\">✏</button>" +
          '<button class="dsb" onclick="delSt(\'' +
          st.id +
          "')\">✕</button>" +
          "</div>"
        : "") +
      "</div>" +
      (st.sub ? '<div class="sts">' + escHtml(st.sub) + "</div>" : "") +
      '<div class="scr"><div>' +
      '<div class="scnt" id="sc' +
      st.id +
      '">' +
      tc +
      "</div>" +
      '<div class="std2">Today · Total: <strong style="color:var(--a2)">' +
      tot +
      "</strong></div>" +
      "</div>" +
      '<div class="sbtns">' +
      '<button class="sbtn m" onclick="adjSt(\'' +
      st.id +
      "',-1)\">−</button>" +
      '<button class="sbtn p" onclick="adjSt(\'' +
      st.id +
      "',1)\">+</button>" +
      (hasLyrics
        ? '<button class="sbtn l" onclick="showLyrics(\'' +
          st.id +
          "')\">📖</button>"
        : "") +
      "</div></div>";
    // Edit lyrics panel (custom only) — hidden by default
    if (st.custom) {
      inner +=
        '<div id="slePanel-' +
        st.id +
        '" style="display:none;margin-top:10px">' +
        '<div style="font-size:11px;color:var(--a2);margin-bottom:5px;letter-spacing:1px">✏ Edit Lyrics (stored in your account)</div>' +
        '<textarea id="sle-' +
        st.id +
        '" rows="8" style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(74,144,226,0.25);border-radius:9px;padding:9px 11px;color:var(--tl);font-size:14px;font-family:Hind Siliguri,serif;resize:vertical;line-height:1.8;box-sizing:border-box" placeholder="Paste full lyrics here…"></textarea>' +
        "<button onclick=\"editStLyrics('" +
        st.id +
        '\')" style="margin-top:7px;padding:8px 18px;border-radius:9px;border:none;background:linear-gradient(135deg,var(--bg),var(--a));color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">💾 Save Lyrics</button>' +
        "</div>";
    }
    c.innerHTML = inner;
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

// Global stotrams stored in Firestore — visible to ALL users
let _globalStotrams = [];
let _globalLyricsOverrides = {}; // {stotramId: newLyrics}

async function loadGlobalStotrams() {
  if (!fbDb) return;
  try {
    const snap = await fbDb
      .collection("global_stotrams")
      .orderBy("createdAt", "asc")
      .get();
    _globalStotrams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Collection may not exist yet
    _globalStotrams = [];
  }
  try {
    const overrides = await fbDb.collection("stotram_overrides").get();
    _globalLyricsOverrides = {};
    overrides.docs.forEach((d) => {
      _globalLyricsOverrides[d.id] = d.data().lyrics || "";
    });
  } catch (e) {
    _globalLyricsOverrides = {};
  }
  renderSt();
}

function getEffectiveLyrics(id) {
  if (_globalLyricsOverrides[id]) return _globalLyricsOverrides[id];
  return (
    LYRICS[id] ||
    ((App.S.customSt || []).find((x) => x.id === id) || {}).lyrics ||
    ((_globalStotrams || []).find((x) => x.id === id) || {}).lyrics ||
    ""
  );
}

async function devSaveInbuiltLyrics(id) {
  if (!isDeveloper()) {
    toast("Access denied");
    return;
  }
  const ta = document.getElementById("devLyrEdit-" + id);
  if (!ta) return;
  const lyrics = ta.value.trim();
  if (!lyrics) {
    toast("Lyrics cannot be empty");
    return;
  }
  try {
    await fbDb
      .collection("stotram_overrides")
      .doc(id)
      .set({
        lyrics,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: fbUser.email,
      });
    _globalLyricsOverrides[id] = lyrics;
    renderSt();
    toast("✅ Lyrics saved for all users! 🙏");
  } catch (e) {
    toast("Error: " + e.message);
  }
}

async function devAddGlobalStotram() {
  if (!isDeveloper()) {
    toast("Access denied");
    return;
  }
  const name = (document.getElementById("devStName").value || "").trim();
  const sub = (document.getElementById("devStSub").value || "").trim();
  const lyrics = (document.getElementById("devStLyrics").value || "").trim();
  if (!name) {
    toast("Stotram name required");
    return;
  }
  const id = "gs_" + Date.now();
  try {
    await fbDb.collection("global_stotrams").doc(id).set({
      name,
      sub,
      lyrics,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: fbUser.email,
    });
    _globalStotrams.push({ id, name, sub, lyrics });
    document.getElementById("devStName").value = "";
    document.getElementById("devStSub").value = "";
    document.getElementById("devStLyrics").value = "";
    renderSt();
    renderDevStotramPanel();
    toast("✅ Global stotram added for all users! 🙏");
  } catch (e) {
    toast("Error: " + e.message);
  }
}

async function devDeleteGlobalStotram(id) {
  if (!isDeveloper()) {
    toast("Access denied");
    return;
  }
  if (!confirm("Delete this global stotram for all users?")) return;
  try {
    await fbDb.collection("global_stotrams").doc(id).delete();
    _globalStotrams = _globalStotrams.filter((s) => s.id !== id);
    renderSt();
    renderDevStotramPanel();
    toast("Deleted.");
  } catch (e) {
    toast("Error: " + e.message);
  }
}

let _devPanelOpen = false;
function toggleDevPanel() {
  _devPanelOpen = !_devPanelOpen;
  const panel = document.getElementById("devStPanel");
  if (panel) {
    panel.style.display = _devPanelOpen ? "block" : "none";
  }
  if (_devPanelOpen) renderDevStotramPanel();
}

function renderDevStotramPanel() {
  const el = document.getElementById("devStList");
  if (!el) return;
  let html = "";
  // Section 1: Edit inbuilt stotram lyrics
  html +=
    '<div style="font-size:12px;color:var(--gold);letter-spacing:1px;margin-bottom:8px;text-transform:uppercase">✏ Edit Inbuilt Stotram Lyrics</div>';
  STLIST.forEach((st) => {
    const cur = getEffectiveLyrics(st.id);
    const hasOverride = !!_globalLyricsOverrides[st.id];
    html +=
      '<div style="margin-bottom:10px;border:1px solid rgba(255,215,0,0.2);border-radius:9px;padding:9px">';
    html +=
      '<div style="font-size:12px;color:var(--tl);margin-bottom:6px">' +
      escHtml(st.name) +
      (hasOverride
        ? ' <span style="color:var(--green);font-size:10px">● overridden</span>'
        : "") +
      "</div>";
    html +=
      '<textarea id="devLyrEdit-' +
      st.id +
      '" rows="4" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.2);border-radius:7px;padding:7px;color:var(--tl);font-size:12px;font-family:Hind Siliguri,serif;resize:vertical;box-sizing:border-box">' +
      escHtml(cur) +
      "</textarea>";
    html +=
      "<button onclick=\"devSaveInbuiltLyrics('" +
      st.id +
      '\')" style="margin-top:5px;padding:6px 14px;border-radius:7px;border:none;background:linear-gradient(135deg,rgba(255,215,0,0.3),rgba(255,180,0,0.2));color:var(--gold);font-size:12px;cursor:pointer">💾 Save for All Users</button>';
    html += "</div>";
  });
  // Section 2: Global stotrams list
  if (_globalStotrams.length) {
    html +=
      '<div style="font-size:12px;color:var(--gold);letter-spacing:1px;margin:12px 0 8px;text-transform:uppercase">🌍 Global Stotrams Added</div>';
    _globalStotrams.forEach((st) => {
      html +=
        '<div style="display:flex;align-items:center;gap:8px;padding:7px;background:rgba(255,215,0,0.05);border-radius:7px;margin-bottom:6px">';
      html +=
        '<div style="flex:1;font-size:12px;color:var(--tl)">' +
        escHtml(st.name) +
        (st.sub
          ? '<br><span style="font-size:10px;color:var(--td)">' +
            escHtml(st.sub) +
            "</span>"
          : "") +
        "</div>";
      html +=
        "<button onclick=\"devDeleteGlobalStotram('" +
        st.id +
        '\')" style="padding:4px 10px;border-radius:7px;border:1px solid rgba(232,51,109,0.3);background:rgba(232,51,109,0.08);color:var(--rl);font-size:11px;cursor:pointer">Delete</button>';
      html += "</div>";
    });
  }
  el.innerHTML = html;
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

// ═══════════════════════════════════════════════════════════════
// PANCHANG ENGINE — GPS-based astronomical tithi, no API key
// Moon elongation from sun (VSOP87 simplified) → tithi 1-30
// Each 12° of elongation = 1 tithi
// ═══════════════════════════════════════════════════════════════

function _moonElongation(date) {
  const JD = date.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545.0) / 36525.0;
  const r = Math.PI / 180;
  const L0 = (280.46646 + 36000.76983 * T) % 360;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360;
  const Mr = M * r;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  const sunLon = L0 + C;
  const Lm = (218.3164477 + 481267.88123421 * T - 0.0015786 * T * T) % 360;
  const Mm = (134.9633964 + 477198.8675055 * T + 0.0087414 * T * T) % 360;
  const F = (93.272095 + 483202.0175233 * T - 0.0036539 * T * T) % 360;
  const D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T * T) % 360;
  const Mmr = Mm * r,
    Fr = F * r,
    Dr = D * r;
  const moonLon =
    Lm +
    6.289 * Math.sin(Mmr) -
    1.274 * Math.sin(2 * Dr - Mmr) +
    0.658 * Math.sin(2 * Dr) -
    0.214 * Math.sin(2 * Mmr) +
    0.059 * Math.sin(2 * Dr - 2 * Mmr + Mmr) -
    0.057 * Math.sin(2 * Dr - Mr - Mmr) +
    0.053 * Math.sin(2 * Dr + Mmr) +
    0.046 * Math.sin(2 * Dr - Mr) +
    0.041 * Math.sin(Mmr - Mr) -
    0.034 * Math.sin(Dr) +
    0.03 * Math.sin(2 * Mmr - Mr) -
    0.024 * Math.sin(2 * (Dr - Mmr)) +
    0.018 * Math.sin(2 * Dr - 2 * Fr - Mmr);
  return (((moonLon - sunLon) % 360) + 360) % 360;
}

// tithi 1-30 at a given moment
function _tithiAtMoment(date) {
  return Math.floor(_moonElongation(date) / 12) + 1;
}

// Binary-search exact moment elongation crosses a degree boundary within [lo,hi]
function _findElongCrossing(targetDeg, lo, hi) {
  let loT = lo.getTime(),
    hiT = hi.getTime();
  for (let i = 0; i < 48; i++) {
    const mid = (loT + hiT) / 2;
    const e = _moonElongation(new Date(mid));
    const diff = (e - targetDeg + 360) % 360;
    if (diff < 180) hiT = mid;
    else loT = mid;
    if (hiT - loT < 15000) break; // 15-second precision
  }
  return new Date((loT + hiT) / 2);
}

function _didCross(prev, cur, deg) {
  if (prev > 330 && cur < 30)
    return deg > 330 ? prev <= deg : deg < 30 ? cur >= deg : false;
  return prev < deg && cur >= deg;
}

// Find Ekadashi tithi start/end in a window. Returns {paksha, ekStart, ekEnd} or null.
function _findEkInWindow(wStart, wEnd, paksha) {
  const startDeg = paksha === "shukla" ? 120 : 300;
  const endDeg = paksha === "shukla" ? 132 : 312;
  const DAY = 86400000;
  let prev = _moonElongation(wStart),
    ekStart = null,
    ekEnd = null;
  const cur = new Date(wStart);
  while (cur <= wEnd) {
    cur.setTime(cur.getTime() + DAY);
    const e = _moonElongation(cur);
    if (!ekStart && _didCross(prev, e, startDeg))
      ekStart = _findElongCrossing(
        startDeg,
        new Date(cur.getTime() - DAY),
        new Date(cur),
      );
    if (ekStart && !ekEnd && _didCross(prev, e, endDeg))
      ekEnd = _findElongCrossing(
        endDeg,
        new Date(cur.getTime() - DAY),
        new Date(cur),
      );
    if (ekStart && ekEnd) break;
    prev = e;
  }
  if (!ekStart) return null;
  if (!ekEnd) ekEnd = new Date(ekStart.getTime() + 90000000); // ~25h fallback
  return { paksha, ekStart, ekEnd };
}

function _d2hhmm(d) {
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}
function _d2ymd(d) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

// Resolve the single fasting date per parampara from an Ek result
function _resolveEkFasting(ek, lat, lng, name) {
  const { paksha, ekStart, ekEnd } = ek;
  const startDate = _d2ymd(ekStart),
    endDate = _d2ymd(ekEnd);
  const startTime = _d2hhmm(ekStart),
    endTime = _d2hhmm(ekEnd);
  const srData = calcSunTimes(lat, lng, ekStart);
  const sunriseH = srData ? srData.sunriseH : 6.0;
  const arunodayaH = sunriseH - 96 / 60;
  const ekStartH = ekStart.getHours() + ekStart.getMinutes() / 60;
  const parampara = App.S.ekParampara || "smarta";
  let fastingDate = startDate,
    isViddha = false;
  if (parampara === "vaishnava") {
    if (ekStartH > arunodayaH) {
      fastingDate = endDate;
      isViddha = true;
    }
  } else {
    // Smarta: fast on day where Ekadashi is present at sunrise
    if (ekStartH > sunriseH) fastingDate = endDate;
  }
  const pakshaLabel = paksha === "shukla" ? " ☀️ Shukla" : " 🌙 Krishna";
  const label =
    (name || "Ekadashi") + pakshaLabel + (isViddha ? " (Mahadvadashi)" : "");
  return {
    name: name || "Ekadashi",
    paksha,
    isViddha,
    startDate,
    startTime,
    endDate,
    endTime,
    fastingDate,
    label,
  };
}

// Ekadashi names indexed by JS Date.getMonth() (0=Jan … 11=Dec)
// Shukla Paksha (Bright Fortnight) Ekadashis
const _EK_NAMES_SHUKLA = [
  "Pausha Putrada", // 0 = January   (Month 10 Pausha)
  "Jaya", // 1 = February  (Month 11 Magha)
  "Amalaki", // 2 = March     (Month 12 Phalguna)
  "Kamada", // 3 = April     (Month 1  Chaitra)
  "Mohini", // 4 = May       (Month 2  Vaishakha)
  "Nirjala", // 5 = June      (Month 3  Jyeshtha)
  "Devshayani", // 6 = July      (Month 4  Ashadha)
  "Shravana Putrada", // 7 = August    (Month 5  Shravana)
  "Parsva", // 8 = September (Month 6  Bhadrapada)
  "Papankusha", // 9 = October   (Month 7  Ashwin)
  "Devutthana", // 10 = November (Month 8  Kartik)
  "Mokshada", // 11 = December (Month 9  Margashirsha)
];
// Krishna Paksha (Dark Fortnight) Ekadashis
const _EK_NAMES_KRISHNA = [
  "Saphala", // 0 = January   (Month 10 Pausha)
  "Shattila", // 1 = February  (Month 11 Magha)
  "Vijaya", // 2 = March     (Month 12 Phalguna)
  "Papamochani", // 3 = April     (Month 1  Chaitra)
  "Varuthini", // 4 = May       (Month 2  Vaishakha)
  "Apara", // 5 = June      (Month 3  Jyeshtha)
  "Yogini", // 6 = July      (Month 4  Ashadha)
  "Kamika", // 7 = August    (Month 5  Shravana)
  "Aja", // 8 = September (Month 6  Bhadrapada)
  "Indira", // 9 = October   (Month 7  Ashwin)
  "Rama", // 10 = November (Month 8  Kartik)
  "Utpanna", // 11 = December (Month 9  Margashirsha)
];

// _ADHIK_MAAS_WINDOWS, _getAdhikMaasWindow, isAdhikMaasDate
// defined in panchangData.js (loaded before app.js)

let _panchangFetching = false;

async function fetchPanchangEkadashis() {
  if (_panchangFetching) return;
  _panchangFetching = true;
  const btn = document.getElementById("panchangFetchBtn");
  const status = document.getElementById("panchangStatus");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Computing…";
  }
  if (status) status.textContent = "📍 Getting GPS location…";
  try {
    const pos = await new Promise((res, rej) => {
      if (!navigator.geolocation) {
        rej(new Error("GPS unavailable"));
        return;
      }
      navigator.geolocation.getCurrentPosition(res, rej, {
        timeout: 10000,
        maximumAge: 3600000,
      });
    });
    const lat = pos.coords.latitude,
      lng = pos.coords.longitude;
    if (status) status.textContent = "🔢 Computing tithis…";

    if (!App.S.customEkadashi) App.S.customEkadashi = [];
    if (!App.S.occasions) App.S.occasions = {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const DAY = 86400000;
    let added = 0,
      cur = new Date(today);
    // Scan 6 months × 2 pakshas = 12 Ekadashis
    for (let i = 0; i < 12; i++) {
      for (const paksha of ["shukla", "krishna"]) {
        const wStart = new Date(cur);
        const wEnd = new Date(cur.getTime() + 17 * DAY);
        const ek = _findEkInWindow(wStart, wEnd, paksha);
        if (ek && ek.ekStart >= today) {
          const mi = ek.ekStart.getMonth();
          const ekDateStr = ek.ekStart.toISOString().slice(0, 10);
          const adhikWin = _getAdhikMaasWindow(ekDateStr);
          let name;
          if (adhikWin) {
            // Adhik Maas Ekadashis: Padmini (Shukla) / Parama (Krishna)
            name = paksha === "shukla" ? "Padmini" : "Parama";
          } else {
            name =
              paksha === "shukla"
                ? _EK_NAMES_SHUKLA[mi] || "Ekadashi"
                : _EK_NAMES_KRISHNA[mi] || "Ekadashi";
          }
          const resolved = _resolveEkFasting(ek, lat, lng, name);
          const exists = App.S.customEkadashi.some(
            (e) => _ekDate(e) === resolved.startDate,
          );
          if (!exists) {
            App.S.customEkadashi.push({
              name: resolved.name,
              paksha: resolved.paksha,
              startDate: resolved.startDate,
              startTime: resolved.startTime,
              endDate: resolved.endDate,
              endTime: resolved.endTime,
              autoFetched: true,
            });
            App.S.occasions[resolved.fastingDate] = resolved.label;
            added++;
          }
        }
        cur.setTime(cur.getTime() + 15 * DAY);
      }
    }
    App.S.customEkadashi.sort((a, b) => (_ekDate(a) < _ekDate(b) ? -1 : 1));
    App.save();
    fbDebouncedPush();
    renderEkadashiList();
    renderCal();
    if (status)
      status.textContent = `✅ ${added} added · ${12 - added} already saved`;
    toast(`📅 ${added} Ekadashis auto-added for ~6 months! 🙏`);
  } catch (e) {
    if (status) status.textContent = "⚠️ " + (e.message || "Location denied");
    toast("GPS error: " + (e.message || "denied"));
  } finally {
    _panchangFetching = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🌙 Auto-Fetch from GPS";
    }
  }
}

// ── Brahmacharya Progress Graph ──
// Anchor: May 16, 2026 = Amavasya (new moon, tithi 30/0 of Krishna paksha)
// Synodic month ≈ 29.530589 days
const BC_AMAVASYA_ANCHOR = new Date("2026-05-16T00:00:00");
const SYNODIC_MONTH = 29.530589;

function getLunarTithi(date) {
  // Primary: precise moon elongation (VSOP87 simplified)
  return _tithiAtMoment(date);
}

function isRiskDay(date) {
  const t = getLunarTithi(date);
  // Risk window: Navami to Trayodashi in both paksha
  // Shukla: 9-13, Krishna: 24-28 (15+9 to 15+13)
  if ((t >= 9 && t <= 13) || (t >= 24 && t <= 28)) return true;
  // Check custom Ekadashi periods (2-day risk window around startDate AND endDate)
  const customDates = App.S.customEkadashi || [];
  if (customDates.length > 0) {
    const dateMs = date.getTime();
    const DAY = 86400000;
    for (const ek of customDates) {
      const sd = _ekDate(ek);
      const ed = _ekEndDate(ek);
      if (sd) {
        const sdMs = new Date(sd + "T00:00:00").getTime();
        const edMs = ed ? new Date(ed + "T00:00:00").getTime() : sdMs;
        // Inside the period OR within 2 days of either edge
        if (dateMs >= sdMs - 2 * DAY && dateMs <= edMs + 2 * DAY) return true;
      }
    }
  }
  return false;
}

// Helper: extract start date string from a customEkadashi entry (supports legacy string/object formats)
function _ekDate(e) {
  if (typeof e === "string") return e;
  if (!e) return "";
  return e.startDate || e.date || "";
}
// Helper: extract end date string from a customEkadashi entry
function _ekEndDate(e) {
  if (typeof e === "string") return e;
  if (!e) return "";
  return e.endDate || e.startDate || e.date || "";
}

// Returns true if date falls within any custom Ekadashi period (startDate→endDate)
function isCustomEkadashiDay(date) {
  const customDates = App.S.customEkadashi || [];
  if (!customDates.length) return false;
  const key = _ldk(date);
  return customDates.some((e) => key >= _ekDate(e) && key <= _ekEndDate(e));
}

// ── Ekadashi: Parampara ──
const EK_NOTES = {
  smarta:
    "☀️ <b>Smarta rule:</b> Fast on the day when Ekadashi tithi is prevailing at local sunrise — even if Dashami was present just before it.",
  vaishnava:
    '🌸 <b>Vaishnava/Gaudiya rule (Arunodaya Viddha):</b> If Dashami tithi overlaps even one second into the 96-min Arunodaya window before sunrise, that day is "Viddha" (contaminated). Fast is moved to the next day (Mahadvadashi), even though Dvadashi tithi is running.',
};

function saveEkParampara(val) {
  App.S.ekParampara = val;
  App.save();
  fbDebouncedPush();
  renderEkParampara();
  toast(
    val === "smarta" ? "☀️ Smarta Parampara set" : "🌸 Vaishnava Parampara set",
  );
}

function renderEkParampara() {
  const p = App.S.ekParampara || "smarta";
  const smBtn = document.getElementById("ekParSmarta");
  const vaBtn = document.getElementById("ekParVaishnav");
  const note = document.getElementById("ekParamparaNote");
  const activeStyle =
    "padding:10px 6px;border-radius:10px;border:2px solid;font-size:12px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;";
  if (smBtn) {
    smBtn.style.cssText =
      activeStyle +
      (p === "smarta"
        ? "border-color:rgba(241,196,15,0.8);background:rgba(241,196,15,0.22);color:#F1C40F;"
        : "border-color:rgba(241,196,15,0.2);background:transparent;color:rgba(241,196,15,0.4);");
  }
  if (vaBtn) {
    vaBtn.style.cssText =
      activeStyle +
      (p === "vaishnava"
        ? "border-color:rgba(189,147,249,0.8);background:rgba(155,89,182,0.22);color:#BD93F9;"
        : "border-color:rgba(155,89,182,0.2);background:transparent;color:rgba(189,147,249,0.4);");
  }
  if (note) note.innerHTML = EK_NOTES[p] || "";
}

// ── Custom Ekadashi Date Management ──
function _fmtTime12(t24) {
  if (!t24) return "";
  const [hStr, mStr] = t24.split(":");
  let h = parseInt(hStr),
    m = parseInt(mStr);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + ":" + String(m).padStart(2, "0") + " " + ap;
}

function addEkadashiDate() {
  const startDate =
    (document.getElementById("ekStartDateIn") || {}).value || "";
  const startTime =
    (document.getElementById("ekStartTimeIn") || {}).value || "";
  const endDate = (document.getElementById("ekEndDateIn") || {}).value || "";
  const endTime = (document.getElementById("ekEndTimeIn") || {}).value || "";
  const nameEl = document.getElementById("ekNameIn");
  const name = nameEl ? nameEl.value.trim() : "";
  const pakshaEl = document.querySelector('input[name="ekPaksha"]:checked');
  const paksha = pakshaEl ? pakshaEl.value : "shukla";

  if (!startDate) {
    toast("Please select a start date 📅");
    return;
  }
  if (!App.S.customEkadashi) App.S.customEkadashi = [];
  if (App.S.customEkadashi.some((e) => _ekDate(e) === startDate)) {
    toast("An Ekadashi starting on this date already exists");
    return;
  }

  const entry = {
    name,
    paksha,
    startDate,
    startTime,
    endDate: endDate || startDate,
    endTime,
  };
  App.S.customEkadashi.push(entry);
  App.S.customEkadashi.sort((a, b) => (_ekDate(a) < _ekDate(b) ? -1 : 1));

  // Clear inputs
  ["ekStartDateIn", "ekStartTimeIn", "ekEndDateIn", "ekEndTimeIn"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    },
  );
  if (nameEl) nameEl.value = "";
  const shuklaRadio = document.getElementById("ekPakshaShukla");
  if (shuklaRadio) shuklaRadio.checked = true;

  // ── Write single fasting-date occasion per Parampara ──
  // Get real GPS-based sunrise for the Ekadashi start date, then compute fasting day
  if (!App.S.occasions) App.S.occasions = {};
  const label =
    (name || "Ekadashi") + (paksha === "shukla" ? " ☀️ Shukla" : " 🌙 Krishna");
  const startFmt = startTime ? _fmtTime12(startTime) : "";
  const endFmt = endTime ? _fmtTime12(endTime) : "";

  function _applyEkFasting(sunriseH) {
    // Arunodaya (Brahmamuhurta start) = 96 min before actual sunrise
    const arunodayaH = sunriseH - 96 / 60;
    let fastingDate = startDate;
    let isViddha = false;
    const parampara = App.S.ekParampara || "smarta";
    if (startTime && endDate && endDate !== startDate) {
      const [sh, sm] = startTime.split(":").map(Number);
      const ekStartH = sh + sm / 60;
      if (parampara === "vaishnava") {
        // Vaishnava: if Ekadashi tithi starts after Arunodaya, day is Viddha → fast on endDate (Mahadvadashi)
        if (ekStartH >= arunodayaH) {
          fastingDate = endDate;
          isViddha = true;
        }
      } else {
        // Smarta: if Ekadashi tithi starts after actual sunrise, fast on endDate
        if (ekStartH >= sunriseH) fastingDate = endDate;
      }
    }
    const timeNote = isViddha
      ? " (Mahadvadashi · Arunodaya Viddha · Sunrise " +
        fmtHour(sunriseH) +
        " / Arunodaya " +
        fmtHour(arunodayaH) +
        ")"
      : startFmt
        ? " " +
          startFmt +
          (endFmt ? "–" + endFmt : "") +
          " (Sunrise " +
          fmtHour(sunriseH) +
          ")"
        : "";
    App.S.occasions[fastingDate] = label + timeNote;
    App.save();
    fbDebouncedPush();
    renderEkadashiList();
    renderCal();
    toast(
      "Ekadashi added 📅 (Sunrise " +
        fmtHour(sunriseH) +
        ", Arunodaya " +
        fmtHour(arunodayaH) +
        ")",
    );
  }

  // Use GPS to get real sunrise for the Ekadashi start date
  if (navigator.geolocation) {
    toast("📍 Getting GPS for sunrise…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ekDate = new Date(startDate + "T00:00:00");
        const srData = calcSunTimes(
          pos.coords.latitude,
          pos.coords.longitude,
          ekDate,
        );
        const sunriseH = srData ? srData.sunriseH : 6.0;
        _applyEkFasting(sunriseH);
      },
      () => {
        // GPS denied/failed — fall back to 6.00 AM with a warning
        toast("⚠️ GPS unavailable, using 06:00 sunrise fallback");
        _applyEkFasting(6.0);
      },
      { timeout: 8000, maximumAge: 3600000 },
    );
  } else {
    _applyEkFasting(6.0);
  }
}

function removeEkadashiDate(startDate) {
  const entry = (App.S.customEkadashi || []).find(
    (e) => _ekDate(e) === startDate,
  );
  App.S.customEkadashi = (App.S.customEkadashi || []).filter(
    (e) => _ekDate(e) !== startDate,
  );
  if (App.S.occasions) {
    // Remove both dates set by this Ekadashi
    [startDate, entry && entry.endDate].filter(Boolean).forEach((d) => {
      if (
        App.S.occasions[d] &&
        (App.S.occasions[d].includes("Ekadashi") ||
          App.S.occasions[d].includes(entry && entry.name))
      ) {
        delete App.S.occasions[d];
      }
    });
  }
  App.save();
  fbDebouncedPush();
  renderEkadashiList();
  renderCal();
  toast("Ekadashi removed");
}

function renderEkadashiList() {
  const list = document.getElementById("ekadashiList");
  if (!list) return;
  const entries = App.S.customEkadashi || [];
  if (entries.length === 0) {
    list.innerHTML =
      '<div style="font-size:11px;color:rgba(255,255,255,0.3);text-align:center;padding:10px 0 4px;">No Ekadashis saved yet.</div>';
    return;
  }
  const parampara = App.S.ekParampara || "smarta";
  list.innerHTML = entries
    .map((e) => {
      const sd = _ekDate(e);
      const ed = typeof e === "object" && e.endDate ? e.endDate : sd;
      const name = typeof e === "object" && e.name ? e.name : "Ekadashi";
      const paksha = typeof e === "object" && e.paksha ? e.paksha : "shukla";
      const startTime = typeof e === "object" && e.startTime ? e.startTime : "";
      const endTime = typeof e === "object" && e.endTime ? e.endTime : "";
      const isAuto = typeof e === "object" && e.autoFetched ? true : false;
      const fmtD = (d) => {
        const _d = new Date(d + "T00:00:00");
        const _days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return (
          _days[_d.getDay()] +
          " " +
          String(_d.getDate()).padStart(2, "0") +
          ":" +
          String(_d.getMonth() + 1).padStart(2, "0") +
          ":" +
          _d.getFullYear()
        );
      };
      const sfmt = startTime ? _fmtTime12(startTime) : "";
      const efmt = endTime ? _fmtTime12(endTime) : "";
      const pLabel =
        paksha === "shukla"
          ? '<span style="font-size:9px;background:rgba(241,196,15,0.2);color:#F1C40F;border-radius:4px;padding:2px 5px;font-weight:700;">☀️ SHUKLA</span>'
          : '<span style="font-size:9px;background:rgba(155,89,182,0.25);color:#BD93F9;border-radius:4px;padding:2px 5px;font-weight:700;">🌙 KRISHNA</span>';
      const autoTag = isAuto
        ? '<span style="font-size:8px;color:rgba(46,204,113,0.7);margin-left:4px;">AUTO</span>'
        : "";
      const eid = "ekEd_" + sd.replace(/-/g, "");

      // ── Fasting date per parampara ──────────────────────────────────
      let fastingDate = sd,
        isViddha = false;
      if (startTime) {
        const [hh, mm] = startTime.split(":").map(Number);
        const ekStartMinutes = hh * 60 + mm;
        if (parampara === "vaishnava") {
          // Vaishnava: if Ekadashi starts after arunodaya (sunrise − 96 min ≈ 4:24 = 264 min)
          if (ekStartMinutes >= 264) {
            fastingDate = ed;
            isViddha = true;
          }
        } else {
          // Smarta: if Ekadashi starts after sunrise (approx 6:00 = 360 min)
          if (ekStartMinutes >= 360) fastingDate = ed;
        }
      }
      const isTomorrow = fastingDate === ed && sd !== ed;
      const fastLabel = isViddha
        ? `<span style="color:#FF9800;font-weight:700">🌅 Fast: ${fmtD(fastingDate)}</span> <span style="font-size:9px;background:rgba(255,152,0,0.2);color:#FF9800;border-radius:4px;padding:2px 6px;">Mahadvadashi</span>`
        : isTomorrow
          ? `<span style="color:#76ff7a;font-weight:700">🌅 Fast: ${fmtD(fastingDate)}</span>`
          : `<span style="color:#76ff7a;font-weight:700">🌅 Fast: ${fmtD(fastingDate)}</span>`;
      const paramparaTag =
        parampara === "vaishnava"
          ? '<span style="font-size:8px;background:rgba(74,144,226,0.2);color:#6DB8FF;border-radius:4px;padding:1px 5px;margin-left:4px;">Vaishnava</span>'
          : '<span style="font-size:8px;background:rgba(46,204,113,0.15);color:#2ecc71;border-radius:4px;padding:1px 5px;margin-left:4px;">Smarta</span>';

      // ── Parana (fast-breaking) time ──
      let paranaHtml = "";
      try {
        const _ekStartDt = new Date(
          sd +
            "T" +
            (typeof e === "object" && e.startTime ? e.startTime : "06:00") +
            ":00",
        );
        const _ekEndDt = new Date(
          ed +
            "T" +
            (typeof e === "object" && e.endTime ? e.endTime : "06:00") +
            ":00",
        );
        const _ekObjP = { ekStart: _ekStartDt, ekEnd: _ekEndDt };
        const _pLat = (App.S && App.S.lastLat) || 22.5,
          _pLng = (App.S && App.S.lastLng) || 78.5;
        const _par = _computeParanaWindow(_ekObjP, _pLat, _pLng, fastingDate);
        if (_par)
          paranaHtml =
            '<div style="font-size:10px;color:#FFD700;margin-top:3px;">☀️ Parana: ' +
            fmtD(_par.date) +
            " · " +
            _fmtTime12(_par.windowStart) +
            "–" +
            _fmtTime12(_par.windowEnd) +
            "</div>";
      } catch (_pe) {}

      return `<div style="background:rgba(155,89,182,0.09);border:1px solid rgba(155,89,182,0.22);border-radius:12px;padding:11px;margin-bottom:9px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;color:#BD93F9;font-weight:700;margin-bottom:3px;">${name} ${pLabel}${autoTag}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:5px;">Tithi: ${fmtD(sd)}${sfmt ? " · " + sfmt : ""} → ${fmtD(ed)}${efmt ? " · " + efmt : ""}</div>
          <div style="font-size:11px;margin-bottom:2px;">${fastLabel}${paramparaTag}</div>
          ${paranaHtml}
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0;margin-left:7px;">
          <button onclick="toggleEkEdit('${sd}')" style="background:rgba(74,144,226,0.15);border:1px solid rgba(74,144,226,0.3);border-radius:7px;color:#6DB8FF;font-size:11px;padding:5px 9px;cursor:pointer;font-family:Inter,sans-serif;">✏</button>
          <button onclick="removeEkadashiDate('${sd}')" style="background:rgba(232,51,109,0.15);border:1px solid rgba(232,51,109,0.3);border-radius:7px;color:#e8336d;font-size:11px;padding:5px 9px;cursor:pointer;font-family:Inter,sans-serif;">✕</button>
        </div>
      </div>
      <div id="${eid}" style="display:none;margin-top:10px;background:rgba(0,0,0,0.3);border-radius:9px;padding:10px;">
        <div style="font-size:9px;color:rgba(189,147,249,0.6);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;font-weight:700;">Edit</div>
        <input type="text" id="${eid}_n" value="${name.replace(/"/g, "&quot;")}" placeholder="Name" style="display:block;width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid rgba(155,89,182,0.35);border-radius:8px;padding:7px 10px;color:#fff;font-size:12px;font-family:Inter,sans-serif;outline:none;margin-bottom:8px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px;">
          <label style="display:flex;align-items:center;gap:6px;background:rgba(241,196,15,0.08);border:1px solid rgba(241,196,15,0.25);border-radius:7px;padding:7px 9px;cursor:pointer;">
            <input type="radio" name="${eid}_p" value="shukla" ${paksha === "shukla" ? "checked" : ""} style="accent-color:#F1C40F;">
            <span style="font-size:11px;color:#F1C40F;font-weight:600;">☀️ Shukla</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;background:rgba(155,89,182,0.08);border:1px solid rgba(155,89,182,0.25);border-radius:7px;padding:7px 9px;cursor:pointer;">
            <input type="radio" name="${eid}_p" value="krishna" ${paksha === "krishna" ? "checked" : ""} style="accent-color:#BD93F9;">
            <span style="font-size:11px;color:#BD93F9;font-weight:600;">🌙 Krishna</span>
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:5px;">
          <div><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-bottom:3px;text-transform:uppercase;">Start Date</div>
            <input type="date" id="${eid}_sd" value="${sd}" style="display:block;width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid rgba(155,89,182,0.35);border-radius:7px;padding:7px 5px;color:#fff;font-size:11px;font-family:Inter,sans-serif;outline:none;"></div>
          <div><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-bottom:3px;text-transform:uppercase;">Start Time</div>
            <input type="time" id="${eid}_st" value="${startTime}" style="display:block;width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid rgba(155,89,182,0.35);border-radius:7px;padding:7px 5px;color:#fff;font-size:11px;font-family:Inter,sans-serif;outline:none;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:9px;">
          <div><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-bottom:3px;text-transform:uppercase;">End Date</div>
            <input type="date" id="${eid}_ed" value="${ed}" style="display:block;width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid rgba(155,89,182,0.35);border-radius:7px;padding:7px 5px;color:#fff;font-size:11px;font-family:Inter,sans-serif;outline:none;"></div>
          <div><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-bottom:3px;text-transform:uppercase;">End Time</div>
            <input type="time" id="${eid}_et" value="${endTime}" style="display:block;width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid rgba(155,89,182,0.35);border-radius:7px;padding:7px 5px;color:#fff;font-size:11px;font-family:Inter,sans-serif;outline:none;"></div>
        </div>
        <button onclick="saveEkadashiEdit('${sd}')" style="display:block;width:100%;padding:9px;border-radius:8px;border:none;background:linear-gradient(135deg,rgba(155,89,182,0.7),rgba(90,50,190,0.6));color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">💾 Save Changes</button>
      </div>
    </div>`;
    })
    .join("");
}

function toggleEkEdit(startDate) {
  const eid = "ekEd_" + startDate.replace(/-/g, "");
  const el = document.getElementById(eid);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
}

function saveEkadashiEdit(oldSd) {
  const eid = "ekEd_" + oldSd.replace(/-/g, "");
  const newName = (document.getElementById(eid + "_n") || {}).value || "";
  const newSd = (document.getElementById(eid + "_sd") || {}).value || "";
  const newSt = (document.getElementById(eid + "_st") || {}).value || "";
  const newEd = (document.getElementById(eid + "_ed") || {}).value || "";
  const newEt = (document.getElementById(eid + "_et") || {}).value || "";
  const pEl = document.querySelector(`input[name="${eid}_p"]:checked`);
  const newPaksha = pEl ? pEl.value : "shukla";
  if (!newSd) {
    toast("Start date required 📅");
    return;
  }

  // Remove old entry and its occasions
  const oldEntry = (App.S.customEkadashi || []).find(
    (e) => _ekDate(e) === oldSd,
  );
  App.S.customEkadashi = (App.S.customEkadashi || []).filter(
    (e) => _ekDate(e) !== oldSd,
  );
  if (App.S.occasions && oldEntry) {
    [oldSd, oldEntry.endDate].filter(Boolean).forEach((d) => {
      if (
        App.S.occasions[d] &&
        (App.S.occasions[d].includes("Ekadashi") ||
          App.S.occasions[d].includes("Mahadvadashi") ||
          (oldEntry.name && App.S.occasions[d].includes(oldEntry.name)))
      )
        delete App.S.occasions[d];
    });
  }

  // Push updated entry first so it's saved even before GPS resolves
  App.S.customEkadashi.push({
    name: newName.trim(),
    paksha: newPaksha,
    startDate: newSd,
    startTime: newSt,
    endDate: newEd || newSd,
    endTime: newEt,
  });
  App.S.customEkadashi.sort((a, b) => (_ekDate(a) < _ekDate(b) ? -1 : 1));

  const lbl =
    (newName.trim() || "Ekadashi") +
    (newPaksha === "shukla" ? " ☀️ Shukla" : " 🌙 Krishna");
  const sf = newSt ? _fmtTime12(newSt) : "",
    ef = newEt ? _fmtTime12(newEt) : "";
  if (!App.S.occasions) App.S.occasions = {};

  function _applyEditFasting(sunriseH) {
    // Arunodaya (Brahmamuhurta start) = 96 min before actual sunrise
    const arunodayaH = sunriseH - 96 / 60;
    let fastingDate = newSd,
      isViddha = false;
    const parampara = App.S.ekParampara || "smarta";
    if (newSt && newEd && newEd !== newSd) {
      const [h, m] = newSt.split(":").map(Number),
        ekH = h + m / 60;
      if (parampara === "vaishnava" && ekH >= arunodayaH) {
        fastingDate = newEd;
        isViddha = true;
      } else if (parampara === "smarta" && ekH >= sunriseH) fastingDate = newEd;
    }
    const tnote = isViddha
      ? " (Mahadvadashi · Arunodaya Viddha · Sunrise " +
        fmtHour(sunriseH) +
        " / Arunodaya " +
        fmtHour(arunodayaH) +
        ")"
      : sf
        ? " " +
          sf +
          (ef ? "–" + ef : "") +
          " (Sunrise " +
          fmtHour(sunriseH) +
          ")"
        : "";
    App.S.occasions[fastingDate] = lbl + tnote;
    App.save();
    fbDebouncedPush();
    renderEkadashiList();
    renderCal();
    toast(
      "Ekadashi updated ✅ (Sunrise " +
        fmtHour(sunriseH) +
        ", Arunodaya " +
        fmtHour(arunodayaH) +
        ")",
    );
  }

  // Get real GPS sunrise for the (new) Ekadashi start date
  if (navigator.geolocation) {
    toast("📍 Getting GPS for sunrise…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ekDate = new Date(newSd + "T00:00:00");
        const srData = calcSunTimes(
          pos.coords.latitude,
          pos.coords.longitude,
          ekDate,
        );
        _applyEditFasting(srData ? srData.sunriseH : 6.0);
      },
      () => {
        toast("⚠️ GPS unavailable, using 06:00 sunrise fallback");
        _applyEditFasting(6.0);
      },
      { timeout: 8000, maximumAge: 3600000 },
    );
  } else {
    _applyEditFasting(6.0);
  }
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
  toast("Start date updated 🛡️");
}
function initBrahmaStartInput() {
  const el = document.getElementById("brahmaStartInput");
  if (el) el.value = getBrahmaStart();
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
  const parts = key.split("-"),
    label =
      String(parseInt(parts[2])).padStart(2, "0") +
      ":" +
      String(parseInt(parts[1])).padStart(2, "0") +
      ":" +
      parts[0];
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
      ? (App.S.historyHK[key] || 0)
      : (App.S.history[key] || 0) + (App.S.historyRV[key] || 0),
      timeSec = _isG
        ? (App.S.timerHistoryHK[key] || 0)
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
        .replace(/\s*\(Mahadvadashi[^)]*\)/g, "") // remove Mahadvadashi note
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
          `<span style="font-size:11px;color:rgba(255,255,255,0.28);margin-left:8px">${p.gaurabdaYear} Gaurabda</span><br>` +
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

  // Use saved GPS coords if available, else try to get location
  const savedLat = App.S && App.S.lastLat;
  const savedLng = App.S && App.S.lastLng;
  if (savedLat && savedLng) {
    _renderWithLatLng(savedLat, savedLng);
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => _renderWithLatLng(pos.coords.latitude, pos.coords.longitude),
      () => _renderWithLatLng(23.0, 89.5), // Bangladesh fallback
      { timeout: 8000, maximumAge: 3600000 },
    );
  } else {
    _renderWithLatLng(23.0, 89.5); // fallback
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
  const hkTime  = App.S.timerHistoryHK[key] || 0;
  const hkMalas = Math.floor(hkCount / ms);
  const hkJapEl = document.getElementById("cdmoHkJap");
  if (hkJapEl) hkJapEl.textContent = hkCount > 0
    ? hkCount + " jap · " + hkMalas + " malas" : "—";
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
    ? (App.S.historyHK[key] || 0)
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
  // NOAA Solar Calculator algorithm — accurate to within ~1 minute
  // Anchors Julian Day at integer noon to eliminate time-of-day drift
  const rad = Math.PI / 180;
  const JD = Math.floor(date.getTime() / 86400000) + 2440587.5 + 0.5; // JD at noon UTC for this date
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

  // Hour angle at sunrise / sunset (90.833° = centre of sun + atmospheric refraction)
  const cosHA =
    (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) /
    (Math.cos(lat * rad) * Math.cos(dec));
  if (cosHA > 1 || cosHA < -1) return null; // polar night / midnight sun

  const HA = Math.acos(cosHA) / rad; // degrees

  // Solar noon, sunrise, sunset — all in UTC minutes from midnight
  const solarNoonUTC = 720 - 4 * lng - eqT;
  const sunriseUTC = solarNoonUTC - HA * 4;
  const sunsetUTC = solarNoonUTC + HA * 4;

  // UTC minutes → local decimal hours using device timezone offset
  const tzOffMin = -date.getTimezoneOffset(); // positive = east of UTC
  function toLocalH(utcMin) {
    return ((((utcMin + tzOffMin) / 60) % 24) + 24) % 24;
  }

  const sunriseH = toLocalH(sunriseUTC);
  const sunsetH = toLocalH(sunsetUTC);

  function fmtH(h) {
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
      String(h12).padStart(2, "0") +
      ":" +
      String(mm).padStart(2, "0") +
      " " +
      ap
    );
  }
  return { sunriseH, sunsetH, sunrise: fmtH(sunriseH), sunset: fmtH(sunsetH) };
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
  const bmStart = times.sunriseH - 96 / 60,
    bmEnd = times.sunriseH - 46 / 60;
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
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude,
          lng = pos.coords.longitude;
        // Save for panchang use
        if (App.S) {
          App.S.lastLat = lat;
          App.S.lastLng = lng;
        }
        updateSunInfo(lat, lng);
        setInterval(() => updateSunInfo(lat, lng), 600000);
      },
      () => updateSunInfo(23.8103, 90.4125),
      { timeout: 8000, maximumAge: 3600000 },
    );
  } else updateSunInfo(23.8103, 90.4125);
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
        start_url: "./index.html",
        scope: "./",
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
  // Restore wall-clock mala start for cross-session timing (fallback only)
  const savedMalaWall = localStorage.getItem("rjap_malaWallStart");
  const todayCount = App.gTod();
  const ms = App.S.ms || 108;
  const countInCurrentMala = todayCount % ms;
  if (savedMalaWall && countInCurrentMala > 0) {
    App.malaWallStart = parseInt(savedMalaWall);
  } else {
    App.malaWallStart = Date.now();
    localStorage.setItem("rjap_malaWallStart", String(App.malaWallStart));
  }
  document.getElementById("timerDisplay").textContent = "00:00:00";

  // Apply settings UI
  if (App.S.cfg.vib) document.getElementById("tgVib").classList.add("on");
  if (App.S.cfg.sound) document.getElementById("tgSnd").classList.add("on");

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
  // Migrate any legacy two-date Ekadashi occasions to single fasting date
  _cleanLegacyEkadashiOccasions();
  // Persist the cleaned occasions immediately
  App.save();
  fbDebouncedPush();

  // Hide loading — guaranteed cleanup
  setTimeout(() => {
    const ls = document.getElementById("ls");
    if (ls) {
      ls.classList.add("hide");
      setTimeout(() => {
        if (ls.parentNode) ls.parentNode.removeChild(ls);
      }, 900);
    }
  }, 2800);
});

// Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((r) => {
        console.log("SW registered:", r.scope);
        // When a new SW takes over, reload the page to get fresh files
        r.addEventListener("updatefound", () => {
          const newWorker = r.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "activated") {
              console.log(
                "[SW] New SW activated — reloading for fresh content",
              );
              window.location.reload();
            }
          });
        });
      })
      .catch((e) => console.warn("SW registration failed:", e.message));

    // Also listen for SW_UPDATED message from the service worker
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "SW_UPDATED") {
        console.log("[SW] Received SW_UPDATED, reloading…", e.data.version);
        window.location.reload();
      }
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

// ── showLyrics function ──
function showLyrics(id) {
  const ly = getEffectiveLyrics(id);
  if (!ly) {
    toast("পাঠ্য পাওয়া যায়নি 🙏");
    return;
  }
  const allSt = [
    ...STLIST,
    ...(_globalStotrams || []),
    ...(App.S.customSt || []),
  ];
  const nm = allSt.find((x) => x.id === id);
  document.getElementById("lmTitle").textContent = nm ? nm.name : id;
  document.getElementById("lyrBody").textContent = ly;
  document.getElementById("lmo").classList.add("show");
  document.getElementById("lmb").scrollTop = 0;
}
function closeLyrics() {
  document.getElementById("lmo").classList.remove("show");
}

// ═══════════════════════════════════════════════════════
// DAILY REMINDERS — Brahma Muhurta, Sandhyakal, Manual
// ═══════════════════════════════════════════════════════
const REM_KEY = "radhaJapReminders_v2";
const remTimers = { brahma: null, sandhya: null, manual: null };

function showPwaGuide() {
  document.getElementById("pwaMo").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closePwaGuide() {
  document.getElementById("pwaMo").classList.remove("show");
  document.body.style.overflow = "";
}

function getRemCfg() {
  try {
    return JSON.parse(localStorage.getItem(REM_KEY)) || {};
  } catch {
    return {};
  }
}
function saveRemCfg(cfg) {
  localStorage.setItem(REM_KEY, JSON.stringify(cfg));
}

async function fetchSunTimes(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=auto&forecast_days=2`;
  const r = await fetch(url);
  const d = await r.json();
  return {
    sunrise: [new Date(d.daily.sunrise[0]), new Date(d.daily.sunrise[1])],
    sunset: [new Date(d.daily.sunset[0]), new Date(d.daily.sunset[1])],
  };
}

function brahmaNotifyTime(sunrise) {
  return new Date(sunrise.getTime() - 101 * 60 * 1000);
}
function sandhyaNotifyTime(sunset) {
  return new Date(sunset.getTime() - 5 * 60 * 1000);
}

function fmt12(date) {
  let h = date.getHours(),
    m = date.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

async function loadSunTimes(forceRefresh) {
  const cfg = getRemCfg();
  const now = Date.now();
  const cached = cfg.sunCache;
  const locEl = document.getElementById("remLocStatus");

  if (!forceRefresh && cached && now - cached.ts < 6 * 3600 * 1000) {
    applySunCache(cached);
    return cached;
  }

  if (locEl) locEl.textContent = "📍 Detecting location…";

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      if (locEl) locEl.textContent = "⚠️ GPS not available on this device";
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const sun = await fetchSunTimes(lat, lon);
          const cache = {
            ts: now,
            lat,
            lon,
            sunrise0: sun.sunrise[0].toISOString(),
            sunrise1: sun.sunrise[1].toISOString(),
            sunset0: sun.sunset[0].toISOString(),
            sunset1: sun.sunset[1].toISOString(),
          };
          cfg.sunCache = cache;
          saveRemCfg(cfg);
          applySunCache(cache);
          if (locEl)
            locEl.textContent = "📍 Location detected · Times update daily";
          resolve(cache);
        } catch (e) {
          if (locEl)
            locEl.textContent = "⚠️ Could not fetch sun times. Check internet.";
          resolve(null);
        }
      },
      () => {
        if (locEl) locEl.textContent = "⚠️ Location permission denied";
        resolve(null);
      },
      { timeout: 10000 },
    );
  });
}

function applySunCache(cache) {
  if (!cache) return;
  const sr0 = new Date(cache.sunrise0);
  const ss0 = new Date(cache.sunset0);
  const bTime = brahmaNotifyTime(sr0);
  const sTime = sandhyaNotifyTime(ss0);
  const btEl = document.getElementById("remTimeBrahma");
  const stEl = document.getElementById("remTimeSandhya");
  if (btEl)
    btEl.textContent = `Notify at ${fmt12(bTime)} · Sunrise ${fmt12(sr0)}`;
  if (stEl)
    stEl.textContent = `Notify at ${fmt12(sTime)} · Sunset ${fmt12(ss0)}`;
}

function scheduleType(type, cfg) {
  if (remTimers[type]) {
    clearTimeout(remTimers[type]);
    remTimers[type] = null;
  }
  if (!cfg[type] || !cfg[type].enabled) return;

  function arm() {
    const now = new Date();
    let fireAt = null;

    if (type === "manual") {
      const [h, m] = (cfg.manual.time || "06:00").split(":").map(Number);
      fireAt = new Date();
      fireAt.setHours(h, m, 0, 0);
      if (fireAt <= now) fireAt.setDate(fireAt.getDate() + 1);
    } else {
      const cache = cfg.sunCache;
      if (!cache) return;
      const sr0 = new Date(cache.sunrise0),
        sr1 = new Date(cache.sunrise1);
      const ss0 = new Date(cache.sunset0),
        ss1 = new Date(cache.sunset1);
      if (type === "brahma") {
        fireAt = brahmaNotifyTime(sr0);
        if (fireAt <= now) fireAt = brahmaNotifyTime(sr1);
      } else {
        fireAt = sandhyaNotifyTime(ss0);
        if (fireAt <= now) fireAt = sandhyaNotifyTime(ss1);
      }
    }

    if (!fireAt) return;
    const delay = fireAt - Date.now();
    remTimers[type] = setTimeout(
      () => {
        fireReminder(type);
        setTimeout(() => {
          const c = getRemCfg();
          if (c[type]?.enabled) {
            if (type !== "manual")
              loadSunTimes(true).then(() => scheduleType(type, getRemCfg()));
            else scheduleType(type, c);
          }
        }, 5000);
      },
      Math.max(delay, 1000),
    );
  }
  arm();
}

function fireReminder(type) {
  if (Notification.permission !== "granted") return;
  const titles = {
    brahma: "ब्रह्म मुहूर्त 🌄",
    sandhya: "संध्याकाल 🌅",
    manual: "राधे राधे 🙏",
  };
  const bodies = {
    brahma:
      "Brahma Muhurta begins — the most auspicious time for Naam Jap. राधे राधे!",
    sandhya: "Sandhyakal is here — time for your evening Naam Jap. राधे राधे!",
    manual: "Time for your daily Jap! Begin your naam jap. राधे राधे 🙏",
  };
  // Use Service Worker to show notification (required for mobile/Ulaa)
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SHOW_NOTIFICATION",
      title: titles[type],
      body: bodies[type],
      tag: `radha-jap-${type}`,
    });
  } else {
    // Fallback for desktop browsers
    const n = new Notification(titles[type], {
      body: bodies[type],
      tag: `radha-jap-${type}`,
      renotify: true,
      vibrate: [200, 100, 200],
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }
}

async function toggleReminderType(type) {
  if (!("Notification" in window)) {
    showPwaGuide();
    return;
  }
  const cfg = getRemCfg();
  const isOn = cfg[type]?.enabled;

  if (isOn) {
    cfg[type] = { ...(cfg[type] || {}), enabled: false };
    saveRemCfg(cfg);
    updateReminderUI(type, false, cfg);
    if (remTimers[type]) {
      clearTimeout(remTimers[type]);
      remTimers[type] = null;
    }
    const label =
      type === "brahma"
        ? "Brahma Muhurta"
        : type === "sandhya"
          ? "Sandhyakal"
          : "Custom";
    toast(`${label} reminder off`);
  } else {
    const perm =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (perm !== "granted") {
      showPwaGuide();
      return;
    }
    if (type !== "manual") {
      const cache = await loadSunTimes(false);
      if (!cache) {
        toast("Could not get location. Please allow GPS access.");
        return;
      }
    }
    if (!cfg[type]) cfg[type] = {};
    cfg[type].enabled = true;
    if (type === "manual" && !cfg.manual?.time) cfg.manual.time = "06:00";
    saveRemCfg(cfg);
    updateReminderUI(type, true, cfg);
    scheduleType(type, cfg);
    const label =
      type === "brahma"
        ? "🌄 Brahma Muhurta"
        : type === "sandhya"
          ? "🌅 Sandhyakal"
          : "🕐 Custom";
    toast(`${label} reminder on!`);
  }
}

function saveManualReminderTime() {
  const time = document.getElementById("reminderTimeIn").value;
  if (!time) {
    toast("Please select a time");
    return;
  }
  const cfg = getRemCfg();
  if (!cfg.manual) cfg.manual = {};
  cfg.manual.time = time;
  cfg.manual.enabled = true;
  saveRemCfg(cfg);
  updateReminderUI("manual", true, cfg);
  scheduleType("manual", cfg);
  toast("Custom reminder saved 🙏");
}

function updateReminderUI(type, on, cfg) {
  const tgMap = {
    brahma: "tgBrahma",
    sandhya: "tgSandhya",
    manual: "tgManual",
  };
  const tg = document.getElementById(tgMap[type]);
  if (tg) on ? tg.classList.add("on") : tg.classList.remove("on");

  if (type === "manual") {
    const row = document.getElementById("reminderTimeRow");
    const timeEl = document.getElementById("remTimeManual");
    if (row) row.style.display = on ? "flex" : "none";
    if (timeEl) {
      const t = cfg.manual?.time;
      if (on && t) {
        const [h, m] = t.split(":").map(Number);
        const ap = h >= 12 ? "PM" : "AM",
          h12 = h % 12 || 12;
        timeEl.textContent = `${h12}:${String(m).padStart(2, "0")} ${ap} daily`;
      } else {
        timeEl.textContent = "Not set";
      }
    }
  }
}

async function initReminderUI() {
  const cfg = getRemCfg();
  ["brahma", "sandhya", "manual"].forEach((type) =>
    updateReminderUI(type, !!cfg[type]?.enabled, cfg),
  );
  if (cfg.manual?.time)
    document.getElementById("reminderTimeIn").value = cfg.manual.time;
  if (cfg.sunCache) applySunCache(cfg.sunCache);
  if (cfg.brahma?.enabled || cfg.sandhya?.enabled) {
    await loadSunTimes(false);
  } else {
    const locEl = document.getElementById("remLocStatus");
    if (locEl)
      locEl.textContent =
        "Enable Brahma Muhurta or Sandhyakal to auto-detect times";
  }
}

(function restoreAllReminders() {
  if (Notification.permission !== "granted") return;
  const cfg = getRemCfg();
  ["brahma", "sandhya", "manual"].forEach((type) => {
    if (cfg[type]?.enabled) scheduleType(type, cfg);
  });
})();

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
  try {
    const d = localStorage.getItem("rjap_milestones");
    return d ? JSON.parse(d) : { reached: {}, lastChecked: 0 };
  } catch (e) {
    return { reached: {}, lastChecked: 0 };
  }
}

function saveMilestoneData(data) {
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
  const start = new Date(saved);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  const days = Math.floor(diff / 86400000);
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

function histPreset(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  document.getElementById("histFrom").value = _ldk(from);
  document.getElementById("histTo").value = _ldk(to);
}

function histPresetMonth() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById("histFrom").value = _ldk(from);
  document.getElementById("histTo").value = _ldk(now);
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
    tr.style.cssText =
      "border-bottom:1px solid rgba(255,215,0,0.07);cursor:pointer;transition:background 0.15s";
    tr.onmouseenter = () => (tr.style.background = "rgba(255,215,0,0.06)");
    tr.onmouseleave = () => (tr.style.background = "");
    tr.onclick = () => showHistDay(tk);

    const radhaStr =
      radha > 0
        ? radhaM +
          'm <span style="font-size:10px;color:var(--td)">(' +
          radha +
          ")</span>"
        : '<span style="color:rgba(255,255,255,0.15)">—</span>';
    const rvStr =
      rv > 0
        ? rvM +
          'm <span style="font-size:10px;color:var(--td)">(' +
          rv +
          ")</span>"
        : '<span style="color:rgba(255,255,255,0.15)">—</span>';
    const hkStr =
      hk > 0
        ? hkM +
          'm <span style="font-size:10px;color:var(--td)">(' +
          hk +
          ")</span>"
        : '<span style="color:rgba(255,255,255,0.15)">—</span>';
    const n28Str =
      taps28 > 0
        ? cyc28 +
          'c <span style="font-size:10px;color:var(--td)">(' +
          taps28 +
          ")</span>"
        : '<span style="color:rgba(255,255,255,0.15)">—</span>';

    if (isGaudiya) {
      tr.innerHTML = `
        <td style="padding:8px 10px;color:var(--tl);white-space:nowrap;font-size:11px">${_histFmtDate(tk)}</td>
        <td class="hist-hk-col" style="padding:8px 6px;text-align:center;color:#6DB8FF">${hkStr}</td>
        <td style="padding:8px 6px;text-align:center;color:var(--td);font-size:11px;white-space:nowrap">${_histFmtSec(totalSec)}</td>
      `;
    } else {
      tr.innerHTML = `
        <td style="padding:8px 10px;color:var(--tl);white-space:nowrap;font-size:11px">${_histFmtDate(tk)}</td>
        <td class="hist-radha-col" style="padding:8px 6px;text-align:center;color:var(--gold)">${radhaStr}</td>
        <td class="hist-radha-col" style="padding:8px 6px;text-align:center;color:var(--a2)">${rvStr}</td>
        <td class="hist-radha-col" style="padding:8px 6px;text-align:center;color:var(--green)">${n28Str}</td>
        <td style="padding:8px 6px;text-align:center;color:var(--td);font-size:11px;white-space:nowrap">${_histFmtSec(totalSec)}</td>
      `;
    }
    tbody.appendChild(tr);
  });

  if (activeDays === 0) {
    sumLine.textContent = "No jap recorded in this date range.";
    wrap.style.display = "none";
    return;
  }

  sumLine.textContent =
    activeDays +
    " active day" +
    (activeDays > 1 ? "s" : "") +
    " in range · tap a row for details";
  wrap.style.display = "block";

  // Totals row
  const totRadhaM = Math.floor(totRadha / ms);
  const totRVM = Math.floor(totRV / ms);
  const totHKM = Math.floor(totHK / ms);
  const totCyc28 = Math.floor(tot28taps / 28);
  const grandTotal = totTimeSec + totTimeSec28;
  if (isGaudiya) {
    totDiv.innerHTML = `
      <div style="color:var(--gold);font-weight:700;font-size:11px;letter-spacing:1px;margin-bottom:6px;text-transform:uppercase">📊 Period Totals (Gaudiya)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:12px">
        <div style="color:#6DB8FF">HK Jap: <strong>${totHKM} malas</strong> <span style="color:var(--td);font-size:10px">(${totHK})</span></div>
        <div style="color:var(--tl)">Total Time: <strong>${_histFmtSec(grandTotal)}</strong></div>
        <div style="color:var(--td);font-size:11px">HK Time: ${_histFmtSec(window._ptHKSec || 0)}</div>
      </div>
    `;
  } else {
    totDiv.innerHTML = `
      <div style="color:var(--gold);font-weight:700;font-size:11px;letter-spacing:1px;margin-bottom:6px;text-transform:uppercase">📊 Period Totals</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:12px">
        <div style="color:var(--gold)">Radha Jap: <strong>${totRadhaM} malas</strong> <span style="color:var(--td);font-size:10px">(${totRadha})</span></div>
        <div style="color:var(--a2)">RV Jap: <strong>${totRVM} malas</strong> <span style="color:var(--td);font-size:10px">(${totRV})</span></div>
        <div style="color:var(--green)">28 Names: <strong>${totCyc28} cycles</strong> <span style="color:var(--td);font-size:10px">(${tot28taps} taps)</span></div>
        <div style="color:var(--tl)">Total Time: <strong>${_histFmtSec(grandTotal)}</strong></div>
        <div style="color:var(--td);font-size:11px">Radha Time: ${_histFmtSec(window._ptRadhaSec || 0)}</div>
        <div style="color:var(--td);font-size:11px">RV Time: ${_histFmtSec(window._ptRVSec || 0)}</div>
        <div style="color:var(--td);font-size:11px">28 Names Time: ${_histFmtSec(totTimeSec28)}</div>
      </div>
    `;
  }
}

function showHistDay(tk) {
  const detail = document.getElementById("histDayDetail");
  const title = document.getElementById("histDayTitle");
  const content = document.getElementById("histDayContent");

  title.textContent = _histFmtDate(tk);
  detail.style.display = "block";
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const ms = App.S.ms || 108;
  const radha = App.S.history[tk] || 0;
  const rv = App.S.historyRV[tk] || 0;
  const taps28 = App.S.h28[tk] || 0;
  const tSecR = App.S.timerHistory[tk] || 0;
  const tSecRV = App.S.timerHistoryRV[tk] || 0;
  const t28Sec = App.S.timer28History[tk] || 0;

  const radhaM = Math.floor(radha / ms);
  const rvM = Math.floor(rv / ms);
  const cyc28 = Math.floor(taps28 / 28);
  const isToday = tk === App.S.tk;

  let html = "";

  // ── Day Summary ──
  html += `<div style="background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.15);border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12px;font-family:Inter,sans-serif">`;
  html += `<div style="font-size:10px;color:var(--gold);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;font-weight:600">Day Summary</div>`;
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px">`;
  // ── TIME FIX: Always use timerHistory (syncTimerFromMalaLog keeps it authoritative).
  // Previous isToday override caused mismatch when manual jap+time was added to today.
  const tSecR_disp = tSecR;
  const tSecRV_disp = tSecRV;
  if (radha > 0)
    html += `<div style="color:var(--gold)">Radha: <strong>${radhaM} mala</strong> (${radha}) · ${_histFmtSec(tSecR_disp)}</div>`;
  if (rv > 0)
    html += `<div style="color:var(--a2)">RV: <strong>${rvM} mala</strong> (${rv}) · ${_histFmtSec(tSecRV_disp)}</div>`;
  if (taps28 > 0)
    html += `<div style="color:var(--green)">28 Names: <strong>${cyc28} cycles</strong> (${taps28}) · ${_histFmtSec(t28Sec)}</div>`;
  const grand = tSecR_disp + tSecRV_disp + t28Sec;
  if (grand > 0)
    html += `<div style="color:var(--tl)">Total: <strong>${_histFmtSec(grand)}</strong></div>`;
  html += `</div></div>`;

  // ── Per-Mala Detail from activityLog ──
  const log = App.S.activityLog || [];
  const tkPrefix = tk.slice(0, 10);

  // Get mala entries for this day
  const radhaEntries = log.filter(
    (e) =>
      e.t === "mala" && e.mode !== "rv" && _ldk(new Date(e.ts)) === tkPrefix,
  );
  const rvEntries = log.filter(
    (e) =>
      e.t === "mala" && e.mode === "rv" && _ldk(new Date(e.ts)) === tkPrefix,
  );
  const cycleEntries = log.filter(
    (e) => e.t === "28cycle" && _ldk(new Date(e.ts)) === tkPrefix,
  );

  const hasDetail =
    radhaEntries.length > 0 || rvEntries.length > 0 || cycleEntries.length > 0;

  if (!hasDetail && !isToday) {
    html += `<div style="font-size:11px;color:var(--td);text-align:center;padding:8px 0">Per-mala detail not available for this date<br><span style="font-size:10px">(activity log only keeps recent sessions)</span></div>`;
  }

  if (radhaEntries.length > 0) {
    html += _histMalaTable(
      "🌸 Radha Jap — Per Mala",
      radhaEntries,
      "var(--gold)",
    );
  }
  if (rvEntries.length > 0) {
    html += _histMalaTable("🔵 RV Jap — Per Mala", rvEntries, "var(--a2)");
  }
  if (cycleEntries.length > 0) {
    html += _hist28CycleTable(cycleEntries);
  }

  // Today: also show from malaLog (more complete, has all malas even if log is short)
  if (
    isToday &&
    radhaEntries.length === 0 &&
    (App.S.malaLog || []).length > 0
  ) {
    html += _histTodayMalaLogTable(
      "🌸 Radha Jap — Today's Malas",
      App.S.malaLog,
      "var(--gold)",
    );
  }
  if (isToday && rvEntries.length === 0 && (App.S.malaLogRV || []).length > 0) {
    html += _histTodayMalaLogTable(
      "🔵 RV Jap — Today's Malas",
      App.S.malaLogRV,
      "var(--a2)",
    );
  }

  content.innerHTML = html;
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

// ══════════════════════════════════════════════════════
// ── Annual Ekadashi Calendar (2025/2026/2027) ─────────
// ══════════════════════════════════════════════════════

let _annualEkYear = null;
let _annualEkComputing = false;

function toggleAnnualEk(year) {
  const listEl = document.getElementById("annualEkList");
  const statusEl = document.getElementById("annualEkStatus");
  if (!listEl) return;

  // If same year toggled again, hide
  if (_annualEkYear === year && listEl.style.display !== "none") {
    listEl.style.display = "none";
    _annualEkYear = null;
    return;
  }

  _annualEkYear = year;
  listEl.style.display = "block";
  listEl.innerHTML =
    '<div style="font-size:12px;color:rgba(255,255,255,0.4);text-align:center;padding:16px 0;">⏳ Computing ' +
    year +
    " Ekadashis…</div>";
  if (statusEl) statusEl.textContent = "";

  if (_annualEkComputing) return;
  _annualEkComputing = true;

  // Use saved GPS, fallback to India center
  const lat = App.S && App.S.lastLat ? App.S.lastLat : 22.5;
  const lng = App.S && App.S.lastLng ? App.S.lastLng : 78.5;

  setTimeout(function () {
    try {
      const results = _computeYearEkadashis(year, lat, lng);
      _renderAnnualEkList(results, year, listEl, statusEl);
    } catch (e) {
      listEl.innerHTML =
        '<div style="font-size:12px;color:#e8336d;padding:8px;">Error: ' +
        e.message +
        "</div>";
    }
    _annualEkComputing = false;
  }, 30);
}

function _computeYearEkadashis(year, lat, lng) {
  const DAY = 86400000;
  const results = [];
  // Scan from Dec 1 prev year to Jan 15 next year (to catch all Ekadashis in the year)
  const scanStart = new Date(year - 1, 11, 1); // Dec 1 of previous year
  const scanEnd = new Date(year + 1, 0, 15); // Jan 15 of next year

  for (const paksha of ["shukla", "krishna"]) {
    let cur = new Date(scanStart);
    while (cur < scanEnd) {
      const wStart = new Date(cur);
      const wEnd = new Date(cur.getTime() + 17 * DAY);
      const ek = _findEkInWindow(wStart, wEnd, paksha);
      if (ek && ek.ekStart.getFullYear() === year) {
        const mi = ek.ekStart.getMonth();
        const ekDateStr = ek.ekStart.toISOString().slice(0, 10);
        const adhikWin = _getAdhikMaasWindow
          ? _getAdhikMaasWindow(ekDateStr)
          : null;
        let name;
        if (adhikWin) {
          name = paksha === "shukla" ? "Padmini" : "Parama";
        } else {
          name =
            paksha === "shukla"
              ? _EK_NAMES_SHUKLA[mi] || "Ekadashi"
              : _EK_NAMES_KRISHNA[mi] || "Ekadashi";
        }
        const resolved = _resolveEkFasting(ek, lat, lng, name);
        // Compute parana window
        const parana = _computeParanaWindow(ek, lat, lng, resolved.fastingDate);
        results.push({ ...resolved, parana });
      }
      cur.setTime(cur.getTime() + 15 * DAY);
    }
  }

  // Sort by fasting date
  results.sort((a, b) => (a.fastingDate < b.fastingDate ? -1 : 1));

  // Remove duplicates (same fastingDate)
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.fastingDate)) return false;
    seen.add(r.fastingDate);
    return true;
  });
}

// Compute Parana (fast-breaking) window:
// Parana is on the day AFTER the fasting date, between sunrise and 1/5 of daytime
// OR before Dvadashi tithi ends (whichever comes first)
// Returns { date, windowStart, windowEnd } all as hh:mm strings
function _computeParanaWindow(ek, lat, lng, fastingDate) {
  try {
    // Parana day = day after fasting day
    const [fy, fm, fd] = fastingDate.split("-").map(Number);
    const paranaDay = new Date(fy, fm - 1, fd + 1);
    const srData = calcSunTimes(lat, lng, paranaDay);
    if (!srData) return null;
    const srH = srData.sunriseH; // decimal hours
    const ssH = srData.sunsetH;
    // 1/5 of daytime
    const dayLen = ssH - srH;
    const fifthDay = srH + dayLen / 5;
    // Dvadashi ends roughly when next tithi (Trayodashi) starts
    // Approximation: Dvadashi lasts ~24h after Ekadashi ends
    const dvadashiEndH = ek.ekEnd
      ? ek.ekEnd.getHours() + ek.ekEnd.getMinutes() / 60
      : null;

    // Parana window: sunrise → min(1/5 of day, dvadashi end if same day)
    let windowEnd = fifthDay;
    if (dvadashiEndH !== null) {
      // If Dvadashi ends before 1/5 of day on parana day, parana must finish before that
      windowEnd = Math.min(fifthDay, dvadashiEndH);
    }
    // But parana can't start before sunrise
    const windowStart = srH;

    return {
      date:
        paranaDay.getFullYear() +
        "-" +
        String(paranaDay.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(paranaDay.getDate()).padStart(2, "0"),
      windowStart: _decHToHHMM(windowStart),
      windowEnd: _decHToHHMM(windowEnd),
    };
  } catch (e) {
    return null;
  }
}

function _decHToHHMM(h) {
  const hh = Math.floor(h),
    mm = Math.round((h - hh) * 60);
  return String(hh).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0");
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

function _renderAnnualEkList(results, year, listEl, statusEl) {
  if (!results.length) {
    listEl.innerHTML =
      '<div style="font-size:12px;color:rgba(255,255,255,0.4);text-align:center;padding:10px;">No Ekadashis found for ' +
      year +
      "</div>";
    return;
  }
  const parampara = App.S.ekParampara || "smarta";
  const paramTag =
    parampara === "vaishnava"
      ? '<span style="font-size:8px;background:rgba(74,144,226,0.2);color:#6DB8FF;border-radius:4px;padding:1px 5px;">Vaishnava</span>'
      : '<span style="font-size:8px;background:rgba(46,204,113,0.15);color:#2ecc71;border-radius:4px;padding:1px 5px;">Smarta</span>';

  listEl.innerHTML = results
    .map((r) => {
      const pLabel =
        r.paksha === "shukla"
          ? '<span style="font-size:9px;background:rgba(241,196,15,0.2);color:#F1C40F;border-radius:4px;padding:2px 5px;font-weight:700;">☀️ SHUKLA</span>'
          : '<span style="font-size:9px;background:rgba(155,89,182,0.25);color:#BD93F9;border-radius:4px;padding:2px 5px;font-weight:700;">🌙 KRISHNA</span>';
      const viddhaTag = r.isViddha
        ? ' <span style="font-size:8px;background:rgba(255,152,0,0.2);color:#FF9800;border-radius:4px;padding:1px 5px;">Mahadvadashi</span>'
        : "";

      const paranaHtml = r.parana
        ? `<div style="font-size:10px;color:#FFD700;margin-top:3px;">🌅 Parana: ${_fmtDateDMY(r.parana.date)} · ${_fmtTime12(r.parana.windowStart)}–${_fmtTime12(r.parana.windowEnd)}</div>`
        : "";

      return `<div style="background:rgba(74,144,226,0.07);border:1px solid rgba(74,144,226,0.18);border-radius:10px;padding:9px 11px;margin-bottom:7px;">
      <div style="font-size:11px;color:#6DB8FF;font-weight:700;margin-bottom:2px;">${r.name} ${pLabel}${viddhaTag}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.45);">Tithi: ${_fmtDateDMY(r.startDate)} ${r.startTime ? "· " + _fmtTime12(r.startTime) : ""}</div>
      <div style="font-size:10px;color:#76ff7a;font-weight:600;margin-top:2px;">🌙 Fast: ${_fmtDateDMY(r.fastingDate)} ${paramTag}</div>
      ${paranaHtml}
    </div>`;
    })
    .join("");

  if (statusEl)
    statusEl.textContent =
      "✅ " +
      results.length +
      " Ekadashis for " +
      year +
      (App.S.lastLat ? " (GPS location)" : " (default location)");
}
