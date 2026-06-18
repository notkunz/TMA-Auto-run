"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SupportPage() {
  const supabase = createClient();
  const [form, setForm] = useState({
    subject: "",
    message: "",
    category: "general",
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) return;
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = (await supabase
      .from("users")
      .select("full_name, email, matric_number")
      .eq("auth_id", user!.id)
      .single()) as { data: any };

    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        user_name: profile?.full_name,
        user_email: profile?.email,
        user_matric: profile?.matric_number,
      }),
    });

    const data = await res.json();
    setLoading(false);
    if (data.error) return setError(data.error);
    setSent(true);
  };

  if (sent)
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Message Sent!</h2>
        <p className="text-gray-500 text-sm">
          We'll get back to you as soon as possible.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-6 bg-green-600 text-white px-6 py-2 rounded-xl text-sm font-semibold"
        >
          Send Another
        </button>
      </div>
    );

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-1">Support</h2>
      <p className="text-gray-500 text-sm mb-6">
        Having an issue? We're here to help.
      </p>

      {error && (
        <p className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-2xl font-bold text-gray-800 mb-1">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Category
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full border rounded-lg p-3 text-sm text-black"
            >
              <option value="payment">Payment Issue</option>
              <option value="wallet">Wallet Problem</option>
              <option value="tma">TMA Not Working</option>
              <option value="ai">Wrong Answers</option>
              <option value="account">Account Issue</option>
              <option value="general">General Enquiry</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Subject
            </label>
            <input
              placeholder="Brief description of your issue"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full border rounded-lg p-3 text-sm text-black"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Message
            </label>
            <textarea
              placeholder="Describe your issue in detail..."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={5}
              required
              className="w-full border rounded-lg p-3 text-sm resize-none text-black"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !form.message.trim()}
          className="w-full bg-green-600 text-white rounded-xl py-3 font-bold hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Message"}
        </button>
      </form>
    </div>
  );
}
