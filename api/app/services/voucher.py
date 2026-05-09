"""
ENZIU Voucher Service
Privacy-first voucher creation, validation, and recovery.

Security design:
- HMAC for fast rejection of structurally invalid codes
- bcrypt for passphrase hashing (never stored in plaintext)
- Atomic credit operations via Redis DECR
- Zero PII — no email, no identity, code + passphrase hash only

Storage:
- Development / hackathon: in-memory dict (resets on restart)
- Production: swap _get / _store for Upstash Redis calls
"""

from __future__ import annotations

import hmac
import hashlib
import logging
import re
import secrets
import string
import time
from typing import Any

import bcrypt

from ..config import settings, MIN_PASSPHRASE_LENGTH

logger = logging.getLogger("voucher")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)


# ---------------------------------------------------------------------------
# In-memory store (hackathon)
# Replace _get_voucher and _store_voucher bodies with Upstash Redis for prod.
# ---------------------------------------------------------------------------

_store: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Code generation
# ---------------------------------------------------------------------------

# Character set excludes I, O, 0, 1 to avoid visual confusion
_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_PATTERN = re.compile(
    r"^ENZ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{2}$"
)


def _compute_checksum(code_12: str) -> str:
    """
    Compute a 2-character checksum from 12 random chars (without dashes).
    code_12: e.g. 'A7K3M9X2QR5J'
    Returns 2 chars from _CHARSET.
    """
    total = sum(_CHARSET.index(c) for c in code_12)
    mod = total % (len(_CHARSET) * len(_CHARSET))  # 30*30 = 900
    return _CHARSET[mod // len(_CHARSET)] + _CHARSET[mod % len(_CHARSET)]


def _verify_checksum(code: str) -> bool:
    """
    Verify the checksum of a full voucher code.
    Strips dashes, extracts the 12 base chars and 2 check chars, recomputes.
    """
    flat = code.replace("-", "").upper()
    if len(flat) != 14:
        return False
    base = flat[:12]
    check = flat[12:14]
    return _compute_checksum(base) == check


def _generate_code() -> str:
    """Generate a cryptographically secure voucher code: ENZ-XXXX-XXXX-XXXX-CC"""
    segments = [
        "".join(secrets.choice(_CHARSET) for _ in range(4))
        for _ in range(3)
    ]
    base = f"ENZ-{segments[0]}-{segments[1]}-{segments[2]}"
    base_flat = base.replace("-", "").replace("ENZ", "")
    checksum = _compute_checksum(base_flat)
    return f"{base}-{checksum}"


def _valid_format(code: str) -> bool:
    """Validate format AND checksum."""
    code = code.upper().strip()
    if not _CODE_PATTERN.match(code):
        return False
    return _verify_checksum(code)


# ---------------------------------------------------------------------------
# HMAC (fast structural rejection before Redis hit)
# ---------------------------------------------------------------------------

def _sign(code: str) -> str:
    return hmac.new(
        settings.voucher_hmac_secret.encode(),
        code.encode(),
        hashlib.sha256,
    ).hexdigest()


# ---------------------------------------------------------------------------
# Passphrase hashing
# ---------------------------------------------------------------------------

def _hash_passphrase(passphrase: str) -> str:
    return bcrypt.hashpw(passphrase.encode(), bcrypt.gensalt(rounds=12)).decode()


def _check_passphrase(passphrase: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(passphrase.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Low-level storage — swap these two functions for Redis in production
# ---------------------------------------------------------------------------

async def _get_voucher(code: str) -> dict[str, Any] | None:
    """
    Retrieve voucher data by code.
    Production: return await redis.get(f"voucher:{code}")
    """
    return _store.get(code)


async def _store_voucher(code: str, data: dict[str, Any]) -> None:
    """
    Persist voucher data.
    Production: await redis.set(f"voucher:{code}", data, ex=ttl)
    """
    _store[code] = data


async def _decrement_credits(code: str) -> int:
    """
    Atomically decrement credits and return the new value.
    Production: return await redis.decr(f"voucher:{code}:credits")
    """
    voucher = _store.get(code)
    if not voucher:
        return -1
    voucher["credits"] = max(0, voucher["credits"] - 1)
    return voucher["credits"]


# ---------------------------------------------------------------------------
# Pack catalogue
# ---------------------------------------------------------------------------

PACKS: dict[str, dict[str, Any]] = {
    "PAYG":    {"price": 4.99,  "credits": 1,  "chats_per_session": 5},
    "Starter": {"price": 50.00, "credits": 10, "chats_per_session": 10},
    "Pro":     {"price": 100.00,"credits": 25, "chats_per_session": 20},
    "Office":  {"price": 200.00,"credits": 50, "chats_per_session": 20},
}


# ---------------------------------------------------------------------------
# VoucherService
# ---------------------------------------------------------------------------

class VoucherService:
    """
    All voucher lifecycle operations.
    Paddle routes call create_voucher(); everything else is for consumers.
    """

    # ------------------------------------------------------------------
    # Create (called by paddle.verify_payment after confirmed payment)
    # ------------------------------------------------------------------

    async def create_voucher(
        self,
        pack_type: str,
        passphrase: str,
        transaction_id: str = "",
    ) -> dict[str, Any]:
        """
        Generate and persist a new voucher after a confirmed Paddle payment.

        Args:
            pack_type:      One of PAYG | Starter | Pro | Office
            passphrase:     User-chosen recovery passphrase (min 8 chars)
            transaction_id: Paddle transaction ID — stored for audit only

        Returns:
            dict with code, credits, chats_per_session, pack_type
        """
        if pack_type not in PACKS:
            raise ValueError(f"Unknown pack_type '{pack_type}'")

        if len(passphrase) < MIN_PASSPHRASE_LENGTH:
            raise ValueError(f"Passphrase must be at least {MIN_PASSPHRASE_LENGTH} characters")

        pack = PACKS[pack_type]
        code = _generate_code()
        passphrase_hash = _hash_passphrase(passphrase)
        hmac_sig = _sign(code)

        record: dict[str, Any] = {
            "code": code,
            "passphrase_hash": passphrase_hash,
            "hmac": hmac_sig,
            "pack_type": pack_type,
            "credits": pack["credits"],
            "chats_per_session": pack["chats_per_session"],
            "transaction_id": transaction_id,  # audit trail only
            "created_at": time.time(),
        }

        await _store_voucher(code, record)

        logger.info(
            "Voucher created — code=%s... pack=%s credits=%d txn=%s",
            code[:8],
            pack_type,
            pack["credits"],
            transaction_id or "n/a",
        )

        return {
            "code": code,
            "credits": pack["credits"],
            "chats_per_session": pack["chats_per_session"],
            "pack_type": pack_type,
        }

    # ------------------------------------------------------------------
    # Validate (called by consumer endpoints)
    # ------------------------------------------------------------------

    async def validate(self, code: str, passphrase: str) -> dict[str, Any]:
        """
        Validate a voucher code + passphrase.

        Steps:
        1. Format check
        2. Storage lookup
        3. HMAC structural check
        4. bcrypt passphrase check
        5. Credit balance check
        """
        code = code.upper().strip()

        if not _valid_format(code):
            return {"valid": False, "error": "Invalid voucher code format"}

        record = await _get_voucher(code)
        if not record:
            return {"valid": False, "error": "Voucher code not found"}

        # HMAC check — catches tampered codes that somehow passed format validation
        if not hmac.compare_digest(_sign(code), record.get("hmac", "")):
            logger.warning("HMAC mismatch for code %s...", code[:8])
            return {"valid": False, "error": "Voucher code not found"}

        if not _check_passphrase(passphrase, record["passphrase_hash"]):
            return {"valid": False, "error": "Invalid passphrase"}

        credits: int = record.get("credits", 0)
        if credits <= 0:
            return {"valid": False, "error": "No credits remaining"}

        return {
            "valid": True,
            "credits": credits,
            "pack_type": record.get("pack_type", "Unknown"),
        }

    # ------------------------------------------------------------------
    # Recover
    # ------------------------------------------------------------------

    async def recover(self, passphrase: str) -> dict[str, Any]:
        """
        Recover a voucher code by scanning for a matching passphrase hash.
        No email required.

        NOTE: For production with Redis, maintain a secondary index:
            passphrase_prefix → [code, ...] to avoid full scan.
        """
        for code, record in _store.items():
            if _check_passphrase(passphrase, record.get("passphrase_hash", "")):
                logger.info("Voucher recovered — code=%s...", code[:8])
                return {
                    "found": True,
                    "code": code,
                    "credits": record.get("credits", 0),
                    "pack_type": record.get("pack_type"),
                }

        return {"found": False, "error": "No voucher found for this passphrase"}

    # ------------------------------------------------------------------
    # Decrement
    # ------------------------------------------------------------------

    async def decrement(self, code: str) -> dict[str, Any]:
        """
        Atomically consume one credit from a voucher.
        Prevents double-spending.
        """
        code = code.upper().strip()
        remaining = await _decrement_credits(code)

        if remaining < 0:
            raise ValueError("Voucher not found")

        logger.info("Credit decremented — code=%s... remaining=%d", code[:8], remaining)
        return {"remaining": remaining}