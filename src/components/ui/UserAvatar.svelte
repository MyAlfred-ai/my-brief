<script>
  /**
   * Avatar de l'utilisateur connecté — sa photo de profil, sinon ses
   * initiales, plus une pastille qui dit PAR QUOI la session a été ouverte :
   * Google, Microsoft, mot de passe, ou le SSO d'infrastructure (plugin OIDC
   * Traefik / ForwardAuth mobile).
   *
   * La pastille se surajoute au rond au lieu de le remplacer : le rond sert
   * d'abord à reconnaître QUI est connecté. Un logo Google seul dirait le
   * comment et plus le qui — et deux comptes Google seraient identiques.
   *
   * `picture` vient du serveur (photo publiée par Google, cf. `pictureOf` dans
   * services/api/lib/auth/providers.js). Une photo qui ne charge pas (adresse
   * expirée, hors ligne) rend la main aux initiales : jamais d'image cassée.
   *
   * `authProvider` vient du serveur (/api/init et /api/auth/session, cf.
   * services/api/lib/auth/resolve.js). Valeur inconnue ou absente ⇒ pas de
   * pastille : mieux vaut rien qu'un badge faux.
   */
  import GoogleLogo from '../icons/GoogleLogo.svelte';
  import MicrosoftLogo from '../icons/MicrosoftLogo.svelte';
  import IconKey from '~icons/solar/key-minimalistic-bold';
  import IconShield from '~icons/solar/shield-check-bold';

  export let initials = '';
  /** Adresse HTTPS de la photo de profil ; vide ⇒ initiales. */
  export let picture = '';
  /** 'google' | 'entra' | 'password' | 'oidc' | 'sso' */
  export let provider = '';
  /** Diamètre du rond, en px — la pastille suit. */
  export let size = 31;
  /** Infobulle : la seule forme lisible du badge, qui est décoratif. */
  export let title = '';

  const LOGOS = { google: GoogleLogo, entra: MicrosoftLogo };
  const ICONS = { password: IconKey, oidc: IconShield, sso: IconShield };

  // L'adresse en échec, pas un booléen : une nouvelle photo (autre compte,
  // photo changée) retente d'elle-même.
  let failedPicture = '';
  $: showPicture = !!picture && picture !== failedPicture;

  $: logo = LOGOS[provider] || null;
  $: icon = ICONS[provider] || null;
  // La pastille tient un tiers du rond, avec un plancher : en dessous de 12 px
  // les quatre carrés Microsoft ne se distinguent plus.
  $: badgeSize = Math.max(12, Math.round(size * 0.42));
  $: glyphSize = Math.round(badgeSize * 0.62);
</script>

<div
  class="ua"
  style="--ua-size:{size}px; --ua-badge:{badgeSize}px"
  title={title || undefined}
  aria-hidden="true"
>
  <div class="ua-disc">
    {#if showPicture}
      <!-- `no-referrer` : Google refuse parfois ses photos à un référent
           inconnu, et l'adresse de l'app n'a pas à lui être envoyée. AVANT
           `src` : une photo déjà en cache se charge dès que `src` est posé,
           avec la politique en vigueur à cet instant. -->
      <img
        class="ua-photo"
        referrerpolicy="no-referrer"
        src={picture}
        alt=""
        on:error={() => (failedPicture = picture)}
      />
    {:else}
      {initials}
    {/if}
  </div>
  {#if logo || icon}
    <span class="ua-badge" class:ua-badge-icon={!logo}>
      {#if logo}
        <svelte:component this={logo} size={glyphSize} />
      {:else}
        <svelte:component this={icon} width={glyphSize} height={glyphSize} />
      {/if}
    </span>
  {/if}
</div>

<style>
  .ua {
    position: relative;
    width: var(--ua-size);
    height: var(--ua-size);
    flex-shrink: 0;
  }

  .ua-disc {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--mb-orange);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Lexend', sans-serif;
    font-size: calc(var(--ua-size) * 0.39);
    font-weight: 500;
    user-select: none;
    overflow: hidden;
  }

  .ua-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Débord assumé hors du rond : à l'intérieur, la pastille mangerait les
     initiales sur un avatar de 31 px. */
  .ua-badge {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: var(--ua-badge);
    height: var(--ua-badge);
    border-radius: 50%;
    background: #fff;
    /* L'anneau blanc détache la pastille des couleurs du rond ET du fond. */
    box-shadow: 0 0 0 1.5px #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Les logos de marque portent leurs propres couleurs ; les icônes de trait,
     non — sans ça, la clé et le bouclier seraient invisibles sur blanc. Gris
     neutre et pas l'orange de la marque : sur un rond déjà orange, la pastille
     ne se lirait plus comme une pastille mais comme une bosse. */
  .ua-badge-icon {
    background: var(--mb-text-secondary);
    color: #fff;
  }
</style>
