import dynamic from "next/dynamic";

/**
 * Route shell (server component). The interactive terminal is a client island loaded with
 * ssr:false (wallet-adapter touches window during render); the SSR shell + boot watchdog
 * live in <BootGate/> (layout, outside the wallet provider) so first paint is real HTML.
 */
const Terminal = dynamic(() => import("@/components/Terminal").then((m) => m.Terminal), {
  ssr: false,
});

export default function Page() {
  return <Terminal />;
}
