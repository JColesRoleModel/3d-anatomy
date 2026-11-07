// 3D Anatomy connector: a small MCP server (Cloudflare Worker) that lets Claude read Brian's rings, time, tasks and
// check-ins from Firestore, and log time and manage tasks for him.
//
// The address is https://<worker>/<MCP_SECRET>/mcp, so only someone with the secret can use it. Secrets (set with
// `wrangler secret put`, never in git): MCP_SECRET, FIREBASE_SA (the service-account JSON), OWNER_EMAIL.
// The service account bypasses the Firestore rules, so every write here checks its own data the same way the rules do.

import { TOOLS } from './tools.js';

const SERVER = { name: '3d-anatomy', version: '1.0.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = `Brian's 3D Anatomy app (Tree of Life NRI): three daily rings, Body (yoga, stretching, lymph drainage, innervation, mudras), Mind (talks, books, the Scroll, uplifting videos) and Spirit (meditation, breathwork, neuro-ocular work), each with a daily goal in minutes; a task list; and check-ins (how he feels plus timed tests). Times are exact to the second. When Brian says he did something, log it with log_time under the right ring. When he asks for a to-do, use add_task.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (!env.MCP_SECRET || parts[0] !== env.MCP_SECRET || (parts[1] && parts[1] !== 'mcp') || parts.length > 2) {
      return new Response('Not found', { status: 404 });
    }
    if (request.method === 'GET' || request.method === 'DELETE') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    let body;
    try { body = await request.json(); } catch { return json(rpcError(null, -32700, 'Parse error'), 400); }
    const ctx = { env };
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handle(m, ctx)))).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202 });
    }
    const out = await handle(body, ctx);
    return out ? json(out) : new Response(null, { status: 202 });
  },
};

async function handle(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id ?? null, -32600, 'Invalid request');
  const isNotification = msg.id === undefined || msg.id === null;
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion;
        return ok(msg.id, {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping': return ok(msg.id, {});
      case 'tools/list':
        return ok(msg.id, { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) });
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === msg.params?.name);
        if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${msg.params?.name}`);
        try {
          const result = await tool.run(msg.params?.arguments || {}, ctx);
          return ok(msg.id, { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }], structuredContent: result });
        } catch (e) {
          return ok(msg.id, { content: [{ type: 'text', text: String(e?.message || e) }], isError: true });
        }
      }
      default:
        if (isNotification) return null;
        return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    return isNotification ? null : rpcError(msg.id, -32603, String(e?.message || e));
  }
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
