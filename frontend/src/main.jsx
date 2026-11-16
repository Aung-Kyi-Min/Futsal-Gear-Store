import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { request, storedToken, storeToken } from './api.js';
import AdminDashboard from './AdminDashboard.jsx';
import OrderHistory from './OrderHistory.jsx';
import { loadCatalog } from './catalog.js';

const money = (cents, currency = "MYR") =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(
    cents / 100,
  );
function ProductCard({ p, cart, change, onSelect }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected =
    p.variants.find((v) => v.id === selectedId) ||
    p.variants.find((v) => v.stock > 0) ||
    p.variants[0];
  const quantity = selected ? cart[selected.id] || 0 : 0;
  const stock = selected?.stock || 0;
  return (
    <article>
      <button className="product-image-link" type="button" onClick={() => onSelect(p)} aria-label={`View details for ${p.name}`}>
        <div className="product-art cream">
          <span className="tag">{p.category}</span>
          {p.image_url ? (
            <img className="catalog-image" src={p.image_url} alt={p.name} style={{ objectFit: "contain", objectPosition: "center" }} onError={(event) => { event.currentTarget.hidden = true; }}/>
          ) : (
            <span className="product-icon" aria-hidden="true">{p.icon}</span>
          )}
          <span className="art-word">VIEW DETAILS ↗</span>
        </div>
      </button>
      <div className="product-heading">
        <button className="product-title-link" type="button" onClick={() => onSelect(p)}><h3>{p.name}</h3></button>
        <strong>
          {money(selected?.price_cents ?? p.price_cents, p.currency)}
        </strong>
      </div>
      <p>
        {p.brand} · {p.description}
      </p>
      <label className="variant-picker">
        Size / colour
        <select
          aria-label={`Size and colour for ${p.name}`}
          value={selected?.id || ""}
          disabled={!p.variants.length}
          onChange={(event) => setSelectedId(Number(event.target.value))}
        >
          {!p.variants.length && (
            <option value="">No variants available</option>
          )}
          {p.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.size} / {v.colour}
              {!v.stock ? " — Sold out" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="product-meta">
        <span className={stock ? "in-stock" : "out-stock"}>
          {stock ? "In stock" : "Sold out"}
        </span>
        {stock > 0 && stock < 5 && <span>Only {stock} left</span>}
      </div>
      <button
        className="add"
        disabled={!stock || quantity >= stock || quantity >= 99}
        onClick={() => change(selected, 1)}
      >
        {!stock
          ? "Sold out"
          : quantity >= Math.min(stock, 99)
            ? "Bag limit reached"
            : "Add to kit bag"}{" "}
        <span>+</span>
      </button>
    </article>
  );
}
function ProductDetailPage({ product, cart, change, money, onBack }) {
  const initialVariant = product.variants.find(v => v.stock > 0) || product.variants[0];
  const [variantId, setVariantId] = useState(initialVariant?.id || '');
  const [angle, setAngle] = useState(0);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef(null);
  const variant = product.variants.find(v => v.id === variantId) || initialVariant;
  const quantity = variant ? cart[variant.id] || 0 : 0;
  const stock = variant?.stock || 0;
  const hasAngleViews = Boolean(product.angle_image_url);
  const viewIndex = Math.floor(((((angle + 45) % 360) + 360) % 360) / 90);
  const viewPosition = [['0%', '0%'], ['100%', '0%'], ['0%', '100%'], ['100%', '100%']][viewIndex];
  const viewPositions = [['0% 0%', '100% 0%'], ['0% 100%', '100% 100%']].flat();
  function beginDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    dragRef.current = { x: event.clientX, angle };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveDrag(event) {
    if (!dragRef.current) return;
    const delta = event.clientX - dragRef.current.x;
    setAngle((dragRef.current.angle + delta * 0.65 + 360) % 360);
  }
  function endDrag() { dragRef.current = null; }
  function rotate(delta) { setAngle(current => (current + delta + 360) % 360); }
  function selectView(index) { setAngle(index * 90); }
  function zoomBy(delta) { setZoom(current => Math.max(1, Math.min(2.5, Number((current + delta).toFixed(2))))); }
  function resetViewer() { setAngle(0); setZoom(1); }
  const angleLabel = `${Math.round(angle)}°`;
  return <section className="product-detail-page">
    <div className="product-detail-crumbs"><button onClick={onBack}>← Shop</button><span>/</span><span>{product.category}</span><span>/</span><strong>{product.name}</strong></div>
    <div className="product-detail-layout">
      <div className="product-viewer-column"><div className="product-viewer" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={event => { if (event.key === 'ArrowLeft') rotate(-12); if (event.key === 'ArrowRight') rotate(12); }} tabIndex="0" role="group" aria-label={`Interactive 360 degree preview of ${product.name}`}>
        <span className="viewer-badge">↻ &nbsp; PRODUCT 360°</span><span className="viewer-angle">{hasAngleViews ? `VIEW ${viewIndex + 1} / 4` : angleLabel}</span>
        {product.angle_image_url ? <div className="viewer-angle-frame" role="img" aria-label={`${product.name}, view ${viewIndex + 1} of 4`} style={{ backgroundImage: `url("${product.angle_image_url}")`, backgroundPosition: `${viewPosition[0]} ${viewPosition[1]}`, transform: `scale(${zoom})` }}/> : product.image_url ? <img className="viewer-product-image" src={product.image_url} alt={product.name} draggable="false" style={{ transform: `scale(${zoom})` }} onError={event => { event.currentTarget.hidden = true; }}/> : <span className="viewer-fallback" aria-hidden="true">{product.icon || '⚽'}</span>}
        <div className="viewer-instruction"><span>↔</span> Drag to see the product from different angles · Use controls to zoom</div>
      </div><div className="viewer-controls"><button type="button" aria-label="Show previous product view" onClick={() => rotate(-90)} disabled={!hasAngleViews}>↶</button><button type="button" aria-label="Show next product view" onClick={() => rotate(90)} disabled={!hasAngleViews}>↷</button><span className="viewer-control-divider"/><button type="button" aria-label="Zoom out" onClick={() => zoomBy(-0.25)} disabled={zoom <= 1}>−</button><span className="zoom-value">{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom in" onClick={() => zoomBy(0.25)} disabled={zoom >= 2.5}>+</button><button className="viewer-reset" type="button" onClick={resetViewer}>Reset view</button></div>{hasAngleViews && <div className="viewer-view-selector" role="group" aria-label={`Choose a view of ${product.name}`}>{viewPositions.map((position, index) => <button key={position} className={`viewer-view-option${viewIndex === index ? ' active' : ''}`} type="button" aria-label={`Show product view ${index + 1}`} aria-pressed={viewIndex === index} onClick={() => selectView(index)}><span className="viewer-view-thumb" style={{ backgroundImage: `url("${product.angle_image_url}")`, backgroundPosition: position }}/><small>View 0{index + 1}</small></button>)}</div>}<p className="viewer-demo-note">{hasAngleViews ? 'Four product specific views · Drag or select a view to inspect it' : 'More product views are not available for this item yet.'}</p></div>
      <div className="product-detail-info"><p className="eyebrow">{product.brand} · {product.category}</p><h1>{product.name}</h1><p className="detail-price">{money(variant?.price_cents ?? product.price_cents, product.currency)}</p><p className="detail-description">{product.description}</p>
        <label className="detail-variant-picker">Size / colour<select aria-label={`Choose size and colour for ${product.name}`} value={variant?.id || ''} disabled={!product.variants.length} onChange={event => setVariantId(Number(event.target.value))}>{!product.variants.length && <option value="">No options available</option>}{product.variants.map(v => <option key={v.id} value={v.id}>{v.size} / {v.colour}{!v.stock ? ' — Sold out' : ''}</option>)}</select></label>
        <div className="detail-stock"><span className={stock ? 'in-stock' : 'out-stock'}><i/>{stock ? 'In stock' : 'Sold out'}</span>{stock > 0 && stock <= 5 && <span>Only {stock} left</span>}{variant?.sku && <small>SKU {variant.sku}</small>}</div>
        <button className="primary detail-add" disabled={!stock || quantity >= Math.min(stock, 99)} onClick={() => change(variant, 1)}>{!stock ? 'Sold out' : quantity >= Math.min(stock, 99) ? 'Bag limit reached' : 'Add to kit bag'} <span>＋</span></button>
        <div className="detail-assurance"><div><span>↗</span><p><strong>Made for indoor play</strong><small>Equipment picked for the futsal court.</small></p></div><div><span>◎</span><p><strong>Product details</strong><small>Check sizing and availability before adding to your bag.</small></p></div></div>
        <details className="detail-accordion" open><summary>Product description</summary><p>{product.description}</p><p>Brand: {product.brand}<br/>Category: {product.category}</p></details>
      </div>
    </div>
  </section>;
}
function AboutPage({ onHome, onShop }) {
  return (
    <div className="info-page about-page">
      <div className="info-page-heading">
        <button className="back-link" onClick={onHome}>
          ← Back to home
        </button>
        <p className="eyebrow">A LITTLE ABOUT OUR GAME</p>
        <h1>
          Made for the moments
          <br />
          between kick-off and
          <br />
          <em>one more game.</em>
        </h1>
        <p>Small court. Big energy. Gear that helps you feel ready to play.</p>
      </div>
      <section className="about-us-section">
        <div className="about-copy">
          <h2>
            Futsal is more than
            <br />
            ninety minutes.
          </h2>
          <p>
            Court Supply is a demo futsal shop built around the energy of the
            indoor game. We bring together practical footwear, balls, apparel,
            and accessories for players who love a quick pass and a close
            finish.
          </p>
          <p>
            Whether it’s your first session or your weekly run with friends, we
            want finding your next essential to feel straightforward and fun.
          </p>
          <button className="text-link" onClick={onShop}>
            Explore the lineup <span>↗</span>
          </button>
        </div>
        <div className="about-feature">
          <img className="about-feature-image" src="/images/about-court-ball.jpg" alt="Futsal ball on an indoor court" />
          <div>
            <small>OUR POINT OF VIEW</small>
            <strong>
              Good gear should make
              <br />
              getting on court easier.
            </strong>
          </div>
        </div>
      </section>
      <section className="about-values">
        <article>
          <span>01</span>
          <h2>Made for the game</h2>
          <p>
            Useful kit chosen for quick play, close control, and indoor courts.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Easy to explore</h2>
          <p>
            Clear product details help you find a good fit for your next
            session.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Better together</h2>
          <p>Futsal is at its best when everyone gets involved.</p>
        </article>
      </section>
      <div className="info-page-cta">
        <strong>Ready for your next session?</strong>
        <button className="primary" onClick={onShop}>
          Browse the gear <span>↗</span>
        </button>
      </div>
    </div>
  );
}

function ContactPage({ onHome, feedback, onSubmit }) {
  return (
    <div className="info-page contact-page">
      <div className="info-page-heading">
        <button className="back-link" onClick={onHome}>
          ← Back to home
        </button>
        <p className="eyebrow">WE’RE HERE TO HELP</p>
        <h1>
          Let’s talk
          <br />
          futsal gear.
        </h1>
        <p>
          Questions about an order, product, or finding the right gear? Send us
          a note.
        </p>
      </div>
      <section className="contact-section">
        <div className="contact-intro">
          <p className="eyebrow">CONTACT DETAILS</p>
          <h2>
            Need a hand
            <br />
            with your kit?
          </h2>
          <p>
            Our demo team is happy to help with product questions and order
            guidance.
          </p>
          <div className="contact-details">
            <a href="mailto:hello@courtsupply.test">
              <span>✉</span>
              <span>
                <small>EMAIL</small>
                <strong>hello@courtsupply.test</strong>
              </span>
            </a>
            <a href="tel:+60355550148">
              <span>↗</span>
              <span>
                <small>PHONE</small>
                <strong>+60 3-5555 0148</strong>
              </span>
            </a>
            <div>
              <span>◷</span>
              <span>
                <small>DEMO STORE HOURS</small>
                <strong>Tue–Sun · 10:00 am–7:00 pm</strong>
              </span>
            </div>
            <p className="contact-demo-note">
              Sample contact details for this demo store.
            </p>
          </div>
        </div>
        <form className="contact-form" onSubmit={onSubmit}>
          <p className="eyebrow">DROP US A LINE</p>
          <h3>What can we help with?</h3>
          <label>
            Your name
            <input
              name="contact_name"
              type="text"
              required
              minLength="2"
              maxLength="100"
              placeholder="Name"
            />
          </label>
          <label>
            Email address
            <input
              name="contact_email"
              type="email"
              required
              maxLength="254"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Topic
            <select name="contact_topic" defaultValue="Order question">
              <option>Order question</option>
              <option>Product information</option>
              <option>Returns and exchanges</option>
              <option>Something else</option>
            </select>
          </label>
          <label>
            Message
            <textarea
              name="contact_message"
              required
              minLength="10"
              maxLength="1000"
              rows="4"
              placeholder="Tell us how we can help…"
            />
          </label>
          <button className="primary" type="submit">
            Send message <span>↗</span>
          </button>
          {feedback && (
            <p className="contact-feedback" role="status">
              {feedback}
            </p>
          )}
          <small>Demo form only. Your message won’t be sent or stored.</small>
        </form>
      </section>
    </div>
  );
}

const slugifyProduct = (name) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pagePaths = {
  home: "/",
  shop: "/shop",
  admin: "/admin",
  about: "/about",
  contact: "/contact",
  orders: "/orders",
};

function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const productSlug = path.match(/^\/shop\/([^/]+)\/?$/)?.[1] || "";
  const orderId = path.match(/^\/orders\/([^/]+)\/?$/)?.[1];
  const page = productSlug ? "product" : orderId ? "orders" : Object.keys(pagePaths).find((name) => pagePaths[name] === path) || "home";
  const [confirmedOrderId, setConfirmedOrderId] = useState(null);
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("All gear");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("court-variant-cart")) || {};
    } catch {
      return {};
    }
  });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contactFeedback, setContactFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authFeedback, setAuthFeedback] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [token, setToken] = useState(storedToken);
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(storedToken()));
  const [sessionError, setSessionError] = useState("");
  useEffect(() => {
    if (!token) {
      setSessionLoading(false);
      return;
    }
    let active = true;
    setSessionLoading(true);
    request("/api/auth/me", { token })
      .then((data) => {
        if (active) {
          setUser(data);
          setSessionError("");
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) {
          storeToken("");
          setToken("");
          setUser(null);
          setSessionError("Your session has expired. Please log in again.");
        } else setSessionError(err.message);
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);
  function logout() {
    storeToken("");
    setToken("");
    setUser(null);
    setSessionError("");
    setSessionLoading(false);
    setOpen(false);
    setAuthOpen(false);
    setAuthFeedback("");
    setError("");
    setCategory("All gear");
    setQuery("");
    setConfirmedOrderId(null);
    window.history.replaceState({}, "", "/");
    setPath("/");
    window.scrollTo({ top: 0, behavior: "instant" });
    setNotice("You have logged out.");
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      setProducts(await loadCatalog());
    } catch (err) {
      setError(err.message || "Unable to load the catalog. Please retry.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("court-variant-cart", JSON.stringify(cart));
    } catch {
      /* Keep the bag usable when storage is blocked. */
    }
  }, [cart]);
  const lines = products
    .flatMap((p) => p.variants)
    .filter((p) => Number.isInteger(cart[p.id]) && cart[p.id] > 0)
    .map((p) => ({ ...p, quantity: cart[p.id] }));
  const count = lines.reduce((sum, p) => sum + p.quantity, 0);
  const total = lines.reduce((sum, p) => sum + p.quantity * p.price_cents, 0);
  const currencies = new Set(lines.map((p) => p.currency));
  const invalidCart =
    currencies.size > 1 ||
    lines.some((p) => p.quantity > p.stock || p.quantity > 99);
  const categories = ["All gear", ...new Set(products.map((p) => p.category))];
  const visibleProducts = products.filter(
    (p) =>
      (category === "All gear" || category === p.category) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  const featuredProducts = products.filter((p) => p.stock > 0).slice(0, 5);
  const detailProduct = productSlug ? products.find((p) => slugifyProduct(p.name) === productSlug) : null;
  function navigate(nextPage, nextOrderId) {
    const nextPath = nextPage === "orders" && nextOrderId
      ? `/orders/${nextOrderId}`
      : nextPage === "product" && nextOrderId
        ? `/shop/${slugifyProduct(nextOrderId.name)}`
      : pagePaths[nextPage];
    if (window.location.pathname !== nextPath)
      window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function navigateToSection(id) {
    if (page !== "home") {
      if (window.location.pathname !== "/")
        window.history.pushState({}, "", "/");
      setPath("/");
      window.setTimeout(
        () =>
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }
  function submitContact(event) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("contact_name");
    setContactFeedback(
      `Thanks, ${name}. Your message was submitted in this demo. It has not been sent.`,
    );
    event.currentTarget.reset();
  }
  async function staffLogin(email, password) {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    if (!["manager", "administrator"].includes(data.user.role))
      throw new Error(
        "This account is not assigned a manager or administrator role.",
      );
    storeToken(data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    setSessionError("");
    return data.user;
  }
  function change(p, delta) {
    setCart((old) => ({
      ...old,
      [p.id]: Math.max(
        0,
        Math.min(p.stock, 99, (Number(old[p.id]) || 0) + delta),
      ),
    }));
  }
  async function checkout(event) {
    event.preventDefault();
    if (busy || !lines.length || invalidCart) return;
    if (!user) {
      setAuthMode("login");
      setAuthFeedback("Please log in before placing your order.");
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await request("/api/customer/orders", {
        token,
        method: "POST",
        body: {
          customer_name: form.customer_name,
          address: form.address,
          items: lines.map((p) => ({ variant_id: p.id, quantity: p.quantity })),
        },
      });
      setCart({});
      setOpen(false);
      setNotice("");
      setConfirmedOrderId(data.order_id);
      navigate("orders", data.order_id);
      await load();
    } catch (err) {
      if (err.status === 401) {
        logout();
        setAuthOpen(true);
      }
      if (err.status === 409 || err.status === 404) await load();
      setError(err.message || "Unable to place order. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function submitAuth(event) {
    event.preventDefault();
    if (authBusy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (authMode === "signup" && values.password !== values.confirm_password) {
      setAuthFeedback("Those passwords do not match. Please try again.");
      form.elements.confirm_password.focus();
      return;
    }
    setAuthBusy(true);
    setAuthFeedback("");
    try {
      if (authMode === "signup") {
        await request("/api/auth/register", {
          method: "POST",
          body: {
            full_name: values.full_name,
            email: values.email,
            password: values.password,
          },
        });
        setAuthMode("login");
        setAuthFeedback(
          "Account created. Log in with your new email and password.",
        );
      } else {
        const data = await request("/api/auth/login", {
          method: "POST",
          body: { email: values.email, password: values.password },
        });
        storeToken(data.access_token);
        setToken(data.access_token);
        setUser(data.user);
        setSessionError("");
        setAuthOpen(false);
        setNotice(`Welcome, ${data.user.full_name}.`);
      }
    } catch (err) {
      setAuthFeedback(err.message);
    } finally {
      setAuthBusy(false);
    }
  }
  if (page === "admin")
    return (
      <AdminDashboard
        user={user}
        token={token}
        sessionLoading={sessionLoading}
        onLogin={staffLogin}
        onLogout={logout}
        onExit={() => navigate("home")}
      />
    );
  return (
    <>
      <div className="announcement">
        FOR THE LOVE OF THE SMALL-SIDED GAME{" "}
        <span>Built for your next match ↗</span>
      </div>
      <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          ◈ COURT<span>SUPPLY</span>
        </a>
        <nav>
          <a
            href="/shop"
            onClick={(e) => {
              e.preventDefault();
              navigate("shop");
            }}
          >
            Shop gear
          </a>
          <a
            href="/#about"
            onClick={(e) => {
              e.preventDefault();
              navigateToSection("about");
            }}
          >
            Our game
          </a>
          <a
            href="/about"
            aria-current={page === "about" ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate("about");
            }}
          >
            About us
          </a>
          <a
            href="/contact"
            aria-current={page === "contact" ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate("contact");
            }}
          >
            Contact us
          </a>
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <span className="account-name">{user.full_name}</span>
              <a
                className="account-button orders-link"
                href="/orders"
                aria-current={page === "orders" ? "page" : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  navigate("orders");
                }}
              >
                My orders
              </a>
              <button className="account-button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button
              className="account-button"
              disabled={sessionLoading}
              onClick={() => {
                setAuthMode("login");
                setAuthFeedback("");
                setAuthOpen(true);
              }}
            >
              {sessionLoading ? "Checking account…" : "Log in / Sign up"}
            </button>
          )}
          <button className="cart-button" onClick={() => setOpen(true)}>
            Kit bag <span>{count}</span>
          </button>
        </div>
      </header>
      <main>
        {sessionError && (
          <p className="error" role="alert">
            {sessionError}
          </p>
        )}
        {page === "orders" ? (
          <OrderHistory
            key={`${path}:${user?.user_id || ""}`}
            user={user}
            token={token}
            sessionLoading={sessionLoading}
            orderId={orderId}
            confirmed={confirmedOrderId === orderId}
            formatMoney={money}
            onLogin={(expired) => {
              if (expired) {
                storeToken("");
                setToken("");
                setUser(null);
                setConfirmedOrderId(null);
              }
              setAuthMode("login");
              setAuthFeedback("");
              setAuthOpen(true);
            }}
            onShop={() => navigate("shop")}
            onHistory={() => navigate("orders")}
            onOpenOrder={(id) => navigate("orders", id)}
          />
        ) : page === "product" ? loading ? (
          <p role="status" className="loading-state">Loading product details…</p>
        ) : detailProduct ? (
          <ProductDetailPage key={detailProduct.id} product={detailProduct} cart={cart} change={change} money={money} onBack={() => navigate("shop")}/>
        ) : (
          <section className="product-not-found"><p className="eyebrow">PRODUCT NOT FOUND</p><h1>We couldn’t find that item.</h1><button className="primary" onClick={() => navigate("shop")}>Back to all gear <span>↗</span></button></section>
        ) : page === "home" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">MADE FOR THE INDOOR GAME</p>
                <h1>
                  Ready for
                  <br />
                  your <em>next match.</em>
                </h1>
                <p>
                  Futsal essentials for quick feet, close control, and one more
                  game.
                </p>
                <button className="primary" onClick={() => navigate("shop")}>
                  Shop all gear <span>↗</span>
                </button>
                <div className="hero-note">
                  <span>01</span> / GOOD GEAR. BETTER SESSIONS.
                </div>
              </div>
              <div className="court-art" aria-hidden="true">
                <img className="hero-court-image" src="/images/home-court-ball.jpg" alt="" />
                <span className="vertical">OWN YOUR NEXT MOVE</span>
                <div className="art-label">
                  THE COURT IS CALLING.
                  <br />
                  <strong>Show up ready.</strong>
                </div>
                <span className="hero-stamp">
                  COURT
                  <br />
                  SUPPLY
                  <br />
                  <b>⚡</b>
                </span>
              </div>
            </section>
            <section className="benefits" id="about">
              <span>
                <b>↗</b>
                <strong>Gear for every level</strong>
                <small>New player or regular</small>
              </span>
              <span>
                <b>◎</b>
                <strong>Made for indoor play</strong>
                <small>Built for the small court</small>
              </span>
              <span>
                <b>✳</b>
                <strong>Play together</strong>
                <small>Better sessions start here</small>
              </span>
            </section>
            <section id="featured" className="shop featured-shop">
              <div className="section-title">
                <div>
                  <p className="eyebrow">A FEW COURT FAVORITES</p>
                  <h2>Ready for your next session.</h2>
                </div>
                <button className="text-link" onClick={() => navigate("shop")}>
                  Browse all gear <span>↗</span>
                </button>
              </div>
              {notice && (
                <p role="status" className="notice">
                  {notice}
                </p>
              )}
              {error && (
                <p role="alert" className="error">
                  {error} <button onClick={load}>Retry</button>
                </p>
              )}
              {loading ? (
                <p role="status" className="loading-state">
                  Getting the lineup ready…
                </p>
              ) : featuredProducts.length ? (
                <div className="products">
                  {featuredProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      p={p}
                      cart={cart}
                      change={change}
                      money={money}
                      onSelect={(product) => navigate("product", product)}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty-catalog">
                  Gear picks will show here when products are available.
                </p>
              )}
              <button
                className="primary browse-cta"
                onClick={() => navigate("shop")}
              >
                Shop all gear <span>↗</span>
              </button>
            </section>
          </>
        ) : page === "about" ? (
          <AboutPage
            onHome={() => navigate("home")}
            onShop={() => navigate("shop")}
          />
        ) : page === "contact" ? (
          <ContactPage
            onHome={() => navigate("home")}
            feedback={contactFeedback}
            onSubmit={submitContact}
          />
        ) : (
          <section id="shop" className="shop catalog-page">
            <div className="catalog-heading">
              <button className="back-link" onClick={() => navigate("home")}>
                ← Back to home
              </button>
              <p className="eyebrow">THE COURT SUPPLY LINEUP</p>
              <h1>Find your game gear.</h1>
              <p>Browse the essentials. Add your picks to the kit bag.</p>
            </div>
            <div className="filters">
              <div
                className="tabs"
                role="group"
                aria-label="Filter products by category"
              >
                {categories.map((c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="Search gear"
                  type="search"
                  placeholder="Search products"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            {error && !open && (
              <p role="alert" className="error">
                {error} <button onClick={load}>Retry</button>
              </p>
            )}
            {loading ? (
              <p role="status" className="loading-state">
                Getting the lineup ready…
              </p>
            ) : (
              <>
                <p className="results-count">
                  {visibleProducts.length}{" "}
                  {visibleProducts.length === 1 ? "product" : "products"}
                </p>
                {visibleProducts.length ? (
                  <div className="products">
                    {visibleProducts.map((p) => (
                      <ProductCard
                        key={p.id}
                        p={p}
                        cart={cart}
                        change={change}
                        money={money}
                        onSelect={(product) => navigate("product", product)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span>⌕</span>
                    <h3>No gear found</h3>
                    <p>Try another search or choose a different category.</p>
                    <button
                      onClick={() => {
                        setQuery("");
                        setCategory("All gear");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
        {page === "home" && (
          <section className="closing">
            <p className="eyebrow">MEET YOU ON THE COURT</p>
            <h2>
              Less scrolling.
              <br />
              More scoring.
            </h2>
            <button onClick={() => navigate("shop")}>Explore all gear ↗</button>
          </section>
        )}
      </main>
      <footer>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          ◈ COURT<span>SUPPLY</span>
        </a>
        <p>Your everyday futsal essentials.</p>
        <a
          className="staff-portal-link"
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            navigate("admin");
          }}
        >
          Staff portal ↗
        </a>
        <small>Demo store · Prices in MYR · No online payments</small>
      </footer>
      {authOpen && (
        <div
          className="overlay auth-overlay"
          onClick={() => !authBusy && setAuthOpen(false)}
        >
          <section
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-title">
              <div>
                <p className="eyebrow">WELCOME TO COURT SUPPLY</p>
                <h2 id="auth-title">
                  {authMode === "login" ? "Good to see you." : "Join the team."}
                </h2>
              </div>
              <button
                disabled={authBusy}
                aria-label="Close account dialog"
                onClick={() => !authBusy && setAuthOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="auth-intro">
              {authMode === "login"
                ? "Log in to keep your game-day essentials close."
                : "Create an account for a smoother match-day shop."}
            </p>
            <div
              className="auth-tabs"
              role="tablist"
              aria-label="Account options"
            >
              <button
                disabled={authBusy}
                type="button"
                role="tab"
                aria-selected={authMode === "login"}
                className={authMode === "login" ? "active" : ""}
                onClick={() => {
                  setAuthMode("login");
                  setAuthFeedback("");
                }}
              >
                Log in
              </button>
              <button
                disabled={authBusy}
                type="button"
                role="tab"
                aria-selected={authMode === "signup"}
                className={authMode === "signup" ? "active" : ""}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthFeedback("");
                }}
              >
                Sign up
              </button>
            </div>
            <form onSubmit={submitAuth} key={authMode} noValidate={false}>
              {authMode === "signup" && (
                <label>
                  Full name
                  <input
                    name="full_name"
                    type="text"
                    required
                    minLength="2"
                    maxLength="160"
                    autoComplete="name"
                    placeholder="Your name"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  maxLength="254"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={authMode === "signup" ? 12 : 1}
                  maxLength="128"
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    authMode === "signup"
                      ? "At least 12 characters"
                      : "Your password"
                  }
                />
              </label>
              {authMode === "signup" && (
                <label>
                  Confirm password
                  <input
                    name="confirm_password"
                    type="password"
                    required
                    minLength="12"
                    maxLength="128"
                    autoComplete="new-password"
                    placeholder="Enter your password again"
                  />
                </label>
              )}
              <p className="auth-hint">
                {authMode === "signup"
                  ? "Use between 12 and 128 characters."
                  : "Log in with your registered email and password."}
              </p>
              <button
                className="primary auth-submit"
                type="submit"
                disabled={authBusy}
              >
                {authBusy
                  ? "Please wait…"
                  : authMode === "login"
                    ? "Log in"
                    : "Create account"}{" "}
                <span>↗</span>
              </button>
            </form>
            {authFeedback && (
              <p className="auth-feedback" role="status">
                {authFeedback}
              </p>
            )}
          </section>
        </div>
      )}
      {open && (
        <div className="overlay" onClick={() => !busy && setOpen(false)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Your kit bag"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-title">
              <h2>Your kit bag ({count})</h2>
              <button
                aria-label="Close kit bag"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {!lines.length ? (
              <p>Your bag is empty. Your next match starts here.</p>
            ) : (
              <>
                <div className="cart-lines">
                  {lines.map((p) => (
                    <div className="cart-line" key={p.id}>
                      <span className="mini-icon">{p.icon}</span>
                      <div>
                        <strong>{p.name}</strong>
                        <p>
                          {p.size} / {p.colour}
                        </p>
                        <p>{money(p.price_cents, p.currency)}</p>
                        {p.quantity > p.stock && (
                          <p role="alert">
                            Only {p.stock} available. Reduce the quantity or
                            remove this item.
                          </p>
                        )}
                        <div className="quantity">
                          <button
                            disabled={busy}
                            aria-label={`Remove one ${p.name}`}
                            onClick={() => change(p, -1)}
                          >
                            −
                          </button>
                          <span>{p.quantity}</span>
                          <button
                            disabled={
                              busy || p.quantity >= Math.min(p.stock, 99)
                            }
                            aria-label={`Add one ${p.name}`}
                            onClick={() => change(p, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() =>
                          setCart((old) => ({ ...old, [p.id]: 0 }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="total">
                  <span>Total</span>
                  <strong>{money(total, lines[0]?.currency)}</strong>
                </div>
                {invalidCart && (
                  <p className="error" role="alert">
                    Check item quantities and use one currency per order.
                  </p>
                )}
                <p className="muted">
                  Demo checkout. No payment is collected. No shipping or tax
                  charges are added.
                </p>
                <form onSubmit={checkout}>
                  <label>
                    Full name
                    <input
                      name="customer_name"
                      defaultValue={user?.full_name || ""}
                      required
                      minLength="2"
                      maxLength="100"
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      defaultValue={user?.email || ""}
                      required
                      maxLength="254"
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    Delivery address
                    <textarea
                      name="address"
                      required
                      minLength="5"
                      maxLength="500"
                      autoComplete="street-address"
                    />
                  </label>
                  <button className="primary" disabled={busy || invalidCart}>
                    {busy
                      ? "Placing order…"
                      : user
                        ? "Place demo order ↗"
                        : "Log in to place order ↗"}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById('root')).render(<App/>);
