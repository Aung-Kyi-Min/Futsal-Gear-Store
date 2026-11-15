"""Interactively verify PostgreSQL credentials before saving backend/.env."""

from getpass import getpass
from pathlib import Path
import secrets

from dotenv import dotenv_values, set_key
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import OperationalError


ENV_PATH = Path(__file__).resolve().parents[1] / '.env'


def prompt(label, default):
    return input(f'{label} [{default}]: ').strip() or str(default)


def main():
    settings = dotenv_values(ENV_PATH)
    try:
        current = make_url(settings.get('DATABASE_URL') or '')
    except Exception:
        current = URL.create('postgresql+psycopg')

    print('Use the connection settings from your pgAdmin server.')
    host = prompt('Host', current.host or '127.0.0.1')
    port = int(prompt('Port', current.port or 5433))
    username = prompt('PostgreSQL username', current.username or 'postgres')
    database = prompt('Database', current.database or 'futsal_gear_store')
    password = getpass('PostgreSQL password (type the actual password, without URL encoding): ')
    url = URL.create('postgresql+psycopg', username=username, password=password,
                     host=host, port=port, database=database)
    engine = create_engine(url, connect_args={'connect_timeout': 5}, hide_parameters=True)
    try:
        with engine.connect() as db:
            identity = db.execute(text(
                'SELECT current_user, current_database(), inet_server_port()'
            )).one()
            schema_exists = db.execute(text("SELECT to_regclass('public.users') IS NOT NULL")).scalar()
    except OperationalError as exc:
        message = str(exc.orig)
        if 'password authentication failed' in message:
            print('PostgreSQL rejected these credentials. URL encoding is not the cause.')
            print('Verify the username and server instance in pgAdmin, or reset the password on that instance.')
        elif 'does not exist' in message:
            print('The requested database or role does not exist on this server.')
        else:
            print('Could not connect. Check the host, port, and whether PostgreSQL is running.')
        print('Your .env file was not changed.')
        return 1
    finally:
        engine.dispose()

    # URL.create handles special characters; never print the rendered URL/password.
    ENV_PATH.touch(mode=0o600, exist_ok=True)
    ENV_PATH.chmod(0o600)
    set_key(str(ENV_PATH), 'DATABASE_URL', url.render_as_string(hide_password=False))
    if len((settings.get('AUTH_SECRET_KEY') or '').encode()) < 32:
        set_key(str(ENV_PATH), 'AUTH_SECRET_KEY', secrets.token_urlsafe(48))
    print(f'Connected: user={identity[0]}, database={identity[1]}, port={identity[2]}.')
    print('Saved backend/.env. Restart FastAPI in a terminal without an exported DATABASE_URL.')
    if not schema_exists:
        print('The users table is missing. Apply the initial schema before registering.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (KeyboardInterrupt, EOFError):
        print('\nCancelled. No credentials were saved.')
        raise SystemExit(1)
    except ValueError:
        print('Invalid connection settings. Port must be a number from 1 to 65535.')
        raise SystemExit(1)
