const items = [
  ['overview', 'Overview', '🏠'],
  ['masterkeys', 'Master keys', '🔑'],
  ['subkeys', 'Subkeys', '🧩'],
  ['logs', 'Request logs', '📄'],
  ['demo', 'Live demo', '📊'],
  ['health', 'Health', '🩺'],
  ['notifications', 'Notifications', '🔔'],
];

export default function Sidebar({ page, navigate, onBackToConsole, drawerOpen, setDrawerOpen }) {

  const go = (next) => {
    navigate(next);
    setDrawerOpen(false);
  };

  return <>
    <aside className='sidebar'>
      <nav className='nav'>
        <div className='nav-label'>Platform</div>
        {onBackToConsole && <button className='nav-item' onClick={onBackToConsole}>← Back to console</button>}
        {items.map(([k, l]) => <button key={k} className={`nav-item ${page === k ? 'active' : ''}`} onClick={() => navigate(k)}>{l}{k === 'demo' && <span className='nav-dot' />}</button>)}
      </nav>
      <div className='sidebar-footer'><div className='api-url-box'><div className='api-url-label'>Proxy endpoint</div><div className='api-url'>localhost:3001</div></div></div>
    </aside>

    <div className={`mobile-drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setDrawerOpen(false)}>
      <aside className='mobile-drawer'>
        <div className='mobile-drawer-title'>KeyGate</div>
        <div className='mobile-drawer-list'>
          {items.map(([k, l]) => <button key={k} className={`mobile-drawer-item ${page === k ? 'active' : ''}`} onClick={() => go(k)}>{l}</button>)}
        </div>
        <div className='mobile-drawer-footer'>localhost:3001</div>
      </aside>
    </div>

    <nav className='mobile-tabbar' aria-label='Mobile navigation'>
      {items.slice(0, 5).map(([k, l, icon]) => <button key={k} className={`mobile-tab ${page === k ? 'active' : ''}`} onClick={() => go(k)}><span>{icon}</span><span>{l.split(' ')[0]}</span></button>)}
    </nav>
  </>;
}
