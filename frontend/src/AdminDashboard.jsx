import React, { useMemo, useState } from 'react';
import './admin.css';

const initialProducts = [
  { id: 'CS-001', name: 'Control Pro Indoor', category: 'Footwear', price: 289, stock: 18, status: 'Active' },
  { id: 'CS-002', name: 'Matchday Futsal Ball', category: 'Balls', price: 89, stock: 7, status: 'Active' },
  { id: 'CS-003', name: 'Court Grip Socks', category: 'Apparel', price: 39, stock: 3, status: 'Low stock' },
  { id: 'CS-004', name: 'Everyday Training Tee', category: 'Apparel', price: 79, stock: 0, status: 'Out of stock' },
  { id: 'CS-005', name: 'Quick Touch Shin Guards', category: 'Accessories', price: 55, stock: 12, status: 'Active' },
];
const initialOrders = [
  { id: 'CS-1048', customer: 'Mia Rahman', date: '15 Nov 2026', total: 378, status: 'Processing', items: 2 },
  { id: 'CS-1047', customer: 'Daniel Wong', date: '15 Nov 2026', total: 89, status: 'New', items: 1 },
  { id: 'CS-1046', customer: 'Sofia Lim', date: '14 Nov 2026', total: 328, status: 'Ready to ship', items: 2 },
  { id: 'CS-1045', customer: 'Irfan Aziz', date: '14 Nov 2026', total: 79, status: 'Delivered', items: 1 },
];
const navByRole = {
  manager: [['Overview', '◫'], ['Orders', '↗'], ['Products', '◇'], ['Inventory', '▤']],
  administrator: [['Overview', '◫'], ['Orders', '↗'], ['Products', '◇'], ['Inventory', '▤'], ['Staff & roles', '♧'], ['Settings', '⚙']],
};
const currency = value => `RM ${Number(value).toFixed(2)}`;

export default function AdminDashboard({ user, sessionLoading = false, onLogin, onLogout, onExit }) {
  const [section, setSection] = useState('Overview');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  const filteredProducts = useMemo(() => products.filter(p => `${p.name} ${p.category} ${p.id}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  const filteredOrders = useMemo(() => orders.filter(o => `${o.id} ${o.customer} ${o.status}`.toLowerCase().includes(search.toLowerCase())), [orders, search]);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5).length;

  async function signIn(event) {
    event.preventDefault();
    setLoginError('');
    try {
      const found = await onLogin(email.trim(), password);
      if (!['manager', 'administrator'].includes(found.role)) throw new Error('This account is not assigned a manager or administrator role.');
      setSection('Overview');
    } catch (error) { setLoginError(error.message || 'We could not verify those staff credentials. Check your email and password.'); }
  }
  function signOut() { setEmail(''); setPassword(''); setSearch(''); onLogout(); }
  function showToast(message) { setToast(message); window.setTimeout(() => setToast(''), 2600); }
  function adjustStock(id, amount) {
    setProducts(old => old.map(p => p.id === id ? { ...p, stock: Math.max(0, p.stock + amount), status: p.stock + amount === 0 ? 'Out of stock' : p.stock + amount <= 5 ? 'Low stock' : 'Active' } : p));
  }
  function advanceOrder(id) {
    const steps = role === 'administrator' ? ['New', 'Processing', 'Ready to ship', 'Shipped', 'Delivered'] : ['New', 'Processing', 'Ready to ship', 'Shipped'];
    setOrders(old => old.map(order => {
      if (order.id !== id) return order;
      const next = steps[Math.min(steps.indexOf(order.status) + 1, steps.length - 1)];
      return { ...order, status: next };
    }));
    showToast(`Order ${id} updated`);
  }
  function exportReport() {
    const csv = ['Order,Customer,Date,Items,Total,Status', ...orders.map(o => `${o.id},${o.customer},${o.date},${o.items},${o.total},${o.status}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'court-supply-orders.csv'; link.click(); URL.revokeObjectURL(url);
    showToast('Orders report downloaded');
  }

  if (sessionLoading) return <div className="staff-login-page"><div className="staff-login-card"><a className="staff-brand">◈ COURT<span>SUPPLY</span></a><p className="staff-kicker">TEAM ACCESS</p><h1>Checking your<br/>staff session…</h1></div></div>;
  if (!user) return <div className="staff-login-page">
    <button className="staff-back" onClick={onExit}>← Back to storefront</button>
    <section className="staff-login-card">
      <a className="staff-brand" href="/" onClick={e => { e.preventDefault(); onExit(); }}>◈ COURT<span>SUPPLY</span></a>
      <p className="staff-kicker">TEAM ACCESS</p><h1>Store operations,<br/>all in one place.</h1>
      <p className="staff-lead">Sign in with your assigned staff account to continue.</p>
      <form onSubmit={signIn}>
        <label>Work email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@yourstore.com"/></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password"/></label>
        {loginError && <p className="staff-login-error" role="alert">{loginError}</p>}
        <button className="staff-login-submit">Sign in to dashboard <span>↗</span></button>
      </form>
      <div className="demo-accounts"><strong>Staff access</strong><p>Use the work account created for your manager or administrator role.</p><p>Customer accounts cannot access this dashboard.</p></div>
      <p className="staff-demo-note">Role and credentials are verified by the store authentication service. Dashboard operations shown here are a UI preview.</p>
    </section><div className="staff-login-art"><span>YOUR STORE.<br/>IN PLAY.</span><b>⚽</b></div>
  </div>;

  const role = user.role;
  if (!['manager', 'administrator'].includes(role)) return <div className="staff-login-page"><section className="staff-login-card"><a className="staff-brand">◈ COURT<span>SUPPLY</span></a><p className="staff-kicker">ACCESS RESTRICTED</p><h1>This area is for<br/>store staff.</h1><p className="staff-lead">Your account does not have manager or administrator access.</p><button className="staff-login-submit" onClick={onLogout}>Sign in with another account</button><button className="staff-back" onClick={onExit}>← Return to storefront</button></section></div>;
  const admin = role === 'administrator';
  return <div className={`admin-shell ${admin ? 'role-administrator' : 'role-manager'}`}>
    <aside className="admin-sidebar">
      <a className="admin-brand" href="/" onClick={e => { e.preventDefault(); onExit(); }}>◈ COURT<span>SUPPLY</span></a>
      <div className="admin-workspace"><span className="workspace-mark">C</span><span><strong>{admin ? 'Store administration' : 'Daily operations'}</strong><small>{admin ? 'Full store access' : 'Manager workspace'}</small></span><b>⌄</b></div>
      <p className="admin-nav-label">WORKSPACE</p>
      <nav className="admin-nav">{navByRole[role].map(([label, icon]) => <button key={label} className={section === label ? 'selected' : ''} onClick={() => { setSection(label); setSearch(''); }}><span>{icon}</span>{label}{label === 'Orders' && <i>4</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="demo-pill"><span/> DEMO DATA</div><button className="store-link" onClick={onExit}>↗ <span>View storefront</span></button><small>Store dashboard · UI preview</small></div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar"><div className="breadcrumb">Store / <strong>{section}</strong></div><div className="topbar-actions"><span className="today-label">{new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' }).format(new Date())}</span><button className="topbar-icon" aria-label="Notifications" onClick={() => showToast('You are all caught up')}>♧<i/></button><button className="staff-profile" onClick={signOut}><span className="profile-avatar">{user.full_name.split(' ').map(n => n[0]).join('')}</span><span><strong>{user.full_name}</strong><small>{admin ? 'Administrator' : 'Store manager'}</small></span><b>⌄</b></button></div></header>
      <main className="admin-content">
        <div className="admin-page-heading"><div><p className="staff-kicker">{admin ? 'ADMINISTRATOR WORKSPACE' : 'MANAGER WORKSPACE'}</p><h1>{section === 'Overview' ? `Welcome back, ${user.full_name.split(' ')[0]}.` : section}</h1><p>{section === 'Overview' ? (admin ? 'Here’s what’s happening across your store.' : 'Your store operations at a glance.') : `Review and manage your store ${section.toLowerCase()}.`}</p></div>{section === 'Orders' && admin && <button className="outline-action" onClick={exportReport}>↓ Export report</button>}</div>
        {section === 'Overview' && <>
          <div className="dashboard-cards"><Metric label="Gross sales" value="RM 4,286.00" note="↑ 12.8%" detail="compared with last month" icon="↗"/><Metric label="Orders" value="38" note="↑ 8.2%" detail="compared with last month" icon="▤"/><Metric label="Products" value={products.length} note={`${lowStock} need attention`} detail="active catalog items" icon="◇"/><Metric label={admin ? 'Team members' : 'Open orders'} value={admin ? '6' : orders.filter(o => !['Delivered', 'Shipped'].includes(o.status)).length} note={admin ? '4 managers · 2 admins' : 'Across 3 order stages'} detail={admin ? 'with store access' : 'ready for your review'} icon={admin ? '♧' : '◷'}/></div>
          <div className="overview-grid"><section className="panel sales-panel"><PanelHeader title="Sales overview" subtitle="Store performance · Last 7 days" action="Last 7 days⌄"/><div className="chart-summary"><strong>RM 2,840.00</strong><span>↑ 9.4% <small>vs previous week</small></span></div><SalesChart/></section><section className="panel stock-panel"><PanelHeader title="Inventory to watch" subtitle={`${lowStock} products need attention`} action="View inventory →" onAction={() => setSection('Inventory')}/>{products.filter(p => p.stock <= 5).map(p => <div className="stock-row" key={p.id}><span className="stock-product-icon">{p.category === 'Footwear' ? '👟' : p.category === 'Balls' ? '⚽' : '◈'}</span><span className="stock-product-name"><strong>{p.name}</strong><small>{p.id} · {p.category}</small></span><span className={p.stock === 0 ? 'stock-zero' : 'stock-low'}>{p.stock === 0 ? 'Out of stock' : `${p.stock} left`}</span></div>)}</section></div>
          <section className="panel recent-panel"><PanelHeader title="Recent orders" subtitle="The latest activity from your customers" action="View all orders →" onAction={() => setSection('Orders')}/><OrderTable orders={orders.slice(0, 4)} onAdvance={advanceOrder} role={role}/></section>
          {admin && <section className="admin-tip"><span>✦</span><p><strong>Administrator access</strong><br/>You can manage team access and store-wide settings from the sidebar.</p><button onClick={() => setSection('Staff & roles')}>Manage staff →</button></section>}
        </>}
        {section === 'Orders' && <section className="panel table-panel"><PanelHeader title="All orders" subtitle={`${orders.length} demo orders`} action="↓ Export CSV" onAction={admin ? exportReport : () => showToast('Ask an administrator to export reports')}/><label className="table-search">⌕<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order or customer" aria-label="Search orders"/></label><OrderTable orders={filteredOrders} onAdvance={advanceOrder} role={role}/></section>}
        {section === 'Products' && <section className="panel table-panel"><PanelHeader title="Product catalog" subtitle={`${products.length} products`} action={admin ? '+ Add product' : 'Catalog overview'} onAction={() => showToast(admin ? 'Product editor is a UI preview' : 'Product changes are managed by administrators')}/><label className="table-search">⌕<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products" aria-label="Search products"/></label><ProductTable products={filteredProducts}/></section>}
        {section === 'Inventory' && <section className="panel table-panel"><PanelHeader title="Inventory levels" subtitle="Update on-hand quantities" action="Inventory guide ↗" onAction={() => showToast('Inventory guide is coming soon')}/><label className="table-search">⌕<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products or SKU" aria-label="Search inventory"/></label><InventoryTable products={filteredProducts} onAdjust={adjustStock}/></section>}
        {section === 'Staff & roles' && admin && <section className="panel table-panel"><PanelHeader title="Staff & roles" subtitle="People with access to Court Supply" action="+ Invite team member" onAction={() => showToast('Invite flow is a UI preview')}/><div className="staff-table"><div className="table-head"><span>TEAM MEMBER</span><span>ROLE</span><span>STATUS</span><span>LAST ACTIVE</span></div>{[['Avery Tan','admin@courtsupply.test','Administrator','You','Now'],['Jordan Lee','manager@courtsupply.test','Store manager','Active','Today'],['Siti Noor','siti@courtsupply.test','Store manager','Active','Yesterday'],['Ben Chua','ben@courtsupply.test','Store manager','Invited','—']].map(([name, mail, job, status, active]) => <div className="staff-row" key={mail}><span className="team-person"><i>{name.split(' ').map(n => n[0]).join('')}</i><span><strong>{name}</strong><small>{mail}</small></span></span><span>{job}</span><span><b className={`member-status ${status === 'Active' || status === 'You' ? 'member-active' : ''}`}>{status}</b></span><span>{active}</span></div>)}</div></section>}
        {section === 'Settings' && admin && <section className="settings-grid"><section className="panel settings-panel"><h2>Store profile</h2><p>Manage your store details and customer-facing information.</p><label>Store name<input defaultValue="Court Supply"/></label><label>Support email<input type="email" defaultValue="hello@courtsupply.test"/></label><button className="solid-action" onClick={() => showToast('Store profile saved in this preview')}>Save changes</button></section><section className="panel settings-panel"><h2>Store preferences</h2><p>Regional details for your dashboard.</p><label>Currency<select defaultValue="MYR"><option>MYR</option><option>SGD</option><option>USD</option></select></label><label>Timezone<select defaultValue="Kuala Lumpur"><option>Kuala Lumpur</option><option>Singapore</option></select></label><button className="solid-action" onClick={() => showToast('Preferences saved in this preview')}>Save preferences</button></section></section>}
        <footer className="admin-footer">Court Supply staff portal <span>UI preview · Store data is illustrative</span></footer>
      </main>
    </div>
    {toast && <div className="admin-toast" role="status">✓ &nbsp;{toast}</div>}
  </div>;
}

function Metric({ label, value, note, detail, icon }) { return <section className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><strong className="metric-value">{value}</strong><div className="metric-note"><b>{note}</b> <span>{detail}</span></div></section>; }
function PanelHeader({ title, subtitle, action, onAction }) { return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button onClick={onAction} disabled={!onAction}>{action}</button>}</div>; }
function OrderTable({ orders, onAdvance, role }) { return <div className="data-table"><div className="table-head"><span>ORDER</span><span>CUSTOMER</span><span>DATE</span><span>TOTAL</span><span>STATUS</span><span/></div>{orders.length ? orders.map(o => <div className="order-row" key={o.id}><span className="order-id">{o.id}</span><span className="customer-cell">{o.customer}<small>{o.items} item{o.items === 1 ? '' : 's'}</small></span><span>{o.date}</span><strong>{currency(o.total)}</strong><span><b className={`order-status status-${o.status.toLowerCase().replaceAll(' ', '-')}`}>{o.status}</b></span><button className="row-action" onClick={() => onAdvance(o.id)} disabled={o.status === 'Delivered' || (role === 'manager' && o.status === 'Shipped')}>{o.status === 'Delivered' || o.status === 'Shipped' ? '···' : 'Update'}</button></div>) : <p className="table-empty">No matching orders.</p>}</div>; }
function ProductTable({ products }) { return <div className="data-table"><div className="table-head product-table-head"><span>PRODUCT</span><span>SKU</span><span>CATEGORY</span><span>PRICE</span><span>STATUS</span></div>{products.map(p => <div className="product-row" key={p.id}><span className="product-cell"><i>{p.category === 'Footwear' ? '👟' : p.category === 'Balls' ? '⚽' : '◈'}</i><strong>{p.name}</strong></span><span>{p.id}</span><span>{p.category}</span><span>{currency(p.price)}</span><span><b className={`product-status ${p.stock === 0 ? 'status-out' : p.stock <= 5 ? 'status-low' : ''}`}>{p.status}</b></span></div>)}</div>; }
function InventoryTable({ products, onAdjust }) { return <div className="data-table"><div className="table-head inventory-table-head"><span>PRODUCT</span><span>SKU</span><span>ON HAND</span><span>STATUS</span><span>ADJUST</span></div>{products.map(p => <div className="inventory-row" key={p.id}><span className="product-cell"><i>{p.category === 'Footwear' ? '👟' : p.category === 'Balls' ? '⚽' : '◈'}</i><strong>{p.name}</strong></span><span>{p.id}</span><strong>{p.stock} units</strong><span><b className={`product-status ${p.stock === 0 ? 'status-out' : p.stock <= 5 ? 'status-low' : ''}`}>{p.stock === 0 ? 'Out of stock' : p.stock <= 5 ? 'Low stock' : 'In stock'}</b></span><span className="adjust-actions"><button aria-label={`Remove one ${p.name}`} onClick={() => onAdjust(p.id, -1)}>−</button><button aria-label={`Add one ${p.name}`} onClick={() => onAdjust(p.id, 1)}>+</button></span></div>)}</div>; }
function SalesChart() { return <div className="chart-wrap"><div className="chart-y"><span>RM 800</span><span>RM 600</span><span>RM 400</span><span>RM 200</span><span>RM 0</span></div><div className="chart"><div className="chart-grid"><i/><i/><i/><i/><i/></div><svg viewBox="0 0 600 190" preserveAspectRatio="none" aria-label="Sales trend chart"><defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#cbdba8" stopOpacity=".65"/><stop offset="1" stopColor="#cbdba8" stopOpacity="0"/></linearGradient></defs><path className="sales-area" d="M0 148 C38 138 53 150 91 127 S153 132 182 99 S241 115 274 90 S333 107 365 73 S423 91 456 61 S516 70 548 37 S578 49 600 19 L600 190 L0 190 Z"/><path className="sales-line" d="M0 148 C38 138 53 150 91 127 S153 132 182 99 S241 115 274 90 S333 107 365 73 S423 91 456 61 S516 70 548 37 S578 49 600 19"/></svg><div className="chart-x"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div></div>; }
