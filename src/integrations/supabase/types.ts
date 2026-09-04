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
      bait_tiers: {
        Row: {
          created_at: string
          id: string
          name: string
          rarity_multiplier: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          rarity_multiplier?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rarity_multiplier?: Json
          updated_at?: string
        }
        Relationships: []
      }
      fish_inventory_items: {
        Row: {
          caught_at: string
          id: string
          mutation_key: string
          species_id: string
          wallet_address: string
          weight_kg: number
        }
        Insert: {
          caught_at?: string
          id?: string
          mutation_key?: string
          species_id: string
          wallet_address: string
          weight_kg: number
        }
        Update: {
          caught_at?: string
          id?: string
          mutation_key?: string
          species_id?: string
          wallet_address?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "fish_inventory_items_mutation_key_fkey"
            columns: ["mutation_key"]
            isOneToOne: false
            referencedRelation: "mutations"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "fish_inventory_items_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "fish_species"
            referencedColumns: ["id"]
          },
        ]
      }
      fish_species: {
        Row: {
          base_price_per_kg: number
          color: string
          created_at: string
          id: string
          is_monster: boolean
          max_weight_kg: number
          min_weight_kg: number
          name: string
          rarity: string | null
          updated_at: string
        }
        Insert: {
          base_price_per_kg?: number
          color: string
          created_at?: string
          id: string
          is_monster?: boolean
          max_weight_kg: number
          min_weight_kg: number
          name: string
          rarity?: string | null
          updated_at?: string
        }
        Update: {
          base_price_per_kg?: number
          color?: string
          created_at?: string
          id?: string
          is_monster?: boolean
          max_weight_kg?: number
          min_weight_kg?: number
          name?: string
          rarity?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fish_species_rarity_fkey"
            columns: ["rarity"]
            isOneToOne: false
            referencedRelation: "rarity_base_weights"
            referencedColumns: ["rarity"]
          },
        ]
      }
      game_config: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      mutations: {
        Row: {
          created_at: string
          drop_weight: number
          key: string
          label: string
          multiplier: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          drop_weight: number
          key: string
          label: string
          multiplier: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          drop_weight?: number
          key?: string
          label?: string
          multiplier?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          coins?: number
          created_at?: string
          display_name?: string
          fish_common?: number
          fish_epic?: number
          fish_legendary?: number
          fish_mythic?: number
          fish_rare?: number
          level?: number
          updated_at?: string
          username: string
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          coins?: number
          created_at?: string
          display_name?: string
          fish_common?: number
          fish_epic?: number
          fish_legendary?: number
          fish_mythic?: number
          fish_rare?: number
          level?: number
          updated_at?: string
          username?: string
          wallet_address?: string
        }
        Relationships: []
      }
      rarity_base_weights: {
        Row: {
          base_weight: number
          created_at: string
          rarity: string
          updated_at: string
        }
        Insert: {
          base_weight: number
          created_at?: string
          rarity: string
          updated_at?: string
        }
        Update: {
          base_weight?: number
          created_at?: string
          rarity?: string
          updated_at?: string
        }
        Relationships: []
      }
      rod_tiers: {
        Row: {
          created_at: string
          id: string
          max_catch_weight_kg: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          max_catch_weight_kg: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_catch_weight_kg?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      weather_cycle_config: {
        Row: {
          change_interval_seconds: number
          created_at: string
          id: string
          updated_at: string
          weights: Json
        }
        Insert: {
          change_interval_seconds?: number
          created_at?: string
          id: string
          updated_at?: string
          weights?: Json
        }
        Update: {
          change_interval_seconds?: number
          created_at?: string
          id?: string
          updated_at?: string
          weights?: Json
        }
        Relationships: []
      }
      weather_effects: {
        Row: {
          bite_window_seconds: number
          created_at: string
          rarity_multiplier: Json
          updated_at: string
          weather_kind: string
        }
        Insert: {
          bite_window_seconds: number
          created_at?: string
          rarity_multiplier?: Json
          updated_at?: string
          weather_kind: string
        }
        Update: {
          bite_window_seconds?: number
          created_at?: string
          rarity_multiplier?: Json
          updated_at?: string
          weather_kind?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_fish_catch: {
        Args: { _rarity: string; _wallet: string }
        Returns: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_catch: {
        Args: {
          _mutation_key: string
          _rarity: string
          _species_id: string
          _wallet: string
          _weight_kg: number
        }
        Returns: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sell_fish: {
        Args: {
          _item_id: string
          _sell_all: boolean
          _species_id: string
          _wallet: string
        }
        Returns: {
          avatar_url: string | null
          coins: number
          created_at: string
          display_name: string
          fish_common: number
          fish_epic: number
          fish_legendary: number
          fish_mythic: number
          fish_rare: number
          level: number
          updated_at: string
          username: string
          wallet_address: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
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
