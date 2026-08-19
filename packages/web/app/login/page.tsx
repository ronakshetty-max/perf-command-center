"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="card max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Performance Marketing Tracker</h1>
        <p className="text-text-muted text-sm mb-8">Sign in with your Razorpay account to continue</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
        >
          Sign in with Google
        </button>
        <p className="text-text-dimmed text-xs mt-4">Only @razorpay.com accounts are allowed</p>
      </div>
    </div>
  );
}
