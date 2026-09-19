// کلاینت شبکه: REST برای کنش‌ها، وب‌سوکت برای رویدادهای زنده. هیچ منطق بازی این‌جا نیست؛ همه‌چیز از سرور می‌آید.
export class ApiError extends Error { constructor(public reason: string, public code: number) { super(reason); } }

export async function api<T = any>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new ApiError('ارتباط با سرور برقرار نشد', 0); }
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* پاسخ غیر JSON */ }
  if (!res.ok) throw new ApiError(json?.error ?? json?.message ?? `خطای سرور (${res.status})`, res.status);
  return json as T;
}

export type WsHandler = (msg: any) => void;

// وب‌سوکت با اتصال مجدد خودکار و اشتراک ناحیه
export class Live {
  private ws: WebSocket | null = null;
  private region: { x: number; y: number; r: number } | null = null;
  private timer: any = null;
  private backoff = 1000;
  connected = false;
  constructor(private onMessage: WsHandler, private onState: (connected: boolean) => void) {}
  start() { this.connect(); }
  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try { this.ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { this.retry(); return; }
    this.ws.onopen = () => { this.connected = true; this.backoff = 1000; this.onState(true); if (this.region) this.send({ type: 'sub', ...this.region }); };
    this.ws.onmessage = e => { try { this.onMessage(JSON.parse(e.data)); } catch { /* نادیده */ } };
    this.ws.onclose = () => { this.connected = false; this.onState(false); this.retry(); };
    this.ws.onerror = () => { try { this.ws?.close(); } catch { /* */ } };
  }
  private retry() { clearTimeout(this.timer); this.timer = setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(15000, this.backoff * 1.7); }
  send(msg: unknown) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  subscribe(x: number, y: number, r: number) {
    if (this.region && this.region.x === x && this.region.y === y && this.region.r === r) return;
    this.region = { x, y, r }; this.send({ type: 'sub', x, y, r });
  }
}
