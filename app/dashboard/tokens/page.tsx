"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

const TOKEN_PRICE = 5000;

type TokenTransaction = {
  id: string;
  description: string;
  created_at: string;
  type: string;
  amount: number;
};

type BalancePayload = {
  balance?: number;
};

function TokensContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [walletBalance, setWalletBalance] = useState(0);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [topUpAmount, setTopUpAmount] = useState(1000);
  const [convertAmount, setConvertAmount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );
  const [profileId, setProfileId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: p } = (await supabase
      .from("users")
      .select("id")
      .eq("auth_id", user.id)
      .single()) as { data: { id: string } | null };
    setProfileId(p?.id);

    const { data: w } = (await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", p?.id)
      .single()) as { data: { balance: number } | null };
    setWalletBalance(w?.balance || 0);

    const { data: tw } = (await supabase
      .from("token_wallets")
      .select("balance")
      .eq("user_id", p?.id)
      .single()) as { data: { balance: number } | null };
    setTokenBalance(tw?.balance || 0);

    const { data: t } = await supabase
      .from("token_transactions")
      .select("*")
      .eq("user_id", p?.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setTransactions((t || []) as TokenTransaction[]);
  }, [supabase]);

  const handleVerify = useCallback(
    async (reference: string) => {
      const res = await fetch("/api/tokens/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`₦${data.amount} added to your wallet!`);
        setMessageType("success");
        loadData();
      }
    },
    [loadData],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadData();
      const verify = searchParams.get("verify");
      const reference = searchParams.get("reference");
      if (verify && reference) void handleVerify(reference);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [handleVerify, loadData, searchParams]);

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel("token-wallet-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "token_wallets",
          filter: `user_id=eq.${profileId}`,
        },
        (payload) => {
          const balance = (payload.new as BalancePayload).balance;
          if (typeof balance === "number") setTokenBalance(balance);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${profileId}`,
        },
        (payload) => {
          const balance = (payload.new as BalancePayload).balance;
          if (typeof balance === "number") setWalletBalance(balance);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, supabase]);

  const handleTopUp = async () => {
    if (topUpAmount < 100) return;
    setLoading(true);
    const res = await fetch("/api/wallet/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: topUpAmount, provider: "paystack" }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.url) window.location.href = data.url;
    else {
      setMessage("Error: " + data.error);
      setMessageType("error");
    }
  };

  const handleConvert = async () => {
    const cost = convertAmount * TOKEN_PRICE;
    if (walletBalance < cost) {
      setMessage(
        `Insufficient wallet balance. You need ₦${cost.toLocaleString()} but have ₦${walletBalance.toLocaleString()}`,
      );
      setMessageType("error");
      return;
    }
    setConverting(true);
    const res = await fetch("/api/tokens/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token_amount: convertAmount }),
    });
    const data = await res.json();
    setConverting(false);
    if (data.success) {
      setMessage(
        `Converted ${convertAmount} token${convertAmount > 1 ? "s" : ""}! Cost: ₦${cost.toLocaleString()}`,
      );
      setMessageType("success");
      loadData();
    } else {
      setMessage("Error: " + data.error);
      setMessageType("error");
    }
  };

  const nairaNeeded = convertAmount * TOKEN_PRICE;

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-6">
        🪙 Wallet & Tokens
      </h2>

      {message && (
        <div
          className={`p-4 rounded-xl mb-4 text-sm ${
            messageType === "success"
              ? "bg-green-900/50 text-green-400 border border-green-500/30"
              : "bg-red-900/50 text-red-400 border border-red-500/30"
          }`}
        >
          {message}
        </div>
      )}

      {/* Balances */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <p className="text-gray-400 text-xs mb-1">Naira Wallet</p>
          <p className="text-2xl font-bold text-white">
            ₦{walletBalance.toLocaleString()}
          </p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5">
          <p className="text-gray-400 text-xs mb-1">Token Balance</p>
          <p className="text-2xl font-bold text-yellow-400">
            🪙 {tokenBalance}
          </p>
        </div>
      </div>

      {/* Top Up Wallet */}
      <div className="bg-gray-800 rounded-xl p-5 mb-4">
        <h3 className="font-bold text-white mb-4">Top Up Naira Wallet</h3>
        <input
          type="number"
          value={topUpAmount}
          onChange={(e) => setTopUpAmount(Number(e.target.value))}
          placeholder="Enter amount in Naira"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white mb-3 focus:outline-none focus:border-yellow-500"
        />
        <div className="flex gap-2 mb-3 flex-wrap">
          {[500, 1000, 1500, 3000, 5000].map((a) => (
            <button
              key={a}
              onClick={() => setTopUpAmount(a)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                topUpAmount === a
                  ? "bg-yellow-500 text-gray-900 border-yellow-500"
                  : "bg-transparent text-gray-400 border-gray-600 hover:border-yellow-500"
              }`}
            >
              ₦{a.toLocaleString()}
            </button>
          ))}
        </div>
        <button
          onClick={handleTopUp}
          disabled={loading || topUpAmount < 100}
          className="w-full bg-yellow-500 text-gray-900 rounded-xl py-3 font-bold hover:bg-yellow-400 disabled:opacity-50"
        >
          {loading
            ? "Redirecting..."
            : `Pay ₦${topUpAmount.toLocaleString()} via Paystack`}
        </button>
      </div>

      {/* Convert to Tokens */}
      <div className="bg-gray-800 rounded-xl p-5 mb-6">
        <h3 className="font-bold text-white mb-1">Convert to Tokens</h3>
        <p className="text-gray-400 text-xs mb-4">
          ₦5,000 = 1 Token • 1 Token = 1 TMA round
        </p>

        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setConvertAmount(Math.max(1, convertAmount - 1))}
            className="bg-gray-700 text-white w-10 h-10 rounded-xl font-bold text-lg hover:bg-gray-600"
          >
            −
          </button>
          <div className="flex-1 text-center">
            <p className="text-3xl font-bold text-yellow-400">
              {convertAmount}
            </p>
            <p className="text-gray-400 text-xs">
              token{convertAmount > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setConvertAmount(convertAmount + 1)}
            className="bg-gray-700 text-white w-10 h-10 rounded-xl font-bold text-lg hover:bg-gray-600"
          >
            +
          </button>
        </div>

        <div className="bg-gray-700/50 rounded-lg p-3 mb-3 text-center">
          <p className="text-gray-400 text-xs">Cost</p>
          <p className="text-xl font-bold text-white">
            ₦{nairaNeeded.toLocaleString()}
          </p>
          <p
            className={`text-xs mt-1 ${walletBalance >= nairaNeeded ? "text-green-400" : "text-red-400"}`}
          >
            {walletBalance >= nairaNeeded
              ? `You have ₦${walletBalance.toLocaleString()} — sufficient`
              : `Need ₦${(nairaNeeded - walletBalance).toLocaleString()} more`}
          </p>
        </div>

        <button
          onClick={handleConvert}
          disabled={converting || walletBalance < nairaNeeded}
          className="w-full bg-yellow-500 text-gray-900 rounded-xl py-3 font-bold hover:bg-yellow-400 disabled:opacity-50"
        >
          {converting
            ? "Converting..."
            : `Convert to ${convertAmount} Token${convertAmount > 1 ? "s" : ""}`}
        </button>
      </div>

      {/* Transaction History */}
      <div className="bg-gray-800 rounded-xl p-5">
        <h3 className="font-bold text-white mb-4">Transaction History</h3>
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-sm">No transactions yet.</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {t.description}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`font-bold text-sm ${t.type === "credit" ? "text-green-400" : "text-red-400"}`}
                >
                  {t.type === "credit" ? "+" : "-"}
                  {t.amount} 🪙
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TokensPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <TokensContent />
    </Suspense>
  );
}
