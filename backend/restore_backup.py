#!/usr/bin/env python3
"""
Standalone restore script for iMentor CRM backup.

Usage:
    python restore_backup.py --backup backup.json --db postgresql://user:pass@host:port/dbname

Works from any machine with Python + psycopg2 installed.
Does NOT require the app to be running.

Steps when Railway dies:
    1. Download the latest backup JSON from Google Drive
    2. Create a new Railway project with Postgres (or any Postgres)
    3. Run:  python restore_backup.py --backup CaseMngt-backup_2026-xx-xx.json --db "postgresql://..."
    4. Redeploy the app pointing to the new DB
"""

import argparse
import json
import sys
from datetime import datetime


def _connect(db_url: str):
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
        sys.exit(1)
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    return conn


def _ensure_schema(cur):
    """Create all tables if they don't exist (minimal schema for restore)."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            full_name VARCHAR(200),
            email VARCHAR(200),
            phone VARCHAR(50),
            role VARCHAR(50) DEFAULT 'user',
            hashed_password VARCHAR(200),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_cases (
            id SERIAL PRIMARY KEY,
            client_name VARCHAR(300),
            phone VARCHAR(50),
            email VARCHAR(200),
            afm VARCHAR(20),
            accountant VARCHAR(200),
            sale_date DATE,
            service_type VARCHAR(200),
            status VARCHAR(100),
            program_category VARCHAR(200),
            status_changed_at TIMESTAMP,
            approved_budget FLOAT,
            subsidy_percent FLOAT,
            project_deadline DATE,
            approval_date DATE,
            follow_up_date DATE,
            dypa_start_date DATE,
            agreed_fee_application FLOAT,
            agreed_fee_implementation FLOAT,
            total_paid FLOAT DEFAULT 0,
            assigned_agent_id INTEGER,
            drive_folder_url TEXT,
            portal_active BOOLEAN DEFAULT FALSE,
            share_token VARCHAR(100),
            portal_visit_count INTEGER DEFAULT 0,
            portal_last_visit_at TIMESTAMP,
            portal_notified_at TIMESTAMP,
            sheet_import_ref VARCHAR(200),
            risk_score FLOAT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_tasks (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            title VARCHAR(500),
            description TEXT,
            status VARCHAR(100),
            priority VARCHAR(50),
            assigned_to VARCHAR(200),
            due_date DATE,
            completed_at TIMESTAMP,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_payments (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            amount FLOAT,
            payment_date DATE,
            payment_type VARCHAR(100),
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_messages (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            user_id INTEGER,
            content TEXT,
            is_internal BOOLEAN DEFAULT FALSE,
            sent_by_client BOOLEAN DEFAULT FALSE,
            author_name VARCHAR(200),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_documents (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            name VARCHAR(500),
            document_type VARCHAR(100),
            status VARCHAR(100),
            uploaded_by VARCHAR(200),
            uploaded_by_client BOOLEAN DEFAULT FALSE,
            notes TEXT,
            file_url TEXT,
            file_data BYTEA,
            mime_type VARCHAR(100),
            drive_file_id VARCHAR(200),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_budget_categories (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            category_name VARCHAR(200),
            approved_amount FLOAT,
            percent_of_budget FLOAT,
            certified_request1 FLOAT,
            certified_request2 FLOAT,
            certified_final FLOAT,
            notes TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_case_pending_items (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            item_text TEXT,
            comment TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_case_status_history (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            from_status VARCHAR(100),
            to_status VARCHAR(100),
            changed_at TIMESTAMP DEFAULT NOW(),
            changed_by VARCHAR(200)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_case_modifications (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            modification_date DATE,
            title VARCHAR(500),
            justification TEXT,
            approval_date DATE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_payment_logs (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            log_date TIMESTAMP DEFAULT NOW(),
            previous_total FLOAT,
            new_total FLOAT,
            delta FLOAT,
            source VARCHAR(100)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_notification_logs (
            id SERIAL PRIMARY KEY,
            case_id INTEGER,
            notification_type VARCHAR(100),
            subject VARCHAR(500),
            status VARCHAR(50),
            sent_by VARCHAR(200),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cm_portal_files (
            id SERIAL PRIMARY KEY,
            service_type VARCHAR(200),
            original_filename VARCHAR(500),
            mime_type VARCHAR(100),
            file_size INTEGER,
            file_data BYTEA,
            drive_file_id VARCHAR(200),
            client_description TEXT,
            client_instructions TEXT,
            internal_notes TEXT,
            uploaded_at TIMESTAMP DEFAULT NOW()
        )
    """)


def _seq(cur, table: str, col: str = "id"):
    """Reset sequence to max id + 1 after bulk inserts."""
    cur.execute(f"""
        SELECT setval(pg_get_serial_sequence('{table}', '{col}'),
                      COALESCE((SELECT MAX({col}) FROM {table}), 0) + 1, false)
    """)


def restore(backup_path: str, db_url: str, drop_existing: bool = False):
    print(f"Loading backup: {backup_path}")
    with open(backup_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Backup version: {data.get('version', '?')}  exported: {data.get('exported_at', '?')}")
    conn = _connect(db_url)
    cur = conn.cursor()

    if drop_existing:
        print("WARNING: Dropping existing data...")
        for tbl in [
            "cm_notification_logs", "cm_payment_logs", "cm_case_modifications",
            "cm_case_status_history", "cm_case_pending_items", "cm_budget_categories",
            "cm_documents", "cm_messages", "cm_payments", "cm_tasks",
            "cm_portal_files", "cm_cases", "cm_users",
        ]:
            cur.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE")
        conn.commit()

    print("Ensuring schema...")
    _ensure_schema(cur)
    conn.commit()

    # ── Users ──────────────────────────────────────────────────────────────
    users = data.get("users", [])
    print(f"Restoring {len(users)} users...")
    for u in users:
        cur.execute("""
            INSERT INTO cm_users (id, username, full_name, email, role, created_at)
            VALUES (%(id)s, %(username)s, %(full_name)s, %(email)s, %(role)s, %(created_at)s)
            ON CONFLICT (id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                email = EXCLUDED.email,
                role = EXCLUDED.role
        """, {**u, "created_at": u.get("created_at") or datetime.utcnow().isoformat()})
    _seq(cur, "cm_users")
    conn.commit()

    # ── Cases ──────────────────────────────────────────────────────────────
    cases = data.get("cases", [])
    print(f"Restoring {len(cases)} cases...")
    for c in cases:
        cur.execute("""
            INSERT INTO cm_cases (
                id, client_name, phone, email, afm, accountant, sale_date,
                service_type, status, program_category, status_changed_at,
                approved_budget, subsidy_percent, project_deadline, approval_date,
                follow_up_date, dypa_start_date, agreed_fee_application,
                agreed_fee_implementation, total_paid, assigned_agent_id,
                drive_folder_url, portal_active, share_token, portal_visit_count,
                portal_last_visit_at, portal_notified_at, sheet_import_ref,
                risk_score, notes, created_at, updated_at
            ) VALUES (
                %(id)s, %(client_name)s, %(phone)s, %(email)s, %(afm)s, %(accountant)s,
                %(sale_date)s, %(service_type)s, %(status)s, %(program_category)s,
                %(status_changed_at)s, %(approved_budget)s, %(subsidy_percent)s,
                %(project_deadline)s, %(approval_date)s, %(follow_up_date)s,
                %(dypa_start_date)s, %(agreed_fee_application)s,
                %(agreed_fee_implementation)s, %(total_paid)s, %(assigned_agent_id)s,
                %(drive_folder_url)s, %(portal_active)s, %(share_token)s,
                %(portal_visit_count)s, %(portal_last_visit_at)s, %(portal_notified_at)s,
                %(sheet_import_ref)s, %(risk_score)s, %(notes)s, %(created_at)s, %(updated_at)s
            )
            ON CONFLICT (id) DO UPDATE SET
                client_name = EXCLUDED.client_name,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes,
                updated_at = EXCLUDED.updated_at
        """, {
            "total_paid": c.get("total_paid") or 0,
            "portal_active": c.get("portal_active") or False,
            "portal_visit_count": c.get("portal_visit_count") or 0,
            **{k: c.get(k) for k in [
                "id", "client_name", "phone", "email", "afm", "accountant",
                "sale_date", "service_type", "status", "program_category",
                "status_changed_at", "approved_budget", "subsidy_percent",
                "project_deadline", "approval_date", "follow_up_date",
                "dypa_start_date", "agreed_fee_application", "agreed_fee_implementation",
                "assigned_agent_id", "drive_folder_url", "share_token",
                "portal_last_visit_at", "portal_notified_at", "sheet_import_ref",
                "risk_score", "notes", "created_at", "updated_at",
            ]},
        })
    _seq(cur, "cm_cases")
    conn.commit()

    # ── Tasks ──────────────────────────────────────────────────────────────
    tasks = data.get("tasks", [])
    print(f"Restoring {len(tasks)} tasks...")
    for t in tasks:
        cur.execute("""
            INSERT INTO cm_tasks (id, case_id, title, description, status, priority,
                assigned_to, due_date, completed_at, notes, created_at)
            VALUES (%(id)s, %(case_id)s, %(title)s, %(description)s, %(status)s,
                %(priority)s, %(assigned_to)s, %(due_date)s, %(completed_at)s,
                %(notes)s, %(created_at)s)
            ON CONFLICT (id) DO NOTHING
        """, t)
    _seq(cur, "cm_tasks")
    conn.commit()

    # ── Payments ───────────────────────────────────────────────────────────
    payments = data.get("payments", [])
    print(f"Restoring {len(payments)} payments...")
    for p in payments:
        cur.execute("""
            INSERT INTO cm_payments (id, case_id, amount, payment_date, payment_type,
                description, created_at)
            VALUES (%(id)s, %(case_id)s, %(amount)s, %(payment_date)s, %(payment_type)s,
                %(description)s, %(created_at)s)
            ON CONFLICT (id) DO NOTHING
        """, p)
    _seq(cur, "cm_payments")
    conn.commit()

    # ── Messages ───────────────────────────────────────────────────────────
    messages = data.get("messages", [])
    print(f"Restoring {len(messages)} messages...")
    for m in messages:
        cur.execute("""
            INSERT INTO cm_messages (id, case_id, user_id, content, is_internal,
                sent_by_client, author_name, created_at)
            VALUES (%(id)s, %(case_id)s, %(user_id)s, %(content)s, %(is_internal)s,
                %(sent_by_client)s, %(author_name)s, %(created_at)s)
            ON CONFLICT (id) DO NOTHING
        """, {
            "is_internal": m.get("is_internal") or False,
            "sent_by_client": m.get("sent_by_client") or False,
            **{k: m.get(k) for k in ["id", "case_id", "user_id", "content", "author_name", "created_at"]},
        })
    _seq(cur, "cm_messages")
    conn.commit()

    # ── Documents (metadata only — files are in Drive) ─────────────────────
    documents = data.get("documents", [])
    print(f"Restoring {len(documents)} document records (metadata only, files in Drive)...")
    for d in documents:
        cur.execute("""
            INSERT INTO cm_documents (id, case_id, name, document_type, status,
                uploaded_by, uploaded_by_client, notes, mime_type, drive_file_id, created_at)
            VALUES (%(id)s, %(case_id)s, %(name)s, %(document_type)s, %(status)s,
                %(uploaded_by)s, %(uploaded_by_client)s, %(notes)s, %(mime_type)s,
                %(drive_file_id)s, %(created_at)s)
            ON CONFLICT (id) DO NOTHING
        """, {
            "uploaded_by_client": d.get("uploaded_by_client") or False,
            **{k: d.get(k) for k in [
                "id", "case_id", "name", "document_type", "status",
                "uploaded_by", "notes", "mime_type", "drive_file_id", "created_at",
            ]},
        })
    _seq(cur, "cm_documents")
    conn.commit()

    # ── Budget categories ──────────────────────────────────────────────────
    for item in data.get("budget_categories", []):
        cur.execute("""
            INSERT INTO cm_budget_categories (id, case_id, category_name, approved_amount,
                percent_of_budget, certified_request1, certified_request2, certified_final, notes)
            VALUES (%(id)s, %(case_id)s, %(category_name)s, %(approved_amount)s,
                %(percent_of_budget)s, %(certified_request1)s, %(certified_request2)s,
                %(certified_final)s, %(notes)s)
            ON CONFLICT (id) DO NOTHING
        """, item)
    _seq(cur, "cm_budget_categories")
    conn.commit()

    # ── Pending items ──────────────────────────────────────────────────────
    for item in data.get("pending_items", []):
        cur.execute("""
            INSERT INTO cm_case_pending_items (id, case_id, item_text, comment, sort_order, created_at)
            VALUES (%(id)s, %(case_id)s, %(item_text)s, %(comment)s, %(sort_order)s, %(created_at)s)
            ON CONFLICT (id) DO NOTHING
        """, {"sort_order": item.get("sort_order") or 0, **{k: item.get(k) for k in ["id", "case_id", "item_text", "comment", "created_at"]}})
    _seq(cur, "cm_case_pending_items")
    conn.commit()

    # ── Status history ─────────────────────────────────────────────────────
    for item in data.get("status_history", []):
        cur.execute("""
            INSERT INTO cm_case_status_history (id, case_id, from_status, to_status, changed_at, changed_by)
            VALUES (%(id)s, %(case_id)s, %(from_status)s, %(to_status)s, %(changed_at)s, %(changed_by)s)
            ON CONFLICT (id) DO NOTHING
        """, item)
    _seq(cur, "cm_case_status_history")
    conn.commit()

    # ── Modifications ──────────────────────────────────────────────────────
    for item in data.get("modifications", []):
        cur.execute("""
            INSERT INTO cm_case_modifications (id, case_id, modification_date, title,
                justification, approval_date, created_at)
            VALUES (%(id)s, %(case_id)s, %(modification_date)s, %(title)s,
                %(justification)s, %(approval_date)s, %(created_at)s)
            ON CONFLICT (id) DO NOTHING
        """, item)
    _seq(cur, "cm_case_modifications")
    conn.commit()

    # ── Payment logs ───────────────────────────────────────────────────────
    for item in data.get("payment_logs", []):
        cur.execute("""
            INSERT INTO cm_payment_logs (id, case_id, log_date, previous_total, new_total, delta, source)
            VALUES (%(id)s, %(case_id)s, %(log_date)s, %(previous_total)s, %(new_total)s, %(delta)s, %(source)s)
            ON CONFLICT (id) DO NOTHING
        """, item)
    _seq(cur, "cm_payment_logs")
    conn.commit()

    # ── Portal files metadata ──────────────────────────────────────────────
    for item in data.get("portal_files", []):
        cur.execute("""
            INSERT INTO cm_portal_files (id, service_type, original_filename, mime_type,
                file_size, client_description, client_instructions, internal_notes,
                uploaded_at, drive_file_id)
            VALUES (%(id)s, %(service_type)s, %(original_filename)s, %(mime_type)s,
                %(file_size)s, %(client_description)s, %(client_instructions)s,
                %(internal_notes)s, %(uploaded_at)s, %(drive_file_id)s)
            ON CONFLICT (id) DO NOTHING
        """, item)
    _seq(cur, "cm_portal_files")
    conn.commit()

    cur.close()
    conn.close()

    print("\n✓ Restore complete!")
    print(f"  {len(users)} users")
    print(f"  {len(cases)} cases")
    print(f"  {len(tasks)} tasks")
    print(f"  {len(payments)} payments")
    print(f"  {len(messages)} messages")
    print(f"  {len(documents)} document records")
    print("\nNOTE: Document files are stored in Google Drive.")
    print("      The drive_file_id references are restored — files are accessible immediately.")
    print("\nNext steps:")
    print("  1. Deploy the app pointing to this Postgres DB")
    print("  2. Set admin user password via: python reset_password.py --db <url> --username admin")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore iMentor CRM from backup JSON")
    parser.add_argument("--backup", required=True, help="Path to backup JSON file")
    parser.add_argument("--db", required=True, help="PostgreSQL connection URL")
    parser.add_argument("--drop", action="store_true",
                        help="Drop and recreate tables before restore (clean slate)")
    args = parser.parse_args()
    restore(args.backup, args.db, drop_existing=args.drop)
