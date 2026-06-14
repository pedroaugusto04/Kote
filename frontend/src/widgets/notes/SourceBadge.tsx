import { SourceIcon } from '../../shared/ui/icons';
import { formatSourceLabel, getSourceTagClass } from '../../shared/utils/format';

type SourceBadgeProps = {
  source?: string | null;
  className?: string;
  style?: React.CSSProperties;
};

export function SourceBadge({ source, className, style }: SourceBadgeProps) {
  if (!source) return null;
  return (
    <span
      className={`source-tag ${getSourceTagClass(source)} ${className || ''}`}
      title={`Source: ${formatSourceLabel(source)}`}
      style={style}
    >
      <SourceIcon source={source} />
      <span>{formatSourceLabel(source)}</span>
    </span>
  );
}
