import React from 'react';
import './payment-status.css';

export default function PaymentStatus({ status }) {
  const paid = status === 'PAID';
  return (
    <span className={`payment-status payment-status--${paid ? 'paid' : 'unpaid'}`}>
      <span className="payment-status__dot" aria-hidden="true" />
      Payment: {paid ? 'Paid' : 'Unpaid'}
    </span>
  );
}
