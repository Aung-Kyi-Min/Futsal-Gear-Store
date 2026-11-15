from pathlib import Path

from dotenv import load_dotenv


def load_environment():
    """Load backend/.env regardless of the server's working directory.

    Explicitly exported environment variables take precedence.
    """
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


load_environment()
