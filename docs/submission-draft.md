# ETHGlobal Tokyo 2026 submission draft

This file is a working draft. Update it to match only what is actually deployed and demonstrated before submission.

## Project name

FUJIYAMA

## Demonstration URL

TBD — add the final public frontend URL after deployment.

## Short description

Float-aware AMM protecting tokenized stocks from meme-driven onchain float squeezes.

## Description

FUJIYAMA is a float-aware asymmetric AMM for markets where a continuously traded asset is paired with a tokenized stock whose primary-market supply can become temporarily inelastic.

When new stock-token issuance is unavailable, aggressive stock-to-meme flow can move a large fraction of the finite onchain stock-token float into a meme pool. FUJIYAMA tracks active stock-token float utilization and progressively applies a directional guard as utilization approaches a configured stress threshold.

Instead of only charging a higher fee, the prototype routes part of float-draining stock-token input into a stabilization buffer while keeping the restorative meme-to-stock direction unguarded. When issuance becomes available again, buffered inventory can be returned to active liquidity.

The goal is not to stop 24/7 trading. The goal is to make AMM inventory behavior aware of temporary supply elasticity and reduce the conditions that can amplify cross-market stock-token scarcity.

## How it's made

FUJIYAMA was built from scratch during ETHGlobal Tokyo 2026.

The core is a Solidity constant-product AMM implemented with Foundry. It tracks active stock-token reserve relative to total token supply and uses a convex utilization guard:

    u = projected stock-token float utilization
    p = clamp((u - u_soft) / (u_hard - u_soft), 0, 1)
    guard = g_max * p^2

For stock-token -> meme swaps during a closed issuance window, the guard routes a state-dependent fraction of the stock-token input into a stabilization buffer. Only the remaining effective input enters active AMM inventory. Meme -> stock swaps remain unguarded because that direction releases stock-token inventory back to traders.

The repository includes Solidity unit tests, a dependency-free Foundry deployment script, a Python stress replay matching the Solidity guard curve, and a Next.js + viem frontend. The frontend reads live pool state, previews FUJIYAMA versus standard-AMM execution, displays projected guard and buffered inventory, connects to a browser wallet, and executes swaps onchain.

The hackathon prototype currently uses mock ERC-20 assets so the scarcity mechanism is reproducible and testable. Any final chain deployment, oracle integration, or sponsor-specific integration should be added here only after it is actually completed.

AI coding assistance was used for implementation, debugging, tests, documentation, and frontend development. Final design decisions, deployments, verification, demo operation, and submission are performed by the project author.

## Tech stack

- Solidity 0.8.24
- Foundry
- Next.js 15
- React 19
- viem
- Python 3
- EVM-compatible testnet deployment

## Images

TBD — add:
1. hero/dashboard screenshot;
2. swap showing an active directional guard;
3. before/after stress-replay result or architecture diagram.

## Prize selection

TBD — select only sponsor prizes for which the final project has a real qualifying integration.

## Video

TBD — maximum 4 minutes.

Suggested structure:

0:00-0:25 — Problem: a 24/7 tokenized stock can temporarily have non-24/7 supply elasticity.

0:25-0:55 — Mechanism: float utilization + issuance state + asymmetric guard + stabilization buffer.

0:55-2:30 — Live demo: wallet, market state, standard quote vs FUJIYAMA quote, guarded swap, buffer growth, restorative flow.

2:30-3:15 — Stress replay: standard AMM capture versus FUJIYAMA active capture.

3:15-3:45 — Architecture, contracts, tests, and deployment.

3:45-4:00 — Future: verifiable issuance signal, oracle basis, Uniswap v4 Hook/custom accounting, multi-pool float accounting.

## Future

A production version would replace the manual issuance-window flag with a verifiable market-state signal, incorporate reference-price basis and stock/stable liquidity depth, and account for stock-token float captured across multiple pools rather than only one AMM.

The next protocol version can express FUJIYAMA as a Uniswap v4 Hook or custom-accounting design so existing liquidity infrastructure can use the same asymmetric inventory rule. A stabilization module could also make buffered inventory available to a stock/stable venue when the stock token trades above its external reference, then unwind the protection automatically once primary-market supply elasticity returns.

## Final checklist

- Public GitHub repository remains public.
- Frequent commits visibly show hackathon development.
- `forge test` passes locally.
- Frontend production build passes.
- Contracts are deployed and addresses are recorded.
- Demo URL is public and works from a fresh browser session.
- Wallet/network onboarding works.
- At least one live onchain transaction is shown in the demo.
- README matches what was actually built.
- AI usage is disclosed.
- Video is 4 minutes or less and is not sped up.
- Selected sponsor prizes have genuine qualifying integrations.
