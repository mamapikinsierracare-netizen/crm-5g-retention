import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabase';
import DateRangeFilter from './DateRangeFilter';
/** * PROFESSIONAL CHART SUITE 
 * These components provide the 8 strategic visualizations requested.
 */
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ComposedChart, Line
} from 'recharts';

/**
 * DATE LOGIC ENGINE
 * Handles all preset and custom range calculations for the dashboard filters.
 */
function getDateRange(range, customStart = null, customEnd = null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  switch (range) {
    case 'Today':
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    case 'This Week':
      return { start: startOfWeek.toISOString(), end: new Date(endOfWeek.getTime() + 86400000).toISOString() };
    case 'Last Week': {
      const lastWeekStart = new Date(startOfWeek);
      lastWeekStart.setDate(startOfWeek.getDate() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      return { start: lastWeekStart.toISOString(), end: new Date(lastWeekEnd.getTime() + 86400000).toISOString() };
    }
    case 'This Month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: monthStart.toISOString(), end: new Date(monthEnd.getTime() + 86400000).toISOString() };
    }
    case 'Last Month': {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: lastMonthStart.toISOString(), end: new Date(lastMonthEnd.getTime() + 86400000).toISOString() };
    }
    case 'Last 3 Months': {
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      return { start: threeMonthsAgo.toISOString(), end: today.toISOString() };
    }
    case 'Last 6 Months': {
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      return { start: sixMonthsAgo.toISOString(), end: today.toISOString() };
    }
    case 'This Year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { start: yearStart.toISOString(), end: today.toISOString() };
    }
    case 'Past Years': {
      const pastYearsEnd = new Date(now.getFullYear(), 0, 1);
      return { start: '1970-01-01T00:00:00Z', end: pastYearsEnd.toISOString() };
    }
    case 'Custom': {
      if (customStart && customEnd) {
        const startDate = new Date(customStart);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
        return { start: startDate.toISOString(), end: endDate.toISOString() };
      }
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    }
    default:
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
  }
}

export default function ManagerDashboard() {
  // 1. STATE MANAGEMENT
  const [range, setRange] = useState('This Month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [loading, setLoading] = useState(true);

  // Raw Data Containers
  const [callsRaw, setCallsRaw] = useState([]);
  const [clientsRaw, setClientsRaw] = useState([]);
  const [agentLeaderboard, setAgentLeaderboard] = useState([]);
  const [timelineData, setTimelineData] = useState([]);

  // KPI Object
  const [kpiMetrics, setKpiMetrics] = useState({
    totalCalls: 0,
    successfulWinbacks: 0,
    winbackConversionRate: 0,
    revenueCollected: 0,
    uniqueClientsCalled: 0,
    portfolioUniverse: 0
  });

  // Extended Data Object
  const [extendedStats, setExtendedStats] = useState({
    activeRevenue: 0,
    disabledRevenue: 0,
    activeAcctCount: 0,
    disabledAcctCount: 0,
    outcomes: { Answer: 0, 'Did not answer': 0, Busy: 0, Unreachable: 0 },
    responses: { Paid: 0, 'Promise to pay': 0, Travel: 0, 'Not interested': 0, 'To collect equipment': 0, Other: 0 },
    agentBreakdownList: [],
  });

  // 2. DATA FETCHING LOGIC
  const runDataSync = async () => {
    setLoading(true);
    const { start, end } = getDateRange(range, customStart, customEnd);

    try {
      // Fetch Call Activities with Client Join
      const { data: calls, error: cErr } = await supabase
        .from('call_activities')
        .select('*, clients!inner(aav_value_usd, retention_agent)')
        .gte('call_time', start)
        .lt('call_time', end);

      if (cErr) throw cErr;
      const validCalls = calls || [];
      setCallsRaw(validCalls);

      // Fetch All Portfolio Clients
      const { data: clients, error: clErr } = await supabase
        .from('clients')
        .select('*');

      if (clErr) throw clErr;
      const validClients = clients || [];
      setClientsRaw(validClients);

      // --- CALCULATE TRENDS ---
      const trendMap = new Map();
      validCalls.forEach(call => {
        const dayKey = call.call_time.slice(0, 10);
        trendMap.set(dayKey, (trendMap.get(dayKey) || 0) + 1);
      });
      const sortedTrend = Array.from(trendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setTimelineData(sortedTrend);

      // --- CALCULATE LEADERBOARD ---
      const leaderboardMap = new Map();
      validCalls.forEach(call => {
        if (call.response_outcome === 'Paid') {
          const email = call.agent_email || 'Unassigned';
          const existing = leaderboardMap.get(email) || { wins: 0, revenue: 0 };
          existing.wins += 1;
          existing.revenue += (Number(call.clients?.aav_value_usd) || 0);
          leaderboardMap.set(email, existing);
        }
      });
      const finalLeaderboard = Array.from(leaderboardMap.entries())
        .map(([email, d]) => ({ email, wins: d.wins, revenue: d.revenue }))
        .sort((a, b) => b.wins - a.wins);
      setAgentLeaderboard(finalLeaderboard);

    } catch (error) {
      console.error("Critical Dashboard Error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Trigger Fetch on mount and filter change
  useEffect(() => { runDataSync(); }, [range, customStart, customEnd]);

  // 3. STRATEGIC ANALYTICS COMPILATION
  const analytics = useMemo(() => {
    const clients = clientsRaw;
    const calls = callsRaw;

    // Portfolio Math
    const totalUniverse = clients.length;
    const activeSet = clients.filter(c => c.account_status?.toLowerCase().trim() === 'active');
    const disabledSet = clients.filter(c => c.account_status?.toLowerCase().trim() === 'disabled');
    
    const activeAAVSum = activeSet.reduce((s, c) => s + (Number(c.aav_value_usd) || 0), 0);
    const disabledAAVSum = disabledSet.reduce((s, c) => s + (Number(c.aav_value_usd) || 0), 0);
    const combinedAAV = activeAAVSum + disabledAAVSum || 1;

    // Call Math
    const totalCallsCount = calls.length;
    const answeredCount = calls.filter(c => c.call_outcome === 'Answer').length;
    const successfulWinbacks = calls.filter(c => c.response_outcome === 'Paid').length;
    const revenueSum = calls.filter(c => c.response_outcome === 'Paid')
      .reduce((s, c) => s + (Number(c.clients?.aav_value_usd) || 0), 0);

    // Global Outcomes for Charts
    const outcomeMap = { 
        Answer: answeredCount, 
        'Did not answer': calls.filter(c => c.call_outcome === 'Did not answer').length, 
        Busy: calls.filter(c => c.call_outcome === 'Busy').length, 
        Unreachable: calls.filter(c => c.call_outcome === 'Unreachable').length 
    };

    const responseMap = {
        Paid: successfulWinbacks,
        Promise: calls.filter(c => c.response_outcome === 'Promise to pay').length,
        NotInterested: calls.filter(c => c.response_outcome === 'Not interested').length,
        Equip: calls.filter(c => c.response_outcome === 'To collect equipment').length,
        Other: calls.filter(c => !['Paid', 'Promise to pay', 'Not interested', 'To collect equipment'].includes(c.response_outcome)).length
    };

    // Agent Specific Deep-Dive
    const uniqueAgentList = [...new Set(clients.map(c => c.retention_agent).filter(Boolean))];
    const agentDetailedBreakdown = uniqueAgentList.map(agent => {
        const agentClients = clients.filter(c => c.retention_agent === agent);
        const agentActive = agentClients.filter(c => c.account_status?.toLowerCase().trim() === 'active');
        const agentDisabled = agentClients.filter(c => c.account_status?.toLowerCase().trim() === 'disabled');
        
        const agentActiveAAV = agentActive.reduce((s, c) => s + (Number(c.aav_value_usd) || 0), 0);
        const agentDisabledAAV = agentDisabled.reduce((s, c) => s + (Number(c.aav_value_usd) || 0), 0);

        const agentCalls = calls.filter(c => c.agent_email === agent);
        const agentPaidCalls = agentCalls.filter(c => c.response_outcome === 'Paid').length;
        const agentRev = agentCalls.filter(c => c.response_outcome === 'Paid')
            .reduce((s, c) => s + (Number(c.clients?.aav_value_usd) || 0), 0);

        return {
            agentName: agent,
            shortName: agent.split('@')[0],
            aAAV: agentActiveAAV,
            dAAV: agentDisabledAAV,
            aCount: agentActive.length,
            dCount: agentDisabled.length,
            rev: agentRev,
            paid: agentPaidCalls,
            total: agentCalls.length,
            ans: agentCalls.filter(c => c.call_outcome === 'Answer').length,
            promise: agentCalls.filter(c => c.response_outcome === 'Promise to pay').length,
            notInt: agentCalls.filter(c => c.response_outcome === 'Not interested').length
        };
    }).sort((a, b) => b.rev - a.rev);

    return {
        totalUniverse,
        activeAcctCount: activeSet.length,
        disabledAcctCount: disabledSet.length,
        activeRevenue: activeAAVSum,
        disabledRevenue: disabledAAVSum,
        combinedAAV,
        totalCallsCount,
        answeredCount,
        successfulWinbacks,
        revenueSum,
        outcomeMap,
        responseMap,
        agentDetailedBreakdown
    };
  }, [callsRaw, clientsRaw]);

  // 4. CHART DATA FORMATTING
  // Portfolio Composition Data
  const portPieData = [
    { name: 'Active', value: analytics.activeAcctCount, fill: '#007bff' },
    { name: 'Disabled', value: analytics.disabledAcctCount, fill: '#e91e63' }
  ];

  // Call Outcomes Pie Data
  const outcomePieData = [
    { name: 'Answered', value: analytics.outcomeMap.Answer, fill: '#4caf50' },
    { name: 'No Ans', value: analytics.outcomeMap['Did not answer'], fill: '#ff9800' },
    { name: 'Busy', value: analytics.outcomeMap.Busy, fill: '#f44336' },
    { name: 'Unreach', value: analytics.outcomeMap.Unreachable, fill: '#9e9e9e' }
  ];

  // Behavior Bar Data
  const behaviorData = analytics.agentDetailedBreakdown.slice(0, 8).map(a => ({
    name: a.shortName,
    Paid: a.paid,
    Promise: a.promise,
    'No Int.': a.notInt
  }));

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#666' }}>Building Operations Dashboard...</div>;

  const portfolioHealthPct = (analytics.activeRevenue / analytics.combinedAAV * 100).toFixed(1);
  const contactRatePct = (analytics.answeredCount / (analytics.totalCallsCount || 1) * 100).toFixed(1);

  return (
    <div style={{ padding: '25px', backgroundColor: '#f9f9f9', minHeight: '100vh', color: '#2c3e50' }}>
      
      {/* SECTION: HEADER & FILTERS */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Strategic Managerial Command</h1>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <DateRangeFilter value={range} onChange={setRange} />
          {range === 'Custom' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ padding: '5px' }} />
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ padding: '5px' }} />
              <button onClick={runDataSync} style={{ padding: '5px 15px', cursor: 'pointer' }}>Apply</button>
            </div>
          )}
        </div>
      </header>

      {/* SECTION: KPI HIGHLIGHT CARDS (Row 1) */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card" style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
          <div className="stat-number">{analytics.totalUniverse}</div>
          <div className="stat-label">Total Accounts in System</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #007bff' }}>
          <div className="stat-number">${analytics.activeRevenue.toLocaleString()}</div>
          <div className="stat-label">Active Portfolio Value ({portfolioHealthPct}%)</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #e91e63' }}>
          <div className="stat-number">${analytics.disabledRevenue.toLocaleString()}</div>
          <div className="stat-label">At Risk (Disabled) Value</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #4caf50' }}>
          <div className="stat-number">${analytics.revenueSum.toLocaleString()}</div>
          <div className="stat-label">Revenue Recovered (Period)</div>
        </div>
      </div>

      {/* SECTION: KPI HIGHLIGHT CARDS (Row 2 - Strategy) */}
      <div className="stats-grid" style={{ marginBottom: '30px' }}>
        <div className="stat-card">
          <div className="stat-number">{analytics.activeAcctCount}</div>
          <div className="stat-label">Active Accounts ({((analytics.activeAcctCount / analytics.totalUniverse) * 100).toFixed(1)}%)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{analytics.disabledAcctCount}</div>
          <div className="stat-label">Disabled Accounts ({((analytics.disabledAcctCount / analytics.totalUniverse) * 100).toFixed(1)}%)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{contactRatePct}%</div>
          <div className="stat-label">Team Contact Success Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{analytics.successfulWinbacks}</div>
          <div className="stat-label">Successful Paid Winbacks</div>
        </div>
      </div>

      {/* SECTION: VISUAL INSIGHTS (Charts Row 1 - Main Trends) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '20px', marginBottom: '25px' }}>
        {/* CHART 1: Area Timeline */}
        <div className="card" style={{ height: '380px', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Daily Operational Volume</h3>
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={timelineData}>
              <defs><linearGradient id="opFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#007bff" stopOpacity={0.3}/><stop offset="95%" stopColor="#007bff" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickMargin={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#007bff" strokeWidth={3} fill="url(#opFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* CHART 2: Portfolio Donut */}
        <div className="card" style={{ height: '380px', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Portfolio Health Mix</h3>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={portPieData} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                {portPieData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* CHART 3: Outcomes Pie */}
        <div className="card" style={{ height: '380px', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Team Outcome Split</h3>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={outcomePieData} outerRadius={85} dataKey="value">
                {outcomePieData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION: VISUAL INSIGHTS (Charts Row 2 - Agent Comparisons) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
        {/* CHART 4: Revenue Leaderboard Bar */}
        <div className="card" style={{ height: '420px', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Agent Revenue Contribution (USD)</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={analytics.agentDetailedBreakdown.slice(0, 10)} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={10} />
              <YAxis type="category" dataKey="shortName" fontSize={10} />
              <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
              <Bar dataKey="rev" fill="#4caf50" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* CHART 5: Stacked Portfolio Bar */}
        <div className="card" style={{ height: '420px', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Agent Load: Active vs Churned Accts</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={analytics.agentDetailedBreakdown.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="shortName" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Legend />
              <Bar dataKey="aCount" name="Active" stackId="stack" fill="#007bff" />
              <Bar dataKey="dCount" name="Disabled" stackId="stack" fill="#e91e63" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION: VISUAL INSIGHTS (Charts Row 3 - Behavior & Quality) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '20px', marginBottom: '30px' }}>
        {/* CHART 6: Quality Radar */}
        <div className="card" style={{ height: '420px', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>AAV Portfolio Quality Radar</h3>
          <ResponsiveContainer width="100%" height="90%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={analytics.agentDetailedBreakdown.slice(0, 6)}>
              <PolarGrid />
              <PolarAngleAxis dataKey="shortName" fontSize={10} />
              <Radar name="Active AAV" dataKey="aAAV" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* CHART 7: Response Behavior Grouped Bar */}
        <div className="card" style={{ height: '420px', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Team Response Behavioral Split</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={behaviorData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Paid" fill="#4caf50" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Promise" fill="#ff9800" radius={[4, 4, 0, 0]} />
              <Bar dataKey="No Int." fill="#f44336" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CHART 8: STRATEGIC EFFICIENCY FUNNEL (Custom Visualization) */}
      <div className="card" style={{ padding: '30px', textAlign: 'center', marginBottom: '40px', borderRadius: '12px' }}>
        <h3>Operational Conversion Funnel</h3>
        <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '25px' }}>Visualizing the flow from Portfolio &rarr; Contact &rarr; Payment</p>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '2.2rem', fontWeight: 'bold' }}>{analytics.totalUniverse}</div>
            <div style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: '#e91e63', letterSpacing: '1px' }}>Potential Leads</div>
          </div>
          <div style={{ fontSize: '2rem', color: '#ddd' }}>▶</div>
          <div>
            <div style={{ fontSize: '2.2rem', fontWeight: 'bold' }}>{analytics.answeredCount}</div>
            <div style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: '#ff9800', letterSpacing: '1px' }}>Total Engagements</div>
          </div>
          <div style={{ fontSize: '2rem', color: '#ddd' }}>▶</div>
          <div>
            <div style={{ fontSize: '2.2rem', fontWeight: 'bold' }}>{analytics.successfulWinbacks}</div>
            <div style={{ textTransform: 'uppercase', fontSize: '0.7rem', color: '#4caf50', letterSpacing: '1px' }}>Recovered Revenue</div>
          </div>
        </div>
      </div>

      {/* SECTION: DETAILED ANALYTICS TABLES (Legacy Preservation) */}
      
      {/* TABLE 1: AGENT PORTFOLIO CONTRIBUTION */}
      <div className="table-container" style={{ marginBottom: '30px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <h3 style={{ padding: '20px' }}>Agent Portfolio Performance (% Impact)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', backgroundColor: '#fcfcfc', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '15px' }}>Agent Name</th>
                <th>Active AAV ($ | %)</th>
                <th>Disabled AAV ($ | %)</th>
                <th>Active Accts (# | %)</th>
                <th>Disabled Accts (# | %)</th>
              </tr>
            </thead>
            <tbody>
              {analytics.agentDetailedBreakdown.map(a => (
                <tr key={a.agentName} style={{ borderBottom: '1px solid #f1f1f1' }}>
                  <td style={{ padding: '15px', fontWeight: '600' }}>{a.agentName}</td>
                  <td>
                    <div style={{ fontWeight: '600' }}>${a.aAAV.toLocaleString()}</div>
                    <small style={{ color: '#007bff' }}>{((a.aAAV / analytics.activeRevenue) * 100 || 0).toFixed(1)}% Impact</small>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>${a.dAAV.toLocaleString()}</div>
                    <small style={{ color: '#e91e63' }}>{((a.dAAV / analytics.disabledRevenue) * 100 || 0).toFixed(1)}% Impact</small>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>{a.aCount}</div>
                    <small>{((a.aCount / analytics.activeAcctCount) * 100 || 0).toFixed(1)}% Volume</small>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>{a.dCount}</div>
                    <small>{((a.dCount / analytics.disabledAcctCount) * 100 || 0).toFixed(1)}% Volume</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLE 2: WINBACK LEADERBOARD */}
      <div className="table-container" style={{ marginBottom: '30px' }}>
        <h3 style={{ padding: '20px' }}>Revenue Performance Leaderboard</h3>
        <table>
          <thead>
            <tr><th>Agent Identity</th><th>Total Wins</th><th>Calculated Revenue Impact</th></tr>
          </thead>
          <tbody>
            {agentLeaderboard.length === 0 ? <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px' }}>No revenue data for this filter</td></tr> :
              agentLeaderboard.map(a => (
                <tr key={a.email}><td>{a.email}</td><td>{a.wins} Units</td><td>${a.revenue.toLocaleString()} USD</td></tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* TABLE 3: OPERATIONAL OUTCOMES */}
      <div className="table-container" style={{ marginBottom: '30px' }}>
        <h3 style={{ padding: '20px' }}>Call Outcome Performance by Agent</h3>
        <table>
          <thead>
            <tr><th>Agent</th><th>Total Attempts</th><th>Successful Answers</th><th>Non-Answers</th><th>Busy/Unreachable</th></tr>
          </thead>
          <tbody>
            {analytics.agentDetailedBreakdown.map(a => (
              <tr key={a.agentName}>
                <td>{a.agentName}</td><td>{a.total} Calls</td><td>{a.ans}</td><td>{a.total - a.ans}</td><td>-</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TABLE 4: RESPONSE OUTCOMES (FINAL) */}
      <div className="table-container" style={{ marginBottom: '60px' }}>
        <h3 style={{ padding: '20px' }}>Strategic Behavioral Outcome Summary</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '800px' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>Agent</th><th>Paid</th><th>Promise to Pay</th><th>Not Interested</th><th>Equipment Recovery</th>
              </tr>
            </thead>
            <tbody>
              {analytics.agentDetailedBreakdown.map(a => (
                <tr key={a.agentName} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '15px' }}>{a.agentName}</td>
                  <td>{a.paid}</td><td>{a.promise}</td><td>{a.notInt}</td><td>-</td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td style={{ padding: '15px' }}>SYSTEM AGGREGATE</td>
                <td>{analytics.responseMap.Paid}</td>
                <td>{analytics.responseMap.Promise}</td>
                <td>{analytics.responseMap.NotInterested}</td>
                <td>{analytics.responseMap.Equip}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}