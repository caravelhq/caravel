<template>
  <div id="dashboard-panel">
    <section class="hero">
      <div class="logo-art" role="img" aria-label="Caravel ship logo">
        <svg class="logo-ship" viewBox="0 0 120 96" width="120" height="96" fill="none" aria-hidden="true">
          <!-- Caravela latina: three lateen sails, raked masts, high sterncastle. Bow left, stern right. -->
          <!-- masts -->
          <path d="M34 70 V30 M58 70 V14 M84 60 V28" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
          <!-- yards: long spars running low-forward to high-aft -->
          <path d="M12 59 L52 24 M28 45 L80 6 M64 53 L102 22" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5" />
          <!-- mizzen lateen -->
          <path d="M66 52 L100 24 Q106 40 98 60 Q82 58 66 52 Z" fill="currentColor" opacity="0.6" />
          <!-- main lateen -->
          <path d="M30 44 L78 8 Q88 36 74 64 Q52 60 30 44 Z" fill="currentColor" opacity="0.92" />
          <!-- fore lateen -->
          <path d="M14 58 L50 26 Q58 46 48 66 Q30 64 14 58 Z" fill="currentColor" opacity="0.74" />
          <!-- pennant -->
          <path d="M58 14 h12 l-3.5 3 l3.5 3 h-12 Z" fill="currentColor" opacity="0.9" />
          <!-- sterncastle -->
          <path d="M82 70 V60 H102 L100 70 Z" fill="currentColor" opacity="0.85" />
          <!-- hull -->
          <path d="M16 70 H104 L95 84 Q90 89 82 89 H38 Q30 89 25 84 Z" fill="currentColor" />
        </svg>
      </div>
      <div class="brand-name" aria-label="Caravel">Caravel</div>
      <div class="time" id="clock">--:--:--</div>
      <div class="date" id="date">Loading date...</div>
      <div class="message" id="message">Welcome back.</div>
      <section class="multi-agent-panel" id="multi-agent-panel" hidden>
        <div class="multi-agent-head">
          <div>
            <div class="multi-agent-title">Multi-Agent Tasks</div>
            <div class="multi-agent-sub" id="multi-agent-sub">Loading...</div>
          </div>
          <div class="multi-agent-head-actions">
            <button class="multi-agent-action" id="multi-agent-open-tasks-btn" type="button" title="Open the Tasks panel">Open Tasks</button>
            <button class="multi-agent-refresh" id="multi-agent-refresh" type="button" title="Refresh">↻</button>
          </div>
        </div>
        <div class="multi-agent-grid" id="multi-agent-grid"></div>
        <div class="multi-agent-extras" id="multi-agent-extras"></div>
      </section>
    </section>
  </div>
</template>
