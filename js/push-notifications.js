import { supabase } from "./supabase-client.js";
import { KAJO_VAPID_PUBLIC_KEY } from "./push-config.js";

const DAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
let loadedSchedules = [];

function setStatus(message, kind = "") {
  const el = $("kajo-push-status");
  if (!el) return;
  el.className = "kajo-push-status" + (kind ? " " + kind : "");
  el.innerHTML = '<span class="kajo-push-status-dot"></span><span>' + escapeHtml(message) + '</span>';
}

function base64ToUint8Array(base64) {
  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}


function sameApplicationServerKey(subscription, configuredKey) {
  const existingKey = subscription?.options?.applicationServerKey;
  if (!existingKey) return null;
  const existing = new Uint8Array(existingKey);
  const configured = base64ToUint8Array(configuredKey);
  if (existing.length !== configured.length) return false;
  return existing.every((byte, index) => byte === configured[index]);
}

async function currentUser() {
  if (!supabase) throw new Error("Die Cloud-Verbindung ist nicht eingerichtet.");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error("Bitte melde dich erneut an.");
  return data.user;
}

function selectedDays() {
  return [...document.querySelectorAll("#kajo-reminder-days input:checked")].map(el => Number(el.value)).sort((a,b) => a-b);
}

function daysForRepeat(repeat) {
  if (repeat === "daily") return [0,1,2,3,4,5,6];
  if (repeat === "weekdays") return [1,2,3,4,5];
  if (repeat === "weekends") return [0,6];
  return selectedDays();
}

function repeatForDays(days) {
  const sorted = [...days].sort((a,b) => a-b);
  if (sorted.length === 7) return "daily";
  if (sorted.join(",") === "1,2,3,4,5") return "weekdays";
  if (sorted.join(",") === "0,6") return "weekends";
  return "custom";
}

function renderSchedules() {
  const list = $("kajo-reminders-list");
  if (!list) return;
  if (!loadedSchedules.length) {
    list.innerHTML = '<div class="rounded-xl border border-dashed border-slate-700 p-4 text-xs text-slate-500">Noch keine eigenen Erinnerungen angelegt.</div>';
    return;
  }
  list.innerHTML = loadedSchedules.slice().sort((a,b) => String(a.time_local).localeCompare(String(b.time_local))).map(item => {
    const days = Array.isArray(item.weekdays) ? item.weekdays : [];
    const repeat = days.length === 7 ? "Täglich" : repeatForDays(days) === "weekdays" ? "Mo–Fr" : repeatForDays(days) === "weekends" ? "Sa–So" : days.map(d => DAY_LABELS[d]).join(" · ");
    const paused = item.enabled === false;
    return '<article class="kajo-reminder-item' + (paused ? ' is-paused' : '') + '"><div class="kajo-reminder-item-main"><span class="kajo-reminder-item-icon"><i data-lucide="bell"></i></span><div class="min-w-0"><h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.body) + '</p><time>' + escapeHtml(String(item.time_local || "").slice(0,5)) + ' Uhr · ' + escapeHtml(repeat) + (paused ? ' · Pausiert' : '') + '</time></div></div><div class="kajo-reminder-actions"><button type="button" title="Erinnerung pausieren oder aktivieren" aria-label="Erinnerung pausieren oder aktivieren" onclick="toggleKajoReminder(\'' + escapeHtml(item.id) + '\')"><i data-lucide="' + (paused ? 'play' : 'pause') + '"></i></button><button type="button" title="Bearbeiten" aria-label="Bearbeiten" onclick="editKajoReminder(\'' + escapeHtml(item.id) + '\')"><i data-lucide="pencil"></i></button><button type="button" title="Löschen" aria-label="Löschen" onclick="deleteKajoReminder(\'' + escapeHtml(item.id) + '\')"><i data-lucide="trash-2"></i></button></div></article>';
  }).join("");
  try { globalThis.lucide?.createIcons?.(); } catch {}
}

export async function renderKajoPushSettings() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Lokale Gerätezeit";
  if ($("kajo-notification-timezone")) $("kajo-notification-timezone").textContent = timezone;
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("Dieser Browser unterstützt Web-Push nicht. Öffne KAJO in einem kompatiblen Browser und installiere die App.", "is-error");
      return;
    }
    if (!KAJO_VAPID_PUBLIC_KEY) {
      setStatus("Push-Empfang ist vorbereitet, aber der öffentliche VAPID-Schlüssel ist noch nicht hinterlegt.", "");
    } else if (Notification.permission === "denied") {
      setStatus("Benachrichtigungen sind für KAJO in den Geräteeinstellungen blockiert.", "is-error");
    } else if (Notification.permission === "granted") {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setStatus(subscription ? "Dieses Gerät ist für KAJO-Push registriert." : "Benachrichtigungen sind erlaubt. Dieses Gerät ist noch nicht registriert.", subscription ? "is-ready" : "");
    } else {
      setStatus("Noch nicht aktiviert. Du entscheidest, ob KAJO dich auf diesem Gerät benachrichtigen darf.");
    }
    const user = await currentUser();
    const { data, error } = await supabase.from("kajo_notification_schedules").select("*").eq("user_id", user.id);
    if (error) throw error;
    loadedSchedules = Array.isArray(data) ? data : [];
    renderSchedules();
  } catch (error) {
    setStatus(error.message || "Push-Einstellungen konnten nicht geladen werden.", "is-error");
    if ($("kajo-reminders-list")) $("kajo-reminders-list").innerHTML = '<p class="text-xs text-rose-300">Erinnerungen konnten nicht geladen werden.</p>';
  }
}

export async function enableKajoPush() {
  try {
    if (!KAJO_VAPID_PUBLIC_KEY) throw new Error("Der VAPID-Schlüssel ist noch nicht konfiguriert. Der Pushdienst muss zuerst serverseitig eingerichtet werden.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Web-Push wird von diesem Browser nicht unterstützt.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error(permission === "denied" ? "Bitte erlaube Benachrichtigungen in den Geräteeinstellungen." : "Die Benachrichtigungsfreigabe wurde nicht erteilt.");
    const user = await currentUser();
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    const oldEndpoint = subscription?.endpoint || null;

    if (subscription) {
      const keyMatches = sameApplicationServerKey(subscription, KAJO_VAPID_PUBLIC_KEY);
      if (keyMatches === null) {
        throw new Error("Der vorhandene Push-Schlüssel kann nicht geprüft werden. Melde dieses Gerät bitte einmal über „Push deaktivieren“ ab und aktiviere Push anschließend erneut.");
      }
      if (!keyMatches) {
        const removed = await subscription.unsubscribe();
        if (!removed) throw new Error("Das alte Push-Abonnement konnte nicht erneuert werden. Bitte versuche es erneut.");
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(KAJO_VAPID_PUBLIC_KEY)
      });
    }
    const json = subscription.toJSON();
    const record = {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      expiration_time: json.expirationTime ? new Date(json.expirationTime).toISOString() : null
    };
    const { error } = await supabase.from("kajo_push_subscriptions").upsert(record, { onConflict: "endpoint" });
    if (error) throw error;
    // Remove only this user's previous endpoint, and only after the new subscription
    // is safely stored. Reminder schedules are deliberately left untouched.
    if (oldEndpoint && oldEndpoint !== json.endpoint) {
      const { error: cleanupError } = await supabase.from("kajo_push_subscriptions")
        .delete().eq("endpoint", oldEndpoint).eq("user_id", user.id);
      if (cleanupError) console.warn("Altes KAJO-Push-Abonnement konnte nicht bereinigt werden.");
    }
    setStatus("Dieses Gerät ist jetzt für KAJO-Push registriert.", "is-ready");
    await renderKajoPushSettings();
  } catch (error) {
    setStatus(error.message || "Push konnte nicht aktiviert werden.", "is-error");
  }
}

export async function sendKajoPushTest() {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") throw new Error("Aktiviere zuerst die Benachrichtigungsfreigabe.");
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("KAJO · Alles bereit", {
      body: "Deine persönlichen Erinnerungen erscheinen hier im KAJO-Design.",
      icon: "./icons/kajo-icon.svg",
      badge: "./icons/kajo-icon.svg",
      tag: "kajo-test-notification",
      data: { url: "./" },
      vibrate: [100, 45, 100]
    });
  } catch (error) {
    setStatus(error.message || "Die Testnachricht konnte nicht angezeigt werden.", "is-error");
  }
}

export async function saveKajoReminder(event) {
  event?.preventDefault?.();
  try {
    const user = await currentUser();
    const title = $("kajo-reminder-title")?.value.trim() || "";
    const body = $("kajo-reminder-body")?.value.trim() || "";
    const time = $("kajo-reminder-time")?.value || "";
    const days = daysForRepeat($("kajo-reminder-repeat")?.value || "custom");
    const id = $("kajo-reminder-id")?.value || "";
    if (!title || !body || !time) throw new Error("Bitte Titel, Nachricht und Uhrzeit ausfüllen.");
    if (!days.length) throw new Error("Wähle mindestens einen Wochentag aus.");
    const record = {
      user_id: user.id,
      title,
      body,
      time_local: time + ":00",
      weekdays: days,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
      enabled: true
    };
    const query = id
      ? supabase.from("kajo_notification_schedules").update(record).eq("id", id).eq("user_id", user.id)
      : supabase.from("kajo_notification_schedules").insert(record);
    const { error } = await query;
    if (error) throw error;
    resetKajoReminderForm();
    await renderKajoPushSettings();
    // renderKajoPushSettings() displays the actual browser push-registration state.
    // Do not overwrite it with a generic message suggesting push must be activated.
  } catch (error) {
    setStatus(error.message || "Die Erinnerung konnte nicht gespeichert werden.", "is-error");
  }
}

export async function editKajoReminder(id) {
  const item = loadedSchedules.find(x => x.id === id);
  if (!item) return;
  $("kajo-reminder-id").value = item.id;
  $("kajo-reminder-title").value = item.title || "";
  $("kajo-reminder-body").value = item.body || "";
  $("kajo-reminder-time").value = String(item.time_local || "08:00").slice(0,5);
  $("kajo-reminder-repeat").value = repeatForDays(item.weekdays || []);
  document.querySelectorAll("#kajo-reminder-days input").forEach(el => { el.checked = (item.weekdays || []).includes(Number(el.value)); });
  if ($("kajo-reminder-cancel")) $("kajo-reminder-cancel").classList.remove("hidden");
  $("kajo-reminder-form")?.scrollIntoView({behavior:"smooth",block:"center"});
}

export function resetKajoReminderForm() {
  $("kajo-reminder-form")?.reset();
  if ($("kajo-reminder-id")) $("kajo-reminder-id").value = "";
  if ($("kajo-reminder-time")) $("kajo-reminder-time").value = "08:00";
  if ($("kajo-reminder-cancel")) $("kajo-reminder-cancel").classList.add("hidden");
  document.querySelectorAll("#kajo-reminder-days input").forEach(el => { el.checked = Number(el.value) >= 1 && Number(el.value) <= 5; });
}

export async function deleteKajoReminder(id) {
  if (!confirm("Diese KAJO-Erinnerung wirklich löschen?")) return;
  try {
    const user = await currentUser();
    const { error } = await supabase.from("kajo_notification_schedules").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    await renderKajoPushSettings();
  } catch (error) {
    setStatus(error.message || "Die Erinnerung konnte nicht gelöscht werden.", "is-error");
  }
}

export async function toggleKajoReminder(id) {
  try {
    const user = await currentUser();
    const item = loadedSchedules.find(x => x.id === id);
    if (!item) return;
    const { error } = await supabase.from("kajo_notification_schedules")
      .update({ enabled: item.enabled === false, updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    await renderKajoPushSettings();
  } catch (error) {
    setStatus(error.message || "Der Erinnerungsstatus konnte nicht geändert werden.", "is-error");
  }
}

export async function disableKajoPush() {
  try {
    const user = await currentUser();
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setStatus("Dieses Gerät hat aktuell kein aktives KAJO-Push-Abonnement.");
      return;
    }
    const { error } = await supabase.from("kajo_push_subscriptions")
      .delete().eq("endpoint", subscription.endpoint).eq("user_id", user.id);
    if (error) throw error;
    await subscription.unsubscribe();
    setStatus("Dieses Gerät wurde vom KAJO-Pushdienst abgemeldet.");
    await renderKajoPushSettings();
  } catch (error) {
    setStatus(error.message || "Das Gerät konnte nicht abgemeldet werden.", "is-error");
  }
}
