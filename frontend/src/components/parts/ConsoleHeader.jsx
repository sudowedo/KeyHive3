export default function ConsoleHeader({ page, selectedProject, projectSlug, onSwitchProject, onOpenMobileMenu, onOpenNotifications, mobileMenuOpen = false }) {
  const pageTitle = String(page || 'overview').replace(/^./, (m) => m.toUpperCase());

  return <header className='console-header app-shell-header'>
    <div className='app-shell-desktop'>
      <div className='logo app-shell-logo'>
        <div className='logo-mark'>
          <div className='logo-icon'>▦</div>
          <div>
            <div className='logo-name'>KeyGate</div>
            <div className='logo-sub'>API access manager</div>
          </div>
        </div>
      </div>
      <div className='app-shell-project'>
        <div className='console-title'>{selectedProject?.name || 'Project'} • {pageTitle}</div>
        <div className='console-sub'>{selectedProject?.slug || projectSlug} · API Access Manager</div>
      </div>
      <button className='btn btn-ghost btn-sm app-shell-switch' onClick={onSwitchProject}>Switch project</button>
    </div>

    <div className='mobile-appbar app-shell-mobile'>
      <button className={`mobile-icon-btn mobile-menu-toggle ${mobileMenuOpen ? 'active' : ''}`} onClick={onOpenMobileMenu} aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? '×' : '☰'}</button>
      <div>
        <div className='mobile-brand'>KeyGate</div>
        <div className='mobile-shell-sub'>{pageTitle}</div>
      </div>
      <div className='mobile-appbar-actions'>
        <button className='mobile-icon-btn' onClick={onOpenNotifications} aria-label='Notifications'>🔔</button>
        <button className='mobile-avatar' onClick={onSwitchProject} aria-label='Back to console'>A</button>
      </div>
    </div>
  </header>;
}
