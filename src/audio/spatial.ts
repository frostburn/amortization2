import { clamp, type Vec3 } from "../game/config";

export function rifleMix(position: Vec3, listener: Vec3) {
  const distance = Math.hypot(
    position.x - listener.x,
    position.y - listener.y,
    position.z - listener.z,
  );
  const blend = clamp((distance - 24) / 40, 0, 1);
  return {
    distance,
    near: Math.cos((blend * Math.PI) / 2),
    far: Math.sin((blend * Math.PI) / 2),
    gain: 0.95 / (1 + distance / 100),
    pan: clamp((position.x - listener.x) / 32, -0.8, 0.8),
  };
}
