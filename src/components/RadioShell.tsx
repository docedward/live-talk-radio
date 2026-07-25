"use client";

import type { ReactNode } from "react";

/**
 * Lightweight 1980s AM-radio chassis — pure CSS, no images.
 * Wraps every page: wood frame, dial strip, speaker grille, amber ON AIR.
 */
export function RadioShell({ children }: { children: ReactNode }) {
  return (
    <div className="radio-app min-h-full flex-1">
      <div className="radio-chassis">
        {/* Top handle / brand plate */}
        <header className="radio-brand-bar">
          <div className="radio-brand-mark" aria-hidden>
            <span className="radio-knob radio-knob-sm" />
            <span className="radio-knob radio-knob-sm" />
          </div>
          <div className="radio-brand-center">
            <p className="radio-callsign">W-LTR · LIVE ONLY</p>
            <h1 className="radio-title">Talk Radio Live</h1>
          </div>
          <div className="radio-onair" title="Station live">
            <span className="radio-onair-led" aria-hidden />
            <span className="radio-onair-label">ON AIR</span>
          </div>
        </header>

        {/* Frequency / dial strip */}
        <div className="radio-dial-strip" aria-hidden>
          <div className="radio-dial-window">
            <div className="radio-freq-scale">
              <span>530</span>
              <span>700</span>
              <span>900</span>
              <span className="radio-freq-active">1140</span>
              <span>1300</span>
              <span>1500</span>
              <span>1710</span>
            </div>
            <div className="radio-needle" />
            <p className="radio-band-label">kHz · AM BAND</p>
          </div>
          <div className="radio-tuning-knobs">
            <div className="radio-knob-wrap">
              <span className="radio-knob radio-knob-lg" />
              <span className="radio-knob-cap">TUNE</span>
            </div>
            <div className="radio-knob-wrap">
              <span className="radio-knob radio-knob-lg" />
              <span className="radio-knob-cap">VOL</span>
            </div>
          </div>
        </div>

        {/* Main “glass” screen — app content */}
        <main className="radio-screen">{children}</main>

        {/* Bottom speaker grille */}
        <footer className="radio-grille" aria-hidden>
          <div className="radio-grille-mesh" />
          <p className="radio-grille-tag">LIVE · PANEL · NO RECORDING</p>
        </footer>
      </div>
    </div>
  );
}
