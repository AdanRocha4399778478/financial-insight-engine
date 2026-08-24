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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      classification_audit: {
        Row: {
          became_rule: boolean
          client_id: string
          confidence: number | null
          created_at: string
          entry_id: string | null
          id: string
          next: Json | null
          previous: Json | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          became_rule?: boolean
          client_id: string
          confidence?: number | null
          created_at?: string
          entry_id?: string | null
          id?: string
          next?: Json | null
          previous?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          became_rule?: boolean
          client_id?: string
          confidence?: number | null
          created_at?: string
          entry_id?: string | null
          id?: string
          next?: Json | null
          previous?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classification_audit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_audit_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          dimensions: string[]
          id: string
          industry: string | null
          name: string
          revenue_model: string | null
          segment: string | null
          trade_name: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          dimensions?: string[]
          id?: string
          industry?: string | null
          name: string
          revenue_model?: string | null
          segment?: string | null
          trade_name?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          dimensions?: string[]
          id?: string
          industry?: string | null
          name?: string
          revenue_model?: string | null
          segment?: string | null
          trade_name?: string | null
        }
        Relationships: []
      }
      column_mappings: {
        Row: {
          client_id: string
          created_at: string
          id: string
          mapping: Json
          signature: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          mapping: Json
          signature: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          mapping?: Json
          signature?: string
        }
        Relationships: [
          {
            foreignKeyName: "column_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          account: string | null
          amount: number
          area: string | null
          behavior: Database["public"]["Enums"]["entry_behavior"]
          classification_source: string | null
          client_id: string
          confidence: number
          cost_center: string | null
          counterparty: string | null
          created_at: string
          description: string
          dimensions: Json
          document: string | null
          entry_date: string
          excluded_from_dre: boolean
          fingerprint: string
          id: string
          import_id: string | null
          movement_type: string | null
          nature: Database["public"]["Enums"]["entry_nature"]
          original_category: string | null
          raw: Json
          status: Database["public"]["Enums"]["entry_status"]
          updated_at: string
        }
        Insert: {
          account?: string | null
          amount?: number
          area?: string | null
          behavior?: Database["public"]["Enums"]["entry_behavior"]
          classification_source?: string | null
          client_id: string
          confidence?: number
          cost_center?: string | null
          counterparty?: string | null
          created_at?: string
          description?: string
          dimensions?: Json
          document?: string | null
          entry_date: string
          excluded_from_dre?: boolean
          fingerprint: string
          id?: string
          import_id?: string | null
          movement_type?: string | null
          nature?: Database["public"]["Enums"]["entry_nature"]
          original_category?: string | null
          raw?: Json
          status?: Database["public"]["Enums"]["entry_status"]
          updated_at?: string
        }
        Update: {
          account?: string | null
          amount?: number
          area?: string | null
          behavior?: Database["public"]["Enums"]["entry_behavior"]
          classification_source?: string | null
          client_id?: string
          confidence?: number
          cost_center?: string | null
          counterparty?: string | null
          created_at?: string
          description?: string
          dimensions?: Json
          document?: string | null
          entry_date?: string
          excluded_from_dre?: boolean
          fingerprint?: string
          id?: string
          import_id?: string | null
          movement_type?: string | null
          nature?: Database["public"]["Enums"]["entry_nature"]
          original_category?: string | null
          raw?: Json
          status?: Database["public"]["Enums"]["entry_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          duplicate_rows: number
          filename: string
          id: string
          mapping: Json | null
          pending_rows: number
          period_label: string | null
          total_rows: number
          valid_rows: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          duplicate_rows?: number
          filename: string
          id?: string
          mapping?: Json | null
          pending_rows?: number
          period_label?: string | null
          total_rows?: number
          valid_rows?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          duplicate_rows?: number
          filename?: string
          id?: string
          mapping?: Json | null
          pending_rows?: number
          period_label?: string | null
          total_rows?: number
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "imports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      rules: {
        Row: {
          account: string
          active: boolean
          area: string | null
          behavior: Database["public"]["Enums"]["entry_behavior"]
          client_id: string | null
          confirmed: boolean
          created_at: string
          created_by: string | null
          hits: number
          id: string
          match_field: string
          nature: Database["public"]["Enums"]["entry_nature"]
          pattern: string
          segment: string | null
        }
        Insert: {
          account: string
          active?: boolean
          area?: string | null
          behavior?: Database["public"]["Enums"]["entry_behavior"]
          client_id?: string | null
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          hits?: number
          id?: string
          match_field?: string
          nature: Database["public"]["Enums"]["entry_nature"]
          pattern: string
          segment?: string | null
        }
        Update: {
          account?: string
          active?: boolean
          area?: string | null
          behavior?: Database["public"]["Enums"]["entry_behavior"]
          client_id?: string | null
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          hits?: number
          id?: string
          match_field?: string
          nature?: Database["public"]["Enums"]["entry_nature"]
          pattern?: string
          segment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
      can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "consultor"
      entry_behavior:
        | "fixo"
        | "variavel"
        | "misto"
        | "nao_aplicavel"
        | "nao_definido"
      entry_nature:
        | "receita_bruta"
        | "deducao"
        | "custo"
        | "despesa"
        | "receita_financeira"
        | "despesa_financeira"
        | "outra_receita"
        | "outra_despesa"
        | "transferencia"
        | "excluido"
        | "nao_definido"
      entry_status: "auto" | "sugerido" | "pendente" | "confirmado" | "ignorado"
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
      app_role: ["admin", "consultor"],
      entry_behavior: [
        "fixo",
        "variavel",
        "misto",
        "nao_aplicavel",
        "nao_definido",
      ],
      entry_nature: [
        "receita_bruta",
        "deducao",
        "custo",
        "despesa",
        "receita_financeira",
        "despesa_financeira",
        "outra_receita",
        "outra_despesa",
        "transferencia",
        "excluido",
        "nao_definido",
      ],
      entry_status: ["auto", "sugerido", "pendente", "confirmado", "ignorado"],
    },
  },
} as const
