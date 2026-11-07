"""
Circuit Breaker implementation for external LLM and API providers.

Prevents cascading timeouts, resource starvation, and API spam during
provider outages or strict rate-limiting (HTTP 429/503).
"""

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)


class CircuitBreakerOpenException(Exception):
    """Raised when an operation is attempted while the circuit breaker is OPEN."""

    pass


class CircuitBreaker:
    """
    State machine for circuit breaker pattern:
      - CLOSED: Normal operation; requests pass through.
      - OPEN: Failures exceeded threshold; requests fail fast without hitting provider.
      - HALF_OPEN: Cooldown elapsed; allows a trial request to probe provider health.
    """

    def __init__(
        self,
        name: str = "llm-provider",
        failure_threshold: int = 3,
        recovery_timeout_seconds: float = 30.0,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds
        self.failure_count: int = 0
        self.last_failure_time: float = 0.0
        self.state: str = "CLOSED"  # CLOSED, OPEN, HALF_OPEN

    def record_success(self) -> None:
        """Reset failure counter and return circuit to CLOSED."""
        if self.state != "CLOSED":
            logger.info("CircuitBreaker [%s] recovered -> CLOSED", self.name)
        self.failure_count = 0
        self.state = "CLOSED"

    def record_failure(self, error: Exception) -> None:
        """Increment failure counter and trip breaker if threshold reached."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        logger.warning(
            "CircuitBreaker [%s] failure %d/%d: %s",
            self.name,
            self.failure_count,
            self.failure_threshold,
            error,
        )
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
            logger.error(
                "CircuitBreaker [%s] TRIPPED -> OPEN (cooldown: %.1fs)",
                self.name,
                self.recovery_timeout_seconds,
            )

    def can_execute(self) -> bool:
        """
        Check if request should proceed.
        Returns True if CLOSED or trial request in HALF_OPEN.
        """
        if self.state == "CLOSED":
            return True

        # Check if recovery timeout has passed
        now = time.time()
        if now - self.last_failure_time >= self.recovery_timeout_seconds:
            self.state = "HALF_OPEN"
            logger.info(
                "CircuitBreaker [%s] cooldown elapsed -> HALF_OPEN (probing)",
                self.name,
            )
            return True

        return False

    def get_status(self) -> dict[str, Any]:
        """Return operational snapshot of the breaker."""
        return {
            "name": self.name,
            "state": self.state,
            "failure_count": self.failure_count,
            "threshold": self.failure_threshold,
            "recovery_timeout_s": self.recovery_timeout_seconds,
        }


# Global breaker instance for LLM calls
llm_circuit_breaker = CircuitBreaker(
    "primary-llm", failure_threshold=3, recovery_timeout_seconds=30.0
)
