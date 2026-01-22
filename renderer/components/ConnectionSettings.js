/**
 * Connection Settings Modal Component
 *
 * Allows users to configure manual Roon Core connection settings
 * including IP address and port for direct WebSocket connections.
 */

// Get React from window (loaded via CDN)
const { createElement: e, useState, useEffect } = window.React;

/**
 * Connection Settings Modal
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {Object} props.currentSettings - Current connection settings
 * @param {Function} props.onSave - Callback when settings are saved
 * @returns {React.Element|null} Modal element or null if not open
 */
export function ConnectionSettings({
  isOpen,
  onClose,
  currentSettings,
  onSave,
}) {
  // Local state for form inputs
  const [mode, setMode] = useState(currentSettings?.mode || 'auto');
  const [host, setHost] = useState(currentSettings?.host || '');
  const [port, setPort] = useState(currentSettings?.port || 9330);
  const [testStatus, setTestStatus] = useState(null); // null, 'testing', 'success', 'error'
  const [testMessage, setTestMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens with new settings
  useEffect(() => {
    if (isOpen && currentSettings) {
      setMode(currentSettings.mode || 'auto');
      setHost(currentSettings.host || '');
      setPort(currentSettings.port || 9330);
      setTestStatus(null);
      setTestMessage('');
    }
  }, [isOpen, currentSettings]);

  // Don't render if not open
  if (!isOpen) return null;

  /**
   * Tests the connection with the current host/port
   */
  async function handleTestConnection() {
    if (!host.trim()) {
      setTestStatus('error');
      setTestMessage('Please enter a host address');
      return;
    }

    setTestStatus('testing');
    setTestMessage('Testing connection...');

    try {
      const result = await window.roon.testConnection(
        host.trim(),
        parseInt(port, 10)
      );
      setTestStatus('success');
      setTestMessage(`Connected to ${result.coreName}`);
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error.message || 'Connection failed');
    }
  }

  /**
   * Saves the settings and triggers reconnection
   */
  async function handleSave() {
    setIsSaving(true);

    try {
      const settings = {
        mode,
        host: mode === 'manual' ? host.trim() : null,
        port: mode === 'manual' ? parseInt(port, 10) : 9330,
      };

      await onSave(settings);
      onClose();
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Handles clicking outside the modal content to close
   */
  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  // Get status indicator color
  function getStatusColor() {
    switch (testStatus) {
      case 'success':
        return '#22c55e';
      case 'error':
        return '#ef4444';
      case 'testing':
        return '#f59e0b';
      default:
        return 'var(--muted)';
    }
  }

  return e(
    'div',
    {
      className: 'modal-backdrop',
      onClick: handleBackdropClick,
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      },
    },
    e(
      'div',
      {
        className: 'modal-content',
        style: {
          backgroundColor: 'var(--card)',
          borderRadius: '12px',
          padding: '24px',
          width: '400px',
          maxWidth: '90vw',
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--border)',
        },
      },
      // Header
      e(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          },
        },
        e(
          'h2',
          { style: { margin: 0, fontSize: '18px' } },
          'Connection Settings'
        ),
        e(
          'button',
          {
            onClick: onClose,
            style: {
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--muted)',
              padding: '4px',
            },
          },
          '\u00D7'
        )
      ),

      // Connection Mode Toggle
      e(
        'div',
        { style: { marginBottom: '20px' } },
        e(
          'label',
          {
            style: {
              display: 'block',
              marginBottom: '8px',
              color: 'var(--muted)',
              fontSize: '13px',
            },
          },
          'Connection Mode'
        ),
        e(
          'div',
          { style: { display: 'flex', gap: '12px' } },
          e(
            'label',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              },
            },
            e('input', {
              type: 'radio',
              name: 'connectionMode',
              value: 'auto',
              checked: mode === 'auto',
              onChange: () => setMode('auto'),
            }),
            'Auto-discover'
          ),
          e(
            'label',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              },
            },
            e('input', {
              type: 'radio',
              name: 'connectionMode',
              value: 'manual',
              checked: mode === 'manual',
              onChange: () => setMode('manual'),
            }),
            'Manual'
          )
        )
      ),

      // Manual Connection Fields (only shown when manual mode is selected)
      mode === 'manual' &&
        e(
          'div',
          { style: { marginBottom: '20px' } },
          // Host input
          e(
            'div',
            { style: { marginBottom: '12px' } },
            e(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '6px',
                  color: 'var(--muted)',
                  fontSize: '13px',
                },
              },
              'Roon Core IP Address'
            ),
            e('input', {
              type: 'text',
              value: host,
              onChange: event => setHost(event.target.value),
              placeholder: 'e.g., 192.168.1.100',
              style: {
                width: '100%',
                height: '36px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg)',
                color: 'var(--fg)',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
            })
          ),

          // Port input
          e(
            'div',
            { style: { marginBottom: '12px' } },
            e(
              'label',
              {
                style: {
                  display: 'block',
                  marginBottom: '6px',
                  color: 'var(--muted)',
                  fontSize: '13px',
                },
              },
              'Port'
            ),
            e('input', {
              type: 'number',
              value: port,
              onChange: event => setPort(event.target.value),
              placeholder: '9330',
              min: 1,
              max: 65535,
              style: {
                width: '120px',
                height: '36px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg)',
                color: 'var(--fg)',
                fontSize: '14px',
                boxSizing: 'border-box',
              },
            })
          ),

          // Test Connection button
          e(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            e(
              'button',
              {
                onClick: handleTestConnection,
                disabled: testStatus === 'testing' || !host.trim(),
                className: 'btn',
                style: {
                  height: '34px',
                  padding: '0 16px',
                },
              },
              testStatus === 'testing' ? 'Testing...' : 'Test Connection'
            ),
            testStatus &&
              e(
                'span',
                {
                  style: {
                    color: getStatusColor(),
                    fontSize: '13px',
                  },
                },
                testMessage
              )
          ),

          // Help text
          e(
            'p',
            {
              style: {
                marginTop: '12px',
                fontSize: '12px',
                color: 'var(--muted)',
              },
            },
            'Find your Roon Core IP in Roon Settings > About. The default port is 9330.'
          )
        ),

      // Auto mode description
      mode === 'auto' &&
        e(
          'p',
          {
            style: {
              color: 'var(--muted)',
              fontSize: '13px',
              marginBottom: '20px',
            },
          },
          'Auto-discover will automatically find Roon Core on your local network using network discovery.'
        ),

      // Action buttons
      e(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border)',
          },
        },
        e(
          'button',
          {
            onClick: onClose,
            className: 'btn',
            style: {
              height: '36px',
              padding: '0 20px',
            },
          },
          'Cancel'
        ),
        e(
          'button',
          {
            onClick: handleSave,
            disabled: isSaving || (mode === 'manual' && !host.trim()),
            className: 'btn btn-primary',
            style: {
              height: '36px',
              padding: '0 20px',
            },
          },
          isSaving ? 'Saving...' : 'Save & Reconnect'
        )
      )
    )
  );
}
