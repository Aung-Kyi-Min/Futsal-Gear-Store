import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from app import config
from app.auth import get_auth_db, get_signing_secret


class ConfigurationTest(unittest.TestCase):
    def test_loads_backend_env_without_overwriting_exported_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.env').write_text('DATABASE_URL=postgresql+psycopg://local/test\nAUTH_SECRET_KEY=' + 'x' * 40)
            with patch.object(config, '__file__', str(root / 'app' / 'config.py')):
                with patch.dict(os.environ, {'DATABASE_URL': 'exported-value'}, clear=True):
                    config.load_environment()
                    self.assertEqual(os.environ['DATABASE_URL'], 'exported-value')
                    self.assertEqual(get_signing_secret(), 'x' * 40)
                with patch.dict(os.environ, {}, clear=True):
                    config.load_environment()
                    self.assertEqual(os.environ['DATABASE_URL'], 'postgresql+psycopg://local/test')

    def test_missing_database_configuration_explains_503(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as caught:
                next(get_auth_db())
            self.assertEqual(caught.exception.status_code, 503)
            self.assertEqual(caught.exception.detail, 'Authentication database is not configured')
