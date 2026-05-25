import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/parts/Sidebar';
import OverviewPage from './components/pages/OverviewPage';
import MasterKeysPage from './components/pages/MasterKeysPage';
import SubkeysPage from './components/pages/SubkeysPage';
import LogsPage from './components/pages/LogsPage';
import DemoPage from './components/pages/DemoPage';
import NotificationsPage from './components/pages/NotificationsPage';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const fmtNum = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));
const fmtTime = (ts) => (!ts ? '—' : new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
const fmtDate = (ts) => (!ts ? 'Never' : new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }));
const quotaColor = (used, limit) => (((used / limit) * 100 > 90) ? 'over' : ((used / limit) * 100 > 70) ? 'warn' : 'ok');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [page, setPage] = useState('overview');
  const [view, setView] = useState('select'); // select | create | console
  const [projects, setProjects] = useState([]);
  const [projectSlug, setProjectSlug] = useState('');
  const [projectName, setProjectName] = useState('');
  const [subkeys, setSubkeys] = useState([]);
  const [masterKeys, setMasterKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState({ totalRequests: 0, totalTokens: 0, avgLatency: '—', logs: [] });
  const [notif, setNotif] = useState({ show: false, msg: '', type: 'success' });
  const [modal, setModal] = useState('');
  const [revealedToken, setRevealedToken] = useState('—');

  const notify = (msg, type = 'success') => { setNotif({ show: true, msg, type }); setTimeout(() => setNotif((v) => ({ ...v, show: false })), 3000); };
  const copyText = (text) => navigator.clipboard.writeText(text).then(() => notify('Copied to clipboard'));

  const api = async (path, opts = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(projectSlug ? { 'x-project-id': projectSlug } : {}), ...opts.headers };
    const res = await fetch(API + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
    return data;
  };

  const loadProjects = async () => setProjects(await api('/api/projects', { headers: {} }));
  const loadOverview = async () => { const [sks, an] = await Promise.all([api('/api/subkeys'), api('/api/analytics')]); setSubkeys(sks); setLogs(an.logs || []); setAnalytics(an); };
  const loadMasterKeys = async () => setMasterKeys(await api('/api/master-keys'));
  const loadSubkeys = async () => setSubkeys(await api('/api/subkeys'));
  const loadLogs = async () => { const an = await api('/api/analytics'); setLogs(an.logs || []); setAnalytics(an); };

  const go = (path) => { window.history.pushState({}, '', path); parsePath(); };
  const parsePath = () => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'console') return go('/console');
    if (!parts[1]) { setView('select'); setProjectSlug(''); setPage('overview'); return; }
    if (parts[1] === 'new') { setView('create'); setProjectSlug(''); setPage('overview'); return; }
    setView('console');
    setProjectSlug(parts[1]);
    setPage(parts[2] || 'overview');
  };

  useEffect(() => { const h = () => parsePath(); window.addEventListener('popstate', h); parsePath(); return () => window.removeEventListener('popstate', h); }, []);
  useEffect(() => {
    loadProjects().then((ps) => {
      const list = ps || [];
      if (!list.length) {
        if (view !== 'create') go('/console/new');
        return;
      }
      if (window.location.pathname === '/' || view === 'create') { go('/console'); return; }
      if (projectSlug && !list.find((p) => p.slug === projectSlug || p.id === projectSlug)) {
        notify('Project not found', 'error');
        go('/console');
      }
    }).catch((e) => notify(e.message, 'error'));
  }, [projectSlug, view]);

  useEffect(() => {
    if (!projectSlug || view !== 'console') return;
    if (page === 'overview') loadOverview().catch((e) => notify(e.message, 'error'));
    if (page === 'masterkeys') loadMasterKeys().catch((e) => notify(e.message, 'error'));
    if (page === 'subkeys') loadSubkeys().catch((e) => notify(e.message, 'error'));
    if (page === 'logs') loadLogs().catch((e) => notify(e.message, 'error'));
    if (page === 'demo' || page === 'notifications') loadSubkeys().catch((e) => notify(e.message, 'error'));
  }, [page, projectSlug]);

  const navigate = async (p) => go(`/console/${projectSlug}/${p}`);

  const ctx = useMemo(() => ({ API, fmtNum, fmtTime, fmtDate, quotaColor, sleep, api, notify, copyText, modal, setModal, revealedToken, setRevealedToken, loadMasterKeys, loadSubkeys, loadLogs, loadOverview, subkeys, setSubkeys, masterKeys, logs, analytics, page }), [modal, subkeys, masterKeys, logs, analytics, revealedToken, page, projectSlug]);

  const createProject = async () => {
    const p = await api('/api/projects', { method: 'POST', body: { name: projectName }, headers: {} });
    setProjectName('');
    await loadProjects();
    go(`/console/${p.slug}/overview`);
  };

  const selectedProject = projects.find((p) => p.slug === projectSlug || p.id === projectSlug);

  if (view === 'create') {
    return <div className='page active'><div style={{ maxWidth: 620, margin: '60px auto' }}><div className='card'><div className='card-title' style={{ marginBottom: 10 }}>Create Project</div><div className='field'><label>Project Name</label><input value={projectName} onChange={(e)=>setProjectName(e.target.value)} placeholder='Acme Production' /></div><div style={{fontSize:12,color:'var(--muted)',marginTop:8}}>Project ID is auto-generated (example: project-m2zpicks).</div><div className='modal-footer'><button className='btn btn-primary' onClick={createProject}>Create Project</button></div></div></div><div className={`notif ${notif.show ? 'show' : ''} ${notif.type}`}>{notif.msg}</div></div>;
  }

  if (view === 'select' || !projectSlug) {
    return <div className='page active'><div style={{ maxWidth: 760, margin: '40px auto' }}><div className='card'><div className='card-title' style={{ marginBottom: 12 }}>Select Project</div><div style={{display:'grid',gap:10}}>{projects.map((p)=><button key={p.id} className='btn btn-ghost' style={{justifyContent:'space-between'}} onClick={()=>go(`/console/${p.slug}/overview`)}><span>{p.name} <span style={{color:'var(--muted)',fontSize:12}}>({p.slug})</span></span><span style={{fontSize:12,color:p.status==='active'?'var(--green)':'var(--amber)'}}>{p.status}</span></button>)}</div>{projects.length<2 && <div className='modal-footer'><button className='btn btn-primary' onClick={()=>go('/console/new')}>+ New Project</button></div>}</div></div><div className={`notif ${notif.show ? 'show' : ''} ${notif.type}`}>{notif.msg}</div></div>;
  }

  return <>
    <div className='app'>
      <Sidebar page={page} navigate={navigate} />
      <main className='main'>
        <div style={{padding:'10px 22px',fontSize:12,color:'var(--muted)'}}>Project: <b style={{color:'var(--text)'}}>{selectedProject?.name || projectSlug}</b> ({selectedProject?.slug || projectSlug})</div>
        <div key={page} className='page-transition'>
          {page === 'overview' && <OverviewPage navigate={navigate} ctx={ctx} />}
          {page === 'masterkeys' && <MasterKeysPage ctx={ctx} />}
          {page === 'subkeys' && <SubkeysPage ctx={ctx} />}
          {page === 'logs' && <LogsPage ctx={ctx} />}
          {page === 'demo' && <DemoPage ctx={ctx} />}
          {page === 'notifications' && <NotificationsPage ctx={ctx} />}
        </div>
      </main>
    </div>
    <div className={`notif ${notif.show ? 'show' : ''} ${notif.type}`}>{notif.msg}</div>
  </>;
}
