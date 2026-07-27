const brandMarkUrl = `${import.meta.env.BASE_URL}Kote-Logo.svg`;

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img alt="" src={brandMarkUrl} />
    </span>
  );
}
