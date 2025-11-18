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
      };
    };
  }