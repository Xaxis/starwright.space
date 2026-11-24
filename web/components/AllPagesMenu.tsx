"use client";
/**
 * The menu of every page, as a popover: Escape or a tap outside closes it, and so does tabbing past
 * its last link, so it never sits over the control that has focus.
 */
export function AllPagesMenu({ pages }: { pages: { href: string; label: string }[] }) {
  return (
    <nav
      id="all-pages"
      popover="auto"
      aria-label="All pages"
      className="menu-panel"
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        const opener = document.querySelector('[popovertarget="all-pages"]');
        if (next && (e.currentTarget.contains(next) || opener?.contains(next))) return;
        if (e.currentTarget.matches(":popover-open")) e.currentTarget.hidePopover();
      }}
    >
      {pages.map((p) => (
        <a key={p.href} href={p.href}>
          {p.label}
        </a>
      ))}
    </nav>
  );
}
