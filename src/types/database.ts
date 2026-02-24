// src/types/database.ts
export interface Database {
    public: {
      Tables: {
        clients: {
          Row: {
            id: string;
            name: string;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            name: string;
          };
          Update: {
            id?: string;
            name?: string;
          };
        };
        media_plans: {
          Row: {
            id: string;
            client_id: string;
            name: string;
            start_date: string;
            end_date: string;
            total_budget: number;
            status: 'draft' | 'active' | 'completed';
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            client_id: string;
            name: string;
            start_date: string;
            end_date: string;
            total_budget: number;
            status?: 'draft' | 'active' | 'completed';
          };
        };
        channels: {
          Row: {
            id: string;
            client_id: string;
            plan_id: string;
            channel: string;
            detail: string;
            type: 'paid' | 'organic' | 'both';
            created_at: string;
          };
        };
        weekly_plans: {
          Row: {
            id: string;
            channel_id: string;
            week_commencing: string;
            week_number: number;
            budget_planned: number;
            budget_actual: number;
            posts_planned: number;
            posts_actual: number;
            created_at: string;
          };
        };
        meta_ads_accounts: {
          Row: {
            id: string;
            user_id: string;
            account_id: string;
            account_name: string | null;
            is_active: boolean;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            user_id: string;
            account_id: string;
            account_name?: string | null;
            is_active?: boolean;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            user_id?: string;
            account_id?: string;
            account_name?: string | null;
            is_active?: boolean;
            updated_at?: string;
          };
        };
        action_points: {
          Row: {
            id: string;
            channel_type: string;
            text: string;
            completed: boolean;
            category: 'SET UP' | 'ONGOING';
            reset_frequency: 'weekly' | 'fortnightly' | 'monthly' | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            channel_type: string;
            text: string;
            completed?: boolean;
            category: 'SET UP' | 'ONGOING';
            reset_frequency?: 'weekly' | 'fortnightly' | 'monthly' | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            channel_type?: string;
            text?: string;
            completed?: boolean;
            category?: 'SET UP' | 'ONGOING';
            reset_frequency?: 'weekly' | 'fortnightly' | 'monthly' | null;
            updated_at?: string;
          };
        };
        client_health_status: {
          Row: {
            id: string;
            client_id: string;
            status: 'green' | 'amber' | 'red';
            active_channel_count: number;
            total_overdue_tasks: number;
            at_risk_tasks: number;
            total_budget_cents: number;
            total_spent_cents: number;
            budget_health_percentage: number | null;
            next_critical_date: string | null;
            next_critical_task: string | null;
            last_calculated_at: string;
            created_at: string;
            updated_at: string;
            mtd_actual_spend: number | null;
            mtd_actual_spend_updated_at: string | null;
          };
          Insert: {
            id?: string;
            client_id: string;
            status: 'green' | 'amber' | 'red';
            active_channel_count?: number;
            total_overdue_tasks?: number;
            at_risk_tasks?: number;
            total_budget_cents?: number;
            total_spent_cents?: number;
            budget_health_percentage?: number | null;
            next_critical_date?: string | null;
            next_critical_task?: string | null;
            last_calculated_at?: string;
            mtd_actual_spend?: number | null;
            mtd_actual_spend_updated_at?: string | null;
          };
          Update: {
            id?: string;
            client_id?: string;
            status?: 'green' | 'amber' | 'red';
            active_channel_count?: number;
            total_overdue_tasks?: number;
            at_risk_tasks?: number;
            total_budget_cents?: number;
            total_spent_cents?: number;
            budget_health_percentage?: number | null;
            next_critical_date?: string | null;
            next_critical_task?: string | null;
            last_calculated_at?: string;
            mtd_actual_spend?: number | null;
            mtd_actual_spend_updated_at?: string | null;
          };
        };
        client_tasks: {
          Row: {
            id: string;
            client_id: string;
            channel_id: string | null;
            task_type: 'setup' | 'health_check';
            title: string;
            description: string | null;
            due_date: string | null;
            frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
            last_completed_at: string | null;
            next_due_date: string | null;
            completed: boolean;
            assigned_to: string | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            client_id: string;
            channel_id?: string | null;
            task_type: 'setup' | 'health_check';
            title: string;
            description?: string | null;
            due_date?: string | null;
            frequency?: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
            last_completed_at?: string | null;
            next_due_date?: string | null;
            completed?: boolean;
            assigned_to?: string | null;
          };
          Update: {
            id?: string;
            client_id?: string;
            channel_id?: string | null;
            task_type?: 'setup' | 'health_check';
            title?: string;
            description?: string | null;
            due_date?: string | null;
            frequency?: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
            last_completed_at?: string | null;
            next_due_date?: string | null;
            completed?: boolean;
            assigned_to?: string | null;
          };
        };
        media_plan_funnels: {
          Row: {
            id: string;
            client_id: string | null;
            channel_ids: string[];
            name: string;
            config: Record<string, any>;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            client_id?: string | null;
            channel_ids?: string[];
            name: string;
            config: Record<string, any>;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            client_id?: string | null;
            channel_ids?: string[];
            name?: string;
            config?: Record<string, any>;
            updated_at?: string;
          };
        };
        ad_performance_metrics: {
          Row: {
            id: string;
            user_id: string;
            client_id: string | null;
            platform: 'google-ads' | 'meta-ads';
            account_id: string;
            account_name: string | null;
            campaign_id: string;
            campaign_name: string | null;
            date: string;
            spend: number;
            currency: string;
            impressions: number | null;
            clicks: number | null;
            ctr: number | null;
            average_cpc: number | null;
            conversions: number | null;
            reach: number | null;
            cpc: number | null;
            cpm: number | null;
            frequency: number | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            user_id: string;
            client_id?: string | null;
            platform: 'google-ads' | 'meta-ads';
            account_id: string;
            account_name?: string | null;
            campaign_id: string;
            campaign_name?: string | null;
            date: string;
            spend: number;
            currency?: string;
            impressions?: number | null;
            clicks?: number | null;
            ctr?: number | null;
            average_cpc?: number | null;
            conversions?: number | null;
            reach?: number | null;
            cpc?: number | null;
            cpm?: number | null;
            frequency?: number | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            user_id?: string;
            client_id?: string | null;
            platform?: 'google-ads' | 'meta-ads';
            account_id?: string;
            account_name?: string | null;
            campaign_id?: string;
            campaign_name?: string | null;
            date?: string;
            spend?: number;
            currency?: string;
            impressions?: number | null;
            clicks?: number | null;
            ctr?: number | null;
            average_cpc?: number | null;
            conversions?: number | null;
            reach?: number | null;
            cpc?: number | null;
            cpm?: number | null;
            frequency?: number | null;
            updated_at?: string;
          };
        };
      };
    };
  }

// Helper type aliases for convenience
export type Client = Database['public']['Tables']['clients']['Row'];
export type MediaPlan = Database['public']['Tables']['media_plans']['Row'];
export type Channel = Database['public']['Tables']['channels']['Row'];
export type WeeklyPlan = Database['public']['Tables']['weekly_plans']['Row'];
export type ActionPoint = Database['public']['Tables']['action_points']['Row'];

// Agency Dashboard types
export type ClientHealthStatus = Database['public']['Tables']['client_health_status']['Row'];
export type ClientTask = Database['public']['Tables']['client_tasks']['Row'];

// Ad Performance Metrics types
export type AdPerformanceMetric = Database['public']['Tables']['ad_performance_metrics']['Row'];
export type AdPerformanceMetricInsert = Database['public']['Tables']['ad_performance_metrics']['Insert'];
export type AdPerformanceMetricUpdate = Database['public']['Tables']['ad_performance_metrics']['Update'];

// Composite types for API responses
export type ClientWithHealth = Client & { health: ClientHealthStatus | null };
export type HealthStatus = 'green' | 'amber' | 'red';