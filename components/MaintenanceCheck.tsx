"use client";
import { useEffect, useState } from "react";

export function MaintenanceCheck({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState(false);
  const [message, setMessage] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/status.json", { cache: "no-store" });
        const data = await res.json();
        setMaintenance(data.maintenance);
        setMessage(data.message);
      } catch (e) {
        console.error("Status check failed", e);
      } finally {
        setChecked(true);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!checked) return null;

  if (maintenance) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#111827",
          color: "white",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "60px",
            height: "60px",
            border: "4px solid rgba(234,179,8,0.2)",
            borderTopColor: "#eab308",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            marginBottom: "24px",
          }}
        />
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
          We&apos;ll be right back
        </h2>
        <p style={{ color: "#9ca3af", fontSize: "14px", maxWidth: "320px" }}>
          {message ||
            "The site is temporarily unavailable. Please check back shortly."}
        </p>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}