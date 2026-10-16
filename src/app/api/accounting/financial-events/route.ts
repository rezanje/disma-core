import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function camel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camel);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()), camel(item),
  ]));
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['finance', 'super_admin']);
    if (!supabaseAdmin) return NextResponse.json({error:'Database unavailable'}, {status:503});
    const input = await request.json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({error:'Receipt must be an object'}, {status:400});
    }
    if (input.kind === 'online-purchase') return NextResponse.json({error:'Catat order melalui perintah pembelian sumber.'}, {status:409});
    const {data, error} = await supabaseAdmin.rpc('post_financial_event', {
      p_event: input, p_recorded_by: user.id,
    });
    if (error) return NextResponse.json({error:error.message}, {status:409});
    return NextResponse.json(camel(data), {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    const authResponse = apiAuthResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({error:error instanceof Error ? error.message : 'Receipt failed'}, {status:400});
  }
}
