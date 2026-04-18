from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from models import Customer
from schemas import CustomerCreate, CustomerUpdate, CustomerResponse
from auth_utils import get_tenant
from typing import List, Optional

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("/", response_model=List[CustomerResponse])
def get_customers(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 200,
    tenant: str = Depends(get_tenant),
):
    q = db.query(Customer).filter(Customer.tenant == tenant)
    if search:
        q = q.filter(
            or_(
                Customer.first_name.ilike(f"%{search}%"),
                Customer.last_name.ilike(f"%{search}%"),
                Customer.email.ilike(f"%{search}%"),
                Customer.phone.ilike(f"%{search}%"),
            )
        )
    return q.order_by(Customer.last_name, Customer.first_name).offset(skip).limit(limit).all()


@router.post("/", response_model=CustomerResponse, status_code=201)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    db_customer = Customer(**customer.model_dump(), tenant=tenant)
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    c = db.query(Customer).filter(Customer.id == customer_id, Customer.tenant == tenant).first()
    if not c:
        raise HTTPException(status_code=404, detail="Πελάτης δεν βρέθηκε")
    return c


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: int, data: CustomerUpdate, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    c = db.query(Customer).filter(Customer.id == customer_id, Customer.tenant == tenant).first()
    if not c:
        raise HTTPException(status_code=404, detail="Πελάτης δεν βρέθηκε")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db), tenant: str = Depends(get_tenant)):
    c = db.query(Customer).filter(Customer.id == customer_id, Customer.tenant == tenant).first()
    if not c:
        raise HTTPException(status_code=404, detail="Πελάτης δεν βρέθηκε")
    db.delete(c)
    db.commit()
    return {"message": "Ο πελάτης διαγράφηκε"}
