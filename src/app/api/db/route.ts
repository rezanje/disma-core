import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const APP_DATA_KEY = 'disma-main';

// GET: Load entire app state from Supabase
export async function GET() {
  try {
    // Try Supabase first
    if (supabase) {
      const { data, error } = await supabase
        .from('app_data')
        .select('data')
        .eq('id', APP_DATA_KEY)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        // PGRST116 = row not found, which is fine (first run)
        console.error('Supabase GET Error:', error);
        return NextResponse.json({ error: 'Failed to read database' }, { status: 500 });
      }
      
      if (data?.data) {
        return NextResponse.json(data.data, {
          headers: { 'Cache-Control': 'no-store, max-age=0' }
        });
      }
    }

    // No data found yet — return empty object so store uses its defaults
    return NextResponse.json({}, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });

  } catch (error) {
    console.error('API GET Error:', error);
    return NextResponse.json({ error: 'Failed to read database' }, { status: 500 });
  }
}

// POST: Save entire app state to Supabase
export async function POST(request: Request) {
  try {
    const appData = await request.json();

    if (supabase) {
      const { error } = await supabase
        .from('app_data')
        .upsert({
          id: APP_DATA_KEY,
          data: appData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (error) {
        console.error('Supabase POST Error:', error);
        return NextResponse.json({ error: 'Failed to save database' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('API POST Error:', error);
    return NextResponse.json({ error: 'Failed to save database' }, { status: 500 });
  }
}
