import React, { useEffect, useState } from 'react';
import { request } from './api.js';
import './orders.css';

const STATUS_LABELS = {
  placed: 'Placed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const orderDate = new Intl.DateTimeFormat('en-MY', {
  dateStyle: 'medium', timeZone: 'Asia/Kuala_Lumpur',
});
const eventTime = new Intl.DateTimeFormat('en-MY', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur',
});

function Status({ status }) {
  return <span className={`order-status order-status--${status}`}>{STATUS_LABELS[status]}</span>;
}

function OrderList({ data, formatMoney, onOpenOrder, onShop, onPage }) {
  if (!data.total) {
    return (
      <div className="orders-panel orders-empty">
        <h2>No orders yet</h2>
        <p>Your orders will appear here after checkout.</p>
        <button className="primary" onClick={onShop}>Shop gear ↗</button>
      </div>
    );
  }

  const pages = Math.ceil(data.total / data.page_size);
  return (
    <>
      <ul className="order-list">
        {data.orders.map((order) => (
          <li key={order.order_id}>
            <a
              className="orders-panel order-row"
              href={`/orders/${order.order_id}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onOpenOrder(order.order_id);
              }}
            >
              <div>
                <strong>Order #{order.order_id.slice(0, 8).toUpperCase()}</strong>
                <time dateTime={order.created_at}>{orderDate.format(new Date(order.created_at))}</time>
              </div>
              <Status status={order.status} />
              <strong>{formatMoney(order.total_minor, order.currency)}</strong>
              <span className="order-view">View order <span aria-hidden="true">↗</span></span>
            </a>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="order-pagination" aria-label="Order pages">
          <button className="account-button" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
            Previous
          </button>
          <span>Page {data.page} of {pages}</span>
          <button className="account-button" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>
            Next
          </button>
        </div>
      )}
    </>
  );
}

function OrderDetails({ order, formatMoney }) {
  const money = (amount) => formatMoney(amount, order.currency);
  return (
    <>
      <div className="order-detail-heading">
        <div>
          <p>Order #{order.order_id.slice(0, 8).toUpperCase()}</p>
          <time dateTime={order.created_at}>Placed {eventTime.format(new Date(order.created_at))}</time>
        </div>
        <Status status={order.status} />
      </div>
      <div className="order-detail-grid">
        <section className="orders-panel" aria-labelledby="order-items-heading">
          <h2 id="order-items-heading">Items</h2>
          <ul className="order-items">
            {order.items.map((item) => (
              <li key={item.order_item_id}>
                <div>
                  <strong>{item.product_name_snapshot}</strong>
                  <p>{item.size_snapshot} / {item.colour_snapshot} · Qty {item.quantity}</p>
                </div>
                <strong>{money(item.line_total_minor)}</strong>
              </li>
            ))}
          </ul>
          <dl className="order-totals">
            <div><dt>Subtotal</dt><dd>{money(order.subtotal_minor)}</dd></div>
            {order.discount_code && (
              <div><dt>Discount ({order.discount_code})</dt><dd>−{money(order.discount_minor)}</dd></div>
            )}
            <div><dt>Shipping</dt><dd>{money(order.shipping_minor)}</dd></div>
            <div><dt>Tax</dt><dd>{money(order.tax_minor)}</dd></div>
            <div className="order-total"><dt>Total</dt><dd>{money(order.total_minor)}</dd></div>
          </dl>
        </section>
        <div className="order-detail-side">
          <section className="orders-panel" aria-labelledby="order-delivery-heading">
            <h2 id="order-delivery-heading">Delivery</h2>
            <p className="order-address">
              <strong>{order.delivery_name}</strong>
              <br />
              {order.delivery_address}
            </p>
          </section>
          <section className="orders-panel" aria-labelledby="order-progress-heading">
            <h2 id="order-progress-heading">Order updates</h2>
            <ol className="order-timeline">
              {order.status_history.map((entry) => (
                <li key={entry.history_id}>
                  <strong>{STATUS_LABELS[entry.new_status]}</strong>
                  <time dateTime={entry.changed_at}>{eventTime.format(new Date(entry.changed_at))}</time>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

export default function OrderHistory({
  token, user, sessionLoading, orderId, confirmed, formatMoney,
  onLogin, onShop, onOpenOrder, onHistory,
}) {
  const [page, setPage] = useState(1);
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState(null);
  const canLoad = Boolean(user && token);

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    const path = orderId
      ? `/api/customer/orders/${encodeURIComponent(orderId)}`
      : `/api/customer/orders?page=${page}`;

    request(path, { token, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ error });
      });
    return () => controller.abort();
  }, [canLoad, orderId, page, token, attempt]);

  function changePage(nextPage) {
    setResult(null);
    setPage(nextPage);
  }

  return (
    <section className="orders-page" aria-labelledby="orders-heading">
      {orderId && (
        <button className="back-link" onClick={onHistory}>← Back to orders</button>
      )}
      <h1 id="orders-heading">{orderId ? 'Order details' : 'My orders'}</h1>
      {sessionLoading && !canLoad ? (
        <p role="status">Checking your account…</p>
      ) : !canLoad ? (
        <div className="orders-panel orders-empty">
          <p>Log in to view your orders.</p>
          <button className="primary" onClick={() => onLogin()}>Log in ↗</button>
        </div>
      ) : (
        <>
          {confirmed && <p className="notice" role="status">Order placed. No payment was taken.</p>}
          {!result ? (
            <p role="status">Loading {orderId ? 'order details' : 'your orders'}…</p>
          ) : result.error ? (
            <div className="orders-panel">
              <p role="alert">{result.error.status === 401 ? 'Log in again to view your orders.' : result.error.message}</p>
              {result.error.status === 401 ? (
                <button className="account-button" onClick={() => onLogin(true)}>Log in</button>
              ) : result.error.status !== 404 && (
                <button className="account-button" onClick={() => { setResult(null); retry(attempt + 1); }}>
                  Retry
                </button>
              )}
            </div>
          ) : orderId ? (
            <OrderDetails order={result.data} formatMoney={formatMoney} />
          ) : (
            <OrderList
              data={result.data}
              formatMoney={formatMoney}
              onOpenOrder={onOpenOrder}
              onShop={onShop}
              onPage={changePage}
            />
          )}
        </>
      )}
    </section>
  );
}
