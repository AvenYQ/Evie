import yayaMarkUrl from "./yaya-sidebar-mark.svg";

export function YaYaWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <img src={yayaMarkUrl} alt="" className="size-5 shrink-0" />
      {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
      <span className="[text-box:trim-both_cap_alphabetic]">{"YaYa"}</span>
    </span>
  );
}
