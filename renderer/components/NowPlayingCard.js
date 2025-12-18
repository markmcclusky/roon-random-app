/**
 * NowPlayingCard Component
 * Displays currently playing track with album art, metadata, transport controls,
 * progress bar, and volume control
 */

// Get React from window (loaded via CDN)
const { createElement: e } = window.React;

// Import utilities
import { smartQuotes, formatTime } from '../utils/formatting.js';

// Import constants
import {
  SONG_TITLE_FONT_SIZE,
  ARTIST_NAME_FONT_SIZE,
  VOLUME_SLIDER_WIDTH,
} from '../constants/ui.js';

/**
 * NowPlayingCard component for displaying current track and transport controls
 *
 * @param {Object} props
 * @param {Object} props.nowPlaying - Currently playing track info (art, song, artist, album, length, seek_position)
 * @param {string} props.primaryArtist - Primary artist name (extracted from full artist string)
 * @param {boolean} props.isPlaying - Whether track is currently playing
 * @param {boolean} props.hasVolumeControl - Whether current zone supports volume control
 * @param {Object} props.currentZone - Current Roon zone object with volume info
 * @param {number|null} props.localVolume - Local volume state for slider
 * @param {Function} props.setLocalVolume - Function to update local volume state
 * @param {Object} props.roon - Roon hook instance with transport/volume methods
 * @param {Function} props.onMoreFromArtist - Handler for "More from Artist" button
 * @param {Function} props.onProgressBarClick - Handler for progress bar seek
 * @returns {React.Element} Now Playing card UI
 */
export function NowPlayingCard(props) {
  const {
    nowPlaying,
    primaryArtist,
    isPlaying,
    hasVolumeControl,
    currentZone,
    localVolume,
    setLocalVolume,
    roon,
    onMoreFromArtist,
    onProgressBarClick,
  } = props;

  return e(
    'div',
    {
      className: 'card now-playing-card',
      'data-has-art': nowPlaying.art ? 'true' : 'false',
      style: nowPlaying.art ? { '--bg-image': `url(${nowPlaying.art})` } : {},
    },
    e('h2', null, 'Now Playing'),
    e(
      'div',
      { className: 'np' },
      // Album art
      nowPlaying.art
        ? e('img', {
            className: 'cover',
            src: nowPlaying.art,
            alt: 'Album art',
          })
        : e('div', { className: 'cover' }),

      // Track information - DISPLAY full artist but USE primary for functionality
      e(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '8px',
          },
        },
        e(
          'div',
          {
            style: {
              fontSize: SONG_TITLE_FONT_SIZE,
              fontWeight: 700,
              lineHeight: 1.12,
              overflowWrap: 'anywhere',
            },
          },
          nowPlaying.song ? smartQuotes(nowPlaying.song) : '—'
        ),
        e(
          'div',
          {
            style: {
              fontSize: ARTIST_NAME_FONT_SIZE,
              lineHeight: 1.12,
              overflowWrap: 'anywhere',
              textAlign: 'center',
              paddingLeft: '16px',
              paddingRight: '16px',
            },
          },
          e(
            'button',
            {
              className: 'artist-link',
              disabled: roon.operations.fetchingArtist || !primaryArtist,
              onClick: onMoreFromArtist,
              title: primaryArtist
                ? `Play a different album from ${primaryArtist}`
                : 'No artist available',
              style: {
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 'inherit',
                lineHeight: 'inherit',
                overflowWrap: 'anywhere',
                color:
                  primaryArtist && !roon.operations.fetchingArtist
                    ? '#007aff'
                    : 'var(--muted)',
                cursor:
                  primaryArtist && !roon.operations.fetchingArtist
                    ? 'pointer'
                    : 'default',
                textDecoration: 'none',
                transition: 'color 0.15s ease-in-out',
              },
            },
            primaryArtist ? smartQuotes(primaryArtist) : 'Unknown Artist'
          ),
          nowPlaying.album
            ? e(
                'span',
                {
                  style: {
                    color: 'var(--muted)',
                  },
                },
                ' • ',
                smartQuotes(nowPlaying.album)
              )
            : null
        )
      ),

      // Progress bar - only show if we have length data
      nowPlaying.length
        ? e(
            'div',
            { className: 'progress-container' },
            e(
              'div',
              { className: 'progress-time' },
              formatTime(nowPlaying.seek_position)
            ),
            e(
              'div',
              {
                className: 'progress-bar',
                onClick: onProgressBarClick,
                style: { cursor: 'pointer' },
              },
              e('div', {
                className: 'progress-fill',
                style: {
                  width:
                    nowPlaying.seek_position && nowPlaying.length
                      ? `${(nowPlaying.seek_position / nowPlaying.length) * 100}%`
                      : '0%',
                },
              })
            ),
            e(
              'div',
              { className: 'progress-time' },
              formatTime(nowPlaying.length)
            )
          )
        : null,

      // Transport controls
      e(
        'div',
        { className: 'transport-controls' },
        e(
          'button',
          {
            className: 'btn-icon',
            onClick: () => roon.transportControl('previous'),
          },
          e('img', { src: './images/previous-100.png', alt: 'Previous' })
        ),
        e(
          'button',
          {
            className: 'btn-icon btn-playpause',
            onClick: () => roon.transportControl('playpause'),
          },
          e('img', {
            src: isPlaying ? './images/pause-100.png' : './images/play-100.png',
            alt: 'Play/Pause',
          })
        ),
        e(
          'button',
          {
            className: 'btn-icon',
            onClick: () => roon.transportControl('next'),
          },
          e('img', { src: './images/next-100.png', alt: 'Next' })
        )
      ),

      // Volume area - centered under transport controls
      hasVolumeControl
        ? e(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0px',
                width: '100%',
              },
            },
            // Volume/mute icon
            e(
              'button',
              {
                className: 'btn-icon',
                onClick: () => roon.muteToggle(),
                style: {
                  padding: 0,
                  background: 'none',
                  border: 'none',
                },
              },
              e('img', {
                src: currentZone.volume.is_muted
                  ? './images/mute-100.png'
                  : './images/volume-100.png',
                alt: currentZone.volume.is_muted ? 'Unmute' : 'Mute',
                style: {
                  width: '20px',
                  height: '20px',
                  transition: 'opacity 0.15s ease-in-out',
                },
              })
            ),
            // Volume slider
            e('input', {
              type: 'range',
              min: currentZone.volume.min,
              max: currentZone.volume.max,
              step: currentZone.volume.step,
              value:
                localVolume !== null ? localVolume : currentZone.volume.value,
              onInput: event => setLocalVolume(event.target.value),
              onChange: event => roon.changeVolume(event.target.value),
              style: {
                width: `${VOLUME_SLIDER_WIDTH}px`,
                transform: 'translateY(2px)', // Visual alignment with transport buttons
                background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${(((localVolume !== null ? localVolume : currentZone.volume.value) - currentZone.volume.min) / (currentZone.volume.max - currentZone.volume.min)) * 100}%, var(--border) ${(((localVolume !== null ? localVolume : currentZone.volume.value) - currentZone.volume.min) / (currentZone.volume.max - currentZone.volume.min)) * 100}%, var(--border) 100%)`,
              },
            })
          )
        : null
    )
  );
}
