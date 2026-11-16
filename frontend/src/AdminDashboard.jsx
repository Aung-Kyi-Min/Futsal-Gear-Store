import React, { useCallback, useEffect, useRef, useState } from 'react';
import { request } from './api.js';
import { adminPages, ordersCsv, productPayload, stockPayload, variantPayload } from './adminApi.js';
import './admin.css';
import AdminManagement from './AdminManagement.jsx';

const money = (minor, currency = 'MYR') => new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(minor / 100);
const date = value => new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(value));
const nextStatus = { placed: 'processing', processing: 'shipped', shipped: 'delivered' };
const emptyData = { products: [], orders: [], inventory: [], categories: [], brands: [], managers: [], activity: [], settings: null };
const sections = [['Overview', '◫'], ['Orders', '↗'], ['Products', '◇'], ['Inventory', '▤']];

export default function AdminDashboard({ user, token, sessionLoading = false, onLogin, onLogout, onExit }) {
  const [section, setSection] = useState('Overview');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [data, setData] = useState(emptyData);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [modalError, setModalError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const logoutRef = useRef(onLogout);
  logoutRef.current = onLogout;
  const generation = useRef(0);
  const controller = useRef(null);
  const isAdmin = user?.role === 'administrator';
  const navigation = isAdmin ? [['Overview', '◫'], ['Managers', '♙'], ['Activity', '◷'], ['Settings', '⚙']] : sections;
  const currentSection = navigation.some(([label]) => label === section) ? section : 'Overview';
  const staff = ['manager', 'administrator'].includes(user?.role);

  const reload = useCallback(async () => {
    const version = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setLoading(true); setError('');
    try {
      if (isAdmin) {
        const [managers, activity, settings] = await Promise.all([
          request('/api/admin/managers', { token, signal }),
          request('/api/admin/activity', { token, signal }),
          request('/api/admin/settings', { token, signal }),
        ]);
        if (version === generation.current) setData({ ...emptyData, managers, activity, settings });
        return;
      }
      const [products, orders, inventory, categories, brands] = await Promise.all([
        adminPages('products', token, signal), adminPages('orders', token, signal),
        adminPages('inventory', token, signal), request('/api/categories', { signal }), request('/api/brands', { signal }),
      ]);
      if (version === generation.current) setData({ ...emptyData, products, orders, inventory, categories, brands });
    } catch (err) {
      if (version !== generation.current) return;
      if (err.status === 401) { logoutRef.current(); return; }
      setError(err.message); setData(emptyData);
    } finally { if (version === generation.current) setLoading(false); }
  }, [token, isAdmin]);

  useEffect(() => {
    if (staff && token && !sessionLoading) reload();
    else setData(emptyData);
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [staff, user?.user_id, token, sessionLoading, reload]);

  async function signIn(event) {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true); setLoginError('');
    try { await onLogin(email.trim(), password); setPassword(''); setSection('Overview'); }
    catch (err) { setLoginError(err.message); }
    finally { setLoginBusy(false); }
  }

  async function openDetail(kind, id) {
    if (busy || detailLoading) return;
    setDetailLoading(true); setModalError(''); setError('');
    const version = generation.current;
    try {
      const path = kind === 'movements' ? `inventory/${id}/movements` : `${kind}/${id}`;
      const result = await request(`/api/admin/${path}`, { token });
      if (version === generation.current) setModal({ kind, value: result, id });
    } catch (err) {
      if (err.status === 401) onLogout();
      else setError(err.message);
    } finally { setDetailLoading(false); }
  }

  async function mutate(path, method, body, success) {
    if (busy) return;
    setBusy(true); setModalError(''); setError(''); setNotice('');
    try {
      await request(`/api/admin/${path}`, { token, method, body });
      setModal(null); setNotice(success); await reload();
    } catch (err) {
      if (err.status === 401) { onLogout(); return; }
      setModalError(err.message); setError(err.message);
      // Refresh stale quantities/status after another staff member changed them.
      if (err.status === 409) { setModal(null); await reload(); setError(err.message); }
    } finally { setBusy(false); }
  }

  function editProduct(product = null) { setModalError(''); setModal({ kind: 'product-form', value: product }); }
  function formSubmit(event, kind, value) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (kind === 'manager-form') {
        mutate('managers', 'POST', values, 'Manager account created.');
      } else if (kind === 'product-form') {
        mutate(value ? `products/${value.product_id}` : 'products', value ? 'PATCH' : 'POST', productPayload(values), 'Product saved.');
      } else if (kind === 'variant-form') {
        const path = `products/${modal.productId}/variants${value ? '/' + value.variant_id : ''}`;
        mutate(path, value ? 'PATCH' : 'POST', variantPayload(values), 'Variant saved. Set its stock in Inventory.');
      } else if (kind === 'stock') {
        mutate(`inventory/${value.variant_id}`, 'PATCH', stockPayload(value, values), 'Inventory adjustment saved.');
      } else {
        mutate(kind, 'POST', { name: values.name.trim() }, `${kind === 'categories' ? 'Category' : 'Brand'} created.`);
      }
    } catch (err) { setModalError(err.message); }
  }
  function advance(order) {
    const status = nextStatus[order.status];
    if (status) mutate(`orders/${order.order_id}/status`, 'PATCH', { status }, `Order marked ${status}.`);
  }
  function exportReport() {
    const url = URL.createObjectURL(new Blob([ordersCsv(data.orders)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'court-supply-orders.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function switchSection(next) { setSection(next); setSearch(''); setStatus(''); setError(''); }

  if (sessionLoading) return <div className="staff-login-page"><section className="staff-login-card"><h1>Checking your<br/>staff session…</h1></section></div>;
  if (!user) return <div className="staff-login-page"><button className="staff-back" onClick={onExit}>← Back to storefront</button><section className="staff-login-card">
    <a className="staff-brand" href="/" onClick={e => { e.preventDefault(); onExit(); }}>◈ COURT<span>SUPPLY</span></a>
    <p className="staff-kicker">TEAM ACCESS</p><h1>Store operations,<br/>all in one place.</h1><p className="staff-lead">Sign in with your assigned staff account.</p>
    <form onSubmit={signIn}><label>Work email<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
      {loginError && <p className="staff-login-error" role="alert">{loginError}</p>}<button className="staff-login-submit" disabled={loginBusy}>{loginBusy ? 'Signing in…' : 'Sign in to dashboard ↗'}</button></form>
    <p className="staff-demo-note">Manager or administrator access is required.</p></section><div className="staff-login-art"><span>YOUR STORE.<br/>IN PLAY.</span><b>⚽</b></div></div>;
  if (!staff) return <div className="staff-login-page"><section className="staff-login-card"><h1>Staff access required.</h1><p>Your account cannot access this dashboard.</p><button className="staff-login-submit" onClick={onLogout}>Log out</button><button onClick={onExit}>Return to storefront</button></section></div>;

  const disabled = loading || busy || detailLoading || !!error;
  const matches = (...values) => values.join(' ').toLowerCase().includes(search.toLowerCase());
  const products = data.products.filter(p => matches(p.name, p.category, p.brand, p.product_id));
  const orders = data.orders.filter(o => matches(o.order_id, o.delivery_name, o.status) && (!status || o.status === status));
  const inventory = data.inventory.filter(i => matches(i.product_name, i.sku, i.size, i.colour));
  const lowStock = data.inventory.filter(i => i.is_active && i.product_is_active && i.quantity_on_hand <= 5);
  const sales = data.orders.reduce((totals, order) => ({ ...totals, [order.currency]: (totals[order.currency] || 0) + order.total_minor }), {});

  return <div className={`admin-shell role-${user.role}`}>
    <aside className="admin-sidebar"><a className="admin-brand" href="/" onClick={e => { e.preventDefault(); onExit(); }}>◈ COURT<span>SUPPLY</span></a>
      <div className="admin-workspace"><span className="workspace-mark">C</span><span><strong>Store operations</strong><small>{user.role === 'administrator' ? 'Administrator' : 'Manager'} workspace</small></span></div>
      <p className="admin-nav-label">WORKSPACE</p><nav className="admin-nav">{navigation.map(([label, icon]) => <button key={label} className={currentSection === label ? 'selected' : ''} disabled={busy} onClick={() => switchSection(label)}><span>{icon}</span>{label}{label === 'Orders' && <i>{data.orders.filter(o => o.status === 'placed').length}</i>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="store-link" onClick={onExit}>↗ View storefront</button><small>PostgreSQL store management</small></div></aside>
    <div className="admin-main"><header className="admin-topbar"><div className="breadcrumb">Store / <strong>{currentSection}</strong></div><div className="topbar-actions"><span>{user.full_name}</span><button className="outline-action" onClick={onLogout}>Log out</button></div></header>
      <main className="admin-content"><div className="admin-page-heading"><div><p className="staff-kicker">{isAdmin ? 'ADMINISTRATION' : 'MANAGER WORKSPACE'}</p><h1>{currentSection}</h1><p>{isAdmin ? 'Manage your team, review activity, and keep shop details up to date.' : 'Manage products, sizes, colours, pricing, stock, and customer orders.'}</p></div><button className="outline-action" disabled={loading || busy} onClick={reload}>↻ Refresh</button></div>
        {error && <p className="admin-error" role="alert">{error} <button onClick={reload} disabled={loading || busy}>Reload data</button></p>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        {(loading || detailLoading) && <p role="status">{loading ? 'Loading store data…' : 'Loading details…'}</p>}
        {busy && <p role="status">Saving changes…</p>}
        {!isAdmin && currentSection === 'Overview' && <>
          <div className="dashboard-cards"><Metric label="Order value" value={Object.entries(sales).map(([c, total]) => money(total, c)).join(' / ') || '—'} detail="All recorded orders; not payment revenue"/>
            <Metric label="Orders" value={data.orders.length} detail={`${data.orders.filter(o => o.status !== 'delivered').length} awaiting delivery`}/>
            <Metric label="Products" value={data.products.length} detail={`${data.products.filter(p => p.is_active).length} active products`}/>
            <Metric label="Low / no stock" value={lowStock.length} detail="Active variants with 5 or fewer units"/></div>
          <section className="panel table-panel"><PanelHeader title="Recent orders" action="View orders →" onAction={() => switchSection('Orders')}/><OrderTable orders={data.orders.slice(0, 5)} disabled={disabled} onDetail={o => openDetail('orders', o.order_id)} onAdvance={advance}/></section>
          <section className="panel table-panel"><PanelHeader title="Stock to watch" action="View inventory →" onAction={() => switchSection('Inventory')}/><InventoryTable rows={lowStock.slice(0, 5)} disabled={disabled} onAdjust={row => { setModalError(''); setModal({ kind: 'stock', value: row }); }} onHistory={row => openDetail('movements', row.variant_id)}/></section>
        </>}
        {!isAdmin && currentSection === 'Orders' && <section className="panel table-panel"><PanelHeader title="All orders" subtitle={`${data.orders.length} recorded orders`} action="↓ Export CSV" onAction={!disabled ? exportReport : undefined}/><Search value={search} onChange={setSearch} label="Search order or customer"/>
          <label className="admin-filter">Order status <select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['placed', 'processing', 'shipped', 'delivered'].map(s => <option key={s}>{s}</option>)}</select></label>
          <OrderTable orders={orders} disabled={disabled} onDetail={o => openDetail('orders', o.order_id)} onAdvance={advance}/></section>}
        {!isAdmin && currentSection === 'Products' && <section className="panel table-panel"><PanelHeader title="Product catalog" subtitle={`${data.products.length} products, including inactive products`} action="+ Add product" onAction={!disabled ? () => editProduct() : undefined}/>
          <div className="admin-toolbar"><button disabled={disabled} onClick={() => { setModalError(''); setModal({ kind: 'categories' }); }}>+ Category</button><button disabled={disabled} onClick={() => { setModalError(''); setModal({ kind: 'brands' }); }}>+ Brand</button></div>
          <Search value={search} onChange={setSearch} label="Search products, brand or category"/>
          <div className="admin-table-wrap"><table className="admin-live-table"><thead><tr><th>Product</th><th>Category / brand</th><th>Base price</th><th>Status</th><th>Manage</th></tr></thead><tbody>{products.map(p => <tr key={p.product_id}><td><strong>{p.name}</strong><small>#{p.product_id}</small></td><td>{p.category}<small>{p.brand}</small></td><td>{money(p.base_price_minor, p.currency)}</td><td>{p.is_active ? 'Active' : 'Inactive'}</td><td><div className="admin-row-actions"><button disabled={disabled} onClick={() => editProduct(p)}>Edit</button><button disabled={disabled} onClick={() => openDetail('products', p.product_id)}>Variants</button></div></td></tr>)}</tbody></table>{!products.length && <Empty/>}</div></section>}
        {!isAdmin && currentSection === 'Inventory' && <section className="panel table-panel"><PanelHeader title="Variant inventory" subtitle="Stock updates require a reason and check for concurrent changes"/><Search value={search} onChange={setSearch} label="Search products, SKU, size or colour"/><InventoryTable rows={inventory} disabled={disabled} onAdjust={row => { setModalError(''); setModal({ kind: 'stock', value: row }); }} onHistory={row => openDetail('movements', row.variant_id)}/></section>}
        {isAdmin && <AdminManagement section={currentSection} data={data} disabled={disabled} mutate={mutate} openCreate={target => { if (typeof target === 'string') switchSection(target); else { setModalError(''); setModal({ kind: 'manager-form' }); } }}/>}
        <footer className="admin-footer">Court Supply staff portal <span>Changes are saved to your store database</span></footer>
      </main></div>
    {modal && <div className="admin-modal-backdrop" onClick={() => !busy && setModal(null)}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" onClick={e => e.stopPropagation()}>
      <div className="admin-modal-heading"><h2 id="admin-modal-title">{modalTitle(modal)}</h2><button disabled={busy} aria-label="Close dialog" onClick={() => setModal(null)}>✕</button></div>
      {modalError && <p className="admin-error" role="alert">{modalError}</p>}
      {['manager-form', 'product-form', 'variant-form', 'stock', 'categories', 'brands'].includes(modal.kind) && <form onSubmit={e => formSubmit(e, modal.kind, modal.value)} key={`${modal.kind}-${modal.value?.product_id || modal.value?.variant_id || 'new'}`}><fieldset disabled={busy}>
        {modal.kind === 'manager-form' && <><p>Managers can manage the catalog, stock, and customer orders.</p><label>Full name<input name="full_name" required minLength="2" maxLength="160" autoComplete="name"/></label><label>Work email<input name="email" type="email" required maxLength="254" autoComplete="off"/></label><label>Initial password<input name="password" type="password" required minLength="12" maxLength="128" autoComplete="new-password"/></label><p>Use at least 12 characters.</p></>}
        {modal.kind === 'product-form'  && <ProductFields value={modal.value} categories={data.categories} brands={data.brands}/>}
        {modal.kind === 'variant-form' && <VariantFields value={modal.value}/>}
        {modal.kind === 'stock' && <><p>{modal.value.product_name} · {modal.value.size} / {modal.value.colour}</p><p>Current stock: {modal.value.quantity_on_hand}</p><label>New quantity<input name="quantity" type="number" required min="0" max="2147483647" step="1" defaultValue={modal.value.quantity_on_hand}/></label><label>Reason<input name="reason" required maxLength="80" placeholder="e.g. Supplier restock or stock count correction"/></label></>}
        {['categories', 'brands'].includes(modal.kind) && <label>Name<input name="name" required maxLength={modal.kind === 'categories' ? 100 : 120}/></label>}
        <button className="solid-action" disabled={busy || (modal.kind === 'product-form' && (!data.categories.length || !data.brands.length))}>{busy ? 'Saving…' : 'Save changes'}</button></fieldset></form>}
      {modal.kind === 'products' && <><p>{modal.value.description}</p><button className="solid-action" disabled={busy} onClick={() => { setModalError(''); setModal({ kind: 'variant-form', value: null, productId: modal.id }); }}>+ Add variant</button><div className="admin-table-wrap"><table className="admin-live-table"><thead><tr><th>SKU</th><th>Size / colour</th><th>Price</th><th>Stock</th><th>Status</th><th/></tr></thead><tbody>{modal.value.variants.map(v => <tr key={v.variant_id}><td>{v.sku}</td><td>{v.size} / {v.colour}</td><td>{money(v.price_minor, modal.value.currency)}</td><td>{v.quantity_on_hand}</td><td>{v.is_active ? 'Active' : 'Inactive'}</td><td><button disabled={busy} onClick={() => { setModalError(''); setModal({ kind: 'variant-form', value: v, productId: modal.id }); }}>Edit</button></td></tr>)}</tbody></table>{!modal.value.variants.length && <Empty/>}</div></>}
      {modal.kind === 'orders' && <OrderDetail order={modal.value} disabled={busy} onAdvance={advance}/>}
      {modal.kind === 'movements' && <div className="admin-table-wrap"><table className="admin-live-table"><thead><tr><th>Date</th><th>Change</th><th>Reason</th><th>Order</th></tr></thead><tbody>{modal.value.map(m => <tr key={m.movement_id}><td>{date(m.created_at)}</td><td>{m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}</td><td>{m.reason}</td><td>{m.order_id || '—'}</td></tr>)}</tbody></table>{!modal.value.length && <Empty/>}<p>Most recent 50 movements.</p></div>}
    </section></div>}
  </div>;
}

function modalTitle(modal) {
  return ({ 'manager-form': 'Create manager account', 'product-form': modal.value ? 'Edit product' : 'Add product', 'variant-form': modal.value ? 'Edit variant' : 'Add variant', stock: 'Adjust stock', categories: 'Add category', brands: 'Add brand', products: modal.value?.name, orders: 'Order details', movements: 'Stock movement history' })[modal.kind];
}
function Metric({ label, value, detail }) { return <section className="metric-card"><div className="metric-top"><span>{label}</span></div><strong className="metric-value">{value}</strong><div className="metric-note">{detail}</div></section>; }
function PanelHeader({ title, subtitle, action, onAction }) { return <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button disabled={!onAction} onClick={onAction}>{action}</button>}</div>; }
function Search({ value, onChange, label }) { return <label className="table-search">⌕<input value={value} onChange={e => onChange(e.target.value)} placeholder={label} aria-label={label}/></label>; }
function Empty() { return <p className="table-empty">No matching records.</p>; }
function OrderTable({ orders, disabled, onDetail, onAdvance }) {
  return <div className="admin-table-wrap"><table className="admin-live-table"><thead><tr><th>Order</th><th>Customer</th><th>Created</th><th>Total</th><th>Status</th><th>Manage</th></tr></thead><tbody>{orders.map(o => <tr key={o.order_id}><td title={o.order_id}>{o.order_id.slice(0, 8)}</td><td>{o.delivery_name}</td><td>{date(o.created_at)}</td><td>{money(o.total_minor, o.currency)}</td><td>{o.status}</td><td><div className="admin-row-actions"><button disabled={disabled} onClick={() => onDetail(o)}>Details</button>{nextStatus[o.status] && <button disabled={disabled} onClick={() => onAdvance(o)}>Mark {nextStatus[o.status]}</button>}</div></td></tr>)}</tbody></table>{!orders.length && <Empty/>}</div>;
}
function InventoryTable({ rows, disabled, onAdjust, onHistory }) {
  return <div className="admin-table-wrap"><table className="admin-live-table"><thead><tr><th>Product / variant</th><th>SKU</th><th>On hand</th><th>Status</th><th>Manage</th></tr></thead><tbody>{rows.map(i => <tr key={i.variant_id}><td><strong>{i.product_name}</strong><small>{i.size} / {i.colour}</small></td><td>{i.sku}</td><td>{i.quantity_on_hand}</td><td>{!i.is_active || !i.product_is_active ? 'Inactive' : i.quantity_on_hand === 0 ? 'Out of stock' : i.quantity_on_hand <= 5 ? 'Low stock' : 'In stock'}</td><td><div className="admin-row-actions"><button disabled={disabled} onClick={() => onAdjust(i)}>Adjust</button><button disabled={disabled} onClick={() => onHistory(i)}>History</button></div></td></tr>)}</tbody></table>{!rows.length && <Empty/>}</div>;
}
function ProductFields({ value: p, categories, brands }) {
  return <><label>Name<input name="name" required maxLength="180" defaultValue={p?.name || ''}/></label><label>Description<textarea name="description" maxLength="5000" defaultValue={p?.description || ''}/></label><label>Category<select name="category_id" required defaultValue={p?.category_id || ''}><option value="" disabled>Select category</option>{categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></label><label>Brand<select name="brand_id" required defaultValue={p?.brand_id || ''}><option value="" disabled>Select brand</option>{brands.map(b => <option key={b.brand_id} value={b.brand_id}>{b.name}</option>)}</select></label>{(!categories.length || !brands.length) && <p>Create a category and brand before adding a product.</p>}<label>Base price (major units, e.g. 299.00)<input name="price" type="number" required min="0" step="0.01" defaultValue={p ? (p.base_price_minor / 100).toFixed(2) : ''}/></label><label>Currency<input name="currency" required pattern="[A-Z]{3}" maxLength="3" defaultValue={p?.currency || 'MYR'}/></label><label>Image URL<input name="image_url" type="url" maxLength="2048" defaultValue={p?.image_url || ''}/></label><label className="admin-checkbox"><input type="checkbox" name="is_active" defaultChecked={p?.is_active ?? true}/>Active</label></>;
}
function VariantFields({ value: v }) {
  return <><label>SKU<input name="sku" required maxLength="80" defaultValue={v?.sku || ''}/></label><label>Size<input name="size" required maxLength="40" defaultValue={v?.size || ''}/></label><label>Colour<input name="colour" required maxLength="60" defaultValue={v?.colour || ''}/></label><label>Price (major units)<input name="price" type="number" min="0" step="0.01" required defaultValue={v ? (v.price_minor / 100).toFixed(2) : ''}/></label><label className="admin-checkbox"><input name="is_active" type="checkbox" defaultChecked={v?.is_active ?? true}/>Active</label></>;
}
function OrderDetail({ order: o, disabled, onAdvance }) {
  return <><p><strong>{o.order_id}</strong></p><p>{o.delivery_name} · {o.customer_email}</p><p style={{ whiteSpace: 'pre-wrap' }}>{o.delivery_address}</p><p>Status: <strong>{o.status}</strong></p><div className="admin-table-wrap"><table className="admin-live-table"><thead><tr><th>Item</th><th>Variant</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{o.items.map(i => <tr key={i.order_item_id}><td>{i.product_name_snapshot}</td><td>{i.size_snapshot} / {i.colour_snapshot}</td><td>{i.quantity}</td><td>{money(i.unit_price_minor, o.currency)}</td><td>{money(i.line_total_minor, o.currency)}</td></tr>)}</tbody></table></div><p>Subtotal: {money(o.subtotal_minor, o.currency)} · Shipping: {money(o.shipping_minor, o.currency)} · Tax: {money(o.tax_minor, o.currency)}</p><p><strong>Total: {money(o.total_minor, o.currency)}</strong></p>{nextStatus[o.status] && <button className="solid-action" disabled={disabled} onClick={() => onAdvance(o)}>Mark {nextStatus[o.status]}</button>}<h3>Status history</h3><ul>{o.status_history.map(h => <li key={h.history_id}>{date(h.changed_at)} · {h.old_status || 'New order'} → {h.new_status}</li>)}</ul></>;
}
