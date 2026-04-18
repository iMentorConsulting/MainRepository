from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class CaseCreate(BaseModel):
    client_name: str
    client_phone: str = ""
    client_email: str = ""
    client_vat: Optional[str] = None
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


class CaseUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    client_vat: Optional[str] = None
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
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class CaseListItem(BaseModel):
    id: int
    client_name: str
    client_phone: str
    client_email: str
    employee: str
    status: str
    debtor_type: str
    estimates: dict
    actual_results: Optional[dict]
    share_token: str
    portal_active: bool = True
    contact_stage: str = "Νέα Ανάλυση"
    last_contacted_at: Optional[datetime] = None
    reminder_count: int = 0
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
