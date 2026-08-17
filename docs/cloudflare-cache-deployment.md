# Cloudflare cache deployment note

The home and calendar read paths use a small per-Worker-isolate TTL cache. This keeps the date/range key boundary and invalidates both caches after order, check-in, meal, payment, settings, or import mutations without relying on Next.js `unstable_cache`, which is not available consistently in the Cloudflare Worker runtime.
