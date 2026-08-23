import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Defense-in-depth: hub routes rely on RLS for tenant isolation, but this
// gives an explicit app-level backstop in case a policy ever regresses.
export async function isClientOwnedByUser(
  supabase: SupabaseClient<Database>,
  clientId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!data;
}
