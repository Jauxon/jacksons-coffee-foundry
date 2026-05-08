"use client";

// Re-opens the welcome modal. The modal lives in WelcomeModal.tsx and listens
// for a custom window event so we don't need to share React state across the
// chrome and the modal.
export function AboutButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("coffee-cup:show-welcome"))}
      className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 text-[12px] font-medium"
      title="What is this?"
    >
      ?
    </button>
  );
}
