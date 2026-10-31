"""
Rate limiting module utilizing slowapi with graceful fallback.
"""
from typing import Callable, Any

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address

    limiter: Limiter | None = Limiter(key_func=get_remote_address)
    RATE_LIMITING_ENABLED = True
except ImportError:
    limiter = None
    _rate_limit_exceeded_handler = None  # type: ignore[assignment]
    RateLimitExceeded = Exception  # type: ignore[misc,assignment]
    RATE_LIMITING_ENABLED = False


def rate_limit(rate: str) -> Callable[[Any], Any]:
    """Decorator to apply rate limiting if slowapi is available, otherwise no-op."""
    def decorator(func: Any) -> Any:
        if limiter is not None:
            return limiter.limit(rate)(func)
        return func
    return decorator


__all__ = [
    "limiter",
    "rate_limit",
    "RateLimitExceeded",
    "_rate_limit_exceeded_handler",
    "RATE_LIMITING_ENABLED",
]

