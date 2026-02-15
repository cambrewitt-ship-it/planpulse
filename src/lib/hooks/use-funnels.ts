import { useState, useCallback } from 'react';
import { FunnelConfig, MediaPlanFunnel } from '@/lib/types/funnel';
import {
  ListFunnelsResponse,
  CreateFunnelRequest,
  CreateFunnelResponse,
  UpdateFunnelResponse,
  DeleteFunnelResponse,
  CalculateFunnelResponse,
} from '@/lib/types/funnel-api';

export function useFunnels(channelId: string) {
  const [funnels, setFunnels] = useState<MediaPlanFunnel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFunnels = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/funnels?channelId=${channelId}`);
      const data: ListFunnelsResponse = await response.json();
      
      if (data.success && data.funnels) {
        setFunnels(data.funnels);
      } else {
        setError(data.error || 'Failed to load funnels');
      }
    } catch (err) {
      setError('Failed to load funnels');
      console.error('Load funnels error:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  const createFunnel = useCallback(async (name: string, config: FunnelConfig): Promise<boolean> => {
    setError(null);
    
    try {
      const requestBody: CreateFunnelRequest = {
        channelId,
        name,
        config,
      };
      
      const response = await fetch('/api/funnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      const data: CreateFunnelResponse = await response.json();
      
      if (data.success && data.funnel) {
        setFunnels(prev => [...prev, data.funnel!]);
        return true;
      } else {
        setError(data.error || 'Failed to create funnel');
        return false;
      }
    } catch (err) {
      setError('Failed to create funnel');
      console.error('Create funnel error:', err);
      return false;
    }
  }, [channelId]);

  const updateFunnel = useCallback(async (
    funnelId: string,
    updates: { name?: string; config?: FunnelConfig }
  ): Promise<boolean> => {
    setError(null);
    
    try {
      const response = await fetch(`/api/funnels/${funnelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      const data: UpdateFunnelResponse = await response.json();
      
      if (data.success && data.funnel) {
        setFunnels(prev =>
          prev.map(f => f.id === funnelId ? data.funnel! : f)
        );
        return true;
      } else {
        setError(data.error || 'Failed to update funnel');
        return false;
      }
    } catch (err) {
      setError('Failed to update funnel');
      console.error('Update funnel error:', err);
      return false;
    }
  }, []);

  const deleteFunnel = useCallback(async (funnelId: string): Promise<boolean> => {
    setError(null);
    
    try {
      const response = await fetch(`/api/funnels/${funnelId}`, {
        method: 'DELETE',
      });
      
      const data: DeleteFunnelResponse = await response.json();
      
      if (data.success) {
        setFunnels(prev => prev.filter(f => f.id !== funnelId));
        return true;
      } else {
        setError(data.error || 'Failed to delete funnel');
        return false;
      }
    } catch (err) {
      setError('Failed to delete funnel');
      console.error('Delete funnel error:', err);
      return false;
    }
  }, []);

  const calculateFunnel = useCallback(async (
    funnelId: string,
    startDate: string,
    endDate: string
  ): Promise<CalculateFunnelResponse | null> => {
    setError(null);
    
    try {
      const response = await fetch(
        `/api/funnels/${funnelId}/calculate?startDate=${startDate}&endDate=${endDate}`
      );
      
      const data: CalculateFunnelResponse = await response.json();
      
      if (data.success) {
        return data;
      } else {
        setError(data.error || 'Failed to calculate funnel');
        return null;
      }
    } catch (err) {
      setError('Failed to calculate funnel');
      console.error('Calculate funnel error:', err);
      return null;
    }
  }, []);

  return {
    funnels,
    loading,
    error,
    loadFunnels,
    createFunnel,
    updateFunnel,
    deleteFunnel,
    calculateFunnel,
  };
}
