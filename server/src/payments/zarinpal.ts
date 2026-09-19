// درگاه زرین‌پال (v4). اگر مرچنت تنظیم نشده باشد، واریز «دستی» ثبت می‌شود و ادمین تأیید می‌کند.
export interface ZarinpalOpts { merchant: string; sandbox: boolean }

const base = (o: ZarinpalOpts) => o.sandbox ? 'https://sandbox.zarinpal.com/pg' : 'https://payment.zarinpal.com/pg';

export async function requestPayment(o: ZarinpalOpts, amountToman: number, description: string, callbackUrl: string): Promise<{ authority: string; url: string }> {
  const res = await fetch(`${base(o)}/v4/payment/request.json`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ merchant_id: o.merchant, amount: amountToman * 10, currency: 'IRR', description, callback_url: callbackUrl }),
  });
  const j: any = await res.json().catch(() => ({}));
  const code = j?.data?.code;
  if (code !== 100 && code !== 101) throw new Error(`زرین‌پال: ${j?.errors?.message ?? j?.errors?.code ?? res.status}`);
  const authority = j.data.authority as string;
  return { authority, url: `${base(o)}/StartPay/${authority}` };
}

export async function verifyPayment(o: ZarinpalOpts, amountToman: number, authority: string): Promise<{ ok: boolean; refId?: string; code?: number }> {
  const res = await fetch(`${base(o)}/v4/payment/verify.json`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ merchant_id: o.merchant, amount: amountToman * 10, authority }),
  });
  const j: any = await res.json().catch(() => ({}));
  const code = j?.data?.code;
  if (code === 100 || code === 101) return { ok: true, refId: String(j.data.ref_id ?? ''), code };
  return { ok: false, code: code ?? j?.errors?.code };
}
