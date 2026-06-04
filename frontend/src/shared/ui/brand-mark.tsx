const brandMarkUrl = `${import.meta.env.BASE_URL}icon-512.png`;

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img alt="" src={brandMarkUrl} />
    </span>
  );
}
