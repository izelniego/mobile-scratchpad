---
name: The Darkroom
description: A personal site developed out of grain by the visitor, in a safelight-red room.
colors:
  safelight: "#ff3b2a"
  ember: "#7a1408"
  ember-deep: "#41120a"
  total-dark: "#060403"
  print-white: "#ece5d8"
  print-paper: "#e6ddcb"
  print-silver: "#9a938a"
  print-ground: "#0e0c0a"
  verso-ink: "#2e2a24"
typography:
  display:
    fontFamily: "Archivo Black, Archivo, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 13vw, 9rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(0.95rem, 1.6vw, 1.2rem)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.22em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.14em"
rounded:
  none: "0px"
  instrument: "4px"
components:
  instrument:
    backgroundColor: "transparent"
    textColor: "{colors.safelight}"
    rounded: "{rounded.none}"
    padding: "7px 11px"
  stamp-link:
    backgroundColor: "transparent"
    textColor: "{colors.verso-ink}"
    rounded: "{rounded.none}"
    padding: "10px 14px"
  fix-stamp:
    backgroundColor: "rgba(6, 4, 3, 0.72)"
    textColor: "{colors.safelight}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
---

# Design System: The Darkroom

## Overview

**Creative North Star: "The Print That Doesn't Exist Yet"**

The site is a photographic darkroom after midnight. Nothing is simply shown; everything is *developed* — content condenses out of living film grain under the visitor's held attention, the way a latent image condenses in a developer tray. The inspiration artifact (a night room rendered entirely in animated static, a figure watching a glowing screen) supplies the physics: noise is the single material, light is scarce and colored, watching is the core act.

Two registers coexist. The ROOM is drenched in safelight red on near-black — instruments, labels, trays, the enlarger beam, all rendered live in WebGL. The PRINTS are silver-gelatin grayscale on paper white — they carry all real content and all sustained reading. This split keeps a fully red world legible.

**Key Characteristics:**
- Film grain everywhere (GLSL room field + per-print canvas veils), never decorative — it is the substrate images come from.
- Interaction is photochemistry: expose, agitate (press-and-hold), develop, dodge/burn, fix. Time and patience are mechanics.
- Darkness is physical: white light fogs unfixed prints, and the site enforces it.
- Content is authored as photographic artifacts: prints, contact sheets, sprocketed frames, stamped versos, grease-pencil markup.

## Colors

A Drenched strategy: the room IS safelight red; prints answer in neutral silver and paper.

### Primary
- **Safelight** (#ff3b2a): the room's only light. Instrument text and borders, timer digits, hints, focus outlines, the lamp glow.
- **Ember** (#7a1408): Safelight at low energy — instrument borders, dashed hint frames. Decoration only, never text.
- **Ember Deep** (#41120a): timer bezel, scrollbar thumb, the darkest red furniture.

### Neutral
- **Total Dark** (#060403): the room ground and WebGL clear color. Never pure black — it always carries grain.
- **Print White** (#ece5d8): silver-gelatin highlight; hero display text on print ground.
- **Print Paper** (#e6ddcb): unexposed paper margins, sheet backgrounds, the verso face.
- **Print Silver** (#9a938a): print mid-gray; captions, frame numbers, secondary print text.
- **Print Ground** (#0e0c0a): the image area of dark prints.
- **Verso Ink** (#2e2a24): stamp ink on paper-white surfaces.

### Named Rules
**The Two Rooms Rule.** Red belongs to the room; grayscale belongs to prints. Sustained reading happens only on prints; red text is instrument labels of a few words, never paragraphs.
**The Fog Rule.** Pure white appears exactly once — the white-light pull cord — and it is a catastrophe with consequences, not a highlight.

## Typography

**Display Font:** Archivo Black (self-hosted woff2)
**Body/Label Font:** Archivo variable, weights 100–900 (self-hosted woff2)
**Timer digits:** authored seven-segment SVG rectangles — drawn, not a font

**Character:** Industrial supply-room utilitarianism — the voice of photo-paper boxes and equipment labels. Personality comes from photochemical rendering (grain, uneven development, halation), never from novelty faces. Grease-pencil markup is authored SVG strokes, not a handwriting font.

### Hierarchy
- **Display** (Archivo Black 400, clamp(3.5rem, 13vw, 9rem), 0.95, -0.02em): the developed name on the hero print only.
- **Headline** (Archivo 700, clamp(0.95rem, 1.6vw, 1.2rem), 0.22em tracking, uppercase): station titles.
- **Body** (Archivo 400–500, 1rem, 1.6): notes and captions; max ~60ch.
- **Label** (Archivo 600–700, 0.62–0.8rem, 0.14–0.24em tracking, uppercase): stamps, instrument labels, hints, frame numbers.

### Named Rules
**The Stamp Rule.** Uppercase tracked labels are stamped: bordered or underlined, short, imperative (HOLD THE SHEET TO AGITATE · DO NOT · FIX).

## Layout

One continuous vertical bench walked by scrolling: enlarger + developer tray (hero, 100svh) → blackout window (72svh interlude) → contact sheet → verso → door (footer close). Full-bleed dark ground; prints are the only containers (hero min(84vw, 900px) at 16/10, sheet min(94vw, 1080px), verso min(88vw, 760px)). The fixed instrument rail tucks away while scrolling down and returns on scroll-up. Mobile keeps the same room: hero goes 4/5, sheet steps 3 → 2 → 1 columns, the timer drops into flow below the tray.

## Elevation & Depth

No box-shadows anywhere. Depth comes from light rendered in the room shader: the enlarger's dust-filled beam cone, safelight halation (radial glow + top wash), a corner vignette, and the pooled light on the tray. Prints lift off the dark by their paper-white margins, not shadow. The only glow is `drop-shadow` red halation on the timer face and lamp.

## Shapes

Sharp, physical rectangles: prints, frames, trays, stamps are true rectangles (0 radius; the timer bezel alone carries 4px). Contact-sheet frames carry sprocket-hole strips top and bottom. The only curves are the lamp glass, the enlarger lens, and hand-drawn grease-pencil ellipses.

## Components

### Instrument (room controls: SOUND, AUTO-DEVELOP)
- **Shape:** sharp rectangle, 1px Ember border.
- **Style:** Safelight uppercase label text on transparent; state word in Print Silver, turning Safelight when active.
- **Hover:** translucent ember fill rgba(122,20,8,0.3). **Focus:** 2px Safelight outline, 3px offset.

### Print (the core surface)
- **Structure:** Print Paper padding (clamp 10–16px) as the unexposed margin around a Print Ground image area with an SVG-noise texture.
- **Veil:** a per-print canvas above the content — animated grain that clears as the development field grows; drops pointer-events only after the hold ends so a develop-release never clicks through.
- **States:** undeveloped (grain, brightens slightly on hover), developing (uneven clearing + burn-in on over-agitation), developed (FIX stamp appears), fogged (gray grain after white light), fixed (persists via localStorage, immune to fog), solarized (brief invert flicker after a long over-hold).

### Fix Stamp
- Safelight-bordered label button on dark prints; Verso Ink variant on paper-white; rotates -7° when FIXED.

### Contact-sheet Frame
- 3/2 dark frame with sprocket strips, small silver frame number, caption over a bottom gradient scrim, full-frame link; grease-pencil SVG circle draws itself (0.9s dash animation) on the kept frame after development.

### Stamp Link (verso)
- 2px Verso Ink border, uppercase tracked, slight rotations (-2.5°/1.8°); inverts to ink-filled on hover.

### Timer
- Authored seven-segment SVG in Safelight on an Ember Deep bezel; counts the active development of the hero print.

## Do's and Don'ts

### Do:
- **Do** render all content as photographic artifacts (prints, sheets, stamps) with grain participating.
- **Do** make patience legible: development progress must be visible within ~300ms of holding.
- **Do** keep the escape hatches: AUTO-DEVELOP instrument, reduced-motion auto-develops everything, keyboard focus-visible develops the focused print, Enter/Space develops.
- **Do** keep the room dark in every fallback — the fallback is a developed darkroom, never a light theme.

### Don't:
- **Don't** put paragraphs in red or on raw room ground (The Two Rooms Rule).
- **Don't** use box-shadows, border radii beyond the timer bezel, gradient buttons, or stock component chrome.
- **Don't** reveal content by cursor-position flashlight; development is time + agitation, never a spotlight.
- **Don't** fabricate bio facts: unstated facts ship as stamped AWAITING EXPOSURE frames or blank stamped lines — in-world, explicitly placeholder.
