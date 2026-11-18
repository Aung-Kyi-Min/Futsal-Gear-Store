"""Snapshot and render paid order summaries for customer emails."""
import json
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import formatdate
from html import escape
from mimetypes import guess_type
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection

FRONTEND_ROOT = Path(__file__).resolve().parents[2] / "frontend"
PRODUCT_IMAGES = json.loads((FRONTEND_ROOT / "src" / "productImages.json").read_text())


def receipt_snapshot(db: Connection, order_id: UUID) -> dict:
    order = db.execute(text("""
        SELECT subtotal_minor, discount_code, discount_minor, shipping_minor, tax_minor,
               total_minor, currency, delivery_name, delivery_address
        FROM orders WHERE order_id = :order_id
    """), {"order_id": order_id}).mappings().one()
    items = db.execute(text("""
        SELECT oi.product_name_snapshot, oi.size_snapshot, oi.colour_snapshot,
               oi.quantity, oi.unit_price_minor, oi.line_total_minor, p.image_url
        FROM order_items AS oi
        JOIN product_variants AS v ON v.variant_id = oi.variant_id
        JOIN products AS p ON p.product_id = v.product_id
        WHERE oi.order_id = :order_id ORDER BY oi.order_item_id
    """), {"order_id": order_id}).mappings().all()
    return {
        **order,
        "order_id": str(order_id),
        "items": [
            {**item, "image_url": item["image_url"] or PRODUCT_IMAGES.get(item["product_name_snapshot"])}
            for item in items
        ],
    }


def amount(minor: int, currency: str) -> str:
    if currency == "MYR":
        whole, cents = divmod(minor, 100)
        return f"MYR {whole:,}.{cents:02d}"
    return f"{minor:,} {currency} minor units"


def receipt_image(image_url: str | None, images: dict) -> str | None:
    if not image_url:
        return None
    try:
        parsed = urlsplit(image_url)
    except ValueError:
        return None
    local = not parsed.netloc or parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if not local:
        if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password:
            return image_url
        return None
    if parsed.scheme not in ("", "http", "https") or not parsed.path.startswith("/images/"):
        return None
    root = (FRONTEND_ROOT / "public" / "images").resolve()
    path = (root / parsed.path.removeprefix("/images/")).resolve()
    if not path.is_relative_to(root):
        return None
    mime = guess_type(path.name)[0]
    if mime not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
        return None
    if path not in images:
        try:
            with path.open("rb") as photo:
                content = photo.read(1_000_001)
        except OSError:
            return None
        if len(content) > 1_000_000:
            return None
        images[path] = (f"product-{len(images) + 1}@courtsupply", content, mime.split("/")[1])
    return f"cid:{images[path][0]}"


def confirmation_message(job, from_email: str) -> EmailMessage:
    payload = job["payload"]
    currency = payload["currency"]
    total = amount(payload["total_minor"], currency)
    reference = str(job["order_id"])
    text_lines = [
        "Thank you for shopping with Court Supply. We received your payment.",
        "", f"Order reference: {reference}", "", "Order summary",
    ]
    images = {}
    item_rows = []
    for item in payload.get("items", []):
        name = item["product_name_snapshot"]
        variant = f'{item["size_snapshot"]} / {item["colour_snapshot"]}'
        unit_price = amount(item["unit_price_minor"], currency)
        line_total = amount(item["line_total_minor"], currency)
        quantity = str(item["quantity"])
        text_lines.extend([name, f"{variant} | Quantity {quantity}", f"Unit price: {unit_price} | Total: {line_total}", ""])
        source = receipt_image(item.get("image_url"), images)
        image = (
            f'<img src="{escape(source, quote=True)}" alt="{escape(name, quote=True)}"'
            ' width="88" height="88" style="display:block;object-fit:contain;border-radius:6px">'
            if source else ""
        )
        item_rows.append(f"""
            <tr>
              <td width="100" valign="top" style="padding:16px 12px 16px 0;border-bottom:1px solid #e1e6dc">{image}</td>
              <td valign="top" style="padding:16px 0;border-bottom:1px solid #e1e6dc;overflow-wrap:anywhere">
                <strong>{escape(name)}</strong>
                <p style="margin:6px 0;color:#53685b">{escape(variant)}</p>
                <p style="margin:6px 0;font-size:13px">Qty {escape(quantity)} · {escape(unit_price)} each</p>
                <strong>{escape(line_total)}</strong>
              </td>
            </tr>""")

    totals = []
    if "subtotal_minor" in payload:
        totals.append(("Subtotal", amount(payload["subtotal_minor"], currency)))
        if payload.get("discount_code"):
            totals.append((f'Discount ({payload["discount_code"]})', "−" + amount(payload["discount_minor"], currency)))
        totals.extend([
            ("Shipping", amount(payload["shipping_minor"], currency)),
            ("Tax", amount(payload["tax_minor"], currency)),
        ])
    totals.append(("Amount paid", total))
    total_rows = []
    for label, value in totals:
        text_lines.append(f"{label}: {value}")
        total_rows.append(
            '<tr><td style="padding:6px 0">' + escape(label) + '</td>'
            '<td align="right" style="padding:6px 0"><strong>' + escape(value) + '</strong></td></tr>'
        )

    delivery = ""
    if payload.get("delivery_address"):
        name = payload.get("delivery_name", "")
        address = payload["delivery_address"]
        text_lines.extend(["", "Delivery", name, address])
        delivery = (
            '<h2 style="font-size:18px;margin:28px 0 10px">Delivery</h2>'
            f'<p style="margin:0;line-height:1.7">{escape(name)}<br>'
            f'{escape(address).replace(chr(10), "<br>")}</p>'
        )
    text_lines.extend(["", "Open My orders in the store to view your order and track its progress.", "", "Court Supply"])
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f5ee;font-family:Arial,sans-serif;color:#183e33">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fffef8">
      <tr><td style="padding:24px;background:#183e33;color:white;font-size:20px;font-weight:bold">COURT SUPPLY</td></tr>
      <tr><td style="padding:24px">
        <h1 style="font-size:26px;margin:0 0 12px">Payment received</h1>
        <p style="line-height:1.6">Thank you for your order. Your payment is confirmed.</p>
        <p style="font-size:13px;overflow-wrap:anywhere">Order reference<br><strong>{escape(reference)}</strong></p>
        <h2 style="font-size:18px;margin:28px 0 0">Order summary</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">{"".join(item_rows)}</table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px">{"".join(total_rows)}</table>
        {delivery}
        <p style="margin-top:28px;line-height:1.6;font-size:14px">Open <strong>My orders</strong> in the store to track your order.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>"""
    message = EmailMessage()
    message["From"] = Address(display_name="Court Supply", addr_spec=from_email)
    message["To"] = Address(addr_spec=job["recipient"])
    message["Subject"] = "Court Supply payment confirmation"
    message["Date"] = formatdate(usegmt=True)
    message["Message-ID"] = f"<payment-{job['email_id']}-{reference}@{from_email.rsplit('@', 1)[1]}>"
    message.set_content("\n".join(text_lines) + "\n")
    message.add_alternative(html, subtype="html")
    html_part = message.get_payload()[-1]
    for cid, content, subtype in images.values():
        html_part.add_related(content, maintype="image", subtype=subtype, cid=f"<{cid}>", disposition="inline")
    return message
