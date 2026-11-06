export function SoundToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Sound"
      aria-pressed={enabled}
      title={enabled ? "Mute sound" : "Turn sound on"}
      onClick={onToggle}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-10 grid size-11 place-items-center rounded-full border border-foreground/20 bg-background/70 text-foreground backdrop-blur transition-colors hover:border-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <svg
        width={20}
        height={20}
        viewBox="0 0 20 20"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8h3l4-3.5v11L6 12H3z" />
        {enabled ? (
          <>
            <path d="M12.5 7.5a3.5 3.5 0 0 1 0 5" />
            <path d="M14.5 5.5a6.5 6.5 0 0 1 0 9" />
          </>
        ) : (
          <path d="M13 6l5 8" />
        )}
      </svg>
    </button>
  );
}
