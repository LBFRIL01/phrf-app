export type Role = "owner" | "committee" | "chair" | "admin";
export type AppType = "new" | "renewal" | "change" | "appeal";
export type AppStatus = "received" | "needs_info" | "in_review" | "rated" | "appealed" | "withdrawn";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  created_at: string;
}

export interface Boat {
  id: string;
  sail_number: string;
  name: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  hull_number: string | null;
  loa_ft: number | null;
  lwl_ft: number | null;
  beam_ft: number | null;
  draft_ft: number | null;
  displacement_lb: number | null;
  rig: string | null;
  keel: string | null;
  propeller: string | null;
  home_port: string | null;
  notes: string | null;
}

export interface Owner {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  club: string | null;
  us_sailing_number: string | null;
}

export interface Application {
  id: string;
  number: string;
  boat_id: string;
  owner_id: string | null;
  submitted_by: string | null;
  type: AppType;
  status: AppStatus;
  received_at: string;
  details: Record<string, unknown>;
  owner_notes: string | null;
  folder_url: string | null;
  review_deadline: string | null;
  final_rating: number | null;
  decided_at: string | null;
  decision_notes: string | null;
  source: "online" | "import";
}

export interface Vote {
  id: string;
  application_id: string;
  member_id: string;
  proposed_rating: number | null;
  adjustments: string | null;
  comment: string | null;
  recused: boolean;
  updated_at: string;
}

export interface Rating {
  id: string;
  boat_id: string;
  application_id: string | null;
  rating: number;
  configuration: string;
  adjustments: string | null;
  effective_on: string;
  expires_on: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  created_at: string;
}

export interface Settings {
  org_name: string;
  quorum: number;
  review_days: number;
  rating_valid_months: number;
}
