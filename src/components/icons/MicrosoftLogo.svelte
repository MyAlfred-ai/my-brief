<script>
  /**
   * Logo Microsoft officiel (les quatre carrés), inline comme
   * [GoogleLogo](./GoogleLogo.svelte). Il identifie le SSO Entra ID, dont la
   * configuration vit dans l'infrastructure (plugin OIDC Traefik) et non en base.
   */
  export let size = 18;
</script>

<svg
  class="provider-logo"
  viewBox="0 0 18 18"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
>
  <path fill="#F25022" d="M0 0h8.5v8.5H0z" />
  <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z" />
  <path fill="#00A4EF" d="M0 9.5h8.5V18H0z" />
  <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z" />
</svg>

<style>
  .provider-logo {
    flex: 0 0 auto;
    display: block;
  }
</style>
