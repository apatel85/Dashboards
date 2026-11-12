import { hrefFor, type PageId } from '../lib/route';

export interface SubTab {
  id: string;
  label: string;
  /** Small count shown after the label (e.g. number of ideas). */
  count?: number | null;
}

/** Second-level navigation inside a page. Plain links, so the URL is shareable and Back works. */
export function SubTabs({ page, tabs, active }: { page: PageId; tabs: SubTab[]; active: string }) {
  return (
    <nav className="subtabs" aria-label="Views on this page">
      {tabs.map((t) => (
        <a
          key={t.id}
          href={hrefFor(page, t.id)}
          className={`subtab${active === t.id ? ' active' : ''}`}
          aria-current={active === t.id ? 'page' : undefined}
        >
          {t.label}
          {t.count != null ? <span className="subtab-count">{t.count}</span> : null}
        </a>
      ))}
    </nav>
  );
}

/** Resolve the active sub-view: the requested one if it exists, else the first. */
export function activeSub(tabs: SubTab[], sub: string): string {
  return tabs.some((t) => t.id === sub) ? sub : tabs[0].id;
}
