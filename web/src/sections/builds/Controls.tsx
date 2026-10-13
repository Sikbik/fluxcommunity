import { CATEGORIES } from '@shared/catalog';
import type { Ref } from 'react';
import { Button, Chip, Panel, SearchField, SegmentedControl, Select, Tooltip, usePointerFine } from '@/ui';
import styles from './Controls.module.css';
import { type CategoryFilter, SORT_OPTIONS, type SortKey } from './model';
import { CATEGORY_GLYPH } from './presentation';
import type { ViewMode } from './state';

export interface ControlsProps {
  query: string;
  onQuery: (value: string) => void;
  category: CategoryFilter;
  onCategory: (value: CategoryFilter) => void;
  counts: Record<CategoryFilter, number>;
  sort: SortKey;
  onSort: (value: SortKey) => void;
  view: ViewMode;
  onView: (value: ViewMode) => void;
  onSurprise: () => void;
  searchRef: Ref<HTMLInputElement>;
  /** Id of the list being filtered. */
  listId: string;
}

const VIEWS = [
  { value: 'cells', label: 'Cells', icon: 'cells', ariaLabel: 'Cells: a list of builds' },
  {
    value: 'constellation',
    label: 'Constellation',
    icon: 'constellation',
    ariaLabel: 'Constellation: a visual map of builds',
  },
] as const;

/**
 * Search, category chips, sort and the view switch, as one instrument panel. The search is the
 * command line of the section: words, or operators such as `is:new`, `by:swiss`, `cat:nodes`.
 */
export function Controls({
  query,
  onQuery,
  category,
  onCategory,
  counts,
  sort,
  onSort,
  view,
  onView,
  onSurprise,
  searchRef,
  listId,
}: ControlsProps) {
  // The `/` hint is for a keyboard; a phone has none.
  const fine = usePointerFine();
  return (
    <Panel
      variant="slab"
      size="md"
      padding="sm"
      halo={false}
      hot="tl"
      pattern="tr"
      className={styles.panel}
      contentClassName={styles.content}
    >
      <div className={styles.top}>
        <div className={styles.search}>
          <SearchField
            aria-label="Search community builds by name, builder, host or category"
            placeholder="Search builds, builders, hosts"
            shortcut={fine ? '/' : undefined}
            prompt=">"
            value={query}
            onValueChange={onQuery}
            inputRef={searchRef}
            controls={listId}
          />
          <p className={styles.hint} id={`${listId}-hint`}>
            Try <code>noxide</code>, <code>by:2ndtl</code>, <code>is:new</code> or <code>is:down</code>
          </p>
        </div>

        <div className={styles.tools}>
          <Select<SortKey> label="Sort" value={sort} onValueChange={onSort} options={SORT_OPTIONS} />
          <SegmentedControl<ViewMode> aria-label="View" value={view} onValueChange={onView} options={VIEWS} />
          <Tooltip content="Surprise me">
            <Button
              variant="icon"
              icon="spark"
              label="Surprise me: jump to a random build"
              magnetic={false}
              onClick={onSurprise}
            />
          </Tooltip>
        </div>
      </div>

      <fieldset className={styles.chips}>
        <legend className="sr-only">Filter by category</legend>
        <Chip
          kind="filter"
          selected={category === 'all'}
          count={counts.all}
          onClick={() => onCategory('all')}
        >
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            kind="filter"
            icon={CATEGORY_GLYPH[c.id]}
            selected={category === c.id}
            count={counts[c.id]}
            disabled={counts[c.id] === 0 && category !== c.id}
            onClick={() => onCategory(category === c.id ? 'all' : c.id)}
          >
            {c.label}
          </Chip>
        ))}
      </fieldset>
    </Panel>
  );
}
