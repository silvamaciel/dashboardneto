import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, ChevronDown,
  Clock3, CreditCard, DollarSign, Eye, Filter, Image as ImageIcon, Info, KeyRound,
  LayoutDashboard, Loader2, MessageCircle, MousePointerClick, RefreshCw, Settings,
  ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { createDemoData } from './mock';
import { getAdAccounts, hasMetaToken, loadDashboard } from './api';
import type { AdAccount, BreakdownRow, DashboardResponse, InsightRow } from './types';

type Period = '365d' | 'month' | 'last_month' | '30d' | '7d' | 'custom';
type Totals = { spend: number; impressions: number; reach: number; clicks: number; link_clicks: number; leads: number; conversations: number; profile_visits: number; landing_page_views: number; frequency: number; ctr: number; cpm: number; cpc: number };

const periodOptions: { value: Period; label: string }[] = [
  { value: '365d', label: 'Últimos 365 dias' }, { value: 'month', label: 'Mês atual' },
  { value: 'last_month', label: 'Mês passado' }, { value: '30d', label: 'Últimos 30 dias' },
  { value: '7d', label: 'Últimos 7 dias' }, { value: 'custom', label: 'Personalizado' },
];
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const pct = (value: number) => `${value.toFixed(2).replace('.', ',')}%`;

function localDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
function startDateFor(preset: Period, customFrom: string) {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  if (preset === 'custom') return customFrom;
  if (preset === 'month') return localDate(new Date(now.getFullYear(), now.getMonth(), 1, 12));
  if (preset === 'last_month') return localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1, 12));
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 365;
  now.setDate(now.getDate() - days + 1);
  return localDate(now);
}
function endDateFor(preset: Period, customTo: string) {
  if (preset === 'custom') return customTo;
  if (preset === 'last_month') {
    const now = new Date(); return localDate(new Date(now.getFullYear(), now.getMonth(), 0, 12));
  }
  return localDate(new Date());
}
function rangeDays(since: string, until: string) {
  return Math.max(1, Math.round((new Date(`${until}T12:00:00`).getTime() - new Date(`${since}T12:00:00`).getTime()) / 86_400_000) + 1);
}
function priorRange(since: string, until: string) {
  const days = rangeDays(since, until);
  const end = new Date(`${since}T12:00:00`); end.setDate(end.getDate() - 1);
  const start = new Date(end); start.setDate(start.getDate() - days + 1);
  return { since: localDate(start), until: localDate(end) };
}
function periodLabel(since: string, until: string) {
  const f = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
  return `${f(since)} – ${f(until)}`;
}
function aggregate(rows: InsightRow[]): Totals {
  const base = rows.reduce((total, row) => {
    total.spend += row.spend; total.impressions += row.impressions; total.reach += row.reach;
    total.clicks += row.clicks; total.link_clicks += row.link_clicks; total.leads += row.results_form ?? row.leads;
    total.conversations += row.results_messaging ?? row.conversations; total.profile_visits += row.profile_visits || 0;
    total.landing_page_views += row.landing_page_views || 0;
    return total;
  }, { spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, leads: 0, conversations: 0, profile_visits: 0, landing_page_views: 0 });
  return { ...base, frequency: base.reach ? base.impressions / base.reach : 0, ctr: base.impressions ? base.clicks / base.impressions * 100 : 0, cpm: base.impressions ? base.spend / base.impressions * 1000 : 0, cpc: base.clicks ? base.spend / base.clicks : 0 };
}
function sumSpend(rows: InsightRow[]) { return rows.reduce((sum, row) => sum + row.spend, 0); }
function sumLeads(rows: InsightRow[]) { return rows.reduce((sum, row) => sum + (row.results_form ?? row.leads), 0); }
function change(current: number, previous: number) {
  if (!previous && !current) return null;
  if (!previous) return 100;
  return (current - previous) / previous * 100;
}
function objectiveLabel(objective: string | null, lead: boolean) {
  if (lead) return 'Geração de leads';
  const names: Record<string, string> = { OUTCOME_TRAFFIC: 'Tráfego', OUTCOME_ENGAGEMENT: 'Engajamento', OUTCOME_SALES: 'Vendas', OUTCOME_AWARENESS: 'Reconhecimento', OUTCOME_APP_PROMOTION: 'Promoção de app' };
  return objective ? names[objective] || objective.split('_').join(' ').toLowerCase() : 'Outro objetivo';
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const rawPreset = params.get('preset') as Period | null;
  const validPeriod = periodOptions.some(option => option.value === rawPreset) ? rawPreset! : '365d';
  const [period, setPeriod] = useState<Period>(validPeriod);
  const [customFrom, setCustomFrom] = useState(params.get('from') || startDateFor('365d', ''));
  const [customTo, setCustomTo] = useState(params.get('to') || localDate(new Date()));
  const since = period === 'custom' ? customFrom : startDateFor(period, customFrom);
  const until = period === 'custom' ? customTo : endDateFor(period, customTo);
  const previous = useMemo(() => priorRange(since, until), [since, until]);

  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [liveData, setLiveData] = useState<DashboardResponse | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [refreshCount, setRefreshCount] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [adsetFilter, setAdsetFilter] = useState('all');
  const [distributionMode, setDistributionMode] = useState<'results' | 'spend'>('results');
  const [creativeSort, setCreativeSort] = useState<'spend' | 'leads' | 'cpl' | 'clicks'>('spend');
  const [campaignSort, setCampaignSort] = useState<{ key: 'campaign' | 'adset' | 'spend' | 'leads' | 'cpl' | 'clicks'; direction: 'asc' | 'desc' }>({ key: 'spend', direction: 'desc' });

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set('preset', period); next.set('view', 'meta_ads');
    if (period === 'custom') { next.set('from', customFrom); next.set('to', customTo); }
    else { next.delete('from'); next.delete('to'); }
    window.history.replaceState({}, '', `${window.location.pathname}?${next.toString()}`);
  }, [period, customFrom, customTo]);

  const refreshAccounts = useCallback(async () => {
    if (!hasMetaToken()) return;
    setLiveError('');
    try {
      const result = await getAdAccounts();
      if (!result.length) throw new Error('O token não tem acesso a nenhuma conta de anúncios.');
      setAccounts(result);
      setSelectedAccounts(result.map(account => account.id));
      setMode('live');
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : 'Não foi possível carregar as contas da Meta.');
    }
  }, []);

  useEffect(() => { void refreshAccounts(); }, [refreshAccounts]);

  useEffect(() => {
    if (!autoRefresh || mode !== 'live') return;
    const timer = window.setInterval(() => setRefreshCount(value => value + 1), 10 * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, mode]);

  useEffect(() => {
    if (mode !== 'live' || selectedAccounts.length === 0 || !since || !until || since > until) return;
    let cancelled = false;
    setLiveLoading(true); setLiveError('');
    loadDashboard({ accounts, accountIds: selectedAccounts, since, until, previousSince: previous.since, previousUntil: previous.until })
      .then(result => { if (!cancelled) { setLiveData(result); setLastUpdated(new Date(result.fetchedAt)); } })
      .catch(error => { if (!cancelled) setLiveError(error instanceof Error ? error.message : 'Erro ao buscar dados da Meta.'); })
      .finally(() => { if (!cancelled) setLiveLoading(false); });
    return () => { cancelled = true; };
  }, [mode, selectedAccounts, accounts, since, until, previous.since, previous.until, refreshCount]);

  const demoData = useMemo(() => createDemoData(since, until), [since, until]);
  const response = mode === 'live' ? liveData : demoData;
  const datasets = response?.data || [];
  const selectedDatasets = datasets.filter(dataset => mode === 'demo' || selectedAccounts.includes(dataset.account.id));
  const accountRows = selectedDatasets.flatMap(dataset => dataset.accountRows);
  const previousAccountRows = selectedDatasets.flatMap(dataset => dataset.previousAccountRows);
  const allCampaignRows = selectedDatasets.flatMap(dataset => dataset.campaigns);
  const allPreviousCampaignRows = selectedDatasets.flatMap(dataset => dataset.previousCampaigns);
  const campaignNames = Array.from(new Set(allCampaignRows.map(row => row.campaign_name).filter(Boolean) as string[])).sort();
  const adsetOptions = Array.from(new Set(allCampaignRows.filter(row => campaignFilter === 'all' || row.campaign_name === campaignFilter).map(row => row.adset_name).filter(Boolean) as string[])).sort();
  const applyHierarchyFilters = (rows: InsightRow[]) => rows.filter(row => (campaignFilter === 'all' || row.campaign_name === campaignFilter) && (adsetFilter === 'all' || row.adset_name === adsetFilter));
  const campaignRows = applyHierarchyFilters(allCampaignRows);
  const previousCampaignRows = applyHierarchyFilters(allPreviousCampaignRows);
  const hasHierarchyFilter = campaignFilter !== 'all' || adsetFilter !== 'all';
  const baseRows = hasHierarchyFilter ? campaignRows : accountRows;
  const previousBaseRows = hasHierarchyFilter ? previousCampaignRows : previousAccountRows;
  const totals = aggregate(baseRows);
  const previousTotals = aggregate(previousBaseRows);
  const leadRows = campaignRows.filter(row => row.is_lead_campaign);
  const previousLeadRows = previousCampaignRows.filter(row => row.is_lead_campaign);
  const leadSpend = sumSpend(leadRows);
  const leadCount = sumLeads(leadRows);
  const leadCpl = leadCount > 0 ? leadSpend / leadCount : null;
  const previousLeadSpend = sumSpend(previousLeadRows);
  const previousLeadCount = sumLeads(previousLeadRows);
  const previousCpl = previousLeadCount > 0 ? previousLeadSpend / previousLeadCount : null;

  const dailyRows = applyHierarchyFilters(selectedDatasets.flatMap(dataset => dataset.daily));
  const dailyChart = useMemo(() => {
    const map = new Map<string, { date: string; leadSpend: number; otherSpend: number; leads: number; conversations: number; results: number }>();
    dailyRows.forEach(row => {
      const key = row.date_start || '';
      if (!key) return;
      const bucket = map.get(key) || { date: key, leadSpend: 0, otherSpend: 0, leads: 0, conversations: 0, results: 0 };
      const leads = row.results_form ?? row.leads; const conversations = row.results_messaging ?? row.conversations;
      if (row.is_lead_campaign) bucket.leadSpend += row.spend; else bucket.otherSpend += row.spend;
      bucket.leads += leads; bucket.conversations += conversations; bucket.results += leads + conversations;
      map.set(key, bucket);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).map(row => ({ ...row, label: new Date(`${row.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }));
  }, [dailyRows]);

  const weekdayChart = useMemo(() => {
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const result = names.map((day, index) => ({ day, results: 0, leads: 0, conversations: 0, spend: 0, index }));
    dailyRows.forEach(row => {
      if (!row.date_start) return;
      const day = new Date(`${row.date_start}T12:00:00`).getDay();
      result[day].leads += row.results_form ?? row.leads;
      result[day].conversations += row.results_messaging ?? row.conversations;
      result[day].results += (row.results_form ?? row.leads) + (row.results_messaging ?? row.conversations);
      result[day].spend += row.spend;
    });
    return [...result.slice(1), result[0]];
  }, [dailyRows]);

  const campaignTable = useMemo(() => {
    const map = new Map<string, { campaign: string; adset: string; objective: string | null; lead: boolean; spend: number; leadSpend: number; leads: number; clicks: number }>();
    campaignRows.forEach(row => {
      const key = `${row.campaign_id || row.campaign_name}::${row.adset_id || row.adset_name}`;
      const item = map.get(key) || { campaign: row.campaign_name || '—', adset: row.adset_name || '—', objective: row.campaign_objective, lead: false, spend: 0, leadSpend: 0, leads: 0, clicks: 0 };
      item.spend += row.spend; item.clicks += row.clicks;
      if (row.is_lead_campaign) { item.lead = true; item.leadSpend += row.spend; item.leads += row.results_form ?? row.leads; }
      map.set(key, item);
    });
    return Array.from(map.values()).map(row => ({ ...row, cpl: row.leads > 0 ? row.leadSpend / row.leads : null }));
  }, [campaignRows]);
  const sortedCampaigns = useMemo(() => [...campaignTable].sort((a, b) => {
    const { key, direction } = campaignSort;
    const av = a[key] ?? (key === 'cpl' ? Number.POSITIVE_INFINITY : 0);
    const bv = b[key] ?? (key === 'cpl' ? Number.POSITIVE_INFINITY : 0);
    const compared = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv);
    return direction === 'asc' ? compared : -compared;
  }), [campaignTable, campaignSort]);

  const breakdownRows = selectedDatasets.flatMap(dataset => dataset.breakdown)
    .filter(row => (campaignFilter === 'all' || row.campaign_name === campaignFilter) && (adsetFilter === 'all' || row.adset_name === adsetFilter));
  const platformRows = useMemo(() => groupBreakdown(breakdownRows, true), [breakdownRows]);
  const positionRows = useMemo(() => groupBreakdown(breakdownRows, false), [breakdownRows]);
  const creativeRows = selectedDatasets.flatMap(dataset => dataset.creatives)
    .filter(row => (campaignFilter === 'all' || row.campaign_name === campaignFilter) && (adsetFilter === 'all' || row.adset_name === adsetFilter));
  const sortedCreatives = useMemo(() => [...creativeRows].sort((a, b) => {
    if (creativeSort === 'cpl') return (a.cpl ?? Number.POSITIVE_INFINITY) - (b.cpl ?? Number.POSITIVE_INFINITY);
    return Number(b[creativeSort] || 0) - Number(a[creativeSort] || 0);
  }), [creativeRows, creativeSort]);

  const bestPosition = [...positionRows].sort((a, b) => b.leads + b.conversations - a.leads - a.conversations)[0];
  const totalPositionResults = positionRows.reduce((sum, row) => sum + row.leads + row.conversations, 0);
  const bestCampaign = [...campaignTable].filter(row => row.lead && row.leads > 0).sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity))[0];
  const zeroResultDay = [...dailyChart].filter(row => row.leadSpend + row.otherSpend > 0 && row.results === 0).sort((a, b) => (b.leadSpend + b.otherSpend) - (a.leadSpend + a.otherSpend))[0];
  const highlight = bestPosition && totalPositionResults > 0 && (bestPosition.leads + bestPosition.conversations) / totalPositionResults >= 0.4
    ? `${bestPosition.label} concentra ${Math.round((bestPosition.leads + bestPosition.conversations) / totalPositionResults * 100)}% dos resultados.`
    : bestCampaign ? `${bestCampaign.campaign} tem o menor CPL entre as campanhas de geração de leads (${money.format(bestCampaign.cpl || 0)}).` : '';
  const alert = zeroResultDay ? `${zeroResultDay.label} teve investimento, mas não registrou leads ou conversas.` : '';

  const demo = mode === 'demo';
  const connectionLabel = demo ? 'Demonstração' : `${selectedAccounts.length} conta${selectedAccounts.length === 1 ? '' : 's'} selecionada${selectedAccounts.length === 1 ? '' : 's'}`;

  function toggleAccount(id: string) {
    setSelectedAccounts(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  function selectPeriod(value: Period) {
    setPeriod(value);
    if (value === 'custom') { setCustomFrom(startDateFor('365d', '')); setCustomTo(localDate(new Date())); }
    setCampaignFilter('all'); setAdsetFilter('all');
  }
  function sortBy(key: typeof campaignSort.key) {
    setCampaignSort(current => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><BarChart3 size={20} /></div><div><b>METRIX</b><small>ADS INTELLIGENCE</small></div></div>
        <div className="workspace"><span className="workspace-dot" /><div><small>WORKSPACE</small><strong>Meu dashboard</strong></div><ChevronDown size={15} /></div>
        <div className="nav-label">ANÁLISE</div>
        <nav className="side-nav">
          <button className="nav-item active"><LayoutDashboard size={17} /><span>Visão geral</span><span className="nav-active-dot" /></button>
          <button className="nav-item" onClick={() => document.getElementById('campaigns')?.scrollIntoView({ behavior: 'smooth' })}><BarChart3 size={17} /><span>Campanhas</span></button>
          <button className="nav-item" onClick={() => document.getElementById('creatives')?.scrollIntoView({ behavior: 'smooth' })}><ImageIcon size={17} /><span>Criativos</span></button>
          <button className="nav-item" onClick={() => setSettingsOpen(true)}><CreditCard size={17} /><span>Contas de anúncios</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-help"><div className="help-icon"><ShieldCheck size={17} /></div><strong>Seus dados, sob seu controle</strong><p>O token é configurado no front-end e não é enviado a um servidor próprio.</p><button onClick={() => setSettingsOpen(true)}>Configurar token <span>→</span></button></div><div className="sidebar-footer"><span className="avatar">M</span><div><strong>Workspace pessoal</strong><small>Plano individual</small></div><Settings size={16} /></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>Dashboard</span><b>/</b><strong>Meta Ads</strong></div><div className="top-actions"><span className={`connection-pill ${demo ? 'demo-pill' : 'live-pill'}`}><i />{connectionLabel}</span><button className="icon-button" title="Configurar token" onClick={() => setSettingsOpen(true)}><Settings size={17} /></button><span className="user-avatar">M</span></div></header>
        <div className="page-wrap">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-icon"><BarChart3 size={13} /></span>ANÁLISE DE PERFORMANCE</div><h1>Visão geral</h1><p>Acompanhe o desempenho das suas campanhas Meta Ads.</p></div><div className="heading-right"><span className="updated"><Clock3 size={14} /> Atualizado {demo ? 'agora · dados de demonstração' : `às ${lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span><button className="button button-primary" onClick={() => demo ? setSettingsOpen(true) : setRefreshCount(value => value + 1)} disabled={liveLoading}><RefreshCw size={15} className={liveLoading ? 'spin' : ''} />{demo ? 'Conectar Meta Ads' : 'Atualizar dados'}</button></div></section>

          {demo && <div className="demo-banner"><div className="demo-banner-icon"><Info size={17} /></div><div><strong>Visualização com dados de demonstração</strong><span>Os números e criativos desta tela são ilustrativos. Configure seu token Meta para carregar dados reais.</span></div><button onClick={() => setSettingsOpen(true)}>Configurar conexão <span>→</span></button></div>}
          {liveError && <div className="error-banner"><AlertTriangle size={17} /><span>{liveError}</span><button onClick={() => setSettingsOpen(true)}>Ver configuração</button></div>}
          {response?.partial && response.errors.map(error => <div className="error-banner" key={error.account}><AlertTriangle size={17} /><span><b>{error.account}:</b> {error.error}</span></div>)}

          <section className="filter-bar">
            <div className="control-label"><Filter size={15} /><span>Filtros</span></div>
            <label className="select-control"><CalendarDays size={15} /><select value={period} onChange={event => selectPeriod(event.target.value as Period)}>{periodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14} /></label>
            {period === 'custom' && <div className="date-range"><input type="date" value={customFrom} max={customTo} onChange={event => setCustomFrom(event.target.value)} /><span>até</span><input type="date" value={customTo} min={customFrom} max={localDate(new Date())} onChange={event => setCustomTo(event.target.value)} /></div>}
            <div className="filter-divider" />
            <div className="account-select-wrap"><button className="select-control account-select" onClick={() => setAccountMenu(open => !open)}><CreditCard size={15} /><span>{demo ? 'Conta de demonstração' : `${selectedAccounts.length || 0} contas`}</span><ChevronDown size={14} /></button>{accountMenu && <div className="account-popover"><div className="popover-heading"><strong>Contas de anúncios</strong><button onClick={() => setAccountMenu(false)}><X size={14} /></button></div>{accounts.map(account => <label className="account-option" key={account.id}><input type="checkbox" checked={selectedAccounts.includes(account.id)} onChange={() => toggleAccount(account.id)} /><span><b>{account.name || account.id}</b><small>{account.id} · {account.currency || 'BRL'}</small></span></label>)}{!accounts.length && <div className="empty-account">Nenhuma conta conectada.</div>}<div className="popover-foot"><button onClick={() => setSelectedAccounts(accounts.map(account => account.id))}>Selecionar todas</button><button onClick={() => setSelectedAccounts([])}>Limpar</button></div></div>}</div>
            <label className="select-control"><BarChart3 size={15} /><select value={campaignFilter} onChange={event => { setCampaignFilter(event.target.value); setAdsetFilter('all'); }}><option value="all">Todas as campanhas</option>{campaignNames.map(name => <option key={name} value={name}>{name}</option>)}</select><ChevronDown size={14} /></label>
            <label className="select-control"><Users size={15} /><select value={adsetFilter} onChange={event => setAdsetFilter(event.target.value)}><option value="all">Todos os conjuntos</option>{adsetOptions.map(name => <option key={name} value={name}>{name}</option>)}</select><ChevronDown size={14} /></label>
            {(campaignFilter !== 'all' || adsetFilter !== 'all') && <button className="clear-filters" onClick={() => { setCampaignFilter('all'); setAdsetFilter('all'); }}>Limpar</button>}
            <div className="filter-spacer" />
            <label className="auto-refresh"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} /><span className="toggle-ui" /><span>Auto 10 min</span></label>
          </section>

          {mode === 'live' && selectedAccounts.length === 0 && <div className="empty-selection"><CreditCard size={18} /> Selecione ao menos uma conta de anúncios para ver os dados.</div>}
          {liveLoading && <div className="loading-strip"><Loader2 size={15} className="spin" /> Consultando a Meta Marketing API…</div>}

          <section className="summary-card"><div className="summary-main"><div className="summary-title"><span className="summary-spark"><Sparkles size={16} /></span><div><strong>Resumo do período</strong><small>Leitura rápida da performance · {periodLabel(since, until)}</small></div></div><div className="summary-stats"><div><small>INVESTIDO EM CADASTRO</small><strong>{money.format(leadSpend)}</strong><em>Total Meta: {money.format(totals.spend)}</em></div><div><small>LEADS DE FORMULÁRIO</small><strong>{integer.format(leadCount)}</strong><em>Reportados pela Meta</em></div><div><small>CUSTO POR LEAD</small><strong>{leadCpl === null ? '—' : money.format(leadCpl)}</strong><em>{leadCpl !== null && previousCpl !== null ? comparisonText(change(leadCpl, previousCpl), true) : 'Sem comparativo'}</em></div></div></div><div className="summary-insights">{highlight && <div className="insight-line positive"><span><Sparkles size={14} /></span><p><b>Destaque</b>{highlight}</p></div>}{alert && <div className="insight-line warning"><span><AlertTriangle size={14} /></span><p><b>Atenção</b>{alert}</p></div>}{!highlight && !alert && <div className="insight-empty">Os insights aparecem quando há volume de dados suficiente no período.</div>}</div></section>

          <section className="kpi-grid">
            <KpiCard title="Investimento total" value={money.format(totals.spend)} delta={change(totals.spend, previousTotals.spend)} icon={<DollarSign size={17} />} tone="green" subtitle="Todos os objetivos" data={dailyChart.map(row => row.leadSpend + row.otherSpend)} />
            <KpiCard title="Investido em cadastro" value={money.format(leadSpend)} delta={change(leadSpend, previousLeadSpend)} icon={<CreditCard size={17} />} tone="blue" subtitle="Objetivo de geração de leads" data={dailyChart.map(row => row.leadSpend)} />
            <KpiCard title="Leads de formulário" value={integer.format(leadCount)} delta={change(leadCount, previousLeadCount)} icon={<Users size={17} />} tone="blue" subtitle="Atribuídos pela Meta" data={dailyChart.map(row => row.leads)} />
            <KpiCard title="Custo por lead" value={leadCpl === null ? '—' : money.format(leadCpl)} delta={leadCpl !== null && previousCpl !== null ? change(leadCpl, previousCpl) : null} invert icon={<TrendingIcon />} tone="amber" subtitle="Somente campanhas de leads" data={dailyChart.map(row => row.leadSpend / (row.leads || 1))} />
            <KpiCard title="Conversas iniciadas" value={integer.format(totals.conversations)} delta={change(totals.conversations, previousTotals.conversations)} icon={<MessageCircle size={17} />} tone="violet" subtitle={totals.conversations ? `Custo/conv. ${money.format(totals.spend / totals.conversations)}` : 'Messenger e WhatsApp'} data={dailyChart.map(row => row.conversations)} />
            <KpiCard title="Visitas ao perfil" value={integer.format(totals.profile_visits)} delta={change(totals.profile_visits, previousTotals.profile_visits)} icon={<Eye size={17} />} tone="slate" subtitle="Instagram atribuído a anúncios" data={dailyChart.map(row => row.leads)} />
          </section>

          <section className="chart-row"><div className="panel daily-panel"><PanelTitle title="Investimento × resultados diários" subtitle="Evolução do gasto e das ações reportadas pela Meta" tooltip="Resultados = leads de formulário + conversas iniciadas." /><div className="legend"><span><i className="legend-blue" />Geração de leads</span><span><i className="legend-gray" />Outros objetivos</span><span><i className="legend-line" />Resultados</span></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={dailyChart} margin={{ top: 16, right: 14, bottom: 0, left: 4 }}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8993a5' }} tickLine={false} axisLine={false} minTickGap={24} /><YAxis yAxisId="money" tick={{ fontSize: 10, fill: '#8993a5' }} tickLine={false} axisLine={false} width={55} tickFormatter={value => `R$${compact.format(value)}`} /><YAxis yAxisId="results" orientation="right" tick={{ fontSize: 10, fill: '#8993a5' }} tickLine={false} axisLine={false} width={35} allowDecimals={false} /><Tooltip content={<DailyTooltip />} /><Bar yAxisId="money" dataKey="leadSpend" name="Geração de leads" stackId="spend" fill="#5186f7" radius={[0, 0, 0, 0]} maxBarSize={17} /><Bar yAxisId="money" dataKey="otherSpend" name="Outros objetivos" stackId="spend" fill="#cbd3df" radius={[3, 3, 0, 0]} maxBarSize={17} /><Line yAxisId="results" dataKey="results" name="Resultados" type="monotone" stroke="#15b88a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></ComposedChart></ResponsiveContainer></div></div>
            <div className="panel metrics-panel"><PanelTitle title="Métricas complementares" subtitle="Indicadores de alcance e eficiência" tooltip="CTR = cliques ÷ impressões. CPM = gasto por mil impressões. CPC = gasto ÷ cliques." /><div className="metric-grid">{[["Impressões", compact.format(totals.impressions)], ["Alcance", compact.format(totals.reach)], ["Frequência", totals.frequency.toFixed(2).replace('.', ',')], ["Cliques", compact.format(totals.clicks)], ["Cliques no link", compact.format(totals.link_clicks)], ["Visitas ao perfil", compact.format(totals.profile_visits)], ["Visualizações destino", compact.format(totals.landing_page_views)], ["CTR", pct(totals.ctr)], ["CPM", money.format(totals.cpm)], ["CPC", money.format(totals.cpc)]].map(([label, value]) => <div className="metric-tile" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div></div></section>

          <section className="chart-row campaign-week-row"><div className="panel campaign-panel" id="campaigns"><PanelTitle title="Performance por campanha e conjunto" subtitle={`${campaignTable.length} conjuntos no período`} tooltip="Investimento total inclui todos os objetivos. Leads e CPL incluem somente campanhas com objetivo oficial de geração de leads." /><div className="table-wrap"><table className="data-table"><thead><tr><SortHead label="Campanha" onClick={() => sortBy('campaign')} /><SortHead label="Conjunto" onClick={() => sortBy('adset')} /><SortHead label="Objetivo" /><SortHead label="Investido total" align="right" onClick={() => sortBy('spend')} /><SortHead label="Investido em cadastro" align="right" /><SortHead label="Leads" align="right" onClick={() => sortBy('leads')} /><SortHead label="CPL" align="right" onClick={() => sortBy('cpl')} /><SortHead label="Cliques" align="right" onClick={() => sortBy('clicks')} /></tr></thead><tbody>{sortedCampaigns.map((row, index) => <tr key={`${row.campaign}-${row.adset}-${index}`}><td className="campaign-name"><strong>{row.campaign}</strong></td><td>{row.adset}</td><td><span className={`objective-tag ${row.lead ? 'objective-lead' : ''}`}>{objectiveLabel(row.objective, row.lead)}</span></td><td className="number-cell">{money.format(row.spend)}</td><td className="number-cell lead-cell">{row.leadSpend ? money.format(row.leadSpend) : '—'}</td><td className="number-cell">{row.leads ? integer.format(row.leads) : '—'}</td><td className="number-cell">{row.cpl === null ? '—' : money.format(row.cpl)}</td><td className="number-cell">{integer.format(row.clicks)}</td></tr>)}</tbody><tfoot><tr><td colSpan={3}>Total geral</td><td className="number-cell">{money.format(sumSpend(campaignRows))}</td><td className="number-cell lead-cell">{money.format(leadSpend)}</td><td className="number-cell">{integer.format(leadCount)}</td><td className="number-cell">{leadCpl === null ? '—' : money.format(leadCpl)}</td><td className="number-cell">{integer.format(campaignRows.reduce((s, row) => s + row.clicks, 0))}</td></tr></tfoot></table>{sortedCampaigns.length === 0 && <div className="empty-panel">Sem dados de campanha no período selecionado.</div>}</div></div>
            <div className="panel weekday-panel"><PanelTitle title="Resultados por dia da semana" subtitle="Leads de formulário + conversas" tooltip="Os resultados são agrupados de segunda a domingo." /><div className="chart-area weekday-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={weekdayChart} margin={{ top: 14, right: 6, bottom: 0, left: -14 }}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 10, fill: '#8993a5' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: '#8993a5' }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip content={<WeekdayTooltip />} /><Bar dataKey="results" name="Resultados" fill="#5487f8" radius={[5, 5, 0, 0]} maxBarSize={30} /></BarChart></ResponsiveContainer></div></div></section>

          <section className="panel distribution-panel"><div className="distribution-head"><PanelTitle title="Distribuição" subtitle="Onde o investimento e os resultados acontecem" tooltip="Quebra por plataforma e posicionamento retornada pela Meta." /><div className="segmented"><button className={distributionMode === 'results' ? 'selected' : ''} onClick={() => setDistributionMode('results')}>Resultados</button><button className={distributionMode === 'spend' ? 'selected' : ''} onClick={() => setDistributionMode('spend')}>Gasto</button></div></div><div className="distribution-grid"><RankedBars title="Plataforma + posicionamento" rows={platformRows} mode={distributionMode} /><RankedBars title="Posicionamento" rows={positionRows} mode={distributionMode} /></div></section>

          <section className="panel creatives-panel" id="creatives"><div className="creatives-heading"><PanelTitle title="Performance por criativo" subtitle={`${sortedCreatives.length} anúncios · ordenados por ${creativeSort === 'cpl' ? 'menor CPL' : creativeSort === 'spend' ? 'investimento' : creativeSort === 'leads' ? 'leads' : 'cliques'}`} tooltip="O CPL é calculado somente para anúncios de campanhas cujo objetivo oficial é geração de leads." /><div className="sort-pills"><span>Ordenar:</span>{([{ key: 'spend', label: 'Investimento' }, { key: 'leads', label: 'Leads' }, { key: 'cpl', label: 'Menor CPL' }, { key: 'clicks', label: 'Cliques' }] as const).map(item => <button key={item.key} className={creativeSort === item.key ? 'selected' : ''} onClick={() => setCreativeSort(item.key)}>{item.label}</button>)}</div></div><div className="creative-grid">{sortedCreatives.slice(0, 16).map((ad, index) => <CreativeCard key={ad.ad_id || `${ad.campaign_name}-${index}`} row={ad} index={index} allRows={sortedCreatives} />)}</div>{!sortedCreatives.length && <div className="empty-panel">Nenhum criativo encontrado para os filtros selecionados.</div>}</section>
          <footer className="page-footer"><span>Dados fornecidos pela Meta Marketing API</span><span>Indicadores de lead são resultados reportados pela plataforma.</span></footer>
        </div>
      </main>

      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="Fechar"><X size={18} /></button><div className="modal-icon"><KeyRound size={20} /></div><h2 id="settings-title">Configurar token do Meta</h2><p>O token é lido diretamente pelo front-end. Configure-o localmente para carregar suas contas de anúncios.</p><div className="config-step"><span>1</span><div><strong>Crie o arquivo <code>.env.local</code></strong><small>Na pasta do projeto, copie o exemplo `.env.local.example`.</small></div></div><div className="code-snippet">VITE_META_ACCESS_TOKEN=seu_token_meta_aqui</div><div className="config-step"><span>2</span><div><strong>Reinicie o app</strong><small>Rode <code>npm run dev</code> novamente para a configuração ser carregada.</small></div></div><div className="security-note"><AlertTriangle size={16} /><span>Como o token é usado no navegador, ele pode ser visto por qualquer pessoa que acesse o app publicado. Não publique um token real em repositório público ou site aberto.</span></div><div className="modal-status"><span className={hasMetaToken() ? 'status-dot active' : 'status-dot'} />{hasMetaToken() ? 'Token encontrado no front-end' : 'Token ainda não configurado'}</div><div className="modal-actions"><button className="button button-secondary" onClick={() => setSettingsOpen(false)}>Fechar</button><button className="button button-primary" disabled={!hasMetaToken()} onClick={async () => { await refreshAccounts(); setSettingsOpen(false); }}>Validar e carregar contas</button></div></section></div>}
    </div>
  );
}

function groupBreakdown(rows: BreakdownRow[], byPlatform: boolean) {
  const map = new Map<string, { label: string; spend: number; leads: number; conversations: number }>();
  rows.forEach(row => {
    const shortPosition = row.position.replace(/^(instagram|facebook|messenger|audience_network)_/, '').split('_').join(' ');
    const label = byPlatform ? `${platformName(row.platform)} · ${titleCase(shortPosition)}` : titleCase(shortPosition);
    const key = byPlatform ? `${row.platform}_${shortPosition}` : shortPosition;
    const item = map.get(key) || { label, spend: 0, leads: 0, conversations: 0 };
    item.spend += row.spend; item.leads += row.leads; item.conversations += row.conversations;
    map.set(key, item);
  });
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}
function platformName(value: string) { return ({ instagram: 'Instagram', facebook: 'Facebook', messenger: 'Messenger', audience_network: 'Audience Network' } as Record<string, string>)[value] || titleCase(value); }
function titleCase(value: string) { return value.split(/[\s_]+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ') || 'Outros'; }
function comparisonText(value: number | null, invert = false) {
  if (value === null) return 'Sem comparação';
  const good = invert ? value < 0 : value >= 0;
  return `${value > 0 ? '+' : ''}${Math.round(value)}% vs. período anterior${good ? ' · favorável' : ''}`;
}
function TrendingIcon() { return <MousePointerClick size={17} />; }

function KpiCard({ title, value, delta, invert = false, icon, tone, subtitle, data }: { title: string; value: string; delta: number | null; invert?: boolean; icon: ReactNode; tone: string; subtitle: string; data: number[] }) {
  const good = delta !== null && (invert ? delta < 0 : delta >= 0);
  return <article className={`kpi-card tone-${tone}`}><div className="kpi-top"><span className="kpi-icon">{icon}</span><span className="kpi-title">{title}<Info size={12} /></span>{delta !== null && <span className={`delta ${good ? 'good' : 'bad'}`}>{good ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}{Math.abs(Math.round(delta))}%</span>}</div><strong className="kpi-value">{value}</strong><div className="kpi-bottom"><span>{delta !== null ? `${Math.abs(Math.round(delta))}% vs. período anterior` : subtitle}</span><Spark data={data} tone={tone} /></div></article>;
}
function Spark({ data, tone }: { data: number[]; tone: string }) {
  const rows = data.slice(-36).map((value, index) => ({ index, value }));
  return <div className="spark"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows}><Area dataKey="value" type="monotone" stroke={sparkColor(tone)} fill={sparkColor(tone)} fillOpacity={0.1} strokeWidth={1.5} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>;
}
function sparkColor(tone: string) { return ({ green: '#1ab98c', blue: '#5487f8', amber: '#e4a126', violet: '#9a72e8', slate: '#8290a5' } as Record<string, string>)[tone] || '#5487f8'; }
function PanelTitle({ title, subtitle, tooltip }: { title: string; subtitle: string; tooltip: string }) { return <div className="panel-title"><div><div className="title-line"><h2>{title}</h2><span className="info-tip" title={tooltip}><Info size={13} /></span></div><p>{subtitle}</p></div></div>; }
function SortHead({ label, align = 'left', onClick }: { label: string; align?: string; onClick?: () => void }) { return <th className={align === 'right' ? 'align-right' : ''}><button disabled={!onClick} onClick={onClick}>{label}{onClick && <span>↕</span>}</button></th>; }
function DailyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="chart-tooltip"><b>{label}</b><span><i className="legend-blue" />Geração de leads <strong>{money.format(row.leadSpend)}</strong></span><span><i className="legend-gray" />Outros objetivos <strong>{money.format(row.otherSpend)}</strong></span><span><i className="legend-line" />Leads + conversas <strong>{integer.format(row.results)}</strong></span></div>;
}
function WeekdayTooltip({ active, payload, label }: any) { if (!active || !payload?.length) return null; const row = payload[0].payload; return <div className="chart-tooltip"><b>{label}</b><span>Resultados <strong>{integer.format(row.results)}</strong></span><span>Leads <strong>{integer.format(row.leads)}</strong></span><span>Conversas <strong>{integer.format(row.conversations)}</strong></span></div>; }
function RankedBars({ title, rows, mode }: { title: string; rows: ReturnType<typeof groupBreakdown>; mode: 'results' | 'spend' }) {
  const values = rows.map(row => ({ ...row, value: mode === 'spend' ? row.spend : row.leads + row.conversations })).filter(row => row.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  const total = values.reduce((sum, row) => sum + row.value, 0); const max = values[0]?.value || 1;
  return <div className="ranked-card"><h3>{title}</h3>{values.length ? values.map((row, index) => <div className="rank-row" key={row.label}><div className="rank-top"><span className="rank-index">{String(index + 1).padStart(2, '0')}</span><span className="rank-label">{row.label}</span><strong>{mode === 'spend' ? money.format(row.spend) : `${integer.format(row.value)} resultados`}</strong><small>{total ? `${(row.value / total * 100).toFixed(1).replace('.', ',')}%` : ''}</small></div><div className="rank-track"><i style={{ width: `${row.value / max * 100}%`, background: `var(--chart-${index + 1})` }} /></div><div className="rank-sub">{mode === 'spend' ? `${integer.format(row.leads)} leads · ${integer.format(row.conversations)} conversas` : `${money.format(row.spend)} investidos`}</div></div>) : <div className="empty-inline">Sem dados de posicionamento.</div>}</div>;
}
function CreativeCard({ row, index, allRows }: { row: InsightRow; index: number; allRows: InsightRow[] }) {
  const eligible = allRows.filter(item => item.is_lead_campaign && (item.leads || 0) >= 3 && item.cpl !== null);
  const bestId = [...eligible].sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity))[0]?.ad_id;
  const isBest = !!row.ad_id && row.ad_id === bestId;
  const totalSpend = allRows.reduce((sum, item) => sum + item.spend, 0);
  const share = totalSpend ? Math.min(100, row.spend / totalSpend * 100) : 0;
  return <article className={`creative-card ${isBest ? 'top-creative' : ''}`}><div className="creative-image">{row.thumbnail_url ? <img src={row.thumbnail_url} alt={row.ad_name || 'Criativo de anúncio'} loading="lazy" /> : <div className="image-placeholder"><ImageIcon size={24} /></div>}{isBest && <span className="top-badge">★ CPL destaque</span>}<span className="spend-share" style={{ width: `${share}%` }} /></div><div className="creative-body"><strong title={row.ad_name || ''}>{row.ad_name || `Anúncio ${index + 1}`}</strong><small>{row.campaign_name || 'Campanha Meta'}</small><div className="creative-stats"><span>Investido<strong>{money.format(row.spend)}</strong></span><span>Leads<strong>{integer.format(row.leads || 0)}</strong></span><span>CPL<strong>{row.is_lead_campaign && row.cpl !== null ? money.format(row.cpl || 0) : '—'}</strong></span></div><div className="creative-clicks"><MousePointerClick size={12} /> {integer.format(row.clicks)} cliques</div></div></article>;
}

export default App;
