import { type Ref, useId } from 'react';
import { cn } from '@/lib/cn';
import { Glyph } from '../Glyph/Glyph';
import { Kbd } from '../Kbd/Kbd';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  /** REQUIRED: the field's accessible name (there is no visible label). */
  'aria-label': string;
  placeholder?: string;
  /** The mono prompt glyph. Default ">". */
  prompt?: string;
  /** A hotkey hint shown while empty, e.g. "/". */
  shortcut?: string;
  /** Called on Enter. */
  onSubmit?: (value: string) => void;
  /** Ref to the <input>, so a hotkey can focus it. */
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  className?: string;
  /** Id of the element this field filters (aria-controls). */
  controls?: string;
}

/**
 * A single-line search field in the instrument voice: mono prompt, hotkey hint, clear
 * button. Controlled. Wire the focus hotkey with `useHotkeys` and `inputRef`.
 *
 *   <SearchField aria-label="Search community builds" placeholder="Search builds" shortcut="/"
 *     value={q} onValueChange={setQ} inputRef={ref} />
 */
export function SearchField({
  value,
  onValueChange,
  placeholder,
  prompt = '>',
  shortcut,
  onSubmit,
  inputRef,
  autoFocus,
  className,
  controls,
  'aria-label': ariaLabel,
}: SearchFieldProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('chamfer', styles.field, className)}>
      <span className={styles.prompt} aria-hidden="true">
        {prompt}
      </span>
      <input
        id={id}
        ref={inputRef}
        className={styles.input}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={ariaLabel}
        aria-controls={controls}
        placeholder={placeholder}
        // biome-ignore lint/a11y/noAutofocus: opt-in by the caller
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit?.(value);
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onValueChange('');
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          aria-label="Clear search"
          onClick={() => onValueChange('')}
        >
          <Glyph name="close" size={14} />
        </button>
      ) : shortcut ? (
        <span className={styles.hint}>
          <Kbd size="sm">{shortcut}</Kbd>
        </span>
      ) : null}
    </label>
  );
}
