/**
 * BootGate — server-rendered boot layer, lives OUTSIDE the ssr:false wallet provider so it
 * reaches the browser as real HTML even when the client island cannot render.
 *
 * Three failure modes, all self-explanatory on-page:
 *  · MP-NOJS  — scripts never ran (JS disabled / blocked by extension or webview)
 *  · MP-HYD   — scripts ran but the app island did not mount within 10s (crash / dead chunks)
 *  · (hidden) — happy path: inline script hides the bar synchronously before first paint,
 *               and the Terminal island removes #mp-shell on mount.
 */
const BOOT_SCRIPT = `(function(){
  window.__MP_STATUS='scripts-ok';
  var b=document.getElementById('mp-boot');
  if(b)b.style.display='none';
  setTimeout(function(){
    if(window.__MP_STATUS!=='hydrated'){
      var e=document.getElementById('mp-boot');
      if(e){e.style.display='flex';
        var r=e.querySelector('[data-mp-reason]');
        if(r)r.textContent='Scripts loaded but the app island did not mount (code MP-HYD). Hard-reload (Ctrl+Shift+R); if it persists, send a DevTools Console screenshot.';}
    }
  },10000);
})();`;

const chip = (label: string) => (
  <span
    className="num hidden items-center gap-1 border px-2 py-0.5 text-[10px] sm:inline-flex"
    style={{ borderColor: "var(--line2)", color: "var(--dim)", background: "var(--panel)" }}
  >
    {label}
  </span>
);

export function BootGate() {
  return (
    <>
      {/* boot banner — visible in raw HTML, hidden synchronously by BOOT_SCRIPT */}
      <div
        id="mp-boot"
        role="alert"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          padding: "10px 14px",
          background: "#2a1608",
          borderBottom: "1px solid var(--honey, #f5a524)",
          color: "#ffe9c4",
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
        }}
      >
        <span aria-hidden>⚠</span>
        <span>
          MomoPulse needs JavaScript. If this bar stays visible: allow JavaScript for this site
          (address-bar lock/tune icon → Site settings → JavaScript → Allow), disable
          script-blocking extensions, then hard-reload (Ctrl+Shift+R).{" "}
          <span data-mp-reason style={{ color: "#ff9dab" }}>
            (code MP-NOJS — no scripts are running in this browser)
          </span>
        </span>
      </div>
      <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />

      {/* static SSR shell — what every visitor sees before/without the client island */}
      <div id="mp-shell" aria-busy="true" className="flex min-h-screen flex-col">
        <header
          className="flex items-center gap-2 px-3"
          style={{ height: 49, borderBottom: "1px solid var(--line2)", background: "var(--bg2, #171009)" }}
        >
          <span
            aria-hidden
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "radial-gradient(circle at 35% 30%, #ffd479, #f5a524 55%, #7a4a08)",
              display: "inline-block",
            }}
          />
          <b className="text-[13px] tracking-[0.18em]" style={{ color: "var(--text, #f4e9d8)" }}>
            MOMO<span style={{ color: "var(--honey, #f5a524)" }}>PULSE</span>
          </b>
          <span className="hidden text-[8.5px] uppercase tracking-[0.14em] xs:inline sm:inline" style={{ color: "var(--dim)" }}>
            launchpad terminal · cookie chain
          </span>
          <span className="ml-auto flex items-center gap-2">
            {chip("COOK ···")}
            {chip("RPC ···")}
            {chip("● COOKIE CHAIN")}
            <span className="skel hidden h-[26px] w-[92px] sm:inline-block" />
          </span>
        </header>

        {/* desktop grid skeleton */}
        <main
          className="mx-auto hidden w-full max-w-[1600px] flex-1 gap-2 p-2 lg:grid"
          style={{ gridTemplateColumns: "320px minmax(0,1fr) 360px", height: "calc(100vh - 49px)" }}
        >
          <section className="panel flex flex-col gap-2 p-2">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--dim)" }}>
              pool feed
            </span>
            <div className="skel h-[30px]" />
            <div className="skel h-[26px]" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skel" style={{ height: 86, animationDelay: `${i * 120}ms` }} />
            ))}
          </section>
          <section className="flex min-h-0 flex-col gap-2">
            <div className="skel h-[30px]" />
            <div className="skel h-[52px]" />
            <div className="skel min-h-[240px] flex-1" />
            <div className="skel h-[190px]" />
          </section>
          <section className="flex flex-col gap-2">
            <div className="skel h-[380px]" />
            <div className="skel h-[260px]" />
          </section>
        </main>

        {/* mobile skeleton + static tab bar */}
        <main className="flex-1 p-2 pb-16 lg:hidden">
          <div className="skel h-[30px]" />
          <div className="skel mt-2 h-[26px]" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel mt-2" style={{ height: 96 }} />
          ))}
        </main>
        <nav
          className="fixed bottom-0 left-0 right-0 grid grid-cols-4 border-t lg:hidden"
          style={{ borderColor: "var(--line2)", background: "rgba(13,10,7,0.96)" }}
          aria-label="terminal sections"
        >
          {["feed", "chart", "trade", "on-ramp"].map((t, i) => (
            <span
              key={t}
              className="flex flex-col items-center gap-1 py-2 text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{ color: i === 0 ? "var(--honey, #f5a524)" : "var(--dim)" }}
            >
              <span className="skel" style={{ width: 14, height: 14, borderRadius: 3 }} />
              {t}
            </span>
          ))}
        </nav>
      </div>
    </>
  );
}
