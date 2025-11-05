// src/lib/db/plans.ts
import { supabase } from '@/lib/supabase/client';
import { MediaChannel } from '@/types/media-plan';
import { addWeeks, format, parseISO } from 'date-fns';

export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name');
  
  if (error) throw error;
  return data;
}

export async function createClient(name: string) {
  const { data, error } = await supabase
    .from('clients')
    .insert({ name })
    .select()
    .single();
  
  if (error) {
    const errorMessage = error.message || 'Failed to create client';
    const errorDetails = {
      message: errorMessage,
      code: error.code,
      details: error.details,
      hint: error.hint
    };
    throw new Error(JSON.stringify(errorDetails));
  }
  return data;
}

export async function createMediaPlan(
  clientId: string,
  channels: MediaChannel[]
) {
  // Calculate plan dates and total budget
  const startDates = channels.map(c => new Date(c.startWeek));
  const endDates = channels.map(c => new Date(c.endWeek));
  const planStart = new Date(Math.min(...startDates.map(d => d.getTime())));
  const planEnd = new Date(Math.max(...endDates.map(d => d.getTime())));
  const totalBudget = channels.reduce((sum, c) => sum + c.totalBudget, 0);

  // 1. Create the media plan
  const { data: plan, error: planError } = await supabase
    .from('media_plans')
    .insert({
      client_id: clientId,
      name: `Media Plan - ${format(new Date(), 'MMMM yyyy')}`,
      start_date: format(planStart, 'yyyy-MM-dd'),
      end_date: format(planEnd, 'yyyy-MM-dd'),
      total_budget: totalBudget * 100, // Convert to cents
      status: 'draft'
    })
    .select()
    .single();

  if (planError) throw planError;

  // 2. Create channels
  for (const channel of channels) {
    const { data: dbChannel, error: channelError } = await supabase
      .from('channels')
      .insert({
        client_id: clientId,
        plan_id: plan.id,
        channel: channel.channel,
        detail: channel.detail,
        type: channel.isOrganic ? 'organic' : 'paid'
      })
      .select()
      .single();

    if (channelError) throw channelError;

    // 3. Create weekly plans for each channel
    const weeklyPlans = [];
    let currentWeek = new Date(channel.startWeek);
    const endWeek = new Date(channel.endWeek);
    let weekNumber = 1;

    while (currentWeek <= endWeek) {
      weeklyPlans.push({
        channel_id: dbChannel.id,
        week_commencing: format(currentWeek, 'yyyy-MM-dd'),
        week_number: weekNumber,
        budget_planned: Math.round(channel.weeklyBudget * 100), // Convert to cents
        posts_planned: channel.postsPerWeek || 0
      });
      currentWeek = addWeeks(currentWeek, 1);
      weekNumber++;
    }

    if (weeklyPlans.length > 0) {
      const { error: weeklyError } = await supabase
        .from('weekly_plans')
        .insert(weeklyPlans);

      if (weeklyError) throw weeklyError;
    }
  }

  return plan;
}

export async function getMediaPlans(clientId?: string) {
  let query = supabase
    .from('media_plans')
    .select(`
      *,
      clients (name),
      channels (*)
    `)
    .order('created_at', { ascending: false });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}