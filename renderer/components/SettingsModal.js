/**
 * SettingsModal Component
 * Displays application settings including artist exclusions
 */

// Get React from window (loaded via CDN)
const { createElement: e, useState } = window.React;

export function SettingsModal(props) {
  const { isOpen, onClose, excludedArtists, onUpdateExclusions } = props;
  const [newArtist, setNewArtist] = useState('');

  if (!isOpen) return null;

  function handleAddArtist(event) {
    event.preventDefault();
    const artist = newArtist.trim();
    if (artist && !excludedArtists.includes(artist)) {
      onUpdateExclusions([...excludedArtists, artist]);
      setNewArtist('');
    }
  }

  function handleRemoveArtist(artistToRemove) {
    onUpdateExclusions(
      excludedArtists.filter(artist => artist !== artistToRemove)
    );
  }

  return e(
    'div',
    {
      className: 'modal-overlay',
      onClick: onClose,
    },
    e(
      'div',
      {
        className: 'modal-content',
        onClick: evt => evt.stopPropagation(), // Prevent closing when clicking inside
      },
      e('h2', null, 'Settings'),

      // Artist Exclusions Section
      e(
        'div',
        { style: { marginTop: '24px' } },
        e(
          'h3',
          { style: { fontSize: '16px', marginBottom: '12px' } },
          'Excluded Artists'
        ),
        e(
          'p',
          {
            className: 'muted',
            style: { fontSize: '13px', marginBottom: '16px' },
          },
          'Albums from these artists will not be selected during random playback.'
        ),

        // Add artist form
        e(
          'form',
          { onSubmit: handleAddArtist, style: { marginBottom: '16px' } },
          e(
            'div',
            { style: { display: 'flex', gap: '8px' } },
            e('input', {
              type: 'text',
              placeholder: 'Artist name',
              value: newArtist,
              onChange: evt => setNewArtist(evt.target.value),
              style: {
                flex: 1,
                height: '34px',
                borderRadius: '9px',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--fg)',
                padding: '0 10px',
                outline: 'none',
              },
            }),
            e(
              'button',
              {
                type: 'submit',
                className: 'btn',
                disabled: !newArtist.trim(),
              },
              'Add'
            )
          )
        ),

        // Clear All button
        excludedArtists.length > 0
          ? e(
              'div',
              { style: { marginBottom: '16px', textAlign: 'right' } },
              e(
                'button',
                {
                  type: 'button',
                  className: 'btn-link',
                  onClick: () => {
                    if (window.confirm('Remove all excluded artists?')) {
                      onUpdateExclusions([]);
                    }
                  },
                  style: { color: '#ef4444', fontSize: '13px' },
                },
                'Clear All'
              )
            )
          : null,

        // Excluded artists list
        excludedArtists.length > 0
          ? e(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                },
              },
              excludedArtists.map((artist, index) =>
                e(
                  'div',
                  {
                    key: index,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      background: 'var(--card)',
                    },
                  },
                  e('span', null, artist),
                  e(
                    'button',
                    {
                      className: 'btn-link',
                      onClick: () => handleRemoveArtist(artist),
                      style: { color: '#ef4444' },
                    },
                    'Remove'
                  )
                )
              )
            )
          : e(
              'div',
              { className: 'muted', style: { fontSize: '13px' } },
              'No excluded artists. Add artists to prevent their albums from being selected.'
            )
      ),

      // Close button
      e(
        'div',
        { style: { marginTop: '24px', textAlign: 'right' } },
        e(
          'button',
          {
            className: 'btn btn-primary',
            onClick: onClose,
          },
          'Done'
        )
      )
    )
  );
}
