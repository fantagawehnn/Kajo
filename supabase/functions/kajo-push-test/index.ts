import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ApplicationServer,
  importVapidKeys,
  Urgency,
} from "jsr:@negrel/webpush@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
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
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !publicKey || !privateKey || !subject) {
    console.error("Push test configuration is incomplete.");
    return json({ error: "Push service configuration is incomplete" }, 500);
  }
  if (!authorization) return json({ error: "Unauthorized" }, 401);

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    const userId = authData?.user?.id;
    if (authError || !userId) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("kajo_push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", userId);

    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) {
      return json({ error: "Für dieses Konto ist kein Push-Gerät registriert." }, 404);
    }

    const vapidKeys = await importVapidKeys(vapidJwk(publicKey, privateKey));
    const applicationServer = await ApplicationServer.new({
      contactInformation: subject,
      vapidKeys,
    });

    let sent = 0;
    let removed = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      try {
        const subscriber = applicationServer.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        });
        await subscriber.pushTextMessage(JSON.stringify({
          title: "KAJO · Push-Test",
          body: "Dein KAJO-Pushdienst kann Nachrichten an dieses Gerät senden.",
          url: "./",
          tag: "kajo-push-test",
        }), { urgency: Urgency.Normal, ttl: 300 });
        sent++;
      } catch (error) {
        failed++;
        const response = (error as { response?: Response })?.response;
        const status = response?.status;
        if (status === 404 || status === 410) {
          const { error: deleteError } = await supabase
            .from("kajo_push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint)
            .eq("user_id", userId);
          if (deleteError) console.error("Could not remove expired test subscription:", deleteError);
          else removed++;
        } else {
          console.error("KAJO push test delivery failed:", {
            userId,
            status,
            statusText: response?.statusText,
          });
        }
      }
    }

    if (sent === 0) {
      return json({
        error: "Der Server konnte keine Push-Nachricht zustellen.",
        sent,
        removed,
        failed,
      }, 502);
    }
    return json({ ok: true, sent, removed, failed });
  } catch (error) {
    console.error("KAJO push test failed:", error);
    return json({ error: "Push test failed" }, 500);
  }
});
