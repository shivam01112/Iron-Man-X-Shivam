export function Footer() {
  return (
    <footer
      id="footer"
      className="border-t border-white/5 bg-background px-6 py-14 md:px-10 md:py-16"
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.32em] text-foreground">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(212,162,47,0.9)]"
              />
              Iron Man / Shivam
            </div>
            <p className="max-w-[38ch] font-sans text-sm leading-relaxed text-zinc-400">
              A cinematic tribute to innovation, courage, and imagination.
              Designed and created by Shivam.
            </p>
          </div>

          <p className="font-sans text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Iron Man <span className="text-accent">× Shivam</span>
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/5 pt-6 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 md:flex-row md:items-center md:justify-between">
          <span>Iron Man &nbsp;&middot;&nbsp; System Online</span>
          <span>Created by Shivam</span>
        </div>
      </div>
    </footer>
  );
}
