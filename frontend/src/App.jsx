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
  const [projectSearch, setProjectSearch] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
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

  const loadProjects = async () => {
    const rows = await api('/api/projects', { headers: {} });
    setProjects(rows);
    return rows;
  };
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
      if (window.location.pathname === '/') { go('/console'); return; }
      if (view === 'create' && list.length >= 3) { go('/console'); return; }
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
    if (projects.length >= 3) return notify('Maximum 3 projects allowed for now', 'error');
    const p = await api('/api/projects', { method: 'POST', body: { name: projectName }, headers: {} });
    setProjectName('');
    await loadProjects();
    go(`/console/${p.slug}/overview`);
  };

  const selectedProject = projects.find((p) => p.slug === projectSlug || p.id === projectSlug);
  const filteredProjects = projects.filter((p) => `${p.name} ${p.slug} ${p.id}`.toLowerCase().includes(projectSearch.toLowerCase()));
  const expectedDeleteText = projectToDelete ? `sudo delete ${projectToDelete.id}` : '';
  const canDeleteProject = projectToDelete && deleteConfirm.trim() === expectedDeleteText;

  const deleteProject = async () => {
    if (!canDeleteProject || !projectToDelete) return;
    await api(`/api/projects/${encodeURIComponent(projectToDelete.id)}`, { method: 'DELETE', headers: {} });
    setDeleteConfirm('');
    setProjectToDelete(null);
    notify('Project deleted');
    const ps = await loadProjects();
    if (!ps.length) go('/console/new'); else go('/console');
  };

  if (view === 'create') {
    return <div className='page active'><div style={{ maxWidth: 620, margin: '60px auto' }}><div className='card'><div className='card-title' style={{ marginBottom: 10 }}>Create Project</div><div className='field'><label>Project Name</label><input value={projectName} onChange={(e)=>setProjectName(e.target.value)} placeholder='Acme Production' /></div><div style={{fontSize:12,color:'var(--muted)',marginTop:8}}>Project ID is auto-generated (example: project-m2zpicks).</div><div className='modal-footer'><button className='btn btn-primary' onClick={createProject}>Create Project</button></div></div></div><div className={`notif ${notif.show ? 'show' : ''} ${notif.type}`}>{notif.msg}</div></div>;
  }

  if (view === 'select' || !projectSlug) {
    return <div className='page active'><div style={{ maxWidth: 980, margin: '26px auto' }}>
      <div className='card' style={{padding:'14px 16px'}}>
        <div className='projects-toolbar'>
          <input className='projects-search' value={projectSearch} onChange={(e)=>setProjectSearch(e.target.value)} placeholder='Search by name, label, or ID' />
          <button className='btn btn-primary' disabled={projects.length>=3} onClick={()=>go('/console/new')}>+ Create project</button>
        </div>
      </div>
      <div className='card projects-banner'>
        <div>
          <div className='card-title'>Your Free plan includes up to 3 projects and limited resources.</div>
          <button className='btn btn-ghost btn-sm' style={{marginTop:8}}>Upgrade to Pro</button>
        </div>
      </div>
      <div className='card' style={{padding:'14px 16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <div><div className='card-title'>Projects Console</div><div className='card-sub'>Choose your workspace to continue</div></div>
          <div style={{fontSize:12,color:'var(--muted)'}}>Total: {projects.length} / 3 projects</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12}}>
        {filteredProjects.map((p)=><button key={p.id} className='card project-card' onClick={()=>go(`/console/${p.slug}/overview`)} style={{textAlign:'left'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
            <div style={{fontWeight:700,fontSize:20,color:'var(--text)'}}>{p.name}</div>
            <span className={`badge ${p.status==='active'?'active':'paused'}`}>{p.status}</span>
          </div>
          <div style={{marginTop:8,color:'var(--muted)',fontSize:12}}>{p.slug}</div>
          <div style={{marginTop:18,fontSize:12,color:'var(--dim)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
            <span>Created {fmtDate(p.created_at)}</span>
            <span className='project-delete' onClick={(e)=>{e.stopPropagation(); setProjectToDelete(p); setDeleteConfirm('');}}>🗑️</span>
          </div>
        </button>)}
      </div>
      <div className={`modal-backdrop ${projectToDelete ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setProjectToDelete(null)}>
        <div className='modal'>
          <div className='modal-title'>Delete project</div>
          <div className='danger-box'>
            This action is irreversible all the things related to this projects will be deleted and issued keys will stop working.
          </div>
          <div className='field' style={{marginTop:12}}>
            <label>Type "{expectedDeleteText}" to continue</label>
            <input value={deleteConfirm} onChange={(e)=>setDeleteConfirm(e.target.value)} />
          </div>
          <div className='modal-footer'>
            <button className='btn btn-ghost' onClick={()=>setProjectToDelete(null)}>Cancel</button>
            <button className='btn btn-danger' disabled={!canDeleteProject} onClick={deleteProject}>Delete project</button>
          </div>
        </div>
      </div>
      <div className={`notif ${notif.show ? 'show' : ''} ${notif.type}`}>{notif.msg}</div>
    </div></div>;
  }

  return <>
    <div className='app'>
      <Sidebar page={page} navigate={navigate} onBackToConsole={() => go('/console')} />
      <main className='main'>
        <div className='console-header'>
          <div>
            <div className='console-title'>{selectedProject?.name || 'Project'}</div>
            <div className='console-sub'>{selectedProject?.slug || projectSlug}</div>
          </div>
          <button className='btn btn-ghost btn-sm' onClick={() => go('/console')}>Switch project</button>
        </div>
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
