<script lang="ts">
  // Pointers to real-world help, shown with sensitive topics and crisis searches.
  import type { Care } from '../lib/situations.ts';

  let { kind, compact = false }: { kind: Care; compact?: boolean } = $props();
</script>

<aside class="care" class:compact class:urgent={kind !== 'support'} aria-label="Getting help">
  {#if kind === 'crisis'}
    <p class="lead">You matter, and you don’t have to face this alone.</p>
    <p>
      If you’re thinking about ending your life, please reach out right now. In the US or Canada, call or text
      <a href="tel:988"><strong>988</strong></a>. Anywhere else, find a free, confidential helpline at
      <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a>. If you’re in danger, call
      your local emergency number.
    </p>
  {:else if kind === 'safety'}
    <p class="lead">If you’re in danger right now, call your local emergency number.</p>
    <p>
      Free, confidential support for abuse and violence is available near you through
      <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a>.
    </p>
  {:else}
    <p class="lead">You don’t have to walk this road alone.</p>
    <p>
      A doctor, counselor, pastor or support group can help. Free, confidential support:
      <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a>.
    </p>
  {/if}
</aside>

<style>
  .care {
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: 10px;
    background: var(--surface);
    font-family: var(--font-ui);
    font-size: 15px;
    line-height: 1.5;
    text-align: left;
  }
  .care.urgent {
    background: color-mix(in srgb, var(--accent) 7%, var(--surface));
  }
  .care p {
    margin: 0;
  }
  .care p + p {
    margin-top: 4px;
  }
  .lead {
    font-weight: 600;
  }
  .compact {
    font-size: 14px;
    padding: 10px 14px;
  }
</style>
