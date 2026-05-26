import { useEffect, useState } from 'react';

export default function HealthPage({ ctx }) {
  const { api } = ctx;
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api('/api/health').then(setRows).catch(() => setRows([]));
  }, []);

  const bars = rows.slice(-90);
  const colorFor = (r) => (r.internal_ok ? '#2dca72' : (r.db_ok || r.redis_ok ? '#ffb547' : '#ff5252'));
  const upDays = bars.filter((r) => r.internal_ok).length;
  const pct = bars.length ? ((upDays / bars.length) * 100).toFixed(2) : '0.00';

  return <div className='page active'><div style={{ padding: '32px 36px' }}>
    <div className='page-header'><div className='page-title'>System Health</div><div className='page-sub'>Public status page for internal server, database, and redis.</div></div>
    <div className='card'>
      <div className='card-title' style={{marginBottom:10}}>Uptime over last 90 days ({pct}%)</div>
      <div style={{display:'flex',gap:12,marginBottom:12,fontSize:12,color:'var(--muted)'}}>
        <span><span style={{display:'inline-block',width:10,height:10,background:'#2dca72',borderRadius:2,marginRight:6}} />Operational</span>
        <span><span style={{display:'inline-block',width:10,height:10,background:'#ffb547',borderRadius:2,marginRight:6}} />Degraded</span>
        <span><span style={{display:'inline-block',width:10,height:10,background:'#ff5252',borderRadius:2,marginRight:6}} />Down</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(90,1fr)',gap:3}}>
        {bars.map((r, i) => <div key={i} title={`${r.day}\nInternal: ${r.internal_ok ? 'OK' : 'FAIL'}\nDB: ${r.db_ok ? 'OK' : 'FAIL'}\nRedis: ${r.redis_ok ? 'OK' : 'FAIL'}\nDetails: ${JSON.stringify(r.details || {})}`} style={{height:28, borderRadius:3, background:colorFor(r)}} />)}
      </div>
    </div>
  </div></div>;
}
