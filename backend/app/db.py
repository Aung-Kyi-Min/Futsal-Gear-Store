from functools import lru_cache

from sqlalchemy import create_engine

from . import config  # Load backend/.env before resolving database settings.


@lru_cache(maxsize=1)
def postgres_engine(database_url: str):
    return create_engine(database_url, pool_pre_ping=True, hide_parameters=True)
