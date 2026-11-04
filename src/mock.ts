import type { AccountDataset, BreakdownRow, DashboardResponse, InsightRow } from './types';

const campaigns = [
  { id: 'c101', name: 'Captação · Imóveis de alto padrão', objective: 'OUTCOME_LEADS', optimization_goal: 'LEAD_GENERATION', adset: 'Público semelhante · 1%' },
  { id: 'c102', name: 'Leads · Lançamento Jardim Europa', objective: 'OUTCOME_LEADS', optimization_goal: 'LEAD_GENERATION', adset: 'Interesse em imóveis' },
  { id: 'c103', name: 'WhatsApp · Plantão de vendas', objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS', adset: 'Remarketing 30 dias' },
  { id: 'c104', name: 'Marca · Novos empreendimentos', objective: 'OUTCOME_TRAFFIC', optimization_goal: 'LANDING_PAGE_VIEWS', adset: 'São Paulo · 25–55' },
];
const accountId = 'act_1029384756';
const accountName = 'Conta de anúncios principal';
const currency = 'BRL';

function row(campaign: typeof campaigns[number], date: string | null, spend: number, leads: number, conversations: number, clicks: number, impressions: number, reach: number): InsightRow {
  const profileVisits = Math.round(clicks * 0.11);
  const landingPageViews = Math.round(clicks * 0.46);
  const results = campaign.optimization_goal === 'LEAD_GENERATION' ? leads
    : campaign.optimization_goal === 'CONVERSATIONS' ? conversations
      : campaign.optimization_goal === 'LANDING_PAGE_VIEWS' ? landingPageViews : 0;
  const resultLabel = campaign.optimization_goal === 'LEAD_GENERATION' ? 'Leads'
    : campaign.optimization_goal === 'CONVERSATIONS' ? 'Conversas'
      : campaign.optimization_goal === 'LANDING_PAGE_VIEWS' ? 'Visitas à página' : 'Resultados';
  return {
    date_start: date, date_stop: date, campaign_id: campaign.id, campaign_name: campaign.name,
    adset_id: `${campaign.id}-set`, adset_name: campaign.adset, ad_id: null, ad_name: null,
    campaign_objective: campaign.objective, optimization_goal: campaign.optimization_goal, is_lead_campaign: campaign.objective === 'OUTCOME_LEADS',
    impressions, reach, spend, clicks, link_clicks: Math.round(clicks * 0.7), leads, results_form: leads,
    conversations, results_messaging: conversations, profile_visits: profileVisits,
    landing_page_views: landingPageViews, results, result_label: resultLabel, action_breakdown: {}, ad_account_id: accountId,
    account_name: accountName, currency,
  };
}

function summarize(rows: InsightRow[]): InsightRow[] {
  if (!rows.length) return [];
  return [{
    ...rows[0], date_start: rows[0].date_start, date_stop: rows[rows.length - 1]?.date_stop || null,
    campaign_id: null, campaign_name: null, adset_id: null, adset_name: null, ad_id: null, ad_name: null,
    impressions: rows.reduce((s, r) => s + r.impressions, 0), reach: rows.reduce((s, r) => s + r.reach, 0),
    spend: rows.reduce((s, r) => s + r.spend, 0), clicks: rows.reduce((s, r) => s + r.clicks, 0),
    link_clicks: rows.reduce((s, r) => s + r.link_clicks, 0), leads: rows.reduce((s, r) => s + r.leads, 0),
    results_form: rows.reduce((s, r) => s + r.results_form, 0), conversations: rows.reduce((s, r) => s + r.conversations, 0),
    results_messaging: rows.reduce((s, r) => s + r.results_messaging, 0), profile_visits: rows.reduce((s, r) => s + r.profile_visits, 0),
    landing_page_views: rows.reduce((s, r) => s + r.landing_page_views, 0), is_lead_campaign: false,
  }];
}

function dataset(since: string, until: string, previous = false): AccountDataset {
  const start = new Date(`${since}T12:00:00`);
  const end = new Date(`${until}T12:00:00`);
  const daily: InsightRow[] = [];
  const totals = campaigns.map(() => ({ spend: 0, leads: 0, conversations: 0, clicks: 0, impressions: 0, reach: 0 }));
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    campaigns.forEach((campaign, index) => {
      const wave = 0.82 + ((date.getDate() * 7 + index * 13) % 37) / 100;
      const spend = Math.round((index < 2 ? 52 + index * 14 : 30 + index * 11) * wave * 100) / 100;
      const leads = campaign.objective === 'OUTCOME_LEADS' ? Math.max(0, Math.round((index === 0 ? 3.3 : 2.2) * wave)) : 0;
      const conversations = index === 2 ? Math.max(0, Math.round(2.4 * wave)) : 0;
      const clicks = Math.round((index === 3 ? 74 : 48 + index * 10) * wave);
      const impressions = clicks * (index === 3 ? 72 : 54);
      const reach = Math.round(impressions * 0.58);
      daily.push(row(campaign, key, spend, leads, conversations, clicks, impressions, reach));
      const total = totals[index];
      total.spend += spend; total.leads += leads; total.conversations += conversations; total.clicks += clicks; total.impressions += impressions; total.reach += reach;
    });
  }
  const campaignRows = campaigns.map((campaign, index) => row(campaign, since, totals[index].spend, totals[index].leads, totals[index].conversations, totals[index].clicks, totals[index].impressions, totals[index].reach));
  const allDaily = daily;
  const account = summarize(allDaily);
  const previousRows = previous ? [] : null;
  const accountRows = account;
  const adsetRows = campaignRows;
  const breakdown: BreakdownRow[] = [
    { key: 'instagram_feed', platform: 'instagram', position: 'Instagram Feed', spend: totals[0].spend * 0.29, impressions: 780000, clicks: 13000, leads: Math.round(totals[0].leads * 0.38), conversations: 30, results: Math.round(totals[0].leads * 0.38) + 30 },
    { key: 'instagram_stories', platform: 'instagram', position: 'Instagram Stories', spend: totals[0].spend * 0.24, impressions: 610000, clicks: 10500, leads: Math.round(totals[0].leads * 0.27), conversations: 44, results: Math.round(totals[0].leads * 0.27) + 44 },
    { key: 'facebook_feed', platform: 'facebook', position: 'Facebook Feed', spend: totals[0].spend * 0.2, impressions: 510000, clicks: 7800, leads: Math.round(totals[0].leads * 0.19), conversations: 18, results: Math.round(totals[0].leads * 0.19) + 18 },
    { key: 'instagram_reels', platform: 'instagram', position: 'Instagram Reels', spend: totals[0].spend * 0.15, impressions: 390000, clicks: 6400, leads: Math.round(totals[0].leads * 0.12), conversations: 25, results: Math.round(totals[0].leads * 0.12) + 25 },
    { key: 'facebook_reels', platform: 'facebook', position: 'Facebook Reels', spend: totals[0].spend * 0.12, impressions: 280000, clicks: 5100, leads: Math.round(totals[0].leads * 0.08), conversations: 12, results: Math.round(totals[0].leads * 0.08) + 12 },
  ];
  const ads: InsightRow[] = Array.from({ length: 8 }, (_, i) => {
    const campaign = campaigns[i % 4];
    const c = campaignRows[i % 4];
    const spend = c.spend * (0.36 - (i % 3) * 0.06);
    const leads = campaign.objective === 'OUTCOME_LEADS' ? Math.round(c.leads * (0.4 - (i % 3) * 0.06)) : 0;
    return { ...c, ad_id: `ad-${i + 1}`, ad_name: ['Vídeo · Fachada e lazer', 'Carrossel · Plantas', 'Stories · Tour decorado', 'Imagem · Localização', 'Reels · Depoimento', 'Carrossel · Condições', 'Vídeo · Tour 360º', 'Imagem · Últimas unidades'][i], spend, leads, results_form: leads, results: Math.round(c.results * (0.3 - (i % 4) * 0.025)), clicks: Math.round(c.clicks * (0.3 - (i % 4) * 0.025)), impressions: Math.round(c.impressions * (0.31 - (i % 4) * 0.02)), cpl: leads ? spend / leads : null, thumbnail_url: `https://images.unsplash.com/photo-${['1600607687939-ce8a6c25118c','1600566753086-00f18fb6b3ea','1600607687920-4e2a09cf159d','1600585154340-be6161a56a0c','1600607687644-c7171b42498f','1600566753190-17f0baa2a6c3','1600607687939-ce8a6c25118c','1600566753190-17f0baa2a6c3'][i]}?auto=format&fit=crop&w=640&q=85`, image_url: null };
  });
  const previousCampaigns = campaignRows.map(item => ({ ...item, spend: item.spend * 1.1, leads: Math.round(item.leads * 0.92), results_form: Math.round(item.leads * 0.92), results: Math.round(item.results * 0.92) }));
  return { account: { id: accountId, name: accountName, currency }, accountRows, campaigns: adsetRows, daily: allDaily, creatives: ads, breakdown, previousAccountRows: previous ? previousRows || [] : account.map(item => ({ ...item, spend: item.spend * 1.08, leads: Math.round(item.leads * 0.94), results_form: Math.round(item.leads * 0.94) })), previousCampaigns };
}

export function createDemoData(since: string, until: string): DashboardResponse {
  const start = new Date(`${since}T12:00:00`);
  const end = new Date(`${until}T12:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1);
  const data = dataset(since, until);
  const previous = dataset(prevStart.toISOString().slice(0, 10), prevEnd.toISOString().slice(0, 10), true);
  data.previousAccountRows = previous.accountRows.map(row => ({ ...row, campaign_id: null, campaign_name: null }));
  data.previousCampaigns = previous.campaigns;
  return { data: [data], errors: [], fetchedAt: new Date().toISOString(), partial: false };
}
