import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def send_portal_email(
    to_email: str,
    guest_name: str,
    property_name: str,
    unit_name: str,
    check_in: str,
    check_out: str,
    portal_url: str,
    from_name: str = None,
) -> bool:
    smtp_host = os.getenv('SMTP_HOST', '')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_user = os.getenv('SMTP_USER', '')
    smtp_pass = os.getenv('SMTP_PASS', '')

    if not all([smtp_host, smtp_user, smtp_pass]):
        return False

    sender_name = from_name or property_name or smtp_user
    msg = MIMEMultipart('alternative')
    msg['Subject'] = f"Your stay at {property_name} – Digital Guide"
    msg['From'] = f"{sender_name} <{smtp_user}>"
    msg['To'] = to_email

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

    msg.attach(MIMEText(html, 'html'))
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as srv:
            srv.starttls()
            srv.login(smtp_user, smtp_pass)
            srv.sendmail(smtp_user, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[email] send failed: {e}")
        return False
