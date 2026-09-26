#!/usr/bin/env python3
"""FUJIYAMA mechanism stress replay.

This script is deliberately simple and dependency-free. It compares:

1. a standard AMM that accepts all stock-token flow into active inventory; and
2. FUJIYAMA, which applies the same convex float-utilization guard used by the
   Solidity prototype while primary-market issuance is unavailable.

The default stress case normalizes total stock-token supply to the documented
HIMS/BONER float-squeeze scale (81% final capture in the unprotected path).
It is a mechanism replay, not a claim about the historical HIMS price path.
"""

from dataclasses import dataclass

TOTAL_SUPPLY = 15_227.0
INITIAL_CAPTURE = 0.10
BASELINE_FINAL_CAPTURE = 0.81

SOFT_UTILIZATION = 0.20
HARD_UTILIZATION = 0.50
MAX_GUARD = 0.95

STEPS = 100_000


@dataclass
class Result:
    active_stock: float
    buffer_stock: float

    @property
    def active_capture(self) -> float:
        return self.active_stock / TOTAL_SUPPLY

    @property
    def buffer_capture(self) -> float:
        return self.buffer_stock / TOTAL_SUPPLY


def guard_rate(projected_utilization: float, mint_closed: bool = True) -> float:
    """Match FujiyamaAMM.sol: g = g_max * p^2 between soft and hard thresholds."""
    if not mint_closed or projected_utilization <= SOFT_UTILIZATION:
        return 0.0
    if projected_utilization >= HARD_UTILIZATION:
        return MAX_GUARD

    progress = (
        (projected_utilization - SOFT_UTILIZATION)
        / (HARD_UTILIZATION - SOFT_UTILIZATION)
    )
    return MAX_GUARD * progress * progress


def replay_fujiyama(gross_stock_flow: float, steps: int = STEPS) -> Result:
    active_stock = TOTAL_SUPPLY * INITIAL_CAPTURE
    buffer_stock = 0.0
    dq = gross_stock_flow / steps

    for _ in range(steps):
        projected_utilization = (active_stock + dq) / TOTAL_SUPPLY
        guard = guard_rate(projected_utilization, mint_closed=True)

        active_stock += dq * (1.0 - guard)
        buffer_stock += dq * guard

    return Result(active_stock=active_stock, buffer_stock=buffer_stock)


def pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def main() -> None:
    initial_stock = TOTAL_SUPPLY * INITIAL_CAPTURE
    baseline_final_stock = TOTAL_SUPPLY * BASELINE_FINAL_CAPTURE
    gross_flow = baseline_final_stock - initial_stock

    protected = replay_fujiyama(gross_flow)

    print("FUJIYAMA float-utilization stress replay")
    print("=" * 46)
    print(f"Total stock-token supply:       {TOTAL_SUPPLY:,.0f}")
    print(f"Initial active capture:         {pct(INITIAL_CAPTURE)}")
    print(f"Gross float-draining flow:      {gross_flow:,.0f}")
    print()
    print("Guard configuration")
    print(f"Soft utilization:               {pct(SOFT_UTILIZATION)}")
    print(f"Hard utilization:               {pct(HARD_UTILIZATION)}")
    print(f"Maximum guard:                  {pct(MAX_GUARD)}")
    print()
    print("Counterfactual end state")
    print(f"Standard AMM active capture:    {pct(BASELINE_FINAL_CAPTURE)}")
    print(f"FUJIYAMA active capture:        {pct(protected.active_capture)}")
    print(f"FUJIYAMA stabilization buffer:  {protected.buffer_stock:,.0f}")
    print(f"Buffer / total supply:          {pct(protected.buffer_capture)}")
    print()
    print("Guard curve checkpoints")
    for utilization in (0.10, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.80):
        print(
            f"utilization={pct(utilization):>7} -> "
            f"guard={pct(guard_rate(utilization)):>7}"
        )
    print()
    print("IMPORTANT: this is a mechanism stress test, not a historical price replay.")


if __name__ == "__main__":
    main()
