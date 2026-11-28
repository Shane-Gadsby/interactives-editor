# The design scale

Every kit the editor builds takes its numbers from here: spacing, corner radii, type sizes, control height and shadows. Use these, never numbers of your own.

- SPACE: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 }
- RADIUS: { small: 6, control: 8, card: 12 }
- TYPE: { small: 13, body: 15, heading: 18, title: 22 }
- CONTROL_H: 44
- SHADOW: { raised: { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.18)' }, floating: { x: 0, y: 16, blur: 40, spread: 0, color: 'rgba(0,0,0,0.22)' }, }
- pad: (v: number, h: number = v) => ({ top: v, right: h, bottom: v, left: h })

- SPACE is for gaps and padding. RADIUS: small for little things on top (tooltip, tag), control for anything pressed or typed in, card for a box holding other things.
- TYPE: small for hints and captions, body for reading and every control label, heading for a card heading, title for a page heading. Learner pages read best at 16 px or more for body text.
- CONTROL_H is how tall anything pressed is (44 px: big enough for a finger).
- StudyDesk embeds activities at about 800 px wide. Lay pages out for that width: one column of cards, or two at most, never a wide desktop layout.
