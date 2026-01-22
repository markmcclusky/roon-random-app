/**
 * Icon Components
 * SVG icon components for the UI
 */

// Get React from window (loaded via CDN)
const { createElement: e } = window.React;

/**
 * Dice icon component for the Play Random Album button
 * @param {Object} props - SVG props
 * @returns {React.Element} Dice icon SVG
 */
export function DiceIcon(props) {
  return e(
    'svg',
    Object.assign(
      {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
      },
      props
    ),
    e('rect', {
      x: 3,
      y: 3,
      width: 18,
      height: 18,
      rx: 4,
      stroke: 'currentColor',
      'stroke-width': 1.6,
    }),
    e('circle', { cx: 8, cy: 8, r: 1.4, fill: 'currentColor' }),
    e('circle', { cx: 16, cy: 16, r: 1.4, fill: 'currentColor' }),
    e('circle', { cx: 16, cy: 8, r: 1.4, fill: 'currentColor' }),
    e('circle', { cx: 8, cy: 16, r: 1.4, fill: 'currentColor' }),
    e('circle', { cx: 12, cy: 12, r: 1.4, fill: 'currentColor' })
  );
}

/**
 * Triangle icon for expandable genre indicators
 * @param {Object} props - SVG props including expanded state
 * @returns {React.Element} Triangle icon SVG
 */
export function TriangleIcon({ expanded, ...props }) {
  return e(
    'svg',
    Object.assign(
      {
        width: 12,
        height: 12,
        viewBox: '0 0 12 12',
        fill: 'currentColor',
        style: {
          transition: 'transform 0.2s ease',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        },
      },
      props
    ),
    e('path', {
      d: 'M4 2.5L8.5 6L4 9.5V2.5Z',
      fill: 'currentColor',
    })
  );
}
