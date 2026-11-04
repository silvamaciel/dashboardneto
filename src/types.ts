export interface AdAccount {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
  account_status?: number;
}

export interface InsightRow {
  date_start: string | null;
  date_stop: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  campaign_objective: string | null;
  optimization_goal: string | null;
  is_lead_campaign: boolean;
  impressions: number;
  reach: number;
  spend: number;
  clicks: number;
  link_clicks: number;
  leads: number;
  results_form: number;
  conversations: number;
  results_messaging: number;
  profile_visits: number;
  landing_page_views: number;
  results: number;
  result_label: string;
  action_breakdown: Record<string, number>;
  ad_account_id: string;
  account_name: string;
  currency: string;
  thumbnail_url?: string | null;
  image_url?: string | null;
  cpl?: number | null;
}

export interface BreakdownRow {
  key: string;
  platform: string;
  position: string;
  ad_account_id?: string;
  is_lead_campaign?: boolean;
  campaign_id?: string | null;
  campaign_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversations: number;
  results: number;
}

export interface AccountDataset {
  account: { id: string; name?: string; currency: string };
  accountRows: InsightRow[];
  campaigns: InsightRow[];
  daily: InsightRow[];
  creatives: InsightRow[];
  breakdown: BreakdownRow[];
  previousAccountRows: InsightRow[];
  previousCampaigns: InsightRow[];
}

export interface DashboardResponse {
  data: AccountDataset[];
  errors: { account: string; error: string }[];
  fetchedAt: string;
  partial: boolean;
}
