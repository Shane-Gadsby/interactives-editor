/**
 * The Ixia logo as drawn in the logo kit (the bloom beside the name, lettering as shapes), for anywhere the app names
 * itself. Never the icon with the name typed beside it. Both grounds are in the page and the theme shows the right one:
 * charcoal lettering on a light ground, white on a dark one.
 */
export function BrandLogo() {
  return (
    <>
      <img className="brand-logo on-dark" src="./ixia-logo-reversed.svg" alt="Ixia" width={98} height={36} />
      <img className="brand-logo on-light" src="./ixia-logo.svg" alt="Ixia" width={98} height={36} />
    </>
  );
}
