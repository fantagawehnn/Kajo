// Minimal Worker entry point for KAJO's static application assets.
// Cloudflare serves matching static assets directly; unmatched requests
// are delegated to the configured assets binding.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
