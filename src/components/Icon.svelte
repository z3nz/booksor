<script lang="ts">
  import { iconSvg, type IconName } from '../lib/icons.ts';

  let { name, size = 18, filled = false }: { name: IconName; size?: number; filled?: boolean } = $props();
</script>

<span class="icon">{@html iconSvg(name, size, filled)}</span>

<style>
  .icon {
    display: inline-flex;
    flex: none;
  }
</style>
