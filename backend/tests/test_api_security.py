from __future__ import annotations

import asyncio
import logging
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from specify_backend import api  # noqa: E402


async def _stub_run_pipeline(prd_text: str) -> dict[str, object]:
    return {"summary": prd_text, "decisions": [], "contradictions": [], "meta": {}}


class ApiSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self._run_pipeline_patch = patch.object(api, "run_pipeline", _stub_run_pipeline)
        self._run_pipeline_patch.start()
        api._request_history.clear()
        api.app.state.analyze_token = None
        api.app.state.trust_proxy_headers = False

    def tearDown(self) -> None:
        self._run_pipeline_patch.stop()
        api._request_history.clear()
        api.app.state.analyze_token = None
        api.app.state.trust_proxy_headers = False

    def test_token_mismatch_is_rejected(self) -> None:
        with patch.dict(os.environ, {"SPECIFY_ANALYZE_TOKEN": "dummy"}, clear=False):
            with TestClient(api.app) as client:
                api.app.state.analyze_token = "secret"
                response = client.post(
                    "/api/analyze/sync",
                    json={"prd_text": "test"},
                    headers={"X-Specify-Token": "wrong"},
                )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "認証に失敗しました。")

    def test_trusted_proxy_headers_split_rate_limit_keys(self) -> None:
        with patch.dict(os.environ, {"SPECIFY_ANALYZE_TOKEN": "dummy"}, clear=False):
            with TestClient(api.app) as client:
                api.app.state.analyze_token = None
                api.app.state.trust_proxy_headers = True
                for _ in range(6):
                    response = client.post(
                        "/api/analyze/sync",
                        json={"prd_text": "test"},
                        headers={"X-Forwarded-For": "203.0.113.10"},
                    )
                    self.assertEqual(response.status_code, 200)

                response = client.post(
                    "/api/analyze/sync",
                    json={"prd_text": "test"},
                    headers={"X-Forwarded-For": "203.0.113.11"},
                )

        self.assertEqual(response.status_code, 200)

    def test_untrusted_proxy_headers_do_not_bypass_rate_limit(self) -> None:
        with patch.dict(os.environ, {"SPECIFY_ANALYZE_TOKEN": "dummy"}, clear=False):
            with TestClient(api.app) as client:
                api.app.state.analyze_token = None
                api.app.state.trust_proxy_headers = False
                for idx in range(6):
                    response = client.post(
                        "/api/analyze/sync",
                        json={"prd_text": "test"},
                        headers={"X-Forwarded-For": f"203.0.113.{idx}"},
                    )
                    self.assertEqual(response.status_code, 200)

                response = client.post(
                    "/api/analyze/sync",
                    json={"prd_text": "test"},
                    headers={"X-Forwarded-For": "198.51.100.99"},
                )

        self.assertEqual(response.status_code, 429)

    def test_missing_token_logs_warning_and_disables_auth(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertLogs(api._logger, level="WARNING") as captured:
                asyncio.run(api._load_security_config())

        self.assertIsNone(api.app.state.analyze_token)
        self.assertFalse(api.app.state.trust_proxy_headers)
        self.assertTrue(
            any("SPECIFY_ANALYZE_TOKEN が未設定" in message for message in captured.output)
        )


if __name__ == "__main__":
    unittest.main()
