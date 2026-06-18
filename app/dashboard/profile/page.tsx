"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [stats, setStats] = useState({
    tokenBalance: 0,
    totalRuns: 0,
    walletBalance: 0,
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: p } = (await supabase
      .from("users")
      .select("*")
      .eq("auth_id", user.id)
      .single()) as { data: any };
    setProfile(p);
    setFullName(p?.full_name || "");

    const { data: tw } = (await supabase
      .from("token_wallets")
      .select("balance")
      .eq("user_id", p?.id)
      .single()) as { data: any };
    const { data: w } = (await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", p?.id)
      .single()) as { data: any };
    const { count } = await supabase
      .from("vip_runs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", p?.id);

    setStats({
      tokenBalance: tw?.balance || 0,
      walletBalance: w?.balance || 0,
      totalRuns: count || 0,
    });
  };

  const handleSaveName = async () => {
    if (!fullName.trim()) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("users")
      .update({ full_name: fullName.trim() })
      .eq("id", profile.id);

    setSaving(false);
    if (error) {
      setMessage("Failed to update name");
      setMessageType("error");
    } else {
      setMessage("Name updated successfully");
      setMessageType("success");
      loadProfile();
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setMessage("Password must be at least 8 characters");
      setMessageType("error");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match");
      setMessageType("error");
      return;
    }

    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);

    if (error) {
      setMessage("Failed to update password: " + error.message);
      setMessageType("error");
    } else {
      setMessage("Password updated successfully");
      setMessageType("success");
      setShowPasswordForm(false);
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!profile) return <div className="text-gray-400 p-8">Loading...</div>;

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-yellow-400 mb-6">Profile</h2>

      {message && (
        <div
          className={`p-3 rounded-xl mb-4 text-sm ${
            messageType === "success"
              ? "bg-green-900/50 text-green-400 border border-green-500/30"
              : "bg-red-900/50 text-red-400 border border-red-500/30"
          }`}
        >
          {message}
        </div>
      )}

      {/* Account Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-gray-400 text-xs mb-1">Tokens</p>
          <p className="text-xl font-bold text-yellow-400">
            {stats.tokenBalance}
          </p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-gray-400 text-xs mb-1">Wallet</p>
          <p className="text-xl font-bold text-white">
            ₦{stats.walletBalance.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-gray-400 text-xs mb-1">TMA Runs</p>
          <p className="text-xl font-bold text-white">{stats.totalRuns}</p>
        </div>
      </div>

      {/* Basic Info */}
      <div className="bg-gray-800 rounded-xl p-5 mb-4">
        <h3 className="font-bold text-white mb-4">Account Details</h3>

        <div className="mb-4">
          <label className="text-xs text-gray-400 mb-1 block">Full Name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white"
          />
        </div>

        <div className="mb-4">
          <label className="text-xs text-gray-400 mb-1 block">
            Email Address
          </label>
          <input
            value={profile.email}
            disabled
            className="w-full bg-gray-700/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">
            Contact support to change your email
          </p>
        </div>

        <div className="mb-4">
          <label className="text-xs text-gray-400 mb-1 block">
            Matric Number
          </label>
          <input
            value={profile.matric_number || ""}
            disabled
            className="w-full bg-gray-700/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-500 cursor-not-allowed"
          />
        </div>

        <button
          onClick={handleSaveName}
          disabled={saving || fullName === profile.full_name}
          className="w-full bg-yellow-500 text-gray-900 rounded-lg py-2.5 font-bold text-sm hover:bg-yellow-400 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Password */}
      <div className="bg-gray-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-white">Password</h3>
          <button
            onClick={() => setShowPasswordForm(!showPasswordForm)}
            className="text-xs text-yellow-400 hover:underline"
          >
            {showPasswordForm ? "Cancel" : "Change Password"}
          </button>
        </div>

        {showPasswordForm && (
          <div className="space-y-3">
            <input
              type="password"
              placeholder="New password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-white"
            />
            <button
              onClick={handleChangePassword}
              disabled={passwordSaving}
              className="w-full bg-yellow-500 text-gray-900 rounded-lg py-2.5 font-bold text-sm hover:bg-yellow-400 disabled:opacity-50"
            >
              {passwordSaving ? "Updating..." : "Update Password"}
            </button>
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full bg-red-900/30 border border-red-500/30 text-red-400 rounded-xl py-3 font-semibold text-sm hover:bg-red-900/50"
      >
        Logout
      </button>
    </div>
  );
}
