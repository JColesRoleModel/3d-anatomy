# 3D Anatomy connector (Claude)

A small MCP server on a Cloudflare Worker, so Claude (and Brian Inc.) can read and update the 3D Anatomy app.

**Tools:** `get_rings`, `list_time`, `get_checkins`, `list_tasks` (read) · `log_time`, `delete_logged_time`, `add_task`, `update_task` (write).
Writes match what the site saves itself (Rings "Log time", Tasks "newTask") and stay within `firestore.rules` limits.

- Address: `https://anatomy-connector.<account>.workers.dev/<MCP_SECRET>/mcp` (any other path is a 404).
- Secrets live in Cloudflare only: `MCP_SECRET`, `FIREBASE_SA` (service-account JSON), `OWNER_EMAIL`.
  Set with `npx wrangler@4.151.1 secret put NAME`. Days and clock times use `TZ_NAME` (wrangler.toml).
- Test offline: `node test.mjs` (fake Google, made-up data). Deploy: `npx wrangler@4.151.1 deploy`.
