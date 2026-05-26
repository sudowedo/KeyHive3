import { useEffect, useState } from 'react';

export default function HealthPage({ ctx }) {
  const { api } = ctx;
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api('/api/health').then(setRows).catch(() => setRows([]));
  }, []);

  const bars = rows.slice(-90);
  const colorFor = (r) => (r.internal_ok ? '#2dca72' : (r.db_ok || r.redis_ok ? '#ffb547' : '#ff5252'));

  return <div className='page active'><div style={{ padding: '32px 36px' }}>
    <div className='page-header'><div className='page-title'>System Health</div><div className='page-sub'>Public status page for internal server, database, and redis.</div></div>
    <div className='card'>
      <div className='card-title' style={{marginBottom:10}}>Uptime over last 90 days</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(90,1fr)',gap:3}}>
        {bars.map((r, i) => <div key={i} title={`${r.day}: internal=${r.internal_ok}, db=${r.db_ok}, redis=${r.redis_ok}`} style={{height:28, borderRadius:3, background:colorFor(r)}} />)}
      </div>
    </div>
  </div></div>;
}
