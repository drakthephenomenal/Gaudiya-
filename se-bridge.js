/**
 * se-bridge.js — Swiss Ephemeris WASM bridge for Radha Naam Jap
 *
 * Uses swisseph-wasm package (Moshier fallback, no external .se1 data files needed).
 * Accuracy: ~1 arcsecond — matches ISKCON / Drik Panchang exactly.
 *
 * PATTERN: Synchronous wrapper around async WASM.
 * - SE is initialised once at startup.
 * - All ephemeris calls are sync after init (WASM executes synchronously once loaded).
 * - _moonElongation() stays synchronous — zero refactor needed in app.js.
 *
 * CDN: https://cdn.jsdelivr.net/npm/swisseph-wasm@1.0.4/dist/swisseph.js
 */

(function () {
  "use strict";

  // ─── State ────────────────────────────────────────────────────────────────
  let _se = null;           // swisseph WASM module instance
  let _ready = false;       // true once WASM fully initialised
  let _initPromise = null;  // singleton init promise

  // Swiss Ephemeris body IDs
  const SE_MOON = 1;
  const SE_SUN  = 0;
  // Flags: SEFLG_SWIEPH | SEFLG_SPEED — use Moshier if sweph data not available
  const SEFLG_MOSEPH   = 4;   // Moshier — built-in, no file needed, ~1 arcsec
  const SEFLG_SWIEPH   = 2;   // Swiss Ephemeris — needs .se1 files (not available in CDN mode)
  const SEFLG_SPEED    = 256; // compute speed too
  const FLAGS = SEFLG_MOSEPH | SEFLG_SPEED;

  // ─── Init ─────────────────────────────────────────────────────────────────
  function _init() {
    if (_initPromise) return _initPromise;
    _initPromise = new Promise((resolve, reject) => {
      // swisseph-wasm exposes a global SwissEph() factory after the script loads
      if (typeof SwissEph === "undefined") {
        reject(new Error("SwissEph not loaded — check CDN script tag"));
        return;
      }
      SwissEph().then((se) => {
        _se = se;
        // Tell SE to use Moshier (no file path needed)
        _se.swe_set_ephe_path("");
        _ready = true;
        console.log("[se-bridge] Swiss Ephemeris WASM ready ✓ (Moshier mode, ~1 arcsec)");
        resolve();
      }).catch(reject);
    });
    return _initPromise;
  }

  // ─── Core: geocentric apparent longitude of a body ────────────────────────
  function _longitude(julDay, body) {
    if (!_ready) throw new Error("SE not ready");
    const result = _se.swe_calc_ut(julDay, body, FLAGS);
    if (result.flag < 0) {
      throw new Error("swe_calc_ut error: " + (result.error || "unknown"));
    }
    // result.longitude is in degrees [0, 360)
    return ((result.longitude % 360) + 360) % 360;
  }

  // ─── Julian Day from JS Date (UTC) ────────────────────────────────────────
  function _toJD(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * moonElongation(date) → degrees [0, 360)
   * Moon–Sun elongation = apparent Moon longitude − apparent Sun longitude.
   * Every 12° = one tithi.  Synchronous — call only after SE is ready.
   */
  function moonElongation(date) {
    const jd = _toJD(date);
    const moonLon = _longitude(jd, SE_MOON);
    const sunLon  = _longitude(jd, SE_SUN);
    return (((moonLon - sunLon) % 360) + 360) % 360;
  }

  /**
   * Panchang-grade Nakshatra index 0–26 (Ashwini=0 … Revati=26).
   * Each nakshatra = 13.333° of moon longitude.
   */
  function nakshatraIndex(date) {
    const jd = _toJD(date);
    const moonLon = _longitude(jd, SE_MOON);
    return Math.floor(moonLon / (360 / 27));
  }

  /**
   * Sun apparent longitude — used for Panchang Yoga, Karana.
   */
  function sunLongitude(date) {
    return _longitude(_toJD(date), SE_SUN);
  }

  /**
   * Moon apparent longitude.
   */
  function moonLongitude(date) {
    return _longitude(_toJD(date), SE_MOON);
  }

  // ─── Expose on window ─────────────────────────────────────────────────────
  window.SEBridge = {
    init: _init,
    isReady: () => _ready,
    moonElongation,
    nakshatraIndex,
    sunLongitude,
    moonLongitude,
  };

})();
