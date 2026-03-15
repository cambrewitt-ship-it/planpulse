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
  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User must be authenticated to create a client');
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({
      name,
      user_id: user.id
    })
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

export async function updateClient(clientId: string, name: string, notes?: string | null) {
  const updateData: { name: string; notes?: string | null } = { name };
  if (notes !== undefined) {
    updateData.notes = notes;
  }
  
  const { data, error } = await supabase
    .from('clients')
    .update(updateData)
    .eq('id', clientId)
    .select()
    .single();
  
  if (error) {
    const errorMessage = error.message || 'Failed to update client';
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

// Media Plan Builder functions
export interface MediaPlanBuilderData {
  channels: any[];
  commission: number;
}

// Helper to normalise channel names into the same format used by action_points.channel_type
// e.g. "meta ads" -> "Meta Ads"
function normalizeChannelType(name: string | null | undefined): string | null {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractChannelTypesFromChannels(rawChannels: any[] | null | undefined): Set<string> {
  const types = new Set<string>();
  if (!rawChannels || !Array.isArray(rawChannels)) return types;

  for (const ch of rawChannels as any[]) {
    const raw =
      ch?.channelName ??
      ch?.name ??
      ch?.platform ??
      null;
    const normalized = normalizeChannelType(raw);
    if (normalized) {
      types.add(normalized);
    }
  }

  return types;
}

// Convert Date objects to ISO strings for JSON storage
function serializeMediaPlanBuilderData(data: MediaPlanBuilderData): any {
  const serializedChannels = (data.channels || []).map(channel => ({
    ...channel,
    flights: (channel.flights || []).map((flight: any) => {
      let startWeek: string;
      let endWeek: string;
      
      // Handle startWeek
      if (flight.startWeek instanceof Date) {
        startWeek = flight.startWeek.toISOString();
      } else if (typeof flight.startWeek === 'string') {
        startWeek = flight.startWeek;
      } else {
        startWeek = new Date().toISOString();
      }
      
      // Handle endWeek
      if (flight.endWeek instanceof Date) {
        endWeek = flight.endWeek.toISOString();
      } else if (typeof flight.endWeek === 'string') {
        endWeek = flight.endWeek;
      } else {
        endWeek = new Date().toISOString();
      }
      
      return {
        ...flight,
        startWeek,
        endWeek,
      };
    }),
  }));

  return {
    channels: serializedChannels,
    commission: typeof data.commission === 'number' ? data.commission : 0,
  };
}

// Convert ISO strings back to Date objects
function deserializeMediaPlanBuilderData(data: any): MediaPlanBuilderData {
  const deserializedChannels = (data.channels || []).map((channel: any) => ({
    ...channel,
    flights: (channel.flights || []).map((flight: any) => ({
      ...flight,
      startWeek: flight.startWeek ? new Date(flight.startWeek) : new Date(),
      endWeek: flight.endWeek ? new Date(flight.endWeek) : new Date(),
    })),
  }));

  return {
    channels: deserializedChannels,
    commission: data.commission || 0,
  };
}

export async function saveClientMediaPlanBuilder(
  clientId: string,
  data: MediaPlanBuilderData,
  supabaseClient?: typeof supabase
) {
  const dbClient = supabaseClient || supabase;
  
  console.log('saveClientMediaPlanBuilder called with:', { 
    clientId, 
    channelsCount: data.channels?.length || 0, 
    commission: data.commission 
  });

  try {
    // 1) Fetch existing channel types for this client (before update)
    const { data: existingRow, error: existingError } = await dbClient
      .from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      // PGRST116 = no row found, which is fine for first-time save
      console.error('Error loading existing client_media_plan_builder row:', existingError);
      throw existingError;
    }

    const previousChannelTypes = extractChannelTypesFromChannels(
      existingRow?.channels as any[] | null | undefined
    );
    const newChannelTypes = extractChannelTypesFromChannels(data.channels);

    // Channel types that are newly added in this save (were not present before)
    const newlyAddedChannelTypes: string[] = [];
    for (const type of newChannelTypes) {
      if (!previousChannelTypes.has(type)) {
        newlyAddedChannelTypes.push(type);
      }
    }

    const serializedData = serializeMediaPlanBuilderData(data);
    console.log('Serialized data:', { 
      channelsCount: serializedData.channels?.length || 0, 
      commission: serializedData.commission 
    });

    // 2) Upsert the media plan builder snapshot
    const { data: result, error } = await dbClient
      .from('client_media_plan_builder')
      .upsert(
        {
          client_id: clientId,
          channels: serializedData.channels,
          commission: serializedData.commission,
        },
        {
          onConflict: 'client_id',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Database error in saveClientMediaPlanBuilder:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }
    
    console.log('Successfully saved to database');

    // 3) If any channel types were newly added, reset their per-client action point completions
    if (newlyAddedChannelTypes.length > 0) {
      console.log('Newly added channel types detected; resetting action point completions for:', newlyAddedChannelTypes);

      for (const channelType of newlyAddedChannelTypes) {
        try {
          // Find all action point IDs for this channel_type
          const { data: actionPoints, error: apError } = await dbClient
            .from('action_points')
            .select('id')
            .eq('channel_type', channelType);

          if (apError) {
            console.error('Error fetching action points for reset:', {
              channelType,
              error: apError,
            });
            continue;
          }

          const actionPointIds = (actionPoints || []).map((ap: any) => ap.id);
          if (actionPointIds.length === 0) {
            continue;
          }

          // Delete all per-client completions for this client + channel_type
          const { error: deleteError } = await dbClient
            .from('client_action_point_completions')
            .delete()
            .eq('client_id', clientId)
            .in('action_point_id', actionPointIds);

          if (deleteError) {
            console.error('Error resetting client_action_point_completions for channel type:', {
              clientId,
              channelType,
              error: deleteError,
            });
          } else {
            console.log('Reset client_action_point_completions for channel type:', {
              clientId,
              channelType,
              resetCount: actionPointIds.length,
            });
          }
        } catch (resetError: any) {
          console.error('Unexpected error while resetting action point completions:', {
            clientId,
            channelType,
            error: resetError,
          });
        }
      }
    }

    return result;
  } catch (error: any) {
    console.error('Error in saveClientMediaPlanBuilder:', error);
    // If it's already a Supabase error, re-throw it
    if (error.code || error.message) {
      throw error;
    }
    // Otherwise, wrap it in a more descriptive error
    throw new Error(`Failed to save media plan builder data: ${error.message || 'Unknown error'}`);
  }
}

export async function getClientMediaPlanBuilder(
  clientId: string,
  supabaseClient?: typeof supabase
): Promise<MediaPlanBuilderData | null> {
  const dbClient = supabaseClient || supabase;
  
  const { data, error } = await dbClient
    .from('client_media_plan_builder')
    .select('*')
    .eq('client_id', clientId)
    .single();

  if (error) {
    // If no data exists yet, return null (not an error)
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  if (!data) return null;

  return deserializeMediaPlanBuilderData({
    channels: data.channels,
    commission: data.commission,
  });
}