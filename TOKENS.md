# Styling tokens

Import `tokens/bug-tokens.css` once before the feature and reference primitive styles. Map colour properties to your host palette; preserve the geometry, type scale and interaction spacing to match the shipped UX. These are all properties referenced by the feature or its shared UI adapters, plus their recursive dependencies.

The source ships one light theme. It has no dark-theme values to copy. For a dark host, override the same semantic surface/ink/status pairs under the host theme selector and verify contrast; no dark palette has been invented here. Every value below is the source default except the two font-family bridge values and zero-initialized runtime shell properties, explained below.

| Property | Sales default / kit bridge | Meaning |
| --- | --- | --- |
| `--accent` | `#8f0ef6` | Primary FAB, selected tools and interactive accents. |
| `--accent-strong` | `#7a0bd4` | Accent hover/emphasis. |
| `--accent-soft` | `#f4e9fe` | Selected/filter background. |
| `--accent-border` | `rgba(143, 14, 246, 0.28)` | Subtle selected border. |
| `--on-accent` | `#ffffff` | Text/icons on accent fills. |
| `--focus` | `#8f0ef6` | Keyboard focus outline. |
| `--brand-grad` | `linear-gradient(90deg, #8f0ef6 0%, #ff2cc6 100%)` | Brand gradient used on guide illustrations. |
| `--primary-grad` | `linear-gradient(90deg, #8f0ef6, #7f0cdf 50%, #8f0ef6)` | Primary button gradient. |
| `--primary-grad-hover` | `linear-gradient(90deg, #7a0bd4, #6c0abd 50%, #7a0bd4)` | Primary button hover gradient. |
| `--canvas` | `#f4f4f5` | Page canvas and subdued form/image surfaces. |
| `--surface` | `#ffffff` | Cards, dialogs and form fields. |
| `--ink` | `#18181b` | Main text and line art. |
| `--ink-secondary` | `#52525b` | Labels and supporting text. |
| `--ink-muted` | `#6b6b74` | Metadata/helper text. |
| `--ink-nav` | `#3f3f46` | Shared avatar/navigation text. |
| `--on-ink` | `#ffffff` | Inverse text and viewer controls. |
| `--divider` | `#e4e4e7` | Standard borders/dividers. |
| `--divider-strong` | `#d4d4d8` | Emphasized borders and image canvas edge. |
| `--backdrop` | `rgba(24, 24, 27, 0.32)` | Modal scrim. |
| `--hover-faint` | `rgba(24, 24, 27, 0.04)` | Subtle hovered attachment row. |
| `--hover` | `rgba(24, 24, 27, 0.05)` | Shared control hover background. |
| `--selected-neutral` | `rgba(82, 82, 91, 0.1)` | Shared icon-button selected background. |
| `--secondary-grad` | `linear-gradient(135deg, rgba(17, 17, 16, 0.08), rgba(17, 17, 16, 0.016))` | Secondary button fill. |
| `--hairline` | `0.5px solid rgba(140, 140, 132, 0.28)` | Secondary button border. |
| `--card-shadow` | `4px 6px 18px -18px rgba(17, 17, 16, 0.16), 1px 2px 4px rgba(17, 17, 16, 0.024)` | Shared desktop page-header elevation. |
| `--popover-shadow` | `0 10px 28px -6px rgba(17, 17, 16, 0.18), 0 2px 6px rgba(17, 17, 16, 0.06)` | Dialogs, popovers and coachmark elevation. |
| `--raised-shadow` | `0 1px 3px rgba(17, 17, 16, 0.1)` | Selected tools/controls elevation. |
| `--toast-shadow` | `0 8px 24px rgba(0, 0, 0, 0.18)` | Toast and raised preview elevation. |
| `--positive` | `#15803d` | Positive feedback/check icon. |
| `--negative` | `#dc2626` | Validation/removal action colour. |
| `--negative-ink` | `#8e2626` | Error/cancellation text. |
| `--negative-surface` | `#fdf1f1` | Error/cancellation background. |
| `--negative-border` | `#f3c7c7` | Error/destructive control border. |
| `--warning-ink` | `#7a5a06` | Warning text. |
| `--warning-surface` | `#fff8e8` | Warning/help callout background. |
| `--warning-border` | `#f1d9a6` | Warning/help callout border. |
| `--warning-outline` | `#e0a63a` | Warning focus/outline accent. |
| `--caution-dot` | `#f59e0b` | Critical priority marker. |
| `--tag-blue-bg` | `#dbe8f9` | Blue status/priority badge background. |
| `--tag-blue-fg` | `#1e4f8a` | Blue status/priority badge text. |
| `--tag-purple-bg` | `#e9e1f8` | Shared informational/AI badge background. |
| `--tag-purple-fg` | `#5b3a9e` | Shared informational/AI badge text. |
| `--tag-yellow-bg` | `#fbefc9` | Yellow status/priority badge background. |
| `--tag-yellow-fg` | `#7a5a06` | Yellow status/priority badge text. |
| `--tag-orange-bg` | `#fde3cc` | Orange status/priority badge background. |
| `--tag-orange-fg` | `#8a4510` | Orange status/priority badge text. |
| `--tag-green-bg` | `#d9f2e1` | Green status/priority badge background. |
| `--tag-green-fg` | `#17633a` | Green status/priority badge text. |
| `--tag-red-bg` | `#f6dcdc` | Red status/priority badge background. |
| `--tag-red-fg` | `#8e2626` | Red status/priority badge text. |
| `--tag-grey-bg` | `#ececee` | Grey status/priority badge background. |
| `--tag-grey-fg` | `#52525b` | Grey status/priority badge text. |
| `--grade-a-border` | `#bbf7d0` | Completion/success illustrated guide border. |
| `--font-sans` | `var(--font-poppins), var(--font-plex-thai), system-ui, sans-serif` | Latin/Thai shared font stack. |
| `--weight-regular` | `400` | Body text weight. |
| `--weight-medium` | `500` | Intermediate emphasis weight. |
| `--weight-semibold` | `600` | Labels/headings weight. |
| `--leading-body` | `1.6` | Body line height. |
| `--text-xs` | `12px` | Small metadata/helper text; 12px minimum. |
| `--text-sm` | `12.5px` | Small desktop label/control text. |
| `--text-md` | `13px` | Desktop input/button text. |
| `--text-body-sm` | `13.5px` | Compact body text. |
| `--text-body` | `14px` | Body/comment text. |
| `--text-xl` | `16px` | Dialog titles and mobile inputs; 16px prevents iOS input zoom. |
| `--text-page-phone` | `32px` | Shared page heading on phone layouts. |
| `--text-page` | `48px` | Shared desktop page heading. |
| `--text-section` | `20px` | Guide/section headings. |
| `--text-stat` | `30px` | Large guide step numbers. |
| `--control-sm` | `28px` | Small desktop controls. |
| `--control-md` | `32px` | Default desktop controls. |
| `--control-lg` | `36px` | Large desktop inputs/icon buttons. |
| `--control-touch` | `44px` | Mobile touch target/control minimum. |
| `--shell-edge-gap` | `12px` | Shared screen-edge padding. |
| `--bug-thumbnail-width` | `80px` | List/report image thumbnail width. |
| `--bug-thumbnail-height` | `56px` | List/report image thumbnail height. |
| `--bug-marker-size` | `24px` | Unread/step marker geometry. |
| `--bug-image-preview-max-height` | `240px` | Attachment preview maximum height. |
| `--bug-canvas-max-height` | `480px` | Annotation canvas viewport maximum height. |
| `--bug-dropzone-min-height` | `320px` | Image dropzone minimum height. |
| `--bug-textarea-min-height` | `64px` | Expanded report details minimum height. |
| `--bug-guide-max-width` | `768px` | Guide content width. |
| `--bug-guide-mock-height` | `64px` | Illustrated guide mock frame height. |
| `--fab-size` | `56px` | Phone FAB size. |
| `--fab-size-md` | `64px` | Desktop FAB size. |
| `--radius-control` | `8px` | Buttons and small controls. |
| `--radius-input` | `10px` | Input/textarea corners. |
| `--radius-card` | `12px` | Cards/image frames. |
| `--radius-panel` | `16px` | Dialogs, coachmark and panels. |
| `--radius-pill` | `999px` | Pills, rounded badges and circular controls. |
| `--font-poppins` | `"Poppins"` | Host-loaded Latin family; Sales uses Next/font generated Poppins family. |
| `--font-plex-thai` | `"IBM Plex Sans Thai"` | Host-loaded Thai family; Sales uses Next/font generated IBM Plex Sans Thai family. |
| `--app-tabbar-height` | `calc(var(--control-touch) + var(--radius-card))` | Bottom mobile navigation height; source global CSS default. |
| `--shell-action-clearance` | `0px` | Runtime distance reserved below page content for visible floating controls. |
| `--shell-action-base-clearance` | `0px` | Runtime baseline footprint for nested scrollports, without obstruction lift feedback. |
| `--shell-action-lift` | `0px` | Runtime vertical FAB lift above a bottom/bulk/save bar. |
| `--shell-keyboard-inset` | `0px` | Runtime visual viewport keyboard inset. |

The source loads Poppins and IBM Plex Sans Thai through `next/font/local`, which provides generated family names through `--font-poppins` and `--font-plex-thai`. Font binaries are not copied; the kit bridge names work when your host loads these fonts. You can map `--font-sans` to an existing host stack, with a Thai-capable fallback.

`FloatingActionLayer` owns `--shell-action-lift`, `--shell-keyboard-inset`, `--shell-action-clearance` and `--shell-action-base-clearance` at runtime. The CSS zero values are safe initialization, not hardcoded placement. Keep its measurement logic and the supplied mobile tab-bar height mapping; register host bottom bars with the reference adapter.

Status mapping: blue is new; yellow is in progress; green is done; grey is cancelled. Priority mapping uses grey/yellow/orange/red for low/medium/high/critical. Text and backgrounds must be mapped as pairs.

Annotation paint colours also come from host tokens. `resolveAnnotationColors` reads computed `--negative` (red, source default `#dc2626`), `--caution-dot` (yellow, `#f59e0b`) and `--positive` (green, `#15803d`) before drawing into the saved bitmap. Map these to concrete computed CSS colours and check their visibility over light and dark screenshots.

The feature CSS contains fixed layout dimensions and media-query breakpoints copied from the source. They are not missing theme variables. Host changes should preserve keyboard reachability, 12px minimum text, 44px mobile targets, 1920px image processing bounds and the annotated image aspect ratio.
