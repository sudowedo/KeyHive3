import { useState } from 'react';

const items = [
  ['overview', 'Overview', '🏠'],
  ['masterkeys', 'Master keys', '🔑'],
  ['subkeys', 'Subkeys', '🧩'],
  ['logs', 'Request logs', '📄'],
  ['demo', 'Live demo', '📊'],
  ['notifications', 'Notifications', '🔔'],
];

export default function Sidebar({ page, navigate, onBackToConsole }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const go = (next) => {
    navigate(next);
    setDrawerOpen(false);
  };

  return <>
    <header className='mobile-appbar'>
      <button className='mobile-icon-btn' onClick={() => setDrawerOpen(true)} aria-label='Open menu'>☰</button>
      <div className='mobile-brand'>KeyGate</div>
      <div className='mobile-appbar-actions'>
        <button className='mobile-icon-btn' onClick={() => go('notifications')} aria-label='Notifications'>🔔</button>
        <button className='mobile-avatar' aria-label='Profile'>A</button>
      </div>
    </header>

    <aside className='sidebar'>
      <div className='logo'><div className='logo-mark'><div className='logo-icon'>▦</div><div><div className='logo-name'>KeyGate</div><div className='logo-sub'>API access manager</div></div></div></div>
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
