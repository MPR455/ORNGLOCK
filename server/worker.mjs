import admission from '../master prompt/01_MASTER_PROMPT_WRITE_ADMISSION_NOTE.txt';
import consult from '../master prompt/02_MASTER_PROMPT_WRITE_CONSULT_REQUEST.txt';
import summary from '../master prompt/03_MASTER_PROMPT_TREATMENT_SUMMARY_WEEKLY_SUMMARY.txt';
import support from '../master prompt/04_MASTER_PROMPT_CURRENT_ANTIBIOTICS_OXYGEN_LINES_TUBES.txt';
import handoffConvert from '../master prompt/05_MASTER_PROMPT_HANDOFF_NOTE_CONVERT.txt';
import handoffClean from '../master prompt/06_MASTER_PROMPT_HANDOFF_DATA_CLEANING.txt';
import handoffOrder from '../master prompt/07_MASTER_PROMPT_HANDOFF_ORDER_REVIEW.txt';
import { handleApi, positiveInteger } from './api.mjs';

export class UsageGuard {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    const { ip, shared } = await request.json();
    const time = Date.now(), minute = Math.floor(time / 60_000), day = new Date(time).toISOString().slice(0, 10);
    const result = await this.state.storage.transaction(async txn => {
      const stored = await txn.get('usage') || { day, count: 0, minute, ips: {} };
      if (stored.day !== day) { stored.day = day; stored.count = 0; }
      if (stored.minute !== minute) { stored.minute = minute; stored.ips = {}; }
      if ((stored.ips[ip] || 0) >= positiveInteger(this.env.REQUESTS_PER_MINUTE, 6)) return { allowed: false, code: 'RATE_LIMITED', retryAfter: 60 - Math.floor((time % 60_000) / 1000) };
      if (shared && stored.count >= positiveInteger(this.env.SHARED_DAILY_LIMIT, 100)) return { allowed: false, code: 'SHARED_QUOTA_EXHAUSTED' };
      stored.ips[ip] = (stored.ips[ip] || 0) + 1;
      if (shared) stored.count++;
      await txn.put('usage', stored);
      return { allowed: true };
    });
    return Response.json(result);
  }
}

export default {
  async fetch(request, env) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const ipHash = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
    const guard = { take: async data => {
      const stub = env.USAGE_GUARD.get(env.USAGE_GUARD.idFromName('ornglock'));
      const response = await stub.fetch('https://usage.internal/check', { method: 'POST', body: JSON.stringify(data) });
      if (!response.ok) throw new Error('Usage guard unavailable');
      return response.json();
    } };
    return handleApi(request, { prompts: { admission, consult, summary, support, handoff_convert: handoffConvert, handoff_clean: handoffClean, handoff_order: handoffOrder }, sharedKey: env.GEMINI_API_KEY, handoffSharedKey: env.HANDOFF_GEMINI_API_KEY, model: env.GEMINI_MODEL, allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean), guard, ip: ipHash });
  }
};
