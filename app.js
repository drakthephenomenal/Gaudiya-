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

/* === Native-aware GPS + vibration helpers (Capacitor APK support) ===
   navigator.geolocation / navigator.vibrate work in a real browser (PWA)
   but are unreliable-to-nonexistent inside the Capacitor Android WebView —
   the OS never grants the runtime permission because nothing ever asks for
   it through the native plugin bridge. These helpers transparently use the
   native @capacitor/geolocation and @capacitor/haptics plugins when running
   as the APK, and fall back to the plain web APIs everywhere else (PWA/TWA
   browser tabs), so the rest of app.js doesn't need to know the difference. */
function _lcIsNative() {
  return !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

// ── Turn a raw Geolocation error into a clear, actionable message ──
// Android's system Location toggle (device-wide) is a completely separate
// setting from the app's own location permission — a very common source
// of confusion, since the app permission popup can be "Allowed" while the
// phone's actual GPS/Location service is still switched off entirely.
function _lcGpsErrorMessage(err) {
  const code = err && err.code;
  const msg = (err && err.message) || String(err || "");
  const msgLower = msg.toLowerCase();

  // Web Geolocation API: code 1 = PERMISSION_DENIED
  // Capacitor Geolocation plugin: throws "Location permission denied" (see lcGetPosition)
  if (code === 1 || msgLower.includes("permission")) {
    return "⚠️ Location permission not granted. Please allow location access for this app in your phone's Settings → Apps → Radha Naam Jap → Permissions.";
  }

  // Web Geolocation API: code 2 = POSITION_UNAVAILABLE (often means GPS/Location
  // service is off device-wide). Capacitor/Android often surfaces this as a
  // message mentioning "location" being disabled/unavailable.
  if (
    code === 2 ||
    msgLower.includes("unavailable") ||
    msgLower.includes("disabled") ||
    msgLower.includes("not enabled") ||
    msgLower.includes("location service")
  ) {
    return "📍 Your phone's Location service appears to be turned off. Please turn on Location (swipe down from the top → tap Location, or Settings → Location) and try again.";
  }

  // Web Geolocation API: code 3 = TIMEOUT
  if (code === 3 || msgLower.includes("timeout") || msgLower.includes("timed out")) {
    return "⏱️ Couldn't get a GPS fix in time. Try again outdoors or near a window for a clearer signal.";
  }

  // Fallback — still show something useful rather than a bare error object.
  return "⚠️ GPS error: " + (msg || "Unknown error");
}

async function lcGetPosition(options) {
  options = options || { timeout: 10000, maximumAge: 0 };
  if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) {
    const { Geolocation } = window.Capacitor.Plugins;
    let perm;
    try {
      perm = await Geolocation.checkPermissions();
    } catch (e) {
      perm = {};
    }
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      perm = await Geolocation.requestPermissions();
    }
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      const err = new Error("Location permission denied");
      err.code = 1;
      throw err;
    }
    // EXPERIMENT: also try the WebView's own navigator.geolocation, on the
    // chance it triggers the same automatic system "Turn on Location"
    // dialog seen in a regular browser (Android's System WebView is also
    // Chromium-based). Whichever resolves first is used; if the native
    // plugin call above already resolved, this is simply unused.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        return await Promise.race([
          Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: options.timeout || 10000,
          }),
          _lcTryWebViewGeolocation(options),
        ]);
      } catch (_e) {
        // both attempts failed — fall through to native-only call below,
        // which will surface the real error via the normal catch path.
      }
    }
    return Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: options.timeout || 10000,
    });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function _lcTryWebViewGeolocation(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function lcVibrate(pattern) {
  if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
    try {
      const { Haptics } = window.Capacitor.Plugins;
      const total = Array.isArray(pattern)
        ? pattern.reduce((a, b) => a + b, 0)
        : pattern;
      Haptics.vibrate({ duration: Math.min(total, 5000) });
      return;
    } catch (e) {
      /* fall through to web vibrate below */
    }
  }
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

/* === Daily reminder notification (Capacitor APK + best-effort PWA) ===
   Native: uses @capacitor/local-notifications, which schedules a real OS
   alarm — fires even if the app/WorkManager background task isn't running.
   Web/PWA: there is no reliable way to wake a closed browser tab at an exact
   time without a push server, so this is best-effort only — it fires while
   the tab (or its service worker) is alive. A server-push version (option 2
   from earlier) can replace this later without changing the toggle UI. */
const RJAP_REMINDER_NOTIF_ID = 9001;

// Android notification channel used by every reminder below (custom/BM/SK).
// Gives reminders a proper tone + vibration instead of a silent/default ping.
//
// IMPORTANT: Android locks a channel's sound/vibration the moment it's first
// created on a given device — calling createChannel again with the same id
// later does NOT update it. That's why this is "rjap_reminders_v2" instead
// of the original "rjap_reminders": anyone who already had the app installed
// before the custom tone was added would otherwise be stuck with the old
// default sound forever. If the tone/vibration ever need to change again in
// the future, bump this id again (e.g. "_v3").
//
// The tone itself lives at android/app/src/main/res/raw/reminder_tone.mp3 —
// referenced below by filename only, no extension, no "raw/" prefix
// (that's how Android resource references work).
const RJAP_NOTIF_CHANNEL_ID = "rjap_reminders_v2";

// presence heartbeat rebuild + version stamp — cached once per session.
// Read at runtime via @capacitor/app (already installed) rather than
// hardcoded, so it always reflects the actual running build instead of
// drifting out of sync with build-android.sh's auto-bumped version.
let _rjapAppVersion = "web";
async function _rjapDetectAppVersion() {
  try {
    if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      const info = await window.Capacitor.Plugins.App.getInfo();
      _rjapAppVersion = (info && info.version) ? "1.0." + (info.build || info.version) : "native";
    }
  } catch (e) {}
}

async function _writePresenceHeartbeat(user) {
  if (!user || !fbDb) return;
  try {
    await fbDb.collection("presence").doc(user.uid).set({
      uid: user.uid,
      name: user.displayName || "",
      email: user.email || "",
      phone: user.phoneNumber || "",
      appVersion: _rjapAppVersion,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn("Presence heartbeat failed:", e && e.message ? e.message : e);
  }
}

async function lcSetupNotifChannel() {
  if (!(_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications)) return;
  try {
    await window.Capacitor.Plugins.LocalNotifications.createChannel({
      id: RJAP_NOTIF_CHANNEL_ID,
      name: "Jap Reminders",
      description: "Brahma Muhurta, Sandhya Kal & custom daily jap reminders",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: "reminder_tone",
    });
  } catch (e) {}
}

// ── Backup-saved notification (Export All Data) ──
// Writing a file with Filesystem.writeFile does NOT trigger Android's media
// scanner or show any "Download complete"-style banner the way a browser
// download does, so without this the user has no confirmation in the
// notification shade that the export actually happened. This posts a real
// (immediate, non-scheduled) local notification once the backup file is
// written, on its own low-key channel so it doesn't inherit the reminder
// tone/vibration.
const RJAP_BACKUP_NOTIF_CHANNEL_ID = "rjap_backups_v1";
const RJAP_BACKUP_NOTIF_ID = 9010;

async function lcSetupBackupNotifChannel() {
  if (!(_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications)) return;
  try {
    await window.Capacitor.Plugins.LocalNotifications.createChannel({
      id: RJAP_BACKUP_NOTIF_CHANNEL_ID,
      name: "Backup Confirmations",
      description: "Confirms when a local data backup has been saved",
      importance: 3, // default importance — shows in shade, no intrusive sound
      visibility: 1,
    });
  } catch (e) {}
}

// Fires a one-off notification right away (no `schedule` field = immediate).
// Best-effort only: if notification permission was never granted this
// silently does nothing rather than nagging the user with a permission
// prompt in the middle of an export — the toast already confirms success.
async function lcNotifyBackupSaved(body) {
  if (!(_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications)) return;
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return;
    await lcSetupBackupNotifChannel();
    await LocalNotifications.schedule({
      notifications: [{
        id: RJAP_BACKUP_NOTIF_ID,
        title: "📥 Radha Naam Jap Backup Saved",
        body,
        channelId: RJAP_BACKUP_NOTIF_CHANNEL_ID,
        smallIcon: "ic_stat_notify",
        iconColor: "#E56B1F",
      }],
    });
  } catch (e) {}
}

async function lcRequestNotifPermission() {
  if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    const { LocalNotifications } = window.Capacitor.Plugins;
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
    if (perm.display === "granted") await lcSetupNotifChannel();
    return perm.display === "granted";
  }
  if ("Notification" in window) {
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const res = await Notification.requestPermission();
    return res === "granted";
  }
  return false;
}

async function lcScheduleDailyReminder(hour, minute) {
  if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    const { LocalNotifications } = window.Capacitor.Plugins;
    try { await LocalNotifications.cancel({ notifications: [{ id: RJAP_REMINDER_NOTIF_ID }] }); } catch (e) {}
    await LocalNotifications.schedule({
      notifications: [{
        id: RJAP_REMINDER_NOTIF_ID,
        title: "🙏 Radha Naam Jap",
        body: "Time for your daily sadhana — chant with a peaceful heart.",
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        channelId: RJAP_NOTIF_CHANNEL_ID,
        smallIcon: "ic_stat_notify",
        iconColor: "#E56B1F",
      }],
    });
    return;
  }
  localStorage.setItem("rjap_reminder_time", hour + ":" + minute);
  _lcArmWebReminderTimer();
}

function lcCancelDailyReminder() {
  if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    try {
      window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: RJAP_REMINDER_NOTIF_ID }] });
    } catch (e) {}
  }
  localStorage.removeItem("rjap_reminder_time");
  localStorage.removeItem("rjap_reminder_lastFired");
  if (window._lcReminderTimer) { clearInterval(window._lcReminderTimer); window._lcReminderTimer = null; }
}

// ── Brahma Muhurta / Sandhya Kal reminders (5 min before start) ──
// Uses the same sun-time math as the Jap screen's BM/Sandhya cards
// (calcSunTimes, defined further down this file — safe to call here due to
// JS function-declaration hoisting). Scheduled as one-shot native alarms for
// the next upcoming occurrence, then re-armed automatically every time
// updateSunInfo() runs (app open + every 10 min while open), so any
// day-to-day drift in sunrise/sunset self-corrects on next app open. If the
// app stays fully closed for more than a day, the already-armed notification
// still fires once as scheduled, but won't re-arm for the day after until
// the app is reopened.
const RJAP_BM_REMINDER_NOTIF_ID = 9002;
const RJAP_SK_REMINDER_NOTIF_ID = 9003;

function _lcNextOccurrence(hour, minute) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target;
}

async function _lcScheduleOneShot(id, targetDate, title, body) {
  if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    const { LocalNotifications } = window.Capacitor.Plugins;
    try { await LocalNotifications.cancel({ notifications: [{ id }] }); } catch (e) {}
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title,
        body,
        schedule: { at: targetDate, allowWhileIdle: true },
        channelId: RJAP_NOTIF_CHANNEL_ID,
        smallIcon: "ic_stat_notify",
        iconColor: "#E56B1F",
      }],
    });
  }
}

function _lcCancelOneShot(id) {
  if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    try { window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id }] }); } catch (e) {}
  }
}

async function lcArmBmReminder() {
  if (typeof calcSunTimes !== "function") return;
  const lat = (App.S && App.S.lastLat) || 23.8103;
  const lng = (App.S && App.S.lastLng) || 90.4125;
  const times = calcSunTimes(lat, lng, new Date());
  if (!times) return;
  let bmStartH = times.sunriseH - 96 / 60 - 5 / 60; // BM start minus 5 min
  if (bmStartH < 0) bmStartH += 24;
  const hh = Math.floor(bmStartH), mm = Math.round((bmStartH - hh) * 60);
  const target = _lcNextOccurrence(hh, mm);
  await _lcScheduleOneShot(
    RJAP_BM_REMINDER_NOTIF_ID,
    target,
    "🌙 Brahma Muhurta in 5 minutes",
    "The most auspicious time for jap is about to begin — get ready 🙏",
  );
}
function lcCancelBmReminder() { _lcCancelOneShot(RJAP_BM_REMINDER_NOTIF_ID); }

async function lcArmSkReminder() {
  if (typeof calcSunTimes !== "function") return;
  const lat = (App.S && App.S.lastLat) || 23.8103;
  const lng = (App.S && App.S.lastLng) || 90.4125;
  const times = calcSunTimes(lat, lng, new Date());
  if (!times) return;
  let skStartH = times.sunsetH - 24 / 60 - 5 / 60; // Sandhya Kal start minus 5 min
  if (skStartH < 0) skStartH += 24;
  const hh = Math.floor(skStartH), mm = Math.round((skStartH - hh) * 60);
  const target = _lcNextOccurrence(hh, mm);
  await _lcScheduleOneShot(
    RJAP_SK_REMINDER_NOTIF_ID,
    target,
    "🔔 Sandhya Kal in 5 minutes",
    "Sandhya Kal is about to begin — a sacred time for jap 🙏",
  );
}
function lcCancelSkReminder() { _lcCancelOneShot(RJAP_SK_REMINDER_NOTIF_ID); }

function _lcArmWebReminderTimer() {
  if (window._lcReminderTimer) clearInterval(window._lcReminderTimer);
  window._lcReminderTimer = setInterval(() => {
    const t = localStorage.getItem("rjap_reminder_time");
    if (!t) return;
    const parts = t.split(":");
    const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    const now = new Date();
    const today = now.toDateString();
    if (now.getHours() === h && now.getMinutes() === m && localStorage.getItem("rjap_reminder_lastFired") !== today) {
      localStorage.setItem("rjap_reminder_lastFired", today);
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("🙏 Radha Naam Jap", {
            body: "Time for your daily sadhana — chant with a peaceful heart.",
            icon: "./icon-192.png",
          });
        } catch (e) {}
      }
    }
  }, 30000);
}

/* === Push notifications — server-triggered via Firebase Cloud Messaging ===
   Native: @capacitor-firebase/messaging talks to FCM directly using
   android/app/google-services.json (already in this repo).
   Web/PWA: firebase-messaging-compat.js + a Web Push (VAPID) key from
   Firebase Console → Project settings → Cloud Messaging → Web Push
   certificates. Paste it into FCM_VAPID_KEY below — web push won't work
   without it (native/APK doesn't need it).
   Either path writes the resulting token onto the user's own Firestore doc
   (users/{uid}/data/main.fcmToken), which the developer-only Cloud Function
   sendBroadcastNotification (functions/index.js) reads to send pushes. */
const FCM_VAPID_KEY = "BBgnbM2KTEB0yT9xOHK--eWm6MO93ihHSLwNpu-NieG59LwygSfRk9MF66_9zjrOrPe0Pff78RmPu68gJ3t-k3o";

/* ── Notification history (inbox) ─────────────────────────────────────
   Stores received pushes locally so the user can browse past
   notifications from Settings, with unread-count badges both on the
   bell button and on the bottom-nav Settings tab. Local-only by design —
   this is a per-device inbox, not synced across the user's devices. */
const RJAP_NOTIF_HISTORY_KEY = "rjap_notif_history";
const RJAP_NOTIF_HISTORY_MAX = 100;

function _rjapGetNotifHistory() {
  try {
    const raw = localStorage.getItem(RJAP_NOTIF_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function _rjapSaveNotifHistory(list) {
  try {
    localStorage.setItem(RJAP_NOTIF_HISTORY_KEY, JSON.stringify(list.slice(0, RJAP_NOTIF_HISTORY_MAX)));
  } catch (e) {}
}

function _rjapAddNotifHistory(title, body) {
  const list = _rjapGetNotifHistory();
  list.unshift({
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    title: title || "Notification",
    body: body || "",
    ts: Date.now(),
    read: false,
  });
  _rjapSaveNotifHistory(list);
  _rjapUpdateNotifBadges();
}

function _rjapUnreadNotifCount() {
  return _rjapGetNotifHistory().filter((n) => !n.read).length;
}

function _rjapMarkAllNotifRead() {
  const list = _rjapGetNotifHistory();
  let changed = false;
  for (const n of list) {
    if (!n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) _rjapSaveNotifHistory(list);
  _rjapUpdateNotifBadges();
}

function _rjapUpdateNotifBadges() {
  const count = _rjapUnreadNotifCount();
  const label = count > 99 ? "99+" : String(count);
  for (const id of ["notifBellBadge", "navSettingsBadge"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (count > 0) {
      el.textContent = label;
      el.style.display = "flex";
    } else {
      el.style.display = "none";
    }
  }
}

function _rjapFormatNotifTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", " + time;
}

function rjapOpenNotifHistory() {
  const modal = document.getElementById("notifHistoryModal");
  const listEl = document.getElementById("notifHistoryList");
  if (!modal || !listEl) return;
  const history = _rjapGetNotifHistory();
  listEl.innerHTML = "";
  if (history.length === 0) {
    listEl.innerHTML = '<div class="notif-hist-empty">No notifications yet 🙏</div>';
  } else {
    for (const n of history) {
      const row = document.createElement("div");
      row.className = "notif-hist-row" + (n.read ? "" : " notif-hist-unread");
      row.innerHTML =
        '<div class="notif-hist-title">' + (n.read ? "" : '<span class="notif-hist-dot"></span>') +
        _rjapEscapeHtml(n.title) + "</div>" +
        (n.body ? '<div class="notif-hist-body">' + _rjapEscapeHtml(n.body) + "</div>" : "") +
        '<div class="notif-hist-time">' + _rjapFormatNotifTime(n.ts) + "</div>";
      listEl.appendChild(row);
    }
  }
  modal.classList.add("show");
  _rjapMarkAllNotifRead(); // opening the inbox counts as reading it
}

function rjapCloseNotifHistory() {
  const modal = document.getElementById("notifHistoryModal");
  if (modal) modal.classList.remove("show");
}

function _rjapEscapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// Sync badge counts as soon as the DOM is ready, independent of sign-in/push
// registration timing — the history itself is local, so it's always
// available immediately even before any network/auth activity finishes.
document.addEventListener("DOMContentLoaded", () => {
  _rjapUpdateNotifBadges();
});

async function lcRegisterPush() {
  if (!fbUser || !fbDb) return false; // tokens are stored per signed-in user
  const granted = await lcRequestNotifPermission();
  if (!granted) return false;

  let token = null;
  try {
    if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseMessaging) {
      const { FirebaseMessaging } = window.Capacitor.Plugins;
      await FirebaseMessaging.requestPermissions();
      const res = await FirebaseMessaging.getToken();
      token = res && res.token;
      FirebaseMessaging.addListener("notificationReceived", (event) => {
        const n = event && event.notification;
        if (n) {
          toast("🔔 " + (n.title || "Notification"));
          _rjapAddNotifHistory(n.title, n.body);
        }
      });
    } else if (typeof firebase !== "undefined" && firebase.messaging && FCM_VAPID_KEY) {
      const messaging = firebase.messaging();
      const reg = await navigator.serviceWorker.ready;
      token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
      messaging.onMessage((payload) => {
        const n = payload && payload.notification;
        if (n) {
          toast("🔔 " + (n.title || "Notification"));
          _rjapAddNotifHistory(n.title, n.body);
        }
      });
    }
  } catch (e) {
    console.error("Push registration failed:", e);
  }

  // A token alone isn't "enabled" — it only counts once it's actually
  // saved server-side, since that's the only copy the broadcast function
  // ever reads. Previously this returned true (and the UI showed
  // "✅ Push notifications enabled") as soon as a token was obtained,
  // even if the Firestore save below silently failed — so the toggle
  // could show ON while the server had 0 registered devices.
  let saved = false;
  if (token) {
    try {
      await fbDb.collection("users").doc(fbUser.uid).collection("data").doc("main").set(
        { fcmToken: token, fcmTokenPlatform: _lcIsNative() ? "android" : "web", fcmTokenUpdatedAt: Date.now() },
        { merge: true },
      );
      saved = true;
      localStorage.setItem("rjap_push_enabled", "1");
    } catch (e) {
      console.error("Saving FCM token failed — device will NOT receive broadcasts until this succeeds:", e);
      try { localStorage.removeItem("rjap_push_enabled"); } catch (_) {}
    }
  }
  return saved;
}

async function lcUnregisterPush() {
  try { localStorage.removeItem("rjap_push_enabled"); } catch (e) {}
  if (!fbUser || !fbDb) return;
  try {
    await fbDb.collection("users").doc(fbUser.uid).collection("data").doc("main").set(
      { fcmToken: firebase.firestore.FieldValue.delete() },
      { merge: true },
    );
  } catch (e) {}
}

// Developer-only: prompt for a title/body and push it to every user who has
// Push Notifications enabled, via the sendBroadcastNotification Cloud
// Function (server-side checks the same developer email list).
window.sendDevBroadcast = async function () {
  if (!isDeveloper()) return;
  const title = prompt("Notification title:", "🙏 Radha Naam Jap");
  if (title === null || !title.trim()) return;
  const body = prompt("Notification message:");
  if (body === null || !body.trim()) return;
  try {
    const callable = firebase.app().functions().httpsCallable("sendBroadcastNotification");
    const res = await callable({ title: title.trim(), body: body.trim() });
    toast("📣 Sent to " + ((res.data && res.data.sent) || 0) + " device(s)");
  } catch (e) {
    console.error("Broadcast failed:", e);
    toast("⚠️ Broadcast failed — check console");
  }
};

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
    nameJapDeduct28: 0,
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
    // Which jap types count toward the Milestones (Bhagvat Prapti) total.
    // Defaults to all types so existing users see no change until they
    // customize it themselves in the Milestones tab.
    msConsider: { radha: true, rv: true, hk: true, kv: true, ss: true, ram: true, n28: true },
    historyHK: {},
    timerHistoryHK: {},
    dtHK: 0,
    malaLogHK: [],
    syncBaselineHK: {},
    syncBaselineTimerHK: {},
    nameJapDeductHK: 0,
    historyRam: {},
    timerHistoryRam: {},
    dtRam: 0,
    ltRam: 0,
    malaLogRam: [],
    syncBaselineRam: {},
    syncBaselineTimerRam: {},
    nameJapDeductRam: 0,
    historyKV: {},
    timerHistoryKV: {},
    dtKV: 0,
    ltKV: 0,
    nameJapDeductKV: 0,
    malaLogKV: [],
    syncBaselineKV: {},
    syncBaselineTimerKV: {},
    historySS: {},
    timerHistorySS: {},
    dtSS: 0,
    ltSS: 0,
    nameJapDeductSS: 0,
    malaLogSS: [],
    syncBaselineSS: {},
    syncBaselineTimerSS: {},
    dedications: [], // {id, type:'radha'|'rv'|'kv'|'ss', amount, purpose, note, date, ts}
    gaudiyaMode: false,  // single mode for all — Gaudiya/ISKCON
    trahimamMode: false,  // single mode for all — Trahimam Trahimam (KV jap only)
    ramanandiMode: false,  // single mode for all — Ramanandi (Raam Vijay Mantra jap only)
    hkLang: "hi",
    naamLang: "sa",  // Radha / Radha Vallabh / Samba Sadashiv jap text script: "sa" (Sanskrit/Devanagari) or "bn" (Bangla)
    lbOptIn: false,        // leaderboard opt-in
    lbDisplayName: "",     // leaderboard display name
    driveBackupDailyEnabled: false,  // opt-in daily auto-backup to Google Drive
    driveBackupHour: 3,    // 0-23, device-local time — default 3 AM
    driveBackupMinute: 0,  // 0-59
    bgRadhaVallabh: 1,
    bgHitju: 1,
    bgGurudev: 1,
    bgCM: 1,
    bgIskconAcharya: 1,
    bgIskconGurudev: 1,
    // ── Screen Time / Stotram Time (per-day, seconds) ──
    // screenTimeHistory: time on jap displays (main Jap tab + 28 Names tab)
    // while the app is in the foreground. Pauses on backgrounding/tab-away;
    // does NOT pause on idle. stotramTimeHistory is tracked separately and
    // never counts toward Screen Time.
    screenTimeHistory: {},
    stotramTimeHistory: {},
    // ── Manual jap tracking (per-day, per jap type) ──
    // When jap is entered by hand via "Add/Deduct Jap Manually" or the
    // 28 Names cycle add (i.e. chanted at a real mala/off-screen and
    // reported after the fact), it correctly still counts toward total
    // name jap and Actual Jap Time — but must NOT count toward Efficiency
    // or Quality, since neither the screen-time nor the pace of that jap
    // was actually observed by the app. manualJapCount/manualJapTime hold
    // the portion of each day's name-jap count / timer seconds that came
    // from manual entry, per type key (radha/rv/kv/ss/hk/n28), so the
    // Efficiency and Quality calculations can subtract it back out.
    manualJapCount: { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
    manualJapTime:  { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
  },
  lmcRV: 0,
  lmcHK: 0,
  lmcKV: 0,
  lmcSS: 0,
  lmcRam: 0,
  lmc: 0,
  lm28: 0,
  timerRunning: false,
  timerSeconds: 0,           // (A) sessionSeconds — cumulative chanting time since app open. Never resets on mala complete.
  timerInterval: null,
  timerSavedSeconds: 0,      // session committed-to-history high-water mark (used only for partial in-progress live deltas on session pause)
  autoStopTimeout: null,
  _autoStopToken: 0,         // monotonic token to invalidate stale auto-pause timeouts (see tapTimer / malaOk)
  malaWallStart: 0,          // Date.now() at start of current mala (persisted in localStorage)
  // (B) currentMalaSeconds — active chanting time for the CURRENT mala only.
  // Resets to 0 when a mala completes AND when a new mala starts. Never leaks across malas.
  currentMalaSeconds: 0,
  _currentMalaStartTs: null, // Date.now() captured when the current mala's first bead was tapped
  _activeJapMode: null, // "main" | "n28" — which jap flow was tapped most recently
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
      const req = indexedDB.open("RadhaJapDB", 5);
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
        // v5: PERMANENT gift ledger — one record per gift, keyed by its own
        // id. Deliberately isolated from the "state" blob: it is never part
        // of the App.S = {...} reset that runs on every UID change/cold
        // start, and it is never overwritten wholesale by a cloud pull.
        // Each entry is written individually and only ever added to —
        // this is what makes it survive the race that can drop an entry
        // out of App.S.dedications (see addPermanentGift()/loadGiftLedger()).
        if (!db.objectStoreNames.contains("giftLedger"))
          db.createObjectStore("giftLedger");
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
    // GHOST MODE: never write to IDB while viewing another user's data.
    if (isGhostMode()) return;
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
      nameJapDeduct28: this.S.nameJapDeduct28 || 0,
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
      historyKV: this.S.historyKV || {},
      timerHistoryKV: this.S.timerHistoryKV || {},
      dtKV: this.S.dtKV || 0,
      ltKV: this.S.ltKV || 0,
      malaLogKV: this.S.malaLogKV || [],
      syncBaselineKV: this.S.syncBaselineKV || {},
      syncBaselineTimerKV: this.S.syncBaselineTimerKV || {},
      nameJapDeductKV: this.S.nameJapDeductKV || 0,
      historySS: this.S.historySS || {},
      timerHistorySS: this.S.timerHistorySS || {},
      dtSS: this.S.dtSS || 0,
      ltSS: this.S.ltSS || 0,
      malaLogSS: this.S.malaLogSS || [],
      syncBaselineSS: this.S.syncBaselineSS || {},
      syncBaselineTimerSS: this.S.syncBaselineTimerSS || {},
      nameJapDeductSS: this.S.nameJapDeductSS || 0,
      historyRam: this.S.historyRam || {},
      timerHistoryRam: this.S.timerHistoryRam || {},
      dtRam: this.S.dtRam || 0,
      ltRam: this.S.ltRam || 0,
      malaLogRam: this.S.malaLogRam || [],
      syncBaselineRam: this.S.syncBaselineRam || {},
      syncBaselineTimerRam: this.S.syncBaselineTimerRam || {},
      nameJapDeductRam: this.S.nameJapDeductRam || 0,
      dedications: this.S.dedications || [],
      gaudiyaMode: this.S.gaudiyaMode || false,
      trahimamMode: this.S.trahimamMode || false,
      ramanandiMode: this.S.ramanandiMode || false,
      dt28Cycles: this.S.dt28Cycles || 0,
      milestones: this.S.milestones || { reached: {}, lastChecked: 0 },
      msConsider: this.S.msConsider || { radha: true, rv: true, hk: true, kv: true, ss: true, ram: true, n28: true },
      hkLang: this.S.hkLang || "hi",
      naamLang: this.S.naamLang || "sa",
      lastLat: this.S.lastLat ?? null,
      lastLng: this.S.lastLng ?? null,
      screenTimeHistory: this.S.screenTimeHistory || {},
      stotramTimeHistory: this.S.stotramTimeHistory || {},
      manualJapCount: this.S.manualJapCount || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
      manualJapTime: this.S.manualJapTime || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
      lbDisplayName: this.S.lbDisplayName || "",
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
    // PERMANENT gift ledger — its own store, keyed by gift id. Never
    // touched by the App.S = {...} reset on UID change, so it can't be
    // wiped the way App.S.dedications can be.
    this.S.giftLedger = await this.dbGetAll("giftLedger");

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
      // Screen Time / Stotram Time tick every second to localStorage directly
      // (lighter than a full IDB save each second) — merge in anything newer
      // than what the "state" IDB record captured at last pause/save.
      if (!this.S.screenTimeHistory) this.S.screenTimeHistory = {};
      if (!this.S.stotramTimeHistory) this.S.stotramTimeHistory = {};
      const stRaw = localStorage.getItem("rjap_screenTimeHistory");
      if (stRaw) {
        const st = JSON.parse(stRaw);
        for (const k in st) {
          if ((st[k] || 0) > (this.S.screenTimeHistory[k] || 0))
            this.S.screenTimeHistory[k] = st[k];
        }
      }
      const sttRaw = localStorage.getItem("rjap_stotramTimeHistory");
      if (sttRaw) {
        const stt = JSON.parse(sttRaw);
        for (const k in stt) {
          if ((stt[k] || 0) > (this.S.stotramTimeHistory[k] || 0))
            this.S.stotramTimeHistory[k] = stt[k];
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
    if (this.S.trahimamMode === undefined) this.S.trahimamMode = false;
    if (this.S.ramanandiMode === undefined) this.S.ramanandiMode = false;
    if (!this.S.historyRam) this.S.historyRam = {};
    if (!this.S.timerHistoryRam) this.S.timerHistoryRam = {};
    if (this.S.dtRam === undefined) this.S.dtRam = 0;
    if (this.S.ltRam === undefined) this.S.ltRam = 0;
    if (!this.S.malaLogRam) this.S.malaLogRam = [];
    if (!this.S.syncBaselineRam) this.S.syncBaselineRam = {};
    if (!this.S.syncBaselineTimerRam) this.S.syncBaselineTimerRam = {};
    if (this.S.nameJapDeductRam === undefined) this.S.nameJapDeductRam = 0;
    if (!this.S.historyRam[this.S.tk]) this.S.historyRam[this.S.tk] = 0;
    if (!this.S.timerHistoryRam[this.S.tk]) this.S.timerHistoryRam[this.S.tk] = 0;
    // Load malaLogRam — only keep if from today AND today has Ramanandi jap
    const todayRamJap = this.S.historyRam[this.S.tk] || 0;
    if (todayRamJap <= 0) {
      this.S.malaLogRam = [];
    }
    if (!this.S.hkLang) this.S.hkLang = "hi";
    if (!this.S.naamLang) this.S.naamLang = "sa";
    if (this.S.bgIskconAcharya === undefined) this.S.bgIskconAcharya = 1;
    if (this.S.bgIskconGurudev === undefined) this.S.bgIskconGurudev = 1;
    if (this.S.bgCM === undefined) this.S.bgCM = 1;
    if (!this.S.historyHK[this.S.tk]) this.S.historyHK[this.S.tk] = 0;
    if (!this.S.timerHistoryHK[this.S.tk]) this.S.timerHistoryHK[this.S.tk] = 0;
    // Load malaLogHK — only keep if today has HK jap
    const todayHKJap = this.S.historyHK[this.S.tk] || 0;
    if (todayHKJap <= 0) this.S.malaLogHK = [];
    if (!this.S.historyRV[this.S.tk]) this.S.historyRV[this.S.tk] = 0;
    if (!this.S.timerHistoryRV[this.S.tk]) this.S.timerHistoryRV[this.S.tk] = 0;
    if (!this.S.historyKV) this.S.historyKV = {};
    if (!this.S.timerHistoryKV) this.S.timerHistoryKV = {};
    if (!this.S.dtKV) this.S.dtKV = 0;
    if (!this.S.ltKV) this.S.ltKV = 0;
    if (!this.S.nameJapDeductKV) this.S.nameJapDeductKV = 0;
    if (!this.S.malaLogKV) this.S.malaLogKV = [];
    // Load malaLogKV — only keep if from today AND today has KV jap
    const todayKVJap = this.S.historyKV[this.S.tk] || 0;
    if (todayKVJap <= 0) {
      this.S.malaLogKV = [];
    }
    if (!this.S.historySS) this.S.historySS = {};
    if (!this.S.timerHistorySS) this.S.timerHistorySS = {};
    if (!this.S.dtSS) this.S.dtSS = 0;
    if (!this.S.ltSS) this.S.ltSS = 0;
    if (!this.S.nameJapDeductSS) this.S.nameJapDeductSS = 0;
    if (!this.S.malaLogSS) this.S.malaLogSS = [];
    if (!this.S.historySS[this.S.tk]) this.S.historySS[this.S.tk] = 0;
    if (!this.S.timerHistorySS[this.S.tk]) this.S.timerHistorySS[this.S.tk] = 0;
    if (!this.S.syncBaselineSS) this.S.syncBaselineSS = {};
    if (!this.S.syncBaselineTimerSS) this.S.syncBaselineTimerSS = {};
    // Load malaLogSS — only keep if from today AND today has SS jap
    const todaySSJap = this.S.historySS[this.S.tk] || 0;
    if (todaySSJap <= 0) {
      this.S.malaLogSS = [];
    }
    if (!this.S.dedications) this.S.dedications = [];
    if (!this.S.screenTimeHistory) this.S.screenTimeHistory = {};
    if (!this.S.stotramTimeHistory) this.S.stotramTimeHistory = {};
    if (!this.S.msConsider) this.S.msConsider = { radha: true, rv: true, hk: true, kv: true, ss: true, ram: true, n28: true };
    if (!this.S.syncBaselineKV) this.S.syncBaselineKV = {};
    if (!this.S.syncBaselineTimerKV) this.S.syncBaselineTimerKV = {};
    if (!this.S.historyKV[this.S.tk]) this.S.historyKV[this.S.tk] = 0;
    if (!this.S.timerHistoryKV[this.S.tk]) this.S.timerHistoryKV[this.S.tk] = 0;
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
    return this.tkFromDate(d);
  },

  // Build a YYYY-MM-DD key from a Date using LOCAL (GPS-driven) fields.
  // Never use toISOString() for date keys — that returns UTC and shifts
  // the day boundary for any user not at UTC+0.
  tkFromDate(d) {
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
    if (this.S.japMode === "kv") return (this.S.historyKV || {})[this.S.tk] || 0;
    if (this.S.japMode === "ss") return this.S.historySS[this.S.tk] || 0;
    if (this.S.japMode === "ram") return (this.S.historyRam || {})[this.S.tk] || 0;
    return this.S.history[this.S.tk] || 0;
  },
  // Combined today: radha + RV + KV (or HK-only in gaudiyaMode, SS-only in trahimamMode [Gopeshwar Mahadev], Ram-only in ramanandiMode)
  gTodCombined() {
    if (this.S.gaudiyaMode) return this.S.historyHK[this.S.tk] || 0;
    if (this.S.trahimamMode) return this.S.historySS[this.S.tk] || 0;
    if (this.S.ramanandiMode) return (this.S.historyRam || {})[this.S.tk] || 0;
    return (
      (this.S.history[this.S.tk] || 0) + (this.S.historyRV[this.S.tk] || 0) + ((this.S.historyKV || {})[this.S.tk] || 0)
    );
  },
  gTot() {
    // COMBINED lifetime total from radha+RV+KV (or HK-only in gaudiyaMode, SS-only in trahimamMode [Gopeshwar Mahadev], Ram-only in ramanandiMode)
    if (this.S.gaudiyaMode) {
      return Math.max(
        0,
        Object.values(this.S.historyHK || {}).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductHK || 0),
      );
    }
    if (this.S.trahimamMode) {
      return Math.max(
        0,
        Object.values(this.S.historySS || {}).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductSS || 0),
      );
    }
    if (this.S.ramanandiMode) {
      return Math.max(
        0,
        Object.values(this.S.historyRam || {}).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductRam || 0),
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
    const kvTotal = Math.max(
      0,
      Object.values(this.S.historyKV || {}).reduce((a, b) => a + b, 0) -
        (this.S.nameJapDeductKV || 0),
    );
    return radhaTotal + rvTotal + kvTotal;
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
    if (this.S.japMode === "kv")
      return Math.max(
        0,
        Object.values(this.S.historyKV || {}).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductKV || 0),
      );
    if (this.S.japMode === "ss")
      return Math.max(
        0,
        Object.values(this.S.historySS || {}).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductSS || 0),
      );
    if (this.S.japMode === "ram")
      return Math.max(
        0,
        Object.values(this.S.historyRam || {}).reduce((a, b) => a + b, 0) -
          (this.S.nameJapDeductRam || 0),
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
    if (this.S.japMode === "kv") return this.S.historyKV || {};
    if (this.S.japMode === "ss") return this.S.historySS || {};
    if (this.S.japMode === "ram") return this.S.historyRam || {};
    return this.S.history;
  },
  getCurTimerHistory() {
    if (this.S.japMode === "rv") return this.S.timerHistoryRV;
    if (this.S.japMode === "hk") return this.S.timerHistoryHK || {};
    if (this.S.japMode === "kv") return this.S.timerHistoryKV || {};
    if (this.S.japMode === "ss") return this.S.timerHistorySS || {};
    if (this.S.japMode === "ram") return this.S.timerHistoryRam || {};
    return this.S.timerHistory;
  },
  // Combined history: merge radha + RV + KV counts per day (or HK-only in gaudiyaMode, SS-only in trahimamMode [Gopeshwar Mahadev], Ram-only in ramanandiMode)
  getCombinedHistory() {
    if (this.S.gaudiyaMode)
      return JSON.parse(JSON.stringify(this.S.historyHK || {}));
    if (this.S.trahimamMode)
      return JSON.parse(JSON.stringify(this.S.historySS || {}));
    if (this.S.ramanandiMode)
      return JSON.parse(JSON.stringify(this.S.historyRam || {}));
    const combined = {};
    const h1 = this.S.history || {};
    const h2 = this.S.historyRV || {};
    const h3 = this.S.historyKV || {};
    const allKeys = new Set([...Object.keys(h1), ...Object.keys(h2), ...Object.keys(h3)]);
    allKeys.forEach((k) => {
      combined[k] = (h1[k] || 0) + (h2[k] || 0) + (h3[k] || 0);
    });
    return combined;
  },
  // Combined timer history: merge radha + RV + KV timer per day (or HK-only in gaudiyaMode, SS-only in trahimamMode [Gopeshwar Mahadev], Ram-only in ramanandiMode)
  getCombinedTimerHistory() {
    if (this.S.gaudiyaMode)
      return JSON.parse(JSON.stringify(this.S.timerHistoryHK || {}));
    if (this.S.trahimamMode)
      return JSON.parse(JSON.stringify(this.S.timerHistorySS || {}));
    if (this.S.ramanandiMode)
      return JSON.parse(JSON.stringify(this.S.timerHistoryRam || {}));
    const combined = {};
    const t1 = this.S.timerHistory || {};
    const t2 = this.S.timerHistoryRV || {};
    const t3 = this.S.timerHistoryKV || {};
    const allKeys = new Set([...Object.keys(t1), ...Object.keys(t2), ...Object.keys(t3)]);
    allKeys.forEach((k) => {
      combined[k] = (t1[k] || 0) + (t2[k] || 0) + (t3[k] || 0);
    });
    return combined;
  },
  // Whether the CURRENTLY selected main-jap sub-mode belongs to the same
  // group getCombinedTimerHistory() returns (R+RV+KV, or HK/SS/Ram-only in
  // their respective special modes) — used to decide whether the live
  // in-progress mala delta (currentMalaSeconds) should be added to a
  // Combined/Lifetime figure built from that group.
  isMainLiveInCombinedGroup() {
    if (this.S.gaudiyaMode) return this.S.japMode === "hk";
    if (this.S.trahimamMode) return this.S.japMode === "ss";
    if (this.S.ramanandiMode) return this.S.japMode === "ram";
    return this.S.japMode !== "hk" && this.S.japMode !== "ss" && this.S.japMode !== "ram";
  },
  getCurDt() {
    if (this.S.japMode === "rv") return this.S.dtRV;
    if (this.S.japMode === "hk") return this.S.dtHK || 0;
    if (this.S.japMode === "kv") return this.S.dtKV || 0;
    if (this.S.japMode === "ss") return this.S.dtSS || 0;
    if (this.S.japMode === "ram") return this.S.dtRam || 0;
    return this.S.dt;
  },
  getCurLt() {
    return this.S.lt;
  },
  // Combined Lifetime Target total: Radha + Radha Vallabh + Krishnay Vasudevay,
  // always summed together regardless of which mode is currently active (so
  // KV jap done during Trahimam Mode still counts toward this figure even
  // after switching back to Radha/RV).
  getLifetimeTargetTotal() {
    return this.getLifetimeTargetBreakdown().total;
  },

  // -- Per-category breakdown of the combined R+RV+KV lifetime total --
  // (HK/SS/Ram track separately and are intentionally not part of this
  // combined total, same as before this method existed.)
  getLifetimeTargetBreakdown() {
    const radhaTotal = Math.max(
      0,
      Object.values(this.S.history || {}).reduce((a, b) => a + b, 0) -
        (this.S.nameJapDeduct || 0),
    );
    const rvTotal = Math.max(
      0,
      Object.values(this.S.historyRV || {}).reduce((a, b) => a + b, 0) -
        (this.S.nameJapDeductRV || 0),
    );
    const kvTotal = Math.max(
      0,
      Object.values(this.S.historyKV || {}).reduce((a, b) => a + b, 0) -
        (this.S.nameJapDeductKV || 0),
    );
    return {
      radha: radhaTotal,
      rv: rvTotal,
      kv: kvTotal,
      total: radhaTotal + rvTotal + kvTotal,
    };
  },

  // -- Format the breakdown as "R:324+RV:432+KV:20"-style text, with the
  // currently active jap mode's category listed first. `perMala` divides
  // each category's count by mala size and shows up to 2 decimals (for
  // the "malas done" row); otherwise shows the raw counts (total row).
  formatLifetimeBreakdown(perMala) {
    const b = this.getLifetimeTargetBreakdown();
    const ms = this.S.ms || 108;
    const parts = {
      R: perMala ? (b.radha / ms).toFixed(2).replace(/\.00$/, "") + "m" : fmtIN(b.radha),
      RV: perMala ? (b.rv / ms).toFixed(2).replace(/\.00$/, "") + "m" : fmtIN(b.rv),
      KV: perMala ? (b.kv / ms).toFixed(2).replace(/\.00$/, "") + "m" : fmtIN(b.kv),
    };
    let order = ["R", "RV", "KV"];
    if (this.S.japMode === "rv") order = ["RV", "R", "KV"];
    else if (this.S.japMode === "kv") order = ["KV", "R", "RV"];
    return order.map((k) => k + ":" + parts[k]).join("+");
  },

  // ── Haptic Heartbeat ──
  // 10ms on every tap; triple long pulse (200-80-200-80-300ms) synced with mala complete
  vib(pat) {
    if (!this.S.cfg.vib) return;
    if (navigator.vibrate || _lcIsNative()) {
      try {
        lcVibrate(pat);
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
    const _tb1 = document.getElementById("timerBtn");
    if (_tb1) { _tb1.textContent = "⏸ Pause"; _tb1.className = "tbtn pause"; }
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      // Tick the per-mala counter in lockstep — but only while a mala is actually
      // in progress (start anchor is set) AND main Jap is the mode actually
      // being tapped right now. If a main-jap mala was left incomplete and the
      // devotee switched over to actively tap 28 Names, this must NOT keep
      // ticking in the background — otherwise it silently overlaps with the
      // 28 Names live delta and double-counts the same real seconds in
      // Today's Jap Time (see getTotalJapSecondsToday()).
      if (this._currentMalaStartTs !== null && this._activeJapMode !== "n28") this.currentMalaSeconds++;
      // Persist so per-mala duration survives app close / reopen
      try {
        localStorage.setItem("rjap_timerSeconds", String(this.timerSeconds));
        localStorage.setItem("rjap_currentMalaSeconds", String(this.currentMalaSeconds));
      } catch(e){}
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
    const _tb2 = document.getElementById("timerBtn");
    if (_tb2) { _tb2.textContent = "▶ Resume"; _tb2.className = "tbtn start"; }
    // Do NOT commit an unfinished mala into timerHistory here.
    // timerHistory is the sum of completed malas only; Today's Jap Time already
    // adds currentMalaSeconds live. Writing the delta on pause/resume causes the
    // visible time to double (6s becomes 12s) and corrupts later idle rollback.
    const delta = Math.max(0, this.timerSeconds - this.timerSavedSeconds);
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
    // Snapshot BOTH the session counter and the per-mala counter at the moment
    // of the last tap. When auto-pause fires later we roll back to these
    // snapshots so the idle gap is never counted as jap time.
    const secondsAtTap = this.timerSeconds;
    const malaSecondsAtTap = this.currentMalaSeconds;
    // per-mode idle timeout fix — checks japMode directly (the single
    // source of truth for what's actively being tapped) rather than the
    // exclusive Settings-toggle booleans. This matters specifically for
    // KV, which has NO exclusive toggle at all — it's only ever reached
    // via japMode === "kv" — so checking trahimamMode (which is actually
    // SS, not KV, despite its name) never covered KV. HK and Ram Vijay
    // Mantra are checked the same way for consistency, since their
    // exclusive toggles already keep japMode in sync via switchJapMode().
    // Base idle timeout raised 6s -> 10s; the modes that already ran longer
    // than the base (KV, HK, Raam Vijay Mantra) keep their extra +5s on
    // top of the new 10s base.
    const idleMs = this.S.japMode === "kv" ? 25000
      : this.S.japMode === "hk" ? 30000
      : this.S.japMode === "ram" ? 15000
      : 10000;                                   // Radha, RV, SS, 28 Names
    // Token so malaOk() can invalidate this pending autoStop if a mala
    // completes between now and the deadline (prevents leaking the
    // previous mala's snapshot into the next mala — Bug #2 root cause).
    const token = ++this._autoStopToken;
    this.autoStopTimeout = setTimeout(() => {
      if (token !== this._autoStopToken) return; // invalidated by malaOk
      this.timerSeconds = secondsAtTap;
      this.currentMalaSeconds = malaSecondsAtTap;
      this.timerSavedSeconds = secondsAtTap;
      try {
        localStorage.setItem("rjap_timerSeconds", String(this.timerSeconds));
        localStorage.setItem("rjap_currentMalaSeconds", String(this.currentMalaSeconds));
      } catch(_){ }
      const td = document.getElementById("timerDisplay");
      if (td) td.textContent = this.fmtTime(this.timerSeconds);
      this.updateTimerToday();
      this.pauseTimer();
    }, idleMs);
  },

  toggleTimer() {
    clearTimeout(this.autoStopTimeout);
    if (this.timerRunning) this.pauseTimer();
    else this.tapTimer();
  },

  resetTimer() {
    clearTimeout(this.autoStopTimeout);
    this._autoStopToken++; // invalidate any in-flight autoStop
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerRunning = false;
    this.timerSeconds = 0;
    this.timerSavedSeconds = 0;
    this._malaTimerStart = 0;
    this.currentMalaSeconds = 0;
    this._currentMalaStartTs = null;
    try {
      localStorage.setItem("rjap_timerSeconds", "0");
      localStorage.setItem("rjap_currentMalaSeconds", "0");
    } catch(_){}
    document.getElementById("timerDisplay").textContent = App.fmtTime(App.timerSeconds);
    document.getElementById("timerDisplay").classList.remove("running");
    const _tb3 = document.getElementById("timerBtn");
    if (_tb3) { _tb3.textContent = "▶ Start"; _tb3.className = "tbtn start"; }
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
    const kvSec    = (this.S.timerHistoryKV || {})[tk] || 0;
    const ssSec    = (this.S.timerHistorySS || {})[tk] || 0;
    const n28Sec   = (this.S.timer28History || {})[tk] || 0;
    // Live delta for the IN-PROGRESS mala only. timerHistory[tk] already holds
    // the sum of COMPLETED mala durations (kept in sync by syncTimerFromMalaLog),
    // so adding currentMalaSeconds gives today's true running total without
    // double-counting completed malas.
    // Only count this live delta while main Jap is the actively-tapped mode —
    // otherwise (e.g. a main mala left incomplete while actively tapping 28
    // Names) it would double-count the same real seconds alongside live28.
    const liveJap = this._activeJapMode === "n28" ? 0 : (this.currentMalaSeconds || 0);
    // live delta from the 28-Names timer (elapsed since session start − already flushed)
    let live28 = 0;
    if (this._activeJapMode !== "main" && this._n28TotalStart && !this._n28Paused) {
      const elapsed = Math.floor((Date.now() - this._n28TotalStart) / 1000);
      live28 = Math.max(0, elapsed - (this._n28SavedSecs || 0));
    }
    return radhaSec + rvSec + hkSec + kvSec + ssSec + n28Sec + liveJap + live28;
  },

  updateTimerToday() {
    // ── UNIFIED: Today's Jap Time shared by Radha/RV/HK page AND 28 Names tab ──
    const combinedSec = this.getTotalJapSecondsToday();
    const tt = document.getElementById("timerToday2") || document.getElementById("timerToday");
    if (tt) tt.textContent = this.fmtTime(combinedSec);
    // Mirror the SAME total on the 28 Names tab
    const te28 = document.getElementById("n28TotalTimer");
    if (te28) te28.textContent = this.fmtTime(combinedSec);
    // Mirror the SESSION timer (identical to main jap Session display) on 28 Names tab
    const se28 = document.getElementById("n28SessionDisplay");
    if (se28) {
      se28.textContent = this.fmtTime(this.timerSeconds);
      // Reflect the ACTUAL running state (this.timerRunning), not just
      // "timerSeconds is nonzero" — timerSeconds stays positive forever
      // once chanting starts (it never resets on pause or mala/cycle
      // completion), so the old check kept the "running" look on even
      // after the session timer had genuinely stopped/paused.
      if (this.timerRunning) se28.classList.add("running");
      else se28.classList.remove("running");
    }
  },

  // ── Screen Time (how long the devotee is actually on a jap display) ──
  // Runs only while the app is foreground/visible AND the active view is
  // the main Jap screen (vj) or the 28 Names screen (v28). Never runs for
  // Stotram or any other tab. Unlike the jap idle-timer (autoStop), Screen
  // Time is NEVER paused for inactivity — only by backgrounding/leaving
  // the jap screen. Stotram usage is tracked separately (stotramTimeHistory)
  // and never counts toward Screen Time.
  _screenTimeRunning: false,
  _screenTimeInterval: null,
  startScreenTime() {
    if (this._screenTimeRunning) return;
    if (document.visibilityState === "hidden") return; // never start while backgrounded
    this._screenTimeRunning = true;
    this._screenTimeInterval = setInterval(() => {
      if (!this.S.screenTimeHistory) this.S.screenTimeHistory = {};
      const tk = this.S.tk;
      this.S.screenTimeHistory[tk] = (this.S.screenTimeHistory[tk] || 0) + 1;
      try {
        localStorage.setItem("rjap_screenTimeHistory", JSON.stringify(this.S.screenTimeHistory));
      } catch (e) {}
      this.updateScreenTimeDisplay();
    }, 1000);
  },
  pauseScreenTime() {
    if (!this._screenTimeRunning) return;
    clearInterval(this._screenTimeInterval);
    this._screenTimeInterval = null;
    this._screenTimeRunning = false;
    this.save();
  },
  updateScreenTimeDisplay() {
    const sec = (this.S.screenTimeHistory && this.S.screenTimeHistory[this.S.tk]) || 0;
    const e1 = document.getElementById("screenTimeDisplay");
    if (e1) e1.textContent = this.fmtTime(sec);
    const e2 = document.getElementById("n28ScreenTimeDisplay");
    if (e2) e2.textContent = this.fmtTime(sec);
  },

  // ── Stotram Time — separate from Screen Time. Only ticks while the
  // Stotram tab is the active, visible view. Shown in Statistics only. ──
  _stotramTimeRunning: false,
  _stotramTimeInterval: null,
  startStotramTime() {
    if (this._stotramTimeRunning) return;
    if (document.visibilityState === "hidden") return;
    this._stotramTimeRunning = true;
    this._stotramTimeInterval = setInterval(() => {
      if (!this.S.stotramTimeHistory) this.S.stotramTimeHistory = {};
      const tk = this.S.tk;
      this.S.stotramTimeHistory[tk] = (this.S.stotramTimeHistory[tk] || 0) + 1;
      try {
        localStorage.setItem("rjap_stotramTimeHistory", JSON.stringify(this.S.stotramTimeHistory));
      } catch (e) {}
    }, 1000);
  },
  pauseStotramTime() {
    if (!this._stotramTimeRunning) return;
    clearInterval(this._stotramTimeInterval);
    this._stotramTimeInterval = null;
    this._stotramTimeRunning = false;
    this.save();
  },

  // Resume whichever of Screen Time / Stotram Time matches the view that's
  // currently active in the DOM — used on app foreground / init.
  resumeTimeForActiveView() {
    const activeView = document.querySelector(".view.active");
    const id = activeView && activeView.id;
    if (id === "vj" || id === "v28") {
      this.pauseStotramTime();
      this.startScreenTime();
    } else if (id === "vst") {
      this.pauseScreenTime();
      this.startStotramTime();
    } else {
      this.pauseScreenTime();
      this.pauseStotramTime();
    }
  },

  // ── UNIFIED TIME: sync timerHistory[today] = sum of mala log entries ──
  // Called after any mala log change so all time displays stay in harmony.
  syncTimerFromMalaLog() {
    // Always sync ALL modes independently — mode switching must not corrupt any
    const radhaSum = (this.S.malaLog || []).reduce((a, b) => a + b, 0);
    const rvSum = (this.S.malaLogRV || []).reduce((a, b) => a + b, 0);
    const hkSum = (this.S.malaLogHK || []).reduce((a, b) => a + b, 0);
    const kvSum = (this.S.malaLogKV || []).reduce((a, b) => a + b, 0);
    const ssSum = (this.S.malaLogSS || []).reduce((a, b) => a + b, 0);
    const ramSum = (this.S.malaLogRam || []).reduce((a, b) => a + b, 0);
    if (!this.S.timerHistory) this.S.timerHistory = {};
    if (!this.S.timerHistoryRV) this.S.timerHistoryRV = {};
    if (!this.S.timerHistoryHK) this.S.timerHistoryHK = {};
    if (!this.S.timerHistoryKV) this.S.timerHistoryKV = {};
    if (!this.S.timerHistorySS) this.S.timerHistorySS = {};
    if (!this.S.timerHistoryRam) this.S.timerHistoryRam = {};
    if (radhaSum > 0 || (this.S.malaLog || []).length > 0)
      this.S.timerHistory[this.S.tk] = radhaSum;
    if (rvSum > 0 || (this.S.malaLogRV || []).length > 0)
      this.S.timerHistoryRV[this.S.tk] = rvSum;
    if (hkSum > 0 || (this.S.malaLogHK || []).length > 0)
      this.S.timerHistoryHK[this.S.tk] = hkSum;
    if (kvSum > 0 || (this.S.malaLogKV || []).length > 0)
      this.S.timerHistoryKV[this.S.tk] = kvSum;
    if (ssSum > 0 || (this.S.malaLogSS || []).length > 0)
      this.S.timerHistorySS[this.S.tk] = ssSum;
    if (ramSum > 0 || (this.S.malaLogRam || []).length > 0)
      this.S.timerHistoryRam[this.S.tk] = ramSum;
    // Re-anchor timerSavedSeconds so live delta is measured from current position
    this.timerSavedSeconds = this.timerSeconds;
  },

  // ── Get mala log sum for today (excludes live in-progress mala) ──
  getMalaLogSum() {
    const isRV = this.S.japMode === "rv";
    const isHK = this.S.japMode === "hk";
    const isKV = this.S.japMode === "kv";
    const isSS = this.S.japMode === "ss";
    const isRam = this.S.japMode === "ram";
    const log = isRV
      ? this.S.malaLogRV || []
      : isHK
        ? this.S.malaLogHK || []
        : isKV
          ? this.S.malaLogKV || []
          : isSS
            ? this.S.malaLogSS || []
            : isRam
              ? this.S.malaLogRam || []
              : this.S.malaLog || [];
    return log.reduce((a, b) => a + b, 0);
  },
  ua() {
    const tod = this.gTod(),
      ms = this.S.ms || 108;
    const tot = this.getLifetimeTargetTotal(); // COMBINED Radha+RV+KV lifetime total
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
    const dP = curDt > 0 ? Math.round((tod / curDt) * 100) : 0;
    const lP = curLt > 0 ? Math.round((tot / curLt) * 100) : 0;
    const dBarPct = Math.min(100, dP);
    const lBarPct = Math.min(100, lP);
    // Daily bar (blue) — mode-specific
    const dPctEl = document.getElementById("dPct");
    const dFill  = document.getElementById("dbarFill");
    dPctEl.textContent = dP + "%";
    dFill.style.width = dBarPct + "%";
    if (dP >= 100) {
      dPctEl.style.color = "#FFD700";
      dFill.style.background = "linear-gradient(90deg,var(--a2),#FFD700,var(--a2))";
      dFill.style.backgroundSize = "200% 100%";
      dFill.style.animation = "barOverflow 1.8s ease-in-out infinite";
    } else {
      dPctEl.style.color = "";
      dFill.style.background = "linear-gradient(90deg,var(--a2),var(--a))";
      dFill.style.backgroundSize = "";
      dFill.style.animation = "none";
    }
    document.getElementById("dbarDone").textContent = fmtIN(tod);
    document.getElementById("dbarTarget").textContent =
      "/ " + (curDt ? fmtIN(curDt) : "—");
    document.getElementById("dDet").textContent = md + " malas done";
    // Lifetime bar (gold) — COMBINED total, shared target
    const lPctEl = document.getElementById("lPct");
    const lFill  = document.getElementById("lbarFill");
    lPctEl.textContent = lP + "%";
    lFill.style.width = lBarPct + "%";
    if (lP >= 100) {
      lPctEl.style.color = "#FFD700";
      lFill.style.background = "linear-gradient(90deg,var(--gold),#fff,var(--gold))";
      lFill.style.backgroundSize = "200% 100%";
      lFill.style.animation = "barOverflow 1.8s ease-in-out infinite";
    } else {
      lPctEl.style.color = "";
      lFill.style.background = "linear-gradient(90deg,var(--gold),#FFB700)";
      lFill.style.backgroundSize = "";
      lFill.style.animation = "none";
    }
    document.getElementById("lbarDone").textContent = fmtIN(tot);
    document.getElementById("lbarTarget").textContent =
      "/ " + (curLt ? fmtIN(curLt) : "—");
    const lBreakdownTotalEl = document.getElementById("lBreakdownTotal");
    if (lBreakdownTotalEl) lBreakdownTotalEl.textContent = this.formatLifetimeBreakdown(false).replace(/\+/g, " · ");
    document.getElementById("lDet").textContent = Math.floor(tot / ms) + " malas Done";
    const lBreakdownDetailEl = document.getElementById("lBreakdownDetail");
    if (lBreakdownDetailEl) lBreakdownDetailEl.textContent = this.formatLifetimeBreakdown(true).replace(/\+/g, " · ");
    this.updateTimerToday();
    if (typeof renderBeadFrame === "function") renderBeadFrame(tod, curDt);
    uStats();
  },

  // ── Set wall-clock start for new mala if needed ──
  ensureMalaWallStart() {
    const ms = this.S.ms || 108;
    const countInMala = this.gTod() % ms;
    // First bead of a new mala, OR no in-progress mala recorded yet → start a fresh mala clock.
    if (countInMala === 1 || this.malaWallStart === 0 || this._currentMalaStartTs === null) {
      this.malaWallStart = Date.now();
      localStorage.setItem("rjap_malaWallStart", String(this.malaWallStart));
      // (B) Reset the per-mala counter. This is the ONLY place (besides malaOk)
      // that touches currentMalaSeconds — guarantees no leak from prior mala.
      this.currentMalaSeconds = 0;
      this._currentMalaStartTs = Date.now();
      try {
        localStorage.setItem("rjap_currentMalaSeconds", "0");
        localStorage.setItem("rjap_currentMalaStartTs", String(this._currentMalaStartTs));
      } catch(_){}
      // Legacy fields kept for backward compatibility but no longer authoritative.
      this._malaTimerStart = this.timerSeconds;
      localStorage.setItem("rjap_malaTimerStart", String(this._malaTimerStart));
      // Capture the GPS-local date this mala STARTED on so the whole mala
      // (including count + time) gets credited to the start date even if
      // it finishes after midnight.
      this.S.malaStartTk = this.getTk();
      this.S.malaStartMode = this.S.japMode;
      localStorage.setItem("rjap_malaStartTk", this.S.malaStartTk);
    }
  },

  // ── Mala Complete — Bell sound + TRIPLE vibration + log duration + animate timer ──
  malaOk() {
    const f = document.getElementById("mf");
    const isHKmala = this.S.japMode === "hk";
    const isRammala = this.S.japMode === "ram";
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
    } else if (isRammala) {
      showRamMalaComplete("जय श्री राम", "जय जय श्री सीताराम");
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
      const _malaNum = this[this.S.japMode === "rv" ? "lmcRV" : this.S.japMode === "hk" ? "lmcHK" : this.S.japMode === "kv" ? "lmcKV" : this.S.japMode === "ss" ? "lmcSS" : this.S.japMode === "ram" ? "lmcRam" : "lmc"];
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
    // ── Record mala duration using the per-mala counter (B) ──
    // currentMalaSeconds is the ONLY authoritative source for mala duration.
    // It contains active chanting seconds for THIS mala only and cannot leak
    // from prior malas. We never use sessionSeconds (timerSeconds) here.
    let malaDuration;
    if (this.currentMalaSeconds > 0) {
      malaDuration = this.currentMalaSeconds;
    } else if (this._currentMalaStartTs) {
      // Timer was never started this mala (e.g. user disabled active-tap timer) —
      // fall back to wall clock since the per-mala start anchor.
      malaDuration = Math.max(1, Math.round((Date.now() - this._currentMalaStartTs) / 1000));
    } else {
      // Last-resort wall-clock fallback (manual jap entry, etc.)
      malaDuration = Math.max(1, Math.round((Date.now() - this.malaWallStart) / 1000));
    }
    // CRITICAL Bug #2 fix: invalidate any pending autoStop from the completing
    // tap so its stale `secondsAtTap` snapshot cannot restore the prior mala's
    // counter value 6 s later and leak into the next mala.
    clearTimeout(this.autoStopTimeout);
    this._autoStopToken++;
    // Capture the REAL wall-clock start of this mala BEFORE we reset it
    const _malaRealStart = this._currentMalaStartTs || this.malaWallStart || (Date.now() - malaDuration * 1000);
    // Reset the per-mala counter (B) — next mala starts fresh from 0.
    // Done BEFORE pushing to log so any re-entrancy can't double-count.
    this.currentMalaSeconds = 0;
    this._currentMalaStartTs = null;
    this._malaTimerStart = this.timerSeconds; // legacy anchor, no longer authoritative
    this.malaWallStart = 0;
    try {
      localStorage.setItem("rjap_currentMalaSeconds", "0");
      localStorage.removeItem("rjap_currentMalaStartTs");
      localStorage.setItem("rjap_malaTimerStart", String(this._malaTimerStart));
      localStorage.setItem("rjap_malaWallStart", "0");
    } catch(_){}
    const isRVm = this.S.japMode === "rv";
    const isHKm = this.S.japMode === "hk";
    const isKVm = this.S.japMode === "kv";
    const isSSm = this.S.japMode === "ss";
    const isRamm = this.S.japMode === "ram";
    if (isRVm) {
      if (!this.S.malaLogRV) this.S.malaLogRV = [];
      this.S.malaLogRV.push(malaDuration);
    } else if (isHKm) {
      if (!this.S.malaLogHK) this.S.malaLogHK = [];
      this.S.malaLogHK.push(malaDuration);
    } else if (isKVm) {
      if (!this.S.malaLogKV) this.S.malaLogKV = [];
      this.S.malaLogKV.push(malaDuration);
    } else if (isSSm) {
      if (!this.S.malaLogSS) this.S.malaLogSS = [];
      this.S.malaLogSS.push(malaDuration);
    } else if (isRamm) {
      if (!this.S.malaLogRam) this.S.malaLogRam = [];
      this.S.malaLogRam.push(malaDuration);
    } else {
      if (!this.S.malaLog) this.S.malaLog = [];
      this.S.malaLog.push(malaDuration);
    }
    // Log mala completion with full timestamp
    // Use malaLog.length as the mala number — it's always the correct sequential count
    const malaNum = isRVm
      ? (this.S.malaLogRV || []).length
      : isHKm
        ? (this.S.malaLogHK || []).length
        : isKVm
          ? (this.S.malaLogKV || []).length
          : isSSm
            ? (this.S.malaLogSS || []).length
            : isRamm
              ? (this.S.malaLogRam || []).length
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
    // ── GPS START-DATE CREDITING ─────────────────────────────────────
    // If this mala started on a different GPS-local date than it finished
    // on (e.g. began 23:58 June 15, completed 00:59 June 16), move the
    // 108 count + the full malaDuration back to the start date.
    try {
      const _startTk = this.S.malaStartTk;
      const _endTk = this.getTk();
      if (_startTk && _startTk !== _endTk) {
        const _ms = this.S.ms || 108;
        const _mode = this.S.malaStartMode || this.S.japMode;
        const _hist =
          _mode === "rv" ? (this.S.historyRV = this.S.historyRV || {})
          : _mode === "hk" ? (this.S.historyHK = this.S.historyHK || {})
          : _mode === "kv" ? (this.S.historyKV = this.S.historyKV || {})
          : _mode === "ss" ? (this.S.historySS = this.S.historySS || {})
          : _mode === "ram" ? (this.S.historyRam = this.S.historyRam || {})
          : (this.S.history = this.S.history || {});
        const _moveCount = Math.min(_ms, _hist[_endTk] || 0);
        if (_moveCount > 0) {
          _hist[_endTk] = (_hist[_endTk] || 0) - _moveCount;
          _hist[_startTk] = (_hist[_startTk] || 0) + _moveCount;
        }
        // Move the mala's elapsed seconds from end-day bucket to start-day bucket.
        const _th =
          _mode === "rv" ? (this.S.timerHistoryRV = this.S.timerHistoryRV || {})
          : _mode === "hk" ? (this.S.timerHistoryHK = this.S.timerHistoryHK || {})
          : _mode === "kv" ? (this.S.timerHistoryKV = this.S.timerHistoryKV || {})
          : _mode === "ss" ? (this.S.timerHistorySS = this.S.timerHistorySS || {})
          : _mode === "ram" ? (this.S.timerHistoryRam = this.S.timerHistoryRam || {})
          : (this.S.timerHistory = this.S.timerHistory || {});
        const _moveSec = Math.min(malaDuration, _th[_endTk] || 0);
        if (_moveSec > 0) {
          _th[_endTk] = (_th[_endTk] || 0) - _moveSec;
          _th[_startTk] = (_th[_startTk] || 0) + _moveSec;
        }
        // Re-anchor live mala counters against the (now reduced) end-day bucket
        // so the next tap on the new day starts mala #1 fresh.
        this.lmc   = Math.floor((this.S.history   [_endTk] || 0) / _ms);
        this.lmcRV = Math.floor((this.S.historyRV [_endTk] || 0) / _ms);
        this.lmcHK = Math.floor(((this.S.historyHK||{})[_endTk] || 0) / _ms);
        this.lmcKV = Math.floor(((this.S.historyKV||{})[_endTk] || 0) / _ms);
        this.lmcSS = Math.floor(((this.S.historySS||{})[_endTk] || 0) / _ms);
        this.lmcRam = Math.floor(((this.S.historyRam||{})[_endTk] || 0) / _ms);
      }
    } catch (e) { console.warn("startTk credit:", e); }
    this.S.malaStartTk = "";
    this.S.malaStartMode = "";
    try { localStorage.removeItem("rjap_malaStartTk"); } catch(_){}
    // ── UNIFIED TIME: timerHistory[today] = sum of mala log entries ──
    // This keeps all time displays (timer, stats, mala log, B&C day view) in harmony.
    this.syncTimerFromMalaLog();
    this.save();
    // ── SESSION TIMER PERSISTS across malas (spec A) ─────────────────
    // sessionSeconds (timerSeconds) represents total active chanting time
    // since the app was opened. It MUST NOT reset on mala completion —
    // only on app restart, force-close, or manual reset.
    // Re-anchor timerSavedSeconds so any live-delta consumers measure
    // from the current session position.
    this.timerSavedSeconds = this.timerSeconds;
    try {
      localStorage.setItem("rjap_timerSeconds", String(this.timerSeconds));
    } catch(_){}
    const _td = document.getElementById("timerDisplay");
    if (_td) _td.textContent = this.fmtTime(this.timerSeconds);
    // ── PAUSE BOTH TIMERS ON MALA COMPLETION ──────────────────────────
    // On mala completion the Session Timer and Today's Jap timer must
    // pause together. (Today's Jap stops naturally because
    // currentMalaSeconds was just reset to 0; we must also explicitly
    // pause the running session interval so timerSeconds stops ticking.)
    // The next bead tap will call tapTimer() → startTimer() and both
    // counters resume in lockstep.
    if (this.timerRunning) this.pauseTimer();
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
    if (isGhostMode()) return; // ghost mode: read-only, no jap
    // Mark main Jap as the actively-tapped mode (see _activeJapMode below).
    this._activeJapMode = "main";
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
    const isKV = this.S.japMode === "kv";
    const isSS = this.S.japMode === "ss";
    const isRam = this.S.japMode === "ram";
    if (isRV) {
      this.S.historyRV[this.S.tk] = (this.S.historyRV[this.S.tk] || 0) + 1;
    } else if (isHK) {
      if (!this.S.historyHK) this.S.historyHK = {};
      this.S.historyHK[this.S.tk] = (this.S.historyHK[this.S.tk] || 0) + 1;
    } else if (isKV) {
      if (!this.S.historyKV) this.S.historyKV = {};
      this.S.historyKV[this.S.tk] = (this.S.historyKV[this.S.tk] || 0) + 1;
    } else if (isSS) {
      if (!this.S.historySS) this.S.historySS = {};
      this.S.historySS[this.S.tk] = (this.S.historySS[this.S.tk] || 0) + 1;
    } else if (isRam) {
      if (!this.S.historyRam) this.S.historyRam = {};
      this.S.historyRam[this.S.tk] = (this.S.historyRam[this.S.tk] || 0) + 1;
    } else {
      this.S.history[this.S.tk] = (this.S.history[this.S.tk] || 0) + 1;
    }
    this.ensureMalaWallStart();
    // Defer persistence off the input critical path — tap feels instant
    this._saveSoon();
    // Haptic heartbeat — 10ms bead feeling
    this.vib([10]);
    this.tapTimer();
    // ── Keep the 28 Names timer's idle-window alive too ─────────────────
    // h28() already extends the main Session timer on every 28-Names tap
    // (via tapTimer()), so switching from 28 Names → main Jap and tapping
    // here never lets the main timer auto-pause early. This is the mirror
    // for the other direction: if a 28 Names session is already running
    // (not paused), a main-Jap tap re-arms its 10s auto-pause and refreshes
    // its "last real tap" cutoff, so switching from main Jap → 28 Names
    // and tapping here doesn't let the 28 Names timer pause prematurely
    // either. It does NOT start a fresh 28 session from main taps — only
    // keeps an already-running one alive — so main-Jap time is never
    // mis-credited into timer28History.
    if (this._n28TotalStart && !this._n28Paused) {
      this._n28LastTapTs = Date.now();
      this._arm28AutoPause();
    }
    if (isRV) {
      spawnRV(e, document.getElementById("tz"));
    } else if (isHK) {
      spawnHK();
    } else if (isKV) {
      spawnKV(e, document.getElementById("tz"));
    } else if (isSS) {
      spawnSS(e, document.getElementById("tz"));
    } else if (isRam) {
      spawnRam();
    } else {
      spawn(e, document.getElementById("tz"));
    }
    const nm = Math.floor(this.gTod() / ms);
    const lmcKey = isRV ? "lmcRV" : isHK ? "lmcHK" : isKV ? "lmcKV" : isSS ? "lmcSS" : isRam ? "lmcRam" : "lmc";
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
    if (isGhostMode()) return; // ghost mode: read-only
    const isRV = this.S.japMode === "rv";
    const isHK = this.S.japMode === "hk";
    const isKV = this.S.japMode === "kv";
    const isSS = this.S.japMode === "ss";
    const isRam = this.S.japMode === "ram";
    const hist = isRV
      ? this.S.historyRV
      : isHK
        ? this.S.historyHK || {}
        : isKV
          ? this.S.historyKV || {}
          : isSS
            ? this.S.historySS || {}
            : isRam
              ? this.S.historyRam || {}
              : this.S.history;
    if ((hist[this.S.tk] || 0) > 0) {
      hist[this.S.tk]--;
      const lmcKey = isRV ? "lmcRV" : isHK ? "lmcHK" : isKV ? "lmcKV" : isSS ? "lmcSS" : isRam ? "lmcRam" : "lmc";
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
  _n28LastTapTs: null, // wall-clock time of the last actual name tap — used to
  // exclude idle time from flushed duration, same as the main Session timer does.

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
  pause28(cutoffTs) {
    if (this._n28Paused || !this._n28TotalStart) return;
    // cutoffTs (optional): when the pause was triggered by idle auto-pause,
    // this is the timestamp of the last real tap — freezing/flushing use
    // this instead of "now" so the idle gap is excluded, not counted.
    const _now = (cutoffTs && cutoffTs >= this._n28TotalStart) ? cutoffTs : Date.now();
    // Freeze current values
    this._n28PausedCycleSec = this._n28CycleStart
      ? Math.floor((_now - this._n28CycleStart) / 1000)
      : 0;
    const sessionSec = Math.floor((_now - this._n28TotalStart) / 1000);
    const savedSec = this.S.timer28History[this.S.tk] || 0;
    this._n28PausedTotalSec =
      savedSec + (sessionSec - (this._n28SavedSecs || 0));
    // Flush elapsed time to history
    this.flush28TimeToHistory(cutoffTs);
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
    const ce = document.getElementById("n28CycleTimer"); const _ceVis = document.getElementById("n28CycleTimerDisplay");
    if (ce) ce.textContent = fmt(this._n28PausedCycleSec); if (_ceVis) _ceVis.textContent = fmt(this._n28PausedCycleSec);
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

  // ── Arm 10-second auto-pause ──
  _arm28AutoPause() {
    clearTimeout(this._n28AutoPauseTimeout);
    this._n28AutoPauseTimeout = setTimeout(() => {
      // Idle-triggered pause: flush only up to the last real tap, not up to
      // right now, so the idle gap itself is never counted as jap time.
      if (!this._n28Paused) this.pause28(this._n28LastTapTs);
    }, 10000);
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
      // ── Feed the unified Session Timer too ──────────────────────────
      // timerSeconds is meant to be "active chanting time since app open"
      // across ALL modes, not just main Jap. Only tick it here if the main
      // Jap timer isn't already the one driving it this second (guards
      // against double-counting if both were ever running at once).
      if (!this.timerRunning) {
        this.timerSeconds++;
        try {
          localStorage.setItem("rjap_timerSeconds", String(this.timerSeconds));
        } catch (e) {}
        const _td = document.getElementById("timerDisplay");
        if (_td) _td.textContent = this.fmtTime(this.timerSeconds);
      }
      // Keep the unified "Total Jap Time" mirror and Session display in sync every second
      this.updateTimerToday();
    }, 1000);
    this._upd28PauseBtn();
  },

  flush28TimeToHistory(cutoffTs) {
    if (!this._n28TotalStart) return;
    const _now = (cutoffTs && cutoffTs >= this._n28TotalStart) ? cutoffTs : Date.now();
    const elapsed = Math.floor((_now - this._n28TotalStart) / 1000);
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
      const ce = document.getElementById("n28CycleTimer"); const _ceVis = document.getElementById("n28CycleTimerDisplay");
      if (ce) ce.textContent = "0:00"; if (_ceVis) _ceVis.textContent = "0:00";
    } else {
      this._n28CycleStart = Date.now();
      const ce = document.getElementById("n28CycleTimer"); const _ceVis = document.getElementById("n28CycleTimerDisplay");
      if (ce) ce.textContent = "0:00"; if (_ceVis) _ceVis.textContent = "0:00";
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
    this._n28LastTapTs = null;
    const ce = document.getElementById("n28CycleTimer"); const _ceVis = document.getElementById("n28CycleTimerDisplay");
    if (ce) ce.textContent = "0:00"; if (_ceVis) _ceVis.textContent = "0:00";
    // Show unified Today's Jap Time
    this.updateTimerToday();

    const mf28 = document.getElementById("mf28");
    if (mf28) mf28.classList.remove("show");
    this._upd28PauseBtn();
  },

  // ── 28 Names tap ──
  h28(e) {
    // v154: ghost mode is strictly read-only. Block the tap before ANY state
    // mutation so we never imprint the viewed user's session onto the dev's
    // own profile. Wish target cycle counts remain visible via renderSankalpas().
    if (isGhostMode()) {
      if (e) { try { e.preventDefault(); } catch (_) {} }
      return;
    }
    // Mark 28 Names as the actively-tapped mode (see _activeJapMode below).
    this._activeJapMode = "n28";
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
    // Snapshot the moment of this tap so an idle-triggered pause can flush
    // only up to here, excluding the idle gap (mirrors tapTimer's rollback).
    this._n28LastTapTs = Date.now();
    // Re-arm 6s auto-pause on every tap
    this._arm28AutoPause();
    if (this.S.h28[this.S.tk] % 28 === 0) cycleDone28();
    u28();
  },

  undo28() {
    if (isGhostMode()) return; // ghost mode: read-only, never mutate state
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
    if (isGhostMode()) return; // ghost mode: read-only
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
  el.textContent = naamText().radha;
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
  const _nt = naamText();
  el.innerHTML =
    '<span style="font-size:' +
    fs +
    'px">' + _nt.rv1 + '</span><span style="font-size:' +
    fs * 0.85 +
    'px">' + _nt.rv2 + '</span>';
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

function spawnSS(e, zone) {
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
  el.className = "fn-ss";
  const fs = 55 + Math.random() * 25;
  const _nt = naamText();
  el.innerHTML =
    '<span style="font-size:' +
    fs +
    'px">' + _nt.ss1 + '</span><span style="font-size:' +
    fs * 0.85 +
    'px">' + _nt.ss2 + '</span>';
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

function spawnKV(e, zone) {
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
  el.className = "fn-kv";
  const fs = 55 + Math.random() * 25;
  const _nt = naamText();
  el.innerHTML =
    '<span style="font-size:' +
    fs +
    'px">' + _nt.kv1 + '</span><span style="font-size:' +
    fs * 0.85 +
    'px">' + _nt.kv2 + '</span>';
  el.style.left = x - fs * 1.2 + "px";
  el.style.top = y - fs * 0.5 + "px";
  acf = !acf;
  el.style.color = acf ? "#FFD700" : "#6DB8FF";
  el.style.textShadow = acf
    ? "0 0 30px rgba(255,215,0,0.9)"
    : "0 0 30px rgba(109,184,255,0.9)";
  zone.appendChild(el);
  // Deliberately slower removal than RV/SS (2400ms) to match the slower
  // fuKV fade/rise animation — gives time to recite the name before it
  // disappears, per request.
  setTimeout(() => el.remove(), 8000);
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
  // Retrigger the "new color arriving" pop-in on every tap, not just
  // the first reveal (removing + forcing reflow restarts the CSS animation)
  el.classList.remove("hk-pulse");
  void el.offsetWidth;
  el.classList.add("hk-pulse");
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

// ── Ramanandi Mode (Raam Vijay Mantra) — persistent display, same animation
// style as Gaudiya/ISKCON (HK) mode ──
let _ramColorIdx = 0;
let _ramMalaBlocked = false; // blocks taps until user taps after mala complete

function spawnRam() {
  // If mala-complete overlay is showing, first tap dismisses it and starts new mala
  if (_ramMalaBlocked) {
    _ramMalaBlocked = false;
    const mc = document.getElementById("ramMalaComplete");
    if (mc) mc.classList.remove("hkmc-visible");
    return;
  }
  const el = document.getElementById("ramPersist");
  if (!el) return;
  const _nt = naamText();
  const text = _nt.ram1 + "\n" + _nt.ram2;
  // CURRENT color → float rises up and disappears (the "old" text leaving)
  const currentColor = HK_COLORS[_ramColorIdx % 7];
  const currentShadow = HK_SHADOWS_MAP[_ramColorIdx % 7];
  // NEXT color → stays as persistent display (the "new" text arriving)
  const nextColor = HK_COLORS[(_ramColorIdx + 1) % 7];
  const nextShadow = HK_SHADOWS_MAP[(_ramColorIdx + 1) % 7];
  _ramColorIdx++;

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

  // Persistent display: each word spins in from a random margin of the
  // jap display and converges into place (instead of the whole line
  // appearing at once).
  el.innerHTML = "";
  el.style.color = nextColor;
  el.style.textShadow = nextShadow;
  let _ramWordIdx = 0;
  text.split("\n").forEach((line) => {
    const lineDiv = document.createElement("div");
    line.split(" ").forEach((word) => {
      if (!word) return;
      const span = document.createElement("span");
      span.className = "ram-word";
      span.textContent = word;
      // Random point around the display to fly in from, plus a random spin
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 90;
      const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 360);
      span.style.setProperty("--wx", Math.cos(angle) * dist + "px");
      span.style.setProperty("--wy", Math.sin(angle) * dist + "px");
      span.style.setProperty("--wr", spin + "deg");
      span.style.animationDelay = (_ramWordIdx * 0.06) + "s";
      _ramWordIdx++;
      lineDiv.appendChild(span);
    });
    el.appendChild(lineDiv);
  });
  if (!el.classList.contains("hk-visible")) {
    el.classList.add("hk-visible");
  }
}

function showRamMalaComplete(line1, line2) {
  _ramMalaBlocked = true;
  // Hide the persistent mantra text
  const el = document.getElementById("ramPersist");
  if (el) el.classList.remove("hk-visible");
  // Show Jay Sri Ram overlay
  const mc = document.getElementById("ramMalaComplete");
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
    // Only skip the guard inside the scrollable lyric text itself — repeated
    // flick-scrolls there can land within 300ms of each other, and cancelling
    // that touchend interrupts native momentum scrolling (feels stuck/shaky).
    // Everywhere else inside the lyrics modal — importantly the Prev/Next
    // buttons — must keep this guard. Without it, a quick double-tap on
    // "Next" was both (a) triggering Android's native double-tap-zoom
    // gesture (a visual flicker that looked like a "ghost"/duplicate of the
    // button during the zoom animation) and (b) letting two click events
    // reach verseNav() almost simultaneously, which skipped an extra verse
    // (the "unpredictable jump" to next/previous).
    if (e.target && e.target.closest && e.target.closest(".lm-card-inner"))
      return;
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
    App.S.malaLogKV = [];
    // ── Fix: discard any incomplete in-progress mala at midnight ──
    // Partial beads (< full mala) must not bleed into the new day or
    // create a ghost mala entry. Completed mala data is already saved
    // in history[previousTk] and is completely untouched.
    App.S.ms = 0;
    App.malaWallStart = 0;
    App._currentMalaStartTs = null;
    App.currentMalaSeconds = 0;
    App.S.malaStartTk = "";
    App.S.malaStartMode = "";
    try {
      localStorage.removeItem("rjap_currentMalaStartTs");
      localStorage.setItem("rjap_malaWallStart", "0");
      localStorage.setItem("rjap_currentMalaSeconds", "0");
      localStorage.removeItem("rjap_malaStartTk");
    } catch(_) {}
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
// Canonical public URLs for sharing. window.location.href is NOT safe to
// use for this — inside the installed Android app it points at the
// WebView's internal address (localhost/asset path), not a real public
// link. Always use these fixed URLs instead, in both native and web
// contexts, so Share always produces something the recipient can open.
const RJAP_PWA_URL = "https://radharadharadha.vercel.app/";
// Direct download link for the installable Android APK — a Google Drive
// folder that gets manually updated with the latest built app-*.apk each
// time a new version is released. Update this constant if the Drive folder
// URL itself ever changes (e.g. moved to a different Drive account/folder).
const RJAP_APK_URL = "https://drive.google.com/drive/folders/1dU7BZqcY2lPzgonRm65C2Dz5gi71ab-7";

function _getAppUrl() {
  return RJAP_PWA_URL;
}

// Native Android (Capacitor WebView) does not implement the Web Share API —
// navigator.share is simply undefined there, so these used to always fall
// straight through to "copy the link" with no share sheet at all. Try the
// Capacitor Share plugin first (real Android share sheet: WhatsApp,
// Messenger, Telegram, etc.), then navigator.share for the PWA/browser,
// then copy as the final fallback.
async function _lcShareText(shareText) {
  if (_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
    try {
      await window.Capacitor.Plugins.Share.share({ text: shareText });
      toast("Shared! \uD83D\uDE4F Jai Radhe!");
      return;
    } catch (err) {
      // User cancelled the share sheet — not a real error, do nothing.
      if (err && err.message && /cancel/i.test(err.message)) return;
      _copyAppUrl(shareText);
      return;
    }
  }
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

// ── Share App (PWA link) ──
// ── Open an external link (community/social) in the system/in-app browser ──
async function openExternalLink(url) {
  try {
    if (
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform() &&
      window.Capacitor.Plugins &&
      window.Capacitor.Plugins.Browser
    ) {
      await window.Capacitor.Plugins.Browser.open({ url });
      return;
    }
  } catch (_e) {}
  try { window.open(url, "_blank"); } catch (_e) {}
}

function shareApp() {
  const url = _getAppUrl();
  const shareText =
    "Radha Vallabh Sri Harivangsa \uD83D\uDE4F\n\n" +
    "Boost your Naam Jap experience with this little app —\n" +
    "track Brahmacharya daily Jap & lots of statistics \u2728 \uD83E\uDEB7\n\n" +
    "\uD83D\uDC49 " +
    url;
  _lcShareText(shareText);
}

// ── Share App (APK direct download) ──
function shareApk() {
  const shareText =
    "Radha Vallabh Sri Harivangsa \uD83D\uDE4F\n\n" +
    "Install the Radha Naam Jap Android app directly (APK) —\n" +
    "track Brahmacharya daily Jap & lots of statistics \u2728 \uD83E\uDEB7\n\n" +
    "\uD83D\uDC49 " +
    RJAP_APK_URL;
  _lcShareText(shareText);
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
      "position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:rgba(74,144,226,0.2);border:1px solid rgba(109,184,255,0.4);backdrop-filter:blur(10px);color:var(--a2);padding:9px 18px;border-radius:18px;font-size:13px;z-index:500;transition:opacity 0.3s;pointer-events:none;white-space:normal;text-align:center;max-width:85vw;line-height:1.4;font-family:Inter,sans-serif";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  if (t._toastTimer) clearTimeout(t._toastTimer);
  // Longer messages get more time to read (base 2s + ~30ms per character,
  // capped at 6s) instead of the same fixed 2s for every message length.
  const duration = Math.min(2000 + (msg ? msg.length : 0) * 30, 6000);
  t._toastTimer = setTimeout(() => (t.style.opacity = "0"), duration);
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

// ── KV Target Save ──
function svtKV(type) {
  if (type === "d") {
    const v = parseInt(document.getElementById("dtKVIn").value) || 0;
    App.S.dtKV = v;
  }
  App.save();
  fbDebouncedPush();
  App.ua();
  toast("KV Daily Target saved! 🎯");
}

// ── SS Target Save ──
function svtSS(type) {
  if (type === "d") {
    const v = parseInt(document.getElementById("dtSSIn").value) || 0;
    App.S.dtSS = v;
  }
  App.save();
  fbDebouncedPush();
  App.ua();
  toast("Samba Sadashiv Daily Target saved! 🎯");
}

// ── Ram Target Save ──
function svtRam(type) {
  if (type === "d") {
    const v = parseInt(document.getElementById("dtRamIn").value) || 0;
    App.S.dtRam = v;
  }
  App.save();
  fbDebouncedPush();
  App.ua();
  toast("Raam Vijay Mantra Daily Target saved! 🎯");
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

// ── 28 Names Daily Target: single card, moved between two slots ──
// (RV Daily slot in default mode, HK Targets slot in Gaudiya mode) so
// there's exactly one #target28Card node — no duplicate IDs, no sync bugs.
function _placeTarget28Card() {
  const card = document.getElementById("target28Card");
  if (!card) return;
  const slot = App.S.gaudiyaMode
    ? document.getElementById("target28SlotGaudiya")
    : document.getElementById("target28SlotDefault");
  const moved = slot && card.parentElement !== slot;
  if (moved) slot.appendChild(card);
  // The bead ring (renderBeadFrame) sizes itself off beadFrameWrap's
  // measured rect. ANY mode switch (Gaudiya/Trahimam/Ramanandi) can
  // resize that wrap — not only when the 28-Names card actually moves
  // slot (e.g. box text/width can change even when the card stays put) —
  // so always re-render the ring once the browser has reflowed the new
  // layout, or it can stay distorted/misaligned until the next window
  // resize. (Previously gated on `moved`, which missed some mode
  // switches and caused the ring to not properly encircle the boxes.)
  if (typeof renderBeadFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(() => renderBeadFrame()));
  }
}

// ── Init jap mode UI on page load ──
function initJapModeUI() {
  // Normalize: in Gaudiya mode only HK is allowed; in Gopeshwar Mahadev
  // mode only SS (Samba Sadashiv) is allowed; in Ramanandi mode only Ram is
  // allowed; otherwise none of HK/SS/Ram is allowed (KV is a normal default
  // mode option alongside Radha/RV, no toggle needed).
  let initMode = App.S.japMode || "radha";
  if (App.S.gaudiyaMode) {
    initMode = "hk";
  } else if (App.S.trahimamMode) {
    initMode = "ss";
  } else if (App.S.ramanandiMode) {
    initMode = "ram";
  } else if (initMode === "hk" || initMode === "ss" || initMode === "ram") {
    initMode = "radha";
  }
  switchJapMode(initMode);

  const ms = App.S.ms || 108;
  // Populate RV target inputs
  const dtRVIn = document.getElementById("dtRVIn");
  if (dtRVIn && App.S.dtRV) dtRVIn.value = App.S.dtRV;
  const dtRVM = document.getElementById("dtRVMala");
  if (dtRVM) dtRVM.textContent = Math.floor((App.S.dtRV || 0) / ms);
  // Populate KV target inputs
  const dtKVIn = document.getElementById("dtKVIn");
  if (dtKVIn && App.S.dtKV) dtKVIn.value = App.S.dtKV;
  const dtKVM = document.getElementById("dtKVMala");
  if (dtKVM) dtKVM.textContent = Math.floor((App.S.dtKV || 0) / ms);
  // Populate SS target inputs
  const dtSSIn = document.getElementById("dtSSIn");
  if (dtSSIn && App.S.dtSS) dtSSIn.value = App.S.dtSS;
  const dtSSM = document.getElementById("dtSSMala");
  if (dtSSM) dtSSM.textContent = Math.floor((App.S.dtSS || 0) / ms);
  // Populate HK target inputs
  const dtHKIn = document.getElementById("dtHKIn");
  if (dtHKIn && App.S.dtHK) dtHKIn.value = App.S.dtHK;
  const dtHKM = document.getElementById("dtHKMala");
  if (dtHKM) dtHKM.textContent = Math.floor((App.S.dtHK || 0) / ms);
  // Populate Ram target inputs
  const dtRamIn = document.getElementById("dtRamIn");
  if (dtRamIn && App.S.dtRam) dtRamIn.value = App.S.dtRam;
  const dtRamMalaInEl = document.getElementById("dtRamMalaIn");
  if (dtRamMalaInEl) dtRamMalaInEl.value = (App.S.dtRam || 0) > 0 ? Math.round((App.S.dtRam || 0) / ms) : "";
  const dtRamM = document.getElementById("dtRamMala");
  if (dtRamM) dtRamM.textContent = Math.floor((App.S.dtRam || 0) / ms);
  // Init Gaudiya Mode toggle state
  const tgG = document.getElementById("tgGaudiya");
  if (tgG)
    App.S.gaudiyaMode ? tgG.classList.add("on") : tgG.classList.remove("on");
  if (App.S.gaudiyaMode) document.body.classList.add("gaudiya-mode");
  // Init Trahimam Trahimam Mode toggle state
  const tgT = document.getElementById("tgTrahimam");
  if (tgT)
    App.S.trahimamMode ? tgT.classList.add("on") : tgT.classList.remove("on");
  if (App.S.trahimamMode) document.body.classList.add("trahimam-mode");
  // Init Ramanandi Mode toggle state
  const tgR = document.getElementById("tgRamanandi");
  if (tgR)
    App.S.ramanandiMode ? tgR.classList.add("on") : tgR.classList.remove("on");
  if (App.S.ramanandiMode) document.body.classList.add("ramanandi-mode");
  window._dedTypes = new Set([App.S.trahimamMode ? "ss" : App.S.ramanandiMode ? "ram" : "radha"]);
  _placeTarget28Card();
  if (typeof applyBgPhotos === "function") applyBgPhotos();
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
  applyNaamLangLabels(App.S.naamLang || "sa");
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
// ── Radha / Radha Vallabh jap-text script lookup (Sanskrit/Devanagari vs Bangla) ──
const NAAM_TEXT = {
  sa: { radha: "राधा", rv1: "राधावल्लभ", rv2: "श्री हरिवंश", kv1: "कृष्णाय वासुदेवाय हरये परमात्मने", kv2: "प्रणतः क्लेशनाशाय गोविन्दाय नमो नमः", kvShort: "कृष्णाय वासुदेवाय", ss1: "साम्ब", ss2: "सदाशिव", ramTitle: "राम विजय मंत्र", ram1: "श्री राम, जय राम,", ram2: "जय जय राम।" },
  bn: { radha: "রাধা", rv1: "রাধাবল্লভ", rv2: "শ্রী হরিবংশ", kv1: "কৃষ্ণায় বাসুদেবায় হরয়ে পরমাত্মনে", kv2: "প্রণতঃ ক্লেশনাশায় গোবিন্দায় নমো নমঃ", kvShort: "কৃষ্ণায় বাসুদেবায়", ss1: "সাম্ব", ss2: "সদাশিব", ramTitle: "রাম বিজয় মন্ত্র", ram1: "শ্রী রাম, জয় রাম,", ram2: "জয় জয় রাম।" },
};
function naamText() {
  const lang = (App.S && App.S.naamLang === "bn") ? "bn" : "sa";
  return NAAM_TEXT[lang];
}

// Apply naamLang-sensitive labels: settings picker UI + live title/toast refresh
function applyNaamLangLabels(lang) {
  const isBn = lang === "bn";
  document.body.classList.toggle("naam-bn", isBn);
  const lbl = document.getElementById("naamLangLabel");
  if (lbl) lbl.textContent = isBn ? "Bangla" : "Sanskrit";
  // Keep the naam dropdown option text in sync with the selected script
  const _nt = NAAM_TEXT[isBn ? "bn" : "sa"];
  const optRadhaLbl = document.getElementById("naamOptRadhaLabel");
  if (optRadhaLbl) optRadhaLbl.textContent = _nt.radha;
  const optRVLbl = document.getElementById("naamOptRVLabel");
  if (optRVLbl) optRVLbl.textContent = _nt.rv1 + " " + _nt.rv2;
  const optKVLbl = document.getElementById("naamOptKVLabel");
  if (optKVLbl) optKVLbl.textContent = _nt.kvShort;
  const optSSLbl = document.getElementById("naamOptSSLabel");
  if (optSSLbl) optSSLbl.textContent = _nt.ss1 + " " + _nt.ss2;
  const optRamLbl = document.getElementById("naamOptRamLabel");
  if (optRamLbl) optRamLbl.textContent = _nt.ramTitle;
}

function setNaamLangDirect(lang) {
  if (!App || !App.S) return;
  if (App.S.naamLang === lang) return; // already selected
  App.S.naamLang = lang;
  applyNaamLangLabels(lang);
  // Refresh the header title live if currently on Radha, RV, KV, SS, or Ram mode
  if (App.S.japMode === "radha" || App.S.japMode === "rv" || App.S.japMode === "kv" || App.S.japMode === "ss" || App.S.japMode === "ram") {
    switchJapMode(App.S.japMode);
  }
  App.save();
  if (typeof fbDebouncedPush === "function") fbDebouncedPush();
}

function switchJapMode(mode) {
  // ── Per-mode mala-timing stash/restore ──
  // malaWallStart / _currentMalaStartTs / currentMalaSeconds are shared,
  // single (not per-type) fields. Without this, switching away mid-mala
  // (e.g. 93/108 done in Radha, then some RV taps) and back would let the
  // OTHER mode's own first-tap reset (or its mala-completion reset) wipe
  // out the timestamp this mode's in-progress mala was relying on —
  // History would then show that mala "starting" at whatever tap you
  // resumed on, instead of its real start, understating its duration.
  const _prevMode = App.S.japMode;
  App._malaTimeStash = App._malaTimeStash || {};
  const _outStash = {
    malaWallStart: App.malaWallStart,
    _currentMalaStartTs: App._currentMalaStartTs,
    currentMalaSeconds: App.currentMalaSeconds,
  };
  App._malaTimeStash[_prevMode] = _outStash;
  // Also persist per-mode so this survives closing and reopening the app —
  // not just switching modes within the same session.
  try {
    localStorage.setItem("rjap_malaStash_" + _prevMode, JSON.stringify(_outStash));
  } catch (_) {}

  App.S.japMode = mode;
  let _stash = App._malaTimeStash[mode];
  if (!_stash) {
    // No in-memory stash (e.g. this is the first switch after a fresh app
    // load) — check whether a stash for this mode survived from before the
    // app was last closed.
    try {
      const _raw = localStorage.getItem("rjap_malaStash_" + mode);
      if (_raw) _stash = JSON.parse(_raw);
    } catch (_) {}
  }
  if (_stash) {
    App.malaWallStart = _stash.malaWallStart;
    App._currentMalaStartTs = _stash._currentMalaStartTs;
    App.currentMalaSeconds = _stash.currentMalaSeconds;
  } else {
    // First time switching into this mode this session — nothing to
    // restore, start clean so its next tap begins its own fresh mala.
    App.malaWallStart = 0;
    App._currentMalaStartTs = null;
    App.currentMalaSeconds = 0;
  }
  try {
    localStorage.setItem("rjap_malaWallStart", String(App.malaWallStart));
    if (App._currentMalaStartTs) {
      localStorage.setItem("rjap_currentMalaStartTs", String(App._currentMalaStartTs));
    } else {
      localStorage.removeItem("rjap_currentMalaStartTs");
    }
    localStorage.setItem("rjap_currentMalaSeconds", String(App.currentMalaSeconds));
  } catch (_) {}

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
  const optKV = document.getElementById("naamOptKV");
  const optSS = document.getElementById("naamOptSS");
  const optRam = document.getElementById("naamOptRam");
  const titleEl = document.getElementById("rnTitle");
  const hkEl = document.getElementById("hkPersist");
  const kvEl = document.getElementById("kvPersist");
  const ramEl = document.getElementById("ramPersist");
  // Clear both persistent tap-displays up front on every mode switch — each
  // mode's spawn function (spawnHK/spawnKV) repopulates its own on the next
  // tap, so nothing should linger from whichever mode was active before.
  if (hkEl) hkEl.classList.remove("hk-visible");
  if (kvEl) kvEl.classList.remove("kv-visible");
  if (ramEl) ramEl.classList.remove("hk-visible");
  // Clear all active states first
  [optR, optRV, optHK, optKV, optSS, optRam].forEach((o) => {
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
    {
      const _nt = naamText();
      titleEl.innerHTML =
        '<span style="font-size:clamp(18px,5vw,28px);line-height:1.1">' + _nt.rv1 +
        '</span><br><span style="font-size:clamp(16px,4.5vw,24px);line-height:1.1">' + _nt.rv2 + '</span>';
    }
    titleEl.style.textAlign = "center";
    if (hkEl) {
      hkEl.classList.remove("hk-visible");
    }
  } else if (mode === "kv") {
    _hkMalaBlocked = false;
    const _mcClr = document.getElementById("hkMalaComplete");
    if (_mcClr) _mcClr.classList.remove("hkmc-visible");
    if (optKV) {
      optKV.classList.add("active");
      optKV.querySelector(".ns-check").textContent = "✓";
    }
    {
      const _nt = naamText();
      titleEl.innerHTML =
        '<span style="font-size:clamp(18px,5vw,28px);line-height:1.1">' + _nt.kvShort + '</span>';
    }
    titleEl.style.textAlign = "center";
    if (hkEl) {
      hkEl.classList.remove("hk-visible");
    }
  } else if (mode === "ss") {
    _hkMalaBlocked = false;
    const _mcClr = document.getElementById("hkMalaComplete");
    if (_mcClr) _mcClr.classList.remove("hkmc-visible");
    if (optSS) {
      optSS.classList.add("active");
      optSS.querySelector(".ns-check").textContent = "✓";
    }
    {
      const _nt = naamText();
      titleEl.innerHTML =
        '<span style="font-size:clamp(18px,5vw,28px);line-height:1.1">' + _nt.ss1 +
        '</span><br><span style="font-size:clamp(16px,4.5vw,24px);line-height:1.1">' + _nt.ss2 + '</span>';
    }
    titleEl.style.textAlign = "center";
    if (hkEl) {
      hkEl.classList.remove("hk-visible");
    }
  } else if (mode === "ram") {
    _hkMalaBlocked = false;
    _ramMalaBlocked = false;
    const _mcClr = document.getElementById("hkMalaComplete");
    if (_mcClr) _mcClr.classList.remove("hkmc-visible");
    const _mcClrRam = document.getElementById("ramMalaComplete");
    if (_mcClrRam) _mcClrRam.classList.remove("hkmc-visible");
    if (optRam) {
      optRam.classList.add("active");
      optRam.querySelector(".ns-check").textContent = "✓";
    }
    titleEl.innerHTML =
      "<span style=\"font-size:clamp(22px,6vw,34px);line-height:1.1;color:#FF8C42;font-family:'Tiro Devanagari Hindi','Hind Siliguri',serif\">" +
      naamText().ramTitle +
      "</span>";
    titleEl.style.textAlign = "center";
    if (ramEl) {
      ramEl.classList.remove("hk-visible");
      _ramColorIdx = 0;
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
    titleEl.textContent = naamText().radha;
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
  } else if (mode === "kv") {
    App.lmcKV = Math.floor(((App.S.historyKV || {})[App.S.tk] || 0) / ms);
  } else if (mode === "ss") {
    App.lmcSS = Math.floor(((App.S.historySS || {})[App.S.tk] || 0) / ms);
  } else if (mode === "ram") {
    App.lmcRam = Math.floor(((App.S.historyRam || {})[App.S.tk] || 0) / ms);
  } else {
    App.lmc = Math.floor((App.S.history[App.S.tk] || 0) / ms);
  }
  App.save();
  App.ua();
  uStats();
  renderMalaLog();
  const _nt = naamText();
  const toastMap = {
    rv: _nt.rv1 + " " + _nt.rv2 + " 🙏",
    hk: "हरे कृष्ण महामंत्र 🪷",
    kv: _nt.kvShort + " 🙏",
    ss: _nt.ss1 + " " + _nt.ss2 + " 🙏",
    ram: _nt.ram1 + " " + _nt.ram2 + " 🚩",
    radha: _nt.radha + " 🙏",
  };
  toast(toastMap[mode] || _nt.radha + " 🙏");

  // Title/target-box text just changed (can resize beadFrameWrap, e.g.
  // going into Ramanandi/Gaudiya/Trahimam mode). Re-sync the 108-bead
  // ring once the browser has reflowed the new layout, instead of
  // relying on an accidental resize event to fix it later.
  if (typeof renderBeadFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(() => renderBeadFrame()));
  }
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
  // ── Screen Time / Stotram Time: start/stop based on which view is now active ──
  if (id === "vj" || id === "v28") {
    App.pauseStotramTime();
    App.startScreenTime();
  } else if (id === "vst") {
    App.pauseScreenTime();
    App.startStotramTime();
  } else {
    App.pauseScreenTime();
    App.pauseStotramTime();
  }
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
// Reflects the *current* OS-level state of the two optional "reliable
// reminders" permissions (exact alarms + battery-optimization exemption).
// Never requests them — only requestExactAlarmPermission() /
// requestIgnoreBatteryOptimizations() (called from tgs(), on user tap) do
// that. Safe to call anytime; no-ops outside the installed Android app.
async function refreshPowerPermissionStatus() {
  const wrap = document.getElementById("powerPermsBlock");
  if (!(_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.PowerPermissions)) {
    if (wrap) wrap.style.display = "none"; // not the native Android app — nothing to show
    return;
  }
  if (wrap) wrap.style.display = "";
  const PP = window.Capacitor.Plugins.PowerPermissions;
  try {
    const alarm = await PP.canScheduleExactAlarms();
    const tgA = document.getElementById("tgExactAlarm");
    const stA = document.getElementById("exactAlarmStatus");
    if (tgA) alarm.value ? tgA.classList.add("on") : tgA.classList.remove("on");
    if (stA)
      stA.textContent = alarm.value
        ? "✅ Allowed — reminders fire at the exact minute"
        : '— Tap, then choose "Allow" on the screen that opens';
  } catch (e) { console.error("canScheduleExactAlarms failed:", e); }
  try {
    const batt = await PP.isBatteryOptimizationIgnored();
    const tgB = document.getElementById("tgBatteryOptim");
    const stB = document.getElementById("batteryOptimStatus");
    if (tgB) batt.value ? tgB.classList.add("on") : tgB.classList.remove("on");
    if (stB)
      stB.textContent = batt.value
        ? "✅ Allowed — app won't be slowed down by battery saving"
        : '— Tap, then choose "No restrictions" / "Allow"';
  } catch (e) { console.error("isBatteryOptimizationIgnored failed:", e); }
}
// Refresh whenever the app comes back to the foreground (e.g. returning
// from the system Settings screen after granting/denying a permission).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshPowerPermissionStatus();
});

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
  // KV Daily
  const dtKVEl = document.getElementById("dtKVIn");
  if (dtKVEl) dtKVEl.value = (App.S.dtKV || 0) > 0 ? App.S.dtKV : "";
  const dtKVMalaInEl = document.getElementById("dtKVMalaIn");
  if (dtKVMalaInEl) dtKVMalaInEl.value = (App.S.dtKV || 0) > 0 ? Math.round((App.S.dtKV || 0) / ms) : "";
  const dtKVMalaDisp = document.getElementById("dtKVMala");
  if (dtKVMalaDisp) dtKVMalaDisp.textContent = (App.S.dtKV || 0) > 0 ? Math.floor((App.S.dtKV || 0) / ms) : "0";
  // SS Daily
  const dtSSEl = document.getElementById("dtSSIn");
  if (dtSSEl) dtSSEl.value = (App.S.dtSS || 0) > 0 ? App.S.dtSS : "";
  const dtSSMalaInEl = document.getElementById("dtSSMalaIn");
  if (dtSSMalaInEl) dtSSMalaInEl.value = (App.S.dtSS || 0) > 0 ? Math.round((App.S.dtSS || 0) / ms) : "";
  const dtSSMalaDisp = document.getElementById("dtSSMala");
  if (dtSSMalaDisp) dtSSMalaDisp.textContent = (App.S.dtSS || 0) > 0 ? Math.floor((App.S.dtSS || 0) / ms) : "0";
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
  // Ramanandi Mode toggle
  const tgR = document.getElementById("tgRamanandi");
  if (tgR) App.S.ramanandiMode ? tgR.classList.add("on") : tgR.classList.remove("on");
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
  // Reliable Reminders (exact alarm + battery optimization) status
  try { refreshPowerPermissionStatus(); } catch (_e) {}
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
    // Mutually exclusive with Trahimam Trahimam mode and Ramanandi mode
    if (App.S.gaudiyaMode && App.S.trahimamMode) {
      App.S.trahimamMode = false;
      document.body.classList.remove("trahimam-mode");
      const tgT = document.getElementById("tgTrahimam");
      if (tgT) tgT.classList.remove("on");
    }
    if (App.S.gaudiyaMode && App.S.ramanandiMode) {
      App.S.ramanandiMode = false;
      document.body.classList.remove("ramanandi-mode");
      const tgR = document.getElementById("tgRamanandi");
      if (tgR) tgR.classList.remove("on");
    }
    const tgG = document.getElementById("tgGaudiya");
    if (tgG)
      App.S.gaudiyaMode ? tgG.classList.add("on") : tgG.classList.remove("on");
    App.S.gaudiyaMode
      ? document.body.classList.add("gaudiya-mode")
      : document.body.classList.remove("gaudiya-mode");
    _placeTarget28Card();
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
    if (typeof applyBgPhotos === "function") applyBgPhotos();
    if (typeof renderPhotoPickers === "function") renderPhotoPickers();
    toast(App.S.gaudiyaMode ? "🪷 Gaudiya Mode ON" : "🪷 Gaudiya Mode OFF");

    // Ensure any leftover banner from a previous flow is hidden.
    if (_gBanner) _gBanner.style.display = "none";
    return;
  }

  if (k === "trahimamMode") {
    App.S.trahimamMode = !App.S.trahimamMode;
    // Mutually exclusive with Gaudiya/ISKCON mode and Ramanandi mode
    if (App.S.trahimamMode && App.S.gaudiyaMode) {
      App.S.gaudiyaMode = false;
      document.body.classList.remove("gaudiya-mode");
      const tgG = document.getElementById("tgGaudiya");
      if (tgG) tgG.classList.remove("on");
    }
    if (App.S.trahimamMode && App.S.ramanandiMode) {
      App.S.ramanandiMode = false;
      document.body.classList.remove("ramanandi-mode");
      const tgR = document.getElementById("tgRamanandi");
      if (tgR) tgR.classList.remove("on");
    }
    const tgT = document.getElementById("tgTrahimam");
    if (tgT)
      App.S.trahimamMode ? tgT.classList.add("on") : tgT.classList.remove("on");
    App.S.trahimamMode
      ? document.body.classList.add("trahimam-mode")
      : document.body.classList.remove("trahimam-mode");
    _placeTarget28Card();
    // Auto-switch jap mode so only valid options are visible at the top toggle
    if (App.S.trahimamMode) {
      if (App.S.japMode !== "ss") switchJapMode("ss");
      window._dedTypes = new Set(["ss"]);
    } else {
      if (App.S.japMode === "ss") switchJapMode("radha");
      window._dedTypes = new Set(["radha"]);
    }
    window._dedAmounts = {};
    if (typeof renderDedTypePanels === "function") renderDedTypePanels();
    App.save();
    fbDebouncedPush();
    uStats();
    renderHistory && typeof renderHistory === "function" && renderHistory();
    if (typeof renderCal === "function") renderCal();
    if (typeof applyBgPhotos === "function") applyBgPhotos();
    if (typeof renderPhotoPickers === "function") renderPhotoPickers();
    toast(
      App.S.trahimamMode
        ? "🕉️ Gopeshwar Mahadev Mode ON"
        : "🕉️ Gopeshwar Mahadev Mode OFF",
    );
    return;
  }

  if (k === "ramanandiMode") {
    App.S.ramanandiMode = !App.S.ramanandiMode;
    // Mutually exclusive with Gaudiya/ISKCON mode and Trahimam Trahimam mode
    if (App.S.ramanandiMode && App.S.gaudiyaMode) {
      App.S.gaudiyaMode = false;
      document.body.classList.remove("gaudiya-mode");
      const tgG = document.getElementById("tgGaudiya");
      if (tgG) tgG.classList.remove("on");
    }
    if (App.S.ramanandiMode && App.S.trahimamMode) {
      App.S.trahimamMode = false;
      document.body.classList.remove("trahimam-mode");
      const tgT = document.getElementById("tgTrahimam");
      if (tgT) tgT.classList.remove("on");
    }
    const tgR = document.getElementById("tgRamanandi");
    if (tgR)
      App.S.ramanandiMode ? tgR.classList.add("on") : tgR.classList.remove("on");
    App.S.ramanandiMode
      ? document.body.classList.add("ramanandi-mode")
      : document.body.classList.remove("ramanandi-mode");
    _placeTarget28Card();
    // Auto-switch jap mode so only valid options are visible at the top toggle
    if (App.S.ramanandiMode) {
      if (App.S.japMode !== "ram") switchJapMode("ram");
      window._dedTypes = new Set(["ram"]);
    } else {
      if (App.S.japMode === "ram") switchJapMode("radha");
      window._dedTypes = new Set(["radha"]);
    }
    window._dedAmounts = {};
    if (typeof renderDedTypePanels === "function") renderDedTypePanels();
    App.save();
    fbDebouncedPush();
    uStats();
    renderHistory && typeof renderHistory === "function" && renderHistory();
    if (typeof renderCal === "function") renderCal();
    if (typeof applyBgPhotos === "function") applyBgPhotos();
    if (typeof renderPhotoPickers === "function") renderPhotoPickers();
    toast(App.S.ramanandiMode ? "🚩 Ramanandi Mode ON" : "🚩 Ramanandi Mode OFF");
    return;
  }

  if (k === "exactAlarm") {
    // User-initiated only — this is never called automatically on app launch.
    if (!(_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.PowerPermissions)) {
      toast("⚠️ Only available in the installed Android app");
      return;
    }
    window.Capacitor.Plugins.PowerPermissions.requestExactAlarmPermission()
      .catch((e) => console.error("requestExactAlarmPermission failed:", e));
    toast('👉 Choose "Allow" on the next screen for exact-time reminders');
    return;
  }

  if (k === "batteryOptim") {
    // User-initiated only — this is never called automatically on app launch.
    if (!(_lcIsNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.PowerPermissions)) {
      toast("⚠️ Only available in the installed Android app");
      return;
    }
    window.Capacitor.Plugins.PowerPermissions.requestIgnoreBatteryOptimizations()
      .catch((e) => console.error("requestIgnoreBatteryOptimizations failed:", e));
    toast('👉 Choose "Allow" / "No restrictions" for reliable reminders');
    return;
  }

  if (k === "gpsLocation") {
    // Toggle GPS location permission request
    const tgGps = document.getElementById("tgGpsLocation");
    const isCurrentlyOn = tgGps && tgGps.classList.contains("on");
    if (!isCurrentlyOn) {
      // User is turning ON — request location now
      if (!_lcIsNative() && !navigator.geolocation) {
        toast("⚠️ GPS not available on this device");
        return;
      }
      const statusEl = document.getElementById("gpsLocationStatus");
      if (statusEl) statusEl.textContent = "📍 Detecting your location…";
      lcGetPosition({ timeout: 10000, maximumAge: 0 }).then(
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
        (err) => {
          console.error("GPS error:", err);
          const _gpsMsg = _lcGpsErrorMessage(err);
          if (statusEl) statusEl.textContent = _gpsMsg;
          toast(_gpsMsg);
        },
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

  if (k === "bmReminder") {
    const tg = document.getElementById("tgBmReminder");
    const isOn = tg && tg.classList.contains("on");
    if (!isOn) {
      lcRequestNotifPermission().then((granted) => {
        if (!granted) {
          toast("⚠️ Notification permission denied");
          return;
        }
        lcArmBmReminder().then(() => {
          try { localStorage.setItem("rjap_reminder_bm", "1"); } catch (e) {}
          if (tg) tg.classList.add("on");
          toast("🌙 Brahma Muhurta reminder enabled");
        });
      });
    } else {
      lcCancelBmReminder();
      try { localStorage.removeItem("rjap_reminder_bm"); } catch (e) {}
      if (tg) tg.classList.remove("on");
      toast("🔕 Brahma Muhurta reminder turned off");
    }
    return;
  }

  if (k === "skReminder") {
    const tg = document.getElementById("tgSkReminder");
    const isOn = tg && tg.classList.contains("on");
    if (!isOn) {
      lcRequestNotifPermission().then((granted) => {
        if (!granted) {
          toast("⚠️ Notification permission denied");
          return;
        }
        lcArmSkReminder().then(() => {
          try { localStorage.setItem("rjap_reminder_sk", "1"); } catch (e) {}
          if (tg) tg.classList.add("on");
          toast("🔔 Sandhya Kal reminder enabled");
        });
      });
    } else {
      lcCancelSkReminder();
      try { localStorage.removeItem("rjap_reminder_sk"); } catch (e) {}
      if (tg) tg.classList.remove("on");
      toast("🔕 Sandhya Kal reminder turned off");
    }
    return;
  }

  if (k === "dailyReminder") {
    const tgRem = document.getElementById("tgDailyReminder");
    const isOn = tgRem && tgRem.classList.contains("on");
    const statusEl = document.getElementById("dailyReminderStatus");
    const timeInput = document.getElementById("reminderTimeInput");
    if (!isOn) {
      lcRequestNotifPermission().then((granted) => {
        if (!granted) {
          toast("⚠️ Notification permission denied");
          if (statusEl) statusEl.textContent = "⚠️ Notifications blocked — enable in phone Settings → Apps → Radha Naam Jap → Notifications.";
          return;
        }
        const val = (timeInput && timeInput.value) || "05:00";
        const [h, m] = val.split(":").map(Number);
        lcScheduleDailyReminder(h, m).then(() => {
          try {
            localStorage.setItem("rjap_reminder_enabled", "1");
            localStorage.setItem("rjap_reminder_time", h + ":" + m);
          } catch (e) {}
          if (tgRem) tgRem.classList.add("on");
          if (statusEl) statusEl.textContent = "✅ Daily reminder set for " + val;
          toast("🔔 Daily reminder set for " + val);
        });
      });
    } else {
      lcCancelDailyReminder();
      try { localStorage.removeItem("rjap_reminder_enabled"); } catch (e) {}
      if (tgRem) tgRem.classList.remove("on");
      if (statusEl) statusEl.textContent = "— Tap toggle to enable your daily jap reminder 🔔";
      toast("🔕 Daily reminder turned off");
    }
    return;
  }

  if (k === "pushNotifications") {
    const tgPush = document.getElementById("tgPushNotifications");
    const isOn = tgPush && tgPush.classList.contains("on");
    const statusEl = document.getElementById("pushNotificationsStatus");
    if (!isOn) {
      if (!fbUser) {
        toast("⚠️ Sign in first to enable push notifications");
        return;
      }
      try { localStorage.setItem("rjap_push_asked", "1"); } catch (_) {}
      lcRegisterPush().then((ok) => {
        if (ok) {
          if (tgPush) tgPush.classList.add("on");
          if (statusEl) statusEl.textContent = "✅ Push notifications enabled";
          toast("🔔 Push notifications enabled");
        } else {
          if (statusEl) statusEl.textContent = "⚠️ Could not enable — check notification permission.";
          toast("⚠️ Could not enable push notifications");
        }
      });
    } else {
      try { localStorage.setItem("rjap_push_asked", "1"); } catch (_) {}
      lcUnregisterPush();
      if (tgPush) tgPush.classList.remove("on");
      if (statusEl) statusEl.textContent = "— Tap to receive announcements from Radha Naam Jap 🔔 (requires sign-in)";
      toast("🔕 Push notifications turned off");
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
let _beadRetries = 0;

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
  if (!W || !H) {
    // wrap is mid-transition / still display:none-ish (e.g. right after a
    // mode switch reparents #target28Card or toggles a body class) and
    // measured 0×0 this frame. Previously this just silently gave up,
    // leaving the SVG's old viewBox + bead cx/cy from BEFORE the mode
    // switch in place — the ring stayed collapsed into whatever shape it
    // last had until something else (a manual toggle, a window resize)
    // happened to call renderBeadFrame() again while the layout had
    // settled. Retry on the next few frames instead of giving up, so the
    // ring self-heals as soon as the wrap actually has a size — no need
    // to rely on the caller's timing being exactly right.
    _beadRetries = (_beadRetries || 0) + 1;
    if (_beadRetries <= 10) {
      requestAnimationFrame(() => renderBeadFrame());
    }
    return;
  }
  _beadRetries = 0;
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

// ── Self-healing resize watch for the bead ring ──
// The mode-switch code paths (Gaudiya/Trahimam/Ramanandi toggles,
// switchJapMode, _placeTarget28Card) each try to re-trigger
// renderBeadFrame() after their own layout change via nested rAFs, but
// that's guessing at timing — any mode switch whose layout settles later
// than 2 frames (e.g. a slower device, or a CSS transition) left the ring
// collapsed until the next window resize or manual re-toggle. A
// ResizeObserver watches the wrap's actual measured box directly, so the
// ring redraws itself the moment its size truly changes, no matter what
// caused it or how long the layout took to settle.
(function watchBeadFrameWrapSize() {
  const wrap = document.getElementById("beadFrameWrap");
  if (!wrap || typeof ResizeObserver === "undefined") return;
  let raf = null;
  const ro = new ResizeObserver(() => {
    // Coalesce bursts of resize notifications (reparenting + class toggles
    // can fire several in one mode switch) into a single re-render.
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => renderBeadFrame());
  });
  ro.observe(wrap);
})();

// ── Auto-load today's view in History on open ──
// Fills in From/To only when they're actually blank (never overwrites a
// date range the user picked themselves), and — unlike before — this is
// NOT a permanent one-shot: if the panel wasn't open yet at the 50ms mark
// on a given tap (a timing race with the open/close transition), the next
// tap will simply try again instead of being silently disabled forever.
function autoLoadHistory() {
  const body = document.getElementById("historyBody");
  if (!body || !body.classList.contains("open")) return;
  const f = document.getElementById("histFrom"),
    t = document.getElementById("histTo");
  if (!f || !t) return;
  if (f.value && t.value) {
    // Already has a range (from an earlier auto-fill or the user's own
    // pick) — just re-render, since the underlying jap mode may have
    // changed (e.g. Trahimam/KV toggled) since the last render.
    if (typeof renderHistory === "function")
      try {
        renderHistory();
      } catch (e) {}
    return;
  }
  const today = _ldk(new Date());
  f.value = today;
  t.value = today;
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
  // Developers may manually correct jap counts while Ghost Mode-viewing
  // another user's account (writes go to ghostAwareSave(), never live-tap
  // simulation). Regular users always edit only their own account.
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
  if (!App.S.historyKV) App.S.historyKV = {};
  if (!App.S.historySS) App.S.historySS = {};
  if (!App.S.historyRam) App.S.historyRam = {};
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  if (isRV) {
    App.S.historyRV[App.S.tk] = (App.S.historyRV[App.S.tk] || 0) + n;
  } else if (isHK) {
    App.S.historyHK[App.S.tk] = (App.S.historyHK[App.S.tk] || 0) + n;
  } else if (isKV) {
    App.S.historyKV[App.S.tk] = (App.S.historyKV[App.S.tk] || 0) + n;
  } else if (isSS) {
    App.S.historySS[App.S.tk] = (App.S.historySS[App.S.tk] || 0) + n;
  } else if (isRam) {
    App.S.historyRam[App.S.tk] = (App.S.historyRam[App.S.tk] || 0) + n;
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
        : isKV
          ? App.S.malaLogKV || (App.S.malaLogKV = [])
          : isSS
            ? App.S.malaLogSS || (App.S.malaLogSS = [])
            : isRam
              ? App.S.malaLogRam || (App.S.malaLogRam = [])
              : App.S.malaLog || (App.S.malaLog = []);
    const now = Date.now();
    const modeStr = isRV ? "rv" : isHK ? "hk" : isKV ? "kv" : isSS ? "ss" : isRam ? "ram" : "radha";
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
    if (isRam) {
      // syncTimerFromMalaLog() doesn't cover the Ram (Raam Vijay Mantra)
      // timer bucket — add the time directly instead.
      if (!App.S.timerHistoryRam) App.S.timerHistoryRam = {};
      App.S.timerHistoryRam[App.S.tk] = (App.S.timerHistoryRam[App.S.tk] || 0) + timeSecs;
    } else {
      // Sync timerHistory from updated mala log sum
      App.syncTimerFromMalaLog();
    }
  }
  // This entry was reported after the fact (e.g. chanted at a real mala,
  // off-screen) — mark it so Efficiency/Quality exclude it.
  _recordManualJap(isRV ? "rv" : isHK ? "hk" : isKV ? "kv" : isSS ? "ss" : isRam ? "ram" : "radha", App.S.tk, n, timeSecs);
  App.ensureMalaWallStart();
  const nm = Math.floor(App.gTod() / (App.S.ms || 108));
  const lmcKey = isRV ? "lmcRV" : isHK ? "lmcHK" : isKV ? "lmcKV" : isSS ? "lmcSS" : "lmc";
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
  App.ua();
  ghostAwareSave();
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
  const isHK = App.S.japMode === "hk";
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  if (isRV) {
    App.S.historyRV[prevKey] = n;
  } else if (isHK) {
    if (!App.S.historyHK) App.S.historyHK = {};
    App.S.historyHK[prevKey] = n;
  } else if (isKV) {
    App.S.historyKV[prevKey] = n;
  } else if (isSS) {
    if (!App.S.historySS) App.S.historySS = {};
    App.S.historySS[prevKey] = n;
  } else if (isRam) {
    if (!App.S.historyRam) App.S.historyRam = {};
    App.S.historyRam[prevKey] = n;
  } else {
    App.S.history[prevKey] = n;
  }
  // Clear input BEFORE re-render so the live preview resets to "—"
  document.getElementById("prevJapIn").value = "";
  const _pml = document.getElementById("prevMalaPreview");
  if (_pml) _pml.textContent = "0";
  const _plp = document.getElementById("prevLifetimePreview");
  if (_plp) _plp.textContent = "—";
  App.ua();
  ghostAwareSave();
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
  } else if (App.S.japMode === "kv") {
    App.S.nameJapDeductKV = (App.S.nameJapDeductKV || 0) + n;
  } else if (App.S.japMode === "ss") {
    App.S.nameJapDeductSS = (App.S.nameJapDeductSS || 0) + n;
  } else if (App.S.japMode === "ram") {
    App.S.nameJapDeductRam = (App.S.nameJapDeductRam || 0) + n;
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
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  const cur = isRV
    ? App.S.nameJapDeductRV || 0
    : isHK
      ? App.S.nameJapDeductHK || 0
      : isKV
        ? App.S.nameJapDeductKV || 0
        : isSS
          ? App.S.nameJapDeductSS || 0
          : isRam
            ? App.S.nameJapDeductRam || 0
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
  } else if (isKV) {
    App.S.nameJapDeductKV = cur - n;
  } else if (isSS) {
    App.S.nameJapDeductSS = cur - n;
  } else if (isRam) {
    App.S.nameJapDeductRam = cur - n;
  } else {
    App.S.nameJapDeduct = cur - n;
  }
  App.ua();
  ghostAwareSave();
  document.getElementById("nameJapRestoreIn").value = "";
  document.getElementById("nameJapRestorePreview").textContent = "—";
  uStats();
  toast("Restored " + n.toLocaleString() + " jap to lifetime total 🙏");
}

// ── Dedications: offer a portion of lifetime jap to a purpose/person ──
// Reuses the same nameJapDeduct/RV/KV counters as the manual "Deduct Name
// Jap" tool above (so lifetime totals update immediately), and additionally
// keeps a purpose/date/note log so past offerings can be reviewed or undone.
// Supports selecting multiple types at once (e.g. Radha + RV together),
// each with its own lifetime total, its own jap/mala input, and its own
// live "remaining after gift" preview — plus a combined preview of
// everything about to be gifted, shown before the Dedicate button.
window._dedTypes = new Set(["radha"]);
window._dedAmounts = {}; // type -> jap amount currently entered (unsaved, in-progress)
window._dedStotrams = window._dedStotrams || []; // [{name, count}] manually entered stotram gifts (unsaved, in-progress)

function _dedTypeMeta(type) {
  if (type === "rv") return { label: "Radha Vallabh", color: "#5eead4" };
  if (type === "kv") return { label: "Krishnay Vasudevay", color: "#6DB8FF" };
  if (type === "hk") return { label: "Hare Krishna", color: "#c9a7ff" };
  if (type === "ss") return { label: "Samba Sadashiv", color: "#ffb86c" };
  if (type === "ram") return { label: "Raam Vijay Mantra", color: "#FF9933" };
  return { label: "Radha", color: "#f5c842" };
}

// Current lifetime total for a type — same formula uStats() uses for the
// Summary Stats "Lifetime" row (raw history sum minus recorded deductions).
function _dedLifetimeFor(type) {
  if (type === "rv") {
    return Math.max(
      0,
      Object.values(App.S.historyRV || {}).reduce((a, b) => a + b, 0) -
        (App.S.nameJapDeductRV || 0),
    );
  }
  if (type === "kv") {
    return Math.max(
      0,
      Object.values(App.S.historyKV || {}).reduce((a, b) => a + b, 0) -
        (App.S.nameJapDeductKV || 0),
    );
  }
  if (type === "hk") {
    return Math.max(
      0,
      Object.values(App.S.historyHK || {}).reduce((a, b) => a + b, 0) -
        (App.S.nameJapDeductHK || 0),
    );
  }
  if (type === "ss") {
    return Math.max(
      0,
      Object.values(App.S.historySS || {}).reduce((a, b) => a + b, 0) -
        (App.S.nameJapDeductSS || 0),
    );
  }
  if (type === "ram") {
    return Math.max(
      0,
      Object.values(App.S.historyRam || {}).reduce((a, b) => a + b, 0) -
        (App.S.nameJapDeductRam || 0),
    );
  }
  return Math.max(
    0,
    Object.values(App.S.history || {}).reduce((a, b) => a + b, 0) -
      (App.S.nameJapDeduct || 0),
  );
}

function _dedAdjustCounter(type, delta) {
  if (type === "rv") {
    App.S.nameJapDeductRV = Math.max(0, (App.S.nameJapDeductRV || 0) + delta);
  } else if (type === "kv") {
    App.S.nameJapDeductKV = Math.max(0, (App.S.nameJapDeductKV || 0) + delta);
  } else if (type === "hk") {
    App.S.nameJapDeductHK = Math.max(0, (App.S.nameJapDeductHK || 0) + delta);
  } else if (type === "ss") {
    App.S.nameJapDeductSS = Math.max(0, (App.S.nameJapDeductSS || 0) + delta);
  } else if (type === "ram") {
    App.S.nameJapDeductRam = Math.max(0, (App.S.nameJapDeductRam || 0) + delta);
  } else {
    App.S.nameJapDeduct = Math.max(0, (App.S.nameJapDeduct || 0) + delta);
  }
}

function toggleDedicationType(type, el) {
  if (window._dedTypes.has(type)) {
    // Don't allow deselecting the last remaining type
    if (window._dedTypes.size > 1) {
      window._dedTypes.delete(type);
      delete window._dedAmounts[type];
    }
  } else {
    window._dedTypes.add(type);
  }
  if (el) el.classList.toggle("active", window._dedTypes.has(type));
  renderDedTypePanels();
}

// Rebuilds the per-type interactive panels (lifetime total + jap/mala input
// + live remaining preview) for every currently-selected type.
function renderDedTypePanels() {
  const wrap = document.getElementById("dedTypePanels");
  if (!wrap) return;
  const ms = App.S.ms || 108;
  const order = ["radha", "rv", "kv", "hk", "ss", "ram"].filter((t) => window._dedTypes.has(t));

  wrap.innerHTML = order
    .map((type) => {
      const meta = _dedTypeMeta(type);
      const lifetime = _dedLifetimeFor(type);
      const curAmt = window._dedAmounts[type] || 0;
      const curMala = curAmt ? Math.round((curAmt / ms) * 100) / 100 : "";
      return (
        '<div style="border:1.5px solid ' +
        meta.color +
        '55;background:' +
        meta.color +
        '0d;border-radius:12px;padding:10px 12px;margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px;">' +
        '<span style="font-size:11px;font-weight:700;color:' +
        meta.color +
        '">' +
        meta.label +
        "</span>" +
        '<span style="font-size:11px;color:var(--td);">Lifetime: <b style="color:' +
        meta.color +
        '">' +
        lifetime.toLocaleString("en-IN") +
        "</b> jap · " +
        Math.floor(lifetime / ms) +
        " malas</span>" +
        "</div>" +
        '<div style="display:flex;gap:8px;">' +
        '<div style="flex:1;"><input type="number" class="fi" style="font-size:12px;padding:7px 8px;" id="dedJapIn_' +
        type +
        '" placeholder="Jap amount" min="1" value="' +
        (curAmt || "") +
        '" oninput="syncDedJapToMala(\'' +
        type +
        '\')"></div>' +
        '<div style="flex:1;"><input type="number" step="0.1" class="fi" style="font-size:12px;padding:7px 8px;" id="dedMalaIn_' +
        type +
        '" placeholder="Malas" min="0" value="' +
        curMala +
        '" oninput="syncDedMalaToJap(\'' +
        type +
        '\')"></div>' +
        "</div>" +
        '<div style="font-size:11px;margin-top:6px;" id="dedRemain_' +
        type +
        '"></div>' +
        "</div>"
      );
    })
    .join("");

  order.forEach((type) => _updateDedRemain(type));
  _updateDedSummary();
}

function syncDedJapToMala(type) {
  const ms = App.S.ms || 108;
  const japEl = document.getElementById("dedJapIn_" + type);
  const malaEl = document.getElementById("dedMalaIn_" + type);
  const v = parseInt(japEl.value) || 0;
  window._dedAmounts[type] = v;
  if (malaEl) malaEl.value = v ? Math.round((v / ms) * 100) / 100 : "";
  _updateDedRemain(type);
  _updateDedSummary();
}

function syncDedMalaToJap(type) {
  const ms = App.S.ms || 108;
  const japEl = document.getElementById("dedJapIn_" + type);
  const malaEl = document.getElementById("dedMalaIn_" + type);
  const m = parseFloat(malaEl.value) || 0;
  const v = Math.round(m * ms);
  window._dedAmounts[type] = v;
  if (japEl) japEl.value = v || "";
  _updateDedRemain(type);
  _updateDedSummary();
}

function _updateDedRemain(type) {
  const el = document.getElementById("dedRemain_" + type);
  if (!el) return;
  const lifetime = _dedLifetimeFor(type);
  const amt = window._dedAmounts[type] || 0;
  const ms = App.S.ms || 108;
  if (amt <= 0) {
    el.innerHTML = "";
    return;
  }
  const remain = lifetime - amt;
  if (remain < 0) {
    el.innerHTML =
      "⚠️ Exceeds lifetime total (" + lifetime.toLocaleString("en-IN") + " jap available)";
    el.style.color = "#E15A6B";
  } else {
    el.innerHTML =
      "Remaining after gift: <b>" +
      remain.toLocaleString("en-IN") +
      "</b> jap (" +
      Math.floor(remain / ms) +
      " malas)";
    el.style.color = "var(--td)";
  }
}

// Combined "what you're about to gift" preview, shown just above the
// Dedicate button so it's clear exactly what will be deducted before
// committing.
function _updateDedSummary() {
  const el = document.getElementById("dedSummaryBar");
  if (!el) return;
  const ms = App.S.ms || 108;
  const parts = [];
  let japTotal = 0;
  ["radha", "rv", "kv", "hk", "ss", "ram"].forEach((type) => {
    const amt = window._dedAmounts[type] || 0;
    if (amt > 0 && window._dedTypes.has(type)) {
      japTotal += amt;
      const meta = _dedTypeMeta(type);
      parts.push(
        '<span style="color:' +
          meta.color +
          ';font-weight:700">' +
          meta.label +
          "</span>: " +
          amt.toLocaleString("en-IN") +
          " jap (" +
          Math.round((amt / ms) * 100) / 100 +
          " malas)",
      );
    }
  });

  const stotrams = window._dedStotrams || [];
  const stotramTotal = stotrams.reduce((a, s) => a + (s.count || 0), 0);

  if (!parts.length && !stotrams.length) {
    el.innerHTML = "";
    return;
  }

  let html =
    '<div style="font-size:9px;color:rgba(255,143,199,0.75);letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:4px;">🎁 You are gifting</div>';
  if (parts.length) {
    html +=
      '<div style="margin-bottom:4px;">Total Jap gifting: <b style="color:#FF8FC7">' +
      japTotal.toLocaleString("en-IN") +
      "</b></div>" +
      parts.join("<br>");
  }
  if (stotrams.length) {
    html +=
      (parts.length ? '<div style="margin-top:6px;">' : "<div>") +
      "+ Stotram: <b style=\"color:#FF8FC7\">" +
      stotramTotal.toLocaleString("en-IN") +
      "</b> (not counted with jap)</div>" +
      stotrams
        .map((s) => escHtml(s.name) + ": " + s.count.toLocaleString("en-IN"))
        .join("<br>");
  }
  el.innerHTML = html;
}

// ── Manual Stotram gift entry — user types a stotram name + count by hand;
// tracked as its own list on the dedication, separate from jap totals.
function addDedStotram() {
  if (isGhostMode()) return; // ghost mode: read-only
  const nameEl = document.getElementById("dedStNameIn");
  const countEl = document.getElementById("dedStCountIn");
  const name = (nameEl.value || "").trim();
  const count = parseInt(countEl.value) || 0;
  if (!name) {
    toast("Please enter a stotram name");
    return;
  }
  if (count <= 0) {
    toast("Please enter a count greater than 0");
    return;
  }
  window._dedStotrams = window._dedStotrams || [];
  window._dedStotrams.push({ name, count });
  nameEl.value = "";
  countEl.value = "";
  renderDedStotramList();
  _updateDedSummary();
}

function removeDedStotram(idx) {
  if (isGhostMode()) return; // ghost mode: read-only
  window._dedStotrams.splice(idx, 1);
  renderDedStotramList();
  _updateDedSummary();
}

function renderDedStotramList() {
  const wrap = document.getElementById("dedStotramList");
  if (!wrap) return;
  const stotrams = window._dedStotrams || [];
  if (!stotrams.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = stotrams
    .map(
      (s, i) =>
        '<div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 10px;">' +
        '<span style="font-size:12px;color:var(--tl);">' +
        escHtml(s.name) +
        ': <b style="color:#FF8FC7">' +
        s.count.toLocaleString("en-IN") +
        "</b></span>" +
        '<span onclick="removeDedStotram(' +
        i +
        ')" style="cursor:pointer;color:var(--td);font-size:12px;padding:2px 4px;">✕</span>' +
        "</div>",
    )
    .join("");
}

// Normalize an entry to a {type: amount} map — supports old entries saved
// with a single `type`+`amount`, old multi-type entries saved with
// `types`+`amount` (same amount applied to each), and the current format
// saved with `amounts: {type: amount}`.
function _dedEntryAmounts(d) {
  if (d.amounts && typeof d.amounts === "object") return d.amounts;
  const types = Array.isArray(d.types) && d.types.length ? d.types : [d.type || "radha"];
  const amt = d.amount || 0;
  const out = {};
  types.forEach((t) => (out[t] = amt));
  return out;
}

// ═══════════════════════════════════════════════════════
// PERMANENT GIFT LEDGER — a durable record of every gift, kept separate
// from App.S.dedications on purpose.
//
// Why: App.S.dedications lives inside the big "state" blob, which gets
// (a) wiped to defaults on every UID change / cold start, (b) rebuilt from
// whichever source (local IDB vs cloud) happens to win a race, and
// (c) pushed to Firestore on a 3s DEBOUNCE — so an entry added right
// before the app is closed/killed can miss that window and never reach
// the cloud, and can then be dropped by a subsequent reset/reload.
//
// This ledger avoids all three: each gift is (1) written to its own IDB
// record immediately — never bulk-overwritten, (2) pushed to its own
// Firestore document immediately (no debounce, no dependency on
// App._cloudHydrated), and (3) only ever added to, never replaced.
// ═══════════════════════════════════════════════════════
async function addPermanentGift(entry) {
  const id = "gift_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const record = { id, ...entry, ts: Date.now() };

  // 1. Local — its own IDB record, isolated from the state blob.
  if (App._uid) {
    await App.dbPut("giftLedger", id, record);
  }
  App.S.giftLedger = App.S.giftLedger || {};
  App.S.giftLedger[id] = record;

  // 2. Cloud — its own Firestore document, written immediately (no
  // debounce, no _cloudHydrated gate) so it can't be lost to the same
  // race that can drop a dedication.
  if (fbUser && typeof fbDb !== "undefined") {
    try {
      await fbDb
        .collection("users")
        .doc(fbUser.uid)
        .collection("gifts")
        .doc(id)
        .set(record);
    } catch (e) {
      console.warn("Permanent gift ledger: cloud write failed, kept locally:", e.message);
    }
  }

  renderPermanentGiftLog();
  return record;
}

// Pull any ledger entries added from other devices/sessions and merge them
// in (union by id — never removes a locally-known entry).
async function pullPermanentGiftLedger() {
  if (!fbUser || typeof fbDb === "undefined") return;
  try {
    const snap = await fbDb
      .collection("users")
      .doc(fbUser.uid)
      .collection("gifts")
      .get();
    App.S.giftLedger = App.S.giftLedger || {};
    for (const doc of snap.docs) {
      const remote = doc.data();
      if (!remote || !remote.id) continue;
      if (!App.S.giftLedger[remote.id]) {
        App.S.giftLedger[remote.id] = remote;
        if (App._uid) await App.dbPut("giftLedger", remote.id, remote);
      }
    }
    renderPermanentGiftLog();
  } catch (e) {
    console.warn("Permanent gift ledger: cloud pull failed:", e.message);
  }
}

function renderPermanentGiftLog() {
  const el = document.getElementById("permGiftList");
  if (!el) return;
  const entries = Object.values(App.S.giftLedger || {}).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!entries.length) {
    el.innerHTML =
      '<div style="font-size:12px;color:var(--td);text-align:center;padding:10px 0;">No gifts recorded yet 🌸</div>';
    return;
  }
  el.innerHTML = entries
    .map((g) => {
      const parts = [];
      if (g.amounts) {
        for (const t of Object.keys(g.amounts)) {
          parts.push((g.amounts[t] || 0).toLocaleString("en-IN") + " " + t.toUpperCase());
        }
      }
      return (
        '<div style="border:1px solid rgba(255,143,199,0.25);border-radius:10px;padding:8px 10px;font-size:12px;">' +
        '<div style="font-weight:600;color:#FF8FC7;">' + (g.purpose || "Untitled gift") + "</div>" +
        '<div style="color:var(--tl);margin-top:2px;">' + parts.join(" + ") + "</div>" +
        (g.note ? '<div style="color:var(--td);margin-top:2px;font-size:11px;">' + g.note + "</div>" : "") +
        '<div style="color:var(--td);margin-top:2px;font-size:10px;">' + (g.date || "") + "</div>" +
        "</div>"
      );
    })
    .join("");
}

function addDedication() {
  if (isGhostMode()) return; // ghost mode: read-only
  const purposeEl = document.getElementById("dedPurposeIn");
  const dateEl = document.getElementById("dedDateIn");
  const noteEl = document.getElementById("dedNoteIn");
  const purpose = (purposeEl.value || "").trim();
  const date = (dateEl && dateEl.value) || _ldk(new Date());
  const note = (noteEl.value || "").trim();

  const amounts = {};
  Array.from(window._dedTypes || []).forEach((type) => {
    const amt = window._dedAmounts[type] || 0;
    if (amt > 0) amounts[type] = amt;
  });
  const types = Object.keys(amounts);
  const stotrams = (window._dedStotrams || []).slice();

  if (!types.length && !stotrams.length) {
    toast("Please enter a jap amount for at least one selected type, or add a stotram gift");
    return;
  }
  if (!purpose) {
    toast("Please enter a purpose or name");
    return;
  }
  for (const type of types) {
    if (amounts[type] > _dedLifetimeFor(type)) {
      toast(
        "Amount for " + _dedTypeMeta(type).label + " exceeds its lifetime total",
      );
      return;
    }
  }

  if (!App.S.dedications) App.S.dedications = [];
  App.S.dedications.unshift({
    id: "ded_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    types,
    amounts,
    stotrams,
    purpose,
    note,
    date,
    ts: Date.now(),
  });

  // Deduct from each selected type's lifetime total — same mechanism as
  // "Deduct Name Jap". Manual stotram gifts are a hand-entered log only and
  // are not deducted from anything.
  types.forEach((type) => _dedAdjustCounter(type, amounts[type]));

  // PERMANENT record — written immediately, independent of App.save()'s
  // debounced cloud push, so this entry can't be lost the way a plain
  // dedication can be. Fire-and-forget so it doesn't block the UI.
  addPermanentGift({ types, amounts, stotrams, purpose, note, date }).catch(() => {});

  App.save();
  App.ua();
  fbDebouncedPush();

  purposeEl.value = "";
  noteEl.value = "";
  if (dateEl) dateEl.value = _ldk(new Date());
  window._dedAmounts = {};
  window._dedStotrams = [];
  renderDedTypePanels();
  renderDedStotramList();
  renderDedications();
  uStats();

  const summaryParts = types.map(
    (t) => amounts[t].toLocaleString("en-IN") + " " + _dedTypeMeta(t).label,
  );
  if (stotrams.length) {
    const stTotal = stotrams.reduce((a, s) => a + (s.count || 0), 0);
    summaryParts.push(stTotal.toLocaleString("en-IN") + " Stotram");
  }
  toast("🙏 Dedicated " + summaryParts.join(" + ") + " — Jai Radhe!");
}

function deleteDedication(id) {
  if (isGhostMode()) return; // ghost mode: read-only
  const list = App.S.dedications || [];
  const entry = list.find((d) => d.id === id);
  if (!entry) return;
  const amounts = _dedEntryAmounts(entry);
  const breakdown = Object.keys(amounts)
    .map((t) => amounts[t].toLocaleString("en-IN") + " " + _dedTypeMeta(t).label)
    .join(" + ");
  const stotrams = entry.stotrams || [];
  const stotramNote = stotrams.length
    ? " (its " +
      stotrams.reduce((a, s) => a + (s.count || 0), 0).toLocaleString("en-IN") +
      " Stotram gift will just be removed from the log)"
    : "";
  if (
    !confirm(
      "Remove this dedication" +
        (breakdown ? " and restore " + breakdown + " to the lifetime totals" : "") +
        stotramNote +
        "?",
    )
  )
    return;

  Object.keys(amounts).forEach((t) => _dedAdjustCounter(t, -amounts[t]));
  App.S.dedications = list.filter((d) => d.id !== id);

  App.save();
  App.ua();
  fbDebouncedPush();
  renderDedications();
  uStats();
  toast("Removed dedication & restored to lifetime total 🙏");
}

// ── Edit an existing dedication: title (purpose), note, and each type's
// jap entry amount. Toggled inline in the Gift/Dedications list (main
// Statistics section — separate from the 28 Names stats panel). ──
window._dedEditingId = null;

function toggleEditDedication(id) {
  if (isGhostMode()) return; // ghost mode: read-only
  window._dedEditingId = window._dedEditingId === id ? null : id;
  renderDedications();
}

function saveDedicationEdit(id) {
  if (isGhostMode()) return; // ghost mode: read-only
  const list = App.S.dedications || [];
  const d = list.find((x) => x.id === id);
  if (!d) return;

  const purposeEl = document.getElementById("dedEditPurpose_" + id);
  const noteEl = document.getElementById("dedEditNote_" + id);
  const newPurpose = (purposeEl && purposeEl.value.trim()) || "";
  const newNote = (noteEl && noteEl.value.trim()) || "";
  if (!newPurpose) {
    toast("Please enter a purpose or name");
    return;
  }

  const oldAmounts = _dedEntryAmounts(d);
  const newAmounts = {};
  for (const type of Object.keys(oldAmounts)) {
    const inEl = document.getElementById("dedEditAmt_" + type + "_" + id);
    const n = parseInt(inEl && inEl.value) || 0;
    if (n > 0) newAmounts[type] = n;
  }

  // Validate: each type's increase can't exceed what's currently available
  // (its lifetime total already excludes this entry's OLD amount, so the
  // room available for the NEW amount is old-lifetime + old-amount).
  for (const type of Object.keys(newAmounts)) {
    const delta = newAmounts[type] - (oldAmounts[type] || 0);
    if (delta > 0 && delta > _dedLifetimeFor(type)) {
      toast(
        "New amount for " + _dedTypeMeta(type).label + " exceeds its available lifetime total",
      );
      return;
    }
  }

  // Apply deltas to the lifetime deduction counters
  const allTypes = new Set([...Object.keys(oldAmounts), ...Object.keys(newAmounts)]);
  allTypes.forEach((type) => {
    const delta = (newAmounts[type] || 0) - (oldAmounts[type] || 0);
    if (delta !== 0) _dedAdjustCounter(type, delta);
  });

  d.purpose = newPurpose;
  d.note = newNote;
  d.amounts = newAmounts;
  d.types = Object.keys(newAmounts);
  d._editedTs = Date.now();

  window._dedEditingId = null;
  App.save();
  App.ua();
  fbDebouncedPush();
  renderDedications();
  uStats();
  toast("Dedication updated 🙏");
}

function _fmtDedDate(ds) {
  try {
    const parts = (ds || "").split("-");
    if (parts.length !== 3) return ds || "";
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch (e) {
    return ds || "";
  }
}

function renderDedications() {
  renderPermanentGiftLog();
  const wrapList = document.getElementById("dedList");
  const wrapTotals = document.getElementById("dedTotalsBar");
  if (!wrapList) return;
  const list = App.S.dedications || [];
  const ms = App.S.ms || 108;

  if (!list.length) {
    wrapList.innerHTML =
      '<div style="font-size:12px;color:var(--td);text-align:center;padding:10px 0;">No dedications yet 🌸</div>';
    if (wrapTotals) wrapTotals.innerHTML = "";
    return;
  }

  let totRadha = 0,
    totRV = 0,
    totKV = 0,
    totHK = 0,
    totStotram = 0;
  list.forEach((d) => {
    const amounts = _dedEntryAmounts(d);
    totRadha += amounts.radha || 0;
    totRV += amounts.rv || 0;
    totKV += amounts.kv || 0;
    totHK += amounts.hk || 0;
    (d.stotrams || []).forEach((s) => (totStotram += s.count || 0));
  });
  const totJap = totRadha + totRV + totKV + totHK;
  if (wrapTotals) {
    const parts = [];
    if (totRadha)
      parts.push(
        '<span style="color:#f5c842;font-weight:600">' + totRadha.toLocaleString() + "</span> Radha",
      );
    if (totRV)
      parts.push(
        '<span style="color:#5eead4;font-weight:600">' + totRV.toLocaleString() + "</span> RV",
      );
    if (totKV)
      parts.push(
        '<span style="color:#6DB8FF;font-weight:600">' + totKV.toLocaleString() + "</span> KV",
      );
    if (totHK)
      parts.push(
        '<span style="color:#c9a7ff;font-weight:600">' + totHK.toLocaleString() + "</span> HK",
      );
    let html =
      "🙏 Total Jap gifting: <b style=\"color:#FF8FC7\">" +
      totJap.toLocaleString() +
      "</b>" +
      (parts.length ? " (" + parts.join(" · ") + ")" : "");
    if (totStotram)
      html +=
        ' &nbsp;+&nbsp; <span style="color:#FF8FC7;font-weight:600">' +
        totStotram.toLocaleString() +
        "</span> Stotram <span style=\"opacity:0.7\">(not counted with jap)</span>";
    wrapTotals.innerHTML = html;
  }

  wrapList.innerHTML = list
    .map((d) => {
      const amounts = _dedEntryAmounts(d);
      const badges = Object.keys(amounts)
        .map((t) => {
          const meta = _dedTypeMeta(t);
          return (
            '<span style="font-size:10px;font-weight:700;color:' +
            meta.color +
            ";border:1px solid " +
            meta.color +
            '55;border-radius:6px;padding:1px 6px;">' +
            meta.label +
            ": " +
            amounts[t].toLocaleString("en-IN") +
            " jap (" +
            Math.floor(amounts[t] / ms) +
            "m)</span>"
          );
        })
        .concat(
          (d.stotrams || []).map(
            (s) =>
              '<span style="font-size:10px;font-weight:700;color:#FF8FC7;border:1px solid rgba(255,143,199,0.4);border-radius:6px;padding:1px 6px;">' +
              escHtml(s.name) +
              ": " +
              s.count.toLocaleString("en-IN") +
              "</span>",
          ),
        )
        .join(" ");
      const dateDisp = d.date ? _fmtDedDate(d.date) : "";
      if (window._dedEditingId === d.id) {
        const amtFields = Object.keys(amounts)
          .map((t) => {
            const meta = _dedTypeMeta(t);
            return (
              '<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px;">' +
              '<span style="font-size:11px;color:' +
              meta.color +
              ";flex:1;font-weight:600;\">" +
              meta.label +
              "</span>" +
              '<input id="dedEditAmt_' +
              t +
              "_" +
              d.id +
              '" type="number" min="0" value="' +
              amounts[t] +
              '" style="width:90px;background:rgba(0,0,0,0.35);border:1px solid ' +
              meta.color +
              '55;border-radius:7px;padding:5px 8px;color:var(--tl);font-size:13px;text-align:center;font-family:Inter,sans-serif">' +
              '<span style="font-size:10px;color:var(--td)">jap</span>' +
              "</div>"
            );
          })
          .join("");
        return (
          '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,143,199,0.35);border-radius:12px;padding:10px 12px;">' +
          '<div style="font-size:10px;color:#FF8FC7;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;font-weight:600">✏ Editing Dedication</div>' +
          '<input id="dedEditPurpose_' +
          d.id +
          '" type="text" value="' +
          escHtml(d.purpose) +
          '" placeholder="Purpose or name" style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,143,199,0.3);border-radius:8px;padding:7px 9px;color:var(--tl);font-size:13px;margin-bottom:8px;font-family:Inter,sans-serif">' +
          '<textarea id="dedEditNote_' +
          d.id +
          '" class="sk-ta" style="min-height:44px;margin-bottom:8px" placeholder="Note (optional)">' +
          escHtml(d.note || "") +
          "</textarea>" +
          (amtFields || "") +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">' +
          '<button class="sk-btn" style="color:var(--td);border-color:rgba(255,255,255,0.2)" onclick="toggleEditDedication(\'' +
          d.id +
          "')\">Cancel</button>" +
          '<button class="sk-btn grn" onclick="saveDedicationEdit(\'' +
          d.id +
          "')\">💾 Save Changes</button>" +
          "</div>" +
          "</div>"
        );
      }
      return (
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:10px 12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
        '<div style="font-size:13px;color:var(--tl);font-weight:600;flex:1;">' +
        escHtml(d.purpose) +
        "</div>" +
        '<div style="display:flex;gap:10px;align-items:center;">' +
        '<div onclick="toggleEditDedication(\'' +
        d.id +
        '\')" style="cursor:pointer;font-size:14px;color:var(--td);padding:2px 4px;">✏️</div>' +
        '<div onclick="deleteDedication(\'' +
        d.id +
        '\')" style="cursor:pointer;font-size:14px;color:var(--td);padding:2px 4px;">🗑️</div>' +
        "</div>" +
        "</div>" +
        '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;">' +
        badges +
        "</div>" +
        '<div style="font-size:11px;color:var(--td);margin-top:6px;">' +
        dateDisp +
        "</div>" +
        (d.note
          ? '<div style="font-size:11px;color:var(--td);margin-top:6px;line-height:1.4;">' +
            escHtml(d.note) +
            "</div>"
          : "") +
        "</div>"
      );
    })
    .join("");
}


function deductTodayJap() {
  const n = parseInt(document.getElementById("deductTodayIn").value) || 0;
  if (n <= 0) {
    toast("Please enter a number > 0");
    return;
  }
  const isRV = App.S.japMode === "rv";
  const isHK = App.S.japMode === "hk";
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  const hist = isRV
    ? App.S.historyRV
    : isHK
      ? App.S.historyHK || (App.S.historyHK = {})
      : isKV
        ? App.S.historyKV || (App.S.historyKV = {})
        : isSS
          ? App.S.historySS || (App.S.historySS = {})
          : isRam
            ? App.S.historyRam || (App.S.historyRam = {})
            : App.S.history;
  const cur = hist[App.S.tk] || 0;
  if (n > cur) {
    toast("Cannot deduct more than today's count (" + cur + ")");
    return;
  }
  hist[App.S.tk] = cur - n;
  const lmcKey = isRV ? "lmcRV" : isHK ? "lmcHK" : isKV ? "lmcKV" : isSS ? "lmcSS" : isRam ? "lmcRam" : "lmc";
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
      : isKV
        ? App.S.malaLogKV || (App.S.malaLogKV = [])
        : isSS
          ? App.S.malaLogSS || (App.S.malaLogSS = [])
          : isRam
            ? App.S.malaLogRam || (App.S.malaLogRam = [])
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

  App.ua();
  ghostAwareSave();
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
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  const hist = isRV
    ? App.S.historyRV
    : isHK
      ? App.S.historyHK || (App.S.historyHK = {})
      : isKV
        ? App.S.historyKV || (App.S.historyKV = {})
        : isSS
          ? App.S.historySS || (App.S.historySS = {})
          : isRam
            ? App.S.historyRam || (App.S.historyRam = {})
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
        : isKV
          ? App.S.timerHistoryKV || (App.S.timerHistoryKV = {})
          : isSS
            ? App.S.timerHistorySS || (App.S.timerHistorySS = {})
            : isRam
              ? App.S.timerHistoryRam || (App.S.timerHistoryRam = {})
              : App.S.timerHistory || (App.S.timerHistory = {});
    th[date] = Math.max(0, (th[date] || 0) - timeSecs);
  }

  App.ua();
  ghostAwareSave();
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
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  const hist = isRV
    ? App.S.historyRV
    : isHK
      ? App.S.historyHK || (App.S.historyHK = {})
      : isKV
        ? App.S.historyKV || (App.S.historyKV = {})
        : isSS
          ? App.S.historySS || (App.S.historySS = {})
          : isRam
            ? App.S.historyRam || (App.S.historyRam = {})
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
        : isKV
          ? App.S.timerHistoryKV || (App.S.timerHistoryKV = {})
          : isSS
            ? App.S.timerHistorySS || (App.S.timerHistorySS = {})
            : isRam
              ? App.S.timerHistoryRam || (App.S.timerHistoryRam = {})
              : App.S.timerHistory || (App.S.timerHistory = {});
    th[date] = (th[date] || 0) + timeSecs;
  }
  _recordManualJap(isRV ? "rv" : isHK ? "hk" : isKV ? "kv" : isSS ? "ss" : isRam ? "ram" : "radha", date, n, timeSecs);

  App.ua();
  ghostAwareSave();
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
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  const log = isRV
    ? App.S.malaLogRV || (App.S.malaLogRV = [])
    : isHK
      ? App.S.malaLogHK || (App.S.malaLogHK = [])
      : isKV
        ? App.S.malaLogKV || (App.S.malaLogKV = [])
        : isSS
          ? App.S.malaLogSS || (App.S.malaLogSS = [])
          : isRam
            ? App.S.malaLogRam || (App.S.malaLogRam = [])
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
  App.ua();
  ghostAwareSave();
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
  App.ua();
  ghostAwareSave();
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
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  const log = isRV ? App.S.malaLogRV || [] : isKV ? App.S.malaLogKV || [] : isSS ? App.S.malaLogSS || [] : isRam ? App.S.malaLogRam || [] : App.S.malaLog || [];
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
  App.ua();
  ghostAwareSave();
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
  App.ua();
  ghostAwareSave();
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
  const _isRamanandi = App.S.ramanandiMode || false;
  const _radhaTarget = App.S.dt || 0;
  const _rvTarget = App.S.dtRV || 0;
  const _hkTarget = App.S.dtHK || 0;
  const _kvTarget = App.S.dtKV || 0;
  const _ssTarget = App.S.dtSS || 0;
  const _ramTarget = App.S.dtRam || 0;
  // A target is "active" if at least one target is configured for the current mode
  const _hasTarget = _isGaudiya
    ? _hkTarget > 0
    : _isRamanandi
      ? _ramTarget > 0
      : _radhaTarget > 0 || _rvTarget > 0 || _kvTarget > 0 || _ssTarget > 0;
  // Returns true only when EVERY configured target for this mode is individually met on day k
  function _dayHitsTarget(k) {
    if (_isGaudiya) {
      return _hkTarget > 0 && (App.S.historyHK[k] || 0) >= _hkTarget;
    }
    if (_isRamanandi) {
      return _ramTarget > 0 && ((App.S.historyRam || {})[k] || 0) >= _ramTarget;
    }
    const radhaOk =
      _radhaTarget <= 0 || (App.S.history[k] || 0) >= _radhaTarget;
    const rvOk = _rvTarget <= 0 || (App.S.historyRV[k] || 0) >= _rvTarget;
    const kvOk = _kvTarget <= 0 || ((App.S.historyKV || {})[k] || 0) >= _kvTarget;
    const ssOk = _ssTarget <= 0 || ((App.S.historySS || {})[k] || 0) >= _ssTarget;
    return (_radhaTarget > 0 || _rvTarget > 0 || _kvTarget > 0 || _ssTarget > 0) && radhaOk && rvOk && kvOk && ssOk;
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
      ...Object.keys(App.S.historyKV || {}),
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
  const kvLifetime = Math.max(
    0,
    Object.values(App.S.historyKV || {}).reduce((a, b) => a + b, 0) -
      (App.S.nameJapDeductKV || 0),
  );
  const ssLifetime = Math.max(
    0,
    Object.values(App.S.historySS || {}).reduce((a, b) => a + b, 0) -
      (App.S.nameJapDeductSS || 0),
  );
  const ramLifetime = Math.max(
    0,
    Object.values(App.S.historyRam || {}).reduce((a, b) => a + b, 0) -
      (App.S.nameJapDeductRam || 0),
  );
  const n28Lifetime = Math.max(
    0,
    Object.values(App.S.h28 || {}).reduce((a, b) => a + b, 0) -
      (App.S.nameJapDeduct28 || 0),
  );
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
  const sKV = document.getElementById("sKVTot");
  if (sKV) sKV.textContent = kvLifetime.toLocaleString("en-IN");
  const sKVM = document.getElementById("sKVTotM");
  if (sKVM) sKVM.textContent = Math.floor(kvLifetime / ms) + " malas";
  const sKVF = document.getElementById("sKVTotF");
  if (sKVF) sKVF.textContent = fmtCount(kvLifetime) + " jap";
  const sSS = document.getElementById("sSSTot");
  if (sSS) sSS.textContent = ssLifetime.toLocaleString("en-IN");
  const sSSM = document.getElementById("sSSTotM");
  if (sSSM) sSSM.textContent = Math.floor(ssLifetime / ms) + " malas";
  const sSSF = document.getElementById("sSSTotF");
  if (sSSF) sSSF.textContent = fmtCount(ssLifetime) + " jap";
  const sRam = document.getElementById("sRamTot");
  if (sRam) sRam.textContent = ramLifetime.toLocaleString("en-IN");
  const sRamM = document.getElementById("sRamTotM");
  if (sRamM) sRamM.textContent = Math.floor(ramLifetime / ms) + " malas";
  const sRamF = document.getElementById("sRamTotF");
  if (sRamF) sRamF.textContent = fmtCount(ramLifetime) + " jap";
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
  // Combined Lifetime Jap — Radha + RV + KV + 28 names by default, SS + 28 names
  // in Gopeshwar Mahadev mode, or Ram + 28 names in Ramanandi mode
  const ltJapAll = App.S.trahimamMode
    ? ssLifetime + n28Lifetime
    : App.S.ramanandiMode
      ? ramLifetime + n28Lifetime
      : radhaLifetime + rvLifetime + kvLifetime + n28Lifetime;
  const sLtJA = document.getElementById("sLtJapAll");
  if (sLtJA) sLtJA.textContent = ltJapAll.toLocaleString("en-IN");
  const sLtJAF = document.getElementById("sLtJapAllF");
  if (sLtJAF) sLtJAF.textContent = fmtCount(ltJapAll) + " jap";
  // Gaudiya / Gopeshwar Mahadev / Ramanandi Mode: toggle visibility of stat boxes
  const isGaudiya = App.S.gaudiyaMode || false;
  const isTrahimam = App.S.trahimamMode || false;
  const isRamanandiUi = App.S.ramanandiMode || false;
  ["sbRadhaCount", "sbRadhaTime", "sbRVCount", "sbRVTime", "sbKVCount", "sbKVTime"].forEach((id) => {
    const el2 = document.getElementById(id);
    if (el2) el2.style.display = isGaudiya || isTrahimam || isRamanandiUi ? "none" : "";
  });
  ["sbSSCount", "sbSSTime"].forEach((id) => {
    const el2 = document.getElementById(id);
    if (el2) el2.style.display = isTrahimam ? "" : "none";
  });
  ["sbRamCount", "sbRamTime"].forEach((id) => {
    const el2 = document.getElementById(id);
    if (el2) el2.style.display = isRamanandiUi ? "" : "none";
  });
  ["sb28Count", "sb28Time", "sbLtJapAll", "sbLtTime"].forEach((id) => {
    const el2 = document.getElementById(id);
    if (el2) el2.style.display = isGaudiya ? "none" : "";
  });
  // HK stat boxes: show in gaudiyaMode
  // (handled by CSS .hk-only-stat, but also JS for safety)
  // HK time stats
  const hkTH = App.S.timerHistoryHK || {};
  const isHKMode = App.S.japMode === "hk";
  const liveExtraHK =
    isHKMode ? (App.currentMalaSeconds || 0) : 0;
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
  // Includes live in-progress deltas — same components getTotalJapSecondsToday()
  // uses — since Lifetime always includes today's still-accumulating activity.
  // Without this it silently under-reports vs. Today while a mala/cycle is
  // still in progress.
  const _ltLiveMain = App.isMainLiveInCombinedGroup() ? (App.currentMalaSeconds || 0) : 0;
  let _ltLive28 = 0;
  if (App._n28TotalStart && !App._n28Paused) {
    const _ltEl = Math.floor((Date.now() - App._n28TotalStart) / 1000);
    _ltLive28 = Math.max(0, _ltEl - (App._n28SavedSecs || 0));
  }
  const ltTimeSec =
    Object.values(App.getCombinedTimerHistory()).reduce((a, b) => a + b, 0) +
    Object.values(App.S.timer28History || {}).reduce((a, b) => a + b, 0) +
    _ltLiveMain + _ltLive28;
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
  const kvPTod = (App.S.historyKV || {})[App.S.tk] || 0;
  const kvPWk = wk.reduce((s, k) => s + ((App.S.historyKV || {})[k] || 0), 0);
  const kvPMo = Object.entries(App.S.historyKV || {})
    .filter(([k]) => k.startsWith(mp))
    .reduce((s, [, v]) => s + v, 0);
  const ssPTod = (App.S.historySS || {})[App.S.tk] || 0;
  const ssPWk = wk.reduce((s, k) => s + ((App.S.historySS || {})[k] || 0), 0);
  const ssPMo = Object.entries(App.S.historySS || {})
    .filter(([k]) => k.startsWith(mp))
    .reduce((s, [, v]) => s + v, 0);
  const ramPTod = (App.S.historyRam || {})[App.S.tk] || 0;
  const ramPWk = wk.reduce((s, k) => s + ((App.S.historyRam || {})[k] || 0), 0);
  const ramPMo = Object.entries(App.S.historyRam || {})
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
  _sn("sKVPTod", kvPTod);
  _sm("sKVPTodM", kvPTod);
  _sn("sKVPWk", kvPWk);
  _sm("sKVPWkM", kvPWk);
  _sn("sKVPMo", kvPMo);
  _sm("sKVPMoM", kvPMo);
  _sn("sSSPTod", ssPTod);
  _sm("sSSPTodM", ssPTod);
  _sn("sSSPWk", ssPWk);
  _sm("sSSPWkM", ssPWk);
  _sn("sSSPMo", ssPMo);
  _sm("sSSPMoM", ssPMo);
  _sn("sRamPTod", ramPTod);
  _sm("sRamPTodM", ramPTod);
  _sn("sRamPWk", ramPWk);
  _sm("sRamPWkM", ramPWk);
  _sn("sRamPMo", ramPMo);
  _sm("sRamPMoM", ramPMo);
  _sn("s28PTod", n28PTod);
  _sc("s28PTodM", n28PTod);
  _sn("s28PWk", n28PWk);
  _sc("s28PWkM", n28PWk);
  _sn("s28PMo", n28PMo);
  _sc("s28PMoM", n28PMo);
  // Combined Radha+RV+KV lifetime time
  const _eCombLt = document.getElementById("tCombLt");
  if (_eCombLt) {
    // Include the live in-progress mala delta, matching the Today/Week/Month
    // siblings (timeTod/timeWk/timeMo below) which already add it — without
    // this, Lifetime silently trailed Today while a mala was still in progress.
    const _combLiveExtra = App.isMainLiveInCombinedGroup() ? (App.currentMalaSeconds || 0) : 0;
    const _combLtSec =
      Object.values(App.S.timerHistory || {}).reduce((a, b) => a + b, 0) +
      Object.values(App.S.timerHistoryRV || {}).reduce((a, b) => a + b, 0) +
      Object.values(App.S.timerHistoryKV || {}).reduce((a, b) => a + b, 0) +
      _combLiveExtra;
    _eCombLt.textContent = fmtShort(_combLtSec);
  }
  // All combined period counts
  _sn("sAllTod", rPTod + rvPTod + kvPTod + n28PTod);
  _sn("sAllWk", rPWk + rvPWk + kvPWk + n28PWk);
  _sn("sAllMo", rPMo + rvPMo + kvPMo + n28PMo);
  // All combined period times
  const _rTH = App.S.timerHistory || {},
    _rvTH = App.S.timerHistoryRV || {},
    _kvTH = App.S.timerHistoryKV || {},
    _n28TH = App.S.timer28History || {};
  // Live in-progress deltas for the R+RV+KV+28 group — Radha/RV/KV share
  // currentMalaSeconds (only one is ever the selected sub-mode at a time);
  // 28 Names has its own independent live clock. Added to every period
  // below (all of them include "today"), so Today never runs ahead of
  // Week/Month/Lifetime while a mala/cycle is still in progress.
  const _allLiveMain = App.isMainLiveInCombinedGroup() ? (App.currentMalaSeconds || 0) : 0;
  let _allLive28 = 0;
  if (App._n28TotalStart && !App._n28Paused) {
    const _allEl = Math.floor((Date.now() - App._n28TotalStart) / 1000);
    _allLive28 = Math.max(0, _allEl - (App._n28SavedSecs || 0));
  }
  const _allLiveExtra = _allLiveMain + _allLive28;
  const _allTodTime =
    (_rTH[App.S.tk] || 0) + (_rvTH[App.S.tk] || 0) + (_kvTH[App.S.tk] || 0) + (_n28TH[App.S.tk] || 0) + _allLiveExtra;
  const _allWkTime = wk.reduce(
    (s, k) => s + (_rTH[k] || 0) + (_rvTH[k] || 0) + (_kvTH[k] || 0) + (_n28TH[k] || 0),
    0,
  ) + _allLiveExtra;
  const _allMoKeys = new Set([
    ...Object.keys(_rTH),
    ...Object.keys(_rvTH),
    ...Object.keys(_kvTH),
    ...Object.keys(_n28TH),
  ]);
  const _allMoTime = [..._allMoKeys]
    .filter((k) => k.startsWith(mp))
    .reduce(
      (s, k) => s + (_rTH[k] || 0) + (_rvTH[k] || 0) + (_kvTH[k] || 0) + (_n28TH[k] || 0),
      0,
    ) + _allLiveExtra;
  const _allLtTime =
    Object.values(_rTH).reduce((a, b) => a + b, 0) +
    Object.values(_rvTH).reduce((a, b) => a + b, 0) +
    Object.values(_kvTH).reduce((a, b) => a + b, 0) +
    Object.values(_n28TH).reduce((a, b) => a + b, 0) +
    _allLiveExtra;
  const _st = (id, v) => {
    const e = document.getElementById(id);
    if (e) e.textContent = fmtShort(v);
  };
  _st("tAllTod", _allTodTime);
  _st("tAllWk", _allWkTime);
  _st("tAllMo", _allMoTime);
  _st("tAllLt", _allLtTime);

  // ── Efficiency: Actual Jap Time ÷ Screen Time × 100, per period ──
  // Actual Jap Time reuses the SAME unified total shown as "Today Actual
  // Jap" (today) and the combined timerHistory* sums (week/month/lifetime).
  // Screen Time comes from App.S.screenTimeHistory (ticks only while a jap
  // display — Jap or 28 Names — is visible & foregrounded).
  (function () {
    // Efficiency is now Today-only, per request — Week/Month/Lifetime
    // efficiency isn't shown (their numbers could look impossible anyway
    // whenever Screen Time wasn't tracked for older days before this
    // feature existed). Quality (below) still covers all four periods.
    const scrHist = App.S.screenTimeHistory || {};
    const stotHist = App.S.stotramTimeHistory || {};
    // Jap entered manually (chanted off-screen at a real mala, reported
    // after the fact) still counts toward Total Name Jap / Actual Jap Time
    // everywhere else, but must be excluded here — neither its pace nor
    // any screen time was actually observed by the app.
    const _manTod = _MANUAL_TYPE_KEYS.reduce((s, t) => s + _manualSecondsFor(t, [App.S.tk]), 0);
    const japTodSec = Math.max(0, App.getTotalJapSecondsToday() - _manTod);
    const scrTodSec = scrHist[App.S.tk] || 0;
    const _pct = (jap, scr) => (scr > 0 ? Math.min(100, Math.round((jap / scr) * 1000) / 10) : 0);
    _st("effJapTod", japTodSec); _st("effScrTod", scrTodSec);
    _setEl("effPctTod", _pct(japTodSec, scrTodSec) + "%");
    // Stotram Time — statistics only, never part of Screen Time
    _st("stTimeTod", stotHist[App.S.tk] || 0);
  })();

  // ── Quality (Q): Actual Jap Time (sec) ÷ Total Name Jap, per jap type ──
  // Same manual-entry exclusion as Efficiency above, applied per type.
  (function () {
    const _qTypes = [
      { key: "radha", th: _rTH,                      cnt: App.S.history || {},   tod: "qRadhaTod", wk: "qRadhaWk", mo: "qRadhaMo", lt: "qRadhaLt" },
      { key: "rv",    th: _rvTH,                      cnt: App.S.historyRV || {}, tod: "qRVTod",    wk: "qRVWk",    mo: "qRVMo",    lt: "qRVLt" },
      { key: "kv",    th: App.S.timerHistoryKV || {}, cnt: App.S.historyKV || {}, tod: "qKVTod",    wk: "qKVWk",    mo: "qKVMo",    lt: "qKVLt" },
      { key: "ss",    th: App.S.timerHistorySS || {}, cnt: App.S.historySS || {}, tod: "qSSTod",    wk: "qSSWk",    mo: "qSSMo",    lt: "qSSLt" },
      { key: "hk",    th: App.S.timerHistoryHK || {}, cnt: App.S.historyHK || {}, tod: "qHKTod",    wk: "qHKWk",    mo: "qHKMo",    lt: "qHKLt" },
      { key: "ram",   th: App.S.timerHistoryRam || {},cnt: App.S.historyRam || {},tod: "qRamTod",   wk: "qRamWk",   mo: "qRamMo",   lt: "qRamLt" },
      { key: "n28",   th: _n28TH,                     cnt: App.S.h28 || {},       tod: "q28Tod",    wk: "q28Wk",    mo: "q28Mo",    lt: "q28Lt" },
    ];
    const _q = (sec, cnt) => (cnt > 0 ? (sec / cnt).toFixed(2) : "—");
    _qTypes.forEach((t) => {
      const secTod = Math.max(0, (t.th[App.S.tk] || 0) - _manualSecondsFor(t.key, [App.S.tk]));
      const cntTod = Math.max(0, (t.cnt[App.S.tk] || 0) - _manualCountFor(t.key, [App.S.tk]));
      _setEl(t.tod, _q(secTod, cntTod));

      const secWk = Math.max(0, wk.reduce((s, k) => s + (t.th[k] || 0), 0) - _manualSecondsFor(t.key, wk));
      const cntWk = Math.max(0, wk.reduce((s, k) => s + (t.cnt[k] || 0), 0) - _manualCountFor(t.key, wk));
      _setEl(t.wk, _q(secWk, cntWk));

      const secMo = Math.max(0, Object.entries(t.th).filter(([k]) => k.startsWith(mp)).reduce((s, [, v]) => s + v, 0) - _manualSecondsFor(t.key, undefined, mp));
      const cntMo = Math.max(0, Object.entries(t.cnt).filter(([k]) => k.startsWith(mp)).reduce((s, [, v]) => s + v, 0) - _manualCountFor(t.key, undefined, mp));
      _setEl(t.mo, _q(secMo, cntMo));

      const secLt = Math.max(0, Object.values(t.th).reduce((a, b) => a + b, 0) - _manualSecondsFor(t.key));
      const cntLt = Math.max(0, Object.values(t.cnt).reduce((a, b) => a + b, 0) - _manualCountFor(t.key));
      _setEl(t.lt, _q(secLt, cntLt));
    });
  })();

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
  const _liveMala = App.currentMalaSeconds || 0;
  const timeTod =
    (curTimerHist[App.S.tk] || 0) + _liveMala;
  const timeWk =
    wk.reduce((s, k) => s + (curTimerHist[k] || 0), 0) + _liveMala;
  const timeMo =
    Object.entries(curTimerHist)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + _liveMala;
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
  // Split Radha vs RV vs KV vs SS vs Ram time per row
  const radhaTH = App.S.timerHistory || {};
  const rvTH = App.S.timerHistoryRV || {};
  const kvTH = App.S.timerHistoryKV || {};
  const ssTH = App.S.timerHistorySS || {};
  const ramTH = App.S.timerHistoryRam || {};
  const liveExtra = App.currentMalaSeconds || 0;
  const isRVMode = App.S.japMode === "rv";
  const isKVMode = App.S.japMode === "kv";
  const isSSMode = App.S.japMode === "ss";
  const isRamMode = App.S.japMode === "ram";
  const isRadhaMode = !isRVMode && !isKVMode && !isSSMode && !isRamMode && App.S.japMode !== "hk";
  const rTod = (radhaTH[App.S.tk] || 0) + (isRadhaMode ? liveExtra : 0);
  const rWk =
    wk.reduce((s, k) => s + (radhaTH[k] || 0), 0) + (isRadhaMode ? liveExtra : 0);
  const rMo =
    Object.entries(radhaTH)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + (isRadhaMode ? liveExtra : 0);
  const vTod = (rvTH[App.S.tk] || 0) + (isRVMode ? liveExtra : 0);
  const vWk =
    wk.reduce((s, k) => s + (rvTH[k] || 0), 0) + (isRVMode ? liveExtra : 0);
  const vMo =
    Object.entries(rvTH)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + (isRVMode ? liveExtra : 0);
  const kTod = (kvTH[App.S.tk] || 0) + (isKVMode ? liveExtra : 0);
  const kWk =
    wk.reduce((s, k) => s + (kvTH[k] || 0), 0) + (isKVMode ? liveExtra : 0);
  const kMo =
    Object.entries(kvTH)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + (isKVMode ? liveExtra : 0);
  const sTod = (ssTH[App.S.tk] || 0) + (isSSMode ? liveExtra : 0);
  const sWk =
    wk.reduce((s, k) => s + (ssTH[k] || 0), 0) + (isSSMode ? liveExtra : 0);
  const sMo =
    Object.entries(ssTH)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + (isSSMode ? liveExtra : 0);
  const amTod = (ramTH[App.S.tk] || 0) + (isRamMode ? liveExtra : 0);
  const amWk =
    wk.reduce((s, k) => s + (ramTH[k] || 0), 0) + (isRamMode ? liveExtra : 0);
  const amMo =
    Object.entries(ramTH)
      .filter(([k]) => k.startsWith(mp))
      .reduce((s, [, v]) => s + v, 0) + (isRamMode ? liveExtra : 0);
  const _set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtShort(v);
  };
  const rLt =
    Object.values(radhaTH).reduce((s, v) => s + v, 0) +
    (isRadhaMode ? liveExtra : 0);
  const vLt =
    Object.values(rvTH).reduce((s, v) => s + v, 0) + (isRVMode ? liveExtra : 0);
  const kLt =
    Object.values(kvTH).reduce((s, v) => s + v, 0) + (isKVMode ? liveExtra : 0);
  const sLt =
    Object.values(ssTH).reduce((s, v) => s + v, 0) + (isSSMode ? liveExtra : 0);
  const amLt =
    Object.values(ramTH).reduce((s, v) => s + v, 0) + (isRamMode ? liveExtra : 0);
  _set("tRadhaTod", rTod);
  _set("tRadhaWk", rWk);
  _set("tRadhaMo", rMo);
  _set("tRadhaLt", rLt);
  _set("tRVTod", vTod);
  _set("tRVWk", vWk);
  _set("tRVMo", vMo);
  _set("tRVLt", vLt);
  _set("tKVTod", kTod);
  _set("tKVWk", kWk);
  _set("tKVMo", kMo);
  _set("tKVLt", kLt);
  _set("tSSTod", sTod);
  _set("tSSWk", sWk);
  _set("tSSMo", sMo);
  _set("tSSLt", sLt);
  _set("tRamTod", amTod);
  _set("tRamWk", amWk);
  _set("tRamMo", amMo);
  _set("tRamLt", amLt);
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
        : _mode === "kv"
          ? App.S.historyKV || {}
          : App.S.history || {};
  const _modeDeduct =
    _mode === "rv"
      ? App.S.nameJapDeductRV || 0
      : _mode === "hk"
        ? App.S.nameJapDeductHK || 0
        : _mode === "kv"
          ? App.S.nameJapDeductKV || 0
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
  renderDedications();
  renderDedTypePanels();
  const dedDateEl = document.getElementById("dedDateIn");
  if (dedDateEl && !dedDateEl.value) dedDateEl.value = _ldk(new Date());
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
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";

  // FIX: Reset type label fresh each time — no global carryover
  if (typeEl) {
    if (isRV) typeEl.textContent = "(राधावल्लभ)";
    else if (isHK) typeEl.textContent = "(हरे कृष्ण)";
    else if (isKV) typeEl.textContent = "(कृष्णाय वासुदेवाय)";
    else if (isSS) typeEl.textContent = "(साम्ब सदाशिव)";
    else if (isRam) typeEl.textContent = "(राम विजय मंत्र)";
    else typeEl.textContent = "(राधा)";
  }

  // FIX: Strict filtering — get the correct log for current mode only
  const rawLog = isRV
    ? App.S.malaLogRV || []
    : isHK
      ? App.S.malaLogHK || []
      : isKV
        ? App.S.malaLogKV || []
        : isSS
          ? App.S.malaLogSS || []
          : isRam
            ? App.S.malaLogRam || []
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
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  const log = isRV ? App.S.malaLogRV : isHK ? App.S.malaLogHK : isKV ? App.S.malaLogKV : isSS ? App.S.malaLogSS : isRam ? App.S.malaLogRam : App.S.malaLog;
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
  const isKV = App.S.japMode === "kv";
  const isSS = App.S.japMode === "ss";
  const isRam = App.S.japMode === "ram";
  const log = isRV ? App.S.malaLogRV : isHK ? App.S.malaLogHK : isKV ? App.S.malaLogKV : isSS ? App.S.malaLogSS : isRam ? App.S.malaLogRam : App.S.malaLog;
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
    App.S.nameJapDeduct28 = 0;
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
    App.S.historyKV = {};
    App.S.historySS = {};
    App.S.dt = 0;
    App.S.lt = 0;
    App.S.dtRV = 0;
    App.S.ltRV = 0;
    App.S.dtHK = 0;
    App.S.dtKV = 0;
    App.S.ltKV = 0;
    App.S.dtSS = 0;
    App.S.ltSS = 0;
    App.S.nameJapDeduct = 0;
    App.S.nameJapDeductRV = 0;
    App.S.nameJapDeductHK = 0;
    App.S.nameJapDeductKV = 0;
    App.S.nameJapDeductSS = 0;
    App.S.dedications = [];
    App.S.timerHistory = {};
    App.S.timerHistoryRV = {};
    App.S.timerHistoryHK = {};
    App.S.timerHistoryKV = {};
    App.S.timerHistorySS = {};
    App.S.malaLog = [];
    App.S.malaLogRV = [];
    App.S.malaLogHK = [];
    App.S.malaLogKV = [];
    App.S.malaLogSS = [];
    App.S.activityLog = [];
    App.S.syncBaseline = {};
    App.S.syncBaselineTimer = {};
    App.S.syncBaselineRV = {};
    App.S.syncBaselineTimerRV = {};
    App.S.syncBaselineHK = {};
    App.S.syncBaselineTimerHK = {};
    App.S.syncBaselineKV = {};
    App.S.syncBaselineTimerKV = {};
    App.S.syncBaselineSS = {};
    App.S.syncBaselineTimerSS = {};
    App.lmc = 0;
    App.lmcRV = 0;
    App.lmcHK = 0;
    App.lmcKV = 0;
    App.lmcSS = 0;
    App.dbClearStore("history");
    App.dbClearStore("historyRV").catch(() => {});
    App.dbClearStore("historyHK").catch(() => {});
    App.dbClearStore("historyKV").catch(() => {});
    App.dbClearStore("historySS").catch(() => {});
    App.dbClearStore("timerHistory");
    App.dbClearStore("timerHistoryRV");
    App.dbClearStore("timerHistoryHK").catch(() => {});
    App.dbClearStore("timerHistoryKV").catch(() => {});
    App.dbClearStore("timerHistorySS").catch(() => {});
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

// Shared save/share helper: works in Capacitor (native Android), PWA, and TWA.
// On native, writes to the Documents folder via the Filesystem plugin and
// offers a native Share sheet. On web (PWA/TWA), falls back to the original
// Blob + <a download> approach, which works fine in real browsers.
async function saveJsonFile(filename, jsonString) {
  const isNative =
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform();

  if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
    try {
      const { Filesystem } = window.Capacitor.Plugins;
      const subPath = "Radha Jap Backup/" + filename;

      // Android below 10 (API 29) needs the legacy WRITE_EXTERNAL_STORAGE
      // permission granted before writing to the public Documents folder.
      // Android 10+ (scoped storage) needs no permission for this at all --
      // checkPermissions/requestPermissions are safe to call on every
      // version; on 10+ they resolve immediately with no prompt shown.
      // NOTE: this permission-request path has NOT been verified on a real
      // pre-Android-10 device -- test an actual export on a low API level
      // device/emulator before relying on it for those users.
      try {
        const perm = await Filesystem.checkPermissions();
        if (perm && perm.publicStorage && perm.publicStorage !== "granted") {
          await Filesystem.requestPermissions();
        }
      } catch (_permErr) {
        // Older/newer plugin builds may not expose this API the same way --
        // fall through and let writeFile itself surface any real permission
        // error below, rather than blocking the whole export.
      }

      // FILE_NOTCREATED workaround — writeFile's own `recursive: true` is
      // documented to auto-create missing parent folders, but is known to
      // silently fail to do so for Directory.Documents specifically on
      // Android 10+ scoped storage. Creating the folder explicitly first
      // is the standard workaround; "already exists" errors are expected
      // and harmless on every export after the first.
      try {
        await Filesystem.mkdir({
          path: "Radha Jap Backup",
          directory: "DOCUMENTS",
          recursive: true,
        });
      } catch (_mkdirErr) {
        // Already exists (or plugin doesn't need it) — fall through and
        // let writeFile itself surface any real problem below.
      }
      const writeResult = await Filesystem.writeFile({
        path: subPath,
        data: jsonString,
        directory: "DOCUMENTS",
        encoding: "utf8",
        recursive: true, // create the "Radha Jap Backup" folder if missing
      });
      toast("\ud83d\udce5 Saved to Documents/Radha Jap Backup \ud83d\ude4f Jai Radhe!");
      return true;
    } catch (e) {
      // share-sheet fallback (scoped storage unreliable across OEMs) —
      // writing arbitrary files into the public Documents folder is known
      // to silently fail on some manufacturer ROMs (MIUI/Xiaomi in
      // particular) regardless of folder-creation workarounds, because the
      // OS itself restricts or mishandles it. Rather than dead-ending with
      // an error, fall back to the same mechanism Share Backup already
      // uses reliably: write to the app's private cache (no scoped-storage
      // restrictions apply there) and hand it to the native Share sheet so
      // the user can still save it wherever they like via the OS picker.
      console.warn("Direct Documents write failed, falling back to share sheet:", e && e.message ? e.message : e);
      try {
        const { Filesystem: FS2, Share } = window.Capacitor.Plugins;
        if (FS2 && Share) {
          await FS2.writeFile({
            path: filename,
            data: jsonString,
            directory: "CACHE",
            encoding: "utf8",
          });
          const { uri } = await FS2.getUri({ directory: "CACHE", path: filename });
          await Share.share({
            title: "Radha Naam Jap Backup",
            text: "My Radha Naam Jap backup file \ud83d\ude4f Jai Radhe!",
            url: uri,
          });
          return true;
        }
      } catch (shareErr) {
        if (shareErr && shareErr.message && /cancel/i.test(shareErr.message)) return false; // user dismissed share sheet, not a real failure
        console.error("Share-sheet fallback also failed:", shareErr);
      }
      console.error("Native saveJsonFile failed:", e);
      toast("\u274c Backup failed: " + (e && e.message ? e.message : e));
      return false;
    }
  }

  // ── Web (PWA / TWA) fallback: original Blob download approach ──
  try {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
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
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        try { window.open(url, "_blank"); } catch (_) {}
      }
    }, 50);
    toast("Backup downloaded! 🙏 Jai Radhe!");
    return true;
  } catch (e) {
    console.error("Web saveJsonFile failed:", e);
    toast("❌ Backup failed: " + (e && e.message ? e.message : e));
    return false;
  }
}

// Shared by exportAllData() (manual local export) and the Drive daily
// backup staging (fbPushFull) below — keeps both in the same shape so a
// Drive backup can be restored with importAllData() exactly like a manual
// export file can.
// Record a manual (off-screen / after-the-fact) jap entry so Efficiency and
// Quality can exclude it later. typeKey is one of radha/rv/kv/ss/hk/n28.
// count = name-jap count added; seconds = time-taken added (0 if none given).
function _recordManualJap(typeKey, dateKey, count, seconds) {
  if (!App.S.manualJapCount) App.S.manualJapCount = { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} };
  if (!App.S.manualJapTime)  App.S.manualJapTime  = { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} };
  if (!App.S.manualJapCount[typeKey]) App.S.manualJapCount[typeKey] = {};
  if (!App.S.manualJapTime[typeKey])  App.S.manualJapTime[typeKey]  = {};
  App.S.manualJapCount[typeKey][dateKey] = (App.S.manualJapCount[typeKey][dateKey] || 0) + (count || 0);
  if (seconds > 0) {
    App.S.manualJapTime[typeKey][dateKey] = (App.S.manualJapTime[typeKey][dateKey] || 0) + seconds;
  }
}

// Sum manual seconds/count for one jap type over a period. Pass either
// dateKeys (array of "YYYY-MM-DD" strings, e.g. the week array) or
// monthPrefix (e.g. "2026-08") — pass neither for all-time (lifetime).
function _manualSecondsFor(typeKey, dateKeys, monthPrefix) {
  const obj = (App.S.manualJapTime && App.S.manualJapTime[typeKey]) || {};
  if (monthPrefix !== undefined) {
    let s = 0; for (const k in obj) if (k.startsWith(monthPrefix)) s += obj[k] || 0;
    return s;
  }
  if (dateKeys) return dateKeys.reduce((s, k) => s + (obj[k] || 0), 0);
  return Object.values(obj).reduce((a, b) => a + b, 0);
}
function _manualCountFor(typeKey, dateKeys, monthPrefix) {
  const obj = (App.S.manualJapCount && App.S.manualJapCount[typeKey]) || {};
  if (monthPrefix !== undefined) {
    let s = 0; for (const k in obj) if (k.startsWith(monthPrefix)) s += obj[k] || 0;
    return s;
  }
  if (dateKeys) return dateKeys.reduce((s, k) => s + (obj[k] || 0), 0);
  return Object.values(obj).reduce((a, b) => a + b, 0);
}
const _MANUAL_TYPE_KEYS = ["radha", "rv", "kv", "ss", "hk", "ram", "n28"];

function _buildBackupPayload() {
  return {
    _version: 3,
    _exported: new Date().toISOString(),
    history: App.S.history || {},
    h28: App.S.h28 || {},
    nameJapDeduct28: App.S.nameJapDeduct28 || 0,
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
    brahmacharya_start_date: getBrahmaStart(),
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
    historyKV: App.S.historyKV || {},
    timerHistoryKV: App.S.timerHistoryKV || {},
    dtKV: App.S.dtKV || 0,
    ltKV: App.S.ltKV || 0,
    nameJapDeductKV: App.S.nameJapDeductKV || 0,
    malaLogKV: App.S.malaLogKV || [],
    historySS: App.S.historySS || {},
    timerHistorySS: App.S.timerHistorySS || {},
    dtSS: App.S.dtSS || 0,
    ltSS: App.S.ltSS || 0,
    nameJapDeductSS: App.S.nameJapDeductSS || 0,
    malaLogSS: App.S.malaLogSS || [],
    historyRam: App.S.historyRam || {},
    timerHistoryRam: App.S.timerHistoryRam || {},
    dtRam: App.S.dtRam || 0,
    ltRam: App.S.ltRam || 0,
    nameJapDeductRam: App.S.nameJapDeductRam || 0,
    malaLogRam: App.S.malaLogRam || [],
    dedications: App.S.dedications || [],
    giftLedger: App.S.giftLedger || {},
    gaudiyaMode: App.S.gaudiyaMode || false,
    trahimamMode: App.S.trahimamMode || false,
    ramanandiMode: App.S.ramanandiMode || false,
    // ── Previously missing from this backup payload (bug fix) ──
    // These were saved fine to Firestore but silently dropped from
    // Export All Data / local backup, so restoring from a local backup
    // alone lost them.
    dt28Cycles: App.S.dt28Cycles || 0,
    lbDisplayName: App.S.lbDisplayName || "",
    screenTimeHistory: App.S.screenTimeHistory || {},
    stotramTimeHistory: App.S.stotramTimeHistory || {},
    activityLog: App.S.activityLog || [],
    manualJapCount: App.S.manualJapCount || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
    manualJapTime: App.S.manualJapTime || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
  };
}

async function exportAllData() {
  const backup = _buildBackupPayload();
  try {
    const json = JSON.stringify(backup, null, 2);
    const filename = "radha-naam-jap-backup-" + App.getTk() + ".json";
    const ok = await saveJsonFile(filename, json);
    if (ok) {
      // The confirmation notification only shows if permission is already
      // granted, but nothing else in this flow ever asks for it — a user
      // who never touched jap reminders (the only other place permission
      // gets requested) would never see this notification at all.
      // lcRequestNotifPermission() is already idempotent/safe to call
      // repeatedly: no prompt if already decided either way.
      await lcRequestNotifPermission();
      lcNotifyBackupSaved("Saved as " + filename + " in Documents/Radha Jap Backup 🙏");
    }
  } catch (e) {
    console.error("exportAllData failed:", e);
    toast("❌ Backup failed: " + (e && e.message ? e.message : e));
  }
}

// ── Share Backup (send the exported JSON file directly, like "Share App
// Link") ──
// Native: writes the backup into the app's private cache dir (always
// covered by Capacitor's built-in FileProvider, unlike the public Documents
// folder used by exportAllData/saveJsonFile) and opens the real Android
// share sheet with the file attached.
// Web/PWA: uses the Web Share API's file-sharing (navigator.canShare with
// `files`) where supported; otherwise falls back to a normal download,
// since most desktop browsers can't "share" a file at all.
async function shareBackup() {
  const backup = _buildBackupPayload();
  let json, filename;
  try {
    json = JSON.stringify(backup, null, 2);
    filename = "radha-naam-jap-backup-" + App.getTk() + ".json";
  } catch (e) {
    console.error("shareBackup build failed:", e);
    toast("❌ Backup failed: " + (e && e.message ? e.message : e));
    return;
  }

  if (
    _lcIsNative() &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.Filesystem &&
    window.Capacitor.Plugins.Share
  ) {
    try {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      await Filesystem.writeFile({
        path: filename,
        data: json,
        directory: "CACHE",
        encoding: "utf8",
      });
      const { uri } = await Filesystem.getUri({ directory: "CACHE", path: filename });
      await Share.share({
        title: "Radha Naam Jap Backup",
        text: "My Radha Naam Jap backup file \uD83D\uDE4F Jai Radhe!",
        url: uri,
      });
      return;
    } catch (e) {
      if (e && e.message && /cancel/i.test(e.message)) return; // user dismissed share sheet
      console.error("Native shareBackup failed:", e);
      toast("❌ Share failed: " + (e && e.message ? e.message : e));
      return;
    }
  }

  // ── Web fallback ──
  try {
    const file = new File([json], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Radha Naam Jap Backup",
        text: "My Radha Naam Jap backup file \uD83D\uDE4F Jai Radhe!",
      });
    } else {
      // Browser can't share files — fall back to a normal download.
      await saveJsonFile(filename, json);
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // user dismissed share sheet
    console.error("Web shareBackup failed:", e);
    toast("❌ Share failed: " + (e && e.message ? e.message : e));
  }
}

function importAllData(input) {
  const file = input.files[0];
  if (!file) return;
  // Restoring is a full account takeover — everything currently on this
  // account is replaced with whatever is in the backup file. Confirm first
  // since this can't be undone (except by restoring a different backup).
  const _confirmMsg = isGhostMode()
    ? "This will COMPLETELY REPLACE all data on the viewed user's account with this backup file. Anything not in the backup will be lost. This cannot be undone. Continue?"
    : "This will COMPLETELY REPLACE all data on this account with this backup file. Anything not in the backup will be lost. This cannot be undone. Continue?";
  if (!window.confirm(_confirmMsg)) {
    input.value = "";
    return;
  }
  const st = document.getElementById("restoreStatus");
  if (st) st.textContent = "Reading file…";
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      // ── FULL TAKEOVER: every field is set directly from the backup file,
      // defaulting to empty/zero when the backup doesn't have it. Nothing
      // from the account's current state is preserved or merged in — the
      // account becomes exactly what the backup file describes.
      App.S.history = data.history || {};
      App.S.h28 = data.h28 || {};
      App.S.nameJapDeduct28 = data.nameJapDeduct28 || 0;
      App.S.timerHistory = data.timerHistory || {};
      App.S.malaLog = data.malaLog || [];
      App.S.timer28History = data.timer28History || {};
      App.S.stotrams = data.stotrams || {};
      App.S.brahma = data.brahma || {};
      App.S.customSt = data.customSt || [];
      App.S.sankalpas = data.sankalpas || [];
      App.S.occasions = data.occasions || {};
      App.S.ms = data.ms || 108;
      App.S.dt = data.dt || 0;
      App.S.lt = data.lt || 0;
      App.S.nameJapDeduct = data.nameJapDeduct || 0;
      App.S.cfg = data.cfg || {};
      App.S.historyRV = data.historyRV || {};
      App.S.timerHistoryRV = data.timerHistoryRV || {};
      App.S.japMode = data.japMode || "radha";
      App.S.dtRV = data.dtRV || 0;
      App.S.ltRV = data.ltRV || 0;
      App.S.nameJapDeductRV = data.nameJapDeductRV || 0;
      App.S.malaLogRV = data.malaLogRV || [];
      App.S.historyHK = data.historyHK || {};
      App.S.timerHistoryHK = data.timerHistoryHK || {};
      App.S.dtHK = data.dtHK || 0;
      App.S.nameJapDeductHK = data.nameJapDeductHK || 0;
      App.S.malaLogHK = data.malaLogHK || [];
      App.S.gaudiyaMode = data.gaudiyaMode || false;
      App.S.trahimamMode = data.trahimamMode || false;
      App.S.ramanandiMode = data.ramanandiMode || false;
      App.S.historyKV = data.historyKV || {};
      App.S.timerHistoryKV = data.timerHistoryKV || {};
      App.S.dtKV = data.dtKV || 0;
      App.S.ltKV = data.ltKV || 0;
      App.S.nameJapDeductKV = data.nameJapDeductKV || 0;
      App.S.malaLogKV = data.malaLogKV || [];
      App.S.historySS = data.historySS || {};
      App.S.timerHistorySS = data.timerHistorySS || {};
      App.S.dtSS = data.dtSS || 0;
      App.S.ltSS = data.ltSS || 0;
      App.S.nameJapDeductSS = data.nameJapDeductSS || 0;
      App.S.malaLogSS = data.malaLogSS || [];
      App.S.historyRam = data.historyRam || {};
      App.S.timerHistoryRam = data.timerHistoryRam || {};
      App.S.dtRam = data.dtRam || 0;
      App.S.ltRam = data.ltRam || 0;
      App.S.nameJapDeductRam = data.nameJapDeductRam || 0;
      App.S.malaLogRam = data.malaLogRam || [];
      App.S.dedications = Array.isArray(data.dedications) ? data.dedications : [];
      App.S.giftLedger = (data.giftLedger && typeof data.giftLedger === "object") ? data.giftLedger : {};
      if (typeof renderPermanentGiftLog === "function") renderPermanentGiftLog();
      App.S.milestones = data.milestones || { reached: {}, lastChecked: 0 };
      App.S.msConsider = data.msConsider || { radha: true, rv: true, hk: true, kv: true, ss: true, ram: true, n28: true };
      App.S.dt28Cycles = data.dt28Cycles || 0;
      App.S.lbDisplayName = data.lbDisplayName || "";
      App.S.screenTimeHistory = data.screenTimeHistory || {};
      App.S.stotramTimeHistory = data.stotramTimeHistory || {};
      App.S.activityLog = Array.isArray(data.activityLog) ? data.activityLog : [];
      App.S.manualJapCount = data.manualJapCount || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} };
      App.S.manualJapTime = data.manualJapTime || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} };
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
      App.lmcKV = Math.floor(
        ((App.S.historyKV || {})[App.S.tk] || 0) / (App.S.ms || 108),
      );
      App.lmcSS = Math.floor(
        ((App.S.historySS || {})[App.S.tk] || 0) / (App.S.ms || 108),
      );
      // Re-apply gaudiyaMode body class after import
      App.S.gaudiyaMode
        ? document.body.classList.add("gaudiya-mode")
        : document.body.classList.remove("gaudiya-mode");
      App.S.trahimamMode
        ? document.body.classList.add("trahimam-mode")
        : document.body.classList.remove("trahimam-mode");
      App.S.ramanandiMode
        ? document.body.classList.add("ramanandi-mode")
        : document.body.classList.remove("ramanandi-mode");
      _placeTarget28Card();
      // Push the restored data to Firestore immediately, REPLACING the live
      // cloud document entirely (not merging) — restoring a backup should
      // make the account exactly match the file, for whichever account is
      // currently active. While a developer is Ghost Mode-viewing another
      // user, this correctly overwrites THAT user's Firestore doc instead
      // of the developer's own account.
      ghostAwareSave(true);
      if (st) {
        st.textContent = isGhostMode()
          ? "✅ Viewed user's account fully replaced with backup! 🙏"
          : "✅ Account fully replaced with backup! 🙏 Jai Radhe!";
        st.style.color = "var(--green)";
      }
      toast(
        isGhostMode()
          ? "Viewed user's account fully replaced! 🙏"
          : "Account fully replaced with backup! 🙏 Jai Radhe!",
      );
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
  if (window.App && window.App.S && window.App.S.cfg && window.App.S.cfg.vib) {
    try {
      lcVibrate([100, 50, 100, 50, 200, 100, 300]);
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
// ── Milestones "Consideration" ──────────────────────────────────────────
// Lets each user choose which jap types count toward their Milestones
// (Bhagvat Prapti) total — any combination of Radha, Radha Vallabh, Hare
// Krishna, KV, and 28 Names. Defaults to all types (unchanged behavior)
// until the user customizes it.
function _msConsiderDefaults() {
  return { radha: true, rv: true, hk: true, kv: true, ss: true, ram: true, n28: true };
}
function getMsConsider() {
  return { ..._msConsiderDefaults(), ...(App.S.msConsider || {}) };
}
function setMsConsider(type, on) {
  if (isGhostMode()) return; // ghost mode: read-only
  if (!App.S.msConsider) App.S.msConsider = _msConsiderDefaults();
  App.S.msConsider[type] = !!on;
  App.save();
  App.ua && App.ua();
  fbDebouncedPush();
  renderMilestonesTab();
}

// 28 Names jap available toward Milestones. Sankalpas (wishes) chain
// continuously — each new wish just keeps counting cycles from where the
// last one left off — so while ANY wish is currently active, essentially
// all of your 28N jap is mid-flow toward some wish, not toward general
// Bhagvat Prapti. So: an active wish present → 0 available here, full
// stop, regardless of the toggle. Only when there's no active wish at all
// does the full (deduct-netted) 28N total become available to count.
function _msAvailable28() {
  const active =
    typeof getActiveSankalp === "function" ? getActiveSankalp() : null;
  if (active) return 0;
  const hist28 = App.S.h28 || {};
  const raw28 = Object.entries(hist28)
    .filter(([k]) => !k.startsWith("prev_"))
    .reduce((a, [, v]) => a + v, 0);
  return Math.max(0, raw28 - (App.S.nameJapDeduct28 || 0));
}

// Shared combined-total computation, used by both the Milestones tab and
// the milestone detail modal so the two always agree. Respects the
// user's msConsider choices; each type is netted against its own
// deduct/gift counter before combining (never pool-then-subtract-one).
function _msComputeTotal() {
  const consider = getMsConsider();
  const hist = App.S.history || {};
  const histRV = App.S.historyRV || {};
  const histHK = App.S.historyHK || {};
  const histKV = App.S.historyKV || {};
  const histSS = App.S.historySS || {};
  const histRam = App.S.historyRam || {};
  const radhaTot = consider.radha
    ? Math.max(
        0,
        Object.values(hist).reduce((a, b) => a + b, 0) -
          (App.S.nameJapDeduct || 0),
      )
    : 0;
  const rvTot = consider.rv
    ? Math.max(
        0,
        Object.values(histRV).reduce((a, b) => a + b, 0) -
          (App.S.nameJapDeductRV || 0),
      )
    : 0;
  const hkTot = consider.hk
    ? Math.max(
        0,
        Object.values(histHK).reduce((a, b) => a + b, 0) -
          (App.S.nameJapDeductHK || 0),
      )
    : 0;
  const kvTot = consider.kv
    ? Math.max(
        0,
        Object.values(histKV).reduce((a, b) => a + b, 0) -
          (App.S.nameJapDeductKV || 0),
      )
    : 0;
  const ssTot = consider.ss
    ? Math.max(
        0,
        Object.values(histSS).reduce((a, b) => a + b, 0) -
          (App.S.nameJapDeductSS || 0),
      )
    : 0;
  const n28Tot = consider.n28 ? _msAvailable28() : 0;
  const ramTot = consider.ram
    ? Math.max(
        0,
        Object.values(histRam).reduce((a, b) => a + b, 0) -
          (App.S.nameJapDeductRam || 0),
      )
    : 0;
  return {
    total: radhaTot + rvTot + hkTot + kvTot + ssTot + ramTot + n28Tot,
    radhaTot,
    rvTot,
    hkTot,
    kvTot,
    ssTot,
    ramTot,
    n28Tot,
  };
}

// HTML for the Consideration toggle chips shown at the top of the
// Milestones tab. Reuses the existing .ded-type-pill chip styling.
function _msConsiderChipsHtml() {
  const c = getMsConsider();
  const types = [
    { key: "radha", label: "Radha", color: "245,200,66" },
    { key: "rv", label: "Radha Vallabh", color: "94,234,212" },
    { key: "hk", label: "Hare Krishna", color: "201,167,255" },
    { key: "kv", label: "Krishnay Vasudevay", color: "109,184,255" },
    { key: "ss", label: "Samba Sadashiv", color: "255,184,108" },
    { key: "ram", label: "Raam Vijay Mantra", color: "255,153,51" },
    { key: "n28", label: "28 Names", color: "255,143,199" },
  ];
  let h =
    '<div class="ms-consider-wrap" style="margin-bottom:14px;">' +
    '<div style="font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:700;opacity:0.7;margin-bottom:6px;">🙏 Consider for Bhagvat Prapti Milestones</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
  types.forEach((t) => {
    const on = !!c[t.key];
    h +=
      '<div class="ded-type-pill' +
      (on ? " active" : "") +
      '" style="padding:6px 10px;flex:none;border-color:rgba(' +
      t.color +
      "," +
      (on ? "0.45" : "0.18") +
      ');background:rgba(' +
      t.color +
      "," +
      (on ? "0.1" : "0.03") +
      ');" onclick="setMsConsider(\'' +
      t.key +
      "'," +
      !on +
      ')">' +
      t.label +
      "</div>";
  });
  h +=
    '</div><div style="font-size:10px;opacity:0.55;margin-top:6px;">If you have an active wish (sankalp) running, 28 Names won\'t count here at all — only when no wish is active.</div></div>';
  return h;
}

function renderMilestonesTab() {
  const el = document.getElementById("msContent");
  if (!el) return;
  const _isG = App.S.gaudiyaMode || false;
  const hist = App.S.history || {};
  const histRV = App.S.historyRV || {};
  const histHK = App.S.historyHK || {};
  const histKV = App.S.historyKV || {};
  const histSS = App.S.historySS || {};
  const histRam = App.S.historyRam || {};
  const hist28 = App.S.h28 || {};
  // Milestones reflect only the jap types the user has chosen to "consider"
  // for Bhagvat Prapti (see _msComputeTotal / the Consideration chips
  // below) — defaults to all types so existing users see no change until
  // they customize it. Each type is netted against its own gift/deduct
  // counter. 28 Names additionally excludes whatever's currently earmarked
  // for an active wish (sankalp) — see _msAvailable28.
  const consider = getMsConsider();
  const total = _msComputeTotal().total;
  const lang = window._msLang || "hi";

  // Calculate 7-day average (same type filter as the total, for a
  // consistent prediction pace)
  const today = new Date();
  let sum7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = _ldk(d);
    sum7 +=
      (consider.radha ? hist[k] || 0 : 0) +
      (consider.rv ? histRV[k] || 0 : 0) +
      (consider.n28 ? hist28[k] || 0 : 0) +
      (consider.kv ? histKV[k] || 0 : 0) +
      (consider.ss ? histSS[k] || 0 : 0) +
      (consider.ram ? histRam[k] || 0 : 0) +
      (consider.hk ? histHK[k] || 0 : 0);
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
  out += _msConsiderChipsHtml();

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
  const histHK = App.S.historyHK || {};
  const histKV = App.S.historyKV || {};
  const histSS = App.S.historySS || {};
  const histRam = App.S.historyRam || {};
  // Use the same shared, consideration-aware total as the main Milestones
  // tab (_msComputeTotal) — respects the user's chosen jap types and nets
  // each against its own gift/deduct counter, so this modal always agrees
  // with the progress bar it was opened from.
  const total = _msComputeTotal().total;

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
  Object.keys(histHK).forEach((k) => {
    allHist[k] = (allHist[k] || 0) + (histHK[k] || 0);
  });
  Object.keys(histKV).forEach((k) => {
    allHist[k] = (allHist[k] || 0) + (histKV[k] || 0);
  });
  Object.keys(histSS).forEach((k) => {
    allHist[k] = (allHist[k] || 0) + (histSS[k] || 0);
  });
  Object.keys(histRam).forEach((k) => {
    allHist[k] = (allHist[k] || 0) + (histRam[k] || 0);
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

// ── Native app detection (shared by sign-in + export/share) ──
function _isNativeApp() {
  return !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

// ── Native Zoho OAuth config ──
// Fill these in from your Zoho API Console (https://api-console.zoho.com):
//   ZOHO_CLIENT_ID    → the Client ID of your "Server-based Applications" client
//   ZOHO_REDIRECT_URI → must be registered EXACTLY in Zoho's console as an
//                        authorized redirect URI, AND must match the
//                        intent-filter / Universal Link configured in the
//                        Android project (see capacitor.config.json + README).
const ZOHO_NATIVE_CONFIG = {
  clientId: "1000.SI61HY6OEFKXFN1Z9H2KIUL69ZO2KO",
  redirectUri: "https://radharadharadha.vercel.app/oauthredirect.html",
  scope: "openid email profile",
  // Cloud Function that exchanges Zoho's authorization `code` for a Firebase
  // custom token (see /functions/index.js). Your Zoho app is a
  // "Server-based Application" (Code flow), so a client secret is required
  // to redeem the code — that secret must never ship inside the app, hence
  // this small backend hop.
  exchangeUrl: "https://us-central1-guru-kripahi-kevalam-108.cloudfunctions.net/zohoTokenExchange",
};
let _zohoAppUrlListenerAttached = false;

// ── Single-device session enforcement ──
async function fbClaimSession() {
  if (!fbUser || !fbDb) return;
  if (isGhostMode()) return; // ghost mode: read-only
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

// ── Narrow Firestore accessor for the opt-in personal-horoscope feature ──
// (vedic-panchanga/panchanga.js runs as a separate <script>, scoped in its
// own IIFE, so it cannot reach this file's private fbDb/fbUser/fbInit.
// This object is the ONLY bridge — deliberately minimal.)
window.vpFirestore = {
  // Ensures Firebase is initialized; returns true/false like fbInit().
  ensureInit() { return fbInit(); },
  // Current signed-in uid, or null if signed out / not yet resolved.
  currentUid() { return fbUser ? fbUser.uid : null; },
  // Read users/{uid}/horoscope/profile — resolves to the data or null.
  async getProfile() {
    if (!fbInit() || !fbUser) return null;
    try {
      const snap = await fbDb.collection('users').doc(fbUser.uid)
        .collection('horoscope').doc('profile').get();
      return snap.exists ? snap.data() : null;
    } catch (e) {
      console.warn('[vpFirestore] getProfile failed:', e && e.message);
      return null;
    }
  },
  // Write/merge users/{uid}/horoscope/profile — returns true/false.
  async saveProfile(data) {
    if (!fbInit() || !fbUser) return false;
    try {
      await fbDb.collection('users').doc(fbUser.uid)
        .collection('horoscope').doc('profile')
        .set(Object.assign({}, data, {
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }), { merge: true });
      return true;
    } catch (e) {
      console.warn('[vpFirestore] saveProfile failed:', e && e.message);
      return false;
    }
  },
};

function fbShowAuthChecking() {
  if (fbShowAuthChecking._done) return;
  const loggedOutEl = document.getElementById("fbLoggedOut");
  const loggedInEl = document.getElementById("fbLoggedIn");
  if (!loggedOutEl || !loggedInEl) return; // DOM not ready yet — caller can retry
  fbShowAuthChecking._done = true;
  let cachedLabel = null;
  try { cachedLabel = localStorage.getItem("rjap_lastAuthLabel"); } catch (_) {}
  if (cachedLabel) {
    // ── INSTANT LOAD: we've signed in on this device before. Render as
    // signed-in immediately from cache instead of waiting for Firebase to
    // confirm — no "checking…" flash. This is cosmetic only: actual data
    // sync/load still waits for the real onAuthStateChanged confirmation
    // below, so nothing is exposed before auth genuinely resolves. In the
    // rare case the session actually expired, onAuthStateChanged(null)
    // will correct the panel back to signed-out a moment later.
    loggedOutEl.style.display = "none";
    loggedInEl.style.display = "block";
    const emailEl = document.getElementById("fbUserEmail");
    if (emailEl) emailEl.textContent = cachedLabel;
    setSyncPill("syncing", "Loading from cloud…");
  } else {
    loggedOutEl.style.display = "none";
    const checkingEl = document.createElement("div");
    checkingEl.id = "fbAuthChecking";
    checkingEl.style.cssText =
      "text-align:center;padding:14px 0;color:var(--td,#9fb3d9);font-size:13px;opacity:.85;";
    checkingEl.textContent = "☁️ Checking sign-in status…";
    loggedOutEl.parentNode.insertBefore(checkingEl, loggedOutEl);
  }
}
function fbHideAuthChecking() {
  const checkingEl = document.getElementById("fbAuthChecking");
  if (checkingEl) checkingEl.remove();
}
function fbInit() {
  if (fbApp) return true;
  fbShowAuthChecking();
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
    // Firestore's default streaming connection (WebChannel) is unreliable
    // inside Android WebViews — this detects that and falls back to plain
    // HTTP long-polling automatically. Must be the first call on fbDb.
    fbDb.settings({ experimentalForceLongPolling: true }); // forced, not auto-detected — see apply_force_long_polling_fix.py
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

    // ── Cloud hydration self-heal ──────────────────────────────────────
    // The 'online' browser event only fires on a true offline→online
    // transition. A device that stays technically "online" per the OS but
    // can't actually complete the initial cloud pull (slow/flaky network,
    // a request that times out, etc.) previously got stuck with
    // App._cloudHydrated permanently false for the whole session — and
    // fbPushFull() silently no-ops forever while that's true, with only a
    // console.warn to show for it. This retries with backoff regardless of
    // the 'online' event, and makes the failure/recovery visible.
    App._hydrationRetryAttempts = 0;
    App._hydrationRetryTimer = null;
    App._hydrationFailureNotified = false;

    // ── Local cache recovery ────────────────────────────────────────────
    // A hung/failed cloud pull can sometimes mean Firestore's local
    // offline cache (IndexedDB) itself got wedged — a stuck queued write,
    // a lock left behind from an interrupted session, storage corruption.
    // That fails every request *locally*, so reconnecting to a strong
    // network afterward does NOT fix it — the retries above would just
    // keep failing against the same broken cache forever. After a few
    // failed attempts, wipe and rebuild the local cache before retrying —
    // the standard recovery for a wedged Firestore cache.
    window._fbRecoverPersistence = async function () {
      try {
        if (fbListener) { fbListener(); fbListener = null; }
        await fbDb.terminate();
        await fbDb.clearPersistence().catch(() => {});
      } catch (e) {
        console.warn("fbRecoverPersistence terminate/clear failed:", e && e.message);
      }
      try {
        fbDb = firebase.firestore();
        // Same long-polling fallback as the main init above — a rebuilt
        // fbDb instance needs it too, or a recovered cache would still hit
        // the same WebView streaming problem this whole recovery exists to
        // work around.
        fbDb.settings({ experimentalForceLongPolling: true }); // forced, not auto-detected — see apply_force_long_polling_fix.py
        fbDb.enablePersistence({ synchronizeTabs: false }).catch(() => {});
      } catch (e) {
        console.warn("fbRecoverPersistence reinit failed:", e && e.message);
      }
    };

    window._scheduleHydrationRetry = function () {
      if (App._cloudHydrated) return;
      if (App._hydrationRetryTimer) return; // already scheduled
      if (!fbUser || fbForcedSignout) return;
      if (typeof isGhostMode === "function" && isGhostMode()) return; // never fight ghost mode
      if (typeof navigator !== "undefined" && navigator.onLine === false) return; // wait for 'online' instead

      App._hydrationRetryAttempts++;
      const delayMs = Math.min(120000, 5000 * Math.pow(2, App._hydrationRetryAttempts - 1));

      if (!App._hydrationFailureNotified) {
        App._hydrationFailureNotified = true;
        setSyncPill("error", "Not synced — retrying…");
        toast("⚠️ Could not sync with cloud yet — retrying automatically");
      }

      App._hydrationRetryTimer = setTimeout(async () => {
        App._hydrationRetryTimer = null;
        // After 3 straight failures, assume the local cache may be wedged
        // (not just a slow network) and rebuild it before trying again.
        if (App._hydrationRetryAttempts >= 3 && App._hydrationRetryAttempts % 3 === 0) {
          console.warn("Hydration still failing after retries — rebuilding local Firestore cache");
          toast("⚠️ Still not synced — resetting local cache and retrying…");
          await window._fbRecoverPersistence();
        }
        try {
          await fbAutoSync();
        } catch (e) {
          console.warn("Hydration retry failed:", e && e.message);
        }
        window._markHydrationRecovered();
        if (!App._cloudHydrated) window._scheduleHydrationRetry();
      }, delayMs);
    };

    window._markHydrationRecovered = function () {
      if (!App._cloudHydrated) return;
      if (App._hydrationRetryTimer) {
        clearTimeout(App._hydrationRetryTimer);
        App._hydrationRetryTimer = null;
      }
      App._hydrationRetryAttempts = 0;
      if (App._hydrationFailureNotified) {
        App._hydrationFailureNotified = false;
        toast("✅ Synced with cloud");
      }
    };

    // Also retry whenever the app comes back to the foreground — catches
    // cases where the device never fired a real 'online' transition.
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        fbUser && !fbForcedSignout &&
        !App._cloudHydrated
      ) {
        window._scheduleHydrationRetry();
      }
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
            // Reset backoff since network state just genuinely changed,
            // then re-run the full sync cycle: pull first, push offline work.
            App._hydrationRetryAttempts = 0;
            if (App._hydrationRetryTimer) {
              clearTimeout(App._hydrationRetryTimer);
              App._hydrationRetryTimer = null;
            }
            fbAutoSync()
              .catch((e) => console.warn("Online resync (full):", e && e.message))
              .finally(() => {
                window._markHydrationRecovered();
                if (!App._cloudHydrated) window._scheduleHydrationRetry();
              });
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
      // Foreground catch-up for the daily Google Drive backup. Moved here
      // (instead of the "load" handler) because fbUser is only ever set
      // inside this callback — calling checkDailyDriveBackupCatchUp() from
      // "load" ran before fbInit() had registered this listener, so fbUser
      // was always still null and the check silently no-opped on every
      // app open. Firing it here, now that fbUser is actually populated,
      // is what makes the catch-up run at all.
      if (user && typeof checkDailyDriveBackupCatchUp === "function") {
        checkDailyDriveBackupCatchUp();
      }
      // Stage auth info for the native Background Runner (hourly sync while
      // the app is fully closed). CapacitorKV is a separate, tiny key-value
      // store accessible from both the WebView and the isolated background
      // task — it has no access to this page's memory or Firestore SDK.
      if (window.Capacitor?.Plugins?.CapacitorKV && user) {
        try {
          const refreshToken = user.refreshToken || "";
          await window.Capacitor.Plugins.CapacitorKV.set({
            key: "bgsync_uid", value: user.uid,
          });
          await window.Capacitor.Plugins.CapacitorKV.set({
            key: "bgsync_refresh_token", value: refreshToken,
          });
        } catch (_) {}
      }
      // Re-register push (refresh the FCM token) if the user previously
      // opted in — no permission re-prompt since it was already granted.
      // auto notification prompt — first-ever login/sync for a user who has
      // never been asked triggers the SAME permission request the manual
      // "pushNotifications" toggle uses (no need to find it in Settings).
      // rjap_push_asked is set before the request resolves, so a grant AND
      // a denial are both remembered — this only ever asks once — and the
      // toggle's own UI (#tgPushNotifications / #pushNotificationsStatus)
      // is kept in sync either way.
      if (user) {
        let pushOn = false;
        let pushAsked = false;
        try { pushOn = localStorage.getItem("rjap_push_enabled") === "1"; } catch (_) {}
        try { pushAsked = localStorage.getItem("rjap_push_asked") === "1"; } catch (_) {}
        const tgPushEl = document.getElementById("tgPushNotifications");
        const pushStatusEl = document.getElementById("pushNotificationsStatus");
        if (pushOn) {
          lcRegisterPush().then((ok) => {
            if (ok) {
              if (tgPushEl) tgPushEl.classList.add("on");
              if (pushStatusEl) pushStatusEl.textContent = "✅ Push notifications enabled";
            }
          });
        } else if (!pushAsked) {
          try { localStorage.setItem("rjap_push_asked", "1"); } catch (_) {}
          lcRegisterPush().then((ok) => {
            if (ok) {
              if (tgPushEl) tgPushEl.classList.add("on");
              if (pushStatusEl) pushStatusEl.textContent = "✅ Push notifications enabled";
            } else {
              if (tgPushEl) tgPushEl.classList.remove("on");
              if (pushStatusEl) pushStatusEl.textContent = "— Tap toggle to enable push notifications 🔔";
            }
          });
        }
      }
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
            dedications: [],
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
            historyKV: {},
            timerHistoryKV: {},
            dtKV: 0,
            ltKV: 0,
            nameJapDeductKV: 0,
            malaLogKV: [],
            syncBaselineKV: {},
            syncBaselineTimerKV: {},
            historySS: {},
            timerHistorySS: {},
            dtSS: 0,
            ltSS: 0,
            nameJapDeductSS: 0,
            malaLogSS: [],
            syncBaselineSS: {},
            syncBaselineTimerSS: {},
            gaudiyaMode: false,
            trahimamMode: false,
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
          App.lmcKV = Math.floor(
            ((App.S.historyKV || {})[App.S.tk] || 0) / (App.S.ms || 108),
          );
          App.lmcSS = Math.floor(
            ((App.S.historySS || {})[App.S.tk] || 0) / (App.S.ms || 108),
          );
          App.lm28 = Math.floor((App.S.h28[App.S.tk] || 0) / (App.S.ms || 108));
          if (App.S.gaudiyaMode) document.body.classList.add("gaudiya-mode");
          if (App.S.trahimamMode) document.body.classList.add("trahimam-mode");
          if (App.S.ramanandiMode) document.body.classList.add("ramanandi-mode");
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
        fbHideAuthChecking();
        document.getElementById("fbLoggedOut").style.display = "none";
        document.getElementById("fbLoggedIn").style.display = "block";
        const _authLabel =
          user.phoneNumber || user.email || user.displayName || "Devotee";
        document.getElementById("fbUserEmail").textContent = _authLabel;
        try { localStorage.setItem("rjap_lastAuthLabel", _authLabel); } catch (_) {}
        const _pwBtn = document.getElementById("fbChangePassBtn");
        if (_pwBtn) {
          const _hasPw = _fbHasPasswordProvider(user);
          _pwBtn.style.display = _hasPw ? "" : "none";
          if (_hasPw) _pwBtn.textContent = "🔑 Change Password";
        }
        // Nudge (days 0-5) then hard-block (after 5 days) email/password users
        // who haven't verified yet. Google/Zoho sign-ins arrive pre-verified
        // so user.emailVerified is already true for them — this only ever
        // engages for email+password accounts.
        // NOTE: linking a password credential to a phone account sets
        // user.email to the internal placeholder address (see
        // _fbPhoneSyntheticEmail) — that is NOT a real inbox, so it must
        // never be subject to the verify-or-lose-sync grace period below;
        // otherwise phone+password users would get permanently locked out
        // trying to verify an address that was never meant to receive mail.
        if (user.email && !_fbIsSyntheticPhoneEmail(user.email) && !user.emailVerified) {
          _fbStartVerifyCountdownTimer(user);
        } else {
          _fbStopVerifyCountdownTimer();
          _fbHideVerifyBlock();
        }
        setSyncPill("syncing", "Loading from cloud…");
        // ── ALWAYS pull from Firebase first on every login/refresh ──
        // fbMigrate() does a direct .get() (not just onSnapshot) so it is
        // guaranteed to fetch the latest cloud data before anything is rendered.
        fbClaimSession().then(async () => {
          fbWatchSession();
          // ── Sync device clock with Firebase server time ──
          // Corrects getTk() if local clock is wrong or in different timezone.
          // Wrapped so a failure here (offline mid-login, etc.) can never
          // prevent the presence/leaderboard doc creation below — those must
          // always get a chance to run once a user is signed in, or that
          // user becomes permanently invisible to Ghost Mode (see Jhara
          // Barman case: signed in, real data, but no presence/leaderboard
          // doc because an earlier step in this chain never completed).
          try { await fbSyncServerTime(); } catch (e) { console.warn('fbSyncServerTime failed (non-fatal):', e && e.message); }
          // Direct cloud pull — overwrites local cache with authoritative Firebase data.
          // Also wrapped for the same reason as above.
          try { await fbAutoSync(); } catch (e) { console.warn('fbAutoSync failed (non-fatal):', e && e.message); }
          // presence heartbeat rebuild + version stamp — fires on every
          // login/refresh, independent of Family Board opt-in, so the
          // developer can see who's active (and on what version) in Ghost
          // Mode even for users who've opted out of the leaderboard.
          // Never gated behind the steps above succeeding.
          try {
            await _rjapDetectAppVersion();
            await _writePresenceHeartbeat(user);
          } catch (e) { console.warn('Presence heartbeat failed (non-fatal):', e && e.message); }
          // Unconditionally ensure a leaderboard doc exists for every signed-in
          // user — regardless of opt-in state and regardless of whether they've
          // ever tapped. pushLeaderboard() already writes optIn:false safely
          // and never deletes an existing doc; calling it here on every login
          // guarantees every real user has a permanent, discoverable footprint
          // in both `presence` and `leaderboard`, so the Ghost Leaderboard
          // toggle and Ghost Mode search always find them from day one.
          try { await pushLeaderboard(); } catch (e) { console.warn('pushLeaderboard (login) failed (non-fatal):', e && e.message); }
          // Merge in any permanent-ledger gifts recorded on other devices.
          pullPermanentGiftLedger();

          // ── Refresh Rashi / personal-horoscope card after sign-in ──
          // vpPersonalLoad() caches a null result when it fires before auth
          // resolves. Reset that cache now so the card re-fetches the saved
          // birth profile from Firestore under the authenticated UID.
          if (typeof window.vpPersonalResetCache === 'function') {
            window.vpPersonalResetCache();
          }
          if (typeof window.vpPersonalRender === 'function') {
            window.vpPersonalRender();
          }

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
        fbHideAuthChecking();
        try { localStorage.removeItem("rjap_lastAuthLabel"); } catch (_) {}
        document.getElementById("fbLoggedOut").style.display = "block";
        document.getElementById("fbLoggedIn").style.display = "none";
        _fbStopVerifyCountdownTimer();
        _fbHideVerifyBlock();
        // Clean up session listener on sign out
        if (fbSessionListener) {
          fbSessionListener();
          fbSessionListener = null;
        }
        if (fbListener) {
          fbListener();
          fbListener = null;
        }
        // ── Sign-out: clear Rashi / personal-horoscope card ──
        if (typeof window.vpPersonalResetCache === 'function') {
          window.vpPersonalResetCache();
        }
        if (typeof window.vpPersonalRender === 'function') {
          window.vpPersonalRender();
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
            dedications: [],
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
            historyKV: {},
            timerHistoryKV: {},
            dtKV: 0,
            ltKV: 0,
            nameJapDeductKV: 0,
            malaLogKV: [],
            syncBaselineKV: {},
            syncBaselineTimerKV: {},
            historySS: {},
            timerHistorySS: {},
            dtSS: 0,
            ltSS: 0,
            nameJapDeductSS: 0,
            malaLogSS: [],
            syncBaselineSS: {},
            syncBaselineTimerSS: {},
            gaudiyaMode: false,
            trahimamMode: false,
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
          App.lmcKV = Math.floor(
            ((App.S.historyKV || {})[App.S.tk] || 0) / (App.S.ms || 108),
          );
          App.lmcSS = Math.floor(
            ((App.S.historySS || {})[App.S.tk] || 0) / (App.S.ms || 108),
          );
          App.lm28 = Math.floor((App.S.h28[App.S.tk] || 0) / (App.S.ms || 108));
          document.body.classList.remove("gaudiya-mode");
          document.body.classList.remove("trahimam-mode");
          document.body.classList.remove("ramanandi-mode");
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
async function fbSignInGoogle() {
  if (!fbInit()) {
    toast("Firebase not ready. Check your connection.");
    return;
  }

  // ── Native (Capacitor/Android): use the native Google Sign-In plugin ──
  // signInWithPopup/signInWithRedirect never work inside a Capacitor WebView
  // (Google blocks OAuth from embedded webviews), so on native we go through
  // @capacitor-firebase/authentication instead, then hand the resulting
  // credential to the Firebase Web SDK so fbAuth/fbDb see a signed-in user.
  if (_isNativeApp() && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication) {
    try {
      const { FirebaseAuthentication } = window.Capacitor.Plugins;
      // Requesting the drive.file scope here means Google may show one
      // extra consent line ("...create and manage files you use with this
      // app") the first time. serverAuthCode is only returned when a scope
      // is requested — it's what lets the backend set up daily Drive
      // backups without ever holding a live browser session.
      const result = await FirebaseAuthentication.signInWithGoogle({
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });
      const idToken = result && result.credential && result.credential.idToken;
      const accessToken = result && result.credential && result.credential.accessToken;
      const serverAuthCode = result && result.credential && result.credential.serverAuthCode;

      if (!idToken) throw new Error("No ID token returned from native Google Sign-In");
      const credential = firebase.auth.GoogleAuthProvider.credential(idToken, accessToken);
      await fbAuth.signInWithCredential(credential);
      toast("Signed in with Google! ☁️ Sync active 🙏");

      // Fire-and-forget: sets up Drive backup auth in the background without
      // blocking or interrupting the sign-in flow the user is waiting on.
      if (serverAuthCode) {
        fbEnableDriveBackup(serverAuthCode).catch((e) => {
          console.error("Drive backup auth setup failed:", e);
        });
      }
    } catch (e) {
      console.error("Native Google sign-in failed:", e);
      const el = document.getElementById("fbErr");
      if (el) {
        el.textContent = "Google sign-in failed: " + (e && e.message ? e.message : e);
        setTimeout(() => (el.textContent = ""), 8000);
      }
    }
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

// Exchanges the one-time serverAuthCode (captured at Google sign-in, native
// only) for a Drive refresh token, stored server-side. Safe to call more
// than once — driveTokenExchange just no-ops if Google doesn't return a
// fresh refresh_token (e.g. consent already granted before).
async function fbEnableDriveBackup(serverAuthCode) {
  if (!fbInit() || !firebase.app().functions) return { skipped: "fbInit or functions unavailable" };
  try {
    const fn = firebase.app().functions().httpsCallable("driveTokenExchange");
    const res = await fn({ serverAuthCode });
    if (res && res.data && res.data.stored) {
      console.log("Drive daily backup enabled.");
    } else {
      console.log("Drive backup: nothing new to store (already enabled or no offline access).", res && res.data);
    }
    return res && res.data;
  } catch (e) {
    console.warn("driveTokenExchange call failed:", e);
    return { threw: true, message: e && e.message, code: e && e.code, details: e && e.details };
  }
}

// Builds a filename like "radha-naam-jap-backup-2026-07-16_2030.json" using
// the DEVICE's local time (not UTC), so it matches what the person actually
// sees on their clock when they open Drive later.
function _driveBackupFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `radha-naam-jap-backup-${stamp}.json`;
}

// Foreground catch-up for the daily Google Drive backup — runs once each
// time the app is opened. background/runner.js's periodic check can only
// wake roughly every ~15-60 min (Android platform limit — no exact-alarm
// option for background-runner, unlike the LocalNotifications reminders
// elsewhere in this app), so if the phone was closed/offline right at the
// chosen time, that day's backup could otherwise be missed entirely until
// the *next* day's window. This catches it up the moment you next open
// the app instead — reusing the SAME "already done today" marker
// (bgsync_last_drive_backup_date in CapacitorKV) that runner.js writes,
// so the background runner and this foreground check never double-upload
// on the same day, whichever one gets there first.
async function checkDailyDriveBackupCatchUp() {
  if (!App.S.driveBackupDailyEnabled || !fbUser) return;
  const Cap = window.Capacitor;
  if (!Cap || !Cap.Plugins || !Cap.Plugins.CapacitorKV) return;
  try {
    const targetHour = App.S.driveBackupHour ?? 3;
    const targetMinute = App.S.driveBackupMinute ?? 0;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = targetHour * 60 + targetMinute;
    if (nowMinutes < targetMinutes) return; // chosen time hasn't arrived yet today

    const today =
      now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    const r = await Cap.Plugins.CapacitorKV.get({ key: "bgsync_last_drive_backup_date" });
    const lastRunDate = r && r.value != null ? r.value : null;
    if (lastRunDate === today) return; // already done today, by either this check or runner.js

    console.log("Catching up today's Drive backup on app open…");
    await driveBackupNow();
    await Cap.Plugins.CapacitorKV.set({ key: "bgsync_last_drive_backup_date", value: today });
  } catch (e) {
    console.warn("Drive backup catch-up check failed (non-fatal):", e);
  }
}

// Manual "Backup Now" button (Settings > Cloud Sync & Backup). Always
// creates a new dated file in the user's Drive — never overwrites a
// previous backup. Requires the person to be signed in with Google AND to
// have already granted Drive access (via a Google sign-in since this
// feature was added). If not yet granted, prompts a fresh Google sign-in
// to pick up the scope, then retries once automatically.
async function driveBackupNow() {
  if (!fbUser) {
    toast("Sign in with Google first to back up to Drive.");
    return;
  }
  const btn = document.getElementById("driveBackupNowBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Backing up…"; }
  try {
    const fn = firebase.app().functions().httpsCallable("driveBackupUpload");
    const backupJson = JSON.stringify(_buildBackupPayload());
    const filename = _driveBackupFilename();
    let res = await fn({ backupJson, filename });

    if (res && res.data && res.data.reason === "not_authorized") {
      // Drive access was never granted (e.g. signed in before this feature
      // existed, or via email/Zoho). Ask for it now via a fresh native
      // Google sign-in that requests the drive.file scope, then retry once.
      toast("Connecting Google Drive — approve access if asked…");
      if (_isNativeApp() && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication) {
        const { FirebaseAuthentication } = window.Capacitor.Plugins;
        const signInResult = await FirebaseAuthentication.signInWithGoogle({
          scopes: ["https://www.googleapis.com/auth/drive.file"],
        });
        const serverAuthCode = signInResult && signInResult.credential && signInResult.credential.serverAuthCode;
        if (serverAuthCode) {
          await fbEnableDriveBackup(serverAuthCode);
          res = await fn({ backupJson, filename });
        }
      }
    }

    if (res && res.data && res.data.success) {
      toast("✅ Backed up to Google Drive: " + filename);
    } else {
      toast("❌ Drive backup failed: " + ((res && res.data && res.data.reason) || "unknown error"));
    }
  } catch (e) {
    console.error("driveBackupNow failed:", e);
    toast("❌ Drive backup failed: " + (e && e.message ? e.message : e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📤 Backup Now to Google Drive"; }
  }
}

// ── Sign in with Zoho (OIDC provider) ──
// Native flow: open Zoho's login in the system browser (Chrome Custom Tabs),
// then catch the redirect back into the app via a deep link and finish the
// sign-in with the returned id_token. Requires:
//   1. ZOHO_NATIVE_CONFIG.clientId filled in (from api-console.zoho.com)
//   2. That same redirect URI registered in Zoho's console
//   3. The Android app configured to open on that redirect URI (see README)
async function _zohoNativeSignIn() {
  const { Browser, App } = window.Capacitor.Plugins;
  if (!Browser || !App) {
    throw new Error("Browser/App Capacitor plugins not installed");
  }
  if (!ZOHO_NATIVE_CONFIG.clientId || ZOHO_NATIVE_CONFIG.clientId === "YOUR_ZOHO_CLIENT_ID_HERE") {
    throw new Error("Zoho client ID not configured (see ZOHO_NATIVE_CONFIG in app.js)");
  }

  const authUrl =
    "https://accounts.zoho.com/oauth/v2/auth" +
    "?response_type=code" +
    "&client_id=" + encodeURIComponent(ZOHO_NATIVE_CONFIG.clientId) +
    "&scope=" + encodeURIComponent(ZOHO_NATIVE_CONFIG.scope) +
    "&redirect_uri=" + encodeURIComponent(ZOHO_NATIVE_CONFIG.redirectUri) +
    "&access_type=offline" +
    "&prompt=consent";

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = async (callbackUrl) => {
      if (settled) return;
      settled = true;
      try {
        await Browser.close();
      } catch (_e) {}
      try {
        const parsed = new URL(callbackUrl.replace("#", "?").replace(/^.*?:\/\//, "https://dummy/"));
        const idToken = parsed.searchParams.get("id_token");
        const code = parsed.searchParams.get("code");
        const error = parsed.searchParams.get("error");
        if (error) return reject(new Error("Zoho returned error: " + error));
        if (idToken) {
          const provider = new firebase.auth.OAuthProvider("oidc.zoho");
          const credential = provider.credential({ idToken });
          await fbAuth.signInWithCredential(credential);
          return resolve();
        }
        if (code) {
          // Authorization-code flow needs a server-side token exchange
          // (Zoho requires a client secret, which must never live in the
          // app). This calls the Cloud Function in /functions/index.js,
          // which exchanges the code and returns a Firebase custom token.
          if (!ZOHO_NATIVE_CONFIG.exchangeUrl) {
            return reject(new Error("Zoho code exchange URL not configured (see ZOHO_NATIVE_CONFIG.exchangeUrl)"));
          }
          try {
            const resp = await fetch(
              ZOHO_NATIVE_CONFIG.exchangeUrl + "?code=" + encodeURIComponent(code)
            );
            const data = await resp.json();
            if (!resp.ok || !data.customToken) {
              throw new Error((data && data.error) || "Zoho token exchange failed");
            }
            await fbAuth.signInWithCustomToken(data.customToken);
            return resolve();
          } catch (exchangeErr) {
            return reject(exchangeErr);
          }
        }
        reject(new Error("Zoho redirect did not include id_token or code"));
      } catch (e) {
        reject(e);
      }
    };

    App.addListener("appUrlOpen", (data) => {
      if (data && data.url && data.url.indexOf(ZOHO_NATIVE_CONFIG.redirectUri.split("//")[1]) !== -1) {
        finish(data.url);
      }
    });

    Browser.open({ url: authUrl }).catch(reject);

    // Also handle the case where the browser is dismissed without a redirect
    Browser.addListener("browserFinished", () => {
      if (!settled) {
        settled = true;
        reject(new Error("Sign-in cancelled"));
      }
    });
  });
}

async function fbSignInZoho() {
  if (!fbInit()) {
    toast("Firebase not ready. Check your connection.");
    return;
  }

  if (_isNativeApp() && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser && window.Capacitor.Plugins.App) {
    try {
      await _zohoNativeSignIn();
      toast("Signed in with Zoho! ☁️ Cloud sync active 🙏");
    } catch (e) {
      console.error("Native Zoho sign-in failed:", e);
      const el = document.getElementById("fbErr");
      if (el) {
        el.textContent = "Zoho sign-in failed: " + (e && e.message ? e.message : e);
        setTimeout(() => (el.textContent = ""), 8000);
      }
    }
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
// ── Mandatory email verification within 5 days ─────────────────────
// Days 0-5: soft banner nudge only (#fbVerifyBanner, unchanged UX).
// Day 5+: hard, non-dismissable block overlay — cloud sync/app use is
// gated until the user verifies or signs out. Grace period is measured
// from Firebase Auth's own account-creation timestamp (user.metadata.
// creationTime), not any local flag, so it can't be reset by clearing
// local storage or reinstalling.
const EMAIL_VERIFY_GRACE_DAYS = 5;

function _emailVerifyDaysLeft(user) {
  if (!user || !user.metadata || !user.metadata.creationTime) return null;
  const created = new Date(user.metadata.creationTime).getTime();
  if (isNaN(created)) return null;
  const elapsedDays = (Date.now() - created) / 86400000;
  return EMAIL_VERIFY_GRACE_DAYS - elapsedDays;
}

// Formats the fractional-days-left value into a human "Xd Yh left" /
// "Yh Zm left" style string for the live countdown shown in the banner
// and the hard-block overlay.
function _fbFormatVerifyCountdown(daysLeft) {
  if (daysLeft === null) return "";
  if (daysLeft <= 0) return "Grace period ended";
  const totalMinutes = Math.max(1, Math.floor(daysLeft * 24 * 60));
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d >= 1) return d + "d " + h + "h left to verify";
  if (h >= 1) return h + "h " + m + "m left to verify";
  return m + "m left to verify";
}

// ── Live countdown: banner ticks down in real time while Settings is
// open, and the hard block fires the instant the grace period actually
// expires (not just at the next sign-in/app-open event).
let _fbVerifyCountdownTimer = null;

function _fbUpdateVerifyCountdownUI(user) {
  const u = user || (fbAuth && fbAuth.currentUser);
  if (!u || !u.email || _fbIsSyntheticPhoneEmail(u.email) || u.emailVerified) { _fbStopVerifyCountdownTimer(); return; }
  const _vBanner = document.getElementById("fbVerifyBanner");
  const _daysLeft = _emailVerifyDaysLeft(u);
  if (_vBanner) {
    _vBanner.style.display = "block";
    const _cd = document.getElementById("fbVerifyBannerCountdown");
    if (_cd && _daysLeft !== null) {
      _cd.textContent = "You have " + EMAIL_VERIFY_GRACE_DAYS + " days from signup to verify — "
        + _fbFormatVerifyCountdown(_daysLeft) + " to keep cloud sync active.";
    }
  }
  const _blockCd = document.getElementById("fbVerifyBlockCountdown");
  if (_blockCd && _daysLeft !== null) {
    _blockCd.textContent = _fbFormatVerifyCountdown(_daysLeft);
  }
  if (_daysLeft !== null && _daysLeft <= 0) {
    _fbShowVerifyBlock(u);
  } else {
    _fbHideVerifyBlock();
  }
}

function _fbStartVerifyCountdownTimer(user) {
  _fbUpdateVerifyCountdownUI(user); // paint immediately, don't wait a minute
  if (_fbVerifyCountdownTimer) return; // already ticking
  _fbVerifyCountdownTimer = setInterval(function () { _fbUpdateVerifyCountdownUI(); }, 60000);
}

function _fbStopVerifyCountdownTimer() {
  if (_fbVerifyCountdownTimer) { clearInterval(_fbVerifyCountdownTimer); _fbVerifyCountdownTimer = null; }
  const _vBanner = document.getElementById("fbVerifyBanner");
  if (_vBanner) _vBanner.style.display = "none";
}

function _fbShowVerifyBlock(user) {
  if (document.getElementById("fbVerifyBlockOverlay")) return; // already shown
  var ov = document.createElement("div");
  ov.id = "fbVerifyBlockOverlay";
  ov.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.86);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,sans-serif";
  ov.innerHTML = ''
    + '<div role="dialog" aria-modal="true" style="max-width:440px;width:100%;max-height:88vh;overflow-y:auto;background:linear-gradient(180deg,#1a2244,#0f1530);border:1px solid rgba(255,90,90,0.35);border-radius:18px;padding:22px 22px 18px;box-shadow:0 24px 60px rgba(0,0,0,0.6)">'
    +   '<div style="font-size:17px;font-weight:700;color:#ff9a9a;margin-bottom:12px;text-align:center">📧 Please verify your email to continue</div>'
    +   '<div style="font-size:13.5px;color:#e6e9f5;line-height:1.65;text-align:center">'
    +     'It\'s been more than ' + EMAIL_VERIFY_GRACE_DAYS + ' days since you created this account, and <b style="color:#ffd97a">' + (user.email || '') + '</b> is still unverified.<br><br>'
    +     'To keep your account and cloud data secure, verification is now required before you can continue.'
    +   '</div>'
    +   '<div id="fbVerifyBlockCountdown" style="margin-top:10px;font-size:11.5px;color:#ff9a9a;text-align:center;opacity:.85"></div>'
    +   '<button id="fbVerifyBlockResend" style="margin-top:18px;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,215,0,0.4);background:rgba(255,215,0,0.12);color:#ffd97a;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Resend verification email</button>'
    +   '<button id="fbVerifyBlockRecheck" style="margin-top:10px;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(90,200,120,0.4);background:rgba(90,200,120,0.14);color:#9be6ac;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">I\'ve verified — Continue</button>'
    +   '<button id="fbVerifyBlockSignOut" style="margin-top:10px;width:100%;padding:10px;border-radius:10px;border:none;background:transparent;color:var(--td);font-size:12px;cursor:pointer;font-family:Inter,sans-serif;text-decoration:underline">Sign out</button>'
    + '</div>';
  document.body.appendChild(ov);
  ov.querySelector("#fbVerifyBlockResend").addEventListener("click", function () { fbResendVerificationEmail(); });
  ov.querySelector("#fbVerifyBlockRecheck").addEventListener("click", async function () {
    var btn = ov.querySelector("#fbVerifyBlockRecheck");
    if (!btn) return;
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      await fbAuth.currentUser.reload();
      if (fbAuth.currentUser.emailVerified) {
        _fbHideVerifyBlock();
        toast("✅ Email verified — welcome back! 🙏");
      } else {
        btn.disabled = false; btn.textContent = "Still not verified — tap link in email first";
      }
    } catch (e) {
      btn.disabled = false; btn.textContent = "I've verified — Continue";
    }
  });
  ov.querySelector("#fbVerifyBlockSignOut").addEventListener("click", function () {
    _fbHideVerifyBlock();
    fbSignOut();
  });
  // Intentionally no backdrop-click or Escape dismissal — this is a hard
  // gate (days 0-5 already got the soft #fbVerifyBanner nudge instead).
}

function _fbHideVerifyBlock() {
  var ov = document.getElementById("fbVerifyBlockOverlay");
  if (ov) ov.remove();
}

// If the block overlay is showing and the user verifies via the emailed
// link in another tab, silently re-check the moment they come back to
// this tab — so they aren't stuck manually tapping "I've verified".
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  if (!document.getElementById("fbVerifyBlockOverlay")) return;
  if (!fbAuth || !fbAuth.currentUser) return;
  try {
    await fbAuth.currentUser.reload();
    if (fbAuth.currentUser.emailVerified) {
      _fbHideVerifyBlock();
      toast("✅ Email verified — welcome back! 🙏");
    }
  } catch (_) {}
});

function _fbEmailErr(msg) {
  const el = document.getElementById("fbErr");
  if (el) {
    el.textContent = msg || "";
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 6000);
  }
}
// Phone-specific error display: shown directly under the Send OTP button
// (not the shared #fbErr div, which sits below the whole email section and
// was invisible without scrolling). Includes the raw Firebase error code so
// failures can be diagnosed without opening DevTools. Stays up 20s / until
// the next attempt, instead of clearing after 6s, so it can actually be read.
function _fbPhoneErr(msg, code) {
  const el = document.getElementById("fbPhoneErr");
  const full = code ? (msg + "  [" + code + "]") : (msg || "");
  console.warn("Phone OTP error:", code, msg);
  if (el) {
    el.textContent = full;
    if (full) setTimeout(() => { if (el.textContent === full) el.textContent = ""; }, 20000);
  } else {
    _fbEmailErr(full); // fallback if the new div isn't present yet
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

function _fbClearRecaptcha() {
  try { if (_fbRecaptcha) _fbRecaptcha.clear(); } catch (_) {}
  _fbRecaptcha = null;
  // grecaptcha.clear() removes the widget's own contents, but on some
  // WebViews — especially after a render that failed or was interrupted —
  // it leaves the container in a state grecaptcha still treats as
  // "already rendered", which then throws that exact error on the next
  // attempt (this was the actual cause of OTP never sending: every retry
  // hit this error and never got as far as contacting Firebase at all).
  // Forcibly emptying the container guarantees a clean slate.
  try {
    var c = document.getElementById("fbRecaptchaContainer");
    if (c) c.innerHTML = "";
  } catch (_) {}
}

function _fbEnsureRecaptcha() {
  if (!fbAuth) return null;
  if (_fbRecaptcha) return _fbRecaptcha;
  try {
    _fbHideRecaptchaBadge();
    _fbRecaptcha = new firebase.auth.RecaptchaVerifier("fbRecaptchaContainer", {
      size: "invisible",
      callback: function () { _fbHideRecaptchaBadge(); },
      "expired-callback": function () {
        _fbClearRecaptcha();
      }
    });
    _fbRecaptcha.render()
      .then(function () { _fbHideRecaptchaBadge(); })
      .catch(function (e) {
        // Previously this only logged a warning and left the broken
        // widget in place, which is what produced "reCAPTCHA has already
        // been rendered in this element" on every subsequent attempt.
        console.warn("reCAPTCHA render:", e && e.message);
        _fbClearRecaptcha();
      });
  } catch (e) {
    console.warn("reCAPTCHA init:", e && e.message);
    _fbClearRecaptcha();
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
    _fbPhoneErr("Enter phone number (e.g. 9876543210)");
    return;
  }
  const verifier = _fbEnsureRecaptcha();
  if (!verifier) { _fbPhoneErr("Could not initialize verification. Please reload."); return; }

  const btn = document.getElementById("fbPhoneSendBtn");
  if (btn) { btn.disabled = true; btn.textContent = isResend ? "Resending…" : "Sending…"; }
  _fbEmailErr("");

  // Guard against a silently-stalled invisible reCAPTCHA. Inside an Android
  // WebView (Capacitor) the reCAPTCHA challenge can fail to complete without
  // ever calling either the success or expired callback, which previously
  // left signInWithPhoneNumber()'s promise pending forever — the button
  // stayed on "Sending…", no error appeared, and no OTP ever arrived. This
  // timeout forces a visible error and a reset so the user can retry.
  let _otpSettled = false;
  const _otpTimeout = setTimeout(function () {
    if (_otpSettled) return;
    _otpSettled = true;
    if (btn) { btn.disabled = false; btn.textContent = "Send OTP"; }
    _fbClearRecaptcha();
    _fbPhoneErr("Verification timed out. Please check your connection and try again.", "client/recaptcha-timeout");
  }, 20000);

  fbAuth.signInWithPhoneNumber(phone, verifier)
    .then(function (confirmation) {
      if (_otpSettled) return; // timeout already fired — ignore late resolve
      _otpSettled = true;
      clearTimeout(_otpTimeout);
      _fbConfirmation = confirmation;
      _fbPhoneErr(""); // clear any prior error now that a send succeeded
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
      if (_otpSettled) return;
      _otpSettled = true;
      clearTimeout(_otpTimeout);
      if (btn) { btn.disabled = false; btn.textContent = "Send OTP"; }
      _fbClearRecaptcha();
      _fbPhoneErr((e && e.message) || "Could not send OTP", e && e.code);
    });
}

function fbVerifyPhoneOtp() {
  if (!_fbConfirmation) { _fbEmailErr("Please request an OTP first"); return; }
  const otpEl = document.getElementById("fbOtpIn");
  const code = (otpEl && otpEl.value || "").trim();
  if (!/^\d{4,8}$/.test(code)) { _fbPhoneErr("Enter the 6-digit OTP from your SMS"); return; }
  _fbPhoneErr("");
  _fbConfirmation.confirm(code)
    .then(function () {
      _fbConfirmation = null;
      _fbClearRecaptcha();
      const otpRow = document.getElementById("fbOtpRow");
      if (otpRow) otpRow.style.display = "none";
      toast("Signed in! ☁️ Sync active 🙏");
      // ── Password linking after OTP verification ──
      // Two cases: (1) the user got here via "Forgot password" — they just
      // re-proved phone ownership via OTP, so let them set a fresh password
      // immediately; (2) first-time / no password set yet — offer it as an
      // optional, skippable convenience so future sign-ins don't need OTP.
      const _wasResetFlow = _fbPhonePasswordResetPending;
      _fbPhonePasswordResetPending = false;
      const _u = fbAuth.currentUser;
      if (_wasResetFlow) {
        _fbShowPasswordModal({
          title: "🔑 Set a new password",
          subtitle: "Your phone number is verified — choose a new password for signing in.",
          requireCurrent: false,
          submitLabel: "Save new password",
          skippable: true,
          onSubmit: function (np) { return _fbSetOrChangePassword(np, null); }
        });
      } else if (_u && !_fbHasPasswordProvider(_u)) {
        _fbShowPasswordModal({
          title: "🔑 Set a password? (optional)",
          subtitle: "Skip OTP next time — sign in with your phone number + a password instead.",
          requireCurrent: false,
          submitLabel: "Set password",
          skippable: true,
          onSubmit: function (np) { return _fbSetOrChangePassword(np, null); }
        });
      }
    })
    .catch(function (e) {
      _fbPhoneErr((e && e.message) || "Invalid or expired OTP", e && e.code);
    });
}

function fbResetPhoneOtp() {
  _fbConfirmation = null;
  _fbClearRecaptcha();
  _fbPhonePasswordResetPending = false;
  const otpRow = document.getElementById("fbOtpRow");
  if (otpRow) otpRow.style.display = "none";
  const btn = document.getElementById("fbPhoneSendBtn");
  if (btn) { btn.disabled = false; btn.textContent = "Send OTP"; }
  _fbEmailErr("");
}

// ── Password login for phone accounts ──────────────────────────────
// Firebase's phone auth has no native "password" concept, so a password
// set for a phone account is stored as a linked email/password credential
// under a deterministic, never-emailed placeholder address derived from
// the phone number itself. It is only ever used as an internal Firebase
// Auth identifier — nothing is sent to it, and it's regenerated the same
// way every time from the phone number, so nothing needs to be stored.
function _fbPhoneSyntheticEmail(phone) {
  const digits = (phone || "").replace(/[^\d]/g, "");
  return digits + "@phoneauth.radharadha.internal";
}

function _fbIsSyntheticPhoneEmail(email) {
  return !!email && /@phoneauth\.radharadha\.internal$/.test(email);
}

function _fbHasPasswordProvider(user) {
  if (!user || !user.providerData) return false;
  return user.providerData.some(function (p) { return p && p.providerId === "password"; });
}

// Sets a password for the current user if none exists yet (links a
// password credential to the existing account), or changes it if one
// already exists (requires re-authenticating with the current password
// first, per Firebase's security rules for updatePassword).
function _fbSetOrChangePassword(newPassword, currentPassword) {
  const user = fbAuth && fbAuth.currentUser;
  if (!user) return Promise.reject(new Error("Please sign in first"));
  const identifierEmail = user.email || _fbPhoneSyntheticEmail(user.phoneNumber);
  if (!identifierEmail) return Promise.reject(new Error("Could not determine account identifier"));
  if (_fbHasPasswordProvider(user)) {
    const reauthCred = firebase.auth.EmailAuthProvider.credential(identifierEmail, currentPassword || "");
    return user.reauthenticateWithCredential(reauthCred).then(function () {
      return user.updatePassword(newPassword);
    });
  }
  const linkCred = firebase.auth.EmailAuthProvider.credential(identifierEmail, newPassword);
  return user.linkWithCredential(linkCred);
}

// Toggles the phone sign-in UI between "Send OTP" mode and "Sign in with
// password" mode.
function fbTogglePhonePasswordMode(showPassword) {
  const sendRow = document.getElementById("fbPhoneSendRow");
  const otpRow = document.getElementById("fbOtpRow");
  const passRow = document.getElementById("fbPhonePassRow");
  if (showPassword) {
    if (sendRow) sendRow.style.display = "none";
    if (otpRow) otpRow.style.display = "none";
    if (passRow) passRow.style.display = "block";
  } else {
    if (sendRow) sendRow.style.display = "flex";
    if (passRow) passRow.style.display = "none";
  }
  _fbPhoneErr("");
}

function fbSignInPhonePassword() {
  if (!fbInit()) { toast("Firebase not ready. Check your connection."); return; }
  const phone = _fbReadPhone();
  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
    _fbPhoneErr("Enter phone number (e.g. 9876543210)");
    return;
  }
  const passEl = document.getElementById("fbPhonePassIn");
  const password = (passEl && passEl.value) || "";
  if (!password) { _fbPhoneErr("Enter your password"); return; }
  const identifierEmail = _fbPhoneSyntheticEmail(phone);
  const btn = document.getElementById("fbPhonePassSendBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
  fbAuth.signInWithEmailAndPassword(identifierEmail, password)
    .then(function () {
      if (btn) { btn.disabled = false; btn.textContent = "Sign in with Password"; }
      toast("Signed in! ☁️ Sync active 🙏");
    })
    .catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Sign in with Password"; }
      if (e && (e.code === "auth/user-not-found" || e.code === "auth/wrong-password" || e.code === "auth/invalid-credential")) {
        _fbPhoneErr("No password set for this number yet, or it's incorrect. Use OTP to sign in, then set a password from Settings.", e.code);
      } else {
        _fbPhoneErr((e && e.message) || "Could not sign in", e && e.code);
      }
    });
}

// "Forgot password" for a phone account: since the placeholder address
// behind a phone password is never a real inbox, Firebase's email reset
// link can't be used. Instead, re-proving phone ownership via a fresh OTP
// stands in for that proof, and immediately prompts for a new password.
let _fbPhonePasswordResetPending = false;
function fbPhoneForgotPassword() {
  const phone = _fbReadPhone();
  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
    _fbPhoneErr("Enter your phone number above first");
    return;
  }
  _fbPhonePasswordResetPending = true;
  fbTogglePhonePasswordMode(false);
  toast("Verify with OTP to reset your password 🔑");
  fbSendPhoneOtp();
}

// Generic password entry modal, used for: setting a first password,
// changing an existing one, and completing a phone "forgot password" reset.
function _fbShowPasswordModal(opts) {
  const old = document.getElementById("fbPassModal");
  if (old) old.remove();
  const ov = document.createElement("div");
  ov.id = "fbPassModal";
  ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,sans-serif";
  const currentField = opts.requireCurrent
    ? '<input type="password" id="fbPassModalCurrent" class="fb-email-input" placeholder="Current password" autocomplete="current-password">'
    : '';
  ov.innerHTML = ''
    + '<div role="dialog" aria-modal="true" style="max-width:400px;width:100%;background:linear-gradient(180deg,#1a2244,#0f1530);border:1px solid rgba(74,144,226,0.35);border-radius:18px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,0.55)">'
    +   '<div style="font-size:16px;font-weight:700;color:#ffd97a;margin-bottom:8px;text-align:center">' + opts.title + '</div>'
    +   (opts.subtitle ? '<div style="font-size:12.5px;color:#c7cce0;margin-bottom:14px;text-align:center;line-height:1.5">' + opts.subtitle + '</div>' : '')
    +   currentField
    +   '<input type="password" id="fbPassModalNew" class="fb-email-input" placeholder="New password (min 6 chars)" autocomplete="new-password">'
    +   '<input type="password" id="fbPassModalConfirm" class="fb-email-input" placeholder="Confirm new password" autocomplete="new-password" style="margin-bottom:4px">'
    +   '<div id="fbPassModalErr" style="font-size:11.5px;color:var(--red);min-height:16px;margin-bottom:6px;text-align:center"></div>'
    +   '<button id="fbPassModalSubmit" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(90,200,120,0.4);background:rgba(90,200,120,0.16);color:#9be6ac;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">' + (opts.submitLabel || "Save") + '</button>'
    +   (opts.skippable ? '<button id="fbPassModalSkip" style="margin-top:8px;width:100%;padding:10px;border-radius:10px;border:none;background:transparent;color:var(--td);font-size:12px;cursor:pointer;font-family:Inter,sans-serif;text-decoration:underline">Skip for now</button>' : '')
    + '</div>';
  document.body.appendChild(ov);
  const errEl = ov.querySelector("#fbPassModalErr");
  const close = function () { try { ov.remove(); } catch (_) {} };
  if (opts.skippable) ov.querySelector("#fbPassModalSkip").addEventListener("click", close);
  ov.querySelector("#fbPassModalSubmit").addEventListener("click", function () {
    const np = ov.querySelector("#fbPassModalNew").value;
    const cp = ov.querySelector("#fbPassModalConfirm").value;
    const curr = opts.requireCurrent ? ov.querySelector("#fbPassModalCurrent").value : null;
    if (opts.requireCurrent && !curr) { errEl.textContent = "Enter your current password"; return; }
    if (!np || np.length < 6) { errEl.textContent = "New password must be at least 6 characters"; return; }
    if (np !== cp) { errEl.textContent = "Passwords do not match"; return; }
    const btn = ov.querySelector("#fbPassModalSubmit");
    btn.disabled = true; btn.textContent = "Saving…";
    Promise.resolve(opts.onSubmit(np, curr))
      .then(function () { close(); toast("🔑 Password saved"); })
      .catch(function (e) {
        btn.disabled = false; btn.textContent = opts.submitLabel || "Save";
        errEl.textContent = (e && e.message) || "Could not save password";
      });
  });
}

// Entry point for the "Change / Set Password" button shown to signed-in
// users in Settings — works the same for email accounts and phone
// accounts (with or without a password already set).
function fbChangePasswordFromSettings() {
  if (!fbAuth || !fbAuth.currentUser) { toast("Please sign in first"); return; }
  const user = fbAuth.currentUser;
  const already = _fbHasPasswordProvider(user);
  _fbShowPasswordModal({
    title: already ? "🔑 Change password" : "🔑 Set a password",
    subtitle: already
      ? "Enter your current password, then choose a new one."
      : (user.phoneNumber
          ? "Set a password so you can sign in with your phone number + password (skip OTP)."
          : "Set a password for this account."),
    requireCurrent: already,
    submitLabel: already ? "Change password" : "Set password",
    onSubmit: function (np, cp) { return _fbSetOrChangePassword(np, cp); }
  });
}

function fbSignUpEmail() {

  if (!fbInit()) { toast("Firebase not ready. Check your connection."); return; }
  const { email, pass } = _fbReadEmailPass();
  if (!email || !pass) { _fbEmailErr("Enter email and password"); return; }
  if (pass.length < 6) { _fbEmailErr("Password must be at least 6 characters"); return; }
  fbAuth.createUserWithEmailAndPassword(email, pass)
    .then((cred) => {
      _fbEmailErr("");
      toast("Account created! ☁️ Sync active 🙏");
      // Actually send the verification email. This call was missing before —
      // the account was created and signed in, but no email ever went out,
      // even though the sign-up instructions told the user to check their
      // inbox for one. Sending it does not block sign-in/sync; it just
      // gives the user a real link to confirm the address is theirs.
      cred.user.sendEmailVerification()
        .then(function () {
          _fbInfoModal("📧 Verify your email",
            '<p style="margin:0 0 10px">A verification link has been sent to:<br><span style="color:#ffd97a;word-break:break-all">' + email + '</span></p>'
            + '<ol style="margin:8px 0 10px 18px;padding:0">'
            +   '<li>Open your inbox and tap the verification link.</li>'
            +   '<li><b>Can\'t find it?</b> Check your <b>Spam</b>, <b>Promotions</b>, or <b>Junk</b> folder.</li>'
            +   '<li>You are already signed in and synced — this step just confirms the address is really yours.</li>'
            + '</ol>'
          );
        })
        .catch(function (e) {
          // Do not block the newly-created account on this — the user can
          // always resend from the "Sign in" screen's verify banner. But
          // don't swallow the error silently either; surface it so failures
          // are visible instead of looking like "nothing happened".
          console.warn("sendEmailVerification failed:", e && e.code, e && e.message);
          _fbEmailErr("Account created, but verification email failed to send: " + ((e && e.code) || (e && e.message) || "unknown error"));
        });
    })
    .catch((e) => _fbEmailErr(e.message || "Sign-up failed"));
}

// Resend the verification email for the currently signed-in user.
// Surfaced via the "verify your email" banner shown after sign-in when
// user.emailVerified is false.
function fbResendVerificationEmail() {
  if (!fbAuth || !fbAuth.currentUser) { toast("Please sign in first"); return; }
  fbAuth.currentUser.sendEmailVerification()
    .then(function () {
      _fbInfoModal("📧 Verification email sent",
        '<p style="margin:0 0 10px">A new verification link has been sent to:<br><span style="color:#ffd97a;word-break:break-all">' + (fbAuth.currentUser.email || "") + '</span></p>'
        + '<p style="margin:0;font-size:12.5px;opacity:.85">Check Spam / Promotions / Junk if it does not appear within a minute.</p>'
      );
    })
    .catch(function (e) { toast((e && e.message) || "Could not send verification email"); });
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
    timerHistory: {}, timer28History: {}, sankalpas: [], dedications: [], occasions: {},
    syncBaseline: {}, syncBaseline28: {}, syncBaselineTimer: {}, syncBaselineTimer28: {},
    migrationV2Done: false, japMode: "radha",
    historyRV: {}, timerHistoryRV: {}, dtRV: 0, ltRV: 0, nameJapDeductRV: 0,
    malaLogRV: [], activityLog: [], syncBaselineRV: {}, syncBaselineTimerRV: {},
    historyHK: {}, timerHistoryHK: {}, dtHK: 0, malaLogHK: [],
    syncBaselineHK: {}, syncBaselineTimerHK: {}, nameJapDeductHK: 0,
    historyKV: {}, timerHistoryKV: {}, dtKV: 0, ltKV: 0, nameJapDeductKV: 0,
    malaLogKV: [], syncBaselineKV: {}, syncBaselineTimerKV: {},
    historySS: {}, timerHistorySS: {}, dtSS: 0, ltSS: 0, nameJapDeductSS: 0,
    malaLogSS: [], syncBaselineSS: {}, syncBaselineTimerSS: {},
    historyRam: {}, timerHistoryRam: {}, dtRam: 0, ltRam: 0, nameJapDeductRam: 0,
    malaLogRam: [], syncBaselineRam: {}, syncBaselineTimerRam: {},
    gaudiyaMode: false, trahimamMode: false, ramanandiMode: false, dt28Cycles: 0,
    milestones: { reached: {}, lastChecked: 0 },
    lastLat: _prevLat, lastLng: _prevLng,
  };
  App.lmc = 0; App.lmcRV = 0; App.lmcHK = 0; App.lmcKV = 0; App.lmcSS = 0; App.lmcRam = 0; App.lm28 = 0;
  document.body.classList.remove("gaudiya-mode");
  document.body.classList.remove("trahimam-mode");
  document.body.classList.remove("ramanandi-mode");
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
  if (isGhostMode()) return; // ghost mode: read-only
  return fbPushFull();
}

// ── Developer write-back: push current App.S to a SPECIFIC user's Firestore
// doc. Used when a developer, while Ghost Mode-viewing another user's data,
// makes a manual jap correction or restores a backup — the change must land
// on the VIEWED user's document, never the developer's own. Requires the
// Firestore rule allowing isDeveloper() to write under /users/{userId}.
async function fbPushToUid(targetUid, fullReplace) {
  if (!fbUser || !fbDb || !targetUid) return;
  // HARD STOP: this function must only ever write to the account being
  // ghosted, never the developer's own. If targetUid somehow matches the
  // signed-in dev's own uid (stale call, future bug), refuse rather than
  // risk imprinting a manual-correction payload onto their real profile.
  if (targetUid === fbUser.uid) {
    console.warn("fbPushToUid blocked: targetUid matches own uid");
    return;
  }
  setSyncPill("syncing", fullReplace ? "Replacing viewed user's account…" : "Saving to viewed user's account…");
  const payload = {
    history: App.S.history || {},
    h28: App.S.h28 || {},
    nameJapDeduct28: App.S.nameJapDeduct28 || 0,
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
    activityLog: App.S.activityLog || [],
    sadhanaStart: App.S.sadhanaStart || "",
    historyHK: App.S.historyHK || {},
    timerHistoryHK: App.S.timerHistoryHK || {},
    dtHK: App.S.dtHK || 0,
    nameJapDeductHK: App.S.nameJapDeductHK || 0,
    malaLogHK: App.S.malaLogHK || [],
    historyKV: App.S.historyKV || {},
    timerHistoryKV: App.S.timerHistoryKV || {},
    dtKV: App.S.dtKV || 0,
    ltKV: App.S.ltKV || 0,
    nameJapDeductKV: App.S.nameJapDeductKV || 0,
    malaLogKV: App.S.malaLogKV || [],
    historySS: App.S.historySS || {},
    timerHistorySS: App.S.timerHistorySS || {},
    dtSS: App.S.dtSS || 0,
    ltSS: App.S.ltSS || 0,
    nameJapDeductSS: App.S.nameJapDeductSS || 0,
    malaLogSS: App.S.malaLogSS || [],
    historyRam: App.S.historyRam || {},
    timerHistoryRam: App.S.timerHistoryRam || {},
    dtRam: App.S.dtRam || 0,
    ltRam: App.S.ltRam || 0,
    nameJapDeductRam: App.S.nameJapDeductRam || 0,
    malaLogRam: App.S.malaLogRam || [],
    dedications: App.S.dedications || [],
    gaudiyaMode: App.S.gaudiyaMode || false,
    trahimamMode: App.S.trahimamMode || false,
    ramanandiMode: App.S.ramanandiMode || false,
    dt28Cycles: App.S.dt28Cycles || 0,
    milestones: App.S.milestones || { reached: {}, lastChecked: 0 },
    msConsider: App.S.msConsider || { radha: true, rv: true, hk: true, kv: true, ss: true, ram: true, n28: true },
    lastDevEdit: firebase.firestore.FieldValue.serverTimestamp(),
    lastDevEditBy: (fbUser && fbUser.email) || "developer",
  };
  // ghost mode fixes: force-restore signal — on a full restore, stamp a
  // timestamp the TARGET device's fbMigrate will recognize and use to
  // skip its own offline-preservation merge for one hydration, so the
  // restore actually takes effect instead of being silently overridden
  // by that device's own (by-design) "keep higher local value" logic.
  if (fullReplace) {
    payload.devForceRestoreAt = Date.now();
  }
  try {
    await fbDb
      .collection("users")
      .doc(targetUid)
      .collection("data")
      .doc("main")
      // fullReplace = true (restoring a backup): overwrite the ENTIRE
      // Firestore doc with no merge, so any old fields not in this payload
      // are dropped too — the account becomes exactly the backup file.
      // Otherwise (a normal manual jap correction): merge, touching only
      // the fields in this payload.
      .set(payload, fullReplace ? {} : { merge: true });
    setSyncPill("", "☁️ Saved to viewed user's account " + new Date().toLocaleTimeString());
    toast(fullReplace ? "✅ Viewed user's account fully replaced 🙏" : "✅ Saved to the viewed user's account 🙏");
  } catch (e) {
    console.warn("fbPushToUid failed:", e && e.message);
    setSyncPill("error", "Save failed");
    toast("❌ Could not save: " + (e && e.message ? e.message : e));
  }
}

async function fbPushFull() {
  if (!fbUser) return;
  if (isGhostMode()) return; // ghost mode: never write to Firestore
  // SAFETY: never push local state to cloud until we have successfully
  // pulled the authoritative cloud copy at least once this session.
  // Prevents wiping cloud data after "Clear app data" + re-login.
  if (!App._cloudHydrated && !App._allowInitialPush) {
    console.warn("fbPushFull blocked: cloud not yet hydrated");
    if (typeof window._scheduleHydrationRetry === "function") window._scheduleHydrationRetry();
    return;
  }
  setSyncPill("syncing", "Syncing…");
  const payload = {
    history: App.S.history || {},
    h28: App.S.h28 || {},
    nameJapDeduct28: App.S.nameJapDeduct28 || 0,
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
    historyKV: App.S.historyKV || {},
    timerHistoryKV: App.S.timerHistoryKV || {},
    dtKV: App.S.dtKV || 0,
    ltKV: App.S.ltKV || 0,
    nameJapDeductKV: App.S.nameJapDeductKV || 0,
    malaLogKV: App.S.malaLogKV || [],
    historySS: App.S.historySS || {},
    timerHistorySS: App.S.timerHistorySS || {},
    dtSS: App.S.dtSS || 0,
    ltSS: App.S.ltSS || 0,
    nameJapDeductSS: App.S.nameJapDeductSS || 0,
    malaLogSS: App.S.malaLogSS || [],
    historyRam: App.S.historyRam || {},
    timerHistoryRam: App.S.timerHistoryRam || {},
    dtRam: App.S.dtRam || 0,
    ltRam: App.S.ltRam || 0,
    nameJapDeductRam: App.S.nameJapDeductRam || 0,
    malaLogRam: App.S.malaLogRam || [],
    dedications: App.S.dedications || [],
    gaudiyaMode: App.S.gaudiyaMode || false,
    trahimamMode: App.S.trahimamMode || false,
    ramanandiMode: App.S.ramanandiMode || false,
    dt28Cycles: App.S.dt28Cycles || 0,
    milestones: App.S.milestones || { reached: {}, lastChecked: 0 },
    msConsider: App.S.msConsider || { radha: true, rv: true, hk: true, kv: true, ss: true, ram: true, n28: true },
    lbOptIn: App.S.lbOptIn || false,
    driveBackupDailyEnabled: App.S.driveBackupDailyEnabled || false,
    driveBackupHour: App.S.driveBackupHour ?? 3,
    driveBackupMinute: App.S.driveBackupMinute ?? 0,
    lbDisplayName: App.S.lbDisplayName || "",
    bgRadhaVallabh: App.S.bgRadhaVallabh ?? 1,
    bgHitju: App.S.bgHitju ?? 1,
    bgGurudev: App.S.bgGurudev ?? 1,
    bgIskconAcharya: App.S.bgIskconAcharya ?? 1,
    bgIskconGurudev: App.S.bgIskconGurudev ?? 1,
    bgCM: App.S.bgCM ?? 1,
    // Screen Time was previously never pushed here — it survived on-device
    // (IndexedDB) but reset to 0 on a fresh install / other device, making
    // Efficiency look inverted (Actual Jap Time synced, Screen Time didn't).
    screenTimeHistory: App.S.screenTimeHistory || {},
    stotramTimeHistory: App.S.stotramTimeHistory || {},
    manualJapCount: App.S.manualJapCount || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
    manualJapTime: App.S.manualJapTime || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
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
    // Write CONFIRMED by Firestore — safe to clear both the foreground-only
    // marker and the one shared with the Background Runner, so neither
    // retries something that already landed.
    try { localStorage.removeItem("rjap_sync_pending"); } catch (_e) {}
    try {
      if (window.Capacitor?.Plugins?.CapacitorKV) {
        await window.Capacitor.Plugins.CapacitorKV.set({ key: "bgsync_pending_since", value: "" });
      }
    } catch (_e) {}
    // Stage a plain-JSON copy (minus the serverTimestamp sentinel, which
    // can't be serialized) for the native Background Runner. This is the
    // "last known good" snapshot it will re-push if the app stays closed
    // for a long stretch and this device never got a chance to sync.
    if (window.Capacitor?.Plugins?.CapacitorKV) {
      try {
        const kvPayload = { ...payload };
        delete kvPayload.lastSync; // FieldValue sentinel — not JSON-safe
        await window.Capacitor.Plugins.CapacitorKV.set({
          key: "bgsync_payload",
          value: JSON.stringify(kvPayload),
        });
      } catch (_) {}
      // Also stage today's full backup JSON (same shape exportAllData()
      // writes to a local file) for the daily Google Drive backup — only
      // if the person has opted in via the Settings toggle. The
      // Background Runner picks this up once a day (its periodicSync
      // interval) and uploads it via the driveBackupUpload Cloud Function
      // — no extra date-gating needed here, the OS-scheduled interval
      // already provides the "once a day" cadence.
      if (App.S.driveBackupDailyEnabled) {
        try {
          await window.Capacitor.Plugins.CapacitorKV.set({
            key: "bgsync_drive_payload",
            value: JSON.stringify(_buildBackupPayload()),
          });
        } catch (_) {}
      }
    }
    // ── Push leaderboard entry if opted in ──
    // Only announce this device as "present" on the Family Board AFTER
    // the authoritative history doc above was actually confirmed — a
    // separate, smaller leaderboard write must never succeed on its own
    // and imply the full sync did too. That mismatch (leaderboard fine,
    // real history doc silently behind) is exactly what made missing days
    // invisible until a device switch.
    pushLeaderboard().catch((e) => console.warn('pushLeaderboard (post-tap) error:', e && e.message));
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
    // Both pending markers are deliberately left set here — the next
    // successful cloud hydration (_rjapMaybeRetryPendingSync, see
    // fbApplyRemote) and the Background Runner will both keep trying
    // until a push actually succeeds.
    // The write may still land in the background — fbWithTimeout only
    // abandons waiting on it, it doesn't cancel the underlying Firestore
    // request. The pending markers below (already set elsewhere in this
    // function's surrounding scope) mean the existing Background Runner /
    // _rjapMaybeRetryPendingSync retry system will keep trying regardless.
    setSyncPill("error", "☁️ Still syncing in background…");
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
  if (d.nameJapDeduct28 !== undefined) App.S.nameJapDeduct28 = d.nameJapDeduct28;
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
  // Only apply malaLog from Firebase if it belongs to today; if it doesn't,
  // leave local untouched rather than clearing it.
  if ("malaLog" in d) {
    const remoteMalaLog = d.malaLog || [];
    const remoteMalaDate = d.malaLogDate || null;
    if (remoteMalaDate === App.S.tk) {
      // Guard against a stale/older remote snapshot (async save race) wiping
      // out newer local mala entries and making Today's Jap Time jump backward.
      // Only accept the remote log if it actually carries MORE total time
      // than what's already local — otherwise keep the fuller local log.
      const localSum = (App.S.malaLog || []).reduce((a, b) => a + b, 0);
      const remoteSum = remoteMalaLog.reduce((a, b) => a + b, 0);
      if (remoteSum >= localSum) {
        App.S.malaLog = JSON.parse(JSON.stringify(remoteMalaLog));
      }
      // else: keep local malaLog as-is (it's more complete)
    }
    // else: remote belongs to a different day than local's current "today"
    // (a stale/out-of-order snapshot, or another device hasn't rolled over
    // yet). NEVER clear local malaLog here — that was the bug: a
    // date-mismatched snapshot arriving mid-session would wipe today's
    // already-recorded malas from this widget while activityLog (which the
    // "Per Mala" history table reads from) stayed intact, making the two
    // views disagree on how many malas were done today. Clearing malaLog
    // for a genuine new day is the midnight-rollover interval's job, not
    // this remote-apply path.
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
  // Only apply malaLogRV from Firebase if it belongs to today; never clear
  // local on a date mismatch (see malaLog fix above for why).
  if ("malaLogRV" in d) {
    const remoteMalaLogRV = d.malaLogRV || [];
    const remoteMalaDate = d.malaLogDate || null;
    if (remoteMalaDate === App.S.tk) {
      const localSum = (App.S.malaLogRV || []).reduce((a, b) => a + b, 0);
      const remoteSum = remoteMalaLogRV.reduce((a, b) => a + b, 0);
      if (remoteSum >= localSum) {
        App.S.malaLogRV = JSON.parse(JSON.stringify(remoteMalaLogRV));
      }
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
  if (d.msConsider) {
    App.S.msConsider = { radha: true, rv: true, hk: true, kv: true, n28: true, ...d.msConsider };
  }
  if (d.nameJapDeductHK !== undefined)
    App.S.nameJapDeductHK = d.nameJapDeductHK;
  if (d.gaudiyaMode !== undefined) {
    App.S.gaudiyaMode = d.gaudiyaMode;
    App.S.gaudiyaMode
      ? document.body.classList.add("gaudiya-mode")
      : document.body.classList.remove("gaudiya-mode");
  }
  if (d.trahimamMode !== undefined) {
    App.S.trahimamMode = d.trahimamMode;
    App.S.trahimamMode
      ? document.body.classList.add("trahimam-mode")
      : document.body.classList.remove("trahimam-mode");
  }
  if (d.ramanandiMode !== undefined) {
    App.S.ramanandiMode = d.ramanandiMode;
    App.S.ramanandiMode
      ? document.body.classList.add("ramanandi-mode")
      : document.body.classList.remove("ramanandi-mode");
  }
  // Only apply malaLogHK from Firebase if it belongs to today; never clear
  // local on a date mismatch (see malaLog fix above for why).
  if ("malaLogHK" in d) {
    const remoteMalaLogHK = d.malaLogHK || [];
    const remoteMalaDate2 = d.malaLogDate || null;
    if (remoteMalaDate2 === App.S.tk) {
      const localSum = (App.S.malaLogHK || []).reduce((a, b) => a + b, 0);
      const remoteSum = remoteMalaLogHK.reduce((a, b) => a + b, 0);
      if (remoteSum >= localSum) {
        App.S.malaLogHK = JSON.parse(JSON.stringify(remoteMalaLogHK));
      }
    }
  }
  // KV fields
  if ("historyKV" in d)
    App.S.historyKV = JSON.parse(JSON.stringify(d.historyKV || {}));
  if ("timerHistoryKV" in d)
    App.S.timerHistoryKV = JSON.parse(JSON.stringify(d.timerHistoryKV || {}));
  if (d.dtKV !== undefined) App.S.dtKV = d.dtKV;
  if (d.ltKV !== undefined) App.S.ltKV = d.ltKV;
  if (d.nameJapDeductKV !== undefined)
    App.S.nameJapDeductKV = d.nameJapDeductKV;
  // Only apply malaLogKV from Firebase if it belongs to today; never clear
  // local on a date mismatch (see malaLog fix above for why).
  if ("malaLogKV" in d) {
    const remoteMalaLogKV = d.malaLogKV || [];
    const remoteMalaDate3 = d.malaLogDate || null;
    if (remoteMalaDate3 === App.S.tk) {
      const localSum = (App.S.malaLogKV || []).reduce((a, b) => a + b, 0);
      const remoteSum = remoteMalaLogKV.reduce((a, b) => a + b, 0);
      if (remoteSum >= localSum) {
        App.S.malaLogKV = JSON.parse(JSON.stringify(remoteMalaLogKV));
      }
    }
  }
  // SS fields
  if ("historySS" in d)
    App.S.historySS = JSON.parse(JSON.stringify(d.historySS || {}));
  if ("timerHistorySS" in d)
    App.S.timerHistorySS = JSON.parse(JSON.stringify(d.timerHistorySS || {}));
  if (d.dtSS !== undefined) App.S.dtSS = d.dtSS;
  if (d.ltSS !== undefined) App.S.ltSS = d.ltSS;
  if (d.nameJapDeductSS !== undefined)
    App.S.nameJapDeductSS = d.nameJapDeductSS;
  // Only apply malaLogSS from Firebase if it belongs to today; never clear
  // local on a date mismatch (see malaLog fix above for why).
  if ("malaLogSS" in d) {
    const remoteMalaLogSS = d.malaLogSS || [];
    const remoteMalaDate4 = d.malaLogDate || null;
    if (remoteMalaDate4 === App.S.tk) {
      const localSum = (App.S.malaLogSS || []).reduce((a, b) => a + b, 0);
      const remoteSum = remoteMalaLogSS.reduce((a, b) => a + b, 0);
      if (remoteSum >= localSum) {
        App.S.malaLogSS = JSON.parse(JSON.stringify(remoteMalaLogSS));
      }
    }
  }
  // Ram fields
  if ("historyRam" in d)
    App.S.historyRam = JSON.parse(JSON.stringify(d.historyRam || {}));
  if ("timerHistoryRam" in d)
    App.S.timerHistoryRam = JSON.parse(JSON.stringify(d.timerHistoryRam || {}));
  if (d.dtRam !== undefined) App.S.dtRam = d.dtRam;
  if (d.ltRam !== undefined) App.S.ltRam = d.ltRam;
  if (d.nameJapDeductRam !== undefined)
    App.S.nameJapDeductRam = d.nameJapDeductRam;
  // Only apply malaLogRam from Firebase if it belongs to today; never clear
  // local on a date mismatch (see malaLog fix above for why).
  if ("malaLogRam" in d) {
    const remoteMalaLogRam = d.malaLogRam || [];
    const remoteMalaDate5 = d.malaLogDate || null;
    if (remoteMalaDate5 === App.S.tk) {
      const localSum = (App.S.malaLogRam || []).reduce((a, b) => a + b, 0);
      const remoteSum = remoteMalaLogRam.reduce((a, b) => a + b, 0);
      if (remoteSum >= localSum) {
        App.S.malaLogRam = JSON.parse(JSON.stringify(remoteMalaLogRam));
      }
    }
  }
  if ("dedications" in d && Array.isArray(d.dedications)) {
    // Union-merge by id (never raw-overwrite): a dedication that only
    // exists locally (e.g. just added, push not yet landed in Firestore,
    // or added on another device whose push we haven't seen yet) must
    // never disappear just because this particular cloud snapshot
    // doesn't contain it yet. Where both sides have the same id, prefer
    // whichever copy was edited more recently (falls back to keeping the
    // local copy if neither has a ts to compare).
    const localList = App.S.dedications || [];
    const byId = new Map(localList.map((x) => [x.id, x]));
    d.dedications.forEach((remote) => {
      if (!remote || !remote.id) return;
      const local = byId.get(remote.id);
      if (!local) {
        byId.set(remote.id, remote);
      } else {
        const localTs = local._editedTs || local.ts || 0;
        const remoteTs = remote._editedTs || remote.ts || 0;
        if (remoteTs > localTs) byId.set(remote.id, remote);
      }
    });
    App.S.dedications = JSON.parse(JSON.stringify(Array.from(byId.values())));
  }
  if (d.sadhanaStart) {
    App.S.sadhanaStart = d.sadhanaStart;
    localStorage.setItem("rjap_sadhana_start", d.sadhanaStart);
    const inp = document.getElementById("msSadhanaStart");
    if (inp) inp.value = d.sadhanaStart;
  }
  // Leaderboard & Photo settings
  if (d.lbOptIn !== undefined) App.S.lbOptIn = d.lbOptIn;
  if (d.driveBackupDailyEnabled !== undefined) App.S.driveBackupDailyEnabled = d.driveBackupDailyEnabled;
  if (d.driveBackupHour !== undefined) App.S.driveBackupHour = d.driveBackupHour;
  if (d.driveBackupMinute !== undefined) App.S.driveBackupMinute = d.driveBackupMinute;
  if (d.lbDisplayName !== undefined) App.S.lbDisplayName = d.lbDisplayName;
  if (d.bgRadhaVallabh !== undefined) App.S.bgRadhaVallabh = d.bgRadhaVallabh;
  if (d.bgHitju !== undefined) App.S.bgHitju = d.bgHitju;
  if (d.bgGurudev !== undefined) App.S.bgGurudev = d.bgGurudev;
  if (d.bgIskconAcharya !== undefined) App.S.bgIskconAcharya = d.bgIskconAcharya;
  if (d.bgIskconGurudev !== undefined) App.S.bgIskconGurudev = d.bgIskconGurudev;
  if (d.bgCM !== undefined) App.S.bgCM = d.bgCM;

  // Old saves wrote both startDate AND endDate to occasions. Remove the endDate entry

  if (!App.S.historyRV) App.S.historyRV = {};
  if (!App.S.timerHistoryRV) App.S.timerHistoryRV = {};
  if (!App.S.historyRV[App.S.tk]) App.S.historyRV[App.S.tk] = 0;
  if (!App.S.timerHistoryRV[App.S.tk]) App.S.timerHistoryRV[App.S.tk] = 0;
  if (!App.S.historyKV) App.S.historyKV = {};
  if (!App.S.timerHistoryKV) App.S.timerHistoryKV = {};
  if (!App.S.historyKV[App.S.tk]) App.S.historyKV[App.S.tk] = 0;
  if (!App.S.timerHistoryKV[App.S.tk]) App.S.timerHistoryKV[App.S.tk] = 0;
  if (!App.S.historySS) App.S.historySS = {};
  if (!App.S.timerHistorySS) App.S.timerHistorySS = {};
  if (!App.S.historySS[App.S.tk]) App.S.historySS[App.S.tk] = 0;
  if (!App.S.timerHistorySS[App.S.tk]) App.S.timerHistorySS[App.S.tk] = 0;
  if (!App.S.historyRam) App.S.historyRam = {};
  if (!App.S.timerHistoryRam) App.S.timerHistoryRam = {};
  if (!App.S.historyRam[App.S.tk]) App.S.historyRam[App.S.tk] = 0;
  if (!App.S.timerHistoryRam[App.S.tk]) App.S.timerHistoryRam[App.S.tk] = 0;
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
  // Screen Time / manual-jap tracking — per-day-key values only ever grow,
  // so merge remote+local by taking the max per key (same rule used for the
  // local IDB/localStorage merge in App.load()) rather than overwriting.
  (function _mergeMaxByDate(remoteObj, localKeyGetter, localKeySetter) {
    const remote = remoteObj || {};
    const local = localKeyGetter() || {};
    const merged = { ...local };
    for (const k in remote) {
      merged[k] = Math.max(remote[k] || 0, merged[k] || 0);
    }
    localKeySetter(merged);
  })(d.screenTimeHistory, () => App.S.screenTimeHistory, (v) => (App.S.screenTimeHistory = v));
  (function _mergeMaxByDate(remoteObj, localKeyGetter, localKeySetter) {
    const remote = remoteObj || {};
    const local = localKeyGetter() || {};
    const merged = { ...local };
    for (const k in remote) {
      merged[k] = Math.max(remote[k] || 0, merged[k] || 0);
    }
    localKeySetter(merged);
  })(d.stotramTimeHistory, () => App.S.stotramTimeHistory, (v) => (App.S.stotramTimeHistory = v));
  if (d.manualJapCount) {
    if (!App.S.manualJapCount) App.S.manualJapCount = { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} };
    for (const typeKey of Object.keys(d.manualJapCount)) {
      const remote = d.manualJapCount[typeKey] || {};
      const local = App.S.manualJapCount[typeKey] || {};
      const merged = { ...local };
      for (const k in remote) merged[k] = Math.max(remote[k] || 0, merged[k] || 0);
      App.S.manualJapCount[typeKey] = merged;
    }
  }
  if (d.manualJapTime) {
    if (!App.S.manualJapTime) App.S.manualJapTime = { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} };
    for (const typeKey of Object.keys(d.manualJapTime)) {
      const remote = d.manualJapTime[typeKey] || {};
      const local = App.S.manualJapTime[typeKey] || {};
      const merged = { ...local };
      for (const k in remote) merged[k] = Math.max(remote[k] || 0, merged[k] || 0);
      App.S.manualJapTime[typeKey] = merged;
    }
  }
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
  if (App.S.trahimamMode) document.body.classList.add("trahimam-mode");
  if (App.S.ramanandiMode) document.body.classList.add("ramanandi-mode");
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
  _rjapMaybeRetryPendingSync();
}

// If a previous session ended (app killed by the OS, connection dropped,
// battery-optimizer suspended the WebView, etc.) before its last change was
// CONFIRMED written to Firestore, a pending marker is still set from that
// session — either in localStorage (this device's own foreground marker)
// or in CapacitorKV (the store shared with the Background Runner, which
// can catch a case even the localStorage marker missed, e.g. the process
// dying before that synchronous line ever ran). Once we're freshly
// connected and cloud-hydrated again, retry immediately instead of
// silently waiting for the next tap — that silent wait is exactly how
// days went missing before.
function _rjapMaybeRetryPendingSync() {
  if (!fbUser || !App._cloudHydrated || App._suspendCloudSync) return;
  if (typeof isGhostMode === "function" && isGhostMode()) return;
  const retry = () => { if (typeof fbPushFull === "function") fbPushFull().catch(() => {}); };
  let localPending = false;
  try { localPending = !!localStorage.getItem("rjap_sync_pending"); } catch (_e) {}
  if (localPending) { retry(); return; }
  if (window.Capacitor?.Plugins?.CapacitorKV) {
    window.Capacitor.Plugins.CapacitorKV.get({ key: "bgsync_pending_since" })
      .then((r) => { if (r && r.value) retry(); })
      .catch(() => {});
  }
}

// A Firestore get() can hang indefinitely on some networks/devices —
// neither resolving nor rejecting (bad wifi, captive portal, a stuck
// offline-persistence lock, etc). Without a timeout, that leaves
// App._cloudHydrated stuck false forever: the "Loading from cloud…" pill
// never updates, and every push guard (fbPushFull, App.save's cloud
// branch) silently no-ops for the rest of the session — even a manual
// JSON restore can't reach Firebase. This forces a bounded wait so a
// hang always surfaces as a normal failure and triggers the existing
// retry/backoff (_scheduleHydrationRetry) instead of hanging forever.
function fbWithTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error((label || "operation") + " timed out after " + ms + "ms"));
    }, ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
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
        Object.values(App.S.historyKV || {}).some(v => v > 0) ||
        Object.values(App.S.historySS || {}).some(v => v > 0) ||
        (App.S.dt || 0) > 0 || (App.S.dtRV || 0) > 0 || (App.S.dtHK || 0) > 0 || (App.S.dtKV || 0) > 0 || (App.S.dtSS || 0) > 0;
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
        try { snap2 = await fbWithTimeout(docRef.get({ source: "server" }), 15000, "Cloud pull retry"); } catch (_) {}
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
      const localHistoryKV    = JSON.parse(JSON.stringify(App.S.historyKV    || {}));
      const localHistorySS    = JSON.parse(JSON.stringify(App.S.historySS    || {}));
      const localHistoryRam   = JSON.parse(JSON.stringify(App.S.historyRam   || {}));
      const localTimerHistoryRV = JSON.parse(JSON.stringify(App.S.timerHistoryRV || {}));
      const localTimerHistoryHK = JSON.parse(JSON.stringify(App.S.timerHistoryHK || {}));
      const localTimerHistoryKV = JSON.parse(JSON.stringify(App.S.timerHistoryKV || {}));
      const localTimerHistorySS = JSON.parse(JSON.stringify(App.S.timerHistorySS || {}));
      const localTimerHistoryRam = JSON.parse(JSON.stringify(App.S.timerHistoryRam || {}));
      const localDt   = App.S.dt   || 0;
      const localDtRV = App.S.dtRV || 0;
      const localDtHK = App.S.dtHK || 0;
      const localDtKV = App.S.dtKV || 0;
      const localDtSS = App.S.dtSS || 0;
      const localDtRam = App.S.dtRam || 0;

      // Cloud data exists — apply it (overrides local cache)
      fbApplyRemote({ ...snap.data(), deviceId: null });
      App._cloudHydrated = true; // cloud copy applied, future saves may push

      // ghost mode fixes: own-state capture guard + force-restore signal — if a developer force-
      // restored this account (via Ghost Mode) more recently than this
      // device has already acknowledged, skip the offline-preservation
      // merge below for this ONE hydration so the restore actually
      // takes effect. Self-expiring: normal protective merge behavior
      // resumes on every hydration after this one.
      const _forceRestoreAt = App.S.devForceRestoreAt || 0;
      const _alreadyAckedRestore = App.S._lastAckedRestoreAt || 0;
      const _skipOfflineMerge = _forceRestoreAt > _alreadyAckedRestore;
      if (_skipOfflineMerge) {
        App.S._lastAckedRestoreAt = _forceRestoreAt;
      }

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
      if (!_skipOfflineMerge) {
        mergeMax(localHistory,        App.S.history);
        mergeMax(localH28,            App.S.h28);
        mergeMax(localTimerHistory,   App.S.timerHistory);
        mergeMax(localHistoryRV,      App.S.historyRV);
        mergeMax(localHistoryHK,      App.S.historyHK);
        mergeMax(localHistoryKV,      App.S.historyKV);
        mergeMax(localHistorySS,      App.S.historySS);
        mergeMax(localHistoryRam,     App.S.historyRam);
        mergeMax(localTimerHistoryRV, App.S.timerHistoryRV);
        mergeMax(localTimerHistoryHK, App.S.timerHistoryHK);
        mergeMax(localTimerHistoryKV, App.S.timerHistoryKV);
        mergeMax(localTimerHistorySS, App.S.timerHistorySS);
        mergeMax(localTimerHistoryRam, App.S.timerHistoryRam);
        // Also preserve higher dt (lifetime jap seconds) if local is ahead
        if (localDt   > App.S.dt)   { App.S.dt   = localDt;   offlineWorkFound = true; }
        if (localDtRV > App.S.dtRV) { App.S.dtRV = localDtRV; offlineWorkFound = true; }
        if (localDtHK > App.S.dtHK) { App.S.dtHK = localDtHK; offlineWorkFound = true; }
        if (localDtKV > App.S.dtKV) { App.S.dtKV = localDtKV; offlineWorkFound = true; }
        if (localDtSS > App.S.dtSS) { App.S.dtSS = localDtSS; offlineWorkFound = true; }
        if (localDtRam > App.S.dtRam) { App.S.dtRam = localDtRam; offlineWorkFound = true; }
      }

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
  if (typeof window._markHydrationRecovered === "function") window._markHydrationRecovered();
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
let _fbMaxWaitTimer = null;
let _fbLastPushAt = 0;
let _bgStageLastAt = 0;
const FB_DEBOUNCE_MS = 3000;
const FB_MAX_WAIT_MS = 5000; // force a push at least this often during continuous tapping

function fbDebouncedPush() {
  if (!fbUser) return;
  // v154: hard belt-and-suspenders guard. Even if some future tap path forgets
  // its own isGhostMode() check, no ghost-mode write will ever reach Firestore
  // and imprint the viewed user's data onto the developer's own profile.
  if (typeof isGhostMode === "function" && isGhostMode()) return;

  // ── Durability against an instant app-kill ──
  // Mark that this device has changes not yet CONFIRMED in Firestore right
  // NOW, at the moment a push is first scheduled — not 3 seconds from now
  // when the debounce timer below actually fires. If the OS kills the
  // process in that 3s window (aggressive battery-optimizer OEMs do this
  // routinely), the debounce timer never runs and NOTHING would otherwise
  // have been staged for the Background Runner to find on its next wake.
  try { localStorage.setItem("rjap_sync_pending", String(Date.now())); } catch (_e) {}
  // Also refresh the Background Runner's fallback snapshot, in the ONE
  // store both this WebView and the Runner's isolated sandbox actually
  // share (CapacitorKV) — throttled to roughly once/second so a fast
  // tapping burst doesn't hammer the native bridge, while still shrinking
  // the "died before anything was staged" window from ~3s down to ~1s.
  const _bgNow = Date.now();
  if (_bgNow - _bgStageLastAt > 1000) {
    _bgStageLastAt = _bgNow;
    try {
      if (window.Capacitor?.Plugins?.CapacitorKV && typeof _buildBackupPayload === "function") {
        const kv = _buildBackupPayload();
        delete kv._version;
        delete kv._exported;
        window.Capacitor.Plugins.CapacitorKV.set({ key: "bgsync_payload", value: JSON.stringify(kv) }).catch(() => {});
        window.Capacitor.Plugins.CapacitorKV.set({ key: "bgsync_pending_since", value: String(_bgNow) }).catch(() => {});
      }
    } catch (_e) {}
  }

  clearTimeout(_fbDeb);
  _fbDeb = setTimeout(() => _fbDoPush(), FB_DEBOUNCE_MS);

  // Max-wait guarantee: during a long burst of rapid taps (e.g. 108 taps in
  // under a minute), the short debounce above keeps getting reset and may
  // never fire. This separate timer ensures a push still happens at least
  // every FB_MAX_WAIT_MS, so ghost mode / leaderboard never fall far behind
  // a live, fast-tapping session.
  if (!_fbMaxWaitTimer) {
    _fbMaxWaitTimer = setTimeout(() => _fbDoPush(), FB_MAX_WAIT_MS);
  }
}

function _fbDoPush() {
  clearTimeout(_fbDeb);
  _fbDeb = null;
  clearTimeout(_fbMaxWaitTimer);
  _fbMaxWaitTimer = null;
  _fbLastPushAt = Date.now();
  if (typeof isGhostMode === "function" && isGhostMode()) return;
  if (!fbUser) return;
  fbPushDelta().catch(() => {});
}

// Force an immediate flush of any pending debounced push the moment the app
// is backgrounded, tab-switched, or closed — otherwise a pending timer
// can get silently dropped by the OS, leaving Firestore (and therefore
// ghost mode + the leaderboard) stuck on stale data until the next tap.
function _fbFlushPendingPush() {
  if (!_fbDeb && !_fbMaxWaitTimer) return;
  _fbDoPush();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") _fbFlushPendingPush();
});
window.addEventListener("pagehide", _fbFlushPendingPush);
window.addEventListener("beforeunload", _fbFlushPendingPush);

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
  wrap.style.display = "flex";
  const todCycles = Math.floor(todJaps / 28);
  const inCycle = todJaps % 28;
  if (target) {
    const rawPct = Math.round((todJaps / target) * 100);
    const barPct = Math.min(100, rawPct); // bar fill capped at 100% visually
    if (bar) {
      bar.style.width = barPct + "%";
      if (rawPct >= 100) {
        bar.style.background = "linear-gradient(90deg,#FFD700,rgba(46,204,113,0.95),#FFD700)";
        bar.style.backgroundSize = "200% 100%";
        bar.style.boxShadow = "0 0 14px rgba(255,215,0,0.7), 0 0 6px rgba(46,204,113,0.5)";
        bar.style.animation = "barOverflow 1.8s ease-in-out infinite";
      } else {
        bar.style.background = "linear-gradient(90deg,rgba(189,147,249,0.8),rgba(150,80,255,0.9))";
        bar.style.backgroundSize = "";
        bar.style.boxShadow = "0 0 8px rgba(189,147,249,0.5)";
        bar.style.animation = "none";
      }
    }
    if (lbl) {
      lbl.textContent = todCycles + " cycle" + (todCycles === 1 ? "" : "s") + " · " + inCycle + "/28 · " + rawPct + "%";
      lbl.style.color = rawPct >= 100 ? "#FFD700" : "#BD93F9";
      lbl.style.fontWeight = rawPct >= 100 ? "800" : "700";
    }
  } else {
    const num = inCycle === 0 && todCycles > 0 ? 28 : inCycle;
    const pct = Math.round((num / 28) * 100);
    if (bar) {
      bar.style.width = Math.min(100, pct) + "%";
      bar.style.background = "linear-gradient(90deg,rgba(189,147,249,0.8),rgba(150,80,255,0.9))";
      bar.style.backgroundSize = "";
      bar.style.boxShadow = "0 0 8px rgba(189,147,249,0.5)";
      bar.style.animation = "none";
    }
    if (lbl) {
      lbl.textContent = todCycles + " cycle" + (todCycles === 1 ? "" : "s") + " · " + inCycle + "/28";
      lbl.style.color = "#BD93F9";
      lbl.style.fontWeight = "700";
    }
  }
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

      // Auto-fit: shrink font until name fits on one line
      function _fitN28FontSize(el) {
        const containerW = el.parentNode ? el.parentNode.getBoundingClientRect().width - 20 : 300;
        const baseSize = Math.min(300, Math.max(120, containerW * 0.38));
        el.style.whiteSpace = "nowrap";
        el.style.wordBreak = "normal";
        el.style.overflowX = "visible";
        el.style.fontSize = baseSize + "px";
        let sz = baseSize;
        while (el.scrollWidth > containerW && sz > 40) {
          sz -= 2;
          el.style.fontSize = sz + "px";
        }
      }
      requestAnimationFrame(() => _fitN28FontSize(nameEl));

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
    const te = document.getElementById("n28CycleTimer"); const _teVis = document.getElementById("n28CycleTimerDisplay");
    const _teAnchor = _teVis || te;
    if (_teAnchor) {
      const rect = _teAnchor.getBoundingClientRect();
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
  // ── PAUSE THE SHARED SESSION TIMER TOO ──────────────────────────────
  // Mirrors malaOk()'s behavior on main-Jap mala completion: the Session
  // timer must stop immediately on cycle completion, not keep ticking
  // until the separate idle auto-pause timeout fires. Invalidate any
  // pending autoStop first (its stale secondsAtTap snapshot must not
  // roll timerSeconds back after we've already paused), then pause.
  clearTimeout(App.autoStopTimeout);
  App._autoStopToken++;
  if (App.timerRunning) App.pauseTimer();
  const ce = document.getElementById("n28CycleTimer"); const _ceVis = document.getElementById("n28CycleTimerDisplay");
  if (ce) ce.textContent = "0:00"; if (_ceVis) _ceVis.textContent = "0:00";
  // Show unified "Today's Jap Time" (same combined total as main Jap tab).
  // NOTE: this used to write App.timerSeconds (the Session timer, active
  // chanting time since app open) directly into the Today's-Jap-Time
  // element. That's a different, much smaller number than the true
  // cumulative total-for-today across all modes, so on every cycle
  // completion the 28 Names "Actual Jap Today" reading would visibly snap
  // to the wrong value for a moment. Route through updateTimerToday() so
  // it gets the correct combined figure (and stays in sync with the main
  // Jap tab), exactly like every other place that updates this display.
  App.updateTimerToday();
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
  if (window.App && window.App.S && window.App.S.cfg && window.App.S.cfg.vib) lcVibrate([80, 40, 80, 40, 200]);
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
  const isFirstEverWish = (App.S.sankalpas || []).length === 0;
  const sk = {
    id: "sk_" + Date.now(),
    wish,
    target,
    startDate: App.S.tk,
    // v2: the very first sankalp ever created starts from 0, not from the
    // current lifetime cycle count — otherwise jap done before the first
    // wish existed would never be credited to any wish, leaving a permanent
    // gap between lifetime total and sum-of-wishes progress.
    startCycles: hasActive ? null : (isFirstEverWish ? 0 : getTotalCycles28()),
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

// ── Edit target: update cycle count for a wish (works on active, queued,
// AND already-fulfilled wishes). If a fulfilled wish's target is raised
// above what was already achieved, the wish is automatically reopened
// so chanting keeps counting toward the new, higher target. ──
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
  const wasDone = sk.done;
  sk.target = newTarget;
  let reopened = false;
  if (wasDone && newTarget > prog) {
    // Raising the target past what was already achieved means the wish
    // isn't actually fulfilled anymore — reopen it and lock in the
    // progress already made as its new baseline.
    sk.done = false;
    sk.doneDate = null;
    sk._savedProgress = prog;
    const activeWish = getActiveSankalp();
    sk.startCycles = activeWish ? null : getTotalCycles28();
    reopened = true;
  }
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  toast(
    reopened
      ? "Target raised to " + newTarget + " — wish reopened 🙏"
      : "Target updated to " + newTarget + " cycles 🙏",
  );
}

// ── Edit wish text — works on active, queued, and fulfilled wishes ──
function editSankalpWish(id) {
  const sk = (App.S.sankalpas || []).find((s) => s.id === id);
  if (!sk) return;
  const el = document.getElementById("sk-wish-edit-" + id);
  if (!el) return;
  const newWish = (el.value || "").trim();
  if (!newWish) {
    toast("ইচ্ছা লিখুন 🙏");
    return;
  }
  sk.wish = newWish;
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  toast("Wish text updated 🙏");
}

// ── Reopen a fulfilled wish without changing its target — e.g. it was
// marked fulfilled by mistake, or you simply want to keep chanting for it ──
function reopenSankalp(id) {
  const sk = (App.S.sankalpas || []).find((s) => s.id === id);
  if (!sk || !sk.done) return;
  sk.done = false;
  sk.doneDate = null;
  const activeWish = getActiveSankalp();
  sk.startCycles = activeWish ? null : getTotalCycles28();
  App.save();
  fbDebouncedPush();
  renderSankalpas();
  toast("↺ Wish reopened 🙏");
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
        '%;' +
        (pct >= 100 ? 'background:linear-gradient(90deg,#FFD700,rgba(46,204,113,0.9),#FFD700);background-size:200% 100%;animation:barOverflow 1.8s ease-in-out infinite;box-shadow:0 0 10px rgba(255,215,0,0.6);' : '') +
        '"></div></div>' +
        '<div class="sk-prog-text" style="' + (pct >= 100 ? 'color:#FFD700;font-weight:700;' : '') + '">' +
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
        '<button class="sk-btn" style="color:#4f4;border-color:rgba(0,255,0,0.4);font-size:11px;background:linear-gradient(180deg,rgba(46,204,113,0.22) 0%,rgba(30,160,80,0.08) 100%);box-shadow:0 2px 8px rgba(46,204,113,0.25)" onclick="adjustSankalpCycles(\'' +
        sk.id +
        "','add')\">＋</button>" +
        '<button class="sk-btn" style="color:#f55;border-color:rgba(255,68,68,0.4);font-size:11px;background:linear-gradient(180deg,rgba(255,68,68,0.18) 0%,rgba(200,30,30,0.08) 100%);box-shadow:0 2px 8px rgba(255,68,68,0.2)" onclick="adjustSankalpCycles(\'' +
        sk.id +
        "','deduct')\">－</button>" +
        "</div>" +
        '<div class="sk-btns"><button class="sk-btn grn" onclick="fulfillSankalp(\'' +
        sk.id +
        "')\">✓ Fulfilled</button>" +
        '<button class="sk-btn" style="color:#f55;border-color:rgba(255,68,68,0.5);background:linear-gradient(180deg,rgba(255,68,68,0.18) 0%,rgba(200,30,30,0.08) 100%);box-shadow:0 2px 8px rgba(255,68,68,0.2)" onclick="deleteSankalp(\'' +
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
            '%;' +
            (qPct >= 100 ? 'background:linear-gradient(90deg,#FFD700,rgba(46,204,113,0.9),#FFD700);background-size:200% 100%;animation:barOverflow 1.8s ease-in-out infinite;box-shadow:0 0 10px rgba(255,215,0,0.6);' : '') +
            '"></div></div><div class="sk-prog-text" style="' + (qPct >= 100 ? 'color:#FFD700;font-weight:700;' : '') + '">' +
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
        '<button class="sk-btn" style="color:#4f4;border-color:rgba(0,255,0,0.4);font-size:11px;background:linear-gradient(180deg,rgba(46,204,113,0.22) 0%,rgba(30,160,80,0.08) 100%);box-shadow:0 2px 8px rgba(46,204,113,0.25)" onclick="adjustSankalpCycles(\'' +
        sk.id +
        "','add')\">＋</button>" +
        '<button class="sk-btn" style="color:#f55;border-color:rgba(255,68,68,0.4);font-size:11px;background:linear-gradient(180deg,rgba(255,68,68,0.18) 0%,rgba(200,30,30,0.08) 100%);box-shadow:0 2px 8px rgba(255,68,68,0.2)" onclick="adjustSankalpCycles(\'' +
        sk.id +
        "','deduct')\">－</button>" +
        "</div>" +
        '<div class="sk-btns">' +
        (idx > 0
          ? '<button class="sk-btn" style="color:var(--a2);border-color:rgba(74,144,226,0.4)" onclick="prioritizeSankalp(\'' +
            sk.id +
            "')\">⬆ Prioritize</button>"
          : "") +
        '<button class="sk-btn" style="color:#f55;border-color:rgba(255,68,68,0.5);background:linear-gradient(180deg,rgba(255,68,68,0.18) 0%,rgba(200,30,30,0.08) 100%);box-shadow:0 2px 8px rgba(255,68,68,0.2)" onclick="deleteSankalp(\'' +
        sk.id +
        "')\">✕ Delete Wish</button></div>" +
        "</div>";
    }
  });
  if (done.length) {
    html += '<div class="sk-divider">✨ Fulfilled Sankalpas ✨</div>';
    done.forEach((sk) => {
      const finalProg = getSankalpProgressById(sk.id, null);
      html +=
        '<div class="sk-item done">' +
        '<div class="sk-done-badge">✓ Fulfilled · ' +
        sk.doneDate +
        "</div>" +
        '<div class="sk-wish" style="color:var(--td)">' +
        escHtml(sk.wish) +
        "</div>" +
        '<div class="sk-meta">Target: <strong style="color:var(--tl)">' +
        sk.target +
        "</strong> cycles</div>" +
        // Edit wish text
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;padding:7px 9px;background:rgba(255,255,255,0.03);border-radius:8px">' +
        '<span style="font-size:11px;color:var(--td);flex:1">✏ Edit wish text:</span>' +
        "</div>" +
        '<textarea id="sk-wish-edit-' +
        sk.id +
        '" class="sk-ta" style="min-height:44px;margin-bottom:6px">' +
        escHtml(sk.wish) +
        "</textarea>" +
        '<div style="display:flex;justify-content:flex-end;margin-bottom:10px">' +
        '<button class="sk-btn grn" onclick="editSankalpWish(\'' +
        sk.id +
        "')\">Save Text</button>" +
        "</div>" +
        // Edit target (raising it above what was achieved reopens the wish)
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;padding:7px 9px;background:rgba(255,255,255,0.03);border-radius:8px">' +
        '<span style="font-size:11px;color:var(--td);flex:1">✏ Change target:</span>' +
        '<input id="sk-edit-' +
        sk.id +
        '" type="number" min="' +
        Math.max(1, finalProg) +
        '" value="' +
        sk.target +
        '" style="width:64px;background:rgba(0,0,0,0.35);border:1px solid rgba(120,120,120,0.3);border-radius:7px;padding:5px 8px;color:var(--tl);font-size:13px;text-align:center;font-family:Inter,sans-serif">' +
        '<button class="sk-btn grn" onclick="editSankalpTarget(\'' +
        sk.id +
        "')\">Save</button>" +
        "</div>" +
        '<div class="sk-btns">' +
        '<button class="sk-btn" style="color:var(--a2);border-color:rgba(74,144,226,0.4)" onclick="reopenSankalp(\'' +
        sk.id +
        "')\">↺ Reopen Wish</button>" +
        '<button class="sk-btn grey" onclick="deleteSankalp(\'' +
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
  const panel = document.getElementById("n28StatsCollapse");
  const chev = document.getElementById("n28StatsChev");
  const open = panel ? panel.classList.toggle("open") : false;
  if (chev) chev.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
  if (open) render28StatsPanel();
}

// Called from u28() to keep stats panel live when open
function refresh28StatsIfOpen() {
  const panel = document.getElementById("n28StatsCollapse");
  if (panel && panel.classList.contains("open")) render28StatsPanel();
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
  const allCyclesRaw = getTotalCycles28();
  const deductCycles = Math.floor((App.S.nameJapDeduct28 || 0) / 28);
  const allCycles = Math.max(0, allCyclesRaw - deductCycles);
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
    // NOTE: no rebase here — today's added cycles are real practice done
    // right now, so they must count toward the active wish's live progress
    // (savedProgress + (getTotalCycles28() - startCycles)), exactly like
    // organic taps do. Rebasing startCycles to the post-update total would
    // silently erase the new cycles from ever reaching the wish.
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
    // NOTE: no rebase here either — deducting today's cycles should reduce
    // the active wish's live progress by the same amount, not leave it
    // untouched (see note above).
  }

  // Optional time taken — only wired for the Add path (the Deduct path has
  // its own dedicated button/function, deduct28CyclesToday(), below).
  const minEl = document.getElementById("addJap28TodayMin");
  const secEl = document.getElementById("addJap28TodaySec");
  let timeSecs = 0;
  if (sign > 0) {
    timeSecs =
      (parseInt(minEl?.value) || 0) * 60 +
      Math.min(59, Math.max(0, parseInt(secEl?.value) || 0));
    if (timeSecs > 0) {
      App.S.timer28History[tk] = (App.S.timer28History[tk] || 0) + timeSecs;
    }
    _recordManualJap("n28", tk, taps, timeSecs);
  }

  document.getElementById("sp28CycleVal").value = "";
  const pr = document.getElementById("sp28CyclePreview");
  if (pr) pr.textContent = "";
  if (minEl) minEl.value = "";
  if (secEl) secEl.value = "";
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
      (timeSecs > 0
        ? " + " + Math.floor(timeSecs / 60) + "m " + (timeSecs % 60) + "s"
        : "") +
      " 🙏",
  );
}

// ── Deduct Today (cycles) — standalone input, mirrors adj28Cycles(-1) ──
function prev28CyclesDed(val) {
  const n = parseInt(val) || 0;
  const el = document.getElementById("sp28CycleDedPreview");
  if (!el) return;
  if (n <= 0) {
    el.textContent = "";
    return;
  }
  const cur = App.S.h28[App.S.tk] || 0;
  const after = Math.max(0, cur - n * 28);
  el.textContent = "Today will become: " + Math.floor(after / 28) + " cycles";
}

function deduct28CyclesToday() {
  const n = parseInt(document.getElementById("sp28CycleDedVal").value) || 0;
  if (n < 1) {
    toast("Enter number of cycles");
    return;
  }
  const taps = n * 28;
  const tk = App.S.tk;
  const cur = App.S.h28[tk] || 0;
  if (taps > cur) {
    toast("Cannot deduct more than today's count");
    return;
  }

  (App.S.sankalpas || [])
    .filter((s) => !s.done && s.startCycles !== null)
    .forEach((s) => {
      s._savedProgress =
        (s._savedProgress || 0) +
        Math.max(0, getTotalCycles28() - s.startCycles);
      s.startCycles = getTotalCycles28();
    });

  App.S.h28[tk] = cur - taps;
  App.lm28 = Math.floor(App.S.h28[tk] / (App.S.ms || 108));
  // NOTE: no rebase here — deducting today's cycles should reduce the
  // active wish's live progress by the same amount (see adj28Cycles).

  // Optional time to deduct — directly subtract from today's 28 Names timer
  const minEl = document.getElementById("deductJap28TodayMin");
  const secEl = document.getElementById("deductJap28TodaySec");
  const timeSecs =
    (parseInt(minEl?.value) || 0) * 60 +
    Math.min(59, Math.max(0, parseInt(secEl?.value) || 0));
  if (timeSecs > 0) {
    const curTime = App.S.timer28History[tk] || 0;
    App.S.timer28History[tk] = Math.max(0, curTime - timeSecs);
  }

  document.getElementById("sp28CycleDedVal").value = "";
  const pr = document.getElementById("sp28CycleDedPreview");
  if (pr) pr.textContent = "";
  if (minEl) minEl.value = "";
  if (secEl) secEl.value = "";
  render28StatsPanel();
  u28();
  uStats();
  renderSankalpas();
  App.save();
  fbDebouncedPush();
  toast(
    "Deducted " +
      n +
      " cycle" +
      (n > 1 ? "s" : "") +
      (timeSecs > 0
        ? " + " + Math.floor(timeSecs / 60) + "m " + (timeSecs % 60) + "s"
        : "") +
      " 🙏",
  );
}

// ── Add to a specific OTHER day (cycles) ──
function addOtherDayJap28() {
  const dateEl = document.getElementById("addJapOther28Date");
  const inEl = document.getElementById("addJapOther28In");
  const date = dateEl ? dateEl.value : "";
  const n = parseInt(inEl ? inEl.value : 0) || 0;
  if (!date) {
    toast("Pick a date first");
    return;
  }
  if (n < 1) {
    toast("Enter number of cycles");
    return;
  }
  const taps = n * 28;
  if (!App.S.h28) App.S.h28 = {};

  (App.S.sankalpas || [])
    .filter((s) => !s.done && s.startCycles !== null)
    .forEach((s) => {
      s._savedProgress =
        (s._savedProgress || 0) +
        Math.max(0, getTotalCycles28() - s.startCycles);
      s.startCycles = getTotalCycles28();
    });

  App.S.h28[date] = (App.S.h28[date] || 0) + taps;
  if (date === App.S.tk)
    App.lm28 = Math.floor(App.S.h28[date] / (App.S.ms || 108));

  (App.S.sankalpas || [])
    .filter((s) => !s.done && s.startCycles !== null)
    .forEach((s) => {
      s.startCycles = getTotalCycles28();
    });

  // Optional estimated time — directly add to that day's 28 Names timer
  const minEl = document.getElementById("addJapOther28Min");
  const secEl = document.getElementById("addJapOther28Sec");
  const timeSecs =
    (parseInt(minEl?.value) || 0) * 60 +
    Math.min(59, Math.max(0, parseInt(secEl?.value) || 0));
  if (timeSecs > 0) {
    if (!App.S.timer28History) App.S.timer28History = {};
    App.S.timer28History[date] = (App.S.timer28History[date] || 0) + timeSecs;
  }
  _recordManualJap("n28", date, taps, timeSecs);

  if (dateEl) dateEl.value = "";
  if (inEl) inEl.value = "";
  const pr = document.getElementById("addJapOther28Preview");
  if (pr) pr.textContent = "—";
  if (minEl) minEl.value = "";
  if (secEl) secEl.value = "";
  render28StatsPanel();
  u28();
  uStats();
  renderSankalpas();
  ghostAwareSave();
  toast(
    "Added " +
      n +
      " cycle" +
      (n > 1 ? "s" : "") +
      (timeSecs > 0
        ? " + " + Math.floor(timeSecs / 60) + "m " + (timeSecs % 60) + "s"
        : "") +
      " to " +
      date +
      " 🙏",
  );
}

// ── Deduct from a specific OTHER day (cycles) ──
function deductOtherJap28() {
  const dateEl = document.getElementById("deductOther28Date");
  const inEl = document.getElementById("deductOther28In");
  const date = dateEl ? dateEl.value : "";
  const n = parseInt(inEl ? inEl.value : 0) || 0;
  if (!date) {
    toast("Pick a date first");
    return;
  }
  if (n < 1) {
    toast("Enter number of cycles");
    return;
  }
  const taps = n * 28;
  const cur = (App.S.h28 || {})[date] || 0;
  if (taps > cur) {
    toast("Cannot deduct more than that day's count");
    return;
  }

  (App.S.sankalpas || [])
    .filter((s) => !s.done && s.startCycles !== null)
    .forEach((s) => {
      s._savedProgress =
        (s._savedProgress || 0) +
        Math.max(0, getTotalCycles28() - s.startCycles);
      s.startCycles = getTotalCycles28();
    });

  App.S.h28[date] = cur - taps;
  if (date === App.S.tk)
    App.lm28 = Math.floor(App.S.h28[date] / (App.S.ms || 108));

  (App.S.sankalpas || [])
    .filter((s) => !s.done && s.startCycles !== null)
    .forEach((s) => {
      s.startCycles = getTotalCycles28();
    });

  // Optional time to deduct — directly subtract from that day's 28 Names timer
  const minEl = document.getElementById("deductOther28Min");
  const secEl = document.getElementById("deductOther28Sec");
  const timeSecs =
    (parseInt(minEl?.value) || 0) * 60 +
    Math.min(59, Math.max(0, parseInt(secEl?.value) || 0));
  if (timeSecs > 0) {
    if (!App.S.timer28History) App.S.timer28History = {};
    const curTime = App.S.timer28History[date] || 0;
    App.S.timer28History[date] = Math.max(0, curTime - timeSecs);
  }

  if (dateEl) dateEl.value = "";
  if (inEl) inEl.value = "";
  const pr = document.getElementById("deductOther28Preview");
  if (pr) pr.textContent = "—";
  if (minEl) minEl.value = "";
  if (secEl) secEl.value = "";
  render28StatsPanel();
  u28();
  uStats();
  renderSankalpas();
  ghostAwareSave();
  toast(
    "Deducted " +
      n +
      " cycle" +
      (n > 1 ? "s" : "") +
      (timeSecs > 0
        ? " + " + Math.floor(timeSecs / 60) + "m " + (timeSecs % 60) + "s"
        : "") +
      " from " +
      date +
      " 🙏",
  );
}

// ── Before This App (Lifetime) — cycles chanted before installing the app ──
function addPrevJap28() {
  const inEl = document.getElementById("prevJap28In");
  const n = parseInt(inEl ? inEl.value : 0) || 0;
  if (n < 1) {
    toast("Enter number of cycles");
    return;
  }
  const taps = n * 28;
  if (!App.S.h28) App.S.h28 = {};

  (App.S.sankalpas || [])
    .filter((s) => !s.done && s.startCycles !== null)
    .forEach((s) => {
      s._savedProgress =
        (s._savedProgress || 0) +
        Math.max(0, getTotalCycles28() - s.startCycles);
      s.startCycles = getTotalCycles28();
    });

  const prevKey = "prev_" + Date.now();
  App.S.h28[prevKey] = taps;

  (App.S.sankalpas || [])
    .filter((s) => !s.done && s.startCycles !== null)
    .forEach((s) => {
      s.startCycles = getTotalCycles28();
    });

  if (inEl) inEl.value = "";
  const pr = document.getElementById("prevLifetime28Preview");
  if (pr) pr.textContent = "—";
  render28StatsPanel();
  u28();
  uStats();
  renderSankalpas();
  ghostAwareSave();
  toast(
    "Added " + n + " cycle" + (n > 1 ? "s" : "") + " to lifetime total 🙏",
  );
}

// ── Name Jap — Lifetime deduction (bookkeeping offset, doesn't touch h28 or wishes) ──
function addNameJapDeduct28() {
  const inEl = document.getElementById("nameJapDeduct28In");
  const n = parseInt(inEl ? inEl.value : 0) || 0;
  if (n < 1) {
    toast("Enter number of cycles");
    return;
  }
  App.S.nameJapDeduct28 = (App.S.nameJapDeduct28 || 0) + n * 28;
  if (inEl) inEl.value = "";
  const pr = document.getElementById("nameJapDeduct28Preview");
  if (pr) pr.textContent = "—";
  render28StatsPanel();
  uStats();
  ghostAwareSave();
  toast("Deducted " + n + " cycle" + (n > 1 ? "s" : "") + " from lifetime 🙏");
}

function removeNameJapDeduct28() {
  const inEl = document.getElementById("nameJapRestore28In");
  const n = parseInt(inEl ? inEl.value : 0) || 0;
  if (n < 1) {
    toast("Enter number of cycles");
    return;
  }
  const curDeductCyc = Math.floor((App.S.nameJapDeduct28 || 0) / 28);
  if (n > curDeductCyc) {
    toast("Cannot restore more than currently deducted (" + curDeductCyc + ")");
    return;
  }
  App.S.nameJapDeduct28 = Math.max(0, (App.S.nameJapDeduct28 || 0) - n * 28);
  if (inEl) inEl.value = "";
  const pr = document.getElementById("nameJapRestore28Preview");
  if (pr) pr.textContent = "—";
  render28StatsPanel();
  uStats();
  ghostAwareSave();
  toast("Restored " + n + " cycle" + (n > 1 ? "s" : "") + " to lifetime 🙏");
}

// ── Live preview updates for the 28 Names Add/Deduct Other Day, Lifetime,
// and Name Jap Deduct fields (Today Add/Deduct previews are handled by
// prev28Cycles / prev28CyclesDed directly on input) ──
function prevManual28() {
  const aoi = document.getElementById("addJapOther28In");
  const aod = document.getElementById("addJapOther28Date");
  if (aoi && aod) {
    const n = parseInt(aoi.value) || 0;
    const d = aod.value;
    const curCyc = d ? Math.floor(((App.S.h28 || {})[d] || 0) / 28) : 0;
    const el = document.getElementById("addJapOther28Preview");
    if (el) el.textContent = n > 0 && d ? curCyc + n + " cycles" : "—";
  }
  const doi = document.getElementById("deductOther28In");
  const dod = document.getElementById("deductOther28Date");
  if (doi && dod) {
    const n = parseInt(doi.value) || 0;
    const d = dod.value;
    const curCyc = d ? Math.floor(((App.S.h28 || {})[d] || 0) / 28) : 0;
    const el = document.getElementById("deductOther28Preview");
    if (el)
      el.textContent = n > 0 && d ? Math.max(0, curCyc - n) + " cycles" : "—";
  }
  const allCyclesRaw = getTotalCycles28();
  const deductCyc = Math.floor((App.S.nameJapDeduct28 || 0) / 28);
  const lifetimeCyc = Math.max(0, allCyclesRaw - deductCyc);

  const pji = document.getElementById("prevJap28In");
  if (pji) {
    const n = parseInt(pji.value) || 0;
    const el = document.getElementById("prevLifetime28Preview");
    if (el)
      el.textContent =
        n > 0 ? (lifetimeCyc + n).toLocaleString() + " cycles" : "—";
  }

  const njdCur = document.getElementById("nameJapDeduct28Cur");
  if (njdCur) njdCur.textContent = deductCyc.toLocaleString();

  const njdi = document.getElementById("nameJapDeduct28In");
  if (njdi) {
    const n = parseInt(njdi.value) || 0;
    const el = document.getElementById("nameJapDeduct28Preview");
    if (el)
      el.textContent =
        n > 0 ? Math.max(0, lifetimeCyc - n).toLocaleString() + " cycles" : "—";
  }
  const njri = document.getElementById("nameJapRestore28In");
  if (njri) {
    const n = parseInt(njri.value) || 0;
    const restorable = Math.min(n, deductCyc);
    const el = document.getElementById("nameJapRestore28Preview");
    if (el)
      el.textContent =
        n > 0
          ? Math.min(allCyclesRaw, lifetimeCyc + restorable).toLocaleString() +
            " cycles"
          : "—";
  }
}
document.addEventListener("DOMContentLoaded", function () {
  [
    "addJapOther28In",
    "addJapOther28Date",
    "deductOther28In",
    "deductOther28Date",
    "prevJap28In",
    "nameJapDeduct28In",
    "nameJapRestore28In",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", prevManual28);
    if (el) el.addEventListener("change", prevManual28);
  });
});
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

// Sampraday sign icons for the Stotram-folder tiles (Radha Vallabh, Brahma
// Madhva Gaudiya, and Bhagavan Shiv) — embedded as base64 so they load
// instantly with no extra network request, same as the rest of the bundle.
const ST_FOLDER_ICON_IMG = {
  rv: "data:image/png;base64,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",
  bmg: "data:image/png;base64,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",
  shiv: "data:image/png;base64,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"
};

// Apply the same sampraday-sign icons to the Settings mode-selector cards
// (Gaudiya/ISKCON, Gopeshwar Mahadev) — this script tag sits after those
// cards in index.html, so the elements already exist in the DOM here; no
// need to wait for DOMContentLoaded. Ramanandi keeps its 🚩 emoji — no
// sign image supplied for it.
(function () {
  var gi = document.getElementById("gaudiyaModeIcon");
  if (gi) gi.src = ST_FOLDER_ICON_IMG.bmg;
  var ti = document.getElementById("trahimamModeIcon");
  if (ti) ti.src = ST_FOLDER_ICON_IMG.shiv;
})();

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

  const FOLDERS = [
    { key: 'rv',      title: 'রাধা বল্লভ সম্প্রদায়', icon: '🪷', img: ST_FOLDER_ICON_IMG.rv },
    { key: 'krishna', title: 'কৃষ্ণ', icon: '🦚' },
    { key: 'shiv',    title: 'ভগবান শিব', icon: '🔱', img: ST_FOLDER_ICON_IMG.shiv },
    { key: 'bmg',     title: 'ব্রহ্মা মাধ্ব গৌড়ীয় সম্প্রদায়', icon: '🕉️', img: ST_FOLDER_ICON_IMG.bmg },
    { key: 'hanuman', title: 'হনুমান জী মহারাজ', icon: '🚩' },
  ];

  const customItems = (App.S.customSt || []).map((x) => ({ ...x, custom: true }));
  const groups = FOLDERS.map((f) => ({
    ...f,
    items: STLIST.filter((s) => s.cat === f.key),
  }));
  if (customItems.length) {
    groups.push({ key: '__custom', title: 'আমার স্তোত্র', icon: '📝', items: customItems });
  }

  const activeKey = window._stActiveFolder || null;

  // ── Level 1: folder menu (no active folder selected) ──
  if (!activeKey) {
    groups.forEach((group) => {
      const tile = document.createElement('div');
      tile.className = 'st-folder-tile';
      // Sampraday-sign image (rv/shiv/bmg) when we have one, else the emoji.
      const iconHtml = group.img
        ? '<img class="st-folder-tile-icon-img" src="' + group.img + '" alt="" draggable="false" loading="lazy">'
        : '<span class="st-folder-tile-icon">' + group.icon + '</span>';
      tile.innerHTML =
        iconHtml +
        '<span class="st-folder-tile-title">' + escHtml(group.title) + '</span>' +
        '<span class="st-folder-tile-count">' + group.items.length + '</span>' +
        '<span class="st-folder-tile-arrow">›</span>';
      tile.addEventListener('click', () => {
        window._stActiveFolder = group.key;
        renderSt();
      });
      list.appendChild(tile);
    });
    return;
  }

  // ── Level 2: inside a folder — back button + its stotrams ──
  const group = groups.find((g) => g.key === activeKey);
  if (!group) {
    // Folder no longer exists (shouldn't happen) — bail back to menu.
    window._stActiveFolder = null;
    renderSt();
    return;
  }

  const backRow = document.createElement('div');
  backRow.className = 'st-back-row';
  backRow.innerHTML =
    '<button class="st-back-btn">← ফোল্ডার তালিকা</button>' +
    '<span class="st-back-title">' + escHtml(group.title) + '</span>';
  backRow.querySelector('.st-back-btn').addEventListener('click', () => {
    window._stActiveFolder = null;
    renderSt();
  });
  list.appendChild(backRow);

  if (!group.items.length) {
    const empty = document.createElement('div');
    empty.className = 'st-folder-empty';
    empty.textContent = 'শীঘ্রই আসছে 🙏';
    list.appendChild(empty);
    return;
  }

  const glowColors = ['#ffd700','#ffaa00','#ff6bff','#00e5ff','#7dff6b','#ff6b6b','#b388ff','#00ffcc','#ffd700','#ff9d00'];

  let idx = 0;
  group.items.forEach((st) => {
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
    idx++;
  });
}

// ─────────────────────────────────────────────────────────
// DEVELOPER STOTRAM MANAGEMENT
// Developer IDs: drakthephenomenal@gmail.com, drakthephenomenal@proton.me, akthephenomenal@zohomail.com, anupkumarpaulshuvo@gmail.com, radhanamejapcounter@gmail.com, drakthephenomenal@icloud.com
// ─────────────────────────────────────────────────────────
const DEV_IDS = [
  "drakthephenomenal@gmail.com",
  "drakthephenomenal@proton.me",
  "akthephenomenal@zohomail.com",
  "anupkumarpaulshuvo@gmail.com",
  "radhanamejapcounter@gmail.com",
  "drakthephenomenal@icloud.com",
];

function isDeveloper() {
  if (!fbUser) return false;
  const email = (fbUser.email || "").toLowerCase().trim();
  return DEV_IDS.map((e) => e.toLowerCase()).includes(email);
}

// ══════════════════════════════════════════════════════════════
// ── GHOST MODE (developer view of any user's data). Live tap counting,
//    undo, dedications, and account/session actions stay strictly blocked
//    (isGhostMode() guards below) — but the manual jap/time correction
//    tools (Statistics + 28 Names sections) and Local Backup & Restore ARE
//    permitted here, writing straight to the VIEWED user's Firestore doc
//    via ghostAwareSave()/fbPushToUid(), never the developer's own account.
// ══════════════════════════════════════════════════════════════

let _ghostViewingUid  = null;   // UID currently being viewed; null = not in ghost mode
let _ghostOwnState    = null;   // deep-copy of dev's own App.S before entering ghost mode
let _ghostAllUsers    = [];     // cached list of {uid, name, email, phone, source}

/** True while developer is shadowing another user's account. */
function isGhostMode() { return !!_ghostViewingUid; }

// ── Ghost-mode-aware save: manual jap/time correction tools call this
// instead of App.save()+fbDebouncedPush() directly. While ghosting, it
// writes straight to the VIEWED user's Firestore doc (never local IndexedDB,
// never the developer's own account); otherwise it's the normal save path.
function ghostAwareSave(fullReplace) {
  if (isGhostMode() && _ghostViewingUid) {
    fbPushToUid(_ghostViewingUid, !!fullReplace).catch(() => {});
  } else if (fullReplace) {
    // Restoring a backup on your own account: fbPushFull() already writes
    // with .set(payload) (no merge), so this replaces the live Firestore
    // doc entirely — nothing from before the restore survives.
    App.save();
    fbPushFull().catch(() => {});
  } else {
    App.save();
    if (typeof fbDebouncedPush === "function") fbDebouncedPush();
  }
}

// ── Open the user-selection modal ─────────────────────────────
window.openGhostUserList = async function () {
  if (!isDeveloper()) return;
  const modal = document.getElementById('ghostModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('ghostSearchInput').value = '';
  _renderGhostList([]);
  _setGhostListHtml('<div style="text-align:center;color:rgba(255,215,0,0.45);padding:30px 0;font-size:13px;">Loading users…</div>');
  _ghostAllUsers = await _fetchAllKnownUsers();
  filterGhostList();
};

window.closeGhostModal = function () {
  const modal = document.getElementById('ghostModal');
  if (modal) modal.style.display = 'none';
};

// ── Collect users from every available Firestore source ───────
async function _fetchAllKnownUsers() {
  const byUid = {};

  // Helper to merge a record
  const add = (uid, patch) => {
    if (!uid) return;
    if (!byUid[uid]) byUid[uid] = { uid };
    Object.assign(byUid[uid], patch);
  };

  try {
    // 1. feedbacks collection — uid-keyed, has userName / userEmail / userPhone
    const fbSnap = await fbDb.collection('feedbacks').get();
    fbSnap.forEach(doc => {
      const d = doc.data();
      add(doc.id, {
        name:  d.userName  || '',
        email: d.userEmail || '',
        phone: d.userPhone || '',
        source: 'feedback',
      });
    });
  } catch (_) {}

  try {
    // 2. leaderboard collection — uid-keyed, has displayName + totalJap
    const lbSnap = await fbDb.collection('leaderboard').get();
    lbSnap.forEach(doc => {
      const d = doc.data();
      add(doc.id, {
        name:  byUid[doc.id]?.name  || d.displayName || '',
        email: byUid[doc.id]?.email || d.email       || '',
        jap:   d.totalJap || 0,
        source: byUid[doc.id] ? byUid[doc.id].source : 'leaderboard',
      });
    });
  } catch (_) {}

  try {
    // 3. presence collection as third ghost-list source — written by every
    // signed-in user's heartbeat, INDEPENDENT of Family Board opt-in.
    // Fixes users who've opted out of the leaderboard (or never opted in)
    // and never submitted feedback becoming completely invisible to Ghost
    // Mode, which is a support tool and should find any real user.
    const presSnap = await fbDb.collection('presence').get();
    presSnap.forEach(doc => {
      const d = doc.data();
      add(doc.id, {
        name:  byUid[doc.id]?.name  || d.name  || '',
        email: byUid[doc.id]?.email || d.email || '',
        phone: byUid[doc.id]?.phone || d.phone || '',
        appVersion: d.appVersion || '',
        lastSeen: d.lastSeen || null,
        source: byUid[doc.id] ? byUid[doc.id].source : 'presence',
      });
    });
  } catch (_) {}

  try {
    // 4. users/*/data collection-group scan — the ultimate safety net.
    // feedbacks/leaderboard/presence are all *side-effect* writes that can
    // fail to fire (interrupted login, old app build predating one of them,
    // a step earlier in the login chain throwing, etc.) — see the Jhara
    // Barman case: real signed-in user, real chanted data, but zero rows in
    // all three other collections because none of those side-effects ever
    // completed for her. The users/{uid}/data/main doc, by contrast, is the
    // actual save target of every jap tap — if this doc exists, that UID is
    // a real user, full stop. A collection-group query across every
    // users/*/data doc finds every such UID even when the other three
    // sources have nothing, so nobody with real data is ever invisible here.
    // (Requires the `data` collection-group to be queryable — Firestore
    // auto-enables this for simple unfiltered scans; if the console prompts
    // to build a collection-group index, accept it once.)
    const dataSnap = await fbDb.collectionGroup('data').get();
    dataSnap.forEach(doc => {
      const uid = doc.ref.parent.parent ? doc.ref.parent.parent.id : null;
      if (!uid) return;
      const d = doc.data();
      add(uid, {
        name:  byUid[uid]?.name  || d.lbDisplayName || '',
        source: byUid[uid] ? byUid[uid].source : 'data',
      });
    });
  } catch (dataScanErr) {
    // TEMP DIAGNOSTIC: source 4 (the collection-group safety net) was
    // silently swallowing its own failure here, so there was no way to
    // tell whether it ever actually ran. Surface the real error once so
    // we can see permission-denied vs failed-precondition (missing
    // index) vs something else, then remove this block.
    console.error('[GhostMode] collectionGroup(data) scan failed:', dataScanErr);
    try { toast('Ghost list: data-scan failed — ' + (dataScanErr && dataScanErr.message ? dataScanErr.message : dataScanErr)); } catch (_) {}
  }

  // Sort: users with names first, then by name alpha
  return Object.values(byUid).sort((a, b) => {
    const an = (a.name || a.email || '').toLowerCase();
    const bn = (b.name || b.email || '').toLowerCase();
    if (an && !bn) return -1;
    if (!an && bn) return  1;
    return an.localeCompare(bn);
  });
}

// ── Filter + render the list ──────────────────────────────────
window.filterGhostList = function () {
  const q = (document.getElementById('ghostSearchInput')?.value || '').toLowerCase().trim();
  const filtered = q
    ? _ghostAllUsers.filter(u =>
        (u.uid   || '').toLowerCase().includes(q) ||
        (u.name  || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
      )
    : _ghostAllUsers;
  _renderGhostList(filtered);
};

function _setGhostListHtml(html) {
  const el = document.getElementById('ghostUserList');
  if (el) el.innerHTML = html;
}

function _renderGhostList(users) {
  const el = document.getElementById('ghostUserList');
  if (!el) return;
  if (!users.length) {
    el.innerHTML = '<div style="text-align:center;color:rgba(255,215,0,0.35);padding:30px 0;font-size:13px;">No matching users found.</div>';
    return;
  }
  el.innerHTML = '';
  users.forEach(u => {
    const label   = u.name  || u.email || '(no name)';
    const sublabel = u.email && u.name ? u.email : (u.phone || '');
    const japStr  = u.jap ? ' · ' + _lbFmtJap(u.jap) + ' jap' : '';
    // per-user version + last-synced display — relative time so it stays
    // readable without needing a live clock ("2h ago" instead of a raw
    // timestamp that goes stale-looking the moment you glance away).
    let metaStr = '';
    if (u.appVersion) metaStr += 'v' + _escHtmlG(u.appVersion);
    if (u.lastSeen && typeof u.lastSeen.toDate === 'function') {
      const ms = Date.now() - u.lastSeen.toDate().getTime();
      const mins = Math.floor(ms / 60000);
      const rel = mins < 1 ? 'just now'
        : mins < 60 ? mins + 'm ago'
        : mins < 1440 ? Math.floor(mins / 60) + 'h ago'
        : Math.floor(mins / 1440) + 'd ago';
      metaStr += (metaStr ? ' · ' : '') + rel;
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;border:1px solid rgba(255,215,0,0.18);background:rgba(255,215,0,0.03);cursor:pointer;transition:background 0.15s;';
    row.onmouseenter = () => { row.style.background = 'rgba(255,215,0,0.09)'; };
    row.onmouseleave = () => { row.style.background = 'rgba(255,215,0,0.03)'; };
    row.innerHTML = `
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,215,0,0.12);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">👤</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;color:#FFD700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escHtmlG(label)}${japStr}</div>
        ${sublabel ? `<div style="font-size:11px;color:rgba(255,255,255,0.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escHtmlG(sublabel)}</div>` : ''}
        <div style="font-size:10px;color:rgba(255,215,0,0.28);margin-top:1px;font-family:monospace;">${u.uid}</div>
        ${metaStr ? `<div style="font-size:10px;color:rgba(150,200,255,0.55);margin-top:2px;">${metaStr}</div>` : ''}
      </div>
      <div style="font-size:20px;flex-shrink:0;color:rgba(255,215,0,0.5);">›</div>`;
    row.onclick = () => devEnterGhostMode(u.uid, label);
    el.appendChild(row);
  });
}

function _escHtmlG(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Enter ghost mode for a given UID ─────────────────────────
window.devEnterGhostMode = async function (uid, displayLabel) {
  if (!isDeveloper()) return;

  // 1. Close the selection modal
  closeGhostModal();

  // 2. Save the developer's own clean state — ONLY if not already
  // ghosting someone else. ghost mode fixes: own-state capture guard +
  // force-restore signal — switching directly between two viewed users
  // without exiting in between used to overwrite this snapshot with
  // the FIRST viewed user's data instead of the developer's real data,
  // which then got merged into the developer's own profile on exit.
  if (!isGhostMode()) {
    _ghostOwnState = JSON.parse(JSON.stringify(App.S));
  }

  // 3. Prevent ALL writes while in ghost mode
  _ghostViewingUid = uid;

  // 4. Kill the real-time listener so viewed user's live changes
  //    don't trigger a push back to the dev's own account
  if (typeof fbListener === 'function') { try { fbListener(); } catch(_){} fbListener = null; }

  // 5. Pull the viewed user's data from Firestore (read-only)
  let snap;
  try {
    snap = await fbDb.collection('users').doc(uid).collection('data').doc('main').get();
  } catch (e) {
    toast('⚠️ Cannot read that user\'s data: ' + (e.message || e));
    _ghostViewingUid = null;
    _ghostOwnState   = null;
    return;
  }

  if (!snap || !snap.exists) {
    toast('⚠️ No data document found for that user.');
    _ghostViewingUid = null;
    _ghostOwnState   = null;
    return;
  }

  // 6. Stamp viewed data into App.S without touching IDB / cloud
  App._cloudHydrated = false;          // block any accidental push trigger
  fbApplyRemote(snap.data());
  App._cloudHydrated = false;          // keep blocked

  // 7. Re-render everything
  if (typeof switchJapMode === 'function') switchJapMode(App.S.japMode || 'radha');
  App.ua();
  if (typeof renderSt       === 'function') renderSt();
  if (typeof u28            === 'function') u28();
  if (typeof renderBcal     === 'function') renderBcal();
  if (typeof renderCal      === 'function') renderCal();
  if (typeof uStats         === 'function') uStats();
  if (typeof renderSankalpas=== 'function') renderSankalpas();
  if (typeof renderMalaLog  === 'function') renderMalaLog();

  // 8. Update the dev panel UI
  const pill = document.getElementById('ghostActivePill');
  const exitBtn = document.getElementById('ghostExitBtn');
  if (pill)   pill.style.display   = 'inline-block';
  if (exitBtn) exitBtn.style.display = '';

  toast('👁 Ghost: ' + _escHtmlG(displayLabel || uid.slice(0,10) + '…'));
};

// ── Exit ghost mode — restore dev's own state ─────────────────
window.devExitGhostMode = async function () {
  if (!isDeveloper()) return;

  // 1. Clear ghost flag immediately so write guards lift
  _ghostViewingUid = null;

  // 2. Restore the dev's own state snapshot (no cloud call needed)
  if (_ghostOwnState) {
    App.S = JSON.parse(JSON.stringify(_ghostOwnState));
    _ghostOwnState = null;
  }

  // 3. Re-hydrate from cloud to get any fresh changes since we entered ghost mode
  App._cloudHydrated = false;
  try {
    await fbAutoSync();   // pulls dev's own cloud doc and sets up real-time listener
  } catch (e) {
    // If offline, just render from the snapshot we restored
    App._cloudHydrated = true;
  }

  // 4. Re-render with dev's own data
  if (typeof switchJapMode === 'function') switchJapMode(App.S.japMode || 'radha');
  App.ua();
  if (typeof renderSt       === 'function') renderSt();
  if (typeof u28            === 'function') u28();
  if (typeof renderBcal     === 'function') renderBcal();
  if (typeof renderCal      === 'function') renderCal();
  if (typeof uStats         === 'function') uStats();
  if (typeof renderSankalpas=== 'function') renderSankalpas();
  if (typeof renderMalaLog  === 'function') renderMalaLog();

  // 5. Reset panel UI
  const pill   = document.getElementById('ghostActivePill');
  const exitBtn = document.getElementById('ghostExitBtn');
  if (pill)    pill.style.display   = 'none';
  if (exitBtn) exitBtn.style.display = 'none';

  toast('↩ Back to your own account');
};

// ══════════════════════════════════════════════════════════════
// END GHOST MODE
// ══════════════════════════════════════════════════════════════

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
        ? (App.S.historyHK[key] || 0) + (App.S.h28[key] || 0)
        : (App.S.history[key] || 0) + (App.S.historyRV[key] || 0) + ((App.S.historyKV || {})[key] || 0) + ((App.S.historySS || {})[key] || 0) + ((App.S.historyRam || {})[key] || 0) + (App.S.h28[key] || 0),
      timeSec = _isG
        ? App.S.timerHistoryHK[key] || 0
        : (App.S.timerHistory[key] || 0) + (App.S.timerHistoryRV[key] || 0) + ((App.S.timerHistoryKV || {})[key] || 0) + ((App.S.timerHistorySS || {})[key] || 0) + ((App.S.timerHistoryRam || {})[key] || 0),
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
    const combinedDt = (App.S.dt || 0) + (App.S.dtRV || 0) + (App.S.dtKV || 0) + (App.S.dtSS || 0);
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
  const kvCount = (App.S.historyKV || {})[key] || 0;
  const ssCount = (App.S.historySS || {})[key] || 0;
  const ramCount = (App.S.historyRam || {})[key] || 0;
  const radhaTime = App.S.timerHistory[key] || 0;
  const rvTime = App.S.timerHistoryRV[key] || 0;
  const kvTime = (App.S.timerHistoryKV || {})[key] || 0;
  const ssTime = (App.S.timerHistorySS || {})[key] || 0;
  const ramTime = (App.S.timerHistoryRam || {})[key] || 0;
  const n28Count = App.S.h28[key] || 0;
  const n28TimeSec = App.S.timer28History[key] || 0;
  const n28Cycles = Math.floor(n28Count / 28);
  const radhaMalas = Math.floor(radhaCount / ms);
  const rvMalas = Math.floor(rvCount / ms);
  const kvMalas = Math.floor(kvCount / ms);
  const ssMalas = Math.floor(ssCount / ms);
  const ramMalas = Math.floor(ramCount / ms);
  const totalCount = radhaCount + rvCount + kvCount + ssCount + n28Count;
  const totalMalas = Math.floor((radhaCount + rvCount + kvCount + ssCount) / ms);
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
  const kvJapEl = document.getElementById("cdmoKvJap");
  if (kvJapEl)
    kvJapEl.textContent =
      kvCount > 0 ? kvCount + " jap · " + kvMalas + " malas" : "—";
  const kvTimeEl = document.getElementById("cdmoKvTime");
  if (kvTimeEl) kvTimeEl.textContent = kvTime > 0 ? App.fmtTime(kvTime) : "—";
  const ssJapEl = document.getElementById("cdmoSsJap");
  if (ssJapEl)
    ssJapEl.textContent =
      ssCount > 0 ? ssCount + " jap · " + ssMalas + " malas" : "—";
  const ssTimeEl = document.getElementById("cdmoSsTime");
  if (ssTimeEl) ssTimeEl.textContent = ssTime > 0 ? App.fmtTime(ssTime) : "—";
  const ramJapEl = document.getElementById("cdmoRamJap");
  if (ramJapEl)
    ramJapEl.textContent =
      ramCount > 0 ? ramCount + " jap · " + ramMalas + " malas" : "—";
  const ramTimeEl = document.getElementById("cdmoRamTime");
  if (ramTimeEl) ramTimeEl.textContent = ramTime > 0 ? App.fmtTime(ramTime) : "—";
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
  const totalTimeSec = radhaTime + rvTime + kvTime + ssTime + n28TimeSec;
  document.getElementById("cdmoTotalTime").textContent =
    totalTimeSec > 0 ? App.fmtTime(totalTimeSec) : "—";
  const combinedDt = (App.S.dt || 0) + (App.S.dtRV || 0) + (App.S.dtKV || 0) + (App.S.dtSS || 0);
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
    : (App.S.history[key] || 0) + (App.S.historyRV[key] || 0) + ((App.S.historyKV || {})[key] || 0) + ((App.S.historySS || {})[key] || 0);
  const timeSec2 =
    (App.S.timerHistory[key] || 0) + (App.S.timerHistoryRV[key] || 0) + ((App.S.timerHistoryKV || {})[key] || 0) + ((App.S.timerHistorySS || {})[key] || 0);
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
  try {
    if (localStorage.getItem("rjap_reminder_bm") === "1" && typeof lcArmBmReminder === "function") lcArmBmReminder();
    if (localStorage.getItem("rjap_reminder_sk") === "1" && typeof lcArmSkReminder === "function") lcArmSkReminder();
  } catch (e) {}
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
  if (typeof checkForUpdateAvailable === "function") checkForUpdateAvailable();
  App.lmc = Math.floor(App.gTod() / (App.S.ms || 108));
  App.lm28 = Math.floor((App.S.h28[App.S.tk] || 0) / (App.S.ms || 108));
  App.lmcRV = Math.floor((App.S.historyRV[App.S.tk] || 0) / (App.S.ms || 108));
  App.lmcHK = Math.floor(
    ((App.S.historyHK || {})[App.S.tk] || 0) / (App.S.ms || 108),
  );
  App.lmcKV = Math.floor(
    ((App.S.historyKV || {})[App.S.tk] || 0) / (App.S.ms || 108),
  );
  App.lmcSS = Math.floor(
    ((App.S.historySS || {})[App.S.tk] || 0) / (App.S.ms || 108),
  );
  if (App.S.gaudiyaMode) document.body.classList.add("gaudiya-mode");
  if (App.S.trahimamMode) document.body.classList.add("trahimam-mode");
  if (App.S.ramanandiMode) document.body.classList.add("ramanandi-mode");

  // (A) sessionSeconds resets on every app open (per spec).
  App.timerSeconds = 0;
  App.timerSavedSeconds = 0;
  App._malaTimerStart = 0;             // legacy, no longer authoritative
  // (B) currentMalaSeconds: restore from storage if a mala is in progress so the
  // next bead tap continues the prior mala's duration instead of leaking the
  // full session into history.
  App.currentMalaSeconds = 0;
  App._currentMalaStartTs = null;
  // Prefer the per-mode stash (survives closing the app while mid-mala in
  // ANY of the 4 jap types, not just Radha) — fall back to the older
  // generic keys only for state saved before this per-mode fix existed.
  let _bootStash = null;
  try {
    const _raw = localStorage.getItem("rjap_malaStash_" + App.S.japMode);
    if (_raw) _bootStash = JSON.parse(_raw);
  } catch (_) {}
  const savedMalaWall = _bootStash
    ? _bootStash.malaWallStart
    : localStorage.getItem("rjap_malaWallStart");
  const todayCount = App.gTod();
  const ms = App.S.ms || 108;
  const countInCurrentMala = todayCount % ms;
  if (savedMalaWall && countInCurrentMala > 0) {
    App.malaWallStart = parseInt(savedMalaWall);
    const savedCMS = _bootStash
      ? _bootStash.currentMalaSeconds
      : parseInt(localStorage.getItem("rjap_currentMalaSeconds") || "0");
    const savedCMST = _bootStash
      ? _bootStash._currentMalaStartTs
      : parseInt(localStorage.getItem("rjap_currentMalaStartTs") || "0");
    if (!isNaN(savedCMS) && savedCMS > 0) App.currentMalaSeconds = savedCMS;
    App._currentMalaStartTs = (!isNaN(savedCMST) && savedCMST > 0)
      ? savedCMST
      : App.malaWallStart;
  } else {
    App.malaWallStart = 0;
    localStorage.removeItem("rjap_malaWallStart");
    localStorage.removeItem("rjap_timerSeconds");
    localStorage.removeItem("rjap_malaTimerStart");
    localStorage.removeItem("rjap_currentMalaSeconds");
    localStorage.removeItem("rjap_currentMalaStartTs");
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

  // Daily Reminder toggle — restore on load. Re-arms the native/web schedule
  // without re-prompting for notification permission (already granted).
  const tgRemInit = document.getElementById("tgDailyReminder");
  if (tgRemInit) {
    let remOn = false, remTime = "05:00";
    try {
      remOn = localStorage.getItem("rjap_reminder_enabled") === "1";
      remTime = localStorage.getItem("rjap_reminder_time") || "05:00";
    } catch (e) {}
    const timeInputInit = document.getElementById("reminderTimeInput");
    if (timeInputInit) timeInputInit.value = remTime;
    const remStatusEl = document.getElementById("dailyReminderStatus");
    if (remOn) {
      tgRemInit.classList.add("on");
      if (remStatusEl) remStatusEl.textContent = "✅ Daily reminder set for " + remTime;
      const [rh, rm] = remTime.split(":").map(Number);
      lcScheduleDailyReminder(rh, rm).catch(() => {});
    } else if (remStatusEl) {
      remStatusEl.textContent = "— Tap toggle to enable your daily jap reminder 🔔";
    }
    if (timeInputInit) {
      timeInputInit.addEventListener("change", () => {
        if (!tgRemInit.classList.contains("on")) return;
        const val = timeInputInit.value || "05:00";
        const [h, m] = val.split(":").map(Number);
        lcScheduleDailyReminder(h, m).then(() => {
          try { localStorage.setItem("rjap_reminder_time", h + ":" + m); } catch (e) {}
          if (remStatusEl) remStatusEl.textContent = "✅ Daily reminder set for " + val;
          toast("🔔 Reminder time updated to " + val);
        });
      });
    }
  }

  // Brahma Muhurta / Sandhya Kal reminder toggles — restore on load and
  // re-arm (fresh sun-time math). Also re-armed inside updateSunInfo().
  const tgBmInit = document.getElementById("tgBmReminder");
  if (tgBmInit) {
    let bmOn = false;
    try { bmOn = localStorage.getItem("rjap_reminder_bm") === "1"; } catch (e) {}
    if (bmOn) { tgBmInit.classList.add("on"); lcArmBmReminder().catch(() => {}); }
  }
  const tgSkInit = document.getElementById("tgSkReminder");
  if (tgSkInit) {
    let skOn = false;
    try { skOn = localStorage.getItem("rjap_reminder_sk") === "1"; } catch (e) {}
    if (skOn) { tgSkInit.classList.add("on"); lcArmSkReminder().catch(() => {}); }
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

  // ── Screen Time / Stotram Time: start ticking for whichever view is
  // active by default (the Jap view, "vj") now that the DOM is ready ──
  App.updateScreenTimeDisplay();
  if (document.visibilityState !== "hidden") App.resumeTimeForActiveView();

  // Trigger auto-backup check
  setTimeout(checkAutoBackup, 2000);

  // Push leaderboard on fresh open so "Today" tab never shows stale yesterday data.
  // Waits for real cloud hydration to be CONFIRMED (up to 20s) instead of
  // guessing a fixed delay — a slow network/device previously could push
  // partial/default local state (e.g. lbOptIn still false) before the real
  // cloud pull finished, silently deleting or corrupting the user's entry.
  (async () => {
    const hydrated = await _waitForCloudHydration(20000);
    if (!hydrated) return; // never push based on unconfirmed state
    const lastLbPushDate = localStorage.getItem('rjap_lastLbPushDate') || '';
    const todayKey = App.S.tk || App.getTk();
    if (lastLbPushDate !== todayKey && typeof pushLeaderboard === 'function') {
      pushLeaderboard().then(() => {
        localStorage.setItem('rjap_lastLbPushDate', todayKey);
      }).catch(() => {});
    }
  })();

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

// ── Screen Time / Stotram Time: pause on backgrounding/tab-away, resume
// whichever matches the currently active view when foregrounded again.
// Idle (no taps) never pauses these — only visibility/leaving the view does. ──
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    App.pauseScreenTime();
    App.pauseStotramTime();
  } else if (document.visibilityState === "visible") {
    App.resumeTimeForActiveView();
  }
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
      // ── SW_UPDATED (v154): NO auto-reload. ──
      // Previous versions did window.location.reload() ~800ms after this
      // message, which was the root cause of the "app loads twice / loading
      // bar disappears then comes back" complaint on slow networks.
      // The new SW (v154) no longer calls clients.claim(), so the current
      // page keeps running on the old SW until the user navigates or
      // manually refreshes — guaranteed clean, no flicker.
      if (e.data && e.data.type === "SW_UPDATED") {
        console.log("[SW] update ready (" + e.data.version + ") — will apply on next navigation");
        // Optional: surface a soft toast / pill here if desired.
        try { if (typeof toast === "function") toast("✨ Update ready — refresh anytime"); } catch (_) {}
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
const TRANSLATION_IDS = ["nkc", "gms", "rsn", "svb", "dkc", "yms", "bg"];
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
  // The Gita is kept out of the initial bundle. Load and validate all
  // 700 Bengali shlokas the first time the reader is opened.
  if (id === "bg" && window.isGitaReady && !window.isGitaReady()) {
    toast("গীতার ৭০০ শ্লোক লোড হচ্ছে… 🙏");
    if (window.loadGitaLyrics) {
      window.loadGitaLyrics()
        .then(() => showLyrics(id))
        .catch(() => toast("গীতার পাঠ লোড করা যায়নি। আবার চেষ্টা করুন 🙏"));
    }
    return;
  }
  const ly = getEffectiveLyrics(id);
  if (!ly) {
    toast("পাঠ্য পাওয়া যায়নি 🙏");
    return;
  }

  // Selecting another reader is a new audio context. Stop any minimized
  // track from the previous reader so its mini-player cannot sit above the
  // newly opened chapter/lyrics picker.
  if (
    _currentStotramId &&
    _currentStotramId !== id &&
    typeof _hcjStopAudio === "function"
  ) {
    _hcjStopAudio();
  }
  if (typeof _hcjRemoveMiniPlayer === "function") _hcjRemoveMiniPlayer();
  var existingLmo = document.getElementById("lmo");
  if (existingLmo) existingLmo.removeAttribute("data-minimized");
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
    var radha = ["hcj", "rsn", "rks", "gms", "nkc", "vs2"];
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

  // Single-view stotrams: shown as one continuous page, no verse-by-verse
  // split/swipe (still just one card, so the existing audio-index logic
  // naturally looks for a single "<prefix>_1.mp3" track).
  const SINGLE_VIEW_IDS = ["ach", "rds", "ans", "hnc", "rdc"];

  // Split by blank lines into verses
  let allVerses = SINGLE_VIEW_IDS.includes(id)
    ? [ly.trim()]
    : ly
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
  _verseNavLocked = false;
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
  if (_currentStotramId === "bg" && window.setGitaVerseTitle) {
    window.setGitaVerseTitle(idx);
  }
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
        // ⟦RED⟧ prefix in LYRICS source text flags a single manually-highlighted
        // line (e.g. the inserted Bhagavatam verse in Ardhanarishwar Stotram) —
        // stripped before display, adds .lyr-line-red for the red styling.
        let content = line;
        let extraClass = "";
        if (content.startsWith("⟦RED⟧")) {
          content = content.slice(5);
          extraClass = " lyr-line-red";
        }
        const esc = content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        if (/^অর্থ\s*:/.test(content.trim())) {
          // Only inject অর্থ: line when translation is ON
          if (!hasTranslation || !_translationVisible) return "";
          return '<span class="lyr-line lyr-artha' + extraClass + '">' + esc + "</span>";
        }
        return '<span class="lyr-line' + extraClass + '">' + esc + "</span>";
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
  _hcjApplyDefaultVoiceForVerse(idx);
  _hcjRenderPlayer(idx);
  _hcjOnVerseChange(idx);
  // Re-apply the reader's chosen (or auto) text size to this verse's
  // freshly-rendered lines right away, rather than waiting on the
  // MutationObserver's ~120ms detection window.
  if (typeof window.fitLyrLines === "function") window.fitLyrLines();
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

// Guards against a second tap/swipe landing while the previous verse's
// slide-in animation (220ms, see .lyr-slide-enter-left/right in
// style-stotram.css) is still running. Without this, a fast double-tap on
// Next/Prev (very common on Android) could call _renderVerse() twice in
// quick succession — the second call interrupted the first mid-animation,
// which is what produced the flicker and made it land on an unpredictable
// verse (sometimes +1, sometimes +2) instead of a clean single step.
let _verseNavLocked = false;
const _VERSE_NAV_LOCK_MS = 240; // slightly longer than the 220ms slide animation

// Visible "glow" flash on the tapped Next/Prev button, plus a hard safety
// net: the lock is ALWAYS released (via try/finally) even if rendering the
// verse throws for a particular stotram, so one bad stotram's data can't
// leave the button permanently unresponsive for the rest of the session.
function verseNav(delta) {
  const btn = document.getElementById(delta > 0 ? "lmNext" : "lmPrev");
  if (btn) {
    btn.classList.remove("lm-nav-glow");
    void btn.offsetWidth; // restart the animation even on rapid re-taps
    btn.classList.add("lm-nav-glow");
  }

  if (_verseNavLocked) return;
  const newIdx = _verseIdx + delta;
  if (newIdx < 0 || newIdx >= _verses.length) return;

  _verseNavLocked = true;
  setTimeout(() => {
    _verseNavLocked = false;
  }, _VERSE_NAV_LOCK_MS);

  _verseIdx = newIdx;
  try {
    _renderVerse(_verseIdx, delta > 0 ? 1 : -1);
  } catch (e) {
    // Never let a rendering error strand the reader on a dead button —
    // force the lock open immediately and surface the problem quietly.
    _verseNavLocked = false;
    console.warn("verseNav render error:", e);
  }
}

function _initSwipeHandler() {
  // Horizontal swipe nav enabled for all stotrams EXCEPT hcj.
  // If enlarged text makes the lyric panel scrollable, touches that begin
  // inside that panel are reserved for native vertical scrolling.
  const card = document.getElementById("lmCard");
  if (!card) return;

  // Remove any previous swipe listeners
  card._swipeCleanup && card._swipeCleanup();

  // audio stotrams use player arrows — but hcj also supports swipe
  if (_AUDIO_STOTRAMS[_currentStotramId] && _currentStotramId !== 'hcj') return;

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
  lmo.removeAttribute("data-minimized");
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
  _verseNavLocked = false;
  _currentStotramId = "";
  _translationVisible = false;
  if (window.StotramSections) window.StotramSections.reset();
  var oldWrap = document.getElementById("lm-translate-wrap");
  if (oldWrap) oldWrap.remove();
  var mini = document.getElementById("hcj-mini-player");
  if (mini) mini.remove();
  var minimizeBtn = document.getElementById("lm-minimize");
  if (minimizeBtn) minimizeBtn.remove();
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
var _hcjMiniVisible = false;

// The mini-player lives outside #lmo. Hiding the lyrics modal therefore
// leaves the same HTMLAudioElement alive while the user browses the rest of
// the app. The normal close button still calls closeLyrics() and stops audio.
function _hcjMiniLabel() {
  var title = document.getElementById("lmTitle");
  var text = title && title.textContent ? title.textContent.trim() : "";
  return text || "Audio";
}

function _hcjSyncMiniPlayer() {
  var mini = document.getElementById("hcj-mini-player");
  if (!mini) return;
  var label = document.getElementById("hcj-mini-label");
  var play = document.getElementById("hcj-mini-play");
  var fill = document.getElementById("hcj-mini-progress-fill");
  if (label) label.textContent = _hcjMiniLabel();
  if (play) {
    play.textContent = _hcjPlaying ? "\u23f8" : "\u25b6";
    play.title = _hcjPlaying ? "বিরতি" : "বাজাও";
    play.setAttribute("aria-label", play.title);
  }
  if (fill && _hcjAudio && _hcjAudio.duration > 0) {
    fill.style.width = ((_hcjAudio.currentTime / _hcjAudio.duration) * 100) + "%";
  } else if (fill) {
    fill.style.width = "0%";
  }
}

function _hcjRemoveMiniPlayer() {
  var mini = document.getElementById("hcj-mini-player");
  if (mini) mini.remove();
  _hcjMiniVisible = false;
}

function _hcjShowMiniPlayer() {
  var mini = document.getElementById("hcj-mini-player");
  if (!mini) {
    mini = document.createElement("div");
    mini.id = "hcj-mini-player";
    mini.setAttribute("role", "region");
    mini.setAttribute("aria-label", "Audio player");

    var progress = document.createElement("div");
    progress.className = "hcj-mini-progress";
    var fill = document.createElement("div");
    fill.id = "hcj-mini-progress-fill";
    fill.className = "hcj-mini-progress-fill";
    progress.appendChild(fill);
    mini.appendChild(progress);

    var label = document.createElement("span");
    label.id = "hcj-mini-label";
    label.className = "hcj-mini-label";
    mini.appendChild(label);

    var play = document.createElement("button");
    play.id = "hcj-mini-play";
    play.className = "hcj-mini-action";
    play.onclick = function (e) {
      e.stopPropagation();
      _hcjTogglePlay();
    };
    mini.appendChild(play);

    var expand = document.createElement("button");
    expand.className = "hcj-mini-action";
    expand.textContent = "\u2197";
    expand.title = "অডিও প্লেয়ার খুলুন";
    expand.setAttribute("aria-label", expand.title);
    expand.onclick = function (e) {
      e.stopPropagation();
      _hcjRestoreLyrics();
    };
    mini.appendChild(expand);

    var stop = document.createElement("button");
    stop.className = "hcj-mini-action hcj-mini-stop";
    stop.textContent = "\u00d7";
    stop.title = "অডিও বন্ধ করুন";
    stop.setAttribute("aria-label", stop.title);
    stop.onclick = function (e) {
      e.stopPropagation();
      closeLyrics();
    };
    mini.appendChild(stop);

    mini.onclick = function () {
      _hcjRestoreLyrics();
    };
    document.body.appendChild(mini);
  }
  _hcjMiniVisible = true;
  _hcjSyncMiniPlayer();
}

function _hcjMinimizeLyrics() {
  var lmo = document.getElementById("lmo");
  if (!lmo) return;
  lmo.classList.remove("show");
  lmo.setAttribute("data-minimized", "true");
  _hcjShowMiniPlayer();
}

function _hcjRestoreLyrics() {
  var lmo = document.getElementById("lmo");
  if (!lmo) return;
  _hcjRemoveMiniPlayer();
  lmo.removeAttribute("data-minimized");
  lmo.classList.add("show");
}

function _hcjEnsureMinimizeButton() {
  var lmd = document.querySelector("#lmo .lmd");
  if (!lmd) return;
  var button = document.getElementById("lm-minimize");
  if (!button) {
    button = document.createElement("button");
    button.id = "lm-minimize";
    button.className = "lm-minimize-btn";
    button.textContent = "\u2304";
    button.title = "অডিও ছোট করুন";
    button.setAttribute("aria-label", button.title);
    button.onclick = _hcjMinimizeLyrics;
    lmd.appendChild(button);
  }
  button.style.display = "flex";
}

// Audio clip path — works for any stotram that has audio clips
// A stotram with a single voice just has { prefix }.
// A stotram with multiple reciter voices adds { voices: { key: filePrefix } }
// — "default" is whichever voice should play first. voicesByVerse limits
// alternate voices to specific verses only (e.g. a guest reciter for one
// Shlok) — the voice button only appears when the current verse has one.
var _AUDIO_STOTRAMS = {
  hcj: {
    prefix: "hcj",
    voices: { default: "hcj", ankit: "hcj_ankit", shuvam: "hcj_shuvam" },
    // Verse 52 defaults to Shuvam Srivastav's recitation instead of the
    // usual original — original and Ankit stay available via the voice
    // button like any other verse. Keyed by displayed verse number.
    defaultVoiceByVerse: { 52: "shuvam" }
  },
  bss: { prefix: "bss" },
  ach: { prefix: "ach" },
  rdc: { prefix: "rdc" },
  dkc: { prefix: "dkc" },
  // rsn has one extra, unlabeled preamble block (audio track 0) before the
  // numbered Shlok 1 starts (audio track 1) — labelOffset shifts the
  // seek-input's displayed/typed number and the actual audio file loaded
  // so they always match the printed Shlok number.
  rsn: {
    prefix: "rsn",
    labelOffset: 1,
    closingSuffix: "c",
    // Shlok 150 only — Harindu's variation, available alongside the usual
    // rsn_150.mp3, not selected by default. Every other verse has no
    // voices entry at all, so the voice button stays hidden there.
    voicesByVerse: { 150: { default: "rsn", harindu: "rsn_harindu" } }
  },
  yms: { prefix: "yms" },
  hmg: { prefix: "hmg" },
  rks: { prefix: "rks" },
  // 2 versions — "alt" is a placeholder key/filename until you tell me what
  // to actually call the second recitation (like Shuvam/Harindu elsewhere).
  gms: { prefix: "gms", voices: { default: "gms", alt: "gms_alt" } },
  // nkc's opening story (11 blocks) and closing story (4 blocks) are prose
  // with no audio — only the 22 verses in between (with translations) are
  // numbered/playable. slokaRange is 0-based, inclusive, in _verses index
  // terms (after the title itself is auto-stripped): the 22 verses sit at
  // indices 11–32 — everything outside that range has no player at all.
  nkc: { prefix: "nkc", slokaRange: [11, 32] },
  vs2: { prefix: "vs2" },
  rds: { prefix: "rds" },
  ans: { prefix: "ans" },
  sps: { prefix: "sps" },
  // Geet Govindam: sectioned (two-level Sarga/Geetam) stotram — every
  // geetam renders as a single verse card, so idx is always 0 and can't
  // tell songs apart. `sectioned: true` switches audio lookup over to
  // window._ggAudioKey ("gg_<sarga#>_<geetam#>", set by stotrams.js's
  // openGeetam) instead of the verse index. Only the 8 keys listed in
  // `tracks` actually have a player — every other geetam has none.
  // gg_5_2 has two recorded versions ("alt" is a placeholder key/filename
  // until you tell me what to actually call the second version).
  gg: {
    prefix: "gg",
    sectioned: true,
    tracks: {
      gg_1_2: "gg_1_2",
      gg_1_3: "gg_1_3",
      gg_2_1: "gg_2_1",
      gg_4_2: "gg_4_2",
      gg_5_2: { default: "gg_5_2", alt: "gg_5_2_alt" },
      gg_7_4: "gg_7_4",
      gg_10_1: "gg_10_1",
      gg_12_1: "gg_12_1"
    }
  },
  // Single-view page now (see SINGLE_VIEW_IDS) — only one card, so the
  // old per-chaupai verseMap (42 tracks + alt voice) can never advance
  // past track 1. Simplified to expect one full-recitation clip,
  // hnc_1.mp3, same as the other single-view stotrams.
  hnc: { prefix: "hnc", voices: { default: "hnc", alt: "hnc_alt" } },
  // Srimad Bhagavad Gita: every one of the 700 shlokas has its own clip,
  // one per chapter+verse — "bg_<chapter#>_<shlok#>.mp3". Unlike gg, each
  // chapter opens as a real multi-verse reader (see stotrams.js's
  // openGeetam), so idx is the shlok's position within the open chapter,
  // not a single-card lookup key. `chapterAudio: true` tells the audio
  // path/availability helpers below to build the filename from idx plus
  // window._bgChapterNum (set by stotrams.js when a chapter is opened,
  // cleared when leaving it) instead of the usual flat "<prefix>_<n>".
  bg: { prefix: "bg", chapterAudio: true }
};
var _hcjVoice = "default"; // currently selected voice key for stotrams that support voices
// True once the user has manually picked a voice via the button this
// session — once set, per-verse defaults (defaultVoiceByVerse) stop
// auto-switching the voice out from under their choice.
var _hcjVoiceUserOverridden = false;

// Resolve which voices map (if any) applies to a given displayed verse
// number — a per-verse override (voicesByVerse) takes priority over the
// stotram-wide one (voices); returns null if neither applies.
function _hcjVoicesFor(cfg, verseNum) {
  if (!cfg) return null;
  if (cfg.sectioned) {
    var _key = window._ggAudioKey;
    var _entry = _key && cfg.tracks && cfg.tracks[_key];
    return (_entry && typeof _entry === "object") ? _entry : null;
  }
  if (cfg.voicesByVerse && cfg.voicesByVerse[verseNum]) return cfg.voicesByVerse[verseNum];
  return cfg.voices || null;
}

// True if verse array-index i has audio at all — false outside a
// stotram's slokaRange (narrative prose with no translation/audio, e.g.
// nkc's opening and closing story), true everywhere for stotrams with no
// slokaRange defined.
function _hcjHasAudioForIdx(cfg, i) {
  if (!cfg) return false;
  if (cfg.sectioned) return !!(window._ggAudioKey && cfg.tracks && cfg.tracks[window._ggAudioKey]);
  // Every shlok has a clip once a Gita chapter is actually open — before
  // that (chapter picker screen) window._bgChapterNum is null, so no
  // player renders there.
  if (cfg.chapterAudio) return !!window._bgChapterNum;
  if (cfg.verseMap) return !!cfg.verseMap[i];
  if (!cfg.slokaRange) return true;
  return i >= cfg.slokaRange[0] && i <= cfg.slokaRange[1];
}

function _hcjAudioPath(i) {
  var cfg = _AUDIO_STOTRAMS[_currentStotramId];
  if (cfg && cfg.sectioned) {
    var _key = window._ggAudioKey;
    var _entry = _key && cfg.tracks && cfg.tracks[_key];
    if (!_entry) return "";
    var _base = (typeof _entry === "object") ? (_entry[_hcjVoice] || _entry.default) : _entry;
    return "audio/" + _base + ".mp3";
  }
  // Gita: filename is "bg_<chapter#>_<shlok#-within-chapter>.mp3" — the
  // chapter number comes from window._bgChapterNum (set when the chapter
  // was opened), the shlok number from i, the verse's position within
  // that chapter's own _verses array.
  if (cfg && cfg.chapterAudio) {
    if (!window._bgChapterNum) return "";
    return "audio/" + cfg.prefix + "_" + window._bgChapterNum + "_" + (i + 1) + ".mp3";
  }
  var prefix = cfg ? cfg.prefix : "hcj";
  if (cfg && cfg.verseMap) {
    var _vm = cfg.verseMap[i];
    if (!_vm) return "";
    var _voicesHereVM = _hcjVoicesFor(cfg, _vm.track);
    var _prefixVM = (_voicesHereVM && _voicesHereVM[_hcjVoice]) || prefix;
    return "audio/" + _prefixVM + "_" + _vm.track + ".mp3";
  }
  if (cfg) {
    var _voiceOffset = cfg.labelOffset || 0;
    var _voicesHere = _hcjVoicesFor(cfg, i + 1 - _voiceOffset);
    if (_voicesHere && _voicesHere[_hcjVoice]) prefix = _voicesHere[_hcjVoice];
  }
  // rsn's closing/colophon verse (the last block) isn't a numbered Shlok —
  // it uses a fixed "c" suffix instead of continuing the numeric sequence.
  if (cfg && cfg.closingSuffix && i === _verses.length - 1) {
    return "audio/" + prefix + "_" + cfg.closingSuffix + ".mp3";
  }
  // slokaRange stotrams (e.g. nkc) number audio from 1 at the start of the
  // range, not from the verse's absolute array position.
  if (cfg && cfg.slokaRange) {
    return "audio/" + prefix + "_" + (i - cfg.slokaRange[0] + 1) + ".mp3";
  }
  // Same labelOffset used by the seek input (see _hcjSeekLabel) — keeps the
  // actual audio file loaded in sync with the displayed/typed verse number,
  // so rsn_1.mp3 is Shlok 1's clip, not the unlabeled preamble's.
  var offset = (cfg && cfg.labelOffset) || 0;
  return "audio/" + prefix + "_" + (i + 1 - offset) + ".mp3";
}

// Convert an internal 0-based verse array index to the number shown/typed
// in the seek input — matches the printed Shlok number for stotrams with
// a labelOffset (see _AUDIO_STOTRAMS), and is a no-op (idx+1) otherwise.
// Returns "" for a closing/colophon verse (closingSuffix) or any verse
// outside a slokaRange (no real Shlok number to show there either).
function _hcjSeekLabel(idx) {
  var cfg = _AUDIO_STOTRAMS[_currentStotramId];
  if (cfg && cfg.verseMap) {
    var _vm = cfg.verseMap[idx];
    return _vm ? _vm.label : "";
  }
  if (cfg && cfg.closingSuffix && idx === _verses.length - 1) return "";
  if (cfg && cfg.slokaRange) {
    if (!_hcjHasAudioForIdx(cfg, idx)) return "";
    return idx - cfg.slokaRange[0] + 1;
  }
  var offset = (cfg && cfg.labelOffset) || 0;
  return idx + 1 - offset;
}

// Switch reciter voice for the current stotram. Reloads the clip for
// whichever verse is currently loaded/playing so the new voice takes effect
// immediately. isUserAction=true (the voice button) marks this as an
// explicit user choice, which then takes priority over defaultVoiceByVerse
// for the rest of the session.
function _hcjSetVoice(v, isUserAction) {
  if (isUserAction) _hcjVoiceUserOverridden = true;
  if (_hcjVoice === v) return;
  _hcjVoice = v;
  var wasPlaying = _hcjPlaying;
  var idx = _hcjAudioIdx >= 0 ? _hcjAudioIdx : _verseIdx;
  _hcjStopAudio();
  if (wasPlaying) _hcjPlayVerse(idx);
}

// Apply a verse's default voice (defaultVoiceByVerse) unless the user has
// already picked a voice manually this session — called whenever the
// displayed verse changes, before any audio for that verse loads. Also
// falls back to "default" if the currently selected voice isn't offered
// at all for the new verse (e.g. leaving Shlok 150 after picking Harindu,
// which only exists there) — an unavailable voice can't stay selected.
function _hcjApplyDefaultVoiceForVerse(idx) {
  var cfg = _AUDIO_STOTRAMS[_currentStotramId];
  if (!cfg) return;
  var offset = cfg.labelOffset || 0;
  var verseNum = idx + 1 - offset;
  var voicesHere = _hcjVoicesFor(cfg, verseNum);
  if (!voicesHere) {
    _hcjVoice = "default";
    return;
  }
  if (!voicesHere[_hcjVoice]) _hcjVoice = "default";
  if (_hcjVoiceUserOverridden) return;
  var wanted = (cfg.defaultVoiceByVerse && cfg.defaultVoiceByVerse[verseNum]) || "default";
  if (voicesHere[wanted] && _hcjVoice !== wanted) _hcjVoice = wanted;
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
  _hcjSyncMiniPlayer();
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
  _hcjRemoveMiniPlayer();
  var minimizeBtn = document.getElementById("lm-minimize");
  if (minimizeBtn) minimizeBtn.remove();
  if (window._lyrHcjAudioChanged) window._lyrHcjAudioChanged(null, false);
}
function _hcjPauseAudio() {
  /* True pause — keeps the audio element and current position */
  _hcjStopProgressLoop();
  if (_hcjAudio) _hcjAudio.pause();
  _hcjPlaying = false;
  _hcjSyncUI();
  _hcjSyncMiniPlayer();
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
  var cfg = _AUDIO_STOTRAMS[_currentStotramId];
  if (!cfg) return;
  _hcjApplyDefaultVoiceForVerse(idx);
  if (_hcjPlaying && _hcjAudioIdx !== idx) {
    // Don't try to auto-continue playback into a verse with no audio at
    // all (e.g. swiping past the last sloka into nkc's closing narrative)
    // — just stop instead of attempting to load a nonexistent file.
    if (_hcjHasAudioForIdx(cfg, idx)) {
      _hcjPlayVerse(idx);
    } else {
      _hcjStopAudio();
    }
  }
  var si = document.getElementById("hcj-seek-input");
  if (si) si.value = _hcjSeekLabel(idx);
}
function _hcjGoToVerse(n) {
  var cfg = _AUDIO_STOTRAMS[_currentStotramId];
  var i;
  if (cfg && cfg.verseMap) {
    var _target = String(n).trim();
    i = cfg.verseMap.findIndex(function (e) { return e && e.label === _target; });
    if (i === -1) return;
  } else if (cfg && cfg.slokaRange) {
    i = cfg.slokaRange[0] + (parseInt(n) - 1);
    if (isNaN(i) || i < cfg.slokaRange[0] || i > cfg.slokaRange[1]) return;
  } else {
    var offset = (cfg && cfg.labelOffset) || 0;
    i = parseInt(n) - 1 + offset;
    if (isNaN(i) || i < 0 || i >= _verses.length) return;
    // The closing/colophon verse (rsn's last block) has no Shlok number of
    // its own — don't let typing a number land on it. Reach it only via the
    // next arrow after the last numbered verse, same as the preamble is
    // only reached by going back to the very start.
    if (cfg && cfg.closingSuffix && i === _verses.length - 1) return;
  }
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
  _hcjSyncMiniPlayer();
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
  var _playerCfg = _AUDIO_STOTRAMS[_currentStotramId];
  var _hasAudioPlayer = _hcjHasAudioForIdx(_playerCfg, idx);
  // Sectioned stotrams (gg) show one geetam per card — there's no
  // "verse number" to page through within a song, so the prev/next
  // arrows and the seek box are hidden for them below.
  var _isSectionedAudio = !!(_playerCfg && _playerCfg.sectioned);
  if (!_hasAudioPlayer) {
    var oldMinimize = document.getElementById("lm-minimize");
    if (oldMinimize) oldMinimize.remove();
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

  // Prev arrow (left of player) — hidden for sectioned audio (gg)
  if (!_isSectionedAudio) {
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
  }

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

  // Voice switch — only shown when the verse currently being rendered has
  // a voices map available (either stotram-wide, or a per-verse one like
  // rsn's Shlok 150). Cycles through every key in that map, in insertion
  // order. Button shows the label of whichever voice is CURRENTLY selected
  // (not the one tapping would switch to), since with 3+ voices "current"
  // is clearer than "next".
  var _voiceCfg = _AUDIO_STOTRAMS[_currentStotramId];
  var _voiceLabels = { default: "Original", ankit: "Ankit", shuvam: "Shuvam", harindu: "Harindu", alt: "Version 2" };
  var _voiceOffsetHere = (_voiceCfg && _voiceCfg.labelOffset) || 0;
  var _voicesHereForBtn = _voiceCfg ? _hcjVoicesFor(_voiceCfg, idx + 1 - _voiceOffsetHere) : null;
  if (_voicesHereForBtn) {
    var _voiceKeys = Object.keys(_voicesHereForBtn);
    var voiceBtn = document.createElement("button");
    voiceBtn.id = "hcj-voice-btn";
    voiceBtn.className =
      "hcj-mini-btn hcj-mode-btn" + (_hcjVoice !== "default" ? " hcj-mode-active" : "");
    voiceBtn.textContent = _voiceLabels[_hcjVoice] || _hcjVoice;
    voiceBtn.title = "কণ্ঠ পরিবর্তন করুন (" + _voiceKeys.map(function (k) { return _voiceLabels[k] || k; }).join(" / ") + ")";
    voiceBtn.onclick = function () {
      var curIdx = _voiceKeys.indexOf(_hcjVoice);
      var nextVoice = _voiceKeys[(curIdx + 1) % _voiceKeys.length];
      _hcjSetVoice(nextVoice, true);
      _hcjRenderPlayer(_verseIdx);
    };
    row.appendChild(voiceBtn);
  }

  // Verse seek (compact) — hidden for sectioned audio (gg): a geetam is a
  // single card, so there's no verse number within it to seek to.
  if (!_isSectionedAudio) {
    var si = document.createElement("input");
    si.id = "hcj-seek-input";
    si.type = _voiceCfg && _voiceCfg.verseMap ? "text" : "number";
    var _seekOffset = (_voiceCfg && _voiceCfg.labelOffset) || 0;
    // If the last block is a closing/colophon verse with no Shlok number
    // (closingSuffix set), exclude it from the typeable/displayed max —
    // it's only reachable via the next arrow, not by typing a number.
    var _seekClosingExcl = _voiceCfg && _voiceCfg.closingSuffix ? 1 : 0;
    // slokaRange stotrams (e.g. nkc) number 1..N over just the sloka portion,
    // not the whole _verses array (which also includes narrative prose).
    // verseMap stotrams (e.g. hnc) have non-numeric labels ("40.c") — max
    // is the highest purely-numeric label (the chaupai count).
    var _seekMax = _voiceCfg && _voiceCfg.slokaRange
      ? _voiceCfg.slokaRange[1] - _voiceCfg.slokaRange[0] + 1
      : _voiceCfg && _voiceCfg.verseMap
      ? _voiceCfg.verseMap.reduce(function (m, e) {
          var num = e && parseInt(e.label, 10);
          return !isNaN(num) && num > m ? num : m;
        }, 0)
      : _verses.length - _seekOffset - _seekClosingExcl;
    if (_voiceCfg && _voiceCfg.verseMap) {
      si.removeAttribute("min");
      si.removeAttribute("max");
    } else {
      si.min = 1 - _seekOffset;
      si.max = _seekMax;
    }
    si.value = _hcjSeekLabel(idx);
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
    tot.textContent = "/" + _seekMax;
    row.appendChild(tot);
  }

  // Next arrow (right of player) — hidden for sectioned audio (gg)
  if (!_isSectionedAudio) {
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
  }

  wrap.appendChild(row);
  lmd.appendChild(wrap);
  _hcjEnsureMinimizeButton();

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
  const deityToSet = { radha: 'radha', rv: 'rv', kv: 'kv', ss: 'ss', '28': '28', hk: 'hk' };
  const autoSet = filterMode ? deityToSet[filterMode] : null;

  // If we have a specific mode filter AND that mode has data, go straight to per-mala detail
  if (autoSet) {
    const radha = App.S.history[tk] || 0;
    const rv = (App.S.historyRV || {})[tk] || 0;
    const kv = (App.S.historyKV || {})[tk] || 0;
    const ss = (App.S.historySS || {})[tk] || 0;
    const hk = (App.S.historyHK || {})[tk] || 0;
    const taps28 = (App.S.h28 || {})[tk] || 0;
    const hasData = autoSet === 'radha' ? radha > 0
                  : autoSet === 'rv'    ? rv > 0
                  : autoSet === 'kv'    ? kv > 0
                  : autoSet === 'ss'    ? ss > 0
                  : autoSet === 'hk'    ? hk > 0
                  : taps28 > 0;

    // Build a minimal title showing date + mode
    const modeLabel = autoSet === 'radha' ? '🌸 Radha Jap'
                    : autoSet === 'rv'    ? '🌼 Radha Vallabh'
                    : autoSet === 'kv'    ? '🪈 Krishnay Vasudevay'
                    : autoSet === 'ss'    ? '🕉️ Samba Sadashiv'
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
  const kv = (App.S.historyKV || {})[tk] || 0;
  const ss = (App.S.historySS || {})[tk] || 0;
  const hk = App.S.historyHK[tk] || 0;
  const taps28 = App.S.h28[tk] || 0;
  const tSecR = App.S.timerHistory[tk] || 0;
  const tSecRV = App.S.timerHistoryRV[tk] || 0;
  const tSecKV = (App.S.timerHistoryKV || {})[tk] || 0;
  const tSecSS = (App.S.timerHistorySS || {})[tk] || 0;
  const tSecHK = App.S.timerHistoryHK[tk] || 0;
  const t28Sec = App.S.timer28History[tk] || 0;

  const radhaM = Math.floor(radha / ms);
  const rvM = Math.floor(rv / ms);
  const kvM = Math.floor(kv / ms);
  const ssM = Math.floor(ss / ms);
  const hkM = Math.floor(hk / ms);
  const cyc28 = Math.floor(taps28 / 28);
  const grand = isGaudiya ? tSecHK : tSecR + tSecRV + tSecKV + tSecSS + t28Sec;
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
    html += `<div class="pt-grid pt-grid-5">`;
    html += card("pt-radha", "radha", "Radha Jap", radhaM, radhaM === 1 ? "mala" : "malas", fmtN(radha) + " names", _histFmtSec(tSecR), radha > 0);
    html += card("pt-rv",    "rv",    "RV Jap",    rvM,    rvM === 1    ? "mala" : "malas", fmtN(rv)    + " names", _histFmtSec(tSecRV), rv > 0);
    html += card("pt-ss",    "ss",    "Samba Sadashiv", ssM, ssM === 1  ? "mala" : "malas", fmtN(ss)    + " names", _histFmtSec(tSecSS), ss > 0);
    html += card("pt-kv",    "kv",    "KV Jap",    kvM,    kvM === 1    ? "mala" : "malas", fmtN(kv)    + " names", _histFmtSec(tSecKV), kv > 0);
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
  const isTrahimam = App.S.trahimamMode || false;
  const isRamanandi = App.S.ramanandiMode || false;
  const hist = App.S.history || {};
  const histRV = App.S.historyRV || {};
  const histKV = App.S.historyKV || {};
  const histSS = App.S.historySS || {};
  const histHK = App.S.historyHK || {};
  const histRam = App.S.historyRam || {};
  const h28 = App.S.h28 || {};
  const tHist = App.S.timerHistory || {};
  const tHistRV = App.S.timerHistoryRV || {};
  const tHistKV = App.S.timerHistoryKV || {};
  const tHistSS = App.S.timerHistorySS || {};
  const tHistHK = App.S.timerHistoryHK || {};
  const tHistRam = App.S.timerHistoryRam || {};
  const t28Hist = App.S.timer28History || {};

  let totRadha = 0,
    totRV = 0,
    totKV = 0,
    totSS = 0,
    totHK = 0,
    totRam = 0,
    tot28taps = 0,
    totTimeSec = 0,
    totTimeSec28 = 0;
  window._ptRadhaSec = 0;
  window._ptRVSec = 0;
  window._ptKVSec = 0;
  window._ptSSSec = 0;
  window._ptHKSec = 0;
  window._ptRamSec = 0; // reset per-mode time accumulators
  let activeDays = 0;
  tbody.innerHTML = "";

  dates.forEach((tk) => {
    const radha = hist[tk] || 0;
    const rv = histRV[tk] || 0;
    const kv = histKV[tk] || 0;
    const ss = histSS[tk] || 0;
    const hk = histHK[tk] || 0;
    const ram = histRam[tk] || 0;
    const taps28 = h28[tk] || 0;
    const tSecR_row = tHist[tk] || 0;
    const tSecRV_row = tHistRV[tk] || 0;
    const tSecKV_row = tHistKV[tk] || 0;
    const tSecSS_row = tHistSS[tk] || 0;
    const tSecHK_row = tHistHK[tk] || 0;
    const tSecRam_row = tHistRam[tk] || 0;
    const tSec = isGaudiya ? tSecHK_row : isTrahimam ? tSecSS_row : isRamanandi ? tSecRam_row : tSecR_row + tSecRV_row + tSecKV_row;
    const t28Sec = (isGaudiya || isTrahimam || isRamanandi) ? 0 : t28Hist[tk] || 0;
    const totalSec = tSec + t28Sec;

    // Skip empty days depending on mode
    if (isGaudiya) {
      if (hk === 0) return;
    } else if (isTrahimam) {
      if (ss === 0) return;
    } else if (isRamanandi) {
      if (ram === 0) return;
    } else {
      if (radha === 0 && rv === 0 && kv === 0 && taps28 === 0) return;
    }

    activeDays++;
    totRadha += radha;
    totRV += rv;
    totKV += kv;
    totSS += ss;
    totHK += hk;
    totRam += ram;
    tot28taps += taps28;
    totTimeSec += tSec;
    totTimeSec28 += t28Sec;
    window._ptRadhaSec += tSecR_row;
    window._ptRVSec += tSecRV_row;
    window._ptKVSec += tSecKV_row;
    window._ptSSSec += tSecSS_row;
    window._ptHKSec += tSecHK_row;
    window._ptRamSec += tSecRam_row;

    const radhaM = Math.floor(radha / ms);
    const rvM = Math.floor(rv / ms);
    const kvM = Math.floor(kv / ms);
    const ssM = Math.floor(ss / ms);
    const hkM = Math.floor(hk / ms);
    const ramM = Math.floor(ram / ms);
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
    const kvStr = cell(kvM, kvM === 1 ? "mala" : "malas");
    const ssStr = cell(ssM, ssM === 1 ? "mala" : "malas");
    const hkStr = cell(hkM, hkM === 1 ? "mala" : "malas");
    const ramStr = cell(ramM, ramM === 1 ? "mala" : "malas");
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
    } else if (isTrahimam) {
      tr.innerHTML = `
        ${dateCell}
        <td class="hist-kv-col hist-val hist-c-ss">${ssStr}</td>
        <td class="hist-val hist-c-time">${_histFmtSec(totalSec)}</td>
        ${chevCell}
      `;
    } else if (isRamanandi) {
      tr.innerHTML = `
        ${dateCell}
        <td class="hist-ram-col hist-val hist-c-ram">${ramStr}</td>
        <td class="hist-val hist-c-time">${_histFmtSec(totalSec)}</td>
        ${chevCell}
      `;
    } else {
      tr.innerHTML = `
        ${dateCell}
        <td class="hist-radha-col hist-val hist-c-gold">${radhaStr}</td>
        <td class="hist-radha-col hist-val hist-c-rv">${rvStr}</td>
        <td class="hist-radha-col hist-val hist-c-kv">${kvStr}</td>
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
  const totKVM = Math.floor(totKV / ms);
  const totSSM = Math.floor(totSS / ms);
  const totHKM = Math.floor(totHK / ms);
  const totRamM = Math.floor(totRam / ms);
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
  } else if (isTrahimam) {
    totDiv.innerHTML = `
      <div class="pt-head"><span class="pt-head-icon">📊</span><span class="pt-head-title">Period Totals</span><span class="pt-head-range">(${rangeLbl})</span><span class="pt-head-tag">Gopeshwar Mahadev</span></div>
      <div class="pt-grid pt-grid-1">
        ${statCard("pt-ss", "🕉️", "Samba Sadashiv", totSSM, totSSM === 1 ? "mala" : "malas", fmtN(totSS) + " names", _histFmtSec(window._ptSSSec || 0), "ss")}
      </div>
      <div class="pt-total"><span class="pt-total-label">Total Time</span><span class="pt-total-val">${_histFmtSec(grandTotal)}</span></div>
    `;
  } else if (isRamanandi) {
    totDiv.innerHTML = `
      <div class="pt-head"><span class="pt-head-icon">📊</span><span class="pt-head-title">Period Totals</span><span class="pt-head-range">(${rangeLbl})</span><span class="pt-head-tag">Ramanandi</span></div>
      <div class="pt-grid pt-grid-1">
        ${statCard("pt-ram", "🚩", "Raam Vijay Mantra", totRamM, totRamM === 1 ? "mala" : "malas", fmtN(totRam) + " names", _histFmtSec(window._ptRamSec || 0), "ram")}
      </div>
      <div class="pt-total"><span class="pt-total-label">Total Time</span><span class="pt-total-val">${_histFmtSec(grandTotal)}</span></div>
    `;
  } else {
    totDiv.innerHTML = `
      <div class="pt-head"><span class="pt-head-icon">📊</span><span class="pt-head-title">Period Totals</span><span class="pt-head-range">(${rangeLbl})</span></div>
      <div class="pt-grid pt-grid-4">
        ${statCard("pt-radha", "📿", "Radha Jap", totRadhaM, totRadhaM === 1 ? "mala" : "malas", fmtN(totRadha) + " names", _histFmtSec(window._ptRadhaSec || 0), "radha")}
        ${statCard("pt-rv", "🕉️", "RV Jap", totRVM, totRVM === 1 ? "mala" : "malas", fmtN(totRV) + " names", _histFmtSec(window._ptRVSec || 0), "rv")}
        ${statCard("pt-kv", "🪈", "KV Jap", totKVM, totKVM === 1 ? "mala" : "malas", fmtN(totKV) + " names", _histFmtSec(window._ptKVSec || 0), "kv")}
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
    kv:    { label: "KV Jap",       cls: "pt-kv",    icon: "🪈",  color: "#6DB8FF",      histKey: "historyKV", timerKey: "timerHistoryKV", unit: (m) => m === 1 ? "mala" : "malas",  toMain: (v) => Math.floor(v / ms), toSub: (v) => fmtN(v) + " names" },
    ss:    { label: "Samba Sadashiv", cls: "pt-ss",  icon: "🕉️",  color: "#ffb86c",      histKey: "historySS", timerKey: "timerHistorySS", unit: (m) => m === 1 ? "mala" : "malas",  toMain: (v) => Math.floor(v / ms), toSub: (v) => fmtN(v) + " names" },
    ram:   { label: "Raam Vijay Mantra", cls: "pt-ram", icon: "🚩", color: "#FF9933",     histKey: "historyRam", timerKey: "timerHistoryRam", unit: (m) => m === 1 ? "mala" : "malas",  toMain: (v) => Math.floor(v / ms), toSub: (v) => fmtN(v) + " names" },
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
      (e) => e.t === "mala" && e.mode !== "rv" && e.mode !== "hk" && e.mode !== "kv" && e.mode !== "ss" && e.mode !== "ram",
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
  } else if (set === "kv") {
    const kvEntries = log.filter((e) => e.t === "mala" && e.mode === "kv");
    inner += backBtn;
    if (kvEntries.length > 0) {
      inner += _histMalaTable("🪈 KV Jap — Per Mala", kvEntries, "#6DB8FF");
    } else if (isToday && (App.S.malaLogKV || []).length > 0) {
      inner += _histTodayMalaLogTable(
        "🪈 KV Jap — Today's Malas",
        App.S.malaLogKV,
        "#6DB8FF",
      );
    } else {
      inner += `<div style="font-size:11px;color:var(--td);text-align:center;padding:10px 0">Per-mala detail not available for this date</div>`;
    }
  } else if (set === "ss") {
    const ssEntries = log.filter((e) => e.t === "mala" && e.mode === "ss");
    inner += backBtn;
    if (ssEntries.length > 0) {
      inner += _histMalaTable("🕉️ Samba Sadashiv — Per Mala", ssEntries, "#ffb86c");
    } else if (isToday && (App.S.malaLogSS || []).length > 0) {
      inner += _histTodayMalaLogTable(
        "🕉️ Samba Sadashiv — Today's Malas",
        App.S.malaLogSS,
        "#ffb86c",
      );
    } else {
      inner += `<div style="font-size:11px;color:var(--td);text-align:center;padding:10px 0">Per-mala detail not available for this date</div>`;
    }
  } else if (set === "ram") {
    const ramEntries = log.filter((e) => e.t === "mala" && e.mode === "ram");
    inner += backBtn;
    if (ramEntries.length > 0) {
      inner += _histMalaTable("🚩 राम विजय मंत्र — Per Mala", ramEntries, "#FF9933");
    } else if (isToday && (App.S.malaLogRam || []).length > 0) {
      inner += _histTodayMalaLogTable(
        "🚩 राम विजय मंत्र — Today's Malas",
        App.S.malaLogRam,
        "#FF9933",
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
    // Duration MUST match the Mala Log (active chanting time = e.sec).
    // Derive the displayed Start Time by subtracting the active duration from
    // the end timestamp so End − Start === Duration in the table.
    const durationSec = Math.max(1, e.sec || 0);
    const startTs = endTs - durationSec * 1000;
    const even = i % 2 === 0;
    // Always use sequential index (i+1) — e.n can repeat when modes switch
    html += `<tr style="background:${even ? "rgba(0,0,0,0.15)" : "transparent"}">
      <td style="padding:6px 8px;color:${color};font-weight:600">Mala ${i + 1}</td>
      <td style="padding:6px 8px;color:var(--tl)">${_histFmtTime(endTs)}</td>
      <td style="padding:6px 8px;color:var(--td)">${_histFmtTime(startTs)}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--green)">${_histFmtSec(durationSec)}</td>
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
    // Match the log: duration = active chanting time (e.sec). Derive Start
    // Time from End − Duration so the table stays internally consistent.
    const durationSec = Math.max(1, e.sec || 0);
    const startTs = endTs - durationSec * 1000;
    const even = i % 2 === 0;
    html += `<tr style="background:${even ? "rgba(0,0,0,0.15)" : "transparent"}">
      <td style="padding:6px 8px;color:var(--green);font-weight:600">Cycle ${i + 1}</td>
      <td style="padding:6px 8px;color:var(--tl)">${_histFmtTime(endTs)}</td>
      <td style="padding:6px 8px;color:var(--td)">${_histFmtTime(startTs)}</td>
      <td style="padding:6px 8px;text-align:right;color:var(--gold)">${_histFmtSec(durationSec)}</td>
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
  const histKV = App.S.historyKV || {};
  const histSS = App.S.historySS || {};
  const h28 = App.S.h28 || {};
  const tHist = App.S.timerHistory || {};
  const tHistRV = App.S.timerHistoryRV || {};
  const tHistKV = App.S.timerHistoryKV || {};
  const tHistSS = App.S.timerHistorySS || {};
  const t28Hist = App.S.timer28History || {};

  let lines = ["📿 Radha Naam Jap — History Report"];
  lines.push("Period: " + _histFmtDate(from) + " to " + _histFmtDate(to));
  lines.push("─".repeat(42));

  let totR = 0,
    totRV = 0,
    totKV = 0,
    totSS = 0,
    tot28 = 0,
    totT = 0,
    totT28 = 0;
  let days = 0;

  dates.forEach((tk) => {
    const r = hist[tk] || 0,
      rv = histRV[tk] || 0,
      kv = histKV[tk] || 0,
      ss = histSS[tk] || 0,
      t28 = h28[tk] || 0;
    const tR = tHist[tk] || 0,
      tRV = tHistRV[tk] || 0,
      tKV = tHistKV[tk] || 0,
      tSS = tHistSS[tk] || 0,
      t28s = t28Hist[tk] || 0;
    if (r === 0 && rv === 0 && kv === 0 && ss === 0 && t28 === 0) return;
    days++;
    totR += r;
    totRV += rv;
    totKV += kv;
    totSS += ss;
    tot28 += t28;
    totT += tR + tRV + tKV + tSS;
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
    if (ss > 0)
      parts.push(
        "SS: " + Math.floor(ss / ms) + "m (" + ss + ") " + _histFmtSec(tSS),
      );
    if (kv > 0)
      parts.push(
        "KV: " + Math.floor(kv / ms) + "m (" + kv + ") " + _histFmtSec(tKV),
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
    const total = tR + tRV + tKV + tSS + t28s;
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
      ") | SS: " +
      Math.floor(totSS / ms) +
      " malas (" +
      totSS +
      ") | KV: " +
      Math.floor(totKV / ms) +
      " malas (" +
      totKV +
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
    }
    // Set directly on every currently-rendered line too, with priority
    // "important" — plain `lines[j].style.fontSize = value` (the old code)
    // is silently beaten by style-stotram.css's own
    // `.lyr-line { font-size: var(--lyr-fs) !important; }` rule, since a
    // non-important inline style always loses to an !important stylesheet
    // rule. That's why a chosen size never stuck once you moved to the
    // next verse: the CSS var route only carries over if `.lyr` itself is
    // never recreated, and the inline fallback wasn't actually applying.
    // Using setProperty's "important" priority makes the inline style win
    // for real, and this call also gets fired for every fresh verse
    // (_renderVerse calls fitLyrLines()), so it reliably persists now.
    var allLines = modal.querySelectorAll(".lyr-line, .lyr-prose");
    for (var k = 0; k < allLines.length; k++) {
      allLines[k].style.setProperty("font-size", value, "important");
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

window._lbPeriod = 'today';
window._lbUnsubscribe = null;

// Developer-only "Ghost Leaderboard": mirrors Ghost Mode's dev-only
// visibility. When on, the optIn filter is dropped so opted-out
// devotees still show (faded) with a live presence dot. Enforcement is
// server-side via the firestore.rules read rule on leaderboard/{userId}.
window._lbGhostMode = false;

function lbToggleGhostView() {
  if (typeof isDeveloper !== 'function' || !isDeveloper()) return;
  window._lbGhostMode = !window._lbGhostMode;
  const tg = document.getElementById('tgLbGhost');
  if (tg) tg.classList.toggle('on', window._lbGhostMode);
  loadLeaderboard(window._lbPeriod || 'today');
}

function _lbSyncGhostToggleVisibility() {
  const tg = document.getElementById('tgLbGhost');
  if (!tg) return;
  const dev = typeof isDeveloper === 'function' && isDeveloper();
  tg.style.display = dev ? 'block' : 'none';
  if (!dev) window._lbGhostMode = false;
  tg.classList.toggle('on', !!window._lbGhostMode);
}

/** Get the date key prefix for the current period filter */
function _lbGetPeriodKeys(period) {
  const now = new Date(Date.now() + (window._serverTimeOffsetMs || 0));
  const keys = [];
  if (period === 'alltime') return null; // null = use totalJap field (no date filter)
  if (period === 'today') {
    // Always derive the key from the live device clock via App.getTk() so a
    // stale App.S.tk (e.g. viewer's app backgrounded across midnight) doesn't
    // make us sum yesterday's history for every other devotee. Keep App.S.tk
    // in sync as a side-effect so the rest of the UI also refreshes.
    let key = null;
    try {
      if (window.App && typeof window.App.getTk === 'function') {
        key = window.App.getTk();
        if (window.App.S && window.App.S.tk !== key) {
          window.App.S.tk = key;
        }
      }
    } catch(_) {}
    if (!key) {
      const y = now.getFullYear();
      const m = String(now.getMonth()+1).padStart(2,'0');
      const d = String(now.getDate()).padStart(2,'0');
      key = y + '-' + m + '-' + d;
    }
    return [key];
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
  window._lbPeriod = period || 'today';

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

  _lbSyncGhostToggleVisibility();

  try {
    // Real-time snapshot of leaderboard collection. Developer accounts
    // with the Ghost Leaderboard toggle on drop the optIn filter, so
    // devotees who opted out still appear (faded, see renderLeaderboard).
    const _lbUseGhost = window._lbGhostMode && typeof isDeveloper === 'function' && isDeveloper();
    let _lbQuery = fbDb.collection('leaderboard');
    _lbQuery = _lbUseGhost ? _lbQuery.limit(200) : _lbQuery.where('optIn', '==', true).limit(100);
    window._lbUnsubscribe = _lbQuery
      .onSnapshot(function(snap) {
        const docs = [];
        snap.forEach(function(doc) {
          const d = doc.data();
          d._uid = doc.id;
          docs.push(d);
        });
        window._lbLastDocs = docs;
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
  // Efficiency shown on the leaderboard is always TODAY's efficiency
  // (Actual Jap Time ÷ Screen Time, today only) regardless of which period
  // tab is selected — same Today-only scope as the Stats screen. Uses the
  // real current device date (not a possibly-stale d.todayKey from whenever
  // that devotee last pushed) against their per-day timer/screen maps,
  // which are always present in the payload no matter the selected period.
  const _lbTodayKey = _lbGetPeriodKeys('today')[0];
  const _lbTodayEff = function (d) {
    const tHist = d.timerHistory || {}, tHistRV = d.timerHistoryRV || {},
      tHistKV = d.timerHistoryKV || {}, tHistSS = d.timerHistorySS || {},
      tHistHK = d.timerHistoryHK || {}, tHistRam = d.timerHistoryRam || {},
      tHist28 = d.timer28History || {};
    const rawSec = (tHist[_lbTodayKey]||0) + (tHistRV[_lbTodayKey]||0) + (tHistKV[_lbTodayKey]||0)
      + (tHistSS[_lbTodayKey]||0) + (tHistHK[_lbTodayKey]||0) + (tHistRam[_lbTodayKey]||0) + (tHist28[_lbTodayKey]||0);
    // Manual (off-screen, reported-after-the-fact) jap doesn't belong in
    // Efficiency's numerator — same exclusion rule as the Stats screen.
    // Ram (Ramanandi/Ram Vijay Mantra) is now part of rawSec above, so its
    // manual seconds must be subtracted here too, same as every other type.
    const manualSec = ["radha","rv","kv","ss","hk","ram","n28"].reduce(function (s, t) {
      const m = d.manualJapTime && d.manualJapTime[t];
      return s + (m ? (m[_lbTodayKey] || 0) : 0);
    }, 0);
    const japSec = Math.max(0, rawSec - manualSec);
    const scrSec = (d.screenTimeHistory || {})[_lbTodayKey] || 0;
    return { japSec: japSec, scrSec: scrSec };
  };
  const scored = docs.map(function(d) {
    let score = 0;
    let timeScore = 0;
    if (!periodKeys) {
      // All time — use stored totalJap
      score = (d.totalJap || 0);
      timeScore = (d.timerSeconds || 0);
      const sr = Object.values(d.history || {}).reduce((a,b)=>a+b,0);
      const srv = Object.values(d.historyRV || {}).reduce((a,b)=>a+b,0);
      const skv = Object.values(d.historyKV || {}).reduce((a,b)=>a+b,0);
      const sss = Object.values(d.historySS || {}).reduce((a,b)=>a+b,0);
      const shk = Object.values(d.historyHK || {}).reduce((a,b)=>a+b,0);
      const sram = Object.values(d.historyRam || {}).reduce((a,b)=>a+b,0);
      const s28 = Object.values(d.history28 || {}).reduce((a,b)=>a+b,0);
      // Net each type against its own deduct counter (gifts/manual deducts) —
      // matches how totalJap itself was computed in pushLeaderboard(), so the

      // breakdown always adds up to the same Total shown alongside it.
      d._breakdown = {
        r:   Math.max(0, sr  - (d.nameJapDeduct   || 0)),
        rv:  Math.max(0, srv - (d.nameJapDeductRV || 0)),
        kv:  Math.max(0, skv - (d.nameJapDeductKV || 0)),
        ss:  Math.max(0, sss - (d.nameJapDeductSS || 0)),
        hk:  Math.max(0, shk - (d.nameJapDeductHK || 0)),
        ram: Math.max(0, sram - (d.nameJapDeductRam || 0)),
        n28: Math.max(0, s28 - (d.nameJapDeduct28 || 0)),
      };
      // How much of each type was gifted/manually deducted — shown next to
      // the netted count so the numbers stay legible: the malas count is
      // netted (post-gift) but the chanting TIME below is raw/lifetime, so
      // without this note a small malas count next to a long chanting time
      // looks like a mismatch instead of "gifted most of it away".
      d._giftedBreakdown = {
        r:   Math.min(sr,  d.nameJapDeduct   || 0),
        rv:  Math.min(srv, d.nameJapDeductRV || 0),
        kv:  Math.min(skv, d.nameJapDeductKV || 0),
        ss:  Math.min(sss, d.nameJapDeductSS || 0),
        hk:  Math.min(shk, d.nameJapDeductHK || 0),
        ram: Math.min(sram, d.nameJapDeductRam || 0),
        n28: Math.min(s28, d.nameJapDeduct28 || 0),
      };
      const tr2 = Object.values(d.timerHistory || {}).reduce((a,b)=>a+b,0);
      const trv2 = Object.values(d.timerHistoryRV || {}).reduce((a,b)=>a+b,0);
      const tkv2 = Object.values(d.timerHistoryKV || {}).reduce((a,b)=>a+b,0);
      const tss2 = Object.values(d.timerHistorySS || {}).reduce((a,b)=>a+b,0);
      const thk2 = Object.values(d.timerHistoryHK || {}).reduce((a,b)=>a+b,0);
      const tram2 = Object.values(d.timerHistoryRam || {}).reduce((a,b)=>a+b,0);
      const t282 = Object.values(d.timer28History || {}).reduce((a,b)=>a+b,0);
      d._timeBreakdown = { r: tr2, rv: trv2, kv: tkv2, ss: tss2, hk: thk2, ram: tram2, n28: t282 };
      // Screen Time (alltime) — stored total, or summed from the per-day history
      d._screenTimeSec = Number(d.screenTimeSeconds || 0) ||
        Object.values(d.screenTimeHistory || {}).reduce((a,b)=>a+b,0);
    } else {
      // Sum history for this period
      const hist   = d.history || {};
      const histRV = d.historyRV || {};
      const histKV = d.historyKV || {};
      const histSS = d.historySS || {};
      const histHK = d.historyHK || {};
      const histRam = d.historyRam || {};
      const hist28 = d.history28 || {};
      let sr = 0, srv = 0, skv = 0, sss = 0, shk = 0, sram = 0, s28 = 0;
      let tr = 0, trv = 0, tkv = 0, tss = 0, thk = 0, tram = 0, t28 = 0;
      const tHist = d.timerHistory || {};
      const tHistRV = d.timerHistoryRV || {};
      const tHistKV = d.timerHistoryKV || {};
      const tHistSS = d.timerHistorySS || {};
      const tHistHK = d.timerHistoryHK || {};
      const tHistRam = d.timerHistoryRam || {};
      const tHist28 = d.timer28History || {};
      if (period === 'today' && d.todayKey === periodKeys[0] && Number(d.todayJap || 0) > 0) {
        const bd = d.todayBreakdown || {};
        const tbd = d.todayTimeBreakdown || {};
        sr = bd.r || 0;
        srv = bd.rv || 0;
        skv = bd.kv || 0;
        sss = bd.ss || 0;
        shk = bd.hk || 0;
        sram = bd.ram || 0;
        s28 = bd.n28 || 0;
        tr = tbd.r || 0;
        trv = tbd.rv || 0;
        tkv = tbd.kv || 0;
        tss = tbd.ss || 0;
        thk = tbd.hk || 0;
        tram = tbd.ram || 0;
        t28 = tbd.n28 || 0;
      } else {
        periodKeys.forEach(function(k) {
          sr += (hist[k] || 0);
          srv += (histRV[k] || 0);
          skv += (histKV[k] || 0);
          sss += (histSS[k] || 0);
          shk += (histHK[k] || 0);
          sram += (histRam[k] || 0);
          s28 += (hist28[k] || 0);
          tr += (tHist[k] || 0);
          trv += (tHistRV[k] || 0);
          tkv += (tHistKV[k] || 0);
          tss += (tHistSS[k] || 0);
          thk += (tHistHK[k] || 0);
          tram += (tHistRam[k] || 0);
          t28 += (tHist28[k] || 0);
        });
      }
      score += sr + srv + skv + sss + shk + sram + s28;
      timeScore += tr + trv + tkv + tss + thk + tram + t28;
      d._breakdown = { r: sr, rv: srv, kv: skv, ss: sss, hk: shk, ram: sram, n28: s28 };
      d._giftedBreakdown = { r: 0, rv: 0, kv: 0, ss: 0, hk: 0, ram: 0, n28: 0 };
      d._timeBreakdown = { r: tr, rv: trv, kv: tkv, ss: tss, hk: thk, ram: tram, n28: t28 };
      // Screen Time for this period — flat per-day map, sum across periodKeys
      const tScr = d.screenTimeHistory || {};
      d._screenTimeSec = periodKeys.reduce((s, k) => s + (tScr[k] || 0), 0);
    }
    const _todayEff = _lbTodayEff(d);
    return { ...d, score, timeScore, _effTodaySec: _todayEff.japSec, _effTodayScrSec: _todayEff.scrSec };
  });

  // Sort descending. Lifetime keeps everyone (even devotees who haven't
  // logged jap yet — the leaderboard is also a roster for that view), for
  // BOTH normal and Ghost Leaderboard (developer-only) view. Today/Week/Month
  // drop anyone with zero jap in that window in both views too, so the list
  // only shows who's actually active for the period being viewed — Ghost
  // mode no longer bypasses this, it only changes which docs are queried.
  const _lbIsLifetime = !periodKeys; // null periodKeys = alltime
  const filtered = scored
    .filter(function(d) { return _lbIsLifetime || d.score > 0; })
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
    const isOptedOut = d.optIn !== true; // only ever true in Ghost Leaderboard view
    const medal = rank <= 3 ? medals[rank-1] : null;
    const badgeClass = rank === 1 ? 'lb-badge-1' : rank === 2 ? 'lb-badge-2' : rank === 3 ? 'lb-badge-3' : 'lb-badge-n';
    const badgeContent = medal ? medal : rank;
    const rowClass = 'lb-row' + (isMe ? ' lb-row-me' : '') + (isTop3 ? ' lb-row-top3' : '') + (isOptedOut ? ' lb-row-ghost' : '');
    const nameClass = 'lb-name' + (isMe ? ' lb-name-me' : '');
    const meMark = isMe ? ' ✦ You' : '';
    
    const nowMs = Date.now();
    let isOnline = false;
    if (d.lastActive) isOnline = (nowMs - d.lastActive.toDate().getTime()) < 5 * 60 * 1000;
    else if (d.updatedAt) isOnline = (nowMs - d.updatedAt.toDate().getTime()) < 5 * 60 * 1000;
    const onlineDot = isOnline ? '<span style="display:inline-block;width:8px;height:8px;background:#4ade80;border-radius:50%;margin-left:6px;box-shadow:0 0 6px rgba(74,222,128,0.6)" title="Online"></span>' : '';
    
    const name = (d.displayName || 'Anonymous Devotee').replace(/</g,'&lt;').replace(/>/g,'&gt;') + onlineDot;
    const ms = App.S.ms || 108;
    
    let b = d._breakdown || { r:0, rv:0, kv:0, ss:0, hk:0, ram:0, n28:0 };
    let g = d._giftedBreakdown || { r:0, rv:0, kv:0, ss:0, hk:0, ram:0, n28:0 };
    let tb = d._timeBreakdown || { r:0, rv:0, kv:0, ss:0, hk:0, ram:0, n28:0 };

    // Quality of Jap (Q) — raw average seconds-per-jap for this type, no
    // comparison against any target: slower (bigger number) = more nectar.
    const _lbQ = (sec, cnt) => (cnt > 0 && sec > 0) ? ' · Q:' + (sec / cnt).toFixed(1) + 's' : '';

    // Build per-type breakdown: R, RV, KV show malas (count/108), 28N shows
    // cycles (count/28), HK shows malas. Each line is the NETTED (post-gift)
    // amount — matching Total/ranking — with a "🎁 gifted" note appended
    // when something was given away, so a small count next to a long
    // chanting time reads as "gifted most of it" instead of a mismatch.
    let bdParts = [];
    if (b.r > 0 || g.r > 0) {
      const rM = Math.floor(b.r / ms);
      const rStr = _lbFmtJap(b.r) + (rM > 0 ? ' (' + rM + 'M)' : '');
      const giftNote = g.r > 0 ? ' · 🎁' + _lbFmtJap(g.r) + ' gifted' : '';
      bdParts.push('R: ' + rStr + (tb.r > 0 ? ' ⏱ ' + _histFmtSec(tb.r) : '') + giftNote + _lbQ(tb.r, b.r));
    }
    if (b.rv > 0 || g.rv > 0) {
      const rvM = Math.floor(b.rv / ms);
      const rvStr = _lbFmtJap(b.rv) + (rvM > 0 ? ' (' + rvM + 'M)' : '');
      const giftNote = g.rv > 0 ? ' · 🎁' + _lbFmtJap(g.rv) + ' gifted' : '';
      bdParts.push('RV: ' + rvStr + (tb.rv > 0 ? ' ⏱ ' + _histFmtSec(tb.rv) : '') + giftNote + _lbQ(tb.rv, b.rv));
    }
    if (b.kv > 0 || g.kv > 0) {
      const kvM = Math.floor(b.kv / ms);
      const kvStr = _lbFmtJap(b.kv) + (kvM > 0 ? ' (' + kvM + 'M)' : '');
      const giftNote = g.kv > 0 ? ' · 🎁' + _lbFmtJap(g.kv) + ' gifted' : '';
      bdParts.push('KV: ' + kvStr + (tb.kv > 0 ? ' ⏱ ' + _histFmtSec(tb.kv) : '') + giftNote + _lbQ(tb.kv, b.kv));
    }
    if (b.ss > 0 || g.ss > 0) {
      const ssM = Math.floor(b.ss / ms);
      const ssStr = _lbFmtJap(b.ss) + (ssM > 0 ? ' (' + ssM + 'M)' : '');
      const giftNote = g.ss > 0 ? ' · 🎁' + _lbFmtJap(g.ss) + ' gifted' : '';
      bdParts.push('SS: ' + ssStr + (tb.ss > 0 ? ' ⏱ ' + _histFmtSec(tb.ss) : '') + giftNote + _lbQ(tb.ss, b.ss));
    }
    if (b.n28 > 0 || g.n28 > 0) {
      const cyc28 = Math.floor(b.n28 / 28);
      const cyc28Str = (cyc28 > 0 ? cyc28 + 'C ' : '') + '(' + _lbFmtJap(b.n28) + ')';
      const giftNote = g.n28 > 0 ? ' · 🎁' + _lbFmtJap(g.n28) + ' gifted' : '';
      bdParts.push('28N: ' + cyc28Str + (tb.n28 > 0 ? ' ⏱ ' + _histFmtSec(tb.n28) : '') + giftNote + _lbQ(tb.n28, b.n28));
    }
    if (b.hk > 0 || g.hk > 0) {
      const hkM = Math.floor(b.hk / ms);
      const hkStr = _lbFmtJap(b.hk) + (hkM > 0 ? ' (' + hkM + 'M)' : '');
      const giftNote = g.hk > 0 ? ' · 🎁' + _lbFmtJap(g.hk) + ' gifted' : '';
      bdParts.push('HK: ' + hkStr + (tb.hk > 0 ? ' ⏱ ' + _histFmtSec(tb.hk) : '') + giftNote + _lbQ(tb.hk, b.hk));
    }
    if (b.ram > 0 || g.ram > 0) {
      const ramM = Math.floor(b.ram / ms);
      const ramStr = _lbFmtJap(b.ram) + (ramM > 0 ? ' (' + ramM + 'M)' : '');
      const giftNote = g.ram > 0 ? ' · 🎁' + _lbFmtJap(g.ram) + ' gifted' : '';
      bdParts.push('RAM: ' + ramStr + (tb.ram > 0 ? ' ⏱ ' + _histFmtSec(tb.ram) : '') + giftNote + _lbQ(tb.ram, b.ram));
    }
    // Total: only count R+RV+SS+HK+RAM malas (not 28N), 28N shown as cycles separately
    const japOnly = (b.r || 0) + (b.rv || 0) + (b.ss || 0) + (b.hk || 0) + (b.ram || 0);
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
    // Screen Time + Efficiency (E) — always TODAY's efficiency regardless of
    // which period tab is selected (Actual Jap Time ÷ Screen Time × 100,
    // today only), same scope as the Stats screen's Efficiency panel.
    const effJapSec = d._effTodaySec || 0;
    const effScrSec = d._effTodayScrSec || 0;
    if (effScrSec > 0) totalStr += ' · 📱' + _histFmtSec(effScrSec);
    if (effScrSec > 0 && effJapSec > 0) {
      const effPct = Math.min(100, Math.round((effJapSec / effScrSec) * 1000) / 10);
      totalStr += ' · E:' + effPct + '%';
    }
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

/** Wait until App._cloudHydrated is confirmed true (or timeout). Replaces
 *  blind fixed-delay guesses ("6 seconds should be enough") with an actual
 *  check of the real hydration flag, so we never push stale/partial state. */
function _waitForCloudHydration(maxWaitMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check() {
      if (App._cloudHydrated) return resolve(true);
      if (Date.now() - start >= maxWaitMs) return resolve(false);
      setTimeout(check, 300);
    })();
  });
}

/** Push current user's data to the leaderboard collection */
async function pushLeaderboard() {
  if (!fbUser || !fbDb) return;
  if (isGhostMode()) return; // ghost mode: read-only
  // CRITICAL: never read/write the leaderboard from a half-loaded App.S.
  // Before the cloud pull (fbMigrate) finishes, App.S.lbOptIn/history/etc.
  // may still hold defaults (e.g. lbOptIn:false) or a partial local cache,
  // not the user's real data. Pushing at that point can wrongly DELETE a
  // real opt-in entry, or overwrite it with an incomplete score. Bail out
  // until App._cloudHydrated is confirmed true; callers that fire on a
  // fixed timer should await _waitForCloudHydration() first (see below).
  if (!App._cloudHydrated) return;
  // NOTE: previously deleted the leaderboard doc entirely on opt-out.
  // Now we keep pushing full data regardless of opt-in state, just
  // flipping the optIn flag below — the public query stays filtered to
  // optIn:true so opted-out devotees still vanish from the normal Family
  // view, but their data survives for the developer-only Ghost
  // Leaderboard toggle. firestore.rules restricts reads of optIn:false
  // docs to the owner/developers.

  const payload = _buildLeaderboardPayload(App.S, fbUser);
  try {
    await fbDb.collection('leaderboard').doc(fbUser.uid).set(payload);
  } catch(e) {
    console.warn('pushLeaderboard error:', e && e.message ? e.message : e);
  }
}

// ── Shared leaderboard-payload builder ─────────────────────────
// Extracted out of pushLeaderboard() so the exact same scoring/streak/
// breakdown math can be reused by devBackfillMissingLeaderboardDocs()
// against a UID that isn't the currently signed-in user — one formula,
// never two copies that can drift apart.
//   S        — a state object shaped like App.S (history/historyRV/.../
//              timerHistory/.../screenTimeHistory, etc.) — either the
//              live App.S, or a plain snapshot read from another user's
//              users/{uid}/data/main doc.
//   userInfo — { displayName, email } fallback for the name field when
//              S.lbDisplayName isn't set (pass fbUser for self-push, or
//              whatever name/email Ghost Mode already knows for a backfill).
//   forceOptIn — when set, overrides S.lbOptIn (used by backfill so a
//              never-before-seen doc always defaults to opted OUT, never
//              silently opting someone into the public board on their behalf).
function _buildLeaderboardPayload(S, userInfo, forceOptIn) {
  S = S || {};
  // Use a live date key when publishing leaderboard data; a stale S.tk
  // (device left open across midnight, or a snapshot read cold) shouldn't
  // be trusted as "today".
  const liveTk = (window.App && typeof App.getTk === 'function') ? App.getTk() : (S.tk || '');

  // Compute lifetime totals
  const hist   = S.history   || {};
  const histRV = S.historyRV || {};
  const histKV = S.historyKV || {};
  const histSS = S.historySS || {};
  const histHK = S.historyHK || {};
  const histRam = S.historyRam || {};
  const hist28 = S.h28 || {};
  const totalRadha = Object.values(hist).reduce((a,b)=>a+b,0);
  const totalRV    = Object.values(histRV).reduce((a,b)=>a+b,0);
  const totalKV    = Object.values(histKV).reduce((a,b)=>a+b,0);
  const totalSS    = Object.values(histSS).reduce((a,b)=>a+b,0);
  const totalHK    = Object.values(histHK).reduce((a,b)=>a+b,0);
  const totalRam   = Object.values(histRam).reduce((a,b)=>a+b,0);
  const total28    = Object.values(hist28).reduce((a,b)=>a+b,0);
  const totalJap   = Math.max(0, totalRadha + totalRV + totalKV + totalSS + totalHK + totalRam + total28 - (S.nameJapDeduct||0) - (S.nameJapDeductRV||0) - (S.nameJapDeductKV||0) - (S.nameJapDeductSS||0) - (S.nameJapDeductHK||0) - (S.nameJapDeductRam||0) - (S.nameJapDeduct28||0));

  // Build display name
  let displayName = (S.lbDisplayName || '').trim();
  if (!displayName && userInfo) {
    displayName = (userInfo.displayName || (userInfo.email || '').split('@')[0] || 'Anonymous Devotee').slice(0,30);
  }
  if (!displayName) displayName = 'Anonymous Devotee';

  // Compute streak from S (reuse existing streak logic)
  let streak = 0;
  try {
    const tk = liveTk || S.tk;
    const allHist = {};
    Object.keys({...hist,...histRV,...histKV,...histSS,...histHK,...histRam}).forEach(function(k) {
      allHist[k] = (hist[k]||0)+(histRV[k]||0)+(histKV[k]||0)+(histSS[k]||0)+(histHK[k]||0)+(histRam[k]||0);
    });
    const today = new Date(tk+'T00:00:00');
    let d = new Date(today);
    while(true) {
      const key = App.tkFromDate(d);
      const dayJap = allHist[key] || 0;
      const target = S.dt || S.dtRV || S.dtKV || S.dtHK || 0;
      if (dayJap <= 0 || (target > 0 && dayJap < target)) break;
      streak++;
      d.setDate(d.getDate()-1);
      if (streak > 3650) break;
    }
  } catch(_) {}

  const todayBreakdown = {
    r: hist[liveTk] || 0,
    rv: histRV[liveTk] || 0,
    kv: histKV[liveTk] || 0,
    ss: histSS[liveTk] || 0,
    hk: histHK[liveTk] || 0,
    ram: histRam[liveTk] || 0,
    n28: hist28[liveTk] || 0,
  };
  const todayTimeBreakdown = {
    r: (S.timerHistory || {})[liveTk] || 0,
    rv: (S.timerHistoryRV || {})[liveTk] || 0,
    kv: (S.timerHistoryKV || {})[liveTk] || 0,
    ss: (S.timerHistorySS || {})[liveTk] || 0,
    hk: (S.timerHistoryHK || {})[liveTk] || 0,
    ram: (S.timerHistoryRam || {})[liveTk] || 0,
    n28: (S.timer28History || {})[liveTk] || 0,
  };
  const todayJap = todayBreakdown.r + todayBreakdown.rv + todayBreakdown.kv + todayBreakdown.ss + todayBreakdown.hk + todayBreakdown.ram + todayBreakdown.n28;
  const todayTimerSeconds = todayTimeBreakdown.r + todayTimeBreakdown.rv + todayTimeBreakdown.kv + todayTimeBreakdown.ss + todayTimeBreakdown.hk + todayTimeBreakdown.ram + todayTimeBreakdown.n28;

  return {
    displayName,
    totalJap,
    totalMalas: Math.floor(totalJap / (S.ms || 108)),
    streak,
    optIn: typeof forceOptIn === 'boolean' ? forceOptIn : !!S.lbOptIn,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    todayKey: liveTk,
    todayJap,
    todayTimerSeconds,
    todayBreakdown,
    todayTimeBreakdown,
    // Store per-day histories so month/week filtering works
    history:   hist,
    historyRV: histRV,
    historyKV: histKV,
    historySS: histSS,
    historyHK: histHK,
    historyRam: histRam,
    history28: hist28,
    // Push each type's own deduct counter too, so the leaderboard breakdown
    // (R/RV/KV/SS/HK/28N) can be netted the same way totalJap is — otherwise
    // the breakdown shows raw pre-gift totals while totalJap shows the net
    // remaining amount, which can make Total look smaller than one of its
    // own listed parts.
    nameJapDeduct:   S.nameJapDeduct   || 0,
    nameJapDeductRV: S.nameJapDeductRV || 0,
    nameJapDeductKV: S.nameJapDeductKV || 0,
    nameJapDeductSS: S.nameJapDeductSS || 0,
    nameJapDeductHK: S.nameJapDeductHK || 0,
    nameJapDeductRam: S.nameJapDeductRam || 0,
    nameJapDeduct28: S.nameJapDeduct28 || 0,
    // Push total timer seconds for leaderboard display
    timerSeconds: Object.values(S.timerHistory || {}).reduce((a,b)=>a+b,0) +
                  Object.values(S.timerHistoryRV || {}).reduce((a,b)=>a+b,0) +
                  Object.values(S.timerHistoryKV || {}).reduce((a,b)=>a+b,0) +
                  Object.values(S.timerHistorySS || {}).reduce((a,b)=>a+b,0) +
                  Object.values(S.timerHistoryHK || {}).reduce((a,b)=>a+b,0) +
                  Object.values(S.timerHistoryRam || {}).reduce((a,b)=>a+b,0) +
                  Object.values(S.timer28History || {}).reduce((a,b)=>a+b,0),
    timerHistory:   S.timerHistory || {},
    timerHistoryRV: S.timerHistoryRV || {},
    timerHistoryKV: S.timerHistoryKV || {},
    timerHistorySS: S.timerHistorySS || {},
    timerHistoryHK: S.timerHistoryHK || {},
    timerHistoryRam: S.timerHistoryRam || {},
    timer28History: S.timer28History || {},
    // Screen Time — per-day history so period filtering (today/week/month)
    // works the same way as the jap-time histories above. Used to compute
    // Efficiency (E) on the leaderboard: Actual Jap Time ÷ Screen Time.
    screenTimeHistory: S.screenTimeHistory || {},
    screenTimeSeconds: Object.values(S.screenTimeHistory || {}).reduce((a,b)=>a+b,0),
    // Manual (off-screen, reported-after-the-fact) jap seconds per type/date —
    // pushed so the leaderboard's Efficiency figure can exclude them the same
    // way the Stats screen does, instead of crediting untracked screen usage.
    manualJapTime: S.manualJapTime || { radha: {}, rv: {}, kv: {}, ss: {}, hk: {}, ram: {}, n28: {} },
    // Marks this doc as machine-generated from a raw data snapshot rather
    // than pushed live by the owner's own device — lets the UI/support flag
    // it distinctly from a normal opt-in if that's ever useful later.
    _backfilled: forceOptIn !== undefined ? true : false,
  };
}

// ── One-click admin backfill: create a leaderboard doc for any real user
// (found via the users/*/data collection-group scan) who doesn't have one
// yet — e.g. Jhara Barman: real signed-in account, real chanted data, but
// no leaderboard doc because the old app build she's on never created one.
// Always opts them out (optIn:false) by default — this never publishes
// someone to the public Family view without their own action; it only
// makes their entry exist so the developer-only Ghost Leaderboard toggle
// can reveal it. Never overwrites an existing doc.
window.devBackfillMissingLeaderboardDocs = async function () {
  if (!isDeveloper()) return;
  if (!fbDb) return;
  toast('🔧 Scanning for users missing a leaderboard entry…');
  let created = 0, scanned = 0, failed = 0;
  try {
    const existingSnap = await fbDb.collection('leaderboard').get();
    const haveLb = new Set();
    existingSnap.forEach(doc => haveLb.add(doc.id));

    const dataSnap = await fbDb.collectionGroup('data').get();
    const uidsToCheck = [];
    dataSnap.forEach(doc => {
      const uid = doc.ref.parent.parent ? doc.ref.parent.parent.id : null;
      if (uid && !haveLb.has(uid)) uidsToCheck.push({ uid, data: doc.data() });
    });

    for (const { uid, data } of uidsToCheck) {
      scanned++;
      try {
        // Re-check per-uid right before writing — belt-and-braces against a
        // doc that appeared mid-scan (e.g. that user logged in just now and
        // the new unconditional login-time pushLeaderboard() beat us to it).
        const already = await fbDb.collection('leaderboard').doc(uid).get();
        if (already.exists) continue;
        const payload = _buildLeaderboardPayload(data, { displayName: data.lbDisplayName || '' }, false);
        // _buildLeaderboardPayload() always stamps updatedAt to "right now"
        // (it's designed for a live user actually chanting), which makes
        // the leaderboard's green "online" dot light up (isOnline checks
        // updatedAt within the last 5 minutes). For a backfilled legacy
        // account that hasn't opened the app in weeks, that's a false
        // "online now" signal — and since a batch of these all get written
        // within the same few seconds, they'd all light up together, which
        // is exactly what was seen. Drop it so backfilled entries show no
        // online status instead of a fake one.
        delete payload.updatedAt;
        await fbDb.collection('leaderboard').doc(uid).set(payload);
        created++;
      } catch (e) {
        failed++;
        console.warn('Backfill failed for', uid, e && e.message);
      }
    }
  } catch (e) {
    toast('⚠️ Backfill scan failed: ' + (e.message || e));
    return;
  }
  toast(`✅ Backfill done — ${created} new leaderboard entr${created === 1 ? 'y' : 'ies'} created (${scanned} scanned${failed ? ', ' + failed + ' failed' : ''})`);
  // Refresh the leaderboard view if currently visible
  const vlb = document.getElementById('vlb');
  if (vlb && vlb.classList.contains('active')) {
    loadLeaderboard(window._lbPeriod || 'today');
  }
};

// ── Backfill missing presence docs for real users on old app builds ────
// Same rationale as devBackfillMissingLeaderboardDocs(): a user whose data
// exists (users/{uid}/data/main is real) but who never got a presence doc
// written (old app build predates _writePresenceHeartbeat, or a heartbeat
// write got interrupted) is invisible to the "presence" ghost-list source
// and to any Family/online-status view keyed off presence. This creates a
// best-effort doc so they at least show up — never touches an existing doc.
//
// Caveat: unlike the live heartbeat (which has a real signed-in `user`
// object with displayName/email/phoneNumber from Firebase Auth), the
// client SDK has no access to OTHER users' Auth profiles — only Admin SDK
// can call admin.auth().getUser(uid). So name/email here are best-effort,
// pulled from whatever this user's own feedbacks/leaderboard docs already
// contain. If none exist, the row still gets created (uid-only, blank
// name) — good enough to be found and ghost-mode-viewed, not a substitute
// for the real profile.
window.devBackfillMissingPresenceDocs = async function () {
  if (!isDeveloper()) return;
  if (!fbDb) return;
  toast('🔧 Scanning for users missing a presence entry…');
  let created = 0, scanned = 0, failed = 0;
  try {
    const presSnap = await fbDb.collection('presence').get();
    const havePres = new Set();
    presSnap.forEach(doc => havePres.add(doc.id));

    const dataSnap = await fbDb.collectionGroup('data').get();
    const uidsToCheck = [];
    dataSnap.forEach(doc => {
      const uid = doc.ref.parent.parent ? doc.ref.parent.parent.id : null;
      if (uid && !havePres.has(uid)) uidsToCheck.push({ uid, data: doc.data() });
    });

    const fbSnap = await fbDb.collection('feedbacks').get();
    const feedbackByUid = {};
    fbSnap.forEach(doc => { feedbackByUid[doc.id] = doc.data(); });
    const lbSnap = await fbDb.collection('leaderboard').get();
    const lbByUid = {};
    lbSnap.forEach(doc => { lbByUid[doc.id] = doc.data(); });

    for (const { uid, data } of uidsToCheck) {
      scanned++;
      try {
        // Re-check per-uid right before writing — belt-and-braces against a
        // doc that appeared mid-scan (matches the leaderboard backfill).
        const already = await fbDb.collection('presence').doc(uid).get();
        if (already.exists) continue;
        const fb = feedbackByUid[uid] || {};
        const lb = lbByUid[uid] || {};
        const payload = {
          uid,
          name:  fb.userName  || lb.displayName || data.lbDisplayName || '',
          email: fb.userEmail || lb.email || '',
          phone: fb.userPhone || '',
          appVersion: lb.appVersion || 'unknown (backfilled)',
          lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        };
        await fbDb.collection('presence').doc(uid).set(payload, { merge: true });
        created++;
      } catch (e) {
        failed++;
        console.warn('Presence backfill failed for', uid, e && e.message);
      }
    }
  } catch (e) {
    toast('⚠️ Presence backfill scan failed: ' + (e.message || e));
    return;
  }
  toast(`✅ Presence backfill done — ${created} new entr${created === 1 ? 'y' : 'ies'} created (${scanned} scanned${failed ? ', ' + failed + ' failed' : ''})`);
};

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
    await pushLeaderboard(); // flips optIn:false only — entry is kept, never deleted
  }
  // Refresh if the leaderboard view is currently visible
  const vlb = document.getElementById('vlb');
  if (vlb && vlb.classList.contains('active')) {
    loadLeaderboard(window._lbPeriod || 'today');
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
  populateDriveBackupUI();
}

function populateDriveBackupUI() {
  const tg = document.getElementById('tgDriveBackupDaily');
  if (tg) tg.classList.toggle('on', !!App.S.driveBackupDailyEnabled);
  const timeIn = document.getElementById('driveBackupTimeIn');
  const timeRow = document.getElementById('driveBackupTimeRow');
  if (timeRow) timeRow.style.display = App.S.driveBackupDailyEnabled ? 'flex' : 'none';
  if (timeIn) {
    const hh = String(App.S.driveBackupHour ?? 3).padStart(2, '0');
    const mm = String(App.S.driveBackupMinute ?? 0).padStart(2, '0');
    timeIn.value = hh + ':' + mm;
  }
}

// Stages the chosen backup hour/minute into CapacitorKV so background/
// runner.js (which has no access to App.S or the WebView) can read them
// on its next periodicSync wake. Device-local time — runner.js compares
// against `new Date()` in its own JS context, which is the same device
// clock/timezone, so no UTC conversion is needed here.
async function _stageDriveBackupTime() {
  if (!window.Capacitor?.Plugins?.CapacitorKV) return;
  try {
    await window.Capacitor.Plugins.CapacitorKV.set({
      key: 'bgsync_drive_backup_hour',
      value: String(App.S.driveBackupHour ?? 3),
    });
    await window.Capacitor.Plugins.CapacitorKV.set({
      key: 'bgsync_drive_backup_minute',
      value: String(App.S.driveBackupMinute ?? 0),
    });
  } catch (_) {}
}

// Called when the person changes the <input type="time"> in Settings.
function saveDriveBackupTime(timeInputEl) {
  const val = timeInputEl && timeInputEl.value; // "HH:MM"
  if (!val) return;
  const [hh, mm] = val.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return;
  App.S.driveBackupHour = hh;
  App.S.driveBackupMinute = mm;
  App.save();
  _stageDriveBackupTime();
  const hh12 = ((hh % 12) || 12);
  const ampm = hh < 12 ? 'AM' : 'PM';
  toast('Daily backup time set to ' + hh12 + ':' + String(mm).padStart(2, '0') + ' ' + ampm);
}

// Daily Auto-Backup toggle (Settings > Google Drive Backup). When turned
// on, fbPushFull() starts staging a fresh backup JSON into CapacitorKV
// every sync — picked up once a day by background/runner.js, at
// (roughly) the time chosen via saveDriveBackupTime() above. Turning it
// off clears the staged payload so a stale/off backup can't sneak through
// on the next scheduled run.
async function toggleDriveBackupDaily() {
  if (!fbUser) {
    toast('Sign in with Google first to enable Drive auto-backup.');
    return;
  }
  App.S.driveBackupDailyEnabled = !App.S.driveBackupDailyEnabled;
  populateDriveBackupUI();
  App.save();
  if (App.S.driveBackupDailyEnabled) {
    toast('☁️ Daily Drive auto-backup enabled');
    _stageDriveBackupTime();
    fbPushFull().catch((e) => console.warn('fbPushFull after enabling drive backup:', e));
  } else {
    toast('Daily Drive auto-backup turned off');
    if (window.Capacitor?.Plugins?.CapacitorKV) {
      // .delete() was never confirmed to exist on this plugin anywhere
      // else in the codebase — only .set()/.get() are. Setting the value
      // to an empty string is just as effective here: runner.js's
      // `if (driveBackupJson)` check already treats "" as falsy, so an
      // empty staged payload is skipped exactly like a missing one.
      try { await window.Capacitor.Plugins.CapacitorKV.set({ key: 'bgsync_drive_payload', value: '' }); } catch (_) {}
    }
  }
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
  gurudev:{ id: 'bgGurudev',      stateKey: 'bgGurudev',      folder: 'gurudev',        maxNum: 9, fallback: 'gurudev.png' },
  // Bhagavadik Bank background — only applied while Gaudiya/ISKCON mode is on
  // (see applyBgPhotos below). Built-in choices live in /iskcon_gaudiya_bank/1.jpg,
  // 2.jpg, etc. — drop numbered images there to add more built-in options.
  bank:   { id: 'bbImg',          stateKey: 'bgBank',         folder: 'iskcon_gaudiya_bank', maxNum: 5, fallback: 'bhagavadik-bank.png' },
  // Top Gaudiya/ISKCON deity (Sri Chaitanya Mahaprabhu by default) — same slot
  // Radha Vallabh occupies in default mode. Built-in choices live in
  // /iskcon_chaitanya/1.jpg, etc. — drop numbered images there to add more.
  cm:     { id: 'bgCM',           stateKey: 'bgCM',           folder: 'iskcon_chaitanya',    maxNum: 9, fallback: 'iskcon_chaitanya/1.png' },
  // Gaudiya/ISKCON Acharya (left) & Gurudev (right) — Jap screen images shown
  // just below Chaitanya Mahaprabhu, only while Gaudiya/ISKCON mode is on
  // (see applyBgPhotos below). Built-in choices live in /iskcon_acharya/1.jpg,
  // /iskcon_gurudev/1.jpg, etc. — drop numbered images there to add more.
  iskconAcharya: { id: 'bgIskconAcharya', stateKey: 'bgIskconAcharya', folder: 'iskcon_acharya', maxNum: 9, fallback: 'iskcon-acharya.png' },
  iskconGurudev: { id: 'bgIskconGurudev', stateKey: 'bgIskconGurudev', folder: 'iskcon_gurudev', maxNum: 9, fallback: 'iskcon-gurudev.png' }
};

const PHOTO_STRIP_IDS = {
  rv: 'photoStripRV', hitju: 'photoStripHitju', gurudev: 'photoStripGurudev', bank: 'photoStripBank',
  cm: 'photoStripCM', iskconAcharya: 'photoStripIskconAcharya', iskconGurudev: 'photoStripIskconGurudev'
};

window.renderPhotoPickers = async function() {
  for (const [key, conf] of Object.entries(PHOTO_CONFIG)) {
    const stripId = PHOTO_STRIP_IDS[key];
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

    // Bhagavadik Bank is a Gaudiya/ISKCON-only feature — when the mode is
    // off, always show the standard bank image regardless of any saved
    // ISKCON-bank preference (the preference is remembered for next time
    // Gaudiya mode is turned back on, not discarded).
    if (key === 'bank' && !(App.S && App.S.gaudiyaMode)) {
      el.src = './bhagavadik-bank.png';
      el.classList.remove('custom-bg');
      el.style.display = '';
      continue;
    }

    // Gaudiya/ISKCON deity (top), Acharya & Gurudev are Jap-screen images that
    // only exist while Gaudiya/ISKCON mode is on — fully hidden otherwise
    // (unlike Bank, there's no "default" image to fall back to when off).
    if ((key === 'cm' || key === 'iskconAcharya' || key === 'iskconGurudev') && !(App.S && App.S.gaudiyaMode)) {
      el.style.display = 'none';
      continue;
    }

    let val = App.S[conf.stateKey];
    if (val === undefined) val = 1;
    
    // Blank Mode
    if (val === 0 || val === '0') {
      el.style.display = 'none';
      continue;
    } else {
      // Explicit 'block' rather than '' — cm-wm/iskcon-acharya-wm/
      // iskcon-gurudev-wm have display:none baked into their own base CSS
      // class rule (not just the mode-hide rule), so clearing the inline
      // style falls through to that stylesheet default instead of showing.
      el.style.display = 'block';
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
  const ids = ['bgRadhaVallabh', 'bgHitju', 'bgGurudev', 'bgCM', 'bgIskconAcharya', 'bgIskconGurudev'];
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
    
    const dStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const timeStr = now.getHours() >= 12 ? '12PM' : '12AM';
    const filename = `RadhaNaamJap_Backup_${dStr}_${timeStr}.json`;

    await saveJsonFile(filename, JSON.stringify(backupData, null, 2));
    localStorage.setItem('rjap_lastAutoBackup', Date.now().toString());
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

  function todayCount() {
    try { return (App.S.h28[App.S.tk] || 0); } catch (_) { return 0; }
  }

  function restoreCounter() {
    var bbc = document.getElementById("bbCount");
    if (!bbc) return;
    var n = todayCount();
    bbc.textContent = n >= 1000 ? n.toLocaleString() : String(n);
  }

  function bumpCounter() {
    var bbc = document.getElementById("bbCount");
    var bbctr = document.getElementById("bbCounter");
    if (!bbc) return;
    // Always reflect TODAY's tap count (resets at midnight via App.S.tk)
    var n = todayCount();
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
    // Android: scale the whole coin animation down by 20%
    var isAndroid = /android/i.test(navigator.userAgent);
    var COIN_SCALE = isAndroid ? 0.8 : 1.0;
    var COIN_SIZE = Math.round(180 * COIN_SCALE); // px — must be declared BEFORE COIN_HALF
    var GAP = 8;         // px between coin bottom and name top
    var COIN_HALF = COIN_SIZE / 2;

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

    var emojiFontSize = Math.round(72 * COIN_SCALE) + "px";
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
        coin.style.fontSize = emojiFontSize;
        coin.style.lineHeight = "1";
        coin.style.background = "transparent";
        coin.style.boxShadow = "none";
      };
      coin.appendChild(img);
    } else {
      coin.textContent = "🪙";
      coin.style.fontSize = emojiFontSize;
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
      "max-width:" + Math.min(screenW - 32, 420) + "px",
      "white-space:nowrap",
      "overflow:visible",
      "text-shadow:0 0 25px rgba(255,217,61,0.85),0 0 50px rgba(255,200,40,0.4)"
    ].join(";");
    ghost.textContent = tappedName || nameEl.textContent;

    // Auto-shrink font inside the pod so name stays on one line
    (function fitGhostFont() {
      var maxW = Math.min(screenW - 32, 420);
      var baseFs = parseFloat(nameStyle.fontSize) || 120;
      ghost.style.fontSize = baseFs + "px";
      var sz = baseFs;
      requestAnimationFrame(function check() {
        if (ghost.scrollWidth > maxW && sz > 30) {
          sz -= 3;
          ghost.style.fontSize = sz + "px";
          requestAnimationFrame(check);
        }
      });
    })();
    pod.appendChild(ghost);

    // Bake the -COIN_SIZE/2 offset into left/top (margins ignored on position:fixed)
    // This makes pod.left = coin-centre-x and pod.top = coin-centre-y

    document.body.appendChild(pod);
    void pod.getBoundingClientRect();

    requestAnimationFrame(function () {
      pod.style.opacity = "1";
      pod.style.transform = "translateX(-50%) scale(" + COIN_SCALE + ")";

      requestAnimationFrame(function () {
        pod.style.left = endX + "px";
        pod.style.top  = endY + "px";
        pod.style.transform = "translateX(-50%) scale(" + (0.6 * COIN_SCALE) + ")";
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

// ═══════════════════════════════════════════════════════
// ── APP UPDATE (sideload latest APK from a GitHub Release) ──
// ═══════════════════════════════════════════════════════
// Uses Capacitor's Filesystem plugin (to save the download) and
// @capacitor-community/file-opener (to hand the saved file to Android's
// system package installer). Both are exposed on window.Capacitor.Plugins
// automatically since this app doesn't use a JS bundler.
//
// SETUP REQUIRED (native side, one-time):
//   1. npm install @capacitor-community/file-opener@6
//      (MUST be @6.x — the latest tag targets Capacitor 8 and will fail
//      with an ERESOLVE error against this project's Capacitor 6)
//   2. npx cap sync android
//   3. In android/app/src/main/AndroidManifest.xml, add (as a sibling of
//      your other <uses-permission> tags):
//        <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
//      A FileProvider <provider> entry is very likely already present
//      (Capacitor's Share/Camera plugins normally add one) — only add one
//      yourself if `cap sync` warns it's missing.
//   4. Rebuild: ./gradlew assembleDebug (or your release build command)
//
// NOTE: does NOT use @capacitor/file-transfer — its native Android module
// requires a newer Gradle/AGP toolchain than this project has and fails
// to build. Uses @capacitor/filesystem's own downloadFile() instead
// (already bundled, not yet deprecated on Capacitor 6 — that only
// happened at Filesystem v7.1.0).
//
// NOTE: this deliberately does NOT use window.fetch() to talk to GitHub.
// The app's WebView runs on its own origin (e.g. https://localhost inside
// Capacitor), and GitHub's release-asset host does not send back CORS
// headers permitting that origin — fetch() gets blocked before the
// request even leaves the device ("Failed to fetch", not a 404 or a
// real network error). CapacitorHttp.request() and FileTransfer both
// make the request at the native layer instead of through the WebView,
// which sidesteps CORS entirely.
//
// TODO: replace <your-username>/<your-repo> below with your actual GitHub
// path. This "latest" URL never needs to change again afterward — every
// future Release just needs an asset with this exact filename attached.
const APP_UPDATE_APK_URL =
  "https://github.com/drakthephenomenal/Lalu-Chotopushu/releases/latest/download/RadhaNaamJap.apk";

// GitHub API endpoint for the latest published Release's metadata (tag
// name, etc) — separate from the direct-download URL above.
const APP_UPDATE_RELEASE_API =
  "https://api.github.com/repos/drakthephenomenal/Lalu-Chotopushu/releases/latest";

// Compares two "vX.Y.Z"-style version strings numerically, part by part
// (so "1.10.0" correctly counts as newer than "1.9.0", unlike a plain
// string compare). Returns true if `remote` is strictly newer than `local`.
function _isNewerVersion(remote, local) {
  const clean = (v) => String(v || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const r = clean(remote), l = clean(local);
  const len = Math.max(r.length, l.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] || 0, lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

// Checks the installed app's version (via Capacitor's App plugin) against
// the tag name of the latest published GitHub Release, and updates the
// Settings card to show "Update available" only when the remote version
// is actually newer. Silently no-ops in the browser (no native App plugin)
// or on any network failure — the button still works as a manual
// download either way, this just adds the "is there something new" hint.
async function checkForUpdateAvailable() {
  const statusEl = document.getElementById("appUpdateStatus");
  const iconEl = document.getElementById("appUpdateIcon");
  const cardEl = document.getElementById("appUpdateCard");
  const versionEl = document.getElementById("appInstalledVersion");
  if (!statusEl || !iconEl) return;

  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  const AppInfoPlugin = Cap.Plugins && Cap.Plugins.App;
  const Http = Cap.Plugins && Cap.Plugins.CapacitorHttp; // bundled in @capacitor/core — no extra install needed
  if (!AppInfoPlugin) return;

  // Show the installed version immediately — this line is always visible
  // regardless of whether the network check below succeeds, so it still
  // works offline or if GitHub has no releases published at all.
  let localVersion = null;
  try {
    const info = await AppInfoPlugin.getInfo();
    localVersion = info && info.version; // e.g. "1.0.5" (versionName)
    if (versionEl && localVersion) versionEl.textContent = "Installed version: v" + localVersion;
  } catch (e) {
    console.warn("Could not read installed app version:", e);
    return;
  }

  if (!Http || !localVersion) return;

  // Cache the result for 30 min — GitHub's unauthenticated API is capped
  // at 60 requests/hour PER NETWORK (shared across everyone on the same
  // carrier/wifi IP, not just this app), so repeated app opens/testing
  // can burn through that fast. If we checked recently, reuse that result
  // instead of hitting the network again.
  const CACHE_KEY = "appUpdateCheckCache";
  const CACHE_MS = 30 * 60 * 1000;
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch (_) {}

  const applyResult = (remoteTag) => {
    if (!remoteTag) {
      statusEl.textContent = "No release published yet on GitHub.";
      if (cardEl) cardEl.classList.remove("update-available");
      return;
    }
    window._appUpdateRemoteTag = remoteTag; // stash for checkAppUpdate() below
    if (_isNewerVersion(remoteTag, localVersion)) {
      iconEl.textContent = "⬆️";
      statusEl.textContent = "Update available — " + remoteTag + " (you have v" + localVersion + ")";
      if (cardEl) cardEl.classList.add("update-available");
    } else {
      statusEl.textContent = "You're up to date 🙏";
      if (cardEl) cardEl.classList.remove("update-available");
    }
  };

  if (cached && Date.now() - cached.checkedAt < CACHE_MS) {
    applyResult(cached.remoteTag);
    return;
  }

  try {
    const resp = await Http.request({
      url: APP_UPDATE_RELEASE_API,
      method: "GET",
      headers: { Accept: "application/vnd.github+json" },
    });
    // CapacitorHttp auto-parses a JSON response body into resp.data.
    // If no release has been published (or all were deleted), GitHub
    // returns 404 with {"message":"Not Found"} — no tag_name, so this
    // falls through to the friendly message below rather than erroring.
    // A rate-limit hit (403, "API rate limit exceeded") also has no
    // tag_name and is handled the same way UNLESS we have a stale cached
    // result to fall back on instead (see catch block below).
    const data = resp && resp.data;
    const remoteTag = data && data.tag_name; // e.g. "v1.0.6"

    if (remoteTag) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ remoteTag, checkedAt: Date.now() }));
      } catch (_) {}
    } else if (cached) {
      // Network call didn't give us a usable tag (404/rate-limit/etc) —
      // fall back to the last known-good result rather than showing
      // "No release published" when one clearly does exist.
      applyResult(cached.remoteTag);
      return;
    }

    applyResult(remoteTag);
  } catch (e) {
    console.warn("Update check failed (non-fatal):", e);
    if (cached) applyResult(cached.remoteTag); // stale-but-useful beats nothing
  }
}

// Jumps straight to Android's "install unknown apps" permission screen for
// this app, via the same custom PowerPermissions native plugin already
// used for exact-alarm/battery-optimization permissions elsewhere in
// Settings. Saves hunting through manufacturer-specific menus (stock
// Android vs MIUI's "Other permissions" screen use different paths).
async function openInstallPermissionSettings() {
  if (!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PowerPermissions)) {
    toast("Only available inside the installed app.");
    return;
  }
  try {
    await window.Capacitor.Plugins.PowerPermissions.requestInstallPackagesPermission();
  } catch (e) {
    console.error("requestInstallPackagesPermission failed:", e);
    toast("Couldn't open that settings screen on this device.");
  }
}

async function checkAppUpdate() {
  const iconEl = document.getElementById("appUpdateIcon");
  const statusEl = document.getElementById("appUpdateStatus");
  const progWrap = document.getElementById("appUpdateProgWrap");
  const progBar = document.getElementById("appUpdateProgBar");

  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) {
    statusEl.textContent = "Updates only work inside the installed app, not the browser.";
    return;
  }

  // Uses @capacitor/filesystem's own downloadFile() — bundled with the
  // Filesystem plugin already in this project, native (bypasses CORS),
  // and writes straight to disk (no JS-bridge memory risk for the ~137MB
  // APK). NOTE: downloadFile() was deprecated on Filesystem starting at
  // v7.1.0 in favor of a separate @capacitor/file-transfer plugin — but
  // this project is on Capacitor 6, so it's still the primary supported
  // method here. (file-transfer's native Android module needs a newer
  // Gradle/AGP toolchain than this project has and fails to build —
  // that's why we're using this instead.)
  const Filesystem = Cap.Plugins && Cap.Plugins.Filesystem;
  const FileOpener = Cap.Plugins && Cap.Plugins.FileOpener;
  if (!Filesystem || !FileOpener) {
    statusEl.textContent =
      "Update plugin missing — install @capacitor-community/file-opener@6, then rebuild.";
    return;
  }

  let progressListener = null;
  try {
    iconEl.textContent = "⏳";
    progWrap.style.display = "block";
    const _linkElReset = document.getElementById("appUpdateSettingsLink");
    if (_linkElReset) _linkElReset.style.display = "none";
    progBar.style.width = "0%";

    // Skip re-downloading the ~137MB APK if we already fetched this exact
    // version (e.g. the person tapped Update, got stuck at the installer
    // permission step, fixed it in Settings, and came back to tap Update
    // again). Tagged by the target version so a leftover download from a
    // DIFFERENT release never gets mistakenly reused.
    const targetTag = window._appUpdateRemoteTag || "unknown";
    const DOWNLOADED_TAG_KEY = "appUpdateDownloadedTag";
    let filePath = null;
    try {
      const stat = await Filesystem.stat({ path: "RadhaNaamJap.apk", directory: "CACHE" });
      if (stat && localStorage.getItem(DOWNLOADED_TAG_KEY) === targetTag) {
        const uriInfo = await Filesystem.getUri({ path: "RadhaNaamJap.apk", directory: "CACHE" });
        filePath = uriInfo && uriInfo.uri;
      }
    } catch (_) {
      // stat() throws if the file doesn't exist yet — normal, just means
      // this is a fresh download, not an error worth logging.
    }

    if (!filePath) {
      statusEl.textContent = "Downloading update…";

      if (Filesystem.addListener) {
        progressListener = await Filesystem.addListener("progress", (p) => {
          if (p && p.contentLength) {
            progBar.style.width = Math.round((p.bytes / p.contentLength) * 100) + "%";
          }
        });
      }

      // recursive:true is required here — a known Capacitor Filesystem bug
      // (ionic-team/capacitor #6896, #7108, #1835) throws a bare
      // "Error downloading file: <path>" / ENOENT error when the target
      // directory (here, the app's Cache dir) hasn't been created yet by
      // Android, which is common on a fresh install before anything else
      // has written to Cache. recursive:true creates it instead of failing.
      const result = await Filesystem.downloadFile({
        url: APP_UPDATE_APK_URL,
        path: "RadhaNaamJap.apk",
        directory: "CACHE",
        recursive: true,
        progress: true,
      });
      filePath = result && (result.path || result.uri);
      try { localStorage.setItem(DOWNLOADED_TAG_KEY, targetTag); } catch (_) {}
    } else {
      statusEl.textContent = "Already downloaded — opening installer…";
    }

    statusEl.textContent = "Opening installer…";
    try {
      await FileOpener.open({
        filePath: filePath,
        contentType: "application/vnd.android.package-archive",
      });
      iconEl.textContent = "✅";
      statusEl.textContent = "Installer opened — follow the on-screen prompt to finish.";
      // Some manufacturers (notably MIUI/Xiaomi) silently swallow this
      // failure instead of throwing — the call above can report success
      // even when nothing visibly happens because the install-permission
      // isn't granted. Since JS can't reliably tell those two cases apart,
      // show this link either way as a low-cost fallback: if the installer
      // really did open, tapping it is just a harmless no-op detour.
      const linkEl = document.getElementById("appUpdateSettingsLink");
      if (linkEl) linkEl.style.display = "block";
    } catch (openErr) {
      // The download itself succeeded (we got this far) — this failure is
      // specifically about LAUNCHING the installer, which on Android
      // almost always means the "Install unknown apps" permission isn't
      // granted for this app yet (some manufacturers, notably MIUI/Xiaomi,
      // silently block the launch instead of showing an error dialog, so
      // this catch may not even fire there — but when it does, or when
      // nothing visibly happens, this is the fix either way).
      console.error("Installer launch failed:", openErr);
      iconEl.textContent = "⚠️";
      statusEl.textContent =
        "Downloaded, but couldn't open the installer. Tap below to jump " +
        "straight to the right permission screen, turn it on, then tap " +
        "Update again — the file is already saved, no need to re-download.";
      const linkEl = document.getElementById("appUpdateSettingsLink");
      if (linkEl) linkEl.style.display = "block";
    }
  } catch (e) {
    console.error("App update failed:", e);
    iconEl.textContent = "⚠️";
    console.error("App update failed — full error object:", JSON.stringify(e, Object.getOwnPropertyNames(e || {})));
    const msg =
      (e && (e.message || (e.data && (e.data.message || e.data.body)) || e.errorMessage)) ||
      "unknown error";
    statusEl.textContent = "Update failed: " + msg;
  } finally {
    if (progressListener && progressListener.remove) {
      try { progressListener.remove(); } catch (_) {}
    }
    setTimeout(() => {
      progWrap.style.display = "none";
    }, 1500);
  }
}

