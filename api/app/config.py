"""
ENZIU Configuration Management
All environment variables and settings for the API.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "ENZIU API"
    debug: bool = False
    api_prefix: str = "/api"

    # NScale Inference (Llama 3.3 70B Instruct)
    nscale_api_key: str = ""
    nscale_api_base: str = "https://api.nscale.com/v1"
    nscale_model: str = "llama-3.3-70b-instruct"

    # Upstash Redis
    upstash_redis_rest_url: str = ""
    upstash_redis_rest_token: str = ""

    # Paddle Billing
    paddle_env: str = "sandbox"
    paddle_client_token: str = ""
    paddle_webhook_secret: str = ""
    paddle_product_id: str = ""

    # Voucher System
    voucher_hmac_secret: str = ""

    # CORS
    allowed_origins: str = "http://localhost:3000,https://enziu.ai"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated origins into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]


# Global settings instance
settings = Settings()