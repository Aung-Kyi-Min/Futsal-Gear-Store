import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const money = cents => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(cents / 100);
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
function App() {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('All gear');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem('court-cart')) || {}; } catch { return {}; } });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { const res = await fetch(`${API}/api/products`); if (!res.ok) throw Error(); const data = await res.json(); setProducts(data.products); }
    catch { setError('The store could not connect. Check that the Python backend is running, then retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { localStorage.setItem('court-cart', JSON.stringify(cart)); }, [cart]);
  const lines = products.filter(p => Number.isInteger(cart[p.id]) && cart[p.id] > 0).map(p => ({ ...p, quantity: cart[p.id] }));
  const count = lines.reduce((sum, p) => sum + p.quantity, 0);
  const total = lines.reduce((sum, p) => sum + p.quantity * p.price_cents, 0);
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
  return <>
    <div className="announcement">FOR THE LOVE OF THE SMALL-SIDED GAME <span>Built for your next match ↗</span></div>
    <header><a className="brand" href="#">◈ COURT<span>SUPPLY</span></a><nav><a href="#shop">Shop gear</a><a href="#about">Our game</a></nav><button className="cart-button" onClick={() => setOpen(true)}>Kit bag <span>{count}</span></button></header>
    <main><section className="hero"><div className="hero-copy"><p className="eyebrow">SMALL COURT. BIG ENERGY.</p><h1>Your game.<br/>Your court.<br/><em>Your gear.</em></h1><p>From the first touch to the final whistle. Discover futsal essentials made for the way you play.</p><a className="primary" href="#shop">Find your next essential <span>↗</span></a><div className="hero-note">01 / THE EVERYDAY PLAYER COLLECTION</div></div><div className="court-art" aria-hidden="true"><div className="court-lines"><i/><b/></div><div className="ball">⚽</div><span className="vertical">OWN YOUR NEXT MOVE</span><div className="art-label">THE COURT IS CALLING.<br/><strong>Show up ready.</strong></div></div></section>
    <section className="benefits" id="about"><span>↗ Gear for every level</span><span>◎ Made for the indoor game</span><span>✳ Play together. Play better.</span></section>
    <section id="shop" className="shop"><div className="section-title"><div><p className="eyebrow">PACK YOUR POTENTIAL</p><h2>The starting lineup.</h2></div><p>Good gear. Better sessions.</p></div><div className="filters"><div className="tabs">{['All gear', 'Footwear', 'Balls', 'Apparel', 'Accessories'].map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><input aria-label="Search gear" type="search" placeholder="Search gear…" value={query} onChange={e => setQuery(e.target.value)}/></div>
    {notice && <p role="status" className="notice">{notice}</p>}{error && !open && <p role="alert" className="error">{error} <button onClick={load}>Retry</button></p>}
    {loading ? <p role="status">Getting the lineup ready…</p> : <div className="products">{products.filter(p => (category === 'All gear' || category === p.category) && p.name.toLowerCase().includes(query.toLowerCase())).map(p => <article key={p.id}><div className={`product-art ${p.color}`}><span className="tag">{p.category}</span><span className="product-icon" aria-hidden="true">{p.icon}</span><span className="art-word">COURT / SUPPLY</span></div><div className="product-heading"><h3>{p.name}</h3><strong>{money(p.price_cents)}</strong></div><p>{p.description}</p><button className="add" disabled={!p.stock || (cart[p.id] || 0) >= p.stock} onClick={() => change(p, 1)}>{!p.stock ? 'Sold out' : (cart[p.id] || 0) >= p.stock ? 'All available items in bag' : 'Add to kit bag'} <span>+</span></button></article>)}</div>}
    {!loading && !error && !products.some(p => (category === 'All gear' || category === p.category) && p.name.toLowerCase().includes(query.toLowerCase())) && <p>No gear matches your search.</p>}</section>
    <section className="closing"><p className="eyebrow">MEET YOU ON THE COURT</p><h2>Less scrolling.<br/>More scoring.</h2><a href="#shop">Get match-ready ↗</a></section></main><footer><a className="brand" href="#">◈ COURT<span>SUPPLY</span></a><p>Your everyday futsal essentials.</p><small>Demo store · Prices in MYR · No online payments</small></footer>
    {open && <div className="overlay" onClick={() => !busy && setOpen(false)}><section className="drawer" role="dialog" aria-modal="true" aria-label="Your kit bag" onClick={e => e.stopPropagation()}><div className="drawer-title"><h2>Your kit bag ({count})</h2><button aria-label="Close kit bag" disabled={busy} onClick={() => setOpen(false)}>✕</button></div>{error && <p role="alert" className="error">{error}</p>}{!lines.length ? <p>Your bag is empty. Your next match starts here.</p> : <><div className="cart-lines">{lines.map(p => <div className="cart-line" key={p.id}><span className="mini-icon">{p.icon}</span><div><strong>{p.name}</strong><p>{money(p.price_cents)}</p><div className="quantity"><button disabled={busy} aria-label={`Remove one ${p.name}`} onClick={() => change(p, -1)}>−</button><span>{p.quantity}</span><button disabled={busy || p.quantity >= p.stock} aria-label={`Add one ${p.name}`} onClick={() => change(p, 1)}>+</button></div></div><button disabled={busy} onClick={() => setCart(old => ({ ...old, [p.id]: 0 }))}>Remove</button></div>)}</div><div className="total"><span>Total</span><strong>{money(total)}</strong></div><p className="muted">Demo checkout. No payment is collected. No shipping or tax charges are added.</p><form onSubmit={checkout}><label>Full name<input name="customer_name" required minLength="2" maxLength="100" autoComplete="name"/></label><label>Email<input name="email" type="email" required maxLength="254" autoComplete="email"/></label><label>Delivery address<textarea name="address" required minLength="5" maxLength="500" autoComplete="street-address"/></label><button className="primary" disabled={busy}>{busy ? 'Placing order…' : 'Place demo order ↗'}</button></form></>}</section></div>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
