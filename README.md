# FUJIYAMA

**A float-aware asymmetric AMM for tokenized-stock / meme markets.**

FUJIYAMA is being built from scratch at ETHGlobal Tokyo 2026.

Tokenized stocks can trade 24/7 onchain even when primary-market issuance is temporarily unavailable. During that window, a reflexive meme market can absorb a large share of the stock token's finite onchain float and make the stock side of the market unusually scarce.

FUJIYAMA makes the AMM state-aware:

- normal state: trade like a conventional constant-product AMM;
- stressed state: detect rising stock-token float utilization;
- float-draining flow (Stock Token -> Meme): progressively route part of the incoming stock inventory into a stabilization buffer;
- restorative flow (Meme -> Stock Token): remains unguarded;
- after issuance reopens: guarded inventory can be returned to active liquidity.

The first onchain implementation uses a gas-cheap convex "mountain" guard rather than a sigmoid:

```text
u = projected stock-token float utilization
p = clamp((u - u_soft) / (u_hard - u_soft), 0, 1)
guard = g_max * p^2
```

This makes marginal protection increase rapidly as utilization approaches the configured hard threshold.

## Hackathon status

Work in progress. The repository intentionally starts fresh for ETHGlobal Tokyo 2026.

Planned milestones:

1. core Solidity AMM + unit tests;
2. deployable mock stock/meme market;
3. browser demo showing utilization, guard strength, buffer inventory and swaps;
4. stress replay comparing a normal AMM with FUJIYAMA.

## AI usage

AI coding assistance is being used for implementation, testing, documentation, and debugging. Final design choices, deployment, verification, demo operation, and submission are performed by the project author.

## License

MIT
