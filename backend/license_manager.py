"""
Generate and manage per-tenant installation license keys.
Format: VMS-{YEAR}-{TENANT_CODE}-{HEX8}-{HEX4}
Example: VMS-2025-VVRD-A3F7B2D1-8C4E
"""

import hashlib
import secrets
from datetime import datetime


def _tenant_code(tenant: str) -> str:
    return ''.join(c.upper() for c in tenant if c.isalpha())[:4].ljust(4, 'X')


def generate_license_key(tenant: str) -> str:
    year = datetime.utcnow().year
    code = _tenant_code(tenant)
    part1 = secrets.token_hex(4).upper()
    part2 = secrets.token_hex(2).upper()
    return f"VMS-{year}-{code}-{part1}-{part2}"


def get_or_create_license(tenant: str, db) -> str:
    from models import InstallationLicense
    lic = db.query(InstallationLicense).filter_by(tenant=tenant).first()
    if not lic:
        lic = InstallationLicense(
            tenant=tenant,
            license_key=generate_license_key(tenant),
        )
        db.add(lic)
        db.commit()
        db.refresh(lic)
    return lic
