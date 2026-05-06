"""
ENZIU Configuration Management
All environment variables and settings for the API.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings


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
    allowed_origins: str = "http://localhost:3000,https://enziu.com"

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
    request_timeout: int = 60         # Maximum request processing time

    class Config:
        env_file = ".env"
        case_sensitive = False

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated origins into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]


# Global settings instance
settings = Settings()