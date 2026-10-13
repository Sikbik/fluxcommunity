import { SITE } from '@shared/catalog';
import { type KeyboardEvent, useCallback, useId, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { useOverlays } from '@/lib/overlays';
import { Button, Dialog, Glyph, LinkButton, SegmentedControl, toast } from '@/ui';
import styles from './SubmitDialog.module.css';
import {
  composeMessage,
  EMPTY_FIELDS,
  FIELD_LIMITS,
  messageLines,
  normalizeUrl,
  type SubmitField,
  type SubmitFields,
  type SubmitKind,
  validateSubmit,
} from './submit';

const KINDS = [
  { value: 'app', label: 'An app', icon: 'cells' },
  { value: 'host', label: 'A node host', icon: 'nodes' },
] as const;

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error: string | undefined;
  maxLength: number;
  placeholder: string;
  inputMode?: 'text' | 'url';
  autoFocus?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  onBlur,
  error,
  maxLength,
  placeholder,
  inputMode = 'text',
  autoFocus,
  inputRef,
}: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className={styles.field} data-invalid={error ? 'true' : undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        className={styles.input}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        data-autofocus={autoFocus ? '' : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error ? (
        <p className={styles.error} id={errorId}>
          <Glyph name="status-warn" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The submit helper. It writes the message for the Flux team and offers to copy it; nothing is sent
 * from this page and nothing is stored.
 */
export function SubmitDialog() {
  const open = useOverlays((s) => s.submit);
  const close = useCallback(() => useOverlays.getState().closeSubmit(), []);
  const [fields, setFields] = useState<SubmitFields>(EMPTY_FIELDS);
  const [touched, setTouched] = useState<Partial<Record<SubmitField, boolean>>>({});
  const base = useId();
  const refs = useRef<Partial<Record<SubmitField, HTMLInputElement | null>>>({});

  const check = validateSubmit(fields);
  const lines = messageLines(fields);
  const host = fields.kind === 'host';

  const set = (key: SubmitField) => (value: string) => setFields((f) => ({ ...f, [key]: value }));
  const touch = (key: SubmitField) => () => {
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
    // A bare domain becomes a full address when the field is left.
    if (key === 'url') {
      const n = normalizeUrl(fields.url);
      if (n.url && n.url !== fields.url) setFields((f) => ({ ...f, url: n.url as string }));
    }
  };
  const err = (key: SubmitField) => (touched[key] ? check.errors[key] : undefined);

  const copy = async () => {
    if (!check.ok) {
      setTouched({ name: true, url: true, what: true, handle: true });
      const first = (['name', 'url', 'what', 'handle'] as const).find((k) => check.errors[k]);
      if (first) refs.current[first]?.focus();
      toast('Fill in the highlighted fields first', { kind: 'warn', id: 'builds-submit' });
      return;
    }
    const ok = await copyText(composeMessage(fields));
    if (ok) {
      toast.success(
        `Message copied. Paste it to ${SITE.submitVia.split(', to ')[1] ?? '@bigstache'} on Discord.`,
        {
          id: 'builds-submit',
          icon: 'copy',
        },
      );
    } else {
      toast.error('Could not copy. Select the message and copy it by hand.', { id: 'builds-submit' });
    }
  };

  // A form with several fields and no submit button of its own ignores Enter, so Enter in a field
  // copies the message, the same as the footer button.
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    void copy();
  };

  const idName = `${base}-name`;
  const idUrl = `${base}-url`;
  const idWhat = `${base}-what`;
  const idHandle = `${base}-handle`;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add your app or host"
      description="Nothing is sent from this page. Fill this in, copy the message, and paste it to the Flux team on Discord."
      size="md"
      footer={
        <>
          <LinkButton
            href={SITE.submitUrl}
            variant="secondary"
            iconEnd="arrow-up-right"
            onClick={() =>
              toast('Opening the Flux Discord. Paste your message there.', {
                id: 'builds-discord',
                icon: 'discord',
              })
            }
          >
            Open the Flux Discord
          </LinkButton>
          <Button variant="primary" icon="copy" onClick={() => void copy()}>
            Copy message
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onKeyDown={onKeyDown}
        onSubmit={(e) => e.preventDefault()}
        noValidate
        aria-label="Submission details"
      >
        <div className={styles.kind}>
          <SegmentedControl<SubmitKind>
            aria-label="What are you adding"
            size="sm"
            value={fields.kind}
            onValueChange={(kind) => setFields((f) => ({ ...f, kind }))}
            options={KINDS}
          />
        </div>

        <Field
          id={idName}
          label={host ? 'Name of the service' : 'Name of the app'}
          value={fields.name}
          onChange={set('name')}
          onBlur={touch('name')}
          error={err('name')}
          maxLength={FIELD_LIMITS.name}
          placeholder={host ? 'Orbit Nodes' : 'Flux Compass'}
          autoFocus
          inputRef={(el) => {
            refs.current.name = el;
          }}
        />
        <Field
          id={idUrl}
          label="Address"
          hint="An https:// address. A bare domain gets https:// added."
          value={fields.url}
          onChange={set('url')}
          onBlur={touch('url')}
          error={err('url')}
          maxLength={FIELD_LIMITS.url}
          placeholder="https://example.com"
          inputMode="url"
          inputRef={(el) => {
            refs.current.url = el;
          }}
        />
        <Field
          id={idWhat}
          label="What it does, in one line"
          value={fields.what}
          onChange={set('what')}
          onBlur={touch('what')}
          error={err('what')}
          maxLength={FIELD_LIMITS.what}
          placeholder={
            host ? 'Managed nodes, benchmarked and kept running.' : 'Finds the nearest healthy node.'
          }
          inputRef={(el) => {
            refs.current.what = el;
          }}
        />
        <Field
          id={idHandle}
          label={host ? 'Operator handle' : 'Builder handle'}
          hint={host ? 'The name the Flux team should credit.' : 'How the Flux team should credit you.'}
          value={fields.handle}
          onChange={set('handle')}
          onBlur={touch('handle')}
          error={err('handle')}
          maxLength={FIELD_LIMITS.handle}
          placeholder={host ? 'orbit' : 'CompassDev'}
          inputRef={(el) => {
            refs.current.handle = el;
          }}
        />

        <section className={styles.preview} aria-labelledby={`${base}-preview`}>
          <h3 className={styles.previewLabel} id={`${base}-preview`}>
            Your message
          </h3>
          <div className={styles.message}>
            {lines.map((line) => (
              <p key={line.label ?? 'greeting'} className={styles.line}>
                {line.label ? <span className={styles.key}>{`${line.label}: `}</span> : null}
                <span data-placeholder={line.placeholder ? 'true' : undefined}>{line.value}</span>
              </p>
            ))}
          </div>
        </section>
      </form>
    </Dialog>
  );
}
