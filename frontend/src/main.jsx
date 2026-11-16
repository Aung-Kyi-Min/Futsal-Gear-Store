import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { request, storedToken, storeToken } from './api.js';
import AdminDashboard from './AdminDashboard.jsx';
import { loadCatalog } from './catalog.js';

const money = (cents, currency = 'MYR') => new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(cents / 100);
function ProductCard({ p, cart, change }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = p.variants.find(v => v.id === selectedId)
    || p.variants.find(v => v.stock > 0) || p.variants[0];
  const quantity = selected ? cart[selected.id] || 0 : 0;
  const stock = selected?.stock || 0;
  return <article>
    <div className="product-art cream"><span className="tag">{p.category}</span>
      {p.image_url ? <img className="catalog-image" src={p.image_url} alt={p.name} onError={event => { event.currentTarget.hidden = true; }}/>
        : <span className="product-icon" aria-hidden="true">{p.icon}</span>}
      <span className="art-word">COURT / SUPPLY</span></div>
    <div className="product-heading"><h3>{p.name}</h3><strong>{money(selected?.price_cents ?? p.price_cents, p.currency)}</strong></div>
    <p>{p.brand} · {p.description}</p>
    <label className="variant-picker">Size / colour
      <select aria-label={`Size and colour for ${p.name}`} value={selected?.id || ''} disabled={!p.variants.length}
        onChange={event => setSelectedId(Number(event.target.value))}>
        {!p.variants.length && <option value="">No variants available</option>}
        {p.variants.map(v => <option key={v.id} value={v.id}>{v.size} / {v.colour}{!v.stock ? ' — Sold out' : ''}</option>)}
      </select></label>
    <div className="product-meta"><span className={stock ? 'in-stock' : 'out-stock'}>{stock ? 'In stock' : 'Sold out'}</span>{stock > 0 && stock < 5 && <span>Only {stock} left</span>}</div>
    <button className="add" disabled={!stock || quantity >= stock || quantity >= 99} onClick={() => change(selected, 1)}>
      {!stock ? 'Sold out' : quantity >= Math.min(stock, 99) ? 'Bag limit reached' : 'Add to kit bag'} <span>+</span></button>
  </article>;
}
function AboutPage({ onHome, onShop }) {
  return <div className="info-page about-page"><div className="info-page-heading"><button className="back-link" onClick={onHome}>← Back to home</button><p className="eyebrow">A LITTLE ABOUT OUR GAME</p><h1>Made for the moments<br/>between kick-off and<br/><em>one more game.</em></h1><p>Small court. Big energy. Gear that helps you feel ready to play.</p></div><section className="about-us-section"><div className="about-copy"><h2>Futsal is more than<br/>ninety minutes.</h2><p>Court Supply is a demo futsal shop built around the energy of the indoor game. We bring together practical footwear, balls, apparel, and accessories for players who love a quick pass and a close finish.</p><p>Whether it’s your first session or your weekly run with friends, we want finding your next essential to feel straightforward and fun.</p><button className="text-link" onClick={onShop}>Explore the lineup <span>↗</span></button></div><div className="about-feature"><span className="about-ball" aria-hidden="true">⚽</span><div><small>OUR POINT OF VIEW</small><strong>Good gear should make<br/>getting on court easier.</strong></div><span className="about-mark">CS<br/>/ 01</span></div></section><section className="about-values"><article><span>01</span><h2>Made for the game</h2><p>Useful kit chosen for quick play, close control, and indoor courts.</p></article><article><span>02</span><h2>Easy to explore</h2><p>Clear product details help you find a good fit for your next session.</p></article><article><span>03</span><h2>Better together</h2><p>Futsal is at its best when everyone gets involved.</p></article></section><div className="info-page-cta"><strong>Ready for your next session?</strong><button className="primary" onClick={onShop}>Browse the gear <span>↗</span></button></div></div>;
}

function ContactPage({ onHome, feedback, onSubmit }) {
  return <div className="info-page contact-page"><div className="info-page-heading"><button className="back-link" onClick={onHome}>← Back to home</button><p className="eyebrow">WE’RE HERE TO HELP</p><h1>Let’s talk<br/>futsal gear.</h1><p>Questions about an order, product, or finding the right gear? Send us a note.</p></div><section className="contact-section"><div className="contact-intro"><p className="eyebrow">CONTACT DETAILS</p><h2>Need a hand<br/>with your kit?</h2><p>Our demo team is happy to help with product questions and order guidance.</p><div className="contact-details"><a href="mailto:hello@courtsupply.test"><span>✉</span><span><small>EMAIL</small><strong>hello@courtsupply.test</strong></span></a><a href="tel:+60355550148"><span>↗</span><span><small>PHONE</small><strong>+60 3-5555 0148</strong></span></a><div><span>◷</span><span><small>DEMO STORE HOURS</small><strong>Tue–Sun · 10:00 am–7:00 pm</strong></span></div><p className="contact-demo-note">Sample contact details for this demo store.</p></div></div><form className="contact-form" onSubmit={onSubmit}><p className="eyebrow">DROP US A LINE</p><h3>What can we help with?</h3><label>Your name<input name="contact_name" type="text" required minLength="2" maxLength="100" placeholder="Name"/></label><label>Email address<input name="contact_email" type="email" required maxLength="254" placeholder="you@example.com"/></label><label>Topic<select name="contact_topic" defaultValue="Order question"><option>Order question</option><option>Product information</option><option>Returns and exchanges</option><option>Something else</option></select></label><label>Message<textarea name="contact_message" required minLength="10" maxLength="1000" rows="4" placeholder="Tell us how we can help…"/></label><button className="primary" type="submit">Send message <span>↗</span></button>{feedback && <p className="contact-feedback" role="status">{feedback}</p>}<small>Demo form only. Your message won’t be sent or stored.</small></form></section></div>;
}

const pageFromPath = path => ({ '/shop': 'shop', '/admin': 'admin', '/about': 'about', '/contact': 'contact' }[path] || 'home');
function App() {
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('All gear');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem('court-variant-cart')) || {}; } catch { return {}; } });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contactFeedback, setContactFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authFeedback, setAuthFeedback] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [token, setToken] = useState(storedToken);
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(storedToken()));
  const [sessionError, setSessionError] = useState('');
  useEffect(() => {
    if (!token) { setSessionLoading(false); return; }
    let active = true;
    setSessionLoading(true);
    request('/api/auth/me', { token }).then(data => {
      if (active) { setUser(data); setSessionError(''); }
    }).catch(err => {
      if (!active) return;
      if (err.status === 401) {
        storeToken(''); setToken(''); setUser(null);
        setSessionError('Your session has expired. Please log in again.');
      } else setSessionError(err.message);
    }).finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, [token]);
  function logout() {
    storeToken(''); setToken(''); setUser(null); setSessionError('');
    setSessionLoading(false);
    setOpen(false); setAuthOpen(false); setAuthFeedback('');
    setError(''); setCategory('All gear'); setQuery('');
    window.history.replaceState({}, '', '/');
    setPage('home');
    window.scrollTo({ top: 0, behavior: 'instant' });
    setNotice('You have logged out.');
  }
  async function load() {
    setLoading(true); setError('');
    try { setProducts(await loadCatalog()); }
    catch (err) { setError(err.message || 'Unable to load the catalog. Please retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onPopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => { try { localStorage.setItem('court-variant-cart', JSON.stringify(cart)); } catch { /* Keep the bag usable when storage is blocked. */ } }, [cart]);
  const lines = products.flatMap(p => p.variants).filter(p => Number.isInteger(cart[p.id]) && cart[p.id] > 0).map(p => ({ ...p, quantity: cart[p.id] }));
  const count = lines.reduce((sum, p) => sum + p.quantity, 0);
  const total = lines.reduce((sum, p) => sum + p.quantity * p.price_cents, 0);
  const currencies = new Set(lines.map(p => p.currency));
  const invalidCart = currencies.size > 1 || lines.some(p => p.quantity > p.stock || p.quantity > 99);
  const categories = ['All gear', ...new Set(products.map(p => p.category))];
  const visibleProducts = products.filter(p => (category === 'All gear' || category === p.category) && p.name.toLowerCase().includes(query.toLowerCase()));
  const featuredProducts = products.filter(p => p.stock > 0).slice(0, 5);
  function navigate(nextPage) {
    const path = ({ shop: '/shop', admin: '/admin', about: '/about', contact: '/contact' })[nextPage] || '/';
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function navigateToSection(id) {
    if (page !== 'home') {
      if (window.location.pathname !== '/') window.history.pushState({}, '', '/');
      setPage('home');
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 0);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }
  function submitContact(event) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get('contact_name');
    setContactFeedback(`Thanks, ${name}. Your message was submitted in this demo. It has not been sent.`);
    event.currentTarget.reset();
  }
  async function staffLogin(email, password) {
    const data = await request('/api/auth/login', { method: 'POST', body: { email, password } });
    if (!['manager', 'administrator'].includes(data.user.role)) throw new Error('This account is not assigned a manager or administrator role.');
    storeToken(data.access_token); setToken(data.access_token); setUser(data.user); setSessionError('');
    return data.user;
  }
  function change(p, delta) { setCart(old => ({ ...old, [p.id]: Math.max(0, Math.min(p.stock, 99, (Number(old[p.id]) || 0) + delta)) })); }
  async function checkout(event) {
    event.preventDefault();
    if (busy || !lines.length || invalidCart) return;
    if (!user) { setAuthMode('login'); setAuthFeedback('Please log in before placing your order.'); setAuthOpen(true); return; }
    setBusy(true); setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await request('/api/customer/orders', {
        token,
        method: 'POST',
        body: { customer_name: form.customer_name, address: form.address, items: lines.map(p => ({ variant_id: p.id, quantity: p.quantity })) },
      });
      setCart({}); setOpen(false); setNotice(`Order ${data.order_id.slice(0, 8)} received. Total: ${money(data.total_minor, data.currency)}. No payment has been taken.`); await load();
    } catch (err) {
      if (err.status === 401) { logout(); setAuthOpen(true); }
      if (err.status === 409 || err.status === 404) await load();
      setError(err.message || 'Unable to place order. Please try again.');
    }
    finally { setBusy(false); }
  }
  async function submitAuth(event) {
    event.preventDefault();
    if (authBusy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (authMode === 'signup' && values.password !== values.confirm_password) {
      setAuthFeedback('Those passwords do not match. Please try again.');
      form.elements.confirm_password.focus();
      return;
    }
    setAuthBusy(true); setAuthFeedback('');
    try {
      if (authMode === 'signup') {
        await request('/api/auth/register', {
          method: 'POST',
          body: { full_name: values.full_name, email: values.email, password: values.password },
        });
        setAuthMode('login');
        setAuthFeedback('Account created. Log in with your new email and password.');
      } else {
        const data = await request('/api/auth/login', {
          method: 'POST', body: { email: values.email, password: values.password },
        });
        storeToken(data.access_token); setToken(data.access_token); setUser(data.user);
        setSessionError(''); setAuthOpen(false);
        setNotice(`Welcome, ${data.user.full_name}.`);
      }
    } catch (err) { setAuthFeedback(err.message); }
    finally { setAuthBusy(false); }
  }
  if (page === 'admin') return <AdminDashboard user={user} token={token} sessionLoading={sessionLoading} onLogin={staffLogin} onLogout={logout} onExit={() => navigate('home')}/>;
  return <>
    <div className="announcement">FOR THE LOVE OF THE SMALL-SIDED GAME <span>Built for your next match ↗</span></div>
    <header><a className="brand" href="/" onClick={e => { e.preventDefault(); navigate('home'); }}>◈ COURT<span>SUPPLY</span></a><nav><a href="/shop" onClick={e => { e.preventDefault(); navigate('shop'); }}>Shop gear</a><a href="/#about" onClick={e => { e.preventDefault(); navigateToSection('about'); }}>Our game</a><a href="/about" aria-current={page === 'about' ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('about'); }}>About us</a><a href="/contact" aria-current={page === 'contact' ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('contact'); }}>Contact us</a></nav><div className="header-actions">{user ? <><span className="account-name">{user.full_name}</span><button className="account-button" onClick={logout}>Log out</button></> : <button className="account-button" disabled={sessionLoading} onClick={() => { setAuthMode('login'); setAuthFeedback(''); setAuthOpen(true); }}>{sessionLoading ? 'Checking account…' : 'Log in / Sign up'}</button>}<button className="cart-button" onClick={() => setOpen(true)}>Kit bag <span>{count}</span></button></div></header>
    <main>
    {sessionError && <p className="error" role="alert">{sessionError}</p>}
    {page === 'home' ? <>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">MADE FOR THE INDOOR GAME</p><h1>Ready for<br/>your <em>next match.</em></h1><p>Futsal essentials for quick feet, close control, and one more game.</p><button className="primary" onClick={() => navigate('shop')}>Shop all gear <span>↗</span></button><div className="hero-note"><span>01</span> / GOOD GEAR. BETTER SESSIONS.</div></div><div className="court-art" aria-hidden="true"><div className="court-lines"><i/><b/></div><div className="ball">⚽</div><span className="vertical">OWN YOUR NEXT MOVE</span><div className="art-label">THE COURT IS CALLING.<br/><strong>Show up ready.</strong></div><span className="hero-stamp">COURT<br/>SUPPLY<br/><b>⚡</b></span></div></section>
    <section className="benefits" id="about"><span><b>↗</b><strong>Gear for every level</strong><small>New player or regular</small></span><span><b>◎</b><strong>Made for indoor play</strong><small>Built for the small court</small></span><span><b>✳</b><strong>Play together</strong><small>Better sessions start here</small></span></section>
    <section id="featured" className="shop featured-shop"><div className="section-title"><div><p className="eyebrow">A FEW COURT FAVORITES</p><h2>Ready for your next session.</h2></div><button className="text-link" onClick={() => navigate('shop')}>Browse all gear <span>↗</span></button></div>
    {notice && <p role="status" className="notice">{notice}</p>}{error && <p role="alert" className="error">{error} <button onClick={load}>Retry</button></p>}
    {loading ? <p role="status" className="loading-state">Getting the lineup ready…</p> : featuredProducts.length ? <div className="products">{featuredProducts.map(p => <ProductCard key={p.id} p={p} cart={cart} change={change} money={money}/>)}</div> : <p className="empty-catalog">Gear picks will show here when products are available.</p>}
    <button className="primary browse-cta" onClick={() => navigate('shop')}>Shop all gear <span>↗</span></button></section>
    </> : page === 'about' ? <AboutPage onHome={() => navigate('home')} onShop={() => navigate('shop')}/> : page === 'contact' ? <ContactPage onHome={() => navigate('home')} feedback={contactFeedback} onSubmit={submitContact}/> : <section id="shop" className="shop catalog-page"><div className="catalog-heading"><button className="back-link" onClick={() => navigate('home')}>← Back to home</button><p className="eyebrow">THE COURT SUPPLY LINEUP</p><h1>Find your game gear.</h1><p>Browse the essentials. Add your picks to the kit bag.</p></div><div className="filters"><div className="tabs" role="group" aria-label="Filter products by category">{categories.map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search gear" type="search" placeholder="Search products" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
    {notice && <p role="status" className="notice">{notice}</p>}{error && !open && <p role="alert" className="error">{error} <button onClick={load}>Retry</button></p>}
    {loading ? <p role="status" className="loading-state">Getting the lineup ready…</p> : <><p className="results-count">{visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}</p>{visibleProducts.length ? <div className="products">{visibleProducts.map(p => <ProductCard key={p.id} p={p} cart={cart} change={change} money={money}/>)}</div> : <div className="empty-state"><span>⌕</span><h3>No gear found</h3><p>Try another search or choose a different category.</p><button onClick={() => { setQuery(''); setCategory('All gear'); }}>Clear filters</button></div>}</>}
    </section>}
    {page === 'home' && <section className="closing"><p className="eyebrow">MEET YOU ON THE COURT</p><h2>Less scrolling.<br/>More scoring.</h2><button onClick={() => navigate('shop')}>Explore all gear ↗</button></section>}</main><footer><a className="brand" href="/" onClick={e => { e.preventDefault(); navigate('home'); }}>◈ COURT<span>SUPPLY</span></a><p>Your everyday futsal essentials.</p><a className="staff-portal-link" href="/admin" onClick={e => { e.preventDefault(); navigate('admin'); }}>Staff portal ↗</a><small>Demo store · Prices in MYR · No online payments</small></footer>
    {authOpen && <div className="overlay auth-overlay" onClick={() => !authBusy && setAuthOpen(false)}><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={e => e.stopPropagation()}><div className="drawer-title"><div><p className="eyebrow">WELCOME TO COURT SUPPLY</p><h2 id="auth-title">{authMode === 'login' ? 'Good to see you.' : 'Join the team.'}</h2></div><button disabled={authBusy} aria-label="Close account dialog" onClick={() => !authBusy && setAuthOpen(false)}>✕</button></div><p className="auth-intro">{authMode === 'login' ? 'Log in to keep your game-day essentials close.' : 'Create an account for a smoother match-day shop.'}</p><div className="auth-tabs" role="tablist" aria-label="Account options"><button disabled={authBusy} type="button" role="tab" aria-selected={authMode === 'login'} className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthFeedback(''); }}>Log in</button><button disabled={authBusy} type="button" role="tab" aria-selected={authMode === 'signup'} className={authMode === 'signup' ? 'active' : ''} onClick={() => { setAuthMode('signup'); setAuthFeedback(''); }}>Sign up</button></div><form onSubmit={submitAuth} key={authMode} noValidate={false}>{authMode === 'signup' && <label>Full name<input name="full_name" type="text" required minLength="2" maxLength="160" autoComplete="name" placeholder="Your name"/></label>}<label>Email address<input name="email" type="email" required maxLength="254" autoComplete="email" placeholder="you@example.com"/></label><label>Password<input name="password" type="password" required minLength={authMode === 'signup' ? 12 : 1} maxLength="128" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder={authMode === 'signup' ? 'At least 12 characters' : 'Your password'}/></label>{authMode === 'signup' && <label>Confirm password<input name="confirm_password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" placeholder="Enter your password again"/></label>}<p className="auth-hint">{authMode === 'signup' ? 'Use between 12 and 128 characters.' : 'Log in with your registered email and password.'}</p><button className="primary auth-submit" type="submit" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'login' ? 'Log in' : 'Create account'} <span>↗</span></button></form>{authFeedback && <p className="auth-feedback" role="status">{authFeedback}</p>}</section></div>}
    {open && <div className="overlay" onClick={() => !busy && setOpen(false)}><section className="drawer" role="dialog" aria-modal="true" aria-label="Your kit bag" onClick={e => e.stopPropagation()}><div className="drawer-title"><h2>Your kit bag ({count})</h2><button aria-label="Close kit bag" disabled={busy} onClick={() => setOpen(false)}>✕</button></div>{error && <p role="alert" className="error">{error}</p>}{!lines.length ? <p>Your bag is empty. Your next match starts here.</p> : <><div className="cart-lines">{lines.map(p => <div className="cart-line" key={p.id}><span className="mini-icon">{p.icon}</span><div><strong>{p.name}</strong><p>{p.size} / {p.colour}</p><p>{money(p.price_cents, p.currency)}</p>{p.quantity > p.stock && <p role="alert">Only {p.stock} available. Reduce the quantity or remove this item.</p>}<div className="quantity"><button disabled={busy} aria-label={`Remove one ${p.name}`} onClick={() => change(p, -1)}>−</button><span>{p.quantity}</span><button disabled={busy || p.quantity >= Math.min(p.stock, 99)} aria-label={`Add one ${p.name}`} onClick={() => change(p, 1)}>+</button></div></div><button disabled={busy} onClick={() => setCart(old => ({ ...old, [p.id]: 0 }))}>Remove</button></div>)}</div><div className="total"><span>Total</span><strong>{money(total, lines[0]?.currency)}</strong></div>{invalidCart && <p className="error" role="alert">Check item quantities and use one currency per order.</p>}<p className="muted">Demo checkout. No payment is collected. No shipping or tax charges are added.</p><form onSubmit={checkout}><label>Full name<input name="customer_name" defaultValue={user?.full_name || ''} required minLength="2" maxLength="100" autoComplete="name"/></label><label>Email<input name="email" type="email" defaultValue={user?.email || ''} required maxLength="254" autoComplete="email"/></label><label>Delivery address<textarea name="address" required minLength="5" maxLength="500" autoComplete="street-address"/></label><button className="primary" disabled={busy || invalidCart}>{busy ? 'Placing order…' : user ? 'Place demo order ↗' : 'Log in to place order ↗'}</button></form></>}</section></div>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
