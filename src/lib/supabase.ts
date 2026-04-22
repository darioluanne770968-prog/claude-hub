import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface DbSession {
  id: string;
  user_id: string;
  session_id: string;
  project_path: string | null;
  project_name: string | null;
  first_message: string | null;
  summaries: string[];
  summaries_with_timestamps: { text: string; timestamp: string }[];
  message_count: number;
  is_ide: boolean;
  custom_name: string | null;
  last_modified: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  entry_type: string | null;
  content: Record<string, unknown> | null;
  message_uuid: string | null;
  parent_uuid: string | null;
  timestamp: string | null;
  created_at: string;
}

export interface DbUserData {
  id: string;
  user_id: string;
  session_id: string;
  is_favorite: boolean;
  is_archived: boolean;
  custom_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTag {
  id: string;
  user_id: string;
  session_id: string;
  tag_name: string;
  created_at: string;
}
