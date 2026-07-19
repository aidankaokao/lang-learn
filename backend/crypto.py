"""低階加密工具：密碼雜湊 + 對稱加密（Fernet，用於 LLM provider 的 api_key）。

這一層只依賴 config，不依賴 services / security，避免循環 import
（security.py 需要 user_service，user_service 需要密碼雜湊）。

Fernet 金鑰取自 settings.encryption_key；留空時從 jwt_secret 推導出合法金鑰，
讓本機開發不必先產金鑰。正式環境請在 .env 明確設定 ENCRYPTION_KEY。
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from passlib.context import CryptContext

from config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── 密碼雜湊 ────────────────────────────────────────────
def hash_password(password: str) -> str:
    # bcrypt 只吃前 72 bytes，超過會直接報錯，先截斷
    return _pwd.hash(password[:72])


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password[:72], password_hash)


@lru_cache
def _fernet() -> Fernet:
    key = settings.encryption_key.strip()
    if not key:
        # Fernet 需要 32 bytes 的 urlsafe base64 金鑰
        digest = hashlib.sha256(settings.jwt_secret.encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key.encode())


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """解不開時回空字串（例如換過金鑰），由呼叫端當成「未設定」處理。"""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


def mask(secret: str) -> str:
    """回前端用的遮罩，只露尾 4 碼。"""
    if not secret:
        return ""
    return f"{'*' * 8}{secret[-4:]}" if len(secret) > 4 else "*" * 8
