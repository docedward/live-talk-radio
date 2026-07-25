/**
 * Global SFX event dedupe — shared by HostSoundboard, RoomSfxPlayer, LiveKit.
 * Prevents double play (REST + data packet) and tab-back spam races.
 */

const played = new Set<string>();
const MAX = 80;

/** Host just pressed a pad — ignore LiveKit/REST echoes briefly. */
let hostLocalQuietUntil = 0;

export function noteHostLocalSfxPlay(): void {
  hostLocalQuietUntil = Date.now() + 4000;
}

export function isHostLocalSfxQuietPeriod(): boolean {
  return Date.now() < hostLocalQuietUntil;
}

/** Returns true if this id is new and claimed (caller should play). */
export function claimSfxEventId(id: string | null | undefined): boolean {
  if (!id) return false;
  if (played.has(id)) return false;
  played.add(id);
  if (played.size > MAX) {
    const drop = [...played].slice(0, played.size - 40);
    drop.forEach((k) => played.delete(k));
  }
  return true;
}

export function markSfxEventPlayed(id: string | null | undefined): void {
  if (!id) return;
  played.add(id);
  if (played.size > MAX) {
    const drop = [...played].slice(0, played.size - 40);
    drop.forEach((k) => played.delete(k));
  }
}

export function hasPlayedSfxEvent(id: string | null | undefined): boolean {
  if (!id) return true;
  return played.has(id);
}
