/**
 * ActivityCard Component
 * Displays play history with ability to replay albums and manage activity list
 */

// Get React from window (loaded via CDN)
const { createElement: e } = window.React;

// Import utilities
import { smartQuotes, formatRelativeTime } from '../utils/formatting.js';

/**
 * ActivityCard component for displaying and managing play history
 *
 * @param {Object} props
 * @param {Array} props.activity - Array of activity items with id, title, subtitle, art, and timestamp
 * @param {Function} props.onItemClick - Handler for clicking an activity item to replay
 * @param {Function} props.onRemoveItem - Handler for removing a single activity item
 * @param {Function} props.onClearAll - Handler for clearing all activity
 * @returns {React.Element} Activity card UI
 */
export function ActivityCard(props) {
  const { activity, onItemClick, onRemoveItem, onClearAll } = props;

  return e(
    'div',
    { className: 'card activity-card' },
    // Header with clear button
    e(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        },
      },
      e('h2', { style: { margin: 0, marginBottom: 10 } }, 'Activity'),
      e(
        'button',
        {
          className: 'btn-link',
          onClick: onClearAll,
          disabled: activity.length === 0,
          style: { transform: 'translateY(-4px)' },
        },
        'Clear All'
      )
    ),
    e(
      'div',
      { className: 'activity' },
      activity.length > 0
        ? activity.map((item, index) => {
            return e(
              'button',
              {
                key: index,
                className: 'item',
                onClick: () => onItemClick(item),
                disabled: !item.title || !item.subtitle,
                style: {
                  width: '100%',
                  appearance: 'none',
                  textAlign: 'left',
                  cursor: item.title && item.subtitle ? 'pointer' : 'default',
                  position: 'relative',
                },
              },
              item.art
                ? e('img', {
                    className: 'thumb',
                    src: item.art,
                    alt: item.title,
                  })
                : e('div', { className: 'thumb' }),
              e(
                'div',
                { style: { flex: 1 } },
                e('div', { className: 'title' }, smartQuotes(item.title)),
                e(
                  'div',
                  { className: 'muted' },
                  smartQuotes(item.subtitle) || ''
                ),
                e('div', { className: 'time' }, formatRelativeTime(item.t))
              ),
              // Remove button
              e(
                'button',
                {
                  className: 'activity-remove-btn',
                  onClick: event => onRemoveItem(event, item.id),
                  title: 'Remove from activity',
                  'aria-label': 'Remove from activity',
                },
                '×'
              )
            );
          })
        : e('div', { className: 'muted' }, 'No actions yet.')
    )
  );
}
