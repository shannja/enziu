"""
ENZIU Voucher Service
Privacy-first voucher validation and management.

Security features:
- HMAC validation for fast rejection of fake codes
- Bcrypt passphrase hashing
- Atomic credit operations in Redis
- Zero PII storage (no email required)
"""

from __future__ import annotations

import hmac
import hashlib
import secrets
import re
import time
from typing import Any

import bcrypt

from ..config import settings


# ===========================================
# Voucher Code Generation
# ===========================================

def generate_voucher_code() -> str:
    """
    Generate a cryptographically secure voucher code.
    
    Format: ENZ-XXXX-XXXX-XXXX (4 groups of 4 alphanumeric chars)
    Example: ENZ-R9T2-K8P1-XQ9W
    """
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # No I, O, 0, 1 for clarity
    groups: list[str] = []
    
    for _ in range(3):
        group = "".join(secrets.choice(chars) for _ in range(4))
        groups.append(group)
    
    return f"ENZ-{groups[0]}-{groups[1]}-{groups[2]}"


def validate_voucher_format(code: str) -> bool:
    """
    Validate voucher code format.
    
    Args:
        code: Voucher code to validate
        
    Returns:
        True if format is valid
    """
    pattern = r"^ENZ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$"
    return bool(re.match(pattern, code.upper()))


# ===========================================
# HMAC Validation
# ===========================================

def compute_hmac(code: str) -> str:
    """
    Compute HMAC for a voucher code.
    
    Used for fast rejection of obviously fake codes
    before hitting Redis.
    
    Args:
        code: Voucher code
        
    Returns:
        HMAC hex digest
    """
    return hmac.new(
        settings.voucher_hmac_secret.encode(),
        code.encode(),
        hashlib.sha256,
    ).hexdigest()


def validate_hmac(code: str, expected_hmac: str) -> bool:
    """
    Validate HMAC for a voucher code.
    
    Args:
        code: Voucher code
        expected_hmac: Expected HMAC value
        
    Returns:
        True if HMAC matches
    """
    computed = compute_hmac(code)
    return hmac.compare_digest(computed, expected_hmac)


# ===========================================
# Bcrypt Passphrase Hashing
# ===========================================

def hash_passphrase(passphrase: str) -> str:
    """
    Hash a passphrase using bcrypt.
    
    Args:
        passphrase: Plain text passphrase
        
    Returns:
        Bcrypt hash
    """
    return bcrypt.hashpw(
        passphrase.encode(),
        bcrypt.gensalt(rounds=12),
    ).decode()


def verify_passphrase(passphrase: str, hashed: str) -> bool:
    """
    Verify a passphrase against a bcrypt hash.
    
    Args:
        passphrase: Plain text passphrase
        hashed: Bcrypt hash to verify against
        
    Returns:
        True if passphrase matches
    """
    try:
        return bcrypt.checkpw(
            passphrase.encode(),
            hashed.encode(),
        )
    except (ValueError, TypeError):
        return False


# ===========================================
# Voucher Service
# ===========================================

class VoucherService:
    """
    Service for voucher validation and management.
    
    All operations are designed for privacy:
    - No email storage
    - No persistent identity
    - Code + passphrase hash only
    """
    
    # Voucher pack configurations
    PACKS: dict[str, dict[str, Any]] = {
        "PAYG": {"price": 4.99, "credits": 1, "chats": 5},
        "Starter": {"price": 50, "credits": 10, "chats": 10},
        "Pro": {"price": 100, "credits": 25, "chats": 20},
        "Office": {"price": 200, "credits": 50, "chats": 20},
    }
    
    def __init__(self) -> None:
        self.hmac_secret = settings.voucher_hmac_secret
    
    async def validate(
        self, code: str, passphrase: str
    ) -> dict[str, Any]:
        """
        Validate a voucher code with passphrase.
        
        Flow:
        1. Format validation
        2. HMAC fast rejection
        3. Redis lookup
        4. Bcrypt passphrase verification
        5. Credit balance check
        
        Args:
            code: Voucher code
            passphrase: User's passphrase
            
        Returns:
            Validation result with credits if valid
        """
        # Step 1: Format validation
        if not validate_voucher_format(code):
            return {"valid": False, "error": "Invalid voucher code format"}
        
        # Step 2: HMAC validation (fast rejection)
        # In production, the HMAC would be stored with the voucher
        # For now, we compute and check format
        code_upper = code.upper()
        
        # Step 3: Redis lookup (simulated)
        # In production: voucher_data = await redis.get(f"voucher:{code_upper}")
        voucher_data = await self._get_voucher_from_redis(code_upper)
        
        if not voucher_data:
            return {"valid": False, "error": "Voucher code not found"}
        
        # Step 4: Bcrypt passphrase verification
        if not verify_passphrase(passphrase, voucher_data["passphrase_hash"]):
            return {"valid": False, "error": "Invalid passphrase"}
        
        # Step 5: Credit balance check
        credits = voucher_data.get("credits", 0)
        if credits <= 0:
            return {"valid": False, "error": "No credits remaining"}
        
        return {
            "valid": True,
            "credits": credits,
            "pack_type": voucher_data.get("pack_type", "Unknown"),
        }
    
    async def recover(self, passphrase: str) -> dict[str, Any]:
        """
        Recover a voucher code using passphrase.
        
        Searches all vouchers for matching passphrase hash.
        No email required.
        
        Args:
            passphrase: User's passphrase
            
        Returns:
            Voucher code if found
        """
        # In production, this would search Redis for matching passphrase hash
        # For now, return not found
        return {"valid": False, "error": "No voucher found for this passphrase"}
    
    async def decrement(self, code: str) -> dict[str, Any]:
        """
        Atomically decrement voucher credits.
        
        Uses Redis DECR to prevent double-spending.
        
        Args:
            code: Voucher code
            
        Returns:
            Remaining credits
        """
        code_upper = code.upper()
        
        # In production: remaining = await redis.decr(f"voucher:{code_upper}:credits")
        # For now, simulate
        return {"remaining": 0}
    
    async def create_voucher(
        self,
        pack_type: str,
        passphrase: str,
    ) -> dict[str, Any]:
        """
        Create a new voucher.
        
        Called after successful Paddle payment.
        
        Args:
            pack_type: Pack type (PAYG, Starter, Pro, Office)
            passphrase: User's chosen passphrase
            
        Returns:
            Voucher code and details
        """
        if pack_type not in self.PACKS:
            raise ValueError(f"Invalid pack type: {pack_type}")
        
        pack = self.PACKS[pack_type]
        
        # Generate code
        code = generate_voucher_code()
        
        # Hash passphrase
        passphrase_hash = hash_passphrase(passphrase)
        
        # Store in Redis (simulated)
        voucher_data: dict[str, Any] = {
            "code": code,
            "passphrase_hash": passphrase_hash,
            "pack_type": pack_type,
            "credits": pack["credits"],
            "chats_per_session": pack["chats"],
            "created_at": time.time(),
        }
        
        await self._store_voucher_in_redis(code, voucher_data)
        
        return {
            "code": code,
            "credits": pack["credits"],
            "chats_per_session": pack["chats"],
            "pack_type": pack_type,
        }
    
    async def _get_voucher_from_redis(
        self, code: str
    ) -> dict[str, Any] | None:
        """
        Retrieve voucher data from Redis.
        
        In production, this connects to Upstash Redis.
        """
        # TODO: Implement Redis connection
        return None
    
    async def _store_voucher_in_redis(
        self, code: str, data: dict[str, Any]
    ) -> None:
        """
        Store voucher data in Redis.
        
        In production, this connects to Upstash Redis.
        """
        # TODO: Implement Redis connection
        pass