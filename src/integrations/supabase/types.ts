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
      agent_invites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          name: string
          notes: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          name: string
          notes?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          name?: string
          notes?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      defect_audit_log: {
        Row: {
          changed_at: string
          changed_by: string
          defect_id: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          defect_id: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          defect_id?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defect_audit_log_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "defects"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_comments: {
        Row: {
          author: string
          created_at: string
          defect_id: string
          edited: boolean
          id: string
          text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          author: string
          created_at?: string
          defect_id: string
          edited?: boolean
          id?: string
          text: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          author?: string
          created_at?: string
          defect_id?: string
          edited?: boolean
          id?: string
          text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defect_comments_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "defects"
            referencedColumns: ["id"]
          },
        ]
      }
      defects: {
        Row: {
          actual_result: string
          assigned_agent: string
          attachment_url: string | null
          attachment_url2: string | null
          created_at: string
          created_by: string
          description: string
          drive_url: string | null
          environment: string
          evidence_url: string | null
          excel_url: string | null
          expected_result: string
          form_feature: string
          id: string
          jira_url: string | null
          module: string
          priority: string
          screenshot_url: string | null
          severity: string
          status: string
          steps_to_reproduce: string
          tax_year: string | null
          title: string
          updated_at: string
          updated_by: string
          validity: string
          version: number
          video_url: string | null
        }
        Insert: {
          actual_result?: string
          assigned_agent?: string
          attachment_url?: string | null
          attachment_url2?: string | null
          created_at?: string
          created_by?: string
          description?: string
          drive_url?: string | null
          environment?: string
          evidence_url?: string | null
          excel_url?: string | null
          expected_result?: string
          form_feature: string
          id: string
          jira_url?: string | null
          module: string
          priority?: string
          screenshot_url?: string | null
          severity?: string
          status?: string
          steps_to_reproduce?: string
          tax_year?: string | null
          title: string
          updated_at?: string
          updated_by?: string
          validity?: string
          version?: number
          video_url?: string | null
        }
        Update: {
          actual_result?: string
          assigned_agent?: string
          attachment_url?: string | null
          attachment_url2?: string | null
          created_at?: string
          created_by?: string
          description?: string
          drive_url?: string | null
          environment?: string
          evidence_url?: string | null
          excel_url?: string | null
          expected_result?: string
          form_feature?: string
          id?: string
          jira_url?: string | null
          module?: string
          priority?: string
          screenshot_url?: string | null
          severity?: string
          status?: string
          steps_to_reproduce?: string
          tax_year?: string | null
          title?: string
          updated_at?: string
          updated_by?: string
          validity?: string
          version?: number
          video_url?: string | null
        }
        Relationships: []
      }
      export_audit_log: {
        Row: {
          created_at: string
          environment: string | null
          error: string | null
          filters: Json
          id: string
          job_id: string | null
          role: string
          row_count: number
          scope: string
          status: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          created_at?: string
          environment?: string | null
          error?: string | null
          filters?: Json
          id?: string
          job_id?: string | null
          role: string
          row_count?: number
          scope: string
          status?: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          created_at?: string
          environment?: string | null
          error?: string | null
          filters?: Json
          id?: string
          job_id?: string | null
          role?: string
          row_count?: number
          scope?: string
          status?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: []
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          environment: string | null
          error: string | null
          file_name: string | null
          file_path: string | null
          filters: Json
          id: string
          progress: number
          requested_by_id: string | null
          requested_by_name: string
          retries: number
          role: string
          row_count: number
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          environment?: string | null
          error?: string | null
          file_name?: string | null
          file_path?: string | null
          filters?: Json
          id?: string
          progress?: number
          requested_by_id?: string | null
          requested_by_name: string
          retries?: number
          role: string
          row_count?: number
          scope: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          environment?: string | null
          error?: string | null
          file_name?: string | null
          file_path?: string | null
          filters?: Json
          id?: string
          progress?: number
          requested_by_id?: string | null
          requested_by_name?: string
          retries?: number
          role?: string
          row_count?: number
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      forms: {
        Row: {
          assigned_agent: string
          environment: string
          failed: number
          id: string
          last_tested: string
          module: string
          name: string
          open_defects: number
          passed: number
          status: string
          updated_at: string
        }
        Insert: {
          assigned_agent?: string
          environment?: string
          failed?: number
          id: string
          last_tested?: string
          module: string
          name: string
          open_defects?: number
          passed?: number
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_agent?: string
          environment?: string
          failed?: number
          id?: string
          last_tested?: string
          module?: string
          name?: string
          open_defects?: number
          passed?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          defect_id: string | null
          environment: string | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          defect_id?: string | null
          environment?: string | null
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          defect_id?: string | null
          environment?: string | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "defects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      retest_assignment_forms: {
        Row: {
          assignment_id: string
          form_id: string
          form_name: string
          id: string
        }
        Insert: {
          assignment_id: string
          form_id: string
          form_name: string
          id?: string
        }
        Update: {
          assignment_id?: string
          form_id?: string
          form_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retest_assignment_forms_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "retest_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      retest_assignments: {
        Row: {
          all_forms: boolean
          assigned_agent_id: string | null
          assigned_agent_name: string
          assigned_by_id: string | null
          assigned_by_name: string
          completed_at: string | null
          created_at: string
          due_date: string | null
          environment: string
          id: string
          instructions: string
          module: string
          priority: string
          status: string
          tax_year: string | null
          testing_type: string
          title: string
          updated_at: string
        }
        Insert: {
          all_forms?: boolean
          assigned_agent_id?: string | null
          assigned_agent_name?: string
          assigned_by_id?: string | null
          assigned_by_name?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          environment?: string
          id: string
          instructions?: string
          module?: string
          priority?: string
          status?: string
          tax_year?: string | null
          testing_type?: string
          title?: string
          updated_at?: string
        }
        Update: {
          all_forms?: boolean
          assigned_agent_id?: string | null
          assigned_agent_name?: string
          assigned_by_id?: string | null
          assigned_by_name?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          environment?: string
          id?: string
          instructions?: string
          module?: string
          priority?: string
          status?: string
          tax_year?: string | null
          testing_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      retest_pending_assignments: {
        Row: {
          created_at: string
          created_by_id: string | null
          created_by_name: string
          email: string
          forms: Json
          id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string
          email: string
          forms?: Json
          id?: string
          payload: Json
        }
        Update: {
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string
          email?: string
          forms?: Json
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      role_audit_log: {
        Row: {
          changed_at: string
          changed_by_id: string
          changed_by_name: string
          id: string
          new_role: Database["public"]["Enums"]["app_role"]
          old_role: Database["public"]["Enums"]["app_role"] | null
          target_name: string
          target_user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by_id: string
          changed_by_name?: string
          id?: string
          new_role: Database["public"]["Enums"]["app_role"]
          old_role?: Database["public"]["Enums"]["app_role"] | null
          target_name?: string
          target_user_id: string
        }
        Update: {
          changed_at?: string
          changed_by_id?: string
          changed_by_name?: string
          id?: string
          new_role?: Database["public"]["Enums"]["app_role"]
          old_role?: Database["public"]["Enums"]["app_role"] | null
          target_name?: string
          target_user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      change_user_role: {
        Args: {
          _new_role: Database["public"]["Enums"]["app_role"]
          _target: string
        }
        Returns: Json
      }
      current_user_name: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_id_for_name: { Args: { _name: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "agent"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "agent"],
    },
  },
} as const
