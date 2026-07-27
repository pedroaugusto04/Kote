import { SourceIcon } from '../../shared/ui/icons';
import { formatSourceLabel, getSourceTagClass } from '../../shared/utils/format';

type SourceBadgeProps = {
  source?: string | null;
  className?: string;
  style?: React.CSSProperties;
  iconSize?: number;
};

export function SourceBadge({ source, className, style, iconSize }: SourceBadgeProps) {
  if (!source) return null;
  return (
    <span
      className={`source-tag ${getSourceTagClass(source)} ${className || ''}`}
      title={`Source: ${formatSourceLabel(source)}`}
      style={style}
    >
      <SourceIcon source={source} style={{ width: iconSize || 24, height: iconSize || 24 }} />
      <span>{formatSourceLabel(source)}</span>
    </span>
  );
}
