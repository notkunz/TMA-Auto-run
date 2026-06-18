"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface QuestionResult {
  courseCode: string;
  courseTitle: string;
  questionNumber: number;
  question: string;
  options: string[];
  answer: string;
  source: "course_material" | "question_bank" | "internet" | "not_found";
  internetAnswer?: string;
  internetLoading?: boolean;
}

function RunTMAContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [tokens, setTokens] = useState(0);
  const [matric, setMatric] = useState("");
  const [nounPassword, setNounPassword] = useState("");
  const [tmaRound, setTmaRound] = useState(searchParams.get("round") || "TMA1");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    "form" | "scraping" | "answering" | "done"
  >("form");
  const [, setUserId] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadTokens = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = (await supabase
      .from("users")
      .select("id")
      .eq("auth_id", user.id)
      .single()) as { data: { id: string } | null };
    setUserId(p?.id ?? null);
    const { data: tw } = (await supabase
      .from("token_wallets")
      .select("balance")
      .eq("user_id", p?.id)
      .single()) as { data: { balance: number } | null };
    setTokens(tw?.balance || 0);
  }, [supabase]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTokens();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadTokens]);

  const startPolling = useCallback(
    (runId: string) => {
      let pollCount = 0;

      pollRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount > 180) {
          // 12 minutes max
          if (pollRef.current) clearInterval(pollRef.current);
          setError("Taking too long. Please try again.");
          setRunning(false);
          setPhase("form");
          sessionStorage.removeItem("active_run_id");
          return;
        }

        try {
          const statusRes = await fetch(`/api/tma/run-status?run_id=${runId}`);
          const statusData = await statusRes.json();
          if (!statusData) return;

          if (statusData.status_log?.length > 0) {
            setStatusLog(statusData.status_log);
          }
          if (statusData.status === "running") setPhase("answering");

          if (statusData.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            sessionStorage.removeItem("active_run_id");
            setResults(statusData.results || []);
            setRunning(false);
            setPhase("done");
            loadTokens();
          }

          if (statusData.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            sessionStorage.removeItem("active_run_id");
            setError(statusData.error_message || "Something went wrong");
            setRunning(false);
            setPhase("form");
          }
        } catch (e) {
          console.error("Poll error:", e);
        }
      }, 5000);
    },
    [loadTokens],
  );

  const handleRun = async () => {
    if (!matric || !nounPassword)
      return setError("Enter your NOUN matric and password");
    if (tokens < 1) return setError("You need at least 1 token.");
    setRunning(true);
    setError("");
    setResults([]);
    setPhase("scraping");

    const res = await fetch("/api/tma/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matric,
        noun_password: nounPassword,
        tma_round: tmaRound,
      }),
    });

    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setRunning(false);
      setPhase("form");
      return;
    }

    setRunId(data.run_id);
    // Save to sessionStorage so refresh recovers
    sessionStorage.setItem("active_run_id", data.run_id);
    setPhase("scraping");
    startPolling(data.run_id);
  };

  // Check for interrupted run on page load
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const savedRunId = sessionStorage.getItem("active_run_id");
      if (savedRunId) {
        setRunId(savedRunId);
        setPhase("scraping");
        setRunning(true);
        startPolling(savedRunId);
      }
    }, 0);

    return () => {
      window.clearTimeout(timeout);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [startPolling]);

  const searchInternet = async (index: number) => {
    const q = results[index];

    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, internetLoading: true } : r)),
    );

    try {
      const res = await fetch("/api/tma/internet-vip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          options: q.options,
          course_code: q.courseCode,
          run_id: runId,
          question_number: q.questionNumber, // add this
        }),
      });

      const data = await res.json();

      setResults((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                internetAnswer: data.answer || "Could not find answer",
                internetLoading: false,
              }
            : r,
        ),
      );
    } catch {
      setResults((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                internetAnswer: "Error searching internet",
                internetLoading: false,
              }
            : r,
        ),
      );
    }
  };

  // Group results by course
  const grouped = results.reduce((acc: Record<string, QuestionResult[]>, r) => {
    if (!acc[r.courseCode]) acc[r.courseCode] = [];
    acc[r.courseCode].push(r);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-1">Begin TMA</h2>
      <p className="text-gray-400 text-sm mb-6">
        Begin your session and relax while Rose Gold answers your TMA questions.
        Make sure your TMA is open on the NOUN portal.
      </p>

      {/* Token warning */}
      {tokens === 0 && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-red-400 text-sm font-semibold">
            ❌ No tokens available
          </p>
          <p className="text-red-300 text-xs mt-1">
            <a href="/dashboard/tokens" className="underline">
              Buy tokens
            </a>{" "}
            to run your TMA
          </p>
        </div>
      )}

      {phase === "form" && (
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h3 className="font-bold text-white mb-4">
            Enter Your NOUN Credentials
          </h3>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
            <p className="text-yellow-300 text-xs">
              Your credentials are used only for this session and are never
              stored.
            </p>
          </div>

          {error && (
            <p className="bg-red-900/50 text-red-400 text-sm p-3 rounded-lg mb-4">
              {error}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRun();
            }}
            className="space-y-3 mb-4"
          >
            <input
              placeholder="NOUN Matric Number (e.g. NOU123456789)"
              value={matric}
              onChange={(e) => setMatric(e.target.value.toUpperCase())}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
            />
            <input
              type="password"
              placeholder="NOUN Portal Password"
              value={nounPassword}
              onChange={(e) => setNounPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              autoComplete="current-password"
            />
          </form>

          {/* TMA Round Selection */}
          <p className="text-gray-400 text-xs mb-2">Select TMA Round</p>
          <div className="flex gap-3 mb-6">
            {["TMA1", "TMA2", "TMA3"].map((round) => (
              <button
                key={round}
                onClick={() => setTmaRound(round)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${
                  tmaRound === round
                    ? "bg-yellow-500 text-gray-900"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}
              >
                {round}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-400 text-sm">
              Cost: <span className="text-yellow-400 font-bold">1 Token</span>
            </p>
            <p className="text-gray-400 text-sm">
              Balance:{" "}
              <span className="text-yellow-400 font-bold">🪙 {tokens}</span>
            </p>
          </div>

          <button
            onClick={handleRun}
            disabled={running || tokens < 1 || !matric || !nounPassword}
            className="w-full bg-yellow-500 text-gray-900 rounded-xl py-4 font-bold hover:bg-yellow-400 disabled:opacity-50 text-lg"
          >
            {running ? "Please wait..." : `Begin ${tmaRound}`}
          </button>
        </div>
      )}

      {/* Loading States */}
      {(phase === "scraping" || phase === "answering") && (
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "#eab308",
                animation: "pulse 1.5s infinite",
              }}
            />
            <p className="text-yellow-400 font-bold">
              {phase === "scraping"
                ? "Connecting to NOUN portal..."
                : "Questions are being answered..."}
            </p>
          </div>

          {/* Live log */}
          <div
            style={{
              background: "#0f172a",
              borderRadius: "10px",
              padding: "16px",
              minHeight: "120px",
              fontFamily: "monospace",
              fontSize: "13px",
            }}
          >
            {statusLog.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Initializing...</p>
            ) : (
              statusLog.map((log, i) => (
                <p
                  key={i}
                  style={{
                    color: log.startsWith("❌")
                      ? "#f87171"
                      : log.startsWith("...")
                        ? "#4ade80"
                        : log.startsWith("...")
                          ? "#facc15"
                          : "#94a3b8",
                    margin: "2px 0",
                  }}
                >
                  {log}
                </p>
              ))
            )}
            <span style={{ color: "#6b7280", animation: "pulse 1s infinite" }}>
              ▊
            </span>
          </div>

          <p className="text-gray-500 text-xs mt-3 text-center">
            Do not close this page
          </p>
        </div>
      )}

      {/* Results */}
      {phase === "done" && results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-green-400 font-semibold">
              ✅ {results.length} questions answered across{" "}
              {Object.keys(grouped).length} courses
            </p>
            <button
              onClick={() => {
                setPhase("form");
                setResults([]);
              }}
              className="text-xs text-gray-400 hover:text-white border border-gray-600 px-3 py-1.5 rounded-lg"
            >
              Run Another
            </button>
          </div>

          {Object.entries(grouped).map(([courseCode, questions]) => (
            <div
              key={courseCode}
              className="bg-gray-800 rounded-xl overflow-hidden mb-4"
            >
              {/* Course Header */}
              <div className="bg-gray-700 px-5 py-3 flex items-center gap-3">
                <span className="bg-yellow-500 text-gray-900 text-xs font-bold px-2 py-1 rounded-lg">
                  {courseCode}
                </span>
                <span className="text-white font-semibold text-sm">
                  {questions[0].courseTitle}
                </span>
                <span className="text-gray-400 text-xs ml-auto">
                  {questions.length} question{questions.length > 1 ? "s" : ""}
                </span>
              </div>

              {/* Questions */}
              <div className="divide-y divide-gray-700">
                {questions.map((q, qi) => {
                  const globalIndex = results.findIndex(
                    (r) =>
                      r.courseCode === q.courseCode &&
                      r.questionNumber === q.questionNumber,
                  );
                  return (
                    <div key={qi} className="p-5">
                      <p className="text-gray-300 text-sm mb-3">
                        <span className="text-yellow-400 font-bold mr-2">
                          Q{q.questionNumber}.
                        </span>
                        {q.question}
                      </p>

                      {q.source === "not_found" ? (
                        <div>
                          <div className="flex items-center gap-3">
                            <p className="text-red-400 text-xs italic">
                              Answer not found in course material
                            </p>
                            {!q.internetAnswer && (
                              <button
                                onClick={() => searchInternet(globalIndex)}
                                disabled={q.internetLoading}
                                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-full disabled:opacity-50 shrink-0"
                              >
                                {q.internetLoading
                                  ? "Searching..."
                                  : "Use Internet"}
                              </button>
                            )}
                          </div>
                          {q.internetAnswer && (
                            <div className="mt-2 bg-blue-900/30 border border-blue-500/30 rounded-lg p-3">
                              <p className="text-xs text-blue-400 font-semibold mb-1">
                                Internet Answer:
                              </p>
                              <p className="text-sm text-white font-bold">
                                {q.internetAnswer}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`rounded-lg p-3 ${
                            q.source === "question_bank"
                              ? "bg-purple-900/30 border border-purple-500/30"
                              : q.source === "internet"
                                ? "bg-blue-900/30 border border-blue-500/30"
                                : "bg-green-900/30 border border-green-500/30"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-gray-400">
                              Answer:
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                q.source === "question_bank"
                                  ? "bg-purple-800 text-purple-300"
                                  : q.source === "internet"
                                    ? "bg-blue-800 text-blue-300"
                                    : "bg-green-800 text-green-300"
                              }`}
                            >
                              {q.source === "question_bank" && "Answer Bank"}
                              {q.source === "course_material" && "Answer Bank"}
                              {q.source === "internet" && "🌐 Internet"}
                            </span>
                          </div>
                          <p className="text-white font-bold">{q.answer}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === "done" && results.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 text-center">
          <p className="text-white font-bold mb-2">No TMA questions found</p>
          <p className="text-gray-400 text-sm">
            No active {tmaRound} found on your NOUN portal. Make sure your TMA
            is open.
          </p>
          <button
            onClick={() => setPhase("form")}
            className="mt-4 bg-yellow-500 text-gray-900 px-6 py-2 rounded-xl font-bold text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

export default function RunTMAPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <RunTMAContent />
    </Suspense>
  );
}
