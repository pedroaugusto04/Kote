import React from 'react';
import { formatDisplayToken } from './format';

export type TagItem = string | {
  label: string;
  backgroundColor?: string;
  color?: string;
  style?: React.CSSProperties;
};

type DisplayTagInput = {
  tags: string[];
  categories?: Array<{ name: string; color?: string; colorDark?: string }>;
};

export function getCategoryStyle(color?: string, colorDark?: string): React.CSSProperties | undefined {
  if (!color) return undefined;
  return {
    '--tag-color-light': color,
    '--tag-color-dark': colorDark || color,
  } as React.CSSProperties;
}

export function buildNoteDisplayTags(input: DisplayTagInput): TagItem[] {
  const categoryTags = (input.categories || []).map((cat) => ({
    label: formatDisplayToken(cat.name),
    style: getCategoryStyle(cat.color, cat.colorDark),
  }));
  const customTags = (input.tags || []).map(formatDisplayToken);

  const seen = new Set<string>();
  (input.categories || []).forEach((cat) => seen.add(cat.name.toLowerCase().trim()));

  const filteredCustomTags = customTags.filter((tag) => {
    const key = tag.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return [...categoryTags, ...filteredCustomTags];
}
