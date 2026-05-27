import { useMemo, useState } from 'react';
import '../styles/LogsPage.css';

export default function LogsPage({ ctx }) {
  const { logs, fmtNum, fmtTime } = ctx;
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = useMemo(() => logs.slice((safePage - 1) * pageSize, safePage * pageSize), [logs, safePage]);
  const sourceCounts = logs.reduce((a, l) => { const k = l.source || 'external'; a[k] = (a[k] || 0) + 1; return a; }, {});

  return <div className='page active'><div style={{ padding: '32px 36px' }}><div className='page-header'><div className='page-title'>Request logs</div><div className='page-sub'>Every request proxied through KeyGate</div></div>
    <div className='card'><div className='card-header'><div className='card-title'>Source breakdown</div></div><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{Object.entries(sourceCounts).map(([k, v]) => <span key={k} className='badge active'>{k}: {v}</span>)}</div></div>
    <div className='card mobile-hide-table' style={{ padding: 0 }}><div className='table-wrap'><table><thead><tr><th>Time</th><th>Subkey</th><th>Model</th><th>Tokens</th><th>Latency</th><th>Status</th><th>Source</th></tr></thead><tbody>{pagedLogs.length ? pagedLogs.map((l, i) => <tr key={i}><td className='mono' style={{ color: 'var(--dim)' }}>{fmtTime(l.created_at)}</td><td style={{ fontWeight: 500 }}>{l.subkey_name || '—'}</td><td className='mono' style={{ fontSize: '12px' }}>{l.model || '—'}</td><td className='mono'>{fmtNum(l.tokens_used)}</td><td className='mono' style={{ color: 'var(--muted)' }}>{l.latency_ms ? `${l.latency_ms}ms` : '—'}</td><td style={{ fontSize: '12px', fontWeight: 500 }}>{l.status}</td><td className='mono'>{l.source || 'external'}</td></tr>) : <tr><td colSpan='7' style={{ textAlign: 'center', color: 'var(--dim)', padding: '32px' }}>No requests yet</td></tr>}</tbody></table></div></div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:10,flexWrap:'wrap'}}>
      <div className='mono' style={{color:'var(--muted)'}}>Page {safePage} / {totalPages} · showing up to 30 logs</div>
      <div style={{display:'flex',gap:8}}>
        <button className='btn btn-sm btn-ghost' disabled={safePage<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))}>Previous</button>
        <button className='btn btn-sm btn-ghost' disabled={safePage>=totalPages} onClick={()=>setPage((p)=>Math.min(totalPages,p+1))}>Next</button>
      </div>
    </div>
    <div className='mobile-log-cards'>{pagedLogs.map((l, i) => <div key={i} className='card'><div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><strong>{l.subkey_name || '—'}</strong><span className='mono'>{fmtTime(l.created_at)}</span></div><div className='mono' style={{ marginTop: '6px', color: 'var(--muted)' }}>{l.model || '—'}</div><div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}><span>{fmtNum(l.tokens_used)} tokens</span><span>{l.latency_ms ? `${l.latency_ms}ms` : '—'}</span></div><div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}><span className='badge active'>{l.source || 'external'}</span><span className='mono'>{l.status}</span></div></div>)}</div>
  </div></div>;
}
