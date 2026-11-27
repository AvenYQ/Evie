import evieMarkUrl from "./evie-sidebar-mark.svg";

export function EvieWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <img src={evieMarkUrl} alt="" className="size-5 shrink-0" />
      {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
      <span className="[text-box:trim-both_cap_alphabetic]">{"Evie"}</span>
    </span>
  );
}
