
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "announcements": {
                  Row: {
                    "audience": Database["public"]['Enums']["ann_audience"],"channels": (string)[],"class_id": string | null,"id": string,"message": string,"reach": number,"sent_at": string,"sent_by": string | null
                  }
                  Insert: {
                    "audience": Database["public"]['Enums']["ann_audience"],"channels": (string)[],"class_id"?: string | null,"id"?: string,"message": string,"reach"?: number,"sent_at"?: string,"sent_by"?: string | null
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["ann_audience"],"channels"?: (string)[],"class_id"?: string | null,"id"?: string,"message"?: string,"reach"?: number,"sent_at"?: string,"sent_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance": {
                  Row: {
                    "learner_id": string,"session_id": string,"status": Database["public"]['Enums']["att_status"]
                  }
                  Insert: {
                    "learner_id": string,"session_id": string,"status": Database["public"]['Enums']["att_status"]
                  }
                  Update: {
                    "learner_id"?: string,"session_id"?: string,"status"?: Database["public"]['Enums']["att_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "live_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_name": string,"actor_role": string,"at": string,"data": NonNullable<Json>,"id": number,"target": string
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_name": string,"actor_role": string,"at"?: string,"data"?: NonNullable<Json>,"id"?: never,"target": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_name"?: string,"actor_role"?: string,"at"?: string,"data"?: NonNullable<Json>,"id"?: never,"target"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"class_moves": {
                  Row: {
                    "from_class_id": string | null,"id": string,"learner_id": string,"moved_at": string,"moved_by": string | null,"reason": string,"to_class_id": string
                  }
                  Insert: {
                    "from_class_id"?: string | null,"id"?: string,"learner_id": string,"moved_at"?: string,"moved_by"?: string | null,"reason": string,"to_class_id": string
                  }
                  Update: {
                    "from_class_id"?: string | null,"id"?: string,"learner_id"?: string,"moved_at"?: string,"moved_by"?: string | null,"reason"?: string,"to_class_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_moves_from_class_id_fkey"
      columns: ["from_class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_moves_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_moves_moved_by_fkey"
      columns: ["moved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_moves_to_class_id_fkey"
      columns: ["to_class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    }
                  ]
                },"classes": {
                  Row: {
                    "age_max": number,"age_min": number,"capacity": number,"created_at": string,"id": string,"legacy_group_key": string | null,"level": Database["public"]['Enums']["learner_level"],"live_schedule": string,"name": string,"next_cohort_start": string | null,"task_schedule": string,"tutor_id": string | null,"zoom_url": string | null
                  }
                  Insert: {
                    "age_max": number,"age_min": number,"capacity": number,"created_at"?: string,"id"?: string,"legacy_group_key"?: string | null,"level": Database["public"]['Enums']["learner_level"],"live_schedule"?: string,"name": string,"next_cohort_start"?: string | null,"task_schedule"?: string,"tutor_id"?: string | null,"zoom_url"?: string | null
                  }
                  Update: {
                    "age_max"?: number,"age_min"?: number,"capacity"?: number,"created_at"?: string,"id"?: string,"legacy_group_key"?: string | null,"level"?: Database["public"]['Enums']["learner_level"],"live_schedule"?: string,"name"?: string,"next_cohort_start"?: string | null,"task_schedule"?: string,"tutor_id"?: string | null,"zoom_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "classes_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback": {
                  Row: {
                    "created_at": string,"id": string,"release_at": string,"review_seconds": number | null,"scores": NonNullable<Json>,"seen_at": string | null,"submission_id": string,"tags": (string)[],"tutor_id": string | null,"voice_note_path": string | null,"voice_note_seconds": number | null,"written": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"release_at"?: string,"review_seconds"?: number | null,"scores"?: NonNullable<Json>,"seen_at"?: string | null,"submission_id": string,"tags"?: (string)[],"tutor_id"?: string | null,"voice_note_path"?: string | null,"voice_note_seconds"?: number | null,"written"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"release_at"?: string,"review_seconds"?: number | null,"scores"?: NonNullable<Json>,"seen_at"?: string | null,"submission_id"?: string,"tags"?: (string)[],"tutor_id"?: string | null,"voice_note_path"?: string | null,"voice_note_seconds"?: number | null,"written"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: true
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_tutor_id_fkey"
      columns: ["tutor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"imports": {
                  Row: {
                    "classes": number,"created_at": string,"created_by": string | null,"filename": string,"guardians": number,"id": string,"imported": number,"needs_review": number,"skipped_duplicates": number,"total_rows": number
                  }
                  Insert: {
                    "classes"?: number,"created_at"?: string,"created_by"?: string | null,"filename": string,"guardians"?: number,"id"?: string,"imported"?: number,"needs_review"?: number,"skipped_duplicates"?: number,"total_rows": number
                  }
                  Update: {
                    "classes"?: number,"created_at"?: string,"created_by"?: string | null,"filename"?: string,"guardians"?: number,"id"?: string,"imported"?: number,"needs_review"?: number,"skipped_duplicates"?: number,"total_rows"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "imports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learner_pin_attempts": {
                  Row: {
                    "at": string,"id": number,"learner_id": string,"ok": boolean
                  }
                  Insert: {
                    "at"?: string,"id"?: never,"learner_id": string,"ok": boolean
                  }
                  Update: {
                    "at"?: string,"id"?: never,"learner_id"?: string,"ok"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "learner_pin_attempts_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    }
                  ]
                },"learners": {
                  Row: {
                    "age": number | null,"class_id": string | null,"code": string,"consent_data": boolean,"consent_recordings": boolean,"consent_showcase": boolean,"created_at": string,"first_name": string,"goals": string,"guardian_id": string,"id": string,"last_name": string,"level": Database["public"]['Enums']["learner_level"],"needs_review": boolean,"pin_hash": string | null,"pin_set": boolean | null,"placed_at": string | null,"prior_cohort": boolean,"status": Database["public"]['Enums']["learner_status"],"user_id": string | null
                  }
                  Insert: {
                    "age"?: number | null,"class_id"?: string | null,"code"?: string,"consent_data"?: boolean,"consent_recordings"?: boolean,"consent_showcase"?: boolean,"created_at"?: string,"first_name": string,"goals"?: string,"guardian_id": string,"id"?: string,"last_name"?: string,"level"?: Database["public"]['Enums']["learner_level"],"needs_review"?: boolean,"pin_hash"?: string | null,"pin_set"?: never,"placed_at"?: string | null,"prior_cohort"?: boolean,"status"?: Database["public"]['Enums']["learner_status"],"user_id"?: string | null
                  }
                  Update: {
                    "age"?: number | null,"class_id"?: string | null,"code"?: string,"consent_data"?: boolean,"consent_recordings"?: boolean,"consent_showcase"?: boolean,"created_at"?: string,"first_name"?: string,"goals"?: string,"guardian_id"?: string,"id"?: string,"last_name"?: string,"level"?: Database["public"]['Enums']["learner_level"],"needs_review"?: boolean,"pin_hash"?: string | null,"pin_set"?: never,"placed_at"?: string | null,"prior_cohort"?: boolean,"status"?: Database["public"]['Enums']["learner_status"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "learners_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "learners_guardian_id_fkey"
      columns: ["guardian_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"live_sessions": {
                  Row: {
                    "class_id": string,"ends_at": string,"id": string,"recording_attached_at": string | null,"recording_found_at": string | null,"recording_minutes": number | null,"recording_url": string | null,"register_saved_at": string | null,"register_saved_by": string | null,"starts_at": string
                  }
                  Insert: {
                    "class_id": string,"ends_at": string,"id"?: string,"recording_attached_at"?: string | null,"recording_found_at"?: string | null,"recording_minutes"?: number | null,"recording_url"?: string | null,"register_saved_at"?: string | null,"register_saved_by"?: string | null,"starts_at": string
                  }
                  Update: {
                    "class_id"?: string,"ends_at"?: string,"id"?: string,"recording_attached_at"?: string | null,"recording_found_at"?: string | null,"recording_minutes"?: number | null,"recording_url"?: string | null,"register_saved_at"?: string | null,"register_saved_by"?: string | null,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_sessions_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_sessions_register_saved_by_fkey"
      columns: ["register_saved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "announcement_id": string | null,"body": string,"created_at": string,"data": NonNullable<Json>,"id": string,"kind": string,"learner_id": string | null,"read_at": string | null,"recipient_id": string,"title": string
                  }
                  Insert: {
                    "announcement_id"?: string | null,"body": string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind": string,"learner_id"?: string | null,"read_at"?: string | null,"recipient_id": string,"title": string
                  }
                  Update: {
                    "announcement_id"?: string | null,"body"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"learner_id"?: string | null,"read_at"?: string | null,"recipient_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_announcement_id_fkey"
      columns: ["announcement_id"]
isOneToOne: false
      referencedRelation: "announcements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"nudges": {
                  Row: {
                    "id": string,"learner_id": string,"sent_at": string,"sent_by": string | null,"task_id": string
                  }
                  Insert: {
                    "id"?: string,"learner_id": string,"sent_at"?: string,"sent_by"?: string | null,"task_id": string
                  }
                  Update: {
                    "id"?: string,"learner_id"?: string,"sent_at"?: string,"sent_by"?: string | null,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "nudges_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nudges_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nudges_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"outbound_messages": {
                  Row: {
                    "body": string,"channel": Database["public"]['Enums']["msg_channel"],"created_at": string,"data": NonNullable<Json>,"error": string | null,"id": string,"provider_ref": string | null,"send_after": string,"sent_at": string | null,"status": Database["public"]['Enums']["msg_status"],"template": string,"to_address": string
                  }
                  Insert: {
                    "body": string,"channel": Database["public"]['Enums']["msg_channel"],"created_at"?: string,"data"?: NonNullable<Json>,"error"?: string | null,"id"?: string,"provider_ref"?: string | null,"send_after"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["msg_status"],"template": string,"to_address": string
                  }
                  Update: {
                    "body"?: string,"channel"?: Database["public"]['Enums']["msg_channel"],"created_at"?: string,"data"?: NonNullable<Json>,"error"?: string | null,"id"?: string,"provider_ref"?: string | null,"send_after"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["msg_status"],"template"?: string,"to_address"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payments": {
                  Row: {
                    "amount_minor": number,"bank": string | null,"bank_alert": Database["public"]['Enums']["bank_alert"] | null,"bank_alert_amount_minor": number | null,"created_at": string,"currency": string,"decided_at": string | null,"decided_by": string | null,"description": string,"guardian_id": string,"id": string,"learner_id": string,"method": Database["public"]['Enums']["pay_method"],"provider": string,"provider_ref": string | null,"receipt_path": string | null,"reference": string,"sent_at": string | null,"status": Database["public"]['Enums']["pay_status"],"subscription_id": string | null
                  }
                  Insert: {
                    "amount_minor": number,"bank"?: string | null,"bank_alert"?: Database["public"]['Enums']["bank_alert"] | null,"bank_alert_amount_minor"?: number | null,"created_at"?: string,"currency"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"description": string,"guardian_id": string,"id"?: string,"learner_id": string,"method": Database["public"]['Enums']["pay_method"],"provider": string,"provider_ref"?: string | null,"receipt_path"?: string | null,"reference": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["pay_status"],"subscription_id"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"bank"?: string | null,"bank_alert"?: Database["public"]['Enums']["bank_alert"] | null,"bank_alert_amount_minor"?: number | null,"created_at"?: string,"currency"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"description"?: string,"guardian_id"?: string,"id"?: string,"learner_id"?: string,"method"?: Database["public"]['Enums']["pay_method"],"provider"?: string,"provider_ref"?: string | null,"receipt_path"?: string | null,"reference"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["pay_status"],"subscription_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_guardian_id_fkey"
      columns: ["guardian_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "currency": string,"description": string,"due_today_minor": number,"id": string,"instalments": number,"name": string,"price_label": string,"sort": number,"total_minor": number
                  }
                  Insert: {
                    "currency"?: string,"description": string,"due_today_minor": number,"id": string,"instalments"?: number,"name": string,"price_label": string,"sort"?: number,"total_minor": number
                  }
                  Update: {
                    "currency"?: string,"description"?: string,"due_today_minor"?: number,"id"?: string,"instalments"?: number,"name"?: string,"price_label"?: string,"sort"?: number,"total_minor"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "consent_at": string | null,"consent_data": boolean,"consent_recordings": boolean,"country": string | null,"created_at": string,"display_name": string,"email": string | null,"full_name": string,"id": string,"last_active_at": string | null,"phone": string | null,"role": Database["public"]['Enums']["app_role"],"two_factor": boolean
                  }
                  Insert: {
                    "consent_at"?: string | null,"consent_data"?: boolean,"consent_recordings"?: boolean,"country"?: string | null,"created_at"?: string,"display_name"?: string,"email"?: string | null,"full_name"?: string,"id": string,"last_active_at"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"two_factor"?: boolean
                  }
                  Update: {
                    "consent_at"?: string | null,"consent_data"?: boolean,"consent_recordings"?: boolean,"country"?: string | null,"created_at"?: string,"display_name"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"last_active_at"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"two_factor"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"renewal_reminders": {
                  Row: {
                    "id": string,"kind": string,"sent_at": string,"subscription_id": string
                  }
                  Insert: {
                    "id"?: string,"kind": string,"sent_at"?: string,"subscription_id": string
                  }
                  Update: {
                    "id"?: string,"kind"?: string,"sent_at"?: string,"subscription_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "renewal_reminders_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"school_settings": {
                  Row: {
                    "feedback_release": string,"id": boolean,"term_starts_on": string
                  }
                  Insert: {
                    "feedback_release"?: string,"id"?: boolean,"term_starts_on": string
                  }
                  Update: {
                    "feedback_release"?: string,"id"?: boolean,"term_starts_on"?: string
                  }
                  Relationships: [
                    
                  ]
                },"submissions": {
                  Row: {
                    "duration_seconds": number | null,"id": string,"learner_id": string,"media_path": string | null,"submitted_at": string,"task_id": string,"text_answer": string | null
                  }
                  Insert: {
                    "duration_seconds"?: number | null,"id"?: string,"learner_id": string,"media_path"?: string | null,"submitted_at"?: string,"task_id": string,"text_answer"?: string | null
                  }
                  Update: {
                    "duration_seconds"?: number | null,"id"?: string,"learner_id"?: string,"media_path"?: string | null,"submitted_at"?: string,"task_id"?: string,"text_answer"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "balance_minor": number,"created_at": string,"currency": string,"ends_on": string | null,"followup_outcome": Database["public"]['Enums']["renewal_outcome"] | null,"followup_prev": Json | null,"grace_until": string | null,"id": string,"instalments_paid": number,"learner_id": string,"next_instalment_due": string | null,"plan_id": string,"starts_on": string | null,"status": Database["public"]['Enums']["sub_status"]
                  }
                  Insert: {
                    "balance_minor"?: number,"created_at"?: string,"currency"?: string,"ends_on"?: string | null,"followup_outcome"?: Database["public"]['Enums']["renewal_outcome"] | null,"followup_prev"?: Json | null,"grace_until"?: string | null,"id"?: string,"instalments_paid"?: number,"learner_id": string,"next_instalment_due"?: string | null,"plan_id": string,"starts_on"?: string | null,"status"?: Database["public"]['Enums']["sub_status"]
                  }
                  Update: {
                    "balance_minor"?: number,"created_at"?: string,"currency"?: string,"ends_on"?: string | null,"followup_outcome"?: Database["public"]['Enums']["renewal_outcome"] | null,"followup_prev"?: Json | null,"grace_until"?: string | null,"id"?: string,"instalments_paid"?: number,"learner_id"?: string,"next_instalment_due"?: string | null,"plan_id"?: string,"starts_on"?: string | null,"status"?: Database["public"]['Enums']["sub_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"task_templates": {
                  Row: {
                    "attachments": NonNullable<Json>,"id": string,"instructions": string,"level": Database["public"]['Enums']["learner_level"],"name": string,"response_type": Database["public"]['Enums']["resp_type"],"sort": number,"steps": (string)[],"title": string
                  }
                  Insert: {
                    "attachments"?: NonNullable<Json>,"id"?: string,"instructions": string,"level": Database["public"]['Enums']["learner_level"],"name": string,"response_type": Database["public"]['Enums']["resp_type"],"sort"?: number,"steps"?: (string)[],"title": string
                  }
                  Update: {
                    "attachments"?: NonNullable<Json>,"id"?: string,"instructions"?: string,"level"?: Database["public"]['Enums']["learner_level"],"name"?: string,"response_type"?: Database["public"]['Enums']["resp_type"],"sort"?: number,"steps"?: (string)[],"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tasks": {
                  Row: {
                    "attachments": NonNullable<Json>,"class_id": string,"created_at": string,"created_by": string | null,"due_at": string,"id": string,"instructions": string,"release_at": string,"response_type": Database["public"]['Enums']["resp_type"],"steps": (string)[],"template_id": string | null,"title": string
                  }
                  Insert: {
                    "attachments"?: NonNullable<Json>,"class_id": string,"created_at"?: string,"created_by"?: string | null,"due_at": string,"id"?: string,"instructions": string,"release_at": string,"response_type": Database["public"]['Enums']["resp_type"],"steps"?: (string)[],"template_id"?: string | null,"title": string
                  }
                  Update: {
                    "attachments"?: NonNullable<Json>,"class_id"?: string,"created_at"?: string,"created_by"?: string | null,"due_at"?: string,"id"?: string,"instructions"?: string,"release_at"?: string,"response_type"?: Database["public"]['Enums']["resp_type"],"steps"?: (string)[],"template_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "task_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist": {
                  Row: {
                    "added_at": string,"added_by": string | null,"class_id": string,"learner_id": string
                  }
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"class_id": string,"learner_id": string
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"class_id"?: string,"learner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "waitlist_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_learner_id_fkey"
      columns: ["learner_id"]
isOneToOne: false
      referencedRelation: "learners"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_activate_subscription":
{ Args: { "p_payment": string }; Returns: undefined
                           },
"_audit":
{ Args: { "p_action": string,"p_data"?: Json,"p_target": string }; Returns: undefined
                           },
"_audit_system":
{ Args: { "p_action": string,"p_data"?: Json,"p_role": string,"p_target": string }; Returns: undefined
                           },
"_correction_release":
{ Args: { "p_due": string }; Returns: string
                           },
"_filled":
{ Args: { "p_class": string }; Returns: number
                           },
"_naira":
{ Args: { "currency"?: string,"minor": number }; Returns: string
                           },
"_notify":
{ Args: { "p_at"?: string,"p_body": string,"p_data"?: Json,"p_kind": string,"p_learner": string,"p_recipient": string,"p_title": string }; Returns: undefined
                           },
"_renewal_rows":
{ Args: Record<PropertyKey, never>; Returns: {
              "balance_minor": number,"currency": string,"days_left": number,"ends_on": string,"grace_until": string,"grp": string,"guardian": string,"learner": string,"learner_id": string,"next_instalment_due": string,"outcome": Database["public"]['Enums']["renewal_outcome"],"plan": string,"reminders": (string)[],"status": Database["public"]['Enums']["sub_status"],"subscription_id": string
            }[]
                           },
"_require":
{ Args: { "roles": (Database["public"]['Enums']["app_role"])[] }; Returns: undefined
                           },
"_require_class":
{ Args: { "p_class": string }; Returns: undefined
                           },
"_role_label":
{ Args: { "r": Database["public"]['Enums']["app_role"] }; Returns: string
                           },
"_wat":
{ Args: { "ts": string }; Returns: string
                           },
"_wat_at":
{ Args: { "d": string,"t": string }; Returns: string
                           },
"_whatsapp":
{ Args: { "p_after"?: string,"p_body": string,"p_data"?: Json,"p_recipient": string,"p_template": string }; Returns: undefined
                           },
"add_to_waitlist":
{ Args: { "p_class": string,"p_learner": string }; Returns: undefined
                           },
"admin_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"announcement_reach":
{ Args: { "p_audience": Database["public"]['Enums']["ann_audience"],"p_class": string }; Returns: Json
                           },
"attach_recording":
{ Args: { "p_session": string }; Returns: undefined
                           },
"can_teach_class":
{ Args: { "p_class": string }; Returns: boolean
                           },
"can_view_learner":
{ Args: { "p_learner": string }; Returns: boolean
                           },
"can_view_learner_work":
{ Args: { "p_learner": string }; Returns: boolean
                           },
"check_learner_pin":
{ Args: { "p_learner": string,"p_pin": string }; Returns: string
                           },
"class_fill":
{ Args: Record<PropertyKey, never>; Returns: {
              "capacity": number,"class_id": string,"filled": number
            }[]
                           },
"clear_renewal_outcome":
{ Args: { "p_subscription": string }; Returns: undefined
                           },
"complete_guardian_profile":
{ Args: { "p_consent_data": boolean,"p_consent_recordings": boolean,"p_country": string,"p_email": string,"p_full_name": string }; Returns: undefined
                           },
"create_payment":
{ Args: { "p_learner": string,"p_method": Database["public"]['Enums']["pay_method"],"p_plan": string }; Returns: Json
                           },
"decide_payment":
{ Args: { "p_approve": boolean,"p_payment": string }; Returns: undefined
                           },
"enrol_child":
{ Args: { "p_age": number,"p_first_name": string,"p_goals": string,"p_level": Database["public"]['Enums']["learner_level"],"p_prior_cohort": boolean }; Returns: string
                           },
"has_role":
{ Args: { "roles": (Database["public"]['Enums']["app_role"])[] }; Returns: boolean
                           },
"hook_send_whatsapp_otp":
{ Args: { "event": Json }; Returns: Json
                           },
"import_learner_rows":
{ Args: { "p_actor": string,"p_filename": string,"p_rows": Json,"p_skipped": number,"p_total": number }; Returns: Json
                           },
"in_class":
{ Args: { "p_class": string }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"learner_progress":
{ Args: { "p_learner": string }; Returns: Json
                           },
"learner_timeline":
{ Args: { "p_learner": string }; Returns: Json
                           },
"learner_week":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"mark_feedback_seen":
{ Args: { "p_feedback": string }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"mark_payment_verified":
{ Args: { "p_provider_ref": string,"p_reference": string }; Returns: Json
                           },
"move_learner":
{ Args: { "p_class": string,"p_learner": string,"p_reason": string }; Returns: undefined
                           },
"my_classes":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"learners": number,"name": string,"to_review": number,"tutor_name": string
            }[]
                           },
"my_learner_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"nudge_parent":
{ Args: { "p_learner": string,"p_task": string }; Returns: undefined
                           },
"parent_home":
{ Args: { "p_learner": string }; Returns: Json
                           },
"path_uuid":
{ Args: { "p_index": number,"p_name": string }; Returns: string
                           },
"pilot_report":
{ Args: { "p_range": string }; Returns: Json
                           },
"place_learner":
{ Args: { "p_class": string,"p_learner": string }; Returns: undefined
                           },
"reassign_tutor":
{ Args: { "p_class": string,"p_tutor": string }; Returns: undefined
                           },
"recent_announcements":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"renewal_queue":
{ Args: Record<PropertyKey, never>; Returns: Json[]
                           },
"save_class":
{ Args: { "p_age_max": number,"p_age_min": number,"p_capacity": number,"p_id": string,"p_level": Database["public"]['Enums']["learner_level"],"p_name": string,"p_next_cohort": string,"p_zoom_url": string }; Returns: string
                           },
"save_feedback":
{ Args: { "p_release_now": boolean,"p_review_seconds": number,"p_scores": Json,"p_submission": string,"p_tags": (string)[],"p_voice_note_path": string,"p_voice_note_seconds": number,"p_written": string }; Returns: Json
                           },
"save_register":
{ Args: { "p_entries": Json,"p_session": string }; Returns: Json
                           },
"schedule_task":
{ Args: { "p_attachments": Json,"p_class": string,"p_due_at": string,"p_instructions": string,"p_release_at": string,"p_response_type": Database["public"]['Enums']["resp_type"],"p_steps": (string)[],"p_template": string,"p_title": string }; Returns: string
                           },
"send_announcement":
{ Args: { "p_audience": Database["public"]['Enums']["ann_audience"],"p_channels": (string)[],"p_class": string,"p_message": string }; Returns: Json
                           },
"send_renewal_reminders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"send_weekly_summaries":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"set_learner_pin":
{ Args: { "p_learner": string,"p_pin": string }; Returns: undefined
                           },
"set_renewal_outcome":
{ Args: { "p_outcome": Database["public"]['Enums']["renewal_outcome"],"p_subscription": string }; Returns: undefined
                           },
"submit_task":
{ Args: { "p_duration": number,"p_media_path": string,"p_task": string,"p_text"?: string }; Returns: string
                           },
"submit_transfer":
{ Args: { "p_payment": string,"p_receipt_path": string }; Returns: undefined
                           },
"tutor_queue":
{ Args: { "p_class": string,"p_task"?: string }; Returns: Json
                           },
"unplace_learner":
{ Args: { "p_learner": string }; Returns: undefined
                           },
"update_learner":
{ Args: { "p_age": number,"p_goals": string,"p_learner": string,"p_level": Database["public"]['Enums']["learner_level"],"p_showcase": boolean }; Returns: undefined
                           },
"week_info":
{ Args: { "p_at"?: string }; Returns: Json
                           }
          }
          Enums: {
            "ann_audience": "class"|"all_learners"|"all_parents","app_role": "owner"|"lead_tutor"|"customer_service"|"tutor"|"parent"|"learner","att_status": "present"|"late"|"absent","bank_alert": "matched"|"not_found"|"amount_differs","learner_level": "starter"|"beginner"|"intermediate"|"advanced","learner_status": "awaiting_payment"|"awaiting_placement"|"active"|"exited","msg_channel": "whatsapp"|"email"|"sms","msg_status": "queued"|"sent"|"failed","pay_method": "card"|"transfer","pay_status": "initiated"|"pending_review"|"approved"|"rejected"|"auto_verified"|"reversed","renewal_outcome": "renewed"|"grace"|"exit","resp_type": "video"|"audio"|"photo"|"text","sub_status": "pending"|"active"|"grace"|"expired"|"exited"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "ann_audience": ["class", "all_learners", "all_parents"],"app_role": ["owner", "lead_tutor", "customer_service", "tutor", "parent", "learner"],"att_status": ["present", "late", "absent"],"bank_alert": ["matched", "not_found", "amount_differs"],"learner_level": ["starter", "beginner", "intermediate", "advanced"],"learner_status": ["awaiting_payment", "awaiting_placement", "active", "exited"],"msg_channel": ["whatsapp", "email", "sms"],"msg_status": ["queued", "sent", "failed"],"pay_method": ["card", "transfer"],"pay_status": ["initiated", "pending_review", "approved", "rejected", "auto_verified", "reversed"],"renewal_outcome": ["renewed", "grace", "exit"],"resp_type": ["video", "audio", "photo", "text"],"sub_status": ["pending", "active", "grace", "expired", "exited"]
          }
        }
} as const

