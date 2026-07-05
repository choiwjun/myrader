# Boina Design System

## 1. Atmosphere & Identity

Boina is a shop report card: calm, readable, and evidence-first. The signature is a paper-like mobile feed where each card gives one sentence, one proof cue, and one next action.

## 2. Color

| Role | Token | Light | Usage |
| --- | --- | --- | --- |
| Surface/page | `--boina-bg` | `#F6F7F5` | App feed background |
| Surface/card | `--boina-card` | `#FFFFFF` | Cards and sheets |
| Text/primary | `--boina-ink` | `#191F28` | Headlines and body |
| Text/secondary | `--boina-ink-2` | `#4E5968` | Supporting copy |
| Text/caption | `--boina-ink-3` | `#8B95A1` | Metadata and evidence labels |
| Border/subtle | `--boina-line` | `#E9ECEE` | Dividers and card borders |
| Brand/primary | `--boina-brand` | `#0B7A55` | Primary action and good state |
| Brand/deep | `--boina-brand-deep` | `#075E42` | Primary hover and emphasis |
| Brand/soft | `--boina-brand-soft` | `#E7F4EE` | Soft brand background |
| Status/good | `--boina-good` | `#0B7A55` | `● 좋아요` |
| Status/mid | `--boina-mid` | `#C77700` | `◐ 보통이에요` |
| Status/wait | `--boina-wait` | `#6B7684` | `○ 준비 중이에요` |

Rules: no fear red for owner-facing status, no fake ranking or score colors, and each status needs shape, color, and sentence.

## 3. Typography

| Level | Size | Weight | Line Height | Usage |
| --- | --- | --- | --- | --- |
| Hero | 22px | 800 | 32px | Representative state sentence |
| Title | 18px | 700 | 26px | Card titles |
| Body | 17px | 500 | 26px | Main card copy |
| Caption | 14px | 500 | 20px | Evidence and timestamps |
| Number | 17px | 700 tabular | 24px | Comparisons only |

Font stack: Pretendard only for app surfaces. Material Symbols Outlined is the sole icon family.

## 4. Spacing & Layout

Base unit is 4px. Cards use 20px padding, 12px feed gap, and 20px horizontal mobile gutters. Desktop keeps the owner feed centered around a narrow reading column instead of creating a separate desktop-only product.

## 5. Components

### M-05 Radar Keyword Card

- **Structure**: card title, optional fallback label, three keyword rows, CTA, trust caption.
- **Variants**: unsubscribed preview, subscribed weekly list.
- **Spacing**: 20px card padding, 12px row gap, 14px button radius.
- **States**: loading skeleton, measured preview, example fallback, locked teaser rows.
- **Accessibility**: actual buttons/links, no emoji icons, status shape text exposed with labels.
- **Motion**: none. The only product motion is task completion elsewhere.

## 6. Motion & Interaction

Owner-facing feed cards are static. Buttons use color and focus states only; no decorative motion. Respect reduced motion by avoiding nonessential animation.

## 7. Depth & Surface

Strategy: mixed, but restrained. Cards use white surface, subtle border, and one small shadow: `0 1px 3px rgba(25,31,40,.06)`. Avoid floating glass effects in the owner app.
