"""
ENZIU Configuration Management
All environment variables and settings for the API.
"""

from __future__ import annotations

from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env from project root (for local development)
# In production, environment variables should be set by the platform
env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "ENZIU API"
    debug: bool = False
    api_prefix: str = "/api"

    # Inference Service (LLM API)
    # Provider-agnostic - works with NScale, OpenAI, Anthropic, etc.
    inference_api_key: str = ""
    inference_api_base: str = "https://inference.api.nscale.com/v1"
    inference_model: str = "meta-llama/Llama-4-Scout-17B-16E-Instruct"
    auditor_model: str = "meta-llama/Llama-3.3-70B-Instruct"
    
    # Upstash Redis
    upstash_redis_rest_url: str = ""
    upstash_redis_rest_token: str = ""

    # Paddle Billing
    paddle_env: str = "sandbox"
    paddle_client_token: str = ""
    paddle_webhook_secret: str = ""
    paddle_product_id: str = ""
    paddle_api_key: str
    paddle_sandbox: bool = True 

    # Voucher System
    voucher_hmac_secret: str = ""

    # CORS
    allowed_origins: str = "http://localhost:3000,https://enziu.vercel.app"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # ===========================================
    # Security Settings
    # ===========================================
    
    # Rate Limiting (requests per minute)
    rate_limit_upload: int = 10       # Expensive AI processing
    rate_limit_chat: int = 30         # AI inference
    rate_limit_voucher: int = 20      # Financial operations
    rate_limit_health: int = 100      # Health checks
    rate_limit_general: int = 100     # General API endpoints
    
    # API Security
    api_secret_key: str = ""          # For JWT/authentication (generate with: openssl rand -hex 32)
    
    # File Upload Limits
    max_upload_size_mb: int = 10      # Maximum file size in MB
    
    # Request Timeout (seconds)
    request_timeout: int = 60         # Maximum request processing time in seconds

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated origins into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]


# Global settings instance
settings = Settings()


# ============================================================================
# Application Constants
# ============================================================================

# Voucher pack types
VALID_PACK_TYPES = ("PAYG", "Starter", "Pro", "Office")

# Transaction ID prefixes
TRANSACTION_ID_PREFIX = "txn_"
PRICE_ID_PREFIX = "pri_"

# Voucher code pattern
VOUCHER_CODE_PREFIX = "ENZ-"

# Minimum passphrase length
MIN_PASSPHRASE_LENGTH = 8

# Session expiration (seconds)
SESSION_EXPIRATION_SECONDS = 3600  # 1 hour

# Default chats per session
DEFAULT_CHATS_PER_SESSION = 5

# API Key requirements
MIN_API_KEY_LENGTH = 32
VALID_API_KEY_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
