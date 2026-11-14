import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

// Der Supabase-Browserclient wird nur in der echten Browser-App benötigt.
// Node-basierte Smoke-Tests importieren fachliche Module ohne Netzwerk-CDN-Abhängigkeit.
const isNodeRuntime = typeof process !== 'undefined' && Boolean(process.versions?.node);
let supabase = null;
if (!isNodeRuntime && SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export { supabase };
