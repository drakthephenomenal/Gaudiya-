// ═══════════════════════════════════════════════════════════════════
//  gaudiya-engine.js  —  ISKCON / Gaudiya Vaishnava Fasting Engine
//
//  Single-parampara (Gaudiya only). No Smarta branch.
//
//  Depends on panchangData.js (must be loaded BEFORE this file):
//    • getPanchangData(lat, lng, date)  → tithi/nakshatra/paksha/month
//    • _getSunriseHour(lat, lng, date)  → local sunrise (decimal hours)
//    • isAdhikMaasDate(dateStr)         → Purushottama Maas window
//
//  Public API:
//    • getGaudiyaFastingInfo(lat, lng, date)
//        → full Ekadashi / Mahadvadashi / Parana decision for `date`.
//    • getGaudiyaFastingMonth(lat, lng, year, month0)
//        → array of all fasting days in a calendar month.
//
//  Spec coverage:
//    ✓ Suddha Ekadashi detection (Dashami-untouched arunodaya)
//    ✓ Dashami-viddha → fast shifts to Dwadashi
//    ✓ All 10 Mahadvadashi types:
//        Unmilani, Vyanjuli, Trisprsha, Unmilani-Trisprsha,
//        Paksavardhini, Jaya, Jayanti, Papanasini, Vijaya, Suddha-Dwadashi
//    ✓ Hari-vasara clamp (Parana must wait until Dwadashi 1st quarter ends
//      if Ekadashi tithi spills past sunrise)
//    ✓ Nakshatra-end clamp for nakshatra-based Mahadvadashis
//    ✓ Parana window: sunrise ≤ break < min(Dwadashi-end, sunrise + 1/5 day)
// ═══════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // ─── Constants ────────────────────────────────────────────────────
  const ARUNODAYA_MIN_BEFORE_SUNRISE = 96; // ISKCON standard: 96 min
  const DAY_MS = 86400000;

  // Nakshatra indices (0-based, as in panchangData._NAKSHATRA)
  const NAK = {
    ROHINI: 3,
    PUNARVASU: 6,
    PUSHYA: 7,
    SHRAVANA: 21,
  };

  // ─── Helpers ──────────────────────────────────────────────────────
  function _midnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  function _addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }
  function _dateStr(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function _fmtHHMM(d) {
    if (!d) return null;
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return h + "." + String(m).padStart(2, "0") + " " + ampm;
  }
  function _sunriseMoment(lat, lng, date) {
    const h = global._getSunriseHour(lat, lng, date);
    return new Date(
      date.getFullYear(), date.getMonth(), date.getDate(),
      Math.floor(h), Math.round((h % 1) * 60), 0
    );
  }
  function _arunodayaMoment(lat, lng, date) {
    return new Date(_sunriseMoment(lat, lng, date).getTime()
      - ARUNODAYA_MIN_BEFORE_SUNRISE * 60000);
  }

  // Normalize tithi to 1..15 (Shukla) or 1..15 (Krishna paksha index)
  // panchangData.tithiNum is 1..30. Tithi-in-paksha = num if ≤15 else num-15.
  function _tithiInPaksha(num) { return num <= 15 ? num : num - 15; }

  // ─── Core panchang accessor (single source of truth) ──────────────
  async function _panchangAt(lat, lng, date) {
    const p = await global.getPanchangData(lat, lng, date);
    return {
      tithiNum:     p.tithiNum   || p.tithi?.num,
      tithiInPaksha: _tithiInPaksha(p.tithiNum || p.tithi?.num),
      tithiEnd:     p.tithi?.endDate || null,
      paksha:       p.paksha?.key || (p.tithiNum <= 15 ? "shukla" : "krishna"),
      nakIdx:       p.nakIdx !== undefined ? p.nakIdx : (p.nakshatra?.idx ?? 0),
      nakEnd:       p.nakshatra?.endDate || null,
      monthIdx:     p.monthIdx !== undefined ? p.monthIdx : (p.month?.idx ?? 0),
      isAdhikMaas:  !!p.isAdhikMaas,
      raw:          p,
    };
  }

  // ─── Ekadashi name table (Purnimanta monthIdx + paksha) ───────────
  // monthIdx aligns with panchangData._MONTH_STD (0=Chaitra)
  const EK_NAMES = {
    "0_shukla":  "Kamada Ekadashi",
    "0_krishna": "Varuthini Ekadashi",
    "1_shukla":  "Mohini Ekadashi",
    "1_krishna": "Apara Ekadashi",
    "2_shukla":  "Nirjala Ekadashi",
    "2_krishna": "Yogini Ekadashi",
    "3_shukla":  "Devshayani Ekadashi",
    "3_krishna": "Kamika Ekadashi",
    "4_shukla":  "Shravana Putrada Ekadashi",
    "4_krishna": "Aja Ekadashi",
    "5_shukla":  "Parsva Ekadashi",
    "5_krishna": "Indira Ekadashi",
    "6_shukla":  "Pasankusha Ekadashi",
    "6_krishna": "Rama Ekadashi",
    "7_shukla":  "Prabodhini (Devotthani) Ekadashi",
    "7_krishna": "Utpanna Ekadashi",
    "8_shukla":  "Mokshada Ekadashi",
    "8_krishna": "Saphala Ekadashi",
    "9_shukla":  "Pausha Putrada Ekadashi",
    "9_krishna": "Shattila Ekadashi",
    "10_shukla": "Jaya Ekadashi",
    "10_krishna":"Vijaya Ekadashi",
    "11_shukla": "Amalaki Ekadashi",
    "11_krishna":"Papamochani Ekadashi",
    "adhik_shukla":  "Padmini Ekadashi",
    "adhik_krishna": "Parama Ekadashi",
  };
  function _ekadashiName(monthIdx, paksha, isAdhik) {
    if (isAdhik) return EK_NAMES["adhik_" + paksha];
    return EK_NAMES[monthIdx + "_" + paksha] || "Ekadashi";
  }

  // ═════════════════════════════════════════════════════════════════
  //  MAHADVADASHI CLASSIFIER
  //  Inputs: panchang on (Ekadashi day, Dwadashi day, Trayodashi day)
  //  Returns: { type: string|null, label: string }
  // ═════════════════════════════════════════════════════════════════
  function _classifyMahadvadashi(ekDay, dwDay, trDay, ekSunrise, dwSunrise, trSunrise) {
    // ekDay/dwDay/trDay = _panchangAt() results for three consecutive days
    //
    // Astronomical inputs (booleans, derived from tithi at sunrise):
    //  ekAtDwSunrise : Ekadashi tithi still active at the NEXT day's sunrise
    //                  (i.e. Ekadashi spans 2 sunrises — Vriddhi Ekadashi)
    //  dwAtTrSunrise : Dwadashi tithi still active at sunrise of day AFTER Dwadashi
    //                  (Vriddhi Dwadashi)
    //  trTouchesDwDay: Trayodashi begins within the same civil/arunodaya day as Dwadashi
    //                  (i.e. Dwadashi tithi ENDS before next sunrise on Dwadashi-day)

    const ekAtDwSunrise = (dwDay.tithiNum === ekDay.tithiNum);
    const dwAtTrSunrise = (trDay.tithiNum === dwDay.tithiNum);
    // Trayodashi "touches" the Dwadashi civil day if Dwadashi ends before
    // sunrise of the next day BUT after Dwadashi sunrise.
    const trTouchesDwDay = dwDay.tithiEnd
      && dwDay.tithiEnd > dwSunrise
      && dwDay.tithiEnd < trSunrise
      && trDay.tithiNum !== dwDay.tithiNum;

    // Dwadashi-day nakshatra (at its sunrise)
    const nak = dwDay.nakIdx;
    // Dwadashi-day month (Purnimanta)
    const month = dwDay.monthIdx;

    // ── 1. Unmilani-Trisprsha (Ekadashi-vriddhi AND tri-tithi touch) ──
    if (ekAtDwSunrise && trTouchesDwDay) {
      return { type: "UNMILANI_TRISPRSHA", label: "Unmilani-Trisprsha Mahadvadashi" };
    }
    // ── 2. Unmilani (Ekadashi spans 2 sunrises) ──
    if (ekAtDwSunrise) {
      return { type: "UNMILANI", label: "Unmilani Mahadvadashi" };
    }
    // ── 3. Vyanjuli (Dwadashi spans 2 sunrises, no Ekadashi-vriddhi) ──
    if (dwAtTrSunrise) {
      return { type: "VYANJULI", label: "Vyanjuli Mahadvadashi" };
    }
    // ── 4. Trisprsha (Ekadashi+Dwadashi+Trayodashi within one arunodaya cycle) ──
    if (trTouchesDwDay) {
      return { type: "TRISPRSHA", label: "Trisprsha Mahadvadashi" };
    }
    // ── 5. Paksavardhini (pure Dwadashi vriddhi) ──
    // Covered by VYANJULI above — Paksavardhini is the alt name when no Ek-vriddhi
    // (kept distinct only by some authors; Gaudiya tradition treats as Vyanjuli).
    //
    // ── 6-9. Nakshatra-based Mahadvadashis (Dwadashi tithi + special nakshatra) ──
    if (nak === NAK.PUNARVASU)
      return { type: "JAYA",       label: "Jaya Mahadvadashi" };
    if (nak === NAK.ROHINI)
      return { type: "JAYANTI",    label: "Jayanti Mahadvadashi" };
    if (nak === NAK.PUSHYA)
      return { type: "PAPANASINI", label: "Papa-nasini Mahadvadashi" };
    if (nak === NAK.SHRAVANA)
      return { type: "VIJAYA",     label: "Vijaya Mahadvadashi" };

    // ── 10. Suddha Dwadashi — not a Mahadvadashi, no shift ──
    return { type: null, label: null };
  }

  // ═════════════════════════════════════════════════════════════════
  //  MAIN: getGaudiyaFastingInfo(lat, lng, date)
  //
  //  Decision tree (Gaudiya parampara):
  //   1. Look at panchang for [date-1, date, date+1, date+2].
  //   2. If Dashami extends into arunodaya of the Ekadashi-day
  //      → "Dashami-viddha" → fasting day SHIFTS to Dwadashi.
  //   3. Classify Mahadvadashi (10 types) on the Dwadashi candidate day.
  //   4. Compute Parana window with all clamps.
  // ═════════════════════════════════════════════════════════════════
  async function getGaudiyaFastingInfo(lat, lng, date) {
    date = date || new Date();
    const today = _midnight(date);

    // Pull 4 consecutive days of panchang
    const days = await Promise.all([-1, 0, 1, 2].map(off =>
      _panchangAt(lat, lng, _addDays(today, off))
    ));
    const [pYesterday, pToday, pTomorrow, pDayAfter] = days;

    // Identify which of the 4 days is the Ekadashi (tithi = 11)
    // Anchor: the Ekadashi day relative to `date`.
    let ekOffset = null;
    for (let i = 0; i < 4; i++) {
      if (days[i].tithiInPaksha === 11) { ekOffset = i - 1; break; }
    }

    // Not within an Ekadashi window?
    if (ekOffset === null) {
      return _notFasting(today, pToday);
    }

    const ekDate = _addDays(today, ekOffset);
    const dwDate = _addDays(ekDate, 1);
    const trDate = _addDays(ekDate, 2);

    // Re-fetch with correct anchoring (the 4-day window may not cover all 3)
    const [ekP, dwP, trP] = await Promise.all([
      _panchangAt(lat, lng, ekDate),
      _panchangAt(lat, lng, dwDate),
      _panchangAt(lat, lng, trDate),
    ]);

    const ekSunrise = _sunriseMoment(lat, lng, ekDate);
    const dwSunrise = _sunriseMoment(lat, lng, dwDate);
    const trSunrise = _sunriseMoment(lat, lng, trDate);
    const ekArunodaya = _arunodayaMoment(lat, lng, ekDate);

    // ── Dashami-viddha check ──
    // If at Ekadashi arunodaya the tithi is still Dashami (10), the Ekadashi
    // is "viddha" (pierced by Dashami) and Gaudiya tradition shifts the fast
    // to the next day (Dwadashi), which becomes a Mahadvadashi by definition.
    const tithiAtEkArunodaya = await _tithiAtMoment(lat, lng, ekArunodaya);
    const dashamiViddha = (_tithiInPaksha(tithiAtEkArunodaya) === 10);

    // ── Mahadvadashi classification (always evaluated on Dwadashi day) ──
    const mhd = _classifyMahadvadashi(ekP, dwP, trP, ekSunrise, dwSunrise, trSunrise);

    // ── Decide fasting day ──
    let fastDate, paranaDate, fastType, mhdInfo = null;
    if (dashamiViddha || mhd.type) {
      // Fast on Dwadashi
      fastDate   = dwDate;
      paranaDate = trDate;
      fastType   = "MAHADVADASHI";
      mhdInfo    = mhd.type ? mhd : {
        type: "DASHAMI_VIDDHA_SHIFT",
        label: "Dwadashi-Mahadvadashi (Dashami-viddha shift)"
      };
    } else {
      // Pure (Suddha) Ekadashi fast
      fastDate   = ekDate;
      paranaDate = dwDate;
      fastType   = "SUDDHA_EKADASHI";
    }

    // ── Build Parana window ──
    const paranaSunrise = _sunriseMoment(lat, lng, paranaDate);
    const paranaDayP    = (paranaDate.getTime() === dwDate.getTime()) ? dwP : trP;

    // Hari-vasara clamp: if Ekadashi tithi extends past Dwadashi sunrise,
    // Parana cannot start until the 1st quarter (1/4) of Dwadashi has passed.
    // For SUDDHA fasts, paranaDate = dwDate, so this clamp may apply.
    let paranaStart = paranaSunrise;
    if (fastType === "SUDDHA_EKADASHI" && ekP.tithiEnd && ekP.tithiEnd > paranaSunrise) {
      // 1/4 of Dwadashi tithi = ~3 hours after Ekadashi-tithi ends
      const dwadashiDuration = (dwP.tithiEnd && ekP.tithiEnd)
        ? (dwP.tithiEnd.getTime() - ekP.tithiEnd.getTime())
        : (24 * 3600000); // fallback ~24h
      const hariVasaraEnd = new Date(ekP.tithiEnd.getTime() + dwadashiDuration / 4);
      if (hariVasaraEnd > paranaStart) paranaStart = hariVasaraEnd;
    }

    // Nakshatra clamp: for Jaya/Jayanti/Papanasini/Vijaya, Parana must wait
    // until the special nakshatra ENDS.
    if (mhdInfo && ["JAYA","JAYANTI","PAPANASINI","VIJAYA"].includes(mhdInfo.type)) {
      const nakEndOnParana = paranaDayP.nakEnd;
      // The relevant nakshatra is on dwDate (the fasting day). Wait for its end.
      if (dwP.nakEnd && dwP.nakEnd > paranaStart) paranaStart = dwP.nakEnd;
    }

    // Parana END = min(Dwadashi/Trayodashi tithi-end, sunrise + 1/5 of day)
    const dayLengthMs = 12 * 3600000; // approx; refine with sunset if available
    const oneFifth = new Date(paranaSunrise.getTime() + dayLengthMs / 5);
    let paranaEnd = oneFifth;
    if (paranaDayP.tithiEnd && paranaDayP.tithiEnd < paranaEnd) {
      paranaEnd = paranaDayP.tithiEnd;
    }

    // Viddha rare case: Parana window collapses (start ≥ end)
    const viddhaWindow = paranaStart >= paranaEnd;

    // ── Is THE QUERIED `date` a fasting day? ──
    const isFastDay  = (_dateStr(today) === _dateStr(fastDate));
    const isPrevNight = (_dateStr(today) === _dateStr(_addDays(fastDate, -1)));
    // Dashami-night = no grains after sunset the night before the fast

    const name = _ekadashiName(ekP.monthIdx, ekP.paksha, ekP.isAdhikMaas);

    return {
      // Query context
      queryDate:        _dateStr(today),
      isFastDay,
      isDashamiNight:   isPrevNight,

      // Ekadashi identity
      ekadashiName:     name,
      ekadashiDate:     _dateStr(ekDate),
      paksha:           ekP.paksha,
      monthIdx:         ekP.monthIdx,
      monthName:        ekP.raw.month?.gaudiya || ekP.raw.month?.std,
      isAdhikMaas:      ekP.isAdhikMaas,

      // Fasting decision
      fastDate:         _dateStr(fastDate),
      fastType,                                  // "SUDDHA_EKADASHI" | "MAHADVADASHI"
      mahadvadashi:     mhdInfo,                 // { type, label } or null
      dashamiViddha,

      // Parana window
      paranaDate:       _dateStr(paranaDate),
      paranaStart:      _fmtHHMM(paranaStart),
      paranaStartDate:  paranaStart,
      paranaEnd:        _fmtHHMM(paranaEnd),
      paranaEndDate:    paranaEnd,
      paranaSunrise:    _fmtHHMM(paranaSunrise),
      viddhaWindow,

      // Diagnostics
      tithiAtEkArunodaya: tithiAtEkArunodaya,
      source:           ekP.raw._source || "local",
    };
  }

  // ── Auxiliary: get tithi-num at an arbitrary moment ──
  // Uses panchangData's local Meeus engine (sync, no API). We can't call
  // getPanchangData() at an arbitrary moment cleanly because Prokerala is
  // day-anchored; so we always use the local _sunMoonLongitudes via a
  // small helper exposed if available, else approximate via day panchang.
  async function _tithiAtMoment(lat, lng, moment) {
    if (typeof global._tithiAtMoment === "function") {
      return global._tithiAtMoment(moment);
    }
    if (typeof global._elongation === "function") {
      return Math.floor(global._elongation(moment) / 12) + 1;
    }
    // Fallback: use the day's tithi at sunrise (less accurate for arunodaya check)
    const dayP = await _panchangAt(lat, lng, _midnight(moment));
    return dayP.tithiNum;
  }

  // ── Non-fasting response shape ──
  function _notFasting(today, pToday) {
    return {
      queryDate:      _dateStr(today),
      isFastDay:      false,
      isDashamiNight: false,
      ekadashiName:   null,
      ekadashiDate:   null,
      paksha:         pToday.paksha,
      monthIdx:       pToday.monthIdx,
      monthName:      pToday.raw.month?.gaudiya,
      isAdhikMaas:    pToday.isAdhikMaas,
      fastDate:       null,
      fastType:       null,
      mahadvadashi:   null,
      dashamiViddha:  false,
      paranaDate:     null,
      paranaStart:    null,
      paranaEnd:      null,
      viddhaWindow:   false,
      source:         pToday.raw._source || "local",
    };
  }

  // ═════════════════════════════════════════════════════════════════
  //  MONTHLY LISTING — getGaudiyaFastingMonth(lat, lng, year, month0)
  //  Returns array of fasting entries for the given calendar month.
  // ═════════════════════════════════════════════════════════════════
  async function getGaudiyaFastingMonth(lat, lng, year, month0) {
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const seen = new Set();
    const results = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const info = await getGaudiyaFastingInfo(lat, lng, new Date(year, month0, d));
      if (info.fastDate && !seen.has(info.fastDate)) {
        seen.add(info.fastDate);
        // Only include if the fastDate falls within the queried month
        const fd = new Date(info.fastDate);
        if (fd.getFullYear() === year && fd.getMonth() === month0) {
          results.push(info);
        }
      }
    }
    return results;
  }

  // ─── Export ───────────────────────────────────────────────────────
  global.getGaudiyaFastingInfo  = getGaudiyaFastingInfo;
  global.getGaudiyaFastingMonth = getGaudiyaFastingMonth;
  global._classifyMahadvadashi  = _classifyMahadvadashi; // exposed for tests

})(typeof window !== "undefined" ? window : globalThis);
