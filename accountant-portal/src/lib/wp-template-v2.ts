// Built-in "v2" WordPress program page template (shell). Data-driven sections
// are rendered by src/lib/wp-program-page.ts and inserted through the
// {{SECTION_*}} / *_HTML tokens; the sections below that are static (process,
// methodology, CTA, form intro) only use escaped scalar tokens.
//
// The legacy template (stored in the DB) is NOT touched by this file.
import { WP_V2_MARKER } from '@/lib/wp-program-page'

const CSS = `
.imx-page{--imx-primary:#0b4aa2;--imx-primary-dark:#06347a;--imx-primary-darker:#041e4a;--imx-primary-light:#e8f0fb;--imx-accent:#f59e0b;--imx-accent-dark:#b45309;--imx-accent-light:#fef3c7;--imx-success:#059669;--imx-success-light:#d1fae5;--imx-success-dark:#065f46;--imx-danger:#dc2626;--imx-danger-light:#fee2e2;--imx-danger-dark:#991b1b;--imx-ink:#0f172a;--imx-ink-2:#334155;--imx-muted:#64748b;--imx-line:#e2e8f0;--imx-line-2:#f1f5f9;--imx-bg:#f8fafc;--imx-card:#fff;--imx-radius:16px;--imx-radius-lg:24px;--imx-shadow-sm:0 1px 3px rgba(15,23,42,.06);--imx-shadow:0 4px 12px rgba(15,23,42,.08);--imx-shadow-lg:0 20px 40px rgba(11,74,162,.12);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--imx-ink);background:var(--imx-bg);line-height:1.6;-webkit-font-smoothing:antialiased}
.imx-page *,.imx-page *::before,.imx-page *::after{box-sizing:border-box}
:where(.imx-page) p{margin:0}:where(.imx-page) ul,:where(.imx-page) ol,:where(.imx-page) dl,:where(.imx-page) dd{margin:0;padding:0;list-style:none}
:where(.imx-page) h1,:where(.imx-page) h2,:where(.imx-page) h3,:where(.imx-page) h4{margin:0;line-height:1.2}
:where(.imx-page) a{color:inherit;text-decoration:none}:where(.imx-page) svg{display:inline-block;vertical-align:middle}
.imx-icon-sm{width:14px;height:14px;stroke-width:2;flex-shrink:0}.imx-icon-md{width:18px;height:18px;stroke-width:2;flex-shrink:0}
.imx-wrap{max-width:1200px;margin:0 auto;padding:0 20px}
.imx-section{padding:72px 0}.imx-section--tight{padding:48px 0}.imx-anchor{scroll-margin-top:90px}
.imx-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;letter-spacing:.1em;color:var(--imx-primary);padding:6px 14px;background:var(--imx-primary-light);border-radius:999px}
.imx-eyebrow::before{content:'';width:14px;height:2px;background:var(--imx-primary);border-radius:2px}
.imx-h2{font-size:clamp(26px,2.6vw,36px);font-weight:800;color:var(--imx-ink);letter-spacing:-.02em}
.imx-h3{font-size:20px;font-weight:800;color:var(--imx-ink);letter-spacing:-.01em}
.imx-lead{color:var(--imx-muted);font-size:17px;max-width:760px;line-height:1.65}
.imx-section-head{text-align:center;margin-bottom:40px}.imx-section-head .imx-eyebrow{margin-bottom:14px}.imx-section-head .imx-lead{margin:14px auto 0}
.imx-deadline-banner{background:linear-gradient(90deg,#b45309 0%,#d97706 50%,#f59e0b 100%);color:#fff;padding:12px 0;font-weight:700;font-size:14px;letter-spacing:.02em;position:relative;overflow:hidden}
.imx-deadline-banner--closed{background:linear-gradient(90deg,#334155,#475569)}
.imx-deadline-banner::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent 0,transparent 20px,rgba(255,255,255,.05) 20px,rgba(255,255,255,.05) 40px);pointer-events:none}
.imx-deadline-inner{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px;text-align:center;position:relative}
.imx-deadline-inner strong{color:#fef3c7;font-weight:900}
.imx-deadline-pulse{width:10px;height:10px;border-radius:50%;background:#fef3c7;animation:imx-pulse-light 1.5s infinite;flex-shrink:0}
@keyframes imx-pulse-light{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}
.imx-hero{position:relative;padding:56px 0 100px;color:#fff;background:radial-gradient(ellipse 900px 500px at 80% 20%,rgba(245,158,11,.18),transparent 60%),radial-gradient(ellipse 700px 500px at 15% 85%,rgba(255,255,255,.08),transparent 50%),linear-gradient(135deg,rgba(4,30,74,.96) 0%,rgba(8,58,131,.94) 45%,rgba(11,74,162,.92) 100%),url('{{HERO_IMAGE_URL}}') center/cover no-repeat;overflow:hidden}
.imx-hero::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 600px 400px at 50% 40%,#000 30%,transparent 80%);-webkit-mask-image:radial-gradient(ellipse 600px 400px at 50% 40%,#000 30%,transparent 80%);pointer-events:none}
.imx-hero-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:40px;align-items:center;position:relative;z-index:1}
.imx-hero-eyebrow{display:inline-flex;align-items:center;gap:10px;padding:8px 16px;background:rgba(16,185,129,.18);border:1px solid rgba(16,185,129,.45);border-radius:999px;font-size:12.5px;font-weight:800;color:#6ee7b7;letter-spacing:.08em;margin-bottom:20px}
.imx-dot{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 0 0 rgba(52,211,153,.7);animation:imx-pulse 2s infinite}
@keyframes imx-pulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.7)}70%{box-shadow:0 0 0 12px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
.imx-hero-title{font-size:clamp(30px,4.2vw,48px);font-weight:900;letter-spacing:-.03em;line-height:1.08;color:#fff;margin-bottom:18px}
.imx-hero-title .imx-highlight{color:#fbbf24;display:inline-block}
.imx-hero-sub{font-size:17px;line-height:1.65;opacity:.92;max-width:580px;margin-bottom:24px}
.imx-hero-badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.imx-hero-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:999px;font-size:13px;font-weight:700}
.imx-hero-badge.success{background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.4);color:#6ee7b7}
.imx-hero-cta{display:flex;flex-wrap:wrap;gap:12px}
.imx-btn{display:inline-flex;align-items:center;gap:10px;padding:14px 24px;border-radius:999px;font-weight:800;font-size:15px;border:none;cursor:pointer;transition:all .2s ease;white-space:nowrap}
.imx-btn-primary{background:linear-gradient(180deg,#fbbf24,#f59e0b);color:#0f172a;box-shadow:0 8px 20px rgba(245,158,11,.4)}
.imx-btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(245,158,11,.5)}
.imx-btn-ghost{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.25)}.imx-btn-ghost:hover{background:rgba(255,255,255,.18)}
.imx-btn-solid{background:var(--imx-primary);color:#fff;box-shadow:0 8px 20px rgba(11,74,162,.25)}.imx-btn-solid:hover{background:var(--imx-primary-dark);transform:translateY(-2px)}
.imx-hero-card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:var(--imx-radius-lg);padding:28px;backdrop-filter:blur(10px)}
.imx-hero-card-title{font-size:12px;font-weight:800;color:#fbbf24;letter-spacing:.12em;margin-bottom:18px;display:flex;align-items:center;gap:10px}
.imx-hero-card-title::before{content:'';width:16px;height:2px;background:#fbbf24}
.imx-hero-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.imx-hero-stat{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:16px}
.imx-hero-stat .n{font-size:22px;font-weight:900;letter-spacing:-.02em;color:#fff;line-height:1.15}
.imx-hero-stat .l{font-size:11.5px;font-weight:700;opacity:.85;margin-top:6px;letter-spacing:.04em}
.imx-hero-list{display:flex;flex-direction:column;gap:10px;margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.15)}
.imx-hero-list--first{margin-top:0;padding-top:0;border-top:none}
.imx-hero-list li{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.5;opacity:.95}
.imx-hl-bullet{flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#34d399;display:inline-flex;align-items:center;justify-content:center;color:#052e1a;margin-top:2px}
.imx-hl-bullet svg{width:11px;height:11px;stroke-width:3}.imx-hero-list li strong{color:#fff;font-weight:800}
.imx-stats-band{background:#fff;border:1px solid var(--imx-line);border-radius:var(--imx-radius-lg);padding:28px;display:grid;grid-template-columns:repeat(var(--n,4),1fr);gap:24px;box-shadow:var(--imx-shadow-lg);margin-top:-50px;position:relative;z-index:2}
.imx-stat{text-align:center;position:relative}
.imx-stat:not(:last-child)::after{content:'';position:absolute;right:-12px;top:15%;bottom:15%;width:1px;background:var(--imx-line)}
.imx-stat-n{font-size:clamp(20px,2.1vw,27px);font-weight:900;color:var(--imx-primary);letter-spacing:-.02em;line-height:1.15}
.imx-stat-l{font-size:12px;font-weight:700;color:var(--imx-muted);margin-top:8px;letter-spacing:.06em}
.imx-chipnav{position:sticky;top:0;z-index:20;background:rgba(248,250,252,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--imx-line);padding:14px 0;margin-top:40px}
.imx-chipnav-inner{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}.imx-chipnav-inner::-webkit-scrollbar{display:none}
.imx-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#fff;border:1px solid var(--imx-line);border-radius:999px;font-size:13px;font-weight:700;color:var(--imx-ink-2);white-space:nowrap;transition:all .15s ease}
.imx-chip svg{color:var(--imx-muted)}.imx-chip:hover{background:var(--imx-primary-light);color:var(--imx-primary-dark);border-color:var(--imx-primary);transform:translateY(-1px)}.imx-chip:hover svg{color:var(--imx-primary)}
.imx-twocol{display:grid;grid-template-columns:1fr 1fr;gap:24px}.imx-twocol-wide{display:grid;grid-template-columns:1.3fr 1fr;gap:28px;align-items:start}
.imx-card{background:var(--imx-card);border:1px solid var(--imx-line);border-radius:var(--imx-radius-lg);padding:32px;box-shadow:var(--imx-shadow-sm)}
.imx-card--accent{border-top:4px solid var(--imx-primary)}
.imx-icon-circle{width:48px;height:48px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:18px;flex-shrink:0}
.imx-icon-circle svg{width:22px;height:22px;stroke-width:2}
.imx-icon-primary{background:var(--imx-primary-light);color:var(--imx-primary)}.imx-icon-accent{background:var(--imx-accent-light);color:var(--imx-accent-dark)}.imx-icon-success{background:var(--imx-success-light);color:var(--imx-success-dark)}
.imx-text-list{display:flex;flex-direction:column;gap:10px;margin-top:6px}
.imx-text-list li{position:relative;padding-left:18px;font-size:15px;line-height:1.55;color:var(--imx-ink-2)}
.imx-text-list li::before{content:'';position:absolute;left:0;top:10px;width:6px;height:6px;border-radius:50%;background:var(--imx-primary)}
.imx-prose{font-size:15.5px;color:var(--imx-ink-2);line-height:1.7}.imx-prose+.imx-prose{margin-top:12px}
.imx-note{font-size:13.5px;color:var(--imx-muted);margin-top:10px}
.imx-callout{background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-left:4px solid var(--imx-accent-dark);border-radius:12px;padding:16px 20px;margin-top:22px}
.imx-callout-title{font-weight:800;color:var(--imx-accent-dark);margin-bottom:6px;display:flex;align-items:center;gap:8px;font-size:15px}
.imx-callout-body{color:var(--imx-ink-2);line-height:1.55;font-size:14px}
.imx-callout--blue{background:linear-gradient(135deg,#e8f0fb 0%,#dbeafe 100%);border-left-color:var(--imx-primary)}.imx-callout--blue .imx-callout-title{color:var(--imx-primary-dark)}
.imx-callout--green{background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border-left-color:var(--imx-success)}.imx-callout--green .imx-callout-title{color:var(--imx-success-dark)}
.imx-cond-card{background:#fff;border:1px solid var(--imx-line);border-top:4px solid var(--imx-primary);border-radius:var(--imx-radius-lg);padding:32px}
.imx-facts{display:flex;flex-direction:column}
.imx-facts>div{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid var(--imx-line-2);font-size:14.5px}
.imx-facts>div:last-child{border-bottom:none}.imx-facts dt{color:var(--imx-muted);font-weight:600}.imx-facts dd{color:var(--imx-ink);font-weight:800;text-align:right}
.imx-official{display:flex;align-items:center;gap:14px;padding:18px 24px;background:#fff;border:1px solid var(--imx-line);border-radius:14px;margin-top:28px;color:var(--imx-primary)}
.imx-official a{color:var(--imx-primary);font-weight:800;text-decoration:underline}.imx-official-text{font-size:14.5px;color:var(--imx-ink-2)}
.imx-action-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.imx-action{padding:26px}.imx-action .imx-h3{font-size:17px;margin-bottom:8px}.imx-action-desc{font-size:14.5px;color:var(--imx-muted);line-height:1.6}
.imx-exp-group+.imx-exp-group{margin-top:28px}
.imx-exp-cat{font-size:16px;font-weight:800;color:var(--imx-primary-dark);margin-bottom:10px;padding-left:12px;border-left:4px solid var(--imx-accent)}
.imx-table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--imx-line);border-radius:14px}
.imx-table{width:100%;border-collapse:collapse;font-size:14.5px;margin:0}
.imx-table th{background:var(--imx-primary-light);color:var(--imx-primary-dark);text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:10px 14px;border:none}
.imx-table td{padding:11px 14px;border:none;border-top:1px solid var(--imx-line-2);color:var(--imx-ink-2);vertical-align:top}
.imx-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
.imx-elig-block+.imx-elig-block{margin-top:26px;padding-top:26px;border-top:1px solid var(--imx-line-2)}
.imx-elig-title{font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--imx-muted);margin-bottom:12px}
.imx-tags{display:flex;flex-wrap:wrap;gap:8px}
.imx-tag{display:inline-block;padding:5px 12px;background:var(--imx-primary-light);color:var(--imx-primary-dark);border-radius:8px;font-size:13px;font-weight:700}
.imx-tag--danger{background:var(--imx-danger-light);color:var(--imx-danger-dark)}
.imx-acc-list{display:flex;flex-direction:column;gap:10px}
.imx-acc{background:#fff;border:1px solid var(--imx-line);border-radius:14px;overflow:hidden}
.imx-acc summary{display:flex;align-items:center;gap:14px;padding:16px 20px;cursor:pointer;font-weight:800;font-size:15.5px;color:var(--imx-ink);list-style:none}
.imx-acc summary::-webkit-details-marker{display:none}
.imx-acc summary::after{content:'+';margin-left:auto;font-size:22px;font-weight:600;color:var(--imx-primary);line-height:1}
.imx-acc[open] summary::after{content:'–'}.imx-acc[open]{border-color:var(--imx-primary);box-shadow:var(--imx-shadow)}
.imx-acc-body{padding:0 20px 18px 62px}
.imx-acc-n{flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--imx-primary-light);color:var(--imx-primary-dark);font-size:13px;font-weight:900;display:inline-flex;align-items:center;justify-content:center}
.imx-acc--plain{display:flex;align-items:flex-start;gap:14px;padding:16px 20px;font-size:15px;color:var(--imx-ink-2)}
.imx-acc--inline{border:none;background:transparent}.imx-acc--inline summary{padding:0;font-size:14px;color:var(--imx-primary);margin-bottom:10px}.imx-acc--inline[open]{box-shadow:none}
.imx-docs{display:flex;flex-direction:column;gap:12px;max-width:760px;margin:0 auto}
.imx-doc{display:flex;align-items:center;gap:12px;padding:16px 20px;background:#fff;border:1px solid var(--imx-line);border-radius:14px;color:var(--imx-primary);font-weight:800;transition:all .2s ease}
.imx-doc:hover{border-color:var(--imx-primary);box-shadow:var(--imx-shadow);transform:translateY(-2px)}
.imx-videos{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;max-width:1000px;margin:0 auto}
.imx-video{position:relative;padding-top:56.25%;border-radius:var(--imx-radius);overflow:hidden;box-shadow:var(--imx-shadow);background:#000}
.imx-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.imx-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:0;padding:0}
.imx-step{background:#fff;border:1px solid var(--imx-line);border-radius:var(--imx-radius);padding:28px 24px 24px;position:relative;transition:all .25s ease}
.imx-step:hover{border-color:var(--imx-primary);box-shadow:var(--imx-shadow);transform:translateY(-2px)}
.imx-step-num{position:absolute;top:-18px;left:24px;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--imx-primary),var(--imx-primary-dark));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;box-shadow:0 6px 14px rgba(11,74,162,.35)}
.imx-step h4{font-size:16px;font-weight:800;margin:14px 0 8px;color:var(--imx-ink)}.imx-step p{font-size:14.5px;color:var(--imx-muted);line-height:1.55}
.imx-method-band{background:radial-gradient(ellipse 600px 300px at 80% 0%,rgba(11,74,162,.06),transparent 60%),linear-gradient(180deg,var(--imx-bg) 0%,#fff 100%);border-top:1px solid var(--imx-line);border-bottom:1px solid var(--imx-line)}
.imx-method-features{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:36px auto 0;max-width:1080px}
.imx-method-feature{display:flex;align-items:center;gap:12px;padding:16px 18px;background:#fff;border:1px solid var(--imx-line);border-radius:14px;transition:all .2s ease}
.imx-method-feature:hover{border-color:var(--imx-primary);box-shadow:var(--imx-shadow);transform:translateY(-2px)}
.imx-method-feat-icon{flex-shrink:0;width:40px;height:40px;border-radius:10px;background:var(--imx-primary-light);color:var(--imx-primary);display:flex;align-items:center;justify-content:center}
.imx-method-feat-icon svg{width:20px;height:20px;stroke-width:2}.imx-method-feat-text{font-size:13.5px;font-weight:700;color:var(--imx-ink);line-height:1.35}
.imx-method-shots{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:44px}
.imx-method-shot{background:#fff;border:1px solid var(--imx-line);border-radius:var(--imx-radius-lg);padding:18px;box-shadow:var(--imx-shadow);transition:all .25s ease;display:flex;flex-direction:column}
.imx-method-shot:hover{transform:translateY(-4px);box-shadow:var(--imx-shadow-lg)}
.imx-method-shot-frame{background:linear-gradient(180deg,#f1f5f9,#e2e8f0);border-radius:10px;padding:26px 8px 8px;margin-bottom:16px;position:relative}
.imx-method-shot-frame::before{content:'';position:absolute;top:9px;left:14px;width:36px;height:8px;background:radial-gradient(circle 4px at 4px 4px,#ef4444 4px,transparent 4px),radial-gradient(circle 4px at 18px 4px,#f59e0b 4px,transparent 4px),radial-gradient(circle 4px at 32px 4px,#10b981 4px,transparent 4px)}
.imx-method-shot img{display:block;width:100%;height:auto;border-radius:6px;background:#fff}
.imx-method-shot-caption{padding:4px 6px 6px}
.imx-method-shot-cap-eyebrow{font-size:11.5px;font-weight:800;color:var(--imx-primary);letter-spacing:.1em;margin-bottom:8px}
.imx-method-shot-cap-title{font-size:17px;font-weight:800;color:var(--imx-ink);margin-bottom:8px;line-height:1.3}
.imx-method-shot-cap-desc{font-size:13.5px;color:var(--imx-muted);line-height:1.55}.imx-method-shot-cap-desc strong{color:var(--imx-ink-2);font-weight:700}
.imx-cta{background:linear-gradient(135deg,#041e4a 0%,#0b4aa2 100%);border-radius:var(--imx-radius-lg);padding:56px 40px;color:#fff;text-align:center;position:relative;overflow:hidden}
.imx-cta::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 80%,rgba(245,158,11,.18),transparent 40%),radial-gradient(circle at 80% 20%,rgba(255,255,255,.08),transparent 40%)}
.imx-cta h2{color:#fff;font-size:clamp(26px,3vw,38px);font-weight:900;letter-spacing:-.02em;margin-bottom:14px;position:relative}
.imx-cta p{color:rgba(255,255,255,.9);font-size:17px;max-width:640px;margin:0 auto 26px;line-height:1.6;position:relative}
.imx-cta-buttons{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;position:relative}
.imx-contact-line{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;padding:16px 18px;background:var(--imx-primary-light);border-radius:14px}
@media(max-width:980px){
.imx-section{padding:48px 0}.imx-hero{padding:40px 0 80px}.imx-hero-grid{grid-template-columns:1fr;gap:30px}
.imx-twocol,.imx-twocol-wide{grid-template-columns:1fr}.imx-action-grid{grid-template-columns:1fr 1fr}
.imx-stats-band{grid-template-columns:1fr 1fr;gap:20px;padding:24px;margin-top:-40px}.imx-stat:not(:last-child)::after{display:none}
.imx-steps{grid-template-columns:1fr}.imx-method-features{grid-template-columns:repeat(2,1fr)}.imx-method-shots{grid-template-columns:1fr}
.imx-cta{padding:36px 24px}.imx-card,.imx-cond-card{padding:24px}.imx-acc-body{padding-left:20px}}
@media(max-width:560px){
.imx-hero-title{font-size:30px}.imx-stats-band{grid-template-columns:1fr}.imx-stat:not(:last-child){border-bottom:1px solid var(--imx-line);padding-bottom:16px}
.imx-deadline-inner{font-size:13px;gap:10px}.imx-action-grid{grid-template-columns:1fr}.imx-facts>div{flex-direction:column;gap:2px}.imx-facts dd{text-align:left}}
`

const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="imx-i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></symbol>
<symbol id="imx-i-check-circle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></symbol>
<symbol id="imx-i-euro" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 21.5a9 9 0 1 1 0-19"/><path d="M3 10h11M3 14h11"/></symbol>
<symbol id="imx-i-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></symbol>
<symbol id="imx-i-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></symbol>
<symbol id="imx-i-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/></symbol>
<symbol id="imx-i-clipboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></symbol>
<symbol id="imx-i-cog" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
<symbol id="imx-i-layers" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></symbol>
<symbol id="imx-i-wallet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></symbol>
<symbol id="imx-i-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
<symbol id="imx-i-monitor" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></symbol>
<symbol id="imx-i-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></symbol>
<symbol id="imx-i-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>
<symbol id="imx-i-arrow-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></symbol>
<symbol id="imx-i-arrow-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></symbol>
<symbol id="imx-i-phone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></symbol>
<symbol id="imx-i-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></symbol>
<symbol id="imx-i-help" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>
</defs></svg>`

const ICON = (n: string, c = 'imx-icon-md') => `<svg class="${c}" aria-hidden="true" focusable="false"><use href="#imx-i-${n}"/></svg>`

const BODY = `
<div class="imx-page">
{{BANNER_HTML}}

<section class="imx-hero imx-anchor" id="top">
  <div class="imx-wrap"><div class="imx-hero-grid">
    <div>
      <div class="imx-hero-eyebrow"><span class="imx-dot" aria-hidden="true"></span>{{HERO_EYEBROW}}</div>
      <h1 class="imx-hero-title">{{HERO_TITLE_HTML}}</h1>
      <p class="imx-hero-sub">{{HERO_SUB}}</p>
      {{HERO_BADGES_HTML}}
      <div class="imx-hero-cta">
        <a class="imx-btn imx-btn-primary" href="#form">Δωρεάν έλεγχος επιλεξιμότητας ${ICON('arrow-right')}</a>
        <a class="imx-btn imx-btn-ghost" href="#about">Δείτε το πρόγραμμα ${ICON('arrow-right')}</a>
      </div>
    </div>
    {{HERO_CARD_HTML}}
  </div></div>
</section>

{{STATS_HTML}}

<nav class="imx-chipnav" aria-label="Περιεχόμενα σελίδας"><div class="imx-wrap"><div class="imx-chipnav-inner">{{CHIPNAV_HTML}}</div></div></nav>

{{SECTION_ABOUT}}
{{SECTION_ACTIONS}}
{{SECTION_EXPENSES}}
{{SECTION_ELIGIBILITY}}
{{SECTION_REQUIREMENTS}}
{{SECTION_DOCS}}
{{SECTION_VIDEO}}

<section class="imx-section imx-anchor" id="how" aria-labelledby="how-title"><div class="imx-wrap">
  <div class="imx-section-head"><span class="imx-eyebrow">Η ΔΙΑΔΙΚΑΣΙΑ</span><h2 class="imx-h2" id="how-title">Πώς συνεργαζόμαστε — βήμα προς βήμα</h2>
  <p class="imx-lead">Από τον δωρεάν έλεγχο επιλεξιμότητας έως την τελική εκταμίευση — αναλαμβάνουμε όλη τη διαδρομή.</p></div>
  <ol class="imx-steps">
    <li class="imx-step"><div class="imx-step-num" aria-hidden="true">1</div><h4>Δωρεάν έλεγχος</h4><p>Στέλνετε τα βασικά στοιχεία της επιχείρησης ή του σχεδίου σας και κάνουμε αρχική αξιολόγηση επιλεξιμότητας.</p></li>
    <li class="imx-step"><div class="imx-step-num" aria-hidden="true">2</div><h4>Προετοιμασία φακέλου</h4><p>Συλλέγουμε τα δικαιολογητικά και «στήνουμε» τη δομή του φακέλου από νωρίς.</p></li>
    <li class="imx-step"><div class="imx-step-num" aria-hidden="true">3</div><h4>Επιχειρηματικό σχέδιο</h4><p>Σύνταξη πλήρους πρότασης με στόχο τη <strong>μέγιστη μοριοδότηση</strong> στα κριτήρια αξιολόγησης.</p></li>
    <li class="imx-step"><div class="imx-step-num" aria-hidden="true">4</div><h4>Ηλεκτρονική υποβολή</h4><p>Υποβολή στην πλατφόρμα του προγράμματος εντός της προθεσμίας.</p></li>
    <li class="imx-step"><div class="imx-step-num" aria-hidden="true">5</div><h4>Αξιολόγηση &amp; έγκριση</h4><p>Παρακολούθηση φακέλου και υποβολή τυχόν συμπληρωματικών στοιχείων.</p></li>
    <li class="imx-step"><div class="imx-step-num" aria-hidden="true">6</div><h4>Υλοποίηση &amp; εκταμιεύσεις</h4><p>Υποστήριξη σε αιτήματα ελέγχου και πληρωμής έως την τελική εκταμίευση.</p></li>
  </ol>
</div></section>

<section class="imx-section imx-anchor imx-method-band" id="methodology" aria-labelledby="method-title"><div class="imx-wrap">
  <div class="imx-section-head"><span class="imx-eyebrow">ΜΕΘΟΔΟΛΟΓΙΑ ΥΛΟΠΟΙΗΣΗΣ</span><h2 class="imx-h2" id="method-title">Μετά την έγκριση — η υλοποίηση είναι δουλειά μας</h2>
  <p class="imx-lead">Στην i-Mentor δεν σταματάμε στην υποβολή. Παρακολουθούμε <strong>συστηματικά</strong> κάθε υπόθεση μέχρι την τελική εκταμίευση. Κάθε πελάτης λαμβάνει <strong>ασφαλή πρόσβαση σε προσωπικό portal</strong>, όπου παρακολουθεί σε πραγματικό χρόνο όλα τα στάδια της υπόθεσής του.</p></div>
  <div class="imx-method-features">
    <div class="imx-method-feature"><div class="imx-method-feat-icon" aria-hidden="true"><svg><use href="#imx-i-layers"/></svg></div><div class="imx-method-feat-text">Στάδια υπόθεσης &amp; χρονοδιαγράμματα</div></div>
    <div class="imx-method-feature"><div class="imx-method-feat-icon" aria-hidden="true"><svg><use href="#imx-i-wallet"/></svg></div><div class="imx-method-feat-text">Παρακολούθηση εκταμιεύσεων</div></div>
    <div class="imx-method-feature"><div class="imx-method-feat-icon" aria-hidden="true"><svg><use href="#imx-i-clock"/></svg></div><div class="imx-method-feat-text">Σημαντικά deadlines &amp; εκκρεμότητες</div></div>
    <div class="imx-method-feature"><div class="imx-method-feat-icon" aria-hidden="true"><svg><use href="#imx-i-user"/></svg></div><div class="imx-method-feat-text">Σύμβουλος που έχει αναλάβει την υπόθεση</div></div>
  </div>
  <div class="imx-method-shots">
    <article class="imx-method-shot"><div class="imx-method-shot-frame"><img src="https://i-mentor.gr/wp-content/uploads/2026/05/imentor-portal-timeline.jpg" alt="Στιγμιότυπο portal i-Mentor: πορεία υπόθεσης με όλα τα στάδια" loading="lazy"></div>
      <div class="imx-method-shot-caption"><div class="imx-method-shot-cap-eyebrow">PORTAL · ΠΟΡΕΙΑ ΥΠΟΘΕΣΗΣ</div><h3 class="imx-method-shot-cap-title">Όλα τα στάδια σε ένα ξεκάθαρο timeline</h3>
      <p class="imx-method-shot-cap-desc">Από την <strong>υποβολή της αίτησης</strong> και την <strong>έγκριση</strong>, μέχρι κάθε επιμέρους ορόσημο των αιτημάτων: δικαιολογητικά, επιτόπιοι έλεγχοι, ενημερότητες, εγκρίσεις. Βλέπετε ζωντανά πού βρισκόμαστε και τι ακολουθεί.</p></div></article>
    <article class="imx-method-shot"><div class="imx-method-shot-frame"><img src="https://i-mentor.gr/wp-content/uploads/2026/05/imentor-portal-payments.jpg" alt="Στιγμιότυπο portal i-Mentor: παρακολούθηση χρηματοδότησης και εκταμιεύσεων ανά δόση" loading="lazy"></div>
      <div class="imx-method-shot-caption"><div class="imx-method-shot-cap-eyebrow">PORTAL · ΧΡΗΜΑΤΟΔΟΤΗΣΗ</div><h3 class="imx-method-shot-cap-title">Παρακολούθηση εκταμιεύσεων &amp; οικονομικών</h3>
      <p class="imx-method-shot-cap-desc">Αναλυτική εικόνα κάθε <strong>δόσης επιδότησης</strong>: ποσά, ημερομηνίες υποβολής, λήξεις, τι έχει εισπραχθεί και τι αναμένεται. Επίσης πλήρης διαφάνεια στις <strong>αμοιβές της i-Mentor</strong> και την οικονομική σας συμφωνία.</p></div></article>
  </div>
  <div class="imx-callout imx-callout--blue" style="max-width:860px;margin:32px auto 0"><div class="imx-callout-title">${ICON('shield')}Διαφάνεια &amp; οργάνωση σε κάθε βήμα</div>
  <div class="imx-callout-body">Ο φάκελός σας δεν χάνεται σε emails. Έχετε <strong>24/7 πρόσβαση</strong> στην εξέλιξη της υπόθεσης από όπου κι αν είστε — γνωρίζετε πάντα ποιος σύμβουλος την έχει αναλάβει, τι εκκρεμεί και πότε αναμένεται η επόμενη εκταμίευση.</div></div>
</div></section>

{{SECTION_FAQ}}

<section class="imx-section imx-section--tight"><div class="imx-wrap"><div class="imx-cta">
  <h2>Ενδιαφέρεστε για το «{{TITLE}}»;</h2>
  <p>Η σωστή προετοιμασία του φακέλου από νωρίς εξασφαλίζει υψηλή μοριοδότηση και αποφυγή λαθών στην αξιολόγηση.</p>
  <div class="imx-cta-buttons">
    <a class="imx-btn imx-btn-primary" href="#form">Δωρεάν έλεγχος επιλεξιμότητας ${ICON('arrow-right')}</a>
    <a class="imx-btn imx-btn-ghost" href="#top">${ICON('arrow-up')}Πίσω στην αρχή</a>
  </div>
</div></div></section>

<!-- Η φόρμα bitform μπαίνει manually ΑΜΕΣΩΣ ΜΕΤΑ το HTML widget (δεν αγγίζεται από το sync) -->
<section class="imx-section imx-anchor" style="background:#fff;border-top:1px solid var(--imx-line);padding-bottom:32px" id="form" aria-labelledby="form-title"><div class="imx-wrap">
  <div class="imx-section-head" style="margin-bottom:28px"><span class="imx-eyebrow">ΔΩΡΕΑΝ ΕΛΕΓΧΟΣ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ</span><h2 class="imx-h2" id="form-title">Ξεκινήστε με έναν δωρεάν έλεγχο επιλεξιμότητας</h2>
  <p class="imx-lead">Στείλτε μας τα βασικά στοιχεία σας και θα επικοινωνήσουμε άμεσα για να σας πούμε αν μπορείτε να ενταχθείτε στο πρόγραμμα «{{TITLE}}» και με ποιο ποσοστό επιδότησης.</p></div>
  <div class="imx-callout imx-callout--green" style="max-width:760px;margin:0 auto"><div class="imx-callout-title">${ICON('check-circle')}Τι κάνουμε εμείς</div>
  <div class="imx-callout-body">Σας δίνουμε αναλυτική λίστα δικαιολογητικών μετά τον αρχικό έλεγχο, οργανώνουμε τον φάκελο, συντάσσουμε την πρόταση και αναλαμβάνουμε ολόκληρη την υποβολή στην πλατφόρμα.</div></div>
  <p style="color:var(--imx-muted);margin:22px auto 0;font-size:12.5px;line-height:1.5;max-width:760px;text-align:center">Συμπληρώστε τη φόρμα που ακολουθεί. Υποβάλλοντάς την, συμφωνείτε να επικοινωνήσει η i-Mentor Consulting μαζί σας για ενημέρωση σχετικά με τη διαδικασία (GDPR).</p>
</div></section>
</div>`

export const WP_TEMPLATE_V2_NAME = 'Πρόγραμμα — Πλούσιο v2 (ενσωματωμένο)'

export const WP_TEMPLATE_V2_HTML = `${WP_V2_MARKER}
{{JSONLD_HTML}}
<style>${CSS}</style>
${SPRITE}
${BODY}`
