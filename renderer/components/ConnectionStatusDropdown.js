/**
 * Connection Status Dropdown Component
 *
 * Gmail-style dropdown for connection status and settings.
 * Shows current connection mode and allows quick switching.
 */

const { createElement: e, useState, useEffect, useRef } = window.React;

/**
 * Chevron down icon for dropdown indicator
 */
function ChevronDownIcon() {
  return e(
    'svg',
    {
      width: 12,
      height: 12,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    e('polyline', { points: '6 9 12 15 18 9' })
  );
}

/**
 * Checkmark icon for selected option
 */
function CheckIcon() {
  return e(
    'svg',
    {
      width: 16,
      height: 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    e('polyline', { points: '20 6 9 17 4 12' })
  );
}

/**
 * Connection Status Dropdown
 * @param {Object} props - Component props
 * @param {boolean} props.paired - Whether connected to Roon Core
 * @param {string} props.coreName - Name of the connected core
 * @param {Object} props.connectionSettings - Current connection settings { mode, host, port }
 * @param {Function} props.onModeChange - Callback when mode is changed (mode) => void
 * @param {Function} props.onOpenSettings - Callback to open full settings modal
 * @returns {React.Element} Dropdown element
 */
export function ConnectionStatusDropdown({
  paired,
  coreName,
  connectionSettings,
  onModeChange,
  onOpenSettings,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const isManualMode = connectionSettings?.mode === 'manual';
  const hasManualConfig = connectionSettings?.host;

  // Determine status text and color
  let statusText = 'Disconnected';
  let statusColor = '#ef4444'; // red

  if (paired) {
    statusText = coreName || 'Connected';
    statusColor = '#22c55e'; // green
  }

  function handleModeSelect(mode) {
    if (mode === 'manual' && !hasManualConfig) {
      // If selecting manual but no config exists, open settings
      onOpenSettings();
    } else {
      onModeChange(mode);
    }
    setIsOpen(false);
  }

  return e(
    'div',
    {
      ref: dropdownRef,
      style: { position: 'relative' },
    },
    // Trigger button - styled to match native select elements
    e(
      'button',
      {
        onClick: () => setIsOpen(!isOpen),
        className: 'connection-status-trigger',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          height: '34px',
          padding: '0 10px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '9px',
          cursor: 'pointer',
          color: 'var(--fg)',
          fontSize: '15px',
          fontFamily: 'inherit',
          fontWeight: 'normal',
          outline: 'none',
        },
      },
      // Status dot
      e('span', {
        style: {
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: statusColor,
          flexShrink: 0,
        },
      }),
      // Status text
      e(
        'span',
        {
          style: {
            maxWidth: '150px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        },
        statusText
      ),
      // Dropdown arrow
      e(ChevronDownIcon)
    ),

    // Dropdown menu
    isOpen &&
      e(
        'div',
        {
          className: 'connection-dropdown-menu',
          style: {
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: '240px',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            overflow: 'hidden',
          },
        },
        // Auto-discover option
        e(
          'div',
          {
            onClick: () => handleModeSelect('auto'),
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px 16px',
              cursor: 'pointer',
              backgroundColor: !isManualMode
                ? 'rgba(34, 197, 94, 0.1)'
                : 'transparent',
              transition: 'background-color 0.15s',
            },
            onMouseEnter: e => {
              if (isManualMode)
                e.currentTarget.style.backgroundColor = 'var(--bg)';
            },
            onMouseLeave: e => {
              e.currentTarget.style.backgroundColor = !isManualMode
                ? 'rgba(34, 197, 94, 0.1)'
                : 'transparent';
            },
          },
          // Status dot
          e('span', {
            style: {
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#22c55e',
              marginTop: '4px',
              flexShrink: 0,
            },
          }),
          // Text content
          e(
            'div',
            { style: { flex: 1 } },
            e(
              'div',
              { style: { fontWeight: 500, marginBottom: '2px' } },
              'Auto-discover'
            ),
            e(
              'div',
              { style: { fontSize: '12px', color: 'var(--muted)' } },
              'Find Roon Core on network'
            )
          ),
          // Checkmark
          !isManualMode &&
            e(
              'span',
              { style: { color: '#22c55e', marginTop: '2px' } },
              e(CheckIcon)
            )
        ),

        // Manual connection option
        e(
          'div',
          {
            onClick: () => handleModeSelect('manual'),
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '12px 16px',
              cursor: 'pointer',
              backgroundColor: isManualMode
                ? 'rgba(34, 197, 94, 0.1)'
                : 'transparent',
              transition: 'background-color 0.15s',
            },
            onMouseEnter: e => {
              if (!isManualMode)
                e.currentTarget.style.backgroundColor = 'var(--bg)';
            },
            onMouseLeave: e => {
              e.currentTarget.style.backgroundColor = isManualMode
                ? 'rgba(34, 197, 94, 0.1)'
                : 'transparent';
            },
          },
          // Status dot (hollow if not configured)
          e('span', {
            style: {
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: hasManualConfig ? '#3b82f6' : 'transparent',
              border: hasManualConfig ? 'none' : '2px solid var(--muted)',
              marginTop: '4px',
              flexShrink: 0,
            },
          }),
          // Text content
          e(
            'div',
            { style: { flex: 1 } },
            e(
              'div',
              { style: { fontWeight: 500, marginBottom: '2px' } },
              'Manual connection'
            ),
            e(
              'div',
              { style: { fontSize: '12px', color: 'var(--muted)' } },
              hasManualConfig
                ? `${connectionSettings.host}:${connectionSettings.port || 9330}`
                : 'Connect to specific IP address'
            )
          ),
          // Checkmark
          isManualMode &&
            e(
              'span',
              { style: { color: '#22c55e', marginTop: '2px' } },
              e(CheckIcon)
            )
        ),

        // Divider
        e('div', {
          style: {
            height: '1px',
            backgroundColor: 'var(--border)',
            margin: '4px 0',
          },
        }),

        // Connection settings link
        e(
          'div',
          {
            onClick: () => {
              setIsOpen(false);
              onOpenSettings();
            },
            style: {
              padding: '12px 16px',
              cursor: 'pointer',
              color: 'var(--muted)',
              fontSize: '13px',
              transition: 'background-color 0.15s',
            },
            onMouseEnter: e => {
              e.currentTarget.style.backgroundColor = 'var(--bg)';
            },
            onMouseLeave: e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            },
          },
          'Connection settings...'
        )
      )
  );
}
