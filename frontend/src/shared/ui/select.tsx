import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { KEYBOARD_KEYS } from '../constants/keyboard.constants';
import { UI_MESSAGES } from '../constants/ui.constants';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  depth?: number;
};

function firstEnabledOptionIndex(options: SelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}

function nextEnabledOptionIndex(options: SelectOption[], startIndex: number, direction: 1 | -1) {
  if (!options.length) return -1;
  for (let step = 1; step <= options.length; step += 1) {
    const nextIndex = (startIndex + (step * direction) + options.length) % options.length;
    if (!options[nextIndex]?.disabled) return nextIndex;
  }
  return -1;
}

export function Select({
  options,
  value,
  onChange,
  className = '',
  id,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
  required,
  disabled,
  dataField,
  onBlur,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
  required?: boolean;
  disabled?: boolean;
  dataField?: string;
  onBlur?: () => void;
}) {
  const reactId = useId();
  const resolvedId = id || `${UI_MESSAGES.SELECT_PREFIX}-${reactId}`;
  const listboxId = `${resolvedId}${UI_MESSAGES.LISTBOX_SUFFIX}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const widestOption = useMemo(
    () => options.reduce<SelectOption | null>((widest, option) => {
      if (!widest) return option;
      const widestScore = widest.label.length + (widest.depth || 0);
      const optionScore = option.label.length + (option.depth || 0);
      return optionScore > widestScore ? option : widest;
    }, null),
    [options],
  );
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || options.find((option) => !option.disabled) || null,
    [options, value],
  );
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === selectedOption?.value),
    [options, selectedOption?.value],
  );
  const isRequired = required === true || ariaRequired === true;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : firstEnabledOptionIndex(options));

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledOptionIndex(options));
  }, [isOpen, options, selectedIndex]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const activeOption = optionRefs.current[activeIndex];
    if (activeOption && typeof activeOption.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === KEYBOARD_KEYS.ESCAPE) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const commitSelection = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!isOpen && (event.key === KEYBOARD_KEYS.ARROW_DOWN || event.key === KEYBOARD_KEYS.ARROW_UP || event.key === KEYBOARD_KEYS.ENTER || event.key === KEYBOARD_KEYS.SPACE)) {
      event.preventDefault();
      setIsOpen(true);
      const initialIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledOptionIndex(options);
      setActiveIndex(initialIndex);
      return;
    }
    if (!isOpen) return;
    if (event.key === KEYBOARD_KEYS.ARROW_DOWN) {
      event.preventDefault();
      setActiveIndex((current) => nextEnabledOptionIndex(options, current < 0 ? 0 : current, 1));
      return;
    }
    if (event.key === KEYBOARD_KEYS.ARROW_UP) {
      event.preventDefault();
      setActiveIndex((current) => nextEnabledOptionIndex(options, current < 0 ? 0 : current, -1));
      return;
    }
    if (event.key === KEYBOARD_KEYS.HOME) {
      event.preventDefault();
      setActiveIndex(firstEnabledOptionIndex(options));
      return;
    }
    if (event.key === KEYBOARD_KEYS.END) {
      event.preventDefault();
      setActiveIndex(nextEnabledOptionIndex(options, 0, -1));
      return;
    }
    if (event.key === KEYBOARD_KEYS.ENTER || event.key === KEYBOARD_KEYS.SPACE) {
      event.preventDefault();
      if (activeIndex >= 0 && !options[activeIndex]?.disabled) {
        commitSelection(options[activeIndex].value);
      }
      return;
    }
    if (event.key === KEYBOARD_KEYS.TAB) {
      setIsOpen(false);
    }
  };

  return (
    <div className={['kb-select', className].filter(Boolean).join(' ')} data-field={dataField} ref={rootRef}>
      <span aria-hidden="true" className="kb-select-sizer">
        <span
          className="kb-select-sizer-text"
          style={widestOption?.depth ? { paddingLeft: `${widestOption.depth * 16}px` } : undefined}
        >
          {widestOption?.label || ''}
        </span>
        <span className="kb-select-chevron-space" />
      </span>
      <button
        aria-describedby={ariaDescribedBy}
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={ariaInvalid || undefined}
        aria-label={ariaLabel}
        aria-required={isRequired || undefined}
        className="kb-select-trigger"
        data-field={dataField}
        disabled={disabled}
        id={resolvedId}
        type="button"
        onBlur={onBlur}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="kb-select-trigger-text">{selectedOption?.label || ''}</span>
        <span aria-hidden="true" className={`kb-select-chevron${isOpen ? ' open' : ''}`} />
      </button>
      {isOpen ? (
        <div className="kb-select-popover">
          <ul
            aria-labelledby={resolvedId}
            className="kb-select-listbox"
            id={listboxId}
            role="listbox"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              const optionClassName = [
                'kb-select-option',
                isSelected ? 'selected' : '',
                isActive ? 'active' : '',
              ].filter(Boolean).join(' ');
              return (
                <li key={`${option.value}-${option.label}`} role="presentation">
                  <button
                    aria-selected={isSelected}
                    className={optionClassName}
                    disabled={option.disabled}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    role="option"
                    type="button"
                    onClick={() => commitSelection(option.value)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span
                      className="kb-select-option-label"
                      style={option.depth ? { paddingLeft: `${option.depth * 16}px` } : undefined}
                    >
                      {option.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
