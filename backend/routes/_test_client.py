from __future__ import annotations

from fastapi.testclient import TestClient

from main import app
from testing_fixtures import isolate_test_database

isolate_test_database()

# The request guard refuses TestClient's "testserver" host.
client = TestClient(app, base_url="http://127.0.0.1")
