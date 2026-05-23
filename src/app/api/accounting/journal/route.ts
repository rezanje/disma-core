import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PostingLineInput = {
  accountCode: string;
  amount: number;
};

type PostingLineWithId = PostingLineInput & {
  id: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toCamel = (obj: unknown): unknown => {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (!isRecord(obj)) return obj;
  const next: Record<string, unknown> = {};
  Object.keys(obj).forEach((key) => {
    const camelKey = key.replace(/(_\w)/g, (match) => match[1].toUpperCase());
    next[camelKey] = toCamel(obj[key]);
  });
  return next;
};

const readString = (value: unknown, field: string) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
};

const parsePostingLines = (value: unknown, side: 'debit' | 'credit'): PostingLineWithId[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${side}s must be an array`);
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        throw new Error(`${side} line ${index + 1} must be an object`);
      }

      const accountCode = readString(item.accountCode ?? item.account_code, `${side} account code`);
      const amount = Number(item.amount);

      if (!Number.isFinite(amount)) {
        throw new Error(`${side} amount for ${accountCode} must be a finite number`);
      }
      if (amount < 0) {
        throw new Error(`${side} amount for ${accountCode} cannot be negative`);
      }

      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id : uuidv4(),
        accountCode,
        amount,
      };
    })
    .filter((line) => line.amount > 0);
};

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase Admin not initialized' }, { status: 500 });
    }

    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const description = readString(body.description, 'description');
    const referenceType = typeof body.referenceType === 'string'
      ? body.referenceType
      : (typeof body.reference_type === 'string' ? body.reference_type : null);
    const referenceId = readString(body.referenceId ?? body.reference_id, 'referenceId');
    const transactionDate = typeof body.date === 'string' && body.date.trim()
      ? body.date
      : new Date().toISOString();

    const debits = parsePostingLines(body.debits, 'debit');
    const credits = parsePostingLines(body.credits, 'credit');
    const totalDebit = debits.reduce((sum, line) => sum + line.amount, 0);
    const totalCredit = credits.reduce((sum, line) => sum + line.amount, 0);

    if (debits.length === 0 || credits.length === 0 || totalDebit <= 0 || totalCredit <= 0) {
      return NextResponse.json({ error: 'Journal must have positive debit and credit lines' }, { status: 400 });
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json({
        error: `Journal is not balanced: debit ${totalDebit}, credit ${totalCredit}`,
      }, { status: 400 });
    }

    const entryId = typeof body.entryId === 'string' && body.entryId.trim()
      ? body.entryId
      : uuidv4();

    const { data, error } = await supabaseAdmin.rpc('post_journal_entry', {
      p_entry_id: entryId,
      p_transaction_date: transactionDate,
      p_description: description,
      p_reference_type: referenceType,
      p_reference_id: referenceId,
      p_debits: debits,
      p_credits: credits,
    });

    if (error) {
      console.error('[Accounting API] post_journal_entry failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(toCamel(data), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to post journal entry';
    console.error('[Accounting API] POST error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
