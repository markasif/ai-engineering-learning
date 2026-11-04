"""
Rate limiting module utilizing slowapi with graceful fallback.
"""

from collections.abc import Callable
import functools
from typing import Any

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address
    from starlette.requests import Request

    limiter: Limiter | None = Limiter(key_func=get_remote_address)
    RATE_LIMITING_ENABLED = True
except ImportError:
    limiter = None
    _rate_limit_exceeded_handler = None  # type: ignore[assignment]
    RateLimitExceeded = Exception  # type: ignore[misc,assignment]
    RATE_LIMITING_ENABLED = False
    Request = Any  # type: ignore[misc,assignment]


def rate_limit(rate: str) -> Callable[[Any], Any]:
    """
    Decorator to apply rate limiting if slowapi is available.
    Safely bypasses rate limiting when an endpoint function is invoked directly
    in unit tests without an active starlette.requests.Request instance.
    """

    def decorator(func: Any) -> Any:
        if limiter is not None:
            limited = limiter.limit(rate)(func)

            @functools.wraps(func)
            async def safe_wrapper(*args: Any, **kwargs: Any) -> Any:
                req = kwargs.get("request")
                if req is None and args:
                    for arg in args:
                        if isinstance(arg, Request):
                            req = arg
                            break
                if not isinstance(req, Request):
                    # Direct python call in unit test without Request object
                    return await func(*args, **kwargs)
                return await limited(*args, **kwargs)

            return safe_wrapper
        return func

    return decorator


__all__ = [
    "limiter",
    "rate_limit",
    "RateLimitExceeded",
    "_rate_limit_exceeded_handler",
    "RATE_LIMITING_ENABLED",
]
