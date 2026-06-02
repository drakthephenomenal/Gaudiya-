// ═══════════════════════════════════════════════════════════════════
//  gaudiya-engine.js — Single source of truth for ALL Ekadashi logic
//
//  Single parampara: Gaudiya / ISKCON (Vaishnava — Arunodaya Viddha).
//  No Smarta branch. No user-selectable parampara.
//
//  Loaded BEFORE app.js. All functions become window globals so the
//  rest of the app (UI rendering, sync, occasions) keeps working
//  unchanged.
//
//  Depends on globals defined elsewhere (loaded earlier):
//    • _moonElongation(date)            — app.js (Swiss Ephemeris / Meeus)
//    • _tithiAtMoment(date)             — app.js
//    • _tithiAtSunrise(day, lat, lng)   — app.js
//    • _findElongCrossing / _didCross   — app.js
//    • _decHToHHMM(h)                   — app.js
//    • calcSunTimes(lat, lng, date)     — app.js
//    • _ADHIK_MAAS_WINDOWS              — panchangData.js
//    • getPanchangData / _nextChange / _tithiIdx — panchangData.js
//
//  Exposes on window:
//    • _resolveMahadvadasiShift
//    • _findEkInWindow
//    • _resolveEkFasting
//    • _findNextPurnima
//    • _getAdjustedMonthIndex
//    • _EK_NAMES_SHUKLA, _EK_NAMES_KRISHNA
//    • _computeParanaWindow
//    • _d2hhmm, _d2ymd
//    • GaudiyaEngine.* (same functions, namespaced)
// ═══════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ─── Date formatting helpers ──────────────────────────────────────
  function _d2hhmm(d) {
    return String(d.getHours()).padStart(2, "0") + ":" +
           String(d.getMinutes()).padStart(2, "0");
  }
  function _d2ymd(d) {
    return d.getFullYear() + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" +
           String(d.getDate()).padStart(2, "0");
  }

  // ─── Ekadashi name tables (Purnimanta lunar monthIdx 0=Chaitra…11=Phalguna) ──
  const _EK_NAMES_SHUKLA = [
    "Kamada",           // 0 = Chaitra
    "Mohini",           // 1 = Vaishakha
    "Nirjala",          // 2 = Jyeshtha
    "Devshayani",       // 3 = Ashadha
    "Shravana Putrada", // 4 = Shravana
    "Parsva",           // 5 = Bhadrapada
    "Papankusha",       // 6 = Ashwin
    "Devutthana",       // 7 = Kartik
    "Mokshada",         // 8 = Margashirsha
    "Pausha Putrada",   // 9 = Pausha
    "Jaya",             // 10 = Magha
    "Amalaki",          // 11 = Phalguna
  ];
  const _EK_NAMES_KRISHNA = [
    "Papamochani", // 0 = Chaitra
    "Varuthini",   // 1 = Vaishakha
    "Apara",       // 2 = Jyeshtha
    "Yogini",      // 3 = Ashadha
    "Kamika",      // 4 = Shravana
    "Aja",         // 5 = Bhadrapada
    "Indira",      // 6 = Ashwin
    "Rama",        // 7 = Kartik
    "Utpanna",     // 8 = Margashirsha
    "Saphala",     // 9 = Pausha
    "Shattila",    // 10 = Magha
    "Vijaya",      // 11 = Phalguna
  ];

  // ─── Purnima-based Purnimanta month resolver ──────────────────────
  // Find the next Full Moon (Purnima) after the Ekadashi date, then map
  // its Gregorian month to the Purnimanta month index. The Ekadashi
  // belongs to the lunar month that ends at that Purnima.
  function _findNextPurnima(fromDate) {
    const DAY = 86400000;
    let prev = global._moonElongation(fromDate);
    const cur = new Date(fromDate);
    const end = new Date(fromDate.getTime() + 30 * DAY);
    while (cur <= end) {
      const next = new Date(cur.getTime() + DAY);
      const e = global._moonElongation(next);
      if (global._didCross(prev, e, 180)) {
        return global._findElongCrossing(180, cur, next);
      }
      prev = e;
      cur.setTime(next.getTime());
    }
    return new Date(fromDate.getTime() + 4 * DAY);
  }

  function _getAdjustedMonthIndex(ekDate /*, paksha kept for call-site compat */) {
    let searchFrom = ekDate;
    let purnima = _findNextPurnima(searchFrom);
    for (let i = 0; i < 3; i++) {
      const pStr = purnima.toISOString().slice(0, 10);
      const inAdhik = (global._ADHIK_MAAS_WINDOWS || []).some(function (w) {
        return pStr >= w.start && pStr <= w.end;
      });
      if (!inAdhik) break;
      searchFrom = new Date(purnima.getTime() + 86400000);
      purnima = _findNextPurnima(searchFrom);
    }
    // Gregorian Purnima month → Purnimanta lunar index:
    // Apr=Chaitra(0), May=Vaishakha(1), Jun=Jyeshtha(2), Jul=Ashadha(3),
    // Aug=Shravana(4), Sep=Bhadrapada(5), Oct=Ashwin(6), Nov=Kartik(7),
    // Dec=Margashirsha(8), Jan=Pausha(9), Feb=Magha(10), Mar=Phalguna(11)
    const gregToLunar = [9,10,11,0,1,2,3,4,5,6,7,8];
    return gregToLunar[purnima.getMonth()] ?? purnima.getMonth();
  }

  // ─── Ekadashi-window scanner (paksha-aware) ───────────────────────
  // Find Ekadashi tithi start/end in a window. Step in 2-hour increments
  // so we never skip a boundary.
  function _findEkInWindow(wStart, wEnd, paksha) {
    const startDeg = paksha === "shukla" ? 120 : 300;
    const endDeg   = paksha === "shukla" ? 132 : 312;
    const STEP = 2 * 60 * 60 * 1000;
    let prev = global._moonElongation(wStart),
      ekStart = null,
      ekEnd   = null;
    const cur = new Date(wStart);
    while (cur <= wEnd) {
      cur.setTime(cur.getTime() + STEP);
      const e = global._moonElongation(cur);
      if (!ekStart && global._didCross(prev, e, startDeg))
        ekStart = global._findElongCrossing(startDeg,
          new Date(cur.getTime() - STEP), new Date(cur));
      if (ekStart && !ekEnd && global._didCross(prev, e, endDeg))
        ekEnd = global._findElongCrossing(endDeg,
          new Date(cur.getTime() - STEP), new Date(cur));
      if (ekStart && ekEnd) break;
      prev = e;
    }
    if (!ekStart) return null;
    if (!ekEnd) ekEnd = new Date(ekStart.getTime() + 90000000);
    return { paksha, ekStart, ekEnd };
  }

  // ═════════════════════════════════════════════════════════════════
  //  MAHADVADASHI CLASSIFIER (Gaudiya / Vaishnava only)
  //  Given the candidate fasting date (Ekadashi at sunrise after
  //  Arunodaya-viddha), returns the FINAL fasting date and type:
  //    • VYANJULI : today=Ekadashi, tomorrow=Dvadashi, day-after=Dvadashi
  //                 (Dvadashi vriddhi). Fast shifts to Dvadashi day.
  //    • TRISPRSA : today=Ekadashi, tomorrow=Trayodashi
  //                 (Dvadashi kshaya). Fast stays; Parana → 1/3 daylight.
  //    • UNMILANI : today=Ekadashi, tomorrow=Ekadashi (Ekadashi vriddhi).
  //                 Fast stays; Parana starts at Ekadashi end.
  // ═════════════════════════════════════════════════════════════════
  function _resolveMahadvadasiShift(fastingDateStr, paksha, lat, lng, currentMhdType) {
    try {
      if (!lat || !lng || !fastingDateStr) {
        return { date: fastingDateStr, isViddha: !!currentMhdType, mhdType: currentMhdType || "NORMAL" };
      }
      const [y, m, d] = fastingDateStr.split("-").map(Number);
      const today = new Date(y, m - 1, d);
      const tomorrow = new Date(y, m - 1, d + 1);
      const dayAfter = new Date(y, m - 1, d + 2);

      const EK = paksha === "shukla" ? 11 : 26;
      const DV = paksha === "shukla" ? 12 : 27;
      const TR = paksha === "shukla" ? 13 : 28;

      const tT = global._tithiAtSunrise(today, lat, lng);
      const tM = global._tithiAtSunrise(tomorrow, lat, lng);
      const tA = global._tithiAtSunrise(dayAfter, lat, lng);

      let mhdType = currentMhdType || "NORMAL";
      let date = fastingDateStr;
      let isViddha = !!currentMhdType;

      if (tT === EK) {
        if (tM === DV && tA === DV) {
          const fd = new Date(y, m - 1, d + 1);
          date = _d2ymd(fd);
          mhdType = "VYANJULI";
          isViddha = true;
        } else if (tM === TR) {
          mhdType = "TRISPRSA";
          isViddha = true;
        } else if (tM === EK) {
          mhdType = "UNMILANI";
          isViddha = true;
        }
      }
      return { date, isViddha, mhdType };
    } catch (_e) {
      return { date: fastingDateStr, isViddha: !!currentMhdType, mhdType: currentMhdType || "NORMAL" };
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  FASTING DATE RESOLVER — Gaudiya Arunodaya-Viddha rule
  //
  //  Fast on the day whose Arunodaya (96 min before apparent sunrise)
  //  falls WITHIN the Ekadashi window (ekStart..ekEnd).
  //   • Ekadashi starts BEFORE Arunodaya of startDate → fast startDate.
  //   • Ekadashi starts AFTER Arunodaya of startDate AND ends after
  //     Arunodaya of endDate → fast endDate (Mahadvadashi).
  //
  //  Verified against ISKCON Mayapur Panjika 2026:
  //   PARAMA  : Ek 11 Jun 01:30, Arun 03:38 → 01:30 < 03:38 → 11 Jun ✅
  //   NIRJALA : Ek 24 Jun 18:44 → 25 Jun 20:41 → Arun 25 Jun 03:41
  //              03:41 < 20:41 → fast 25 Jun ✅
  //   YOGINI  : Ek 10 Jul 08:48 → 11 Jul 05:54 → fast 11 Jul ✅
  // ═════════════════════════════════════════════════════════════════
  function _resolveEkFasting(ek, lat, lng, name) {
    const { paksha, ekStart, ekEnd } = ek;
    const startDate = _d2ymd(ekStart),
      endDate = _d2ymd(ekEnd);
    const startTime = _d2hhmm(ekStart),
      endTime = _d2hhmm(ekEnd);
    const srData = global.calcSunTimes(lat, lng, ekStart);

    // Arunodaya is a physical pre-dawn event — always APPARENT sunrise.
    const apparentSunriseH = srData ? srData.apparentSunriseH : 6.0;
    const arunodayaH       = apparentSunriseH - 96 / 60;

    const ekStartH = ekStart.getHours() + ekStart.getMinutes() / 60;
    let fastingDate = startDate,
      isViddha = false;

    if (ekStartH >= arunodayaH) {
      // startDate Arunodaya is before Ekadashi started → check endDate
      const srEnd = global.calcSunTimes(lat, lng, ekEnd);
      const arunodayaEndH = (srEnd ? srEnd.apparentSunriseH : 6.0) - 96 / 60;
      const ekEndHours = ekEnd.getHours() + ekEnd.getMinutes() / 60;
      if (arunodayaEndH < ekEndHours) {
        fastingDate = endDate;
        isViddha = true;
      }
    }

    // Mahadvadashi shift: Vyanjuli / Trisparsha / Unmilani
    let mhdType = isViddha ? "SUDDHA" : "NORMAL";
    const _shift = _resolveMahadvadasiShift(fastingDate, paksha, lat, lng, mhdType);
    fastingDate = _shift.date;
    isViddha = _shift.isViddha || isViddha;
    mhdType = _shift.mhdType;

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
      mhdType,
      label,
    };
  }

  // ═════════════════════════════════════════════════════════════════
  //  PARANA WINDOW
  //  Gaudiya rule: sunrise (or end of Hari-Vāsara, whichever is later)
  //  → recommended end = sunrise + 1/3 × apparent daytime (prātaḥ-kāla),
  //  hard-clamped by Dvadashi tithi end.
  // ═════════════════════════════════════════════════════════════════
  function _computeParanaWindow(ek, lat, lng, fastingDate) {
    try {
      const [fy, fm, fd] = fastingDate.split("-").map(Number);
      let paranaDay = new Date(fy, fm - 1, fd + 1);

      // If Dvadashi spans the entire paranaDay (ends after sunset),
      // parana advances to day+2.
      if (ek.ekEnd instanceof Date) {
        const dvEndDeg   = ek.paksha === "shukla" ? 144 : 324;
        const searchLo   = new Date(ek.ekEnd.getTime() + 60000);
        const searchHi   = new Date(ek.ekEnd.getTime() + 30 * 3600000);
        const dvEndTest  = global._findElongCrossing(dvEndDeg, searchLo, searchHi);
        if (dvEndTest) {
          const parSrData  = global.calcSunTimes(lat, lng, paranaDay);
          const parSunsetH = parSrData ? parSrData.apparentSunsetH : 18.5;
          const parSunsetMs = paranaDay.getTime()
            - paranaDay.getHours() * 3600000
            - paranaDay.getMinutes() * 60000
            - paranaDay.getSeconds() * 1000
            + parSunsetH * 3600000;
          const dvEndSameDay =
            dvEndTest.getFullYear() === paranaDay.getFullYear() &&
            dvEndTest.getMonth()    === paranaDay.getMonth()    &&
            dvEndTest.getDate()     === paranaDay.getDate();
          const dvEndAfterParanaDay = dvEndTest.getTime() > paranaDay.getTime() + 24*3600000;
          if ((dvEndSameDay && dvEndTest.getTime() > parSunsetMs) || dvEndAfterParanaDay) {
            paranaDay = new Date(fy, fm - 1, fd + 2);
          }
        }
      }

      const srData = global.calcSunTimes(lat, lng, paranaDay);
      if (!srData) return null;

      // Dvadashi end
      let dvadashiEndDt = null;
      if (ek.ekEnd instanceof Date) {
        const dvEndDeg  = ek.paksha === "shukla" ? 144 : 324;
        const searchLo  = new Date(ek.ekEnd.getTime() + 60000);
        const searchHi  = new Date(ek.ekEnd.getTime() + 30 * 3600000);
        dvadashiEndDt   = global._findElongCrossing(dvEndDeg, searchLo, searchHi);
      }

      const sunriseH = srData.sunriseH;
      let windowStart = sunriseH;
      let hariVasaraEndH = null;
      const mhdType = ek.mhdType || "NORMAL";

      // UNMILANI (Ekadashi vriddhi): parana sunrise still Ekadashi →
      // push start to Ekadashi-end on parana day.
      if (mhdType === "UNMILANI" && ek.ekEnd instanceof Date) {
        const onParanaDay =
          ek.ekEnd.getFullYear() === paranaDay.getFullYear() &&
          ek.ekEnd.getMonth()    === paranaDay.getMonth()    &&
          ek.ekEnd.getDate()     === paranaDay.getDate();
        if (onParanaDay) {
          const ekEndH = ek.ekEnd.getHours() + ek.ekEnd.getMinutes() / 60 + ek.ekEnd.getSeconds() / 3600;
          if (ekEndH > windowStart) windowStart = ekEndH;
        }
      }

      // Hari-Vāsara end = Dvadashi start + (Dvadashi duration) / 4
      if (ek.ekEnd instanceof Date && dvadashiEndDt) {
        const dvStartMs = ek.ekEnd.getTime();
        const dvEndMs   = dvadashiEndDt.getTime();
        const hvEndMs   = dvStartMs + (dvEndMs - dvStartMs) / 4;
        const hvEndDt   = new Date(hvEndMs);
        const onParanaDay =
          hvEndDt.getFullYear() === paranaDay.getFullYear() &&
          hvEndDt.getMonth()    === paranaDay.getMonth()    &&
          hvEndDt.getDate()     === paranaDay.getDate();
        if (onParanaDay) {
          hariVasaraEndH = hvEndDt.getHours() + hvEndDt.getMinutes() / 60 + hvEndDt.getSeconds() / 3600;
          if (hariVasaraEndH > windowStart) windowStart = hariVasaraEndH;
        }
      }

      // Recommended end: sunrise + 1/3 × apparent daytime (prātaḥ-kāla)
      const apparentDayLen = srData.apparentSunsetH - srData.apparentSunriseH;
      const recommendedEndRaw = sunriseH + apparentDayLen * (1/3);

      // Hard deadline: Dvadashi end (skip clamp for TRISPRSA — Dvadashi kshaya)
      let hardDeadline  = null;
      let hardDeadlineH = null;
      if (dvadashiEndDt && mhdType !== "TRISPRSA") {
        const isSameDay =
          dvadashiEndDt.getFullYear() === paranaDay.getFullYear() &&
          dvadashiEndDt.getMonth()    === paranaDay.getMonth()    &&
          dvadashiEndDt.getDate()     === paranaDay.getDate();
        if (isSameDay) {
          const dvadashiEndH = dvadashiEndDt.getHours() + dvadashiEndDt.getMinutes() / 60;
          if (dvadashiEndH > windowStart) {
            hardDeadlineH = dvadashiEndH;
            hardDeadline  = global._decHToHHMM(dvadashiEndH);
          }
        }
      }
      const recommendedEnd = (hardDeadlineH !== null && hardDeadlineH < recommendedEndRaw)
        ? hardDeadlineH
        : recommendedEndRaw;

      const dateStr = _d2ymd(paranaDay);
      return {
        date:           dateStr,
        windowStart:    global._decHToHHMM(windowStart),
        recommendedEnd: global._decHToHHMM(recommendedEnd),
        hardDeadline:   hardDeadline,
        hariVasaraEnd:  hariVasaraEndH !== null ? global._decHToHHMM(hariVasaraEndH) : null,
        windowEnd: hardDeadline || global._decHToHHMM(recommendedEnd),
      };
    } catch (e) {
      return null;
    }
  }

  // ─── Expose as window globals (for direct calls from app.js) ──────
  global._d2hhmm                = _d2hhmm;
  global._d2ymd                 = _d2ymd;
  global._EK_NAMES_SHUKLA       = _EK_NAMES_SHUKLA;
  global._EK_NAMES_KRISHNA      = _EK_NAMES_KRISHNA;
  global._findNextPurnima       = _findNextPurnima;
  global._getAdjustedMonthIndex = _getAdjustedMonthIndex;
  global._findEkInWindow        = _findEkInWindow;
  global._resolveMahadvadasiShift = _resolveMahadvadasiShift;
  global._resolveEkFasting      = _resolveEkFasting;
  global._computeParanaWindow   = _computeParanaWindow;

  // ─── Namespaced API (preferred for new code) ──────────────────────
  global.GaudiyaEngine = {
    nameShukla:  _EK_NAMES_SHUKLA,
    nameKrishna: _EK_NAMES_KRISHNA,
    monthIndex:  _getAdjustedMonthIndex,
    findEkInWindow: _findEkInWindow,
    resolveFasting: _resolveEkFasting,
    classifyMahadvadashi: _resolveMahadvadasiShift,
    computeParana: _computeParanaWindow,
    fmtHHMM: _d2hhmm,
    fmtYMD:  _d2ymd,
  };

})(typeof window !== "undefined" ? window : globalThis);
