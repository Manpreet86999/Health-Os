export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      body_os_exercise_aliases: {
        Row: {
          alias: string
          auto_match_allowed: boolean
          created_at: string
          exercise_id: string
          id: number
          normalized_alias: string
          updated_at: string
        }
        Insert: {
          alias: string
          auto_match_allowed?: boolean
          created_at?: string
          exercise_id: string
          id?: number
          normalized_alias: string
          updated_at?: string
        }
        Update: {
          alias?: string
          auto_match_allowed?: boolean
          created_at?: string
          exercise_id?: string
          id?: number
          normalized_alias?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_os_exercise_aliases_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "body_os_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      body_os_exercise_media: {
        Row: {
          created_at: string
          embed_url: string | null
          exercise_id: string
          id: string
          inherited_from_exercise_id: string | null
          is_primary: boolean
          match_confidence: number | null
          match_method: string | null
          media_type: string
          metadata: Json
          provider: string
          provider_asset_id: string | null
          source_url: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          embed_url?: string | null
          exercise_id: string
          id?: string
          inherited_from_exercise_id?: string | null
          is_primary?: boolean
          match_confidence?: number | null
          match_method?: string | null
          media_type: string
          metadata?: Json
          provider: string
          provider_asset_id?: string | null
          source_url?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          embed_url?: string | null
          exercise_id?: string
          id?: string
          inherited_from_exercise_id?: string | null
          is_primary?: boolean
          match_confidence?: number | null
          match_method?: string | null
          media_type?: string
          metadata?: Json
          provider?: string
          provider_asset_id?: string | null
          source_url?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "body_os_exercise_media_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "body_os_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_os_exercise_media_inherited_from_exercise_id_fkey"
            columns: ["inherited_from_exercise_id"]
            isOneToOne: false
            referencedRelation: "body_os_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      body_os_exercise_media_requests: {
        Row: {
          attempt_count: number
          context: Json
          created_at: string
          exercise_id: string | null
          id: string
          last_error: string | null
          media_type: string
          normalized_requested_name: string
          preferred_provider: string | null
          reason: string
          request_source: string
          requested_by: string | null
          requested_name: string
          resolved_at: string | null
          resolved_media_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          context?: Json
          created_at?: string
          exercise_id?: string | null
          id?: string
          last_error?: string | null
          media_type: string
          normalized_requested_name: string
          preferred_provider?: string | null
          reason?: string
          request_source?: string
          requested_by?: string | null
          requested_name: string
          resolved_at?: string | null
          resolved_media_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          context?: Json
          created_at?: string
          exercise_id?: string | null
          id?: string
          last_error?: string | null
          media_type?: string
          normalized_requested_name?: string
          preferred_provider?: string | null
          reason?: string
          request_source?: string
          requested_by?: string | null
          requested_name?: string
          resolved_at?: string | null
          resolved_media_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_os_exercise_media_requests_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "body_os_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_os_exercise_media_requests_resolved_media_id_fkey"
            columns: ["resolved_media_id"]
            isOneToOne: false
            referencedRelation: "body_os_exercise_media"
            referencedColumns: ["id"]
          },
        ]
      }
      body_os_exercises: {
        Row: {
          body_part: string | null
          catalog_status: string
          created_at: string
          equipment: string[]
          family_id: string | null
          id: string
          movement_pattern: string | null
          muscles: string[]
          name: string
          normalized_name: string
          slug: string
          source_payload: Json
          updated_at: string
        }
        Insert: {
          body_part?: string | null
          catalog_status?: string
          created_at?: string
          equipment?: string[]
          family_id?: string | null
          id: string
          movement_pattern?: string | null
          muscles?: string[]
          name: string
          normalized_name: string
          slug: string
          source_payload?: Json
          updated_at?: string
        }
        Update: {
          body_part?: string | null
          catalog_status?: string
          created_at?: string
          equipment?: string[]
          family_id?: string | null
          id?: string
          movement_pattern?: string | null
          muscles?: string[]
          name?: string
          normalized_name?: string
          slug?: string
          source_payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      body_os_records: {
        Row: {
          change_version: number
          cloud_updated_at: string
          created_at: string | null
          deleted_at: string | null
          device_id: string
          entity_type: string
          payload: Json
          payload_version: number | null
          record_id: string
          revision: number
          updated_at: string
          user_id: string
          workspace: string | null
        }
        Insert: {
          change_version?: number
          cloud_updated_at?: string
          created_at?: string | null
          deleted_at?: string | null
          device_id: string
          entity_type: string
          payload?: Json
          payload_version?: number | null
          record_id: string
          revision: number
          updated_at: string
          user_id: string
          workspace?: string | null
        }
        Update: {
          change_version?: number
          cloud_updated_at?: string
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string
          entity_type?: string
          payload?: Json
          payload_version?: number | null
          record_id?: string
          revision?: number
          updated_at?: string
          user_id?: string
          workspace?: string | null
        }
        Relationships: []
      }
      body_os_sync_cursors: {
        Row: {
          current_version: number
          user_id: string
        }
        Insert: {
          current_version?: number
          user_id: string
        }
        Update: {
          current_version?: number
          user_id?: string
        }
        Relationships: []
      }
      body_os_sync_operations: {
        Row: {
          change_version: number
          created_at: string
          operation_id: string
          user_id: string
        }
        Insert: {
          change_version: number
          created_at?: string
          operation_id: string
          user_id: string
        }
        Update: {
          change_version?: number
          created_at?: string
          operation_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      body_os_catalog_delta: { Args: { since?: string }; Returns: Json }
      body_os_ensure_exercise: {
        Args: { actor: string; input: Json }
        Returns: Json
      }
      body_os_normalize_exercise: { Args: { value: string }; Returns: string }
      body_os_publish_exercise_media: {
        Args: { media_id: string }
        Returns: undefined
      }
      body_os_pull_delta: {
        Args: { after_version?: number; page_size?: number }
        Returns: Json
      }
      body_os_push_batch: { Args: { operations: Json }; Returns: Json }
      body_os_report_exercise_media: {
        Args: { actor: string; exercise: string; media: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
