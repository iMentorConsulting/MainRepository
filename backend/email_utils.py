import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _smtp_cfg(settings=None):
    """Return (host, port, user, password) — tenant settings override env vars."""
    host = (settings and settings.smtp_host) or os.getenv('SMTP_HOST', '')
    port = int((settings and settings.smtp_port) or os.getenv('SMTP_PORT', '587'))
    user = (settings and settings.smtp_user) or os.getenv('SMTP_USER', '')
    pwd  = (settings and settings.smtp_pass) or os.getenv('SMTP_PASS', '')
    return host, port, user, pwd


def _send(host, port, user, pwd, from_display, to_email, subject, html):
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = f"{from_display} <{user}>"
    msg['To']      = to_email
    msg.attach(MIMEText(html, 'html'))
    try:
        with smtplib.SMTP(host, port, timeout=10) as srv:
            srv.starttls()
            srv.login(user, pwd)
            srv.sendmail(user, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[email] send failed: {e}")
        return False


def send_portal_email(
    to_email: str,
    guest_name: str,
    property_name: str,
    unit_name: str,
    check_in: str,
    check_out: str,
    portal_url: str,
    from_name: str = None,
    settings=None,
) -> bool:
    host, port, user, pwd = _smtp_cfg(settings)
    if not all([host, user, pwd]):
        return False

    sender_name = from_name or (settings and settings.from_name) or property_name or user
    subject = f"Your stay at {property_name} – Digital Guide"
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;background:#f8fafc;">
  <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e3a5f,#2d5986);padding:32px 24px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:24px;">Welcome, {guest_name}!</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">{property_name}</p>
    </div>
    <div style="padding:24px;">
      <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px;">
        <h2 style="color:#1e3a5f;font-size:16px;margin:0 0 12px;">Your Booking</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#666;width:100px;">Property</td><td style="padding:6px 0;font-weight:600;">{unit_name}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Check-in</td><td style="padding:6px 0;font-weight:600;">{check_in}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Check-out</td><td style="padding:6px 0;font-weight:600;">{check_out}</td></tr>
        </table>
      </div>
      <p style="color:#555;margin-bottom:20px;">Your personal guest portal is ready. Find check-in instructions, WiFi details, local recommendations, and request any services you need.</p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="{portal_url}" style="display:inline-block;background:#1e3a5f;color:white;text-decoration:none;padding:16px 48px;border-radius:10px;font-size:16px;font-weight:bold;">Open Guest Portal →</a>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;border-top:1px solid #eee;padding-top:16px;margin:0;">This link is personal and valid only for your stay. Do not share it.</p>
    </div>
  </div>
</body></html>"""
    return _send(host, port, user, pwd, sender_name, to_email, subject, html)


def send_notification_email(
    event_type: str,      # 'message' | 'service_request' | 'photo'
    guest_name: str,
    unit_name: str,
    content: str,
    portal_admin_url: str,
    settings=None,
) -> bool:
    """Notify the manager when a guest sends a message or service request."""
    if not settings:
        return False
    notify_to = settings.notification_email or settings.manager_email
    if not notify_to:
        return False

    host, port, user, pwd = _smtp_cfg(settings)
    if not all([host, user, pwd]):
        return False

    icons = {'message': '💬', 'service_request': '🛎️', 'photo': '📷'}
    labels = {'message': 'New Message', 'service_request': 'Service Request', 'photo': 'Photo Report'}
    icon  = icons.get(event_type, '📩')
    label = labels.get(event_type, 'Notification')
    sender_name = (settings and settings.from_name) or 'Guest Portal'
    subject = f"{icon} {label} from {guest_name} – {unit_name}"

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;background:#f8fafc;">
  <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e3a5f,#2d5986);padding:24px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:20px;">{icon} {label}</h1>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:10px;padding:16px;">
        <tr><td style="padding:6px 12px;color:#666;width:100px;">Guest</td><td style="padding:6px 12px;font-weight:600;">{guest_name}</td></tr>
        <tr><td style="padding:6px 12px;color:#666;">Property</td><td style="padding:6px 12px;font-weight:600;">{unit_name}</td></tr>
      </table>
      <div style="margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;">
        <p style="margin:0;color:#444;font-size:15px;white-space:pre-wrap;">{content}</p>
      </div>
      <div style="text-align:center;margin-top:24px;">
        <a href="{portal_admin_url}" style="display:inline-block;background:#1e3a5f;color:white;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:bold;">View in Portal Admin →</a>
      </div>
    </div>
  </div>
</body></html>"""
    return _send(host, port, user, pwd, sender_name, notify_to, subject, html)
