import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const money = cents => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(cents / 100);
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
function ProductCard({ p, cart, change, money }) {
  const quantity = cart[p.id] || 0;
  return <article><div className={`product-art ${p.color}`}><span className="tag">{p.category}</span><span className="product-icon" aria-hidden="true">{p.icon}</span><span className="art-word">COURT / SUPPLY</span></div><div className="product-heading"><h3>{p.name}</h3><strong>{money(p.price_cents)}</strong></div><p>{p.description}</p><div className="product-meta"><span className={p.stock ? 'in-stock' : 'out-stock'}>{p.stock ? 'In stock' : 'Sold out'}</span>{p.stock > 0 && p.stock < 5 && <span>Only {p.stock} left</span>}</div><button className="add" disabled={!p.stock || quantity >= p.stock} onClick={() => change(p, 1)}>{!p.stock ? 'Sold out' : quantity >= p.stock ? 'Bag limit reached' : 'Add to kit bag'} <span>+</span></button></article>;
}
function App() {
  const [page, setPage] = useState(() => window.location.pathname === '/shop' ? 'shop' : 'home');
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('All gear');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem('court-cart')) || {}; } catch { return {}; } });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authFeedback, setAuthFeedback] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { const res = await fetch(`${API}/api/products`); if (!res.ok) throw Error(); const data = await res.json(); setProducts(data.products); }
    catch { setError('The store could not connect. Check that the Python backend is running, then retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onPopState = () => setPage(window.location.pathname === '/shop' ? 'shop' : 'home');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => { localStorage.setItem('court-cart', JSON.stringify(cart)); }, [cart]);
  const lines = products.filter(p => Number.isInteger(cart[p.id]) && cart[p.id] > 0).map(p => ({ ...p, quantity: cart[p.id] }));
  const count = lines.reduce((sum, p) => sum + p.quantity, 0);
  const total = lines.reduce((sum, p) => sum + p.quantity * p.price_cents, 0);
  const visibleProducts = products.filter(p => (category === 'All gear' || category === p.category) && p.name.toLowerCase().includes(query.toLowerCase()));
  const featuredProducts = products.filter(p => p.stock > 0).slice(0, 5);
  function navigate(nextPage) {
    const path = nextPage === 'shop' ? '/shop' : '/';
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function change(p, delta) { setCart(old => ({ ...old, [p.id]: Math.max(0, Math.min(p.stock, (Number(old[p.id]) || 0) + delta)) })); }
  async function checkout(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await fetch(`${API}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, items: lines.map(p => ({ product_id: p.id, quantity: p.quantity })) }) });
      const data = await res.json();
      if (!res.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Please check your checkout details.');
      setCart({}); setOpen(false); setNotice(`Order ${data.order_id.slice(0, 8)} received. Total: ${money(data.total_cents)}. No payment has been taken.`); await load();
    } catch (err) { setError(err.message || 'Unable to place order. Please try again.'); }
    finally { setBusy(false); }
  }
  function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (authMode === 'signup' && values.password !== values.confirm_password) {
      setAuthFeedback('Those passwords do not match. Please try again.');
      form.elements.confirm_password.focus();
      return;
    }
    setAuthFeedback(authMode === 'signup'
      ? 'Your details look good. Account creation will be available when authentication is connected.'
      : 'Your details look good. Sign-in will be available when authentication is connected.');
  }
  return <>
    <div className="announcement">FOR THE LOVE OF THE SMALL-SIDED GAME <span>Built for your next match ↗</span></div>
    <header><a className="brand" href="/" onClick={e => { e.preventDefault(); navigate('home'); }}>◈ COURT<span>SUPPLY</span></a><nav><a href="/shop" onClick={e => { e.preventDefault(); navigate('shop'); }}>Shop gear</a><a href="/#about" onClick={e => { e.preventDefault(); if (page !== 'home') { navigate('home'); setTimeout(() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }), 0); } else document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }); }}>Our game</a></nav><div className="header-actions"><button className="account-button" onClick={() => { setAuthMode('login'); setAuthFeedback(''); setAuthOpen(true); }}>Log in / Sign up</button><button className="cart-button" onClick={() => setOpen(true)}>Kit bag <span>{count}</span></button></div></header>
    <main>
    {page === 'home' ? <>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">MADE FOR THE INDOOR GAME</p><h1>Ready for<br/>your <em>next match.</em></h1><p>Futsal essentials for quick feet, close control, and one more game.</p><button className="primary" onClick={() => navigate('shop')}>Shop all gear <span>↗</span></button><div className="hero-note"><span>01</span> / GOOD GEAR. BETTER SESSIONS.</div></div><div className="court-art" aria-hidden="true"><div className="court-lines"><i/><b/></div><div className="ball">⚽</div><span className="vertical">OWN YOUR NEXT MOVE</span><div className="art-label">THE COURT IS CALLING.<br/><strong>Show up ready.</strong></div><span className="hero-stamp">COURT<br/>SUPPLY<br/><b>⚡</b></span></div></section>
    <section className="benefits" id="about"><span><b>↗</b><strong>Gear for every level</strong><small>New player or regular</small></span><span><b>◎</b><strong>Made for indoor play</strong><small>Built for the small court</small></span><span><b>✳</b><strong>Play together</strong><small>Better sessions start here</small></span></section>
    <section id="featured" className="shop featured-shop"><div className="section-title"><div><p className="eyebrow">A FEW COURT FAVORITES</p><h2>Ready for your next session.</h2></div><button className="text-link" onClick={() => navigate('shop')}>Browse all gear <span>↗</span></button></div>
    {notice && <p role="status" className="notice">{notice}</p>}{error && <p role="alert" className="error">{error} <button onClick={load}>Retry</button></p>}
    {loading ? <p role="status" className="loading-state">Getting the lineup ready…</p> : featuredProducts.length ? <div className="products">{featuredProducts.map(p => <ProductCard key={p.id} p={p} cart={cart} change={change} money={money}/>)}</div> : <p className="empty-catalog">Gear picks will show here when products are available.</p>}
    <button className="primary browse-cta" onClick={() => navigate('shop')}>Shop all gear <span>↗</span></button></section>
    </> : <section id="shop" className="shop catalog-page"><div className="catalog-heading"><button className="back-link" onClick={() => navigate('home')}>← Back to home</button><p className="eyebrow">THE COURT SUPPLY LINEUP</p><h1>Find your game gear.</h1><p>Browse the essentials. Add your picks to the kit bag.</p></div><div className="filters"><div className="tabs" role="group" aria-label="Filter products by category">{['All gear', 'Footwear', 'Balls', 'Apparel', 'Accessories'].map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search gear" type="search" placeholder="Search products" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
    {notice && <p role="status" className="notice">{notice}</p>}{error && !open && <p role="alert" className="error">{error} <button onClick={load}>Retry</button></p>}
    {loading ? <p role="status" className="loading-state">Getting the lineup ready…</p> : <><p className="results-count">{visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}</p>{visibleProducts.length ? <div className="products">{visibleProducts.map(p => <ProductCard key={p.id} p={p} cart={cart} change={change} money={money}/>)}</div> : <div className="empty-state"><span>⌕</span><h3>No gear found</h3><p>Try another search or choose a different category.</p><button onClick={() => { setQuery(''); setCategory('All gear'); }}>Clear filters</button></div>}</>}
    </section>}
    {page === 'home' && <section className="closing"><p className="eyebrow">MEET YOU ON THE COURT</p><h2>Less scrolling.<br/>More scoring.</h2><button onClick={() => navigate('shop')}>Explore all gear ↗</button></section>}</main><footer><a className="brand" href="/" onClick={e => { e.preventDefault(); navigate('home'); }}>◈ COURT<span>SUPPLY</span></a><p>Your everyday futsal essentials.</p><small>Demo store · Prices in MYR · No online payments</small></footer>
    {authOpen && <div className="overlay auth-overlay" onClick={() => setAuthOpen(false)}><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={e => e.stopPropagation()}><div className="drawer-title"><div><p className="eyebrow">WELCOME TO COURT SUPPLY</p><h2 id="auth-title">{authMode === 'login' ? 'Good to see you.' : 'Join the team.'}</h2></div><button aria-label="Close account dialog" onClick={() => setAuthOpen(false)}>✕</button></div><p className="auth-intro">{authMode === 'login' ? 'Log in to keep your game-day essentials close.' : 'Create an account for a smoother match-day shop.'}</p><div className="auth-tabs" role="tablist" aria-label="Account options"><button type="button" role="tab" aria-selected={authMode === 'login'} className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthFeedback(''); }}>Log in</button><button type="button" role="tab" aria-selected={authMode === 'signup'} className={authMode === 'signup' ? 'active' : ''} onClick={() => { setAuthMode('signup'); setAuthFeedback(''); }}>Sign up</button></div><form onSubmit={submitAuth} key={authMode} noValidate={false}>{authMode === 'signup' && <label>Full name<input name="name" type="text" required minLength="2" maxLength="100" autoComplete="name" placeholder="Your name"/></label>}<label>Email address<input name="email" type="email" required maxLength="254" autoComplete="email" placeholder="you@example.com"/></label><label>Password<input name="password" type="password" required minLength="8" maxLength="128" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder={authMode === 'signup' ? 'At least 8 characters and 1 number' : 'Your password'} pattern={authMode === 'signup' ? '(?=.*[A-Za-z])(?=.*[0-9]).{8,}' : undefined} title="Use at least 8 characters, including a number."/></label>{authMode === 'signup' && <label>Confirm password<input name="confirm_password" type="password" required minLength="8" maxLength="128" autoComplete="new-password" placeholder="Enter your password again"/></label>}<p className="auth-hint">{authMode === 'signup' ? 'Use 8 or more characters and include at least one number.' : 'Your account details are only used for this UI demo.'}</p><button className="primary auth-submit" type="submit">{authMode === 'login' ? 'Log in' : 'Create account'} <span>↗</span></button></form>{authFeedback && <p className="auth-feedback" role="status">{authFeedback}</p>}<p className="auth-demo">Demo UI only · Authentication is not connected yet.</p></section></div>}
    {open && <div className="overlay" onClick={() => !busy && setOpen(false)}><section className="drawer" role="dialog" aria-modal="true" aria-label="Your kit bag" onClick={e => e.stopPropagation()}><div className="drawer-title"><h2>Your kit bag ({count})</h2><button aria-label="Close kit bag" disabled={busy} onClick={() => setOpen(false)}>✕</button></div>{error && <p role="alert" className="error">{error}</p>}{!lines.length ? <p>Your bag is empty. Your next match starts here.</p> : <><div className="cart-lines">{lines.map(p => <div className="cart-line" key={p.id}><span className="mini-icon">{p.icon}</span><div><strong>{p.name}</strong><p>{money(p.price_cents)}</p><div className="quantity"><button disabled={busy} aria-label={`Remove one ${p.name}`} onClick={() => change(p, -1)}>−</button><span>{p.quantity}</span><button disabled={busy || p.quantity >= p.stock} aria-label={`Add one ${p.name}`} onClick={() => change(p, 1)}>+</button></div></div><button disabled={busy} onClick={() => setCart(old => ({ ...old, [p.id]: 0 }))}>Remove</button></div>)}</div><div className="total"><span>Total</span><strong>{money(total)}</strong></div><p className="muted">Demo checkout. No payment is collected. No shipping or tax charges are added.</p><form onSubmit={checkout}><label>Full name<input name="customer_name" required minLength="2" maxLength="100" autoComplete="name"/></label><label>Email<input name="email" type="email" required maxLength="254" autoComplete="email"/></label><label>Delivery address<textarea name="address" required minLength="5" maxLength="500" autoComplete="street-address"/></label><button className="primary" disabled={busy}>{busy ? 'Placing order…' : 'Place demo order ↗'}</button></form></>}</section></div>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
