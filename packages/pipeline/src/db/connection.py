"""Database connection — uses direct PostgreSQL (psycopg2) for local dev."""

import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/perf_marketing")


@contextmanager
def get_db():
    """Get a database connection with dict cursor."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_query(query: str, params=None) -> list[dict]:
    """Execute a SELECT query and return list of dicts."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            return [dict(row) for row in cur.fetchall()]


def execute_write(query: str, params=None) -> int:
    """Execute an INSERT/UPDATE/DELETE and return affected rows."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.rowcount


def execute_many(query: str, data: list[tuple]) -> int:
    """Execute a query with many rows (bulk insert)."""
    with get_db() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, query, data)
            return cur.rowcount
