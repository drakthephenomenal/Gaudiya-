// ══════════════════════════════════════════════════════════════════════════
// functions/index.js  — Radha Naam Jap FCM Reminder Scheduler  (v1)
// Firebase Cloud Functions v2, Node 20, region: asia-south1
//
// Schedule: every 5 minutes
// Reads:  users/{uid}/reminders/prefs  + users/{uid}/fcmTokens/web
// Sends:  FCM push via Admin SDK (HTTP v1 API)
// ══════════════════════════════════════════════════════════════════════════

const { onSchedule }     = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging }   = require("firebase-admin/messaging");
const { initializeApp }  = require("firebase-admin/app");

initializeApp();

// ════════════════════════════════
// Pure-JS Sun Time (Meeus algorithm — no external API)
// Accurate to ~1 minute
// ════════════════════════════════
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function _jd(d) { return d.getTime() / 86400000 + 2440587.5; }
function _jcent(jd) { return (jd - 2451545.0) / 36525.0; }

function _gmLong(t) {
  let L = 280.46646 + t * (36000.76983 + t * 0.0003032);
  return ((L % 360) + 360) % 360;
}
function _gmAnomaly(t) { return 357.52911 + t * (35999.05029 - 0.0001537 * t); }
function _eccEarth(t)  { return 0.016708634 - t * (0.000042037 + 0.0000001267 * t); }
function _sunEqCenter(t) {
  const m = _gmAnomaly(t) * RAD;
  return (Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
        + Math.sin(2*m) * (0.019993 - 0.000101 * t)
        + Math.sin(3*m) * 0.000289);
}
function _sunAppLong(t) {
  const o = _gmLong(t) + _sunEqCenter(t);
  return o - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * RAD);
}
function _oblCorr(t) {
  const e0 = 23 + (26 + (21.448 - t*(46.815 + t*(0.00059 - t*0.001813)))/60)/60;
  return e0 + 0.00256 * Math.cos((125.04 - 1934.136 * t) * RAD);
}
function _sunDecl(t) {
  return Math.asin(Math.sin(_oblCorr(t)*RAD) * Math.sin(_sunAppLong(t)*RAD)) * DEG;
}
function _eqTime(t) {
  const eps = _oblCorr(t) * RAD;
  const l0  = _gmLong(t)  * RAD;
  const e   = _eccEarth(t);
  const m   = _gmAnomaly(t) * RAD;
  const y   = Math.tan(eps/2) ** 2;
  return DEG * (y*Math.sin(2*l0) - 2*e*Math.sin(m) + 4*e*y*Math.sin(m)*Math.cos(2*l0)
         - 0.5*y*y*Math.sin(4*l0) - 1.25*e*e*Math.sin(2*m)) * 4;
}
function _hourAngle(lat, decl) {
  const arg = Math.cos(90.833*RAD) / (Math.cos(lat*RAD)*Math.cos(decl*RAD))
            - Math.tan(lat*RAD)*Math.tan(decl*RAD);
  if (arg < -1 || arg > 1) return null;
  return Math.acos(arg);
}

/**
 * Returns { sunrise: Date, sunset: Date } in UTC for the given date/lat/lng.
 * Returns null on polar conditions.
 */
function sunTimesUTC(dateUTC, lat, lng) {
  const jd   = _jd(dateUTC);
  const t    = _jcent(jd);
  const eq   = _eqTime(t);
  const decl = _sunDecl(t);
  const ha   = _hourAngle(lat, decl);
  if (ha === null) return null;

  const haD = ha * DEG;
  const srMin = 720 - 4*(lng + haD) - eq;  // UTC minutes from midnight
  const ssMin = 720 - 4*(lng - haD) - eq;

  const make = (minUTC) => {
    const d = new Date(Date.UTC(
      dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate(),
      0, 0, 0, Math.round(minUTC * 60000)
    ));
    return d;
  };
  return { sunrise: make(srMin), sunset: make(ssMin) };
}

// Brahma Muhurta = 101 min before sunrise; Sandhya = 5 min before sunset
function brahmaFireTime(sr) { return new Date(sr.getTime() - 101*60*1000); }
function sandhyaFireTime(ss) { return new Date(ss.getTime()  -   5*60*1000); }

/**
 * For a manual time like "06:00" in the user's timezone,
 * return the UTC Date for that time today.
 */
function manualFireTimeUTC(timeStr, tzStr) {
  const [hh, mm] = timeStr.split(":").map(Number);
  // Get today's date string in the user's timezone
  const fmt  = new Intl.DateTimeFormat("en-CA", { timeZone: tzStr,
                  year:"numeric", month:"2-digit", day:"2-digit" });
  const today = fmt.format(new Date()); // "YYYY-MM-DD"
  // Build a datetime string and interpret it as the user's local time
  const localStr = `${today}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00`;
  // Use Temporal-style trick via Date.parse with offset
  // Simpler: get UTC offset for that timezone right now
  const utcNow   = Date.now();
  const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tzStr })).getTime();
  const offsetMs = localNow - utcNow; // positive = east of UTC
  const wallMs   = new Date(localStr).getTime(); // parsed as local machine time
  // Adjust: we want wall clock in tzStr, but Date parsed it as server local time
  // Better: reconstruct purely from today's date parts + known offset
  const [Y, M, D] = today.split("-").map(Number);
  const utcMs = Date.UTC(Y, M-1, D, hh, mm, 0) - offsetMs;
  return new Date(utcMs);
}

// ════════════════════════════════
// Notification payloads
// ════════════════════════════════
const ICON_URL = "https://drakthephenomenal.github.io/icon-192.png";
const APP_URL  = "https://drakthephenomenal.github.io/";

const NOTIF = {
  brahma: {
    title: "ब्रह्म मुहूर्त 🌄",
    body:  "Brahma Muhurta begins — most auspicious time for Naam Jap. राधे राधे!",
    tag:   "radha-jap-brahma",
  },
  sandhya: {
    title: "संध्याकाल 🌅",
    body:  "Sandhyakal is here — time for your evening Naam Jap. राधे राधे!",
    tag:   "radha-jap-sandhya",
  },
  manual: {
    title: "राधे राधे 🙏",
    body:  "Time for your daily Jap! Begin your naam jap. राधे राधे 🙏",
    tag:   "radha-jap-manual",
  },
};

// ════════════════════════════════
// Scheduled Cloud Function
// ════════════════════════════════
exports.sendReminderNotifications = onSchedule(
  {
    schedule:  "every 5 minutes",
    timeZone:  "UTC",
    region:    "asia-south1",
    memory:    "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const db        = getFirestore();
    const messaging = getMessaging();
    const now       = Date.now();
    const WINDOW    = 3 * 60 * 1000; // ±3 min tolerance

    // Fetch all users' reminder prefs via collectionGroup
    const snap = await db.collectionGroup("reminders").get();
    if (snap.empty) return;

    const tasks = [];

    for (const doc of snap.docs) {
      if (doc.id !== "prefs") continue;
      const uid   = doc.ref.parent.parent.id;
      const prefs = doc.data();
      if (!prefs.lat || !prefs.lng || !prefs.tz) continue;

      // Get this user's FCM token
      const tokenSnap = await db
        .collection("users").doc(uid)
        .collection("fcmTokens").doc("web").get();
      if (!tokenSnap.exists) continue;
      const token = tokenSnap.data()?.token;
      if (!token) continue;

      // Compute today's sun times once per user
      const todayUTC = new Date();
      const sun      = sunTimesUTC(todayUTC, prefs.lat, prefs.lng);

      for (const type of ["brahma", "sandhya", "manual"]) {
        if (!prefs[type]?.enabled) continue;

        let fireAt = null;
        if (type === "brahma") {
          if (!sun) continue;
          fireAt = brahmaFireTime(sun.sunrise);
        } else if (type === "sandhya") {
          if (!sun) continue;
          fireAt = sandhyaFireTime(sun.sunset);
        } else {
          if (!prefs.manual?.time) continue;
          try { fireAt = manualFireTimeUTC(prefs.manual.time, prefs.tz); }
          catch { continue; }
        }

        if (!fireAt || Math.abs(now - fireAt.getTime()) > WINDOW) continue;

        // Deduplication key — one notification per type per minute
        const dedupId  = `${uid}_${type}_${fireAt.toISOString().slice(0, 16)}`;
        const dedupRef = db.collection("_notifSent").doc(dedupId);

        tasks.push((async () => {
          const existing = await dedupRef.get();
          if (existing.exists) return; // already sent

          // Mark sent first to prevent double-send on concurrent runs
          await dedupRef.set({ sentAt: FieldValue.serverTimestamp(), uid, type });

          const n = NOTIF[type];
          try {
            await messaging.send({
              token,
              notification: { title: n.title, body: n.body },
              data:          { tag: n.tag, type },
              webpush: {
                notification: {
                  title: n.title, body: n.body, tag: n.tag,
                  renotify: true,
                  icon: ICON_URL, badge: ICON_URL,
                  vibrate: [200, 100, 200],
                },
                fcmOptions: { link: APP_URL },
              },
              android: {
                notification: { title: n.title, body: n.body, tag: n.tag },
              },
              apns: {
                payload: {
                  aps: {
                    alert: { title: n.title, body: n.body },
                    badge: 1, sound: "default",
                  },
                },
              },
            });
            console.log(`✓ Sent ${type} → ${uid.slice(0,8)}…`);
          } catch (e) {
            console.warn(`✗ FCM send failed (${type}, ${uid.slice(0,8)}…): ${e.message}`);
            // Stale token — delete it
            if (
              e.code === "messaging/registration-token-not-registered" ||
              e.code === "messaging/invalid-registration-token"
            ) {
              await db.collection("users").doc(uid)
                .collection("fcmTokens").doc("web").delete().catch(() => {});
            }
          }
        })());
      }
    }

    await Promise.allSettled(tasks);
  }
);

// ════════════════════════════════
// Cleanup old dedup records (runs daily at midnight UTC)
// ════════════════════════════════
const { onSchedule: onScheduleCleanup } = require("firebase-functions/v2/scheduler");

exports.cleanupOldNotifSent = onScheduleCleanup(
  { schedule: "every 24 hours", timeZone: "UTC", region: "asia-south1" },
  async () => {
    const db      = getFirestore();
    const cutoff  = new Date(Date.now() - 2 * 3600 * 1000); // older than 2 hours
    const snap    = await db.collection("_notifSent")
      .where("sentAt", "<", cutoff).limit(500).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`Cleaned up ${snap.size} old dedup records`);
  }
);
