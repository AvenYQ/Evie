import kikiMarkUrl from "./kiki-mark.svg";

export function KiKiWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <img src={kikiMarkUrl} alt="" className="size-5 shrink-0" />
      {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
      <span className="[text-box:trim-both_cap_alphabetic]">{"KiKi"}</span>
    </span>
  );
}
