"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatEther,
  http,
  isAddress,
  parseEther,
} from "viem";

const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
});

const publicClient = createPublicClient({
  chain: robinhoodTestnet,
  transport: http(),
});

const AMM_ADDRESS =
  process.env.NEXT_PUBLIC_AMM_ADDRESS ||
  "0xedcc5d07cfe301f52b79e3e96229c87c73dac392";
const STOCK_ADDRESS =
  process.env.NEXT_PUBLIC_STOCK_ADDRESS ||
  "0xfd2d5180b9a915991db847f9a0248055f56962be";
const MEME_ADDRESS =
  process.env.NEXT_PUBLIC_MEME_ADDRESS ||
  "0x3cfd5c402101aa4cf6e9cdbfdd4f9807f028b8ce";

const ammAbi = [
  {
    type: "function",
    name: "stockReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "memeReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bufferStock",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mintClosed",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "utilizationBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "currentGuardBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteStockForMeme",
    stateMutability: "view",
    inputs: [{ name: "stockAmountIn", type: "uint256" }],
    outputs: [
      { name: "memeAmountOut", type: "uint256" },
      { name: "guardBpsApplied", type: "uint256" },
      { name: "bufferedAmount", type: "uint256" },
      { name: "effectivePoolInput", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteStandardStockForMeme",
    stateMutability: "view",
    inputs: [{ name: "stockAmountIn", type: "uint256" }],
    outputs: [{ name: "memeAmountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteMemeForStock",
    stateMutability: "view",
    inputs: [{ name: "memeAmountIn", type: "uint256" }],
    outputs: [{ name: "stockAmountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "swapStockForMeme",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stockAmountIn", type: "uint256" },
      { name: "minMemeOut", type: "uint256" },
    ],
    outputs: [{ name: "memeAmountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "swapMemeForStock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "memeAmountIn", type: "uint256" },
      { name: "minStockOut", type: "uint256" },
    ],
    outputs: [{ name: "stockAmountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "setMintClosed",
    stateMutability: "nonpayable",
    inputs: [{ name: "closed", type: "bool" }],
    outputs: [],
  },
  {
    type: "function",
    name: "releaseBufferToPool",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
];

const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];

function compact(address) {
  if (!address) return "Connect wallet";
  return address.slice(0, 6) + "…" + address.slice(-4);
}

function tokenNumber(value, maximumFractionDigits = 2) {
  if (value === undefined || value === null) return "—";
  const n = Number(formatEther(value));
  return n.toLocaleString(undefined, { maximumFractionDigits });
}

function percentBps(value) {
  if (value === undefined || value === null) return "—";
  return (Number(value) / 100).toFixed(2) + "%";
}

function slippageMin(value, bps = 100n) {
  return (value * (10_000n - bps)) / 10_000n;
}

export default function Page() {
  const configured = useMemo(
    () =>
      isAddress(AMM_ADDRESS) &&
      isAddress(STOCK_ADDRESS) &&
      isAddress(MEME_ADDRESS),
    []
  );

  const [account, setAccount] = useState("");
  const [direction, setDirection] = useState("stockToMeme");
  const [amount, setAmount] = useState("10000");
  const [state, setState] = useState({
    stockReserve: 0n,
    memeReserve: 0n,
    bufferStock: 0n,
    utilizationBps: 0n,
    currentGuardBps: 0n,
    mintClosed: false,
  });
  const [balances, setBalances] = useState({ stock: 0n, meme: 0n });
  const [quote, setQuote] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const getWalletClient = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask or another injected wallet is required.");
    }

    return createWalletClient({
      account: account || undefined,
      chain: robinhoodTestnet,
      transport: custom(window.ethereum),
    });
  }, [account]);

  const ensureNetwork = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask or another injected wallet is required.");
    }

    const chainIdHex = "0xb626";

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } catch (switchError) {
      if (switchError?.code !== 4902) throw switchError;

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: robinhoodTestnet.name,
            nativeCurrency: robinhoodTestnet.nativeCurrency,
            rpcUrls: robinhoodTestnet.rpcUrls.default.http,
            blockExplorerUrls: [
              robinhoodTestnet.blockExplorers.default.url,
            ],
          },
        ],
      });
    }
  }, []);

  const refreshState = useCallback(async () => {
    if (!configured) return;

    const [
      stockReserve,
      memeReserve,
      bufferStock,
      utilizationBps,
      currentGuardBps,
      mintClosed,
    ] = await Promise.all([
      publicClient.readContract({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName: "stockReserve",
      }),
      publicClient.readContract({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName: "memeReserve",
      }),
      publicClient.readContract({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName: "bufferStock",
      }),
      publicClient.readContract({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName: "utilizationBps",
      }),
      publicClient.readContract({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName: "currentGuardBps",
      }),
      publicClient.readContract({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName: "mintClosed",
      }),
    ]);

    setState({
      stockReserve,
      memeReserve,
      bufferStock,
      utilizationBps,
      currentGuardBps,
      mintClosed,
    });
  }, [configured]);

  const refreshBalances = useCallback(async () => {
    if (!configured || !account) return;

    const [stock, meme] = await Promise.all([
      publicClient.readContract({
        address: STOCK_ADDRESS,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [account],
      }),
      publicClient.readContract({
        address: MEME_ADDRESS,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [account],
      }),
    ]);

    setBalances({ stock, meme });
  }, [configured, account]);

  const refreshAll = useCallback(async () => {
    setError("");
    try {
      await Promise.all([refreshState(), refreshBalances()]);
    } catch (e) {
      setError(e?.shortMessage || e?.message || String(e));
    }
  }, [refreshBalances, refreshState]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const onAccountsChanged = (accounts) => setAccount(accounts?.[0] || "");
    window.ethereum.on?.("accountsChanged", onAccountsChanged);

    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadQuote() {
      setQuote(null);
      if (!configured) return;

      let parsed;
      try {
        parsed = parseEther(amount || "0");
      } catch {
        return;
      }
      if (parsed <= 0n) return;

      try {
        if (direction === "stockToMeme") {
          const [fujiyama, standard] = await Promise.all([
            publicClient.readContract({
              address: AMM_ADDRESS,
              abi: ammAbi,
              functionName: "quoteStockForMeme",
              args: [parsed],
            }),
            publicClient.readContract({
              address: AMM_ADDRESS,
              abi: ammAbi,
              functionName: "quoteStandardStockForMeme",
              args: [parsed],
            }),
          ]);

          if (!cancelled) {
            setQuote({
              out: fujiyama[0],
              guardBps: fujiyama[1],
              buffered: fujiyama[2],
              effective: fujiyama[3],
              standardOut: standard,
            });
          }
        } else {
          const out = await publicClient.readContract({
            address: AMM_ADDRESS,
            abi: ammAbi,
            functionName: "quoteMemeForStock",
            args: [parsed],
          });

          if (!cancelled) {
            setQuote({
              out,
              guardBps: 0n,
              buffered: 0n,
              effective: parsed,
              standardOut: out,
            });
          }
        }
      } catch {
        if (!cancelled) setQuote(null);
      }
    }

    loadQuote();
    return () => {
      cancelled = true;
    };
  }, [amount, configured, direction, state.stockReserve, state.memeReserve, state.bufferStock]);

  async function connect() {
    setError("");
    try {
      await ensureNetwork();
      const wallet = await getWalletClient();
      const addresses = await wallet.requestAddresses();
      setAccount(addresses[0] || "");
      setMessage("Wallet connected to Robinhood Chain Testnet.");
    } catch (e) {
      setError(e?.shortMessage || e?.message || String(e));
    }
  }

  async function submitWrite({ address, abi, functionName, args = [] }) {
    await ensureNetwork();
    const wallet = await getWalletClient();
    const [activeAccount] = await wallet.requestAddresses();
    if (!activeAccount) throw new Error("Connect a wallet first.");

    const hash = await wallet.writeContract({
      account: activeAccount,
      chain: robinhoodTestnet,
      address,
      abi,
      functionName,
      args,
    });

    setMessage("Transaction submitted: " + hash);
    await publicClient.waitForTransactionReceipt({ hash });
    return { hash, activeAccount };
  }

  async function approveIfNeeded(tokenAddress, amountIn) {
    const allowance = await publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "allowance",
      args: [account, AMM_ADDRESS],
    });

    if (allowance >= amountIn) return;

    setMessage("Approval required…");
    await submitWrite({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "approve",
      args: [AMM_ADDRESS, amountIn],
    });
  }

  async function swap() {
    if (!configured) return;
    if (!account) {
      await connect();
      return;
    }
    if (!quote) return;

    let amountIn;
    try {
      amountIn = parseEther(amount);
    } catch {
      setError("Enter a valid token amount.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const tokenAddress =
        direction === "stockToMeme" ? STOCK_ADDRESS : MEME_ADDRESS;
      await approveIfNeeded(tokenAddress, amountIn);

      const functionName =
        direction === "stockToMeme"
          ? "swapStockForMeme"
          : "swapMemeForStock";

      await submitWrite({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName,
        args: [amountIn, slippageMin(quote.out)],
      });

      setMessage("Swap confirmed.");
      await refreshAll();
    } catch (e) {
      setError(e?.shortMessage || e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function mintDemoTokens() {
    if (!account) {
      await connect();
      return;
    }

    setBusy(true);
    setError("");
    try {
      setMessage("Minting demo stock token…");
      await submitWrite({
        address: STOCK_ADDRESS,
        abi: tokenAbi,
        functionName: "mint",
        args: [account, parseEther("100000")],
      });

      setMessage("Minting demo meme token…");
      await submitWrite({
        address: MEME_ADDRESS,
        abi: tokenAbi,
        functionName: "mint",
        args: [account, parseEther("1000000")],
      });

      setMessage("Demo tokens minted.");
      await refreshBalances();
    } catch (e) {
      setError(e?.shortMessage || e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMintWindow() {
    setBusy(true);
    setError("");
    try {
      await submitWrite({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName: "setMintClosed",
        args: [!state.mintClosed],
      });
      setMessage(
        state.mintClosed
          ? "Issuance window marked OPEN."
          : "Issuance window marked CLOSED."
      );
      await refreshState();
    } catch (e) {
      setError(
        (e?.shortMessage || e?.message || String(e)) +
          " (This control is owner-only.)"
      );
    } finally {
      setBusy(false);
    }
  }

  async function releaseBuffer() {
    if (state.bufferStock === 0n) return;

    setBusy(true);
    setError("");
    try {
      await submitWrite({
        address: AMM_ADDRESS,
        abi: ammAbi,
        functionName: "releaseBufferToPool",
        args: [state.bufferStock],
      });
      setMessage("Stabilization buffer returned to active liquidity.");
      await refreshState();
    } catch (e) {
      setError(
        (e?.shortMessage || e?.message || String(e)) +
          " (Buffer can only be released by the owner while issuance is open.)"
      );
    } finally {
      setBusy(false);
    }
  }

  const inToken = direction === "stockToMeme" ? "mSTOCK" : "FUJI";
  const outToken = direction === "stockToMeme" ? "FUJI" : "mSTOCK";
  const inBalance =
    direction === "stockToMeme" ? balances.stock : balances.meme;
  const guardWidth = Math.min(100, Number(quote?.guardBps || 0n) / 100);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark">▲</div>
          <div>
            <h1>FUJIYAMA</h1>
            <p>Float-aware asymmetric market maker</p>
          </div>
        </div>

        <div className="actions">
          <button className="button" onClick={refreshAll} disabled={!configured}>
            Refresh
          </button>
          <button className="button primary" onClick={connect}>
            {compact(account)}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">ETHGlobal Tokyo 2026 · Live mechanism demo</div>
        <h2>Liquidity gets steeper as scarce stock-token float reaches the summit.</h2>
        <p>
          FUJIYAMA keeps restorative flow open while progressively routing
          float-draining stock-token inventory into a stabilization buffer
          whenever primary-market issuance is unavailable.
        </p>
      </section>

      {!configured && (
        <div className="notice" style={{ marginBottom: 18 }}>
          Contract addresses are not configured yet. Deploy the contracts,
          then set NEXT_PUBLIC_AMM_ADDRESS, NEXT_PUBLIC_STOCK_ADDRESS and
          NEXT_PUBLIC_MEME_ADDRESS in frontend/.env.local.
        </div>
      )}

      <section className="grid">
        <div className="card">
          <div className="section-title">
            <h3>Market state</h3>
            <span className="mini">Robinhood Chain Testnet · 46630</span>
          </div>

          <div className="metrics">
            <div className="metric">
              <div className="metric-label">Stock float captured</div>
              <div className="metric-value">
                {percentBps(state.utilizationBps)}
              </div>
              <div className="metric-sub">active meme-pool inventory / supply</div>
            </div>

            <div className="metric">
              <div className="metric-label">Current guard</div>
              <div className="metric-value">
                {percentBps(state.currentGuardBps)}
              </div>
              <div className="metric-sub">before the next float-draining trade</div>
            </div>

            <div className="metric">
              <div className="metric-label">Stabilization buffer</div>
              <div className="metric-value">
                {tokenNumber(state.bufferStock)}
              </div>
              <div className="metric-sub">mSTOCK kept outside active meme liquidity</div>
            </div>

            <div className="metric">
              <div className="metric-label">Active stock reserve</div>
              <div className="metric-value">
                {tokenNumber(state.stockReserve)}
              </div>
              <div className="metric-sub">
                {tokenNumber(state.memeReserve)} FUJI opposite reserve
              </div>
            </div>
          </div>

          <div className="status-row">
            <span className="pill">
              <span className={"dot " + (state.mintClosed ? "warn" : "on")} />
              Primary issuance {state.mintClosed ? "closed" : "open"}
            </span>
            <span className="pill">
              <span className="dot on" />
              24/7 secondary trading
            </span>
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <h3>Swap simulator + execution</h3>
            <span className="mini">1% max slippage</span>
          </div>

          <div className="controls" style={{ marginBottom: 12 }}>
            <button
              className={"button " + (direction === "stockToMeme" ? "primary" : "")}
              onClick={() => setDirection("stockToMeme")}
            >
              mSTOCK → FUJI
            </button>
            <button
              className={"button " + (direction === "memeToStock" ? "primary" : "")}
              onClick={() => setDirection("memeToStock")}
            >
              FUJI → mSTOCK
            </button>
          </div>

          <div className="swap-box">
            <div className="input-wrap">
              <div className="input-row">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                />
                <span className="token">{inToken}</span>
              </div>
              <div className="input-caption">
                <span>Input amount</span>
                <span>Wallet: {tokenNumber(inBalance)}</span>
              </div>
            </div>

            <div className="route">
              <div className="route-row">
                <span>FUJIYAMA output</span>
                <strong>
                  {quote ? tokenNumber(quote.out, 4) : "—"} {outToken}
                </strong>
              </div>
              {direction === "stockToMeme" && (
                <>
                  <div className="route-row">
                    <span>Projected directional guard</span>
                    <strong>{quote ? percentBps(quote.guardBps) : "—"}</strong>
                  </div>
                  <div className="route-row">
                    <span>Routed to stabilization buffer</span>
                    <strong>
                      {quote ? tokenNumber(quote.buffered, 4) : "—"} mSTOCK
                    </strong>
                  </div>
                  <div className="route-row">
                    <span>Standard-AMM output (counterfactual)</span>
                    <strong>
                      {quote ? tokenNumber(quote.standardOut, 4) : "—"} FUJI
                    </strong>
                  </div>
                  <div>
                    <div className="guard-track">
                      <div
                        className="guard-fill"
                        style={{ width: guardWidth + "%" }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              className="button primary"
              onClick={swap}
              disabled={!configured || !quote || busy}
            >
              {busy ? "Working…" : account ? "Execute swap" : "Connect wallet"}
            </button>

            <div className="controls">
              <button
                className="button"
                onClick={mintDemoTokens}
                disabled={!configured || busy}
              >
                Mint demo tokens
              </button>
              <button
                className="button"
                onClick={toggleMintWindow}
                disabled={!configured || busy}
              >
                Mark issuance {state.mintClosed ? "open" : "closed"}
              </button>
              <button
                className="button"
                onClick={releaseBuffer}
                disabled={
                  !configured ||
                  busy ||
                  state.mintClosed ||
                  state.bufferStock === 0n
                }
              >
                Release buffer
              </button>
            </div>

            {message && <div className="message">{message}</div>}
            {error && <div className="message" style={{ color: "#ff9d9d" }}>{error}</div>}
          </div>
        </div>

        <div className="card">
          <h3>Mechanism</h3>
          <div className="route">
            <div className="route-row">
              <span>1 · Observe</span>
              <strong>stock float utilization</strong>
            </div>
            <div className="route-row">
              <span>2 · Detect</span>
              <strong>issuance unavailable</strong>
            </div>
            <div className="route-row">
              <span>3 · Protect</span>
              <strong>convex directional guard</strong>
            </div>
            <div className="route-row">
              <span>4 · Restore</span>
              <strong>buffer → active liquidity</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Why asymmetric?</h3>
          <div className="notice">
            Stock → meme flow can sequester scarce stock-token float, so
            FUJIYAMA can buffer part of that inventory during a closed
            issuance window. Meme → stock flow does the opposite: it releases
            stock inventory to traders, so it stays unguarded.
          </div>
          <p className="address" style={{ marginTop: 14 }}>
            AMM: {AMM_ADDRESS || "not deployed"}
            <br />
            Stock: {STOCK_ADDRESS || "not deployed"}
            <br />
            Meme: {MEME_ADDRESS || "not deployed"}
          </p>
        </div>
      </section>

      <footer className="footer">
        Hackathon prototype · Mock assets · Not production financial infrastructure
      </footer>
    </main>
  );
}
