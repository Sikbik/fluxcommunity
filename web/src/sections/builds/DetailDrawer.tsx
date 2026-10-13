import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { closeApp, navigate, useHashRoute } from '@/lib/route';
import { Button, Drawer, Tooltip, toast } from '@/ui';
import { copyAppLink, Detail, DetailFooter } from './Detail';
import { createExitGate, restoreOpener } from './opener';
import { displayId, resolveAppId } from './route';
import { useBuilds } from './state';
import { useEntries } from './useEntries';

/**
 * How the open detail came to be, which decides what closing it means: an entry this page pushed
 * (a cell was clicked) is undone with Back; a typed or deep-linked address is rewritten to `#builds`
 * so closing never leaves the site.
 */
let openedBy: 'pushed' | 'direct' = 'direct';

function closeDetail(): void {
  if (openedBy === 'pushed') closeApp();
  else navigate({ section: 'builds' }, { replace: true, scroll: false });
}

/** Shows another app in the same drawer without stacking a history entry per hop. */
function goToApp(id: string): void {
  navigate({ section: 'builds', appId: id }, { replace: true, scroll: false });
}

/**
 * The right-hand (bottom sheet on a phone) detail of one app, driven by the hash route
 * `#builds/<id>`. It shares the app health with the section and returns focus to the cell it came from.
 */
export function DetailDrawer() {
  const { appId } = useHashRoute();
  const entries = useEntries();
  const route = useMemo(() => resolveAppId(appId), [appId]);
  const openId = route.kind === 'app' ? route.app.id : null;
  const [shownId, setShownId] = useState<string | null>(openId);
  const wasOpen = useRef(false);
  // The drawer also reports "exited" once at mount, before it was ever open; that must not move focus.
  const [exitGate] = useState(createExitGate);
  const afterClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (openId) {
      setShownId(openId);
      exitGate.opened();
    }
  }, [openId, exitGate]);

  // Remember how this detail was opened (see `openedBy`).
  useEffect(() => {
    const open = openId !== null;
    if (open && !wasOpen.current) {
      openedBy = (history.state as { fcApp?: boolean } | null)?.fcApp ? 'pushed' : 'direct';
    }
    wasOpen.current = open;
  }, [openId]);

  // An address for an app the catalog does not have: say so once and settle on the section.
  useEffect(() => {
    if (route.kind !== 'unknown') return;
    toast(`There is no build called "${displayId(route.id)}".`, { id: 'builds-unknown', kind: 'warn' });
    navigate({ section: 'builds' }, { replace: true, scroll: false });
  }, [route]);

  const entry = entries.find((e) => e.app.id === (openId ?? shownId)) ?? null;

  const onPivot = useCallback((handle: string) => {
    useBuilds.setState({ builder: handle, query: '', category: 'all' });
    afterClose.current = () => {
      document
        .querySelector<HTMLElement>('[data-builder-card]')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    closeDetail();
  }, []);

  const onExited = useCallback(() => {
    if (!exitGate.take()) return;
    setShownId(null);
    const after = afterClose.current;
    afterClose.current = null;
    if (after) after();
    restoreOpener();
  }, [exitGate]);

  return (
    <Drawer
      open={openId !== null}
      onClose={closeDetail}
      onExited={onExited}
      title={entry?.app.name ?? ''}
      description={entry?.app.tagline}
      width="md"
      actions={
        entry ? (
          <Tooltip content="Copy link">
            <Button
              variant="icon"
              size="sm"
              icon="link"
              label="Copy link to this build"
              magnetic={false}
              onClick={() => void copyAppLink(entry.app.id)}
            />
          </Tooltip>
        ) : null
      }
      footer={entry ? <DetailFooter entry={entry} entries={entries} onNavigate={goToApp} /> : null}
    >
      {entry ? <Detail entry={entry} entries={entries} onNavigate={goToApp} onPivot={onPivot} /> : null}
    </Drawer>
  );
}
