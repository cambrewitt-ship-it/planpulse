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
          Relationships: [];
        };
        account_managers: {
          Row: {
            id: string;
            name: string;
            email: string | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            name: string;
            email?: string | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            name?: string;
            email?: string | null;
            updated_at?: string;
          };
          Relationships: [];
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
          Update: {
            id?: string;
            client_id?: string;
            name?: string;
            start_date?: string;
            end_date?: string;
            total_budget?: number;
            status?: 'draft' | 'active' | 'completed';
          };
          Relationships: [];
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
          Insert: {
            id?: string;
            client_id: string;
            plan_id: string;
            channel: string;
            detail?: string;
            type?: 'paid' | 'organic' | 'both';
            created_at?: string;
          };
          Update: {
            id?: string;
            client_id?: string;
            plan_id?: string;
            channel?: string;
            detail?: string;
            type?: 'paid' | 'organic' | 'both';
          };
          Relationships: [];
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
          Insert: {
            id?: string;
            channel_id: string;
            week_commencing: string;
            week_number: number;
            budget_planned?: number;
            budget_actual?: number;
            posts_planned?: number;
            posts_actual?: number;
          };
          Update: {
            id?: string;
            channel_id?: string;
            week_commencing?: string;
            week_number?: number;
            budget_planned?: number;
            budget_actual?: number;
            posts_planned?: number;
            posts_actual?: number;
          };
          Relationships: [];
        };
        meta_ads_accounts: {
          Row: {
            id: string;
            user_id: string;
            account_id: string;
            account_name: string | null;
            currency: string | null;
            is_active: boolean;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            user_id: string;
            account_id: string;
            account_name?: string | null;
            currency?: string | null;
            is_active?: boolean;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            user_id?: string;
            account_id?: string;
            account_name?: string | null;
            currency?: string | null;
            is_active?: boolean;
            updated_at?: string;
          };
          Relationships: [];
        };
        action_points: {
          Row: {
            id: string;
            channel_type: string;
            text: string;
            completed: boolean;
            category: 'SET UP' | 'HEALTH CHECK' | 'ONGOING';
            frequency: string | null;
            days_before_live_due: number | null;
            due_date: string | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            channel_type: string;
            text: string;
            completed?: boolean;
            category: 'SET UP' | 'HEALTH CHECK' | 'ONGOING';
            frequency?: string | null;
            days_before_live_due?: number | null;
            due_date?: string | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            channel_type?: string;
            text?: string;
            completed?: boolean;
            category?: 'SET UP' | 'HEALTH CHECK' | 'ONGOING';
            frequency?: string | null;
            days_before_live_due?: number | null;
            due_date?: string | null;
            updated_at?: string;
          };
          Relationships: [];
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
          Relationships: [];
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
          Relationships: [];
        };
        media_plan_funnels: {
          Row: {
            id: string;
            client_id: string | null;
            channel_ids: string[];
            name: string;
            config: Record<string, unknown>;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            client_id?: string | null;
            channel_ids?: string[];
            name: string;
            config: Record<string, unknown>;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            client_id?: string | null;
            channel_ids?: string[];
            name?: string;
            config?: Record<string, unknown>;
            updated_at?: string;
          };
          Relationships: [];
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
          Relationships: [];
        };
        organic_social_actuals: {
          Row: {
            id: string;
            client_id: string;
            channel_name: string;
            week_commencing: string;
            posts_published: number;
            posts_automatic: number;
            manual_stamp_count: number;
            notes: string | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            client_id: string;
            channel_name: string;
            week_commencing: string;
            posts_published?: number;
            posts_automatic?: number;
            manual_stamp_count?: number;
            notes?: string | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            client_id?: string;
            channel_name?: string;
            week_commencing?: string;
            posts_published?: number;
            posts_automatic?: number;
            manual_stamp_count?: number;
            notes?: string | null;
            updated_at?: string;
          };
          Relationships: [];
        };
        edm_actuals: {
          Row: {
            id: string;
            client_id: string;
            channel_name: string;
            send_date: string;
            subject: string | null;
            notes: string | null;
            created_at: string;
          };
          Insert: {
            id?: string;
            client_id: string;
            channel_name: string;
            send_date: string;
            subject?: string | null;
            notes?: string | null;
            created_at?: string;
          };
          Update: {
            id?: string;
            client_id?: string;
            channel_name?: string;
            send_date?: string;
            subject?: string | null;
            notes?: string | null;
          };
          Relationships: [];
        };
        ad_platform_connections: {
          Row: {
            id: string;
            user_id: string;
            client_id: string | null;
            platform: string;
            connection_id: string;
            connection_status: string;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            user_id: string;
            client_id?: string | null;
            platform: string;
            connection_id: string;
            connection_status?: string;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            user_id?: string;
            client_id?: string | null;
            platform?: string;
            connection_id?: string;
            connection_status?: string;
            updated_at?: string;
          };
          Relationships: [];
        };
        google_ads_accounts: {
          Row: {
            id: string;
            user_id: string;
            connection_id: string;
            customer_id: string;
            account_name: string | null;
            is_active: boolean;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            user_id: string;
            connection_id: string;
            customer_id: string;
            account_name?: string | null;
            is_active?: boolean;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            user_id?: string;
            connection_id?: string;
            customer_id?: string;
            account_name?: string | null;
            is_active?: boolean;
            updated_at?: string;
          };
          Relationships: [];
        };
        google_analytics_accounts: {
          Row: {
            id: string;
            user_id: string;
            connection_id: string | null;
            property_id: string;
            property_name: string | null;
            account_id: string | null;
            account_name: string | null;
            is_active: boolean;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            user_id: string;
            connection_id?: string | null;
            property_id: string;
            property_name?: string | null;
            account_id?: string | null;
            account_name?: string | null;
            is_active?: boolean;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            user_id?: string;
            connection_id?: string | null;
            property_id?: string;
            property_name?: string | null;
            account_id?: string | null;
            account_name?: string | null;
            is_active?: boolean;
            updated_at?: string;
          };
          Relationships: [];
        };
        google_analytics_metrics: {
          Row: {
            id: string;
            user_id: string;
            client_id: string | null;
            property_id: string;
            date: string;
            metric_name: string;
            metric_value: number;
            users_count: number | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            user_id: string;
            client_id?: string | null;
            property_id: string;
            date: string;
            metric_name: string;
            metric_value: number;
            users_count?: number | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            user_id?: string;
            client_id?: string | null;
            property_id?: string;
            date?: string;
            metric_name?: string;
            metric_value?: number;
            users_count?: number | null;
            updated_at?: string;
          };
          Relationships: [];
        };
        client_action_point_completions: {
          Row: {
            id: string;
            client_id: string;
            action_point_id: string;
            completed: boolean;
            completed_at: string | null;
            assigned_to: string | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            client_id: string;
            action_point_id: string;
            completed?: boolean;
            completed_at?: string | null;
            assigned_to?: string | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            client_id?: string;
            action_point_id?: string;
            completed?: boolean;
            completed_at?: string | null;
            assigned_to?: string | null;
            updated_at?: string;
          };
          Relationships: [];
        };
        client_media_plan_builder: {
          Row: {
            id: string;
            client_id: string;
            channels: unknown;
            commission: number | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            client_id: string;
            channels?: unknown;
            commission?: number | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            client_id?: string;
            channels?: unknown;
            commission?: number | null;
            updated_at?: string;
          };
          Relationships: [];
        };
        media_channel_library: {
          Row: {
            id: string;
            title: string;
            notes: string | null;
            channel_type: string;
            created_at: string;
            updated_at: string | null;
          };
          Insert: {
            id?: string;
            title: string;
            notes?: string | null;
            channel_type: string;
            created_at?: string;
            updated_at?: string | null;
          };
          Update: {
            id?: string;
            title?: string;
            notes?: string | null;
            channel_type?: string;
            updated_at?: string | null;
          };
          Relationships: [];
        };
        media_channel_specs: {
          Row: {
            id: string;
            media_channel_library_id: string;
            spec_text: string;
            created_at: string;
          };
          Insert: {
            id?: string;
            media_channel_library_id: string;
            spec_text: string;
            created_at?: string;
          };
          Update: {
            id?: string;
            media_channel_library_id?: string;
            spec_text?: string;
          };
          Relationships: [];
        };
        integrations: {
          Row: {
            id: string;
            client_id: string;
            provider: string;
            connection_id: string | null;
            last_sync: string | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
            client_id: string;
            provider: string;
            connection_id?: string | null;
            last_sync?: string | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
            client_id?: string;
            provider?: string;
            connection_id?: string | null;
            last_sync?: string | null;
            updated_at?: string;
          };
          Relationships: [];
        };
      };
      Views: { [_ in never]: never };
      Functions: { [_ in never]: never };
      Enums: { [_ in never]: never };
      CompositeTypes: { [_ in never]: never };
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

// Non-digital channel actuals types
export type OrganicSocialActual = Database['public']['Tables']['organic_social_actuals']['Row'];
export type OrganicSocialActualInsert = Database['public']['Tables']['organic_social_actuals']['Insert'];
export type OrganicSocialActualUpdate = Database['public']['Tables']['organic_social_actuals']['Update'];

export type EdmActual = Database['public']['Tables']['edm_actuals']['Row'];
export type EdmActualInsert = Database['public']['Tables']['edm_actuals']['Insert'];
export type EdmActualUpdate = Database['public']['Tables']['edm_actuals']['Update'];

// Composite types for API responses
export type ClientWithHealth = Client & { health: ClientHealthStatus | null };
export type HealthStatus = 'green' | 'amber' | 'red';
