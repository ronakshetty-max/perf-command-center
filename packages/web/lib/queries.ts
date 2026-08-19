import { getServerSupabase } from "./supabase";

export interface DashboardFilters {
  business: string;
  categories: string[];
  platform: string;
  device: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getCategoryDaily(filters: DashboardFilters, startDate: string, endDate: string) {
  const db = getServerSupabase();
  let query = db
    .from("v_category_daily")
    .select("*")
    .eq("business_id", filters.business)
    .gte("date", startDate)
    .lte("date", endDate);

  if (filters.categories.length > 0) {
    query = query.in("category", filters.categories);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCategoryWeekly(filters: DashboardFilters, weeks: number = 8) {
  const db = getServerSupabase();
  const { data, error } = await db
    .from("v_category_weekly")
    .select("*")
    .eq("business_id", filters.business)
    .order("week_start", { ascending: false })
    .limit(weeks * 6);

  if (error) throw error;
  return data || [];
}

export async function getCategoryMonthly(filters: DashboardFilters) {
  const db = getServerSupabase();
  const { data, error } = await db
    .from("v_category_monthly")
    .select("*")
    .eq("business_id", filters.business)
    .order("month_start", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getCampaignPerformance(filters: DashboardFilters, startDate: string, endDate: string) {
  const db = getServerSupabase();
  let query = db
    .from("daily_campaign_performance")
    .select("*, campaigns!inner(campaign_name, sub_category, impression_share)")
    .eq("business_id", filters.business)
    .gte("date", startDate)
    .lte("date", endDate);

  if (filters.categories.length > 0) {
    query = query.in("category", filters.categories);
  }
  if (filters.platform !== "all") {
    query = query.eq("platform", filters.platform);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getInsights(businessId: string, limit: number = 20) {
  const db = getServerSupabase();
  const { data, error } = await db
    .from("insights")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_acknowledged", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getMonthlyTargets(businessId: string, month: string) {
  const db = getServerSupabase();
  const { data, error } = await db
    .from("monthly_targets")
    .select("*")
    .eq("business_id", businessId)
    .eq("month", month)
    .single();

  if (error) return null;
  return data;
}

export async function getSyncStatus() {
  const db = getServerSupabase();
  const { data, error } = await db
    .from("sync_log")
    .select("*")
    .order("completed_at", { ascending: false })
    .limit(1);

  if (error) return null;
  return data?.[0] || null;
}
