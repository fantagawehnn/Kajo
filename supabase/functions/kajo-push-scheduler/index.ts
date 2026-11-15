import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ApplicationServer,
  importVapidKeys,
  Urgency,
} from "jsr:@negrel/webpush@0.5.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: `${values.hour}:${values.minute}`,
    weekday: weekdayMap[values.weekday],
  };
}

function vapidJwk(publicKey: string, privateKey: string) {
  const publicBytes = decodeBase64Url(publicKey);
  const privateBytes = decodeBase64Url(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Die VAPID-Schlüssel haben ein ungültiges Format.");
  }
  return {
    publicKey: {
      kty: "EC",
      crv: "P-256",
      x: encodeBase64Url(publicBytes.slice(1, 33)),
      y: encodeBase64Url(publicBytes.slice(33, 65)),
      ext: true,
    },
    privateKey: {
      kty: "EC",
      crv: "P-256",
      x: encodeBase64Url(publicBytes.slice(1, 33)),
      y: encodeBase64Url(publicBytes.slice(33, 65)),
      d: encodeBase64Url(privateBytes),
      ext: true,
    },
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const cronSecret = Deno.env.get("PUSH_CRON_SECRET");
  if (!cronSecret || request.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");

  if (!supabaseUrl || !serviceRoleKey || !publicKey || !privateKey || !subject) {
    console.error("Push service configuration is incomplete.");
    return json({ error: "Push service configuration is incomplete" }, 500);
  }

  try {
    const vapidKeys = await importVapidKeys(vapidJwk(publicKey, privateKey));
    const applicationServer = await ApplicationServer.new({
      contactInformation: subject,
      vapidKeys,
    });
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: schedules, error: scheduleError } = await supabase
      .from("kajo_notification_schedules")
      .select("id,user_id,title,body,time_local,weekdays,timezone,last_sent_local_date")
      .eq("enabled", true);

    if (scheduleError) throw scheduleError;

    let checked = 0;
    let sent = 0;
    let removed = 0;
    const now = new Date();

    for (const schedule of schedules ?? []) {
      checked++;
      const timezone = schedule.timezone || "Europe/Berlin";
      let clock;
      try {
        clock = localClock(now, timezone);
      } catch {
        console.error("Invalid timezone for schedule:", schedule.id);
        continue;
      }

      const targetMinute = String(schedule.time_local ?? "").slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(targetMinute) || clock.minute < targetMinute) continue;
      if (!Array.isArray(schedule.weekdays) || !schedule.weekdays.includes(clock.weekday)) continue;
      if (schedule.last_sent_local_date === clock.date) continue;

      const { data: subscriptions, error: subscriptionError } = await supabase
        .from("kajo_push_subscriptions")
        .select("endpoint,p256dh,auth")
        .eq("user_id", schedule.user_id);

      if (subscriptionError) {
        console.error("Could not load subscriptions for schedule:", schedule.id, subscriptionError);
        continue;
      }
      if (!subscriptions?.length) continue;

      let delivered = 0;
      for (const subscription of subscriptions) {
        try {
          const subscriber = applicationServer.subscribe({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          });
          await subscriber.pushTextMessage(JSON.stringify({
            title: schedule.title || "KAJO",
            body: schedule.body || "Deine persönliche Erinnerung",
            url: "./",
            tag: `kajo-reminder-${schedule.id}`,
          }), { urgency: Urgency.Normal, ttl: 3600 });
          delivered++;
          sent++;
        } catch (error) {
          const status = (error as { response?: Response })?.response?.status;
          if (status === 404 || status === 410) {
            const { error: deleteError } = await supabase
              .from("kajo_push_subscriptions")
              .delete()
              .eq("endpoint", subscription.endpoint);
            if (deleteError) console.error("Could not remove expired subscription:", deleteError);
            else removed++;
          } else {
            console.error("Push delivery failed for schedule:", schedule.id, error);
          }
        }
      }

      if (delivered > 0) {
        const { error: markError } = await supabase
          .from("kajo_notification_schedules")
          .update({ last_sent_local_date: clock.date })
          .eq("id", schedule.id)
          .or(`last_sent_local_date.is.null,last_sent_local_date.neq.${clock.date}`);
        if (markError) console.error("Could not mark schedule as sent:", schedule.id, markError);
      }
    }

    return json({ ok: true, checked, sent, removed });
  } catch (error) {
    console.error("KAJO push scheduler failed:", error);
    return json({ error: "Push scheduler failed" }, 500);
  }
});
