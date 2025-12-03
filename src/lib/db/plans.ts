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
  console.log('createMediaPlan called with:', { clientId, channelsCount: channels.length, channels });
  
  // Calculate plan dates and total budget
  const startDates = channels.map(c => new Date(c.startWeek));
  const endDates = channels.map(c => new Date(c.endWeek));
  const planStart = new Date(Math.min(...startDates.map(d => d.getTime())));
  const planEnd = new Date(Math.max(...endDates.map(d => d.getTime())));
  const totalBudget = channels.reduce((sum, c) => sum + c.totalBudget, 0);

  console.log('Plan details:', { planStart, planEnd, totalBudget });

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

  if (planError) {
    console.error('Error creating media plan:', planError);
    throw planError;
  }

  console.log('Media plan created:', plan);

  // 2. Create channels
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    console.log(`Creating channel ${i + 1}/${channels.length}:`, { 
      channel: channel.channel, 
      detail: channel.detail, 
      type: channel.isOrganic ? 'organic' : 'paid',
      startWeek: channel.startWeek,
      endWeek: channel.endWeek,
      weeklyBudget: channel.weeklyBudget,
      totalBudget: channel.totalBudget
    });
    
    try {
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

      if (channelError) {
        console.error(`Error creating channel ${i + 1}:`, channelError, 'Channel data:', channel);
        throw new Error(`Failed to create channel "${channel.channel} - ${channel.detail}": ${channelError.message}`);
      }

      console.log(`Channel ${i + 1} created successfully:`, dbChannel);

      // 3. Create weekly plans for each channel
      const weeklyPlans = [];
      let currentWeek = new Date(channel.startWeek);
      const endWeek = new Date(channel.endWeek);
      let weekNumber = 1;

      // Validate dates
      if (isNaN(currentWeek.getTime()) || isNaN(endWeek.getTime())) {
        throw new Error(`Invalid date range for channel "${channel.channel} - ${channel.detail}": startWeek=${channel.startWeek}, endWeek=${channel.endWeek}`);
      }

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
        console.log(`Creating ${weeklyPlans.length} weekly plans for channel ${i + 1}`);
        const { error: weeklyError } = await supabase
          .from('weekly_plans')
          .insert(weeklyPlans);

        if (weeklyError) {
          console.error(`Error creating weekly plans for channel ${i + 1}:`, weeklyError);
          throw new Error(`Failed to create weekly plans for channel "${channel.channel} - ${channel.detail}": ${weeklyError.message}`);
        }
        console.log(`Weekly plans created successfully for channel ${i + 1}`);
      } else {
        console.warn(`No weekly plans to create for channel ${i + 1} (startWeek: ${channel.startWeek}, endWeek: ${channel.endWeek})`);
      }
    } catch (error) {
      console.error(`Failed to save channel ${i + 1} (${channel.channel} - ${channel.detail}):`, error);
      // Re-throw with more context
      throw error;
    }
  }
  
  console.log(`Successfully created all ${channels.length} channels`);

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

export async function getPlanById(planId: string) {
  const { data: plan, error: planError } = await supabase
    .from('media_plans')
    .select(`
      *,
      clients (id, name)
    `)
    .eq('id', planId)
    .single();

  if (planError) throw planError;

  // Get channels for this plan
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at');

  if (channelsError) throw channelsError;

  // Get weekly plans for each channel
  const channelsWithWeeklyPlans = await Promise.all(
    (channels || []).map(async (channel) => {
      const { data: weeklyPlans, error: weeklyError } = await supabase
        .from('weekly_plans')
        .select('*')
        .eq('channel_id', channel.id)
        .order('week_commencing');

      if (weeklyError) throw weeklyError;

      return {
        ...channel,
        weekly_plans: weeklyPlans || []
      };
    })
  );

  return {
    ...plan,
    channels: channelsWithWeeklyPlans
  };
}

export async function updateMediaPlan(
  planId: string,
  updates: {
    name?: string;
    start_date?: string;
    end_date?: string;
    total_budget?: number;
    status?: string;
  }
) {
  const { data, error } = await supabase
    .from('media_plans')
    .update(updates)
    .eq('id', planId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMediaPlanWithChannels(
  planId: string,
  clientId: string,
  planUpdates: {
    name?: string;
    start_date?: string;
    end_date?: string;
    total_budget?: number;
    status?: string;
  },
  channels: MediaChannel[]
) {
  // Calculate plan dates and total budget from channels
  const startDates = channels.map(c => new Date(c.startWeek));
  const endDates = channels.map(c => new Date(c.endWeek));
  const planStart = new Date(Math.min(...startDates.map(d => d.getTime())));
  const planEnd = new Date(Math.max(...endDates.map(d => d.getTime())));
  const totalBudget = channels.reduce((sum, c) => sum + c.totalBudget, 0);

  // 1. If setting status to 'active', deactivate all other active plans for this client
  if (planUpdates.status === 'active') {
    const { error: deactivateError } = await supabase
      .from('media_plans')
      .update({ status: 'draft' })
      .eq('client_id', clientId)
      .eq('status', 'active')
      .neq('id', planId);

    if (deactivateError) throw deactivateError;
  }

  // 2. Update the media plan
  const planUpdateData = {
    ...planUpdates,
    start_date: format(planStart, 'yyyy-MM-dd'),
    end_date: format(planEnd, 'yyyy-MM-dd'),
    total_budget: totalBudget * 100, // Convert to cents
  };
  
  const { error: planError } = await supabase
    .from('media_plans')
    .update(planUpdateData)
    .eq('id', planId);

  if (planError) throw planError;

  // 3. Get existing channels
  const { data: existingChannels, error: channelsError } = await supabase
    .from('channels')
    .select('id')
    .eq('plan_id', planId);

  if (channelsError) throw channelsError;

  const existingChannelIds = new Set((existingChannels || []).map(c => c.id));
  const incomingChannelIds = new Set(
    channels
      .filter(c => c.id && c.id.startsWith('db-')) // Only existing channels have db- prefix
      .map(c => c.id.replace('db-', ''))
  );

  // 4. Delete channels that are no longer in the list
  const channelsToDelete = Array.from(existingChannelIds).filter(
    id => !incomingChannelIds.has(id)
  );

  if (channelsToDelete.length > 0) {
    // Delete weekly plans first (foreign key constraint)
    const { error: weeklyDeleteError } = await supabase
      .from('weekly_plans')
      .delete()
      .in('channel_id', channelsToDelete);

    if (weeklyDeleteError) throw weeklyDeleteError;

    // Delete channels
    const { error: channelDeleteError } = await supabase
      .from('channels')
      .delete()
      .in('id', channelsToDelete);

    if (channelDeleteError) throw channelDeleteError;
  }

  // 5. Update or create channels
  for (const channel of channels) {
    const isExisting = channel.id && channel.id.startsWith('db-');
    let channelDbId: string;

    if (isExisting) {
      // Update existing channel
      channelDbId = channel.id.replace('db-', '');
      const { error: channelUpdateError } = await supabase
        .from('channels')
        .update({
          channel: channel.channel,
          detail: channel.detail,
          type: channel.isOrganic ? 'organic' : 'paid'
        })
        .eq('id', channelDbId);

      if (channelUpdateError) throw channelUpdateError;

      // Delete existing weekly plans for this channel
      const { error: weeklyDeleteError } = await supabase
        .from('weekly_plans')
        .delete()
        .eq('channel_id', channelDbId);

      if (weeklyDeleteError) throw weeklyDeleteError;
    } else {
      // Create new channel
      const { data: newChannel, error: channelCreateError } = await supabase
        .from('channels')
        .insert({
          client_id: clientId,
          plan_id: planId,
          channel: channel.channel,
          detail: channel.detail,
          type: channel.isOrganic ? 'organic' : 'paid'
        })
        .select()
        .single();

      if (channelCreateError) throw channelCreateError;
      channelDbId = newChannel.id;
    }

    // 6. Create weekly plans for this channel
    const weeklyPlans = [];
    let currentWeek = new Date(channel.startWeek);
    const endWeek = new Date(channel.endWeek);
    let weekNumber = 1;

    while (currentWeek <= endWeek) {
      weeklyPlans.push({
        channel_id: channelDbId,
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

  return { success: true };
}

export async function deleteMediaPlan(planId: string) {
  // 1. Get all channels for this plan
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('id')
    .eq('plan_id', planId);

  if (channelsError) throw channelsError;

  const channelIds = (channels || []).map(c => c.id);

  // 2. Delete weekly plans first (foreign key constraint)
  if (channelIds.length > 0) {
    const { error: weeklyDeleteError } = await supabase
      .from('weekly_plans')
      .delete()
      .in('channel_id', channelIds);

    if (weeklyDeleteError) throw weeklyDeleteError;
  }

  // 3. Delete channels
  if (channelIds.length > 0) {
    const { error: channelDeleteError } = await supabase
      .from('channels')
      .delete()
      .in('id', channelIds);

    if (channelDeleteError) throw channelDeleteError;
  }

  // 4. Delete the media plan
  const { error: planDeleteError } = await supabase
    .from('media_plans')
    .delete()
    .eq('id', planId);

  if (planDeleteError) throw planDeleteError;

  return { success: true };
}