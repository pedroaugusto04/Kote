import { useEffect, useId, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react';
import { KEYBOARD_KEYS } from '../constants/keyboard.constants';
import { UI_MESSAGES } from '../constants/ui.constants';

export type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
  required?: boolean;
  disabled?: boolean;
  dataField?: string;
  onBlur?: () => void;
  className?: string;
};

export function TagInput({
  value = [],
  onChange,
  suggestions = [],
  placeholder = 'Type and press Enter to add tags...',
  id,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
  required,
  disabled,
  dataField,
  onBlur,
  className = '',
}: TagInputProps) {
  const reactId = useId();
  const resolvedId = id || `${UI_MESSAGES.SELECT_PREFIX}-${reactId}`;
  const isRequired = required === true || ariaRequired === true;
  
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const filteredSuggestions = suggestions.filter(
    (suggestion) => 
      suggestion.toLowerCase().includes(inputValue.toLowerCase()) &&
      !value.includes(suggestion)
  );

  // Close suggestions when clicking outside
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    
    if (showSuggestions) {
      document.addEventListener('pointerdown', handlePointerDown);
      return () => document.removeEventListener('pointerdown', handlePointerDown);
    }
  }, [showSuggestions]);

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (!trimmedTag || value.includes(trimmedTag)) {
      setInputValue('');
      setShowSuggestions(false);
      return;
    }
    
    onChange([...value, trimmedTag]);
    setInputValue('');
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    setShowSuggestions(newValue.length > 0 && filteredSuggestions.length > 0);
    setActiveSuggestionIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    // Add tag on Enter, comma, or tab
    if (event.key === KEYBOARD_KEYS.ENTER || event.key === ',' || event.key === KEYBOARD_KEYS.TAB) {
      event.preventDefault();
      
      if (showSuggestions && activeSuggestionIndex >= 0 && filteredSuggestions[activeSuggestionIndex]) {
        addTag(filteredSuggestions[activeSuggestionIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
      return;
    }

    // Remove last tag on Backspace when input is empty
    if (event.key === KEYBOARD_KEYS.BACKSPACE && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
      return;
    }

    // Navigate suggestions
    if (showSuggestions) {
      if (event.key === KEYBOARD_KEYS.ARROW_DOWN) {
        event.preventDefault();
        setActiveSuggestionIndex((current) => 
          current < filteredSuggestions.length - 1 ? current + 1 : 0
        );
        return;
      }
      
      if (event.key === KEYBOARD_KEYS.ARROW_UP) {
        event.preventDefault();
        setActiveSuggestionIndex((current) => 
          current > 0 ? current - 1 : filteredSuggestions.length - 1
        );
        return;
      }
      
      if (event.key === KEYBOARD_KEYS.ESCAPE) {
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
        return;
      }
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    addTag(suggestion);
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    // Add pending tag on blur if there's content
    if (inputValue.trim()) {
      addTag(inputValue);
    }
    onBlur?.();
  };

  return (
    <div 
      className={['kb-tag-input', className].filter(Boolean).join(' ')} 
      data-field={dataField}
      ref={containerRef}
    >
      <div className="kb-tag-input-container">
        {value.map((tag) => (
          <span key={tag} className="kb-tag-chip">
            <span className="kb-tag-chip-text">{tag}</span>
            <button
              type="button"
              className="kb-tag-chip-remove"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag} tag`}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={resolvedId}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-required={isRequired}
          disabled={disabled}
          className="kb-tag-input-field"
        />
      </div>
      
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="kb-tag-suggestions">
          <ul className="kb-tag-suggestions-list" role="listbox">
            {filteredSuggestions.map((suggestion, index) => (
              <li 
                key={suggestion}
                role="option"
                className={`kb-tag-suggestion ${index === activeSuggestionIndex ? 'active' : ''}`}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
