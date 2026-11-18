"""Minimal watsonx.ai client: IBM Cloud IAM token exchange + text chat API."""

from __future__ import annotations

import json
import os
import re
import time

import httpx

IAM_URL = "https://iam.cloud.ibm.com/identity/token"
API_VERSION = "2024-10-08"


class WatsonxClient:
    def __init__(self):
        self.api_key = os.getenv("WATSONX_API_KEY")
        self.project_id = os.getenv("WATSONX_PROJECT_ID")
        self.url = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").rstrip("/")
        self.model_id = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-3-8b-instruct")
        self._token: str | None = None
        self._token_expiry = 0.0
        self.http = httpx.Client(timeout=30.0)

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.project_id)

    def _bearer(self) -> str:
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        resp = self.http.post(
            IAM_URL,
            data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": self.api_key},
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        body = resp.json()
        self._token = body["access_token"]
        self._token_expiry = time.time() + int(body.get("expires_in", 3600))
        return self._token

    def chat(self, system: str, user: str, max_tokens: int = 350) -> str:
        resp = self.http.post(
            f"{self.url}/ml/v1/text/chat",
            params={"version": API_VERSION},
            headers={"Authorization": f"Bearer {self._bearer()}", "Accept": "application/json"},
            json={
                "model_id": self.model_id,
                "project_id": self.project_id,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "max_tokens": max_tokens,
                "temperature": 0.2,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def chat_json(self, system: str, user: str) -> dict:
        text = self.chat(system, user)
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        return {"headline": text.strip().split("\n")[0][:120], "explanation": text.strip(), "recommended_action": ""}

    def list_chat_models(self) -> list[str]:
        resp = self.http.get(
            f"{self.url}/ml/v1/foundation_model_specs",
            params={"version": API_VERSION, "filters": "function_text_chat", "limit": 200},
        )
        resp.raise_for_status()
        return sorted(m["model_id"] for m in resp.json().get("resources", []))
