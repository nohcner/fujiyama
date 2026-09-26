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

The first onchain implementation uses a gas-cheap convex "mountain" guard:

```text
u = projected stock-token float utilization
p = clamp((u - u_soft) / (u_hard - u_soft), 0, 1)
guard = g_max * p^2
```

This makes marginal protection increase rapidly as utilization approaches the configured hard threshold. The proposed trade is evaluated against **projected** utilization, so a single large trade cannot cross the threshold without protection.

## Repository

```text
src/
  FujiyamaAMM.sol       core asymmetric constant-product AMM
  MockERC20.sol         permissionless demo assets

test/
  FujiyamaAMM.t.sol     mechanism and invariant-style tests

script/
  Deploy.s.sol          dependency-free Foundry deployment script

frontend/
  app/                  Next.js dashboard + wallet execution
  .env.example          deployed address template

research/
  stress_sim.py         dependency-free guard stress replay

docs/
  submission-draft.md   ETHGlobal submission copy and checklist
```

## Core mechanism

During a closed issuance window, only the stock-token -> meme direction is guarded. The contract computes projected stock-token float utilization and uses the convex guard to split incoming stock-token inventory:

```text
stock input
    |
    +---- effective input ----------> active AMM reserve
    |
    +---- guarded fraction ---------> stabilization buffer
```

The reverse meme -> stock direction is intentionally unguarded because it releases stock-token inventory from the pool back to traders.

The stabilization buffer is separate from the constant-product reserve accounting. In this prototype it can be returned to active liquidity by the owner after the issuance window is marked open.

## Run locally

Requirements:

- Foundry
- Python 3
- Node.js / npm
- browser wallet for the live frontend

Run Solidity tests:

```bash
forge test -vv
```

Run the stress replay:

```bash
python3 research/stress_sim.py
```

Run the frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The frontend becomes fully interactive after deployed contract addresses are added to `frontend/.env.local`.

## Deploy

The deployment script reads the deployer key from the local `PRIVATE_KEY` environment variable. Never commit a private key or paste it into an issue, README, chat, or frontend environment file.

Example:

```bash
export PRIVATE_KEY='<local private key>'
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.testnet.chain.robinhood.com \
  --broadcast
```

After deployment, copy the three deployed addresses into:

```text
frontend/.env.local

NEXT_PUBLIC_AMM_ADDRESS=0x...
NEXT_PUBLIC_STOCK_ADDRESS=0x...
NEXT_PUBLIC_MEME_ADDRESS=0x...
```

Then restart the frontend.

## Live demo

https://frontend-nohcner.vercel.app/

## Live Robinhood Chain Testnet deployment

Chain ID: `46630`

```text
Mock Stock Token (mSTOCK): 0xfd2d5180b9a915991db847f9a0248055f56962be
Fuji Meme (FUJI):          0x3cfd5c402101aa4cf6e9cdbfdd4f9807f028b8ce
FUJIYAMA AMM:              0xedcc5d07cfe301f52b79e3e96229c87c73dac392
```

The first mock token is the stock token and the second is the meme token, matching the creation order in `script/Deploy.s.sol`.

## Demo flow

A clean demo path is:

1. connect a wallet on Robinhood Chain Testnet;
2. show stock-token float utilization and issuance-window state;
3. mint mock demo assets;
4. enter a large mSTOCK -> FUJI trade and compare standard-AMM output with the FUJIYAMA route;
5. execute the guarded swap and show the stabilization buffer increase;
6. execute FUJI -> mSTOCK to show restorative flow remains unguarded;
7. mark issuance open and return the buffer to active liquidity.

## Stress replay

`research/stress_sim.py` uses the same convex curve as the Solidity contract. The default normalized scenario starts with 10% active stock-token capture and applies enough float-draining flow for an unprotected AMM to end at 81% capture.

This is a **mechanism stress test**, not a historical price counterfactual. It is intended to show how much inventory the rule keeps out of active meme-pool accounting under the same gross flow.

## Hackathon status

Implemented in the public hackathon repository:

- core Solidity AMM;
- mock ERC-20 assets;
- directional guard and stabilization buffer;
- unit-test suite;
- Foundry deploy script;
- Python stress replay;
- Next.js + viem live dashboard and swap flow;
- ETHGlobal submission draft.

GitHub Actions currently passes the Solidity test suite, frontend production build, and Python stress replay. The contracts have also been broadcast to Robinhood Chain Testnet. Final browser-wallet demo verification and public frontend deployment still need to be completed before submission.

## AI usage

AI coding assistance is being used for implementation, testing, documentation, frontend development, and debugging. Final design choices, deployments, verification, demo operation, and submission are performed by the project author.

## License

MIT
