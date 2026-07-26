from pydantic import BaseModel, field_validator
from typing import Optional, Any
from datetime import datetime


def _pad_afm(v: Optional[str]) -> Optional[str]:
    """Ensure ΑΦΜ is always 9 digits by left-padding with zeros (Excel strips leading zeros)."""
    if not v:
        return v
    v = v.strip()
    if v.isdigit() and len(v) < 9:
        v = v.zfill(9)
    return v


class CaseCreate(BaseModel):
    client_name: str
    client_phone: str = ""
    client_email: str = ""
    client_vat: Optional[str] = None

    @field_validator('client_vat', mode='before')
    @classmethod
    def normalize_afm(cls, v):
        return _pad_afm(v)
    employee: str
    status: str = "draft"
    debtor_type: str = "Φυσικό Πρόσωπο"
    debts: list = []
    assets: list = []
    income_data: dict = {}
    estimates: dict = {}
    notes: str = ""
    portal_active: bool = True
    contact_stage: str = "Νέα Ανάλυση"
    commercial_offer: Optional[dict] = None


class CaseUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    client_vat: Optional[str] = None

    @field_validator('client_vat', mode='before')
    @classmethod
    def normalize_afm(cls, v):
        return _pad_afm(v)
    employee: Optional[str] = None
    status: Optional[str] = None
    debtor_type: Optional[str] = None
    debts: Optional[list] = None
    assets: Optional[list] = None
    income_data: Optional[dict] = None
    estimates: Optional[dict] = None
    actual_results: Optional[dict] = None
    notes: Optional[str] = None
    portal_active: Optional[bool] = None
    contact_stage: Optional[str] = None
    commercial_offer: Optional[dict] = None


class ContactUpdate(BaseModel):
    contact_stage: Optional[str] = None
    increment_reminder: bool = False


class ActualResultsUpdate(BaseModel):
    actual_results: dict


class CaseResponse(BaseModel):
    id: int
    client_name: str
    client_phone: str
    client_email: str
    client_vat: Optional[str] = None
    employee: str
    status: str
    debtor_type: str
    debts: list
    assets: list
    income_data: dict
    estimates: dict
    actual_results: Optional[dict]
    notes: str
    share_token: str
    portal_active: bool = True
    contact_stage: str = "Νέα Ανάλυση"
    last_contacted_at: Optional[datetime] = None
    reminder_count: int = 0
    commercial_offer: Optional[dict] = None
    portal_visit_count: int = 0
    portal_visits: Optional[list] = None
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    completed_at: Optional[datetime]
    stage_changed_at: Optional[datetime] = None
    external_source: Optional[str] = None
    external_ref: Optional[str] = None
    external_status: Optional[str] = None
    external_accepted: bool = True
    external_data: Optional[dict] = None

    class Config:
        from_attributes = True


class CaseListItem(BaseModel):
    id: int
    client_name: str
    client_phone: str
    client_email: str
    notes: str = ""
    employee: str
    status: str
    debtor_type: str
    debts: list = []
    assets: list = []
    income_data: dict = {}
    estimates: dict
    actual_results: Optional[dict]
    share_token: str
    portal_active: bool = True
    contact_stage: str = "Νέα Ανάλυση"
    last_contacted_at: Optional[datetime] = None
    reminder_count: int = 0
    portal_visit_count: int = 0
    commercial_offer: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    completed_at: Optional[datetime]
    stage_changed_at: Optional[datetime] = None
    external_source: Optional[str] = None
    external_ref: Optional[str] = None
    external_status: Optional[str] = None
    external_accepted: bool = True

    class Config:
        from_attributes = True
